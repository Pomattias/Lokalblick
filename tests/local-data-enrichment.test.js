import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {readWorkbook,writeWorkbook} from '../frontend/lokaler/workbook.js';

import {localDataHeaders as headers,localAgreementId as agreementId,localDataRow as row} from './helpers/local-data-fixture.js';
function fixture(count=2){
 const base=emptyData();
 base.properties.push(normalize('properties',{id:'property-a',name:'Testfastighet',address:'Testgatan 1'}));
 for(let i=0;i<count;i++){
  base.objects.push(normalize('objects',{id:'object-'+i,property_id:'property-a',area:100+i}));
  base.agreements.push(normalize('agreements',{id:agreementId(i),object_id:'object-'+i}));
 }
 base.workspace.budgetPlans=[{year:2027,status:'Låst',lines:[{sourceId:agreementId(0),amount:100000}]}];
 return base;
}
function workbook(rows){
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([headers,[],...rows]),'Lokaldata');return w;
}

function prepare(w,base){
 const profiles=profileWorkbook(w,importSchemas,XLSX,[],{reviewed:true});
 return {profiles,result:prepareCleanImport(w,profiles,base,{fileName:'syntetisk-lokaldata.xlsx',actor:'Test'},XLSX)};
}

test('local-data captions map every supplied fact to its actual owner',()=>{
 const w=workbook([row(0)]),{profiles}=prepare(w,fixture());
 const mappings=new Map(profiles[0].columns.map(c=>[c.header,c.target]));
 const targets=['properties.managementObjectNumber','contracts.id','contracts.costCenter','properties.address','contracts.customerType','objects.area','contracts.agreementType','contracts.start','contracts.end','contracts.renewalPeriodMonths','contracts.noticePeriodMonths','contracts.terminatedOn','contracts.terminationReason','contracts.notice','contracts.category','contracts.use','properties.ownerResponsiblePersonId'];
 assert.deepEqual(headers.map(h=>mappings.get(h)),targets);
});

test('known agreements enrich their saved objects/properties across files without reapproving identities',async()=>{
 const base=fixture(8),before=structuredClone(base),w=workbook(Array.from({length:8},(_,i)=>row(i))),{profiles,result}=prepare(w,base);
 assert.equal(result.report.blocking,0);assert.equal(result.report.linkProposals.length,0);
 assert.equal(result.clean.properties.length,1);assert.equal(result.clean.objects.length,8);assert.equal(result.clean.agreements.length,8);
 assert.equal(result.clean.properties[0].id,'property-a');assert.equal(result.clean.properties[0].management_object_number,'4100');
 for(let i=0;i<8;i++){
  const a=result.clean.agreements.find(a=>a.id===agreementId(i));
  assert.equal(a.object_id,'object-'+i);assert.equal(a.cost_center,'003418');assert.equal(a.customer_type,'Intern');assert.equal(a.agreement_type,'Överenskommelse');assert.equal(a.valid_from,'2019-10-01');assert.equal(a.valid_to,'2027-12-31');assert.equal(a.renewal_months,12);assert.equal(a.notice_months,12);assert.equal(a.notice_by,'2026-12-31');
 }
 assert.equal(result.clean.people.length,1);assert.equal(result.clean.people[0].name,'Test Förvaltare');assert.equal(result.clean.contacts.length,1);assert.equal(result.clean.contacts[0].property_id,'property-a');assert.equal(result.clean.contacts[0].role,'owner');
 assert.deepEqual(result.clean.workspace.budgetPlans,base.workspace.budgetPlans);assert.deepEqual(base,before);
 assert.deepEqual(await readWorkbook(await writeWorkbook(result.clean,ExcelJS),ExcelJS),JSON.parse(JSON.stringify(result.clean)));
 const again=prepare(w,result.clean).result;
 assert.equal(again.report.blocking,0);assert.equal(again.report.linkProposals.length,0);assert.equal(again.report.tables.reduce((sum,t)=>sum+t.created+t.updated,0),0);
 const html=columnPreviewHtml({fileName:'syntetisk-lokaldata.xlsx'},{profiles},result,importSchemas);
 assert.match(html,/sparade.*kopplingar/i);
});

test('existing management number identifies a property for a new agreement without reusing cost centre as identity',()=>{
 const base=fixture();base.properties[0].management_object_number='4100';
 const input=row(10),result=prepare(workbook([input]),base).result;
 assert.equal(result.report.blocking,0);assert.equal(result.report.linkProposals.length,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.agreements.length,3);
 assert.equal(result.clean.objects.find(o=>o.id===result.clean.agreements.find(a=>a.id===agreementId(10)).object_id).property_id,'property-a');
});

test('a contradictory property/object relation cannot be approved by a global scalar-value choice',()=>{
 const base=fixture();base.properties.push(normalize('properties',{id:'other-property',name:'Annan testfastighet',management_object_number:'4200'}));
 const input=row(0);input[0]='4200';
 const result=prepare(workbook([input]),base).result;
 assert.equal(result.report.blocking,1);
 const selected=resolveImportChoices(result,{mode:'replace'},'Test');
 assert.equal(selected.clean.agreements.find(a=>a.id===agreementId(0)).object_id,'object-0');assert.equal(selected.clean.objects[0].property_id,'property-a');assert.equal(selected.clean.properties[0].management_object_number,null);assert.equal(selected.clean.agreements[0].cost_center,null);
 validateData(selected.clean);
});

test('blank inputs fill no old value and global value choices preserve locked budgets and all links',()=>{
 const base=fixture();base.agreements[0].cost_center='001111';base.agreements[0].usage='Kontor';
 const input=row(0);input[15]='';const result=prepare(workbook([input]),base).result;
 assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements[0].cost_center,'001111');assert.equal(result.clean.agreements[0].usage,'Kontor');
 for(const [mode,value]of [['keep','001111'],['replace','003418']]){
  const selected=resolveImportChoices(result,{mode},'Test');assert.equal(selected.clean.agreements[0].cost_center,value);assert.equal(selected.clean.agreements[0].object_id,'object-0');assert.deepEqual(selected.clean.workspace.budgetPlans,base.workspace.budgetPlans);
 }
});

test('80 known agreement rows reuse saved links in a different file and order without identity proposals',()=>{
 const base=fixture(80),rows=Array.from({length:80},(_,i)=>row(i)),first=prepare(workbook(rows),base).result;
 assert.equal(first.report.blocking,0);assert.equal(first.report.reusedLinks.length,80);assert.equal(first.report.linkProposals.length,0);
 const w=workbook(rows.toReversed()),profiles=profileWorkbook(w,importSchemas,XLSX,[],{reviewed:true});
 const again=prepareCleanImport(w,profiles,first.clean,{fileName:'annan-fil.xlsx',actor:'Test'},XLSX);
 assert.equal(again.report.blocking,0);assert.equal(again.report.reusedLinks.length,80);assert.equal(again.report.linkProposals.length,0);
 assert.equal(again.clean.properties.length,1);assert.equal(again.clean.objects.length,80);assert.equal(again.clean.agreements.length,80);assert.equal(again.clean.people.length,1);assert.equal(again.clean.contacts.length,1);
 assert.equal(again.report.tables.reduce((sum,t)=>sum+t.created+t.updated,0),0);
});

test('large unknown address proposals have one batch action and show only uncertain selections expanded',()=>{
 const base=emptyData(),w=XLSX.utils.book_new(),rows=[['AvtalsID','Gatuadress']];
 for(let i=0;i<80;i++){
  base.properties.push(normalize('properties',{id:'p'+i,name:'Test '+i,address:'Exempelgatan '+i}));
  rows.push(['NyttAvtal'+i,'Exempelgatan '+i]);
 }
 for(const id of ['amb-a','amb-b'])base.properties.push(normalize('properties',{id,name:'Osäker '+id,address:'Tvetydig testadress'}));
 rows.push(['TvetydigtAvtal','Tvetydig testadress']);
 XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),'Lokaldata');
 const {profiles,result}=prepare(w,base);
 assert.equal(result.report.linkProposals.length,81);
 const html=columnPreviewHtml({fileName:'syntetisk-lokaldata.xlsx'},{profiles},result,importSchemas);
 assert.match(html,/Godkänn 80 entydiga förslag/);assert.match(html,/<details data-import-link-exceptions open>/);assert.match(html,/<details data-import-link-suggestions>/);assert.doesNotMatch(html,/<details data-import-link-suggestions open>/);
 const rowMatches=Object.fromEntries(result.report.linkProposals.filter(p=>p.matches.length===1).map(p=>[p.matchingKey,{signature:p.signature,propertyId:p.matches[0].id}]));
 const selected=prepareCleanImport(w,profiles,base,{fileName:'syntetisk-lokaldata.xlsx',actor:'Test',rowMatches},XLSX);
 assert.equal(selected.clean.agreements.length,80);assert.equal(selected.report.blocking,1);assert.equal(selected.report.linkProposals.filter(p=>!p.approved).length,1);
});

test('current SQLite adds optional metadata without replacing saved records, links or locked budgets',async()=>{
 const {LocalStore}=await import('../backend/lokaler/store.js');
 const {DatabaseSync}=await import('node:sqlite');
 const {mkdtemp,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'lokaldata-optional-')),file=join(dir,'data.sqlite');let store;
 try{
  store=await LocalStore.open({file});await store.replace(fixture(),0);const before=structuredClone(store.snapshot());await store.close();store=null;
  const db=new DatabaseSync(file);db.exec('ALTER TABLE properties DROP COLUMN management_object_number; ALTER TABLE agreements DROP COLUMN cost_center; ALTER TABLE agreements DROP COLUMN customer_type; ALTER TABLE agreements DROP COLUMN agreement_type;');db.close();
  store=await LocalStore.open({file});assert.deepEqual(structuredClone(store.snapshot()),before);
  const result=prepare(workbook([row(0)]),store.snapshot().data).result;await store.replace(result.clean,before.version);await store.close();store=null;
  store=await LocalStore.open({file});assert.equal(store.snapshot().data.agreements[0].cost_center,'003418');assert.equal(store.snapshot().data.properties[0].management_object_number,'4100');assert.deepEqual(store.snapshot().data.workspace.budgetPlans,before.data.workspace.budgetPlans);
 }finally{await store?.close();await rm(dir,{recursive:true,force:true});}
});

test('a known management key can replace an address fallback with the real property name',()=>{
 const base=fixture();base.properties[0].name=base.properties[0].address;base.properties[0].management_object_number='4100';
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Förvaltningsobjekt','Gatuadress','Fastighetsnamn'],['4100','Testgatan 1','Riktigt testnamn']]),'Fastighetslista');
 const {result}=prepare(w,base);assert.equal(result.report.blocking,0);assert.equal(result.report.linkProposals.length,0);assert.equal(result.report.review,0);assert.equal(result.clean.properties[0].id,'property-a');assert.equal(result.clean.properties[0].name,'Riktigt testnamn');assert.deepEqual(result.clean.workspace.budgetPlans,base.workspace.budgetPlans);
});

test('management-key lookups also reuse the property when importing an issue without creating a property or object',()=>{
 const base=fixture();base.properties[0].management_object_number='4100';
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['ÄrendeID','Ärendenamn','Förvaltningsobjekt'],['I-1','Syntetisk kontroll','4100']]),'Ärenden');
 const {result}=prepare(w,base);assert.equal(result.report.blocking,0);assert.equal(result.report.linkProposals.length,0);assert.equal(result.clean.issues[0].property_id,'property-a');assert.equal(result.clean.properties.length,1);assert.equal(result.clean.objects.length,2);
});
