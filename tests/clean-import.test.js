import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
const targets=['properties.sourceId','properties.designation','properties.address','objects.number','objects.area','objects.apartmentCount','contracts.number','contracts.tenantName','contracts.baseRent','properties.responsiblePersonId','contracts.tenantResponsiblePersonId'];
const fixture=()=>[
 ['F1','Eken','Fiktiv väg 1','O1',100,2,'9(1)','Fiktiv hyresgäst',100000,'Anna Test','Kim Test'],
 ['F1','Eken','Fiktiv väg 1','O2',50,1,'91','Fiktiv hyresgäst',50000,'Anna Test','Kim Test'],
 ['F2','Björken','Fiktiv väg 2','O3',80,0,'91,1','Fiktiv hyresgäst',80000,'Anna Test','Kim Test']
];
function prepare(rows=fixture(),selected=targets){
 const sheet=XLSX.utils.aoa_to_sheet([selected,...rows]);
 const workbook={SheetNames:['Underlag'],Sheets:{Underlag:sheet}};
 const profiles=[{name:'Underlag',sheetKey:'Underlag',fileName:'syntetiskt.xlsx',headerRow:1,startColumn:0,columns:selected.map((target,index)=>({header:target,index,target,personIdentity:'name'}))}];
 return {workbook,profiles};
}
function run(rows,base=emptyData(),selected=targets){const {workbook,profiles}=prepare(rows,selected);return prepareCleanImport(workbook,profiles,base,{fileName:'syntetiskt.xlsx'},XLSX);}
test('en källrad fördelas till rätt register utan dubbel yta, personer eller organisation',()=>{
 const result=run();validateData(result.clean);
 assert.equal(result.clean.properties.length,2);assert.equal(result.clean.objects.length,3);assert.equal(result.clean.agreements.length,3);
 assert.equal(result.clean.parties.length,1);assert.equal(result.clean.people.length,2);assert.equal(result.clean.contacts.length,5);
 assert.deepEqual(result.clean.agreements.map(row=>row.number),['9(1)','91','91,1']);
 assert.ok(result.clean.agreements.every(row=>!('area'in row)&&!('property_id'in row)&&!('responsiblePersonId'in row)));
 assert.ok(result.clean.objects.every(row=>!('number'in row)&&!('rooms'in row)&&row.valid_from===null));
 assert.equal(result.clean.workspace.importReview.length,0);
});
test('återimport av samma fil är idempotent och skapar inga fler kopplingar',()=>{
 const first=run(),second=run(fixture(),first.clean);
 for(const table of ['properties','objects','agreements','parties','people','contacts'])assert.deepEqual(second.clean[table],first.clean[table],table);
 assert.ok(second.report.tables.every(row=>row.created===0&&row.updated===0));
});
test('olika värden hamnar i granskning och lämnar tidigare data intakt',()=>{
 const first=run();const rows=fixture();rows[0][4]=999;
 const result=run(rows,first.clean);
 assert.equal(result.clean.objects.find(row=>row.id==='O1').area,100);
 assert.equal(result.clean.workspace.importReview.length,1);assert.match(result.clean.workspace.importReview[0].reason,/Olika värden/);
 assert.equal(result.clean.properties.length,2);
});
test('namn kräver bekräftad identitet en gång per kolumn; ID/e-post kan identifiera säkert',()=>{
 const {workbook,profiles}=prepare();profiles[0].columns.forEach(c=>delete c.personIdentity);
 const result=prepareCleanImport(workbook,profiles,emptyData(),{fileName:'syntetiskt.xlsx'},XLSX);
 assert.equal(result.clean.people.length,0);assert.equal(result.clean.workspace.importReview.length,3);
 assert.equal(result.clean.agreements.length,0,'row is atomic');
});
test('bortvalda kolumner sparas inte och skapar inga kompletterande extrafält',()=>{
 const rows=fixture().map(row=>[...row,'hemlig ointressant uppgift']);
 const result=run(rows,emptyData(),[...targets,'@ignore']);
 assert.ok(!JSON.stringify(result.clean).includes('hemlig ointressant'));
});
test('gamla vyerna använder ren modell och en sparning kopierar inte ärvd samordnare',()=>{
 const result=run();
 result.clean.issues.push({id:'A1',object_id:'O1',property_id:null,title:'Ärende',status:'open',priority:'normal'});
 result.clean.orders.push({id:'B1',issue_id:'A1',title:'Beställning',status:'draft'});
 const view=projectWorkspace(result.clean);
 assert.equal(view.properties.length,2);assert.equal(view.contracts[0].area,100);assert.equal(view.activities[0].responsiblePersonId,result.clean.contacts.find(c=>c.role==='coordinator').person_id);
 view.budgetPlans=[{year:2027,locked:true,rows:[{id:'budget1',amount:123}]}];
 const saved=collectWorkspace(view,result.clean);
 assert.equal(saved.contacts.length,5);assert.ok(saved.contacts.every(c=>!c.issue_id&&!c.order_id));
 assert.deepEqual(saved.workspace.budgetPlans,view.budgetPlans);
 assert.equal(saved.agreements[0].area,undefined);
});

test('ett manuellt val vid värdekonflikt påverkar bara vald kolumn och källa',()=>{
 const first=run(),rows=fixture();rows[0][4]=125;
 const {workbook,profiles}=prepare(rows);
 const result=prepareCleanImport(workbook,profiles,first.clean,{fileName:'syntetiskt.xlsx',preferences:{'objects|area|syntetiskt.xlsx':'accept'}},XLSX);
 assert.equal(result.clean.objects.find(row=>row.id==='O1').area,125);assert.equal(result.report.blocking,0);assert.equal(result.clean.workspace.importReview.length,0);
});
test('ett verkligt personbyte i gamla vyn skapar egen tidskoppling men kopierar inte arvet',()=>{
 const data=run().clean;data.issues.push({id:'A1',object_id:'O1',property_id:null,title:'Ärende',status:'open',priority:'normal'});
 const before=projectWorkspace(data),view=structuredClone(before),newPerson=data.people.find(p=>p.name==='Kim Test');
 view.activities[0].responsiblePersonId=newPerson.id;
 globalThis.LokalblickResponsibility.applyChanges(before,view,{actor:'Testare',fromDate:'2026-10-19'});
 const saved=collectWorkspace(view,data);
 assert.equal(saved.contacts.filter(c=>c.issue_id==='A1'&&!c.cancelled).length,1);
 assert.equal(saved.contacts.find(c=>c.issue_id==='A1').valid_from,'2026-10-19');
 assert.equal(saved.contacts.filter(c=>c.role==='coordinator'&&c.property_id).length,2);
});
test('flikar med separata register ordnas efter beroenden och blankt datum förblir blankt',()=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['ObjektID','FastighetsID','Benämning','Area'],['O1','P1','Kontor',100]]),'Objekt');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['FastighetsID','Namn'],['P1','Testfastighet']]),'Fastigheter');
 const profiles=[{name:'Objekt',headerRow:1,columns:['objects.number','objects.propertyId','objects.name','objects.area'].map((target,index)=>({index,target,header:target}))},{name:'Fastigheter',headerRow:1,columns:['properties.sourceId','properties.designation'].map((target,index)=>({index,target,header:target}))}];
 const result=prepareCleanImport(workbook,profiles,emptyData(),{fileName:'test.xlsx'},XLSX);
 assert.equal(result.clean.objects.length,1);assert.equal(result.clean.objects[0].valid_from,null);assert.equal(result.report.blocking,0);
});
