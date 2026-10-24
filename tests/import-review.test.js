import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importCreationPlan,approveImportPlan} from '../frontend/lokaler/import-plan.js';
import {editImportDraft,retainCreationChoices} from '../frontend/lokaler/import-review.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {importTableHtml,columnRegister,importRowHtml} from '../frontend/v2/import-table.js';
import {renderPropertyEditor} from '../frontend/v2/property-editor.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';

function prepare(base=emptyData(),context={}){
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
  ['FastighetsID','Gatuadress','ObjektID','Avtalsnummer','Fastighetsförvaltare'],
  ['P1','Testvägen 1','O1','A1','GUSLIN4 Gustav Lindblad']
 ]),'Underlag');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true});
 return {workbook,profiles,result:prepareCleanImport(workbook,profiles,base,{fileName:'syntetiskt.xlsx',...context},XLSX)};
}
const all=(result,base)=>Object.fromEntries(importCreationPlan(result,base).map(entry=>[entry.key,{signature:entry.signature,action:'create'}]));
const editContact=(result,patch)=>{
 const record={...result.clean.contacts[0],...patch};
 return {contacts:{[record.id]:{record,imported:true,originalPersonId:result.clean.contacts[0].person_id,rowKey:JSON.stringify(['syntetiskt.xlsx','Underlag',2])}}};
};

test('designation completion retains identity approvals, and parent changes invalidate only affected choices',()=>{
 const base=emptyData(),{result}=prepare(base),plan=importCreationPlan(result,base),choices=all(result,base);
 const edited=editImportDraft(result,base,{properties:{P1:'EKEN 1'}}),next=importCreationPlan(edited,base),retained=retainCreationChoices(plan,next,choices);
 assert.equal(Object.keys(retained).length,3);
 assert.equal(approveImportPlan(edited,base,retained).clean.properties[0].name,'EKEN 1');
 next.find(entry=>entry.table==='objects').record.property_id='OTHER';
 assert.equal(Object.keys(retainCreationChoices(plan,next,choices)).length,2);
 assert.deepEqual(retainCreationChoices(plan,[],choices),{});
});

test('manual designation edits are isolated, deferred with their property and retain a manual audit after Excel roundtrip',async()=>{
 const base=emptyData(),{result}=prepare(base),before=JSON.stringify(result);base.workspace.budgetPlans=[{id:'locked',status:'Låst',amount:123}];
 const edited=editImportDraft(result,base,{properties:{P1:'EKEN 1'}},'Testare');
 assert.equal(JSON.stringify(result),before);assert.equal(approveImportPlan(edited,base).clean.properties.length,0);
 const approved=approveImportPlan(edited,base,all(edited,base),'Testare');
 assert.equal(approved.clean.properties[0].name,'EKEN 1');
 const change=approved.report.changes.find(change=>change.collection==='properties'&&change.field==='designation');
 assert.equal(change.provenance.source,'manual');assert.equal(change.provenance.confirmedBy,'Testare');
 const roundtrip=await readWorkbook(await writeWorkbook(approved.clean));assert.equal(roundtrip.properties[0].name,'EKEN 1');
 assert(approved.clean.workspace.auditLog.some(entry=>entry.recordId==='P1'&&entry.fields.some(field=>field.provenance?.source==='manual')));
});

test('blank designation remains available for later completion and does not erase a name',()=>{
 const base=emptyData(),{result}=prepare(base),edited=editImportDraft(result,base,{properties:{P1:''}});
 assert.equal(edited.clean.properties[0].name,'Testvägen 1');assert.equal(approveImportPlan(edited,base,all(edited,base)).clean.properties.length,1);
});

test('person and contact identities remain stable across evaluations without persisting the session cache',()=>{
 const identityCache={},first=prepare(emptyData(),{identityCache}).result,second=prepare(emptyData(),{identityCache}).result;
 assert.equal(first.clean.people[0].id,second.clean.people[0].id);assert.equal(first.clean.contacts[0].id,second.clean.contacts[0].id);
 assert(!Object.hasOwn(first.clean.workspace,'identityCache'));assert(Object.keys(identityCache).length>=2);
});

test('one person can have distinct property roles and an explicit case responsibility without duplicated people',()=>{
 const base=emptyData();base.issues.push(normalize('issues',{id:'ISSUE',title:'Ventilation'}));
 const {result}=prepare(base),personId=result.clean.people[0].id,old=result.clean.contacts[0],extra=normalize('contacts',{id:'EXTRA',person_id:personId,role:'coordinator',issue_id:'ISSUE'});
 const edits=editContact(result,{role:'coordinator'});edits.contacts.EXTRA={record:extra,rowKey:JSON.stringify(['syntetiskt.xlsx','Underlag',2])};
 const edited=editImportDraft(result,base,edits),approved=approveImportPlan(edited,base,all(edited,base));
 assert.equal(approved.clean.people.length,1);assert.equal(approved.clean.contacts.length,2);assert.equal(approved.clean.contacts.find(row=>row.id===old.id).role,'coordinator');
 assert(approved.clean.contacts.some(row=>row.person_id===personId&&row.issue_id==='ISSUE'));
 assert.equal(approved.report.tables.find(row=>row.collection==='contacts').created,2);validateData(approved.clean);
 const again=prepare(approved.clean).result;
 assert.equal(again.clean.people.length,1);assert.equal(again.clean.contacts.length,2,'Reimport honours the edited role instead of recreating the old suggestion');
});

test('replacing an inferred person with an existing person removes the unused inference and keeps the relation',()=>{
 const base=emptyData();base.people.push(normalize('people',{id:'KNOWN',name:'Gustav Testsson'}));
 const {result}=prepare(base),edits=editContact(result,{person_id:'KNOWN'}),edited=editImportDraft(result,base,edits),approved=approveImportPlan(edited,base,all(edited,base));
 assert.equal(approved.clean.people.length,1);assert.equal(approved.clean.contacts[0].person_id,'KNOWN');
 assert.deepEqual(edited.report.sourceRows[0].records.people,['KNOWN']);
});

test('invalid role/target combinations and changes to saved contact history are rejected before saving',()=>{
 const base=emptyData();base.issues.push(normalize('issues',{id:'ISSUE',title:'Ventilation'}));
 const {result}=prepare(base);
 assert.throws(()=>editImportDraft(result,base,editContact(result,{property_id:null,issue_id:'ISSUE'})),/Fastighetsägarens kontakt kopplas till fastigheten/);
 const saved=approveImportPlan(result,base,all(result,base)).clean,{result:again}=prepare(saved);
 assert.throws(()=>editImportDraft(again,saved,editContact(again,{role:'coordinator'})),/sparad personkoppling/);
});

test('choosing an already saved relation reuses it without creating another contact or an unused person',()=>{
 const base=emptyData();base.properties.push(normalize('properties',{id:'KNOWN_PROPERTY',name:'KÄND 1'}));base.people.push(normalize('people',{id:'KNOWN_PERSON',name:'Känd person'}));
 base.contacts.push(normalize('contacts',{id:'KNOWN_CONTACT',person_id:'KNOWN_PERSON',role:'coordinator',property_id:'KNOWN_PROPERTY'}));
 const {result}=prepare(base),old=result.clean.contacts.find(row=>row.id!=='KNOWN_CONTACT'),edits={contacts:{[old.id]:{record:base.contacts[0],replacementId:'KNOWN_CONTACT',imported:true,originalPersonId:old.person_id,rowKey:JSON.stringify(['syntetiskt.xlsx','Underlag',2])}}};
 const edited=editImportDraft(result,base,edits),approved=approveImportPlan(edited,base,all(edited,base));
 assert.equal(approved.clean.people.length,1);assert.equal(approved.clean.contacts.length,1);assert.equal(approved.clean.contacts[0].id,'KNOWN_CONTACT');
 const again=prepare(approved.clean).result;assert.equal(again.clean.contacts.length,1);assert.equal(again.clean.people.length,1);
});

test('a stale edit never recreates a contact removed by a changed column mapping',()=>{
 const base=emptyData(),{result}=prepare(base),edits=editContact(result,{role:'coordinator'}),changed=structuredClone(result);changed.clean.contacts=[];
 const edited=editImportDraft(changed,base,edits);assert.equal(edited.clean.contacts.length,0);
});

test('withholding a property also withholds edited contacts with an honest explanation',()=>{
 const base=emptyData(),{result,profiles}=prepare(base),edited=editImportDraft(result,base,editContact(result,{role:'coordinator'})),plan=importCreationPlan(edited,base),choices=all(edited,base),property=plan.find(row=>row.table==='properties');
 choices[property.key]={signature:property.signature,action:'defer'};
 const approved=approveImportPlan(edited,base,choices),story=explainImport(edited,base,{approved,choices,profiles});
 assert.equal(approved.clean.contacts.length,0);assert.equal(approved.clean.people.length,0);assert.equal(story.rows[0].nodes.find(node=>node.table==='contacts').status,'skipped');
});

test('source table preserves original values safely and labels person fields separately from their relationship target',()=>{
 const base=emptyData(),{result,profiles,workbook}=prepare(base),story=explainImport(result,base,{profiles});
 const html=importTableHtml({fileName:'<img>.xlsx',workbook},profiles,result,base,{openRows:new Set(story.rows.map(row=>row.key)),columnHtml:(_p,_pi,column)=>column.header});
 assert.doesNotMatch(html,/<img>/);assert.match(html,/&lt;img&gt;/);assert.match(html,/data-register="people"/);assert.match(html,/Fastighetsbeteckning saknas/);assert.match(html,/Roll här/);assert.match(html,/Kopplas till/);
 assert.equal(columnRegister({target:'properties.responsiblePersonId'}),'people');assert.equal(columnRegister({target:'properties.ownerPartyId'}),'properties');
});

test('canonical property editor offers missing designation after import and shows address separately',()=>{
 const data={cleanModel:true,isDemo:false,properties:[],people:[],organizations:[],contracts:[]},property={id:'P',designation:'Testvägen 1',address:'Testvägen 1'};
 const html=renderPropertyEditor(data,property,'P',true);
 assert.match(html,/<h2 id="editor-title">Fastighetsbeteckning saknas<\/h2>/);assert.match(html,/name="designation" value=""/);assert.doesNotMatch(html,/name="designation"[^>]*disabled/);assert.match(html,/property-heading-address">Testvägen 1/);
});

test('inherited coordination is explained without creating a separate agreement assignment',()=>{
 const base=emptyData();base.properties.push(normalize('properties',{id:'P1',name:'EKEN 1',address:'Testvägen 1'}));base.people.push(normalize('people',{id:'COORD',name:'Anna Test'}));base.contacts.push(normalize('contacts',{id:'INHERITED',person_id:'COORD',role:'coordinator',property_id:'P1'}));
 const {result,profiles}=prepare(base),choices=all(result,base),approved=approveImportPlan(result,base,choices),row=explainImport(result,base,{approved,choices,profiles}).rows[0],html=importRowHtml(row,result,base);
 assert.match(html,/Anna Test ärvs till avtal A1 från fastighet P1/);assert.match(html,/Ingen separat personkoppling skapas/);assert.equal(approved.clean.contacts.length,2);assert(!approved.clean.contacts.some(row=>row.agreement_id==='A1'));
});
