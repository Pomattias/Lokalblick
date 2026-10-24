import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importCreationPlan,approveImportPlan} from '../frontend/lokaler/import-plan.js';
const source=(rows,headers=['Förvaltningsobjekt','Avtalsnummer','Fastighetsbeteckning','Gatuadress','Area'])=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Syntetiskt');
 return {workbook,profiles:profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true})};
};
const run=(s,base=emptyData(),rowMatches={})=>prepareCleanImport(s.workbook,s.profiles,base,{fileName:'syntetiska-kopplingar.xlsx',rowMatches},XLSX);
const seed=()=>{
 const base=emptyData();for(const n of [4201,4202])base.properties.push(normalize('properties',{id:'SF'+n,management_object_number:String(n),name:'TESTET '+n,address:'Provgatan '+n}));
 base.objects.push(normalize('objects',{id:'SF4201-001',property_id:'SF4201'}));base.agreements.push(normalize('agreements',{id:'SF4201-001-03',object_id:'SF4201-001'}));base.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{propertyId:'SF4201',amount:12345}}];return base;
};

test('first import never proposes a shared designation as another numbered property, including the row-5 pattern',()=>{
 const r=run(source([['4201','SF4201-001-03','9000','Provgatan 1',100],['4202','SF4202-001-03','9000','Annan gata 2',200]]));
 assert.equal(r.report.linkProposals.length,0);assert.equal(r.report.blocking,0);assert.deepEqual(r.clean.properties.map(p=>p.id),['SF4201','SF4202']);assert.deepEqual(r.clean.objects.map(o=>o.property_id),['SF4201','SF4202']);assert.equal(r.clean.agreements.length,2);validateData(r.clean);
 assert.equal(importCreationPlan(r,emptyData()).length,6);assert.equal(approveImportPlan(r,emptyData()).clean.properties.length,0,'Explicit new-property approval is retained');
});
test('first import keeps different numbered properties even when addresses and names match',()=>{
 const r=run(source([['4201','SF4201-001-03','TESTET','Gemensam gata 1',100],['4202','SF4202-001-03','TESTET','Gemensam gata 1',100]]));assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.properties.length,2);assert.equal(r.clean.objects.length,2);
});
test('an unknown supplied management number cannot fall back to a named or addressed saved property',()=>{
 const base=seed(),s=source([['4203','SF4203-001-03',base.properties[0].name,base.properties[0].address,100]]),r=run(s,base);
 assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.properties.length,3);assert.equal(r.clean.objects.at(-1).property_id,'SF4203');assert.deepEqual(r.clean.workspace.budgetPlans,base.workspace.budgetPlans);
});
test('address enrichment is offered only for a keyless row against the saved portfolio',()=>{
 const base=seed(),s=source([['Provgatan 4201','Nytt populärnamn']],['Gatuadress','Populärnamn']),pending=run(s,base),p=pending.report.linkProposals[0];
 assert.equal(p.evidence,'Adress');assert.deepEqual(p.matches.map(p=>p.id),['SF4201']);
 const r=run(s,base,{[p.matchingKey]:{propertyId:'SF4201',signature:p.signature}});assert.equal(r.report.blocking,0);assert.equal(r.clean.properties[0].popular_name,'Nytt populärnamn');assert.equal(r.clean.properties.length,2);
 const first=run(s);assert.equal(first.report.linkProposals.length,0);assert.equal(first.clean.properties.length,1);
});
test('a known saved agreement ignores another property address for identity and reads its other facts',()=>{
 const base=seed(),r=run(source([['SF4201-001-03','Provgatan 4202','Intern']],['Avtalsnummer','Gatuadress','Kundtyp avtal']),base);
 assert.equal(r.report.blocking,0);assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.agreements[0].object_id,'SF4201-001');assert.equal(r.clean.objects[0].property_id,'SF4201');assert.equal(r.clean.properties[0].address,'Provgatan 4201');assert.equal(r.clean.agreements[0].customer_type,'Intern');assert(r.data.importReview.some(r=>r.field==='address'&&!r.rowRejected));assert.deepEqual(r.clean.workspace.budgetPlans,base.workspace.budgetPlans);
});
test('saved object links win over address descriptions for a new non-overlapping agreement',()=>{
 const base=seed();base.agreements[0].valid_to='2027-12-31';
 const r=run(source([['SF4201-001','SF4201-001-04','Provgatan 4202','2028-01-01']],['Objektnummer','Avtalsnummer','Gatuadress','From']),base);
 assert.equal(r.report.blocking,0);assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.agreements[1].object_id,'SF4201-001');validateData(r.clean);
});
test('real number conflicts still reject the row instead of moving a saved agreement',()=>{
 const base=seed(),r=run(source([['4202','SF4201-001-03']],['Förvaltningsobjekt','Avtalsnummer']),base);assert.equal(r.report.blocking,1);assert.equal(r.report.linkProposals.length,0);assert.deepEqual(r.clean.agreements,base.agreements);assert.deepEqual(r.clean.workspace.budgetPlans,base.workspace.budgetPlans);
});
test('same-name records with different addresses are never labelled as address matches',()=>{
 const base=seed(),r=run(source([[base.properties[0].name,'En annan adress']],['Fastighetsbeteckning','Gatuadress']),base);assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.properties.length,3);
});
test('a new lease never bypasses the one-agreement-at-a-time rule',()=>{
 const base=seed();base.agreements[0].valid_from='2027-01-01';base.agreements[0].valid_to='2027-12-31';const r=run(source([['4201','SF4201-001-04','2027-06-01','2028-12-31']],['Förvaltningsobjekt','Avtalsnummer','From','Tom']),base);
 assert.equal(r.clean.agreements.length,1);assert(r.data.importReview.some(r=>/redan ett avtal under perioden/.test(r.reason)));assert.equal(r.clean.objects.length,1);validateData(r.clean);
});
