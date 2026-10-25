import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {approveImportPlan,importCreationPlan} from '../frontend/lokaler/import-plan.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {importRowAttention,matchingImportRows} from '../frontend/v2/import-row-review.js';
import {importProblemsHtml} from '../frontend/v2/import-problems.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {importApprovalHtml} from '../frontend/v2/import-approval.js';

function base(){
 const d=emptyData();d.parties.push(normalize('parties',{id:'B1',name:'Sparat bolag AB'}));
 d.properties.push(normalize('properties',{id:'SF1001',name:'TESTET 1',management_object_number:'1001',address:'Provgatan 1',city:'Provstad',owner_party_id:'B1'}));
 d.objects.push(normalize('objects',{id:'SF1001-001',property_id:'SF1001',area:50}));d.agreements.push(normalize('agreements',{id:'A1',object_id:'SF1001-001',valid_from:'2026-01-01',valid_to:'2027-12-31'}));
 d.workspace.budgetPlans=[{id:'locked',locked:true,amount:123}];return d;
}
function input(headers,rows,d=base(),context={}){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Berikning');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true}),prepared={workbook,profiles,fileName:'syntetisk.xlsx',XLSX};
 return {prepared,profiles,result:prepareCleanImport(workbook,profiles,d,{fileName:prepared.fileName,enrichment:true,...context},XLSX)};
}
const choices=(r,d,predicate=()=>true)=>Object.fromEntries(importCreationPlan(r,d).filter(predicate).map(e=>[e.key,{signature:e.signature,action:'create'}]));

test('enrichment retains saved owner, facts and links while filling blanks without value questions',()=>{
 const d=base(),before=structuredClone(d),{result:r}=input(['Förvaltningsobjekt','Fastighetsbeteckning','Adress','Fastighetsägare','Populärnamn'],[['1001','ANNAT 2','Annan gata 9','Nytt bolag AB','Nytt namn']],d);
 assert.equal(r.report.blocking,0);assert.equal(r.report.review,0);assert.equal(r.clean.properties[0].name,'TESTET 1');assert.equal(r.clean.properties[0].address,'Provgatan 1');assert.equal(r.clean.properties[0].popular_name,'Nytt namn');assert.equal(r.clean.properties[0].owner_party_id,'B1');assert.deepEqual(r.clean.parties,d.parties);
 const saved=approveImportPlan(r,d);assert.equal(saved.clean.properties[0].popular_name,'Nytt namn');assert.deepEqual(saved.clean.agreements,d.agreements);assert.deepEqual(saved.clean.objects,d.objects);assert.deepEqual(saved.clean.workspace.budgetPlans,d.workspace.budgetPlans);assert.deepEqual(d,before);validateData(saved.clean);
});

test('100 missing object IDs form one compact problem and do not conceal valid property enrichment',()=>{
 const d=base(),{prepared,profiles,result:r}=input(['Förvaltningsobjekt','Populärnamn','Area'],Array.from({length:100},()=>['1001','Nytt namn',75]),d),saved=approveImportPlan(r,d),story=explainImport(r,d,{approved:saved,profiles});
 assert.equal(r.report.blocking,0);assert.equal(r.report.review,100);assert.equal(story.rows.length,100);assert(story.rows.every(row=>row.status==='completed'&&row.partial));assert(story.rows.every(row=>!importRowAttention(row).blocked&&importRowAttention(row).complete));assert.equal(saved.clean.objects[0].area,50);
 const reviews=r.data.importReview.filter(x=>x.status==='pending'),html=importProblemsHtml(reviews,prepared,{profiles},importSchemas,r.clean);
 assert.equal((html.match(/data-review-category=/g)||[]).length,1);assert.match(html,/>100<\/td>/);assert.doesNotMatch(html,/Rad 2|Rad 3|<article/);
 const key=JSON.stringify(['fields','objects',null,'Välj ObjektID eller AvtalsID för att identifiera objektet.']);assert.equal(matchingImportRows(prepared,profiles,r,story.rows,{filter:'problem:'+key}).length,100);
});

test('a property contact can be enriched even when object facts have no identity',()=>{
 const d=base(),{result:r}=input(['Förvaltningsobjekt','Area','Fastighetsförvaltare'],[['1001',75,'Anna Testsson']],d);
 assert.equal(r.report.blocking,0);assert.equal(r.clean.people.length,1);assert.equal(r.clean.contacts.length,1);assert.equal(r.clean.contacts[0].property_id,'SF1001');assert.equal(r.clean.objects[0].area,50);
 const saved=approveImportPlan(r,d,choices(r,d));assert.equal(saved.clean.people.length,1);assert.equal(saved.clean.contacts.length,1);validateData(saved.clean);
});

test('the new-record choice governs people and companies without undoing unrelated blank fields',()=>{
 const d=base();d.properties[0].owner_party_id=null;
 const {result:r}=input(['Förvaltningsobjekt','Fastighetsägare','Fastighetsförvaltare','Populärnamn'],[['1001','Nytt bolag AB','Anna Testsson','Nytt namn']],d),plan=importCreationPlan(r,d);
 assert.deepEqual(plan.map(e=>e.table).sort(),['parties','people']);
 const none=approveImportPlan(r,d);assert.equal(none.clean.parties.length,1);assert.equal(none.clean.people.length,0);assert.equal(none.clean.contacts.length,0);assert.equal(none.clean.properties[0].popular_name,'Nytt namn');assert.equal(none.clean.properties[0].owner_party_id,null);
 const personOnly=approveImportPlan(r,d,choices(r,d,e=>e.table==='people'));assert.equal(personOnly.clean.people.length,1);assert.equal(personOnly.clean.people[0].party_id,null);assert.equal(personOnly.clean.contacts.length,1);assert.equal(personOnly.clean.properties[0].owner_party_id,null);
 const all=approveImportPlan(r,d,choices(r,d));assert.equal(all.clean.parties.length,2);assert.equal(all.clean.people.length,1);assert.equal(all.clean.properties[0].owner_party_id,all.clean.people[0].party_id);validateData(all.clean);
 const html=importApprovalHtml(plan,{},d,{enrichment:true,allowNew:false});assert.match(html,/nya poster läses inte in/);assert.doesNotMatch(html,/data-create-record=/);
});

test('only selected new hierarchies can be created and required parents still constrain children',()=>{
 const d=base(),{result:r}=input(['FastighetsID','Fastighetsbeteckning','ObjektID','Avtalsnummer','Ort'],[['P2','TESTET 2','O2','A2','Provstad']],d);
 const none=approveImportPlan(r,d);assert.deepEqual(none.clean.properties,d.properties);assert.deepEqual(none.clean.objects,d.objects);assert.deepEqual(none.clean.agreements,d.agreements);
 const childOnly=approveImportPlan(r,d,choices(r,d,e=>e.table!=='properties'));assert.equal(childOnly.clean.agreements.length,1);assert.equal(childOnly.clean.objects.length,1);
 const all=approveImportPlan(r,d,choices(r,d));assert.equal(all.clean.properties.length,2);assert.equal(all.clean.objects.length,2);assert.equal(all.clean.agreements.length,2);validateData(all.clean);
});

test('conflicting supplied parent IDs remain blocked and never move saved relationships',()=>{
 const d=base();d.properties.push(normalize('properties',{id:'P2',name:'TESTET 2'}));
 const {result:r}=input(['FastighetsID','ObjektID','Avtalsnummer','Populärnamn'],[['P2','SF1001-001','A1','Fel hemvist']],d);
 assert.equal(r.report.blocking,1);assert.deepEqual(r.clean.properties,d.properties);assert.deepEqual(r.clean.agreements,d.agreements);assert.deepEqual(r.clean.objects,d.objects);
});

test('enrichment has one visible new-record choice, no scalar comparisons and no second partial-save approval',()=>{
 const d=base(),{prepared,profiles,result:r}=input(['Förvaltningsobjekt','Area'],[['1001',75]],d),projected=approveImportPlan(r,d),explanation=explainImport(r,d,{approved:projected,profiles});
 const html=columnPreviewHtml(prepared,{profiles},r,importSchemas,{}, {enrichment:true,allowNew:false,allowPartial:true,explanationBase:d,projected,explanation});
 assert.equal((html.match(/data-import-new-mode/g)||[]).length,1);assert.match(html,/Importera ej nya/);assert.match(html,/Spara berikning/);assert.doesNotMatch(html,/data-import-conflict-mode|data-import-conflict-choice|data-import-safe-rows|100 kan inte läsas in|100 Väntar/);
});

test('manual descriptive edits remain possible while saved IDs and references stay guarded',()=>{
 const d=base(),{prepared,profiles}=input(['Förvaltningsobjekt','Populärnamn'],[['1001','Från filen']],d);d.properties[0].popular_name='Sparat namn';
 const column=profiles[0].columns[1],r=prepareCleanImport(prepared.workbook,profiles,d,{fileName:prepared.fileName,enrichment:true,cellEdits:{edit:{source:prepared.fileName,sheet:'Berikning',row:2,index:column.index,target:column.target,value:'Manuellt namn'}}},XLSX);
 assert.equal(r.clean.properties[0].popular_name,'Manuellt namn');assert.equal(r.clean.properties[0].management_object_number,'1001');assert.equal(r.clean.properties[0].owner_party_id,'B1');
});

test('an identified saved owner can receive its missing organization number without changing ownership',()=>{
 const d=base(),{result:r}=input(['properties.managementObjectNumber','properties.ownerPartyId','properties.ownerOrganizationNumber'],[['1001','Sparat bolag AB','0000000000']],d);
 assert.equal(r.report.blocking,0);assert.equal(r.report.review,0);assert.equal(r.clean.parties.length,1);assert.equal(r.clean.parties[0].organization_number,'000000-0000');assert.equal(r.clean.properties[0].owner_party_id,'B1');
});
