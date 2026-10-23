import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {importCreationPlan,creationAvailable,approveImportPlan} from '../frontend/lokaler/import-plan.js';
import {propertyAliases} from '../frontend/lokaler/property-identity.js';

const headers=['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Avtalsnummer','Area','Grundhyra','Hyra uppräkningsmetod','Ort'];
const rows=[['P1','TESTET 1','Testgatan 1','O1','A1',100,10000,'Oförändrad','Teststad'],['P2','TESTET 2','Exempelgatan 2','O2','A2',200,20000,'Oförändrad','Teststad']];
function prepare(base=emptyData(),input=rows,columns=headers){
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([columns,...input]),'Testunderlag');
 const profiles=profileWorkbook(book,importSchemas,XLSX,[],{reviewed:true});
 return prepareCleanImport(book,profiles,base,{fileName:'syntetiskt.xlsx'},XLSX);
}
const decisions=(result,base,accept=()=>true)=>Object.fromEntries(importCreationPlan(result,base).filter(accept).map(entry=>[entry.key,{signature:entry.signature,action:'create'}]));

test('new properties, objects, agreements and their prices require explicit approval',()=>{
 const base=emptyData(),result=prepare(base),saved=JSON.stringify(result),approved=approveImportPlan(result,base);
 assert.equal(result.clean.properties.length,2);assert.equal(result.clean.agreements.length,2);assert.equal(result.clean.agreement_items.length,2);
 for(const table of ['properties','objects','agreements','agreement_items'])assert.equal(approved.clean[table].length,0,table);
 assert.equal(approved.report.tables.reduce((n,row)=>n+row.created,0),0);
 assert.equal(approved.report.creationReview.deferred.length,8);
 assert.equal(approved.clean.workspace.sourceRegistry[0].receipt.deferredRecords,8);
 assert.equal(JSON.stringify(result),saved);assert.deepEqual(base,emptyData());validateData(approved.clean);
});
test('selecting all creates exactly the full candidate and preserves field-level audit origins',()=>{
 const base=emptyData(),result=prepare(base),approved=approveImportPlan(result,base,decisions(result,base));
 for(const table of ['properties','objects','agreements','agreement_items'])assert.deepEqual(approved.clean[table],result.clean[table]);
 assert.equal(approved.report.creationReview.deferred.length,0);
 assert.equal(approved.clean.workspace.auditLog.find(row=>row.collection==='contracts').fields[0].provenance.row,2);
 assert.equal(approved.clean.workspace.sourceRegistry[0].created,8);
});
test('selected properties admit only their selected objects, agreements and prices',()=>{
 const base=emptyData(),result=prepare(base),choices=decisions(result,base,entry=>entry.record.id!=='P2');
 const blocked=importCreationPlan(result,base).find(entry=>entry.record.id==='O2');
 assert.equal(creationAvailable(blocked,importCreationPlan(result,base),choices,base),false);
 const approved=approveImportPlan(result,base,choices);
 assert.deepEqual(approved.clean.properties.map(row=>row.id),['P1']);assert.deepEqual(approved.clean.objects.map(row=>row.id),['O1']);assert.deepEqual(approved.clean.agreements.map(row=>row.id),['A1']);
 assert.equal(approved.clean.agreement_items.length,1);assert.equal(approved.clean.agreement_items[0].agreement_id,'A1');
 assert(!approved.report.changes.some(row=>['P2','O2','A2'].includes(row.recordId)));
 assert(!approved.clean.workspace.auditLog.some(row=>['P2','O2','A2'].includes(row.recordId)));validateData(approved.clean);
});
test('deferring an object or agreement leaves its approved parent intact',()=>{
 for(const denied of ['O1','A1']){
  const base=emptyData(),result=prepare(base,[rows[0]]),approved=approveImportPlan(result,base,decisions(result,base,entry=>entry.record.id!==denied));
  assert.equal(approved.clean.properties.length,1);assert.equal(approved.clean.agreements.length,0);assert.equal(approved.clean.agreement_items.length,0);assert.equal(approved.clean.objects.length,denied==='A1'?1:0);validateData(approved.clean);
 }
});
test('reimport needs no new creation approval and applies the chosen price update',()=>{
 const first=prepare(),base=first.clean;
 base.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:4321,propertyId:'P1'}}];
 const result=resolveImportChoices(prepare(base,rows.map(row=>row.map((value,index)=>index===6?value+1000:value))),{mode:'replace'});
 assert.equal(importCreationPlan(result,base).length,0);
 const approved=approveImportPlan(result,base);
 assert.equal(approved.clean.agreement_items[0].base_amount,11000);assert.equal(approved.clean.properties.length,2);assert.deepEqual(approved.clean.workspace.budgetPlans,base.workspace.budgetPlans);validateData(approved.clean);
});
test('stale approvals cannot approve changed parent facts or admit their dependencies',()=>{
 const base=emptyData(),result=prepare(base),choices=decisions(result,base);
 const changed=prepare(base,rows.map(row=>row.map((value,index)=>index===1?value+' ÄNDRAD':value)));
 const approved=approveImportPlan(changed,base,choices);
 assert.equal(approved.clean.properties.length,0);assert.equal(approved.clean.agreement_items.length,0);
});
test('explicit mapping reuses an existing property, fills empty facts and reviews differences',()=>{
 const base=emptyData();base.properties.push(normalize('properties',{id:'EXISTING',name:'SPARAD 1',address:'Annan provgata 3'}));
 base.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{propertyId:'EXISTING',amount:999}}];
 const result=prepare(base,[rows[0]]),plan=importCreationPlan(result,base),choices=decisions(result,base),property=plan.find(entry=>entry.table==='properties');
 choices[property.key]={signature:property.signature,action:'map',targetId:'EXISTING'};
 const approved=approveImportPlan(result,base,choices);
 assert.equal(approved.clean.properties.length,1);assert.equal(approved.clean.properties[0].name,'SPARAD 1');assert.equal(approved.clean.properties[0].city,'Teststad');assert.equal(approved.clean.objects[0].property_id,'EXISTING');assert.equal(approved.clean.agreements[0].object_id,'O1');
 assert.deepEqual(approved.report.creationReview.mapped,[{from:'P1',to:'EXISTING'}]);assert.equal(approved.report.creationReview.deferred.length,0);
 assert(approved.clean.workspace.importReview.some(row=>row.recordId==='EXISTING'&&row.field==='designation'&&row.current==='SPARAD 1'&&row.proposed==='TESTET 1'));
 assert(approved.report.changes.some(row=>row.recordId==='O1'&&row.field==='propertyId'&&row.to==='EXISTING'));
 assert.deepEqual(approved.clean.workspace.budgetPlans,base.workspace.budgetPlans);validateData(approved.clean);
});
test('an absent mapping target is rejected and existing relations cannot be moved',()=>{
 const base=emptyData(),result=prepare(base),plan=importCreationPlan(result,base),choices=decisions(result,base);
 choices[plan[0].key]={signature:plan[0].signature,action:'map',targetId:'missing'};
 assert.throws(()=>approveImportPlan(result,base,choices),/befintlig fastighet/);
});
test('withheld property sources do not create inferred parties or people',()=>{
 const base=emptyData(),result=prepare(base,[['P1','TESTET 1','Testgatan 1','O1','A1',100,10000,'Oförändrad','Teststad','Testbolaget','TEST01 Test Person']], [...headers,'Fastighetsägare','Fastighetsförvaltare']);
 assert.equal(result.clean.parties.length,1);assert.equal(result.clean.people.length,1);
 const approved=approveImportPlan(result,base);
 assert.equal(approved.clean.parties.length,0);assert.equal(approved.clean.people.length,0);assert.equal(approved.clean.contacts.length,0);validateData(approved.clean);
});
test('column mappings retain only field rules, never record creation decisions',()=>{
 const base=emptyData(),result=prepare(base),approved=approveImportPlan(result,base,decisions(result,base));
 assert.deepEqual(approved.clean.workspace.importMappings,result.clean.workspace.importMappings);
 assert(!JSON.stringify(approved.clean.workspace.importMappings).includes('creationReview'));
 const extra=[...rows,['P3','TESTET 3','Provvägen 3','O3','A3',50,5000,'Oförändrad','Teststad']];
 const next=prepare(approved.clean,extra),review=approveImportPlan(next,approved.clean);
 assert.equal(review.clean.properties.length,2);assert.equal(review.clean.agreements.length,2);assert.equal(review.clean.agreement_items.length,2);assert(review.report.creationReview.deferred.some(row=>row.id==='P3'));
});

test('approved identity corrections preserve alias history for later imports',()=>{
 const base=emptyData(),result=prepare(base,[rows[0]]);
 result.report.changes.push({collection:'properties',recordId:'P1',field:'id',from:'GENERATED-ID',to:'P1',provenance:{source:'syntetiskt.xlsx',sheet:'Testunderlag',row:2}});
 const approved=approveImportPlan(result,base,decisions(result,base));
 assert.equal(propertyAliases(approved.clean.workspace.auditLog).get('GENERATED-ID'),'P1');
});
test('mapping a property never hides deferred objects or agreements with the same identifier',()=>{
 const base=emptyData();base.properties.push(normalize('properties',{id:'E',name:'SPARAD 1'}));
 const input=[...rows[0]];input[3]='P1';input[4]='P1';
 const result=prepare(base,[input]),plan=importCreationPlan(result,base),property=plan.find(entry=>entry.table==='properties');
 const approved=approveImportPlan(result,base,{[property.key]:{signature:property.signature,action:'map',targetId:'E'}});
 assert(approved.report.creationReview.deferred.some(row=>row.collection==='objects'&&row.id==='P1'));
 assert(approved.report.creationReview.deferred.some(row=>row.collection==='contracts'&&row.id==='P1'));
 assert.equal(approved.clean.objects.length,0);assert.equal(approved.clean.agreement_items.length,0);validateData(approved.clean);
});
test('mapping a new property never moves an existing object to a different property',()=>{
 const base=prepare().clean,result=prepare(base,[['P3','TESTET 3','Provvägen 3','O3','A3',50,30000,'none','Teststad']]);
 result.clean.objects.find(row=>row.id==='O1').property_id='P3';
 const plan=importCreationPlan(result,base),property=plan.find(entry=>entry.table==='properties'),choices=decisions(result,base);
 choices[property.key]={signature:property.signature,action:'map',targetId:'P2'};
 assert.throws(()=>approveImportPlan(result,base,choices),/befintlig koppling får inte flyttas/);
 assert.equal(base.objects.find(row=>row.id==='O1').property_id,'P1');
});
test('approval retains pending reviews from unrelated source files',()=>{
 const base=emptyData();const previous={id:'unrelated',kind:'canonical-conflict',status:'pending',source:'annat-underlag.xlsx',collection:'properties',recordId:'NOT-YET-CREATED',field:'id',reason:'Kontrollera källan'};base.workspace.importReview=[previous];
 const result=prepare(base),approved=approveImportPlan(result,base);
 assert.deepEqual(approved.clean.workspace.importReview.find(row=>row.id==='unrelated'),previous);
});
test('previously deferred records are resolved after a later explicit approval',()=>{
 const base=emptyData(),first=approveImportPlan(prepare(base),base),candidate=prepare(first.clean);
 const previous=first.clean.workspace.importReview.find(row=>row.creationDeferred&&row.recordId==='P1');
 // A different source preserves the earlier review in the candidate.
 candidate.clean.workspace.importReview.push({...previous,id:'earlier-file',source:'tidigare-fil.xlsx'});
 const approved=approveImportPlan(candidate,first.clean,decisions(candidate,first.clean));
 assert.equal(approved.clean.workspace.importReview.find(row=>row.id==='earlier-file').status,'resolved');
});
