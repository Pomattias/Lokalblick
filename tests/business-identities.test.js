import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {createBusinessLabels,agreementNumberParts} from '../frontend/lokaler/business-identities.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {importCreationPlan,approveImportPlan} from '../frontend/lokaler/import-plan.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {importRowHtml} from '../frontend/v2/import-table.js';
import {importApprovalHtml} from '../frontend/v2/import-approval.js';
import {fieldHistory} from '../frontend/v2/field-history.js';
const prepare=(rows,base=emptyData(),headers=['Förvaltningsobjekt','Avtalsnummer','Gatuadress','Area'])=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Syntetiskt');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true});
 return {profiles,result:prepareCleanImport(workbook,profiles,base,{fileName:'syntetiska-nummer.xlsx'},XLSX)};
};
const legacy=()=>{
 const data=emptyData();data.properties.push(normalize('properties',{id:'FAS-ab123cd',management_object_number:'4201',name:'TESTET 1',address:'Provgatan 1'}));
 data.objects.push(normalize('objects',{id:'OB-SF4201-001-03',property_id:data.properties[0].id}));
 data.agreements.push(normalize('agreements',{id:'SF4201-001-03',object_id:data.objects[0].id}));
 data.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{propertyId:data.properties[0].id,amount:12345}}];return data;
};
const visible=html=>html.replace(/<[^>]*>/g,' ');

test('management numbers become SF property numbers, objects omit only the last lease component',()=>{
 const {result:r}=prepare([['4201','SF4201-001-03','Provgatan 1',100]]);
 assert.equal(r.report.blocking,0);assert.deepEqual(r.clean.properties.map(p=>[p.id,p.management_object_number]),[['SF4201','4201']]);
 assert.equal(r.clean.objects[0].id,'SF4201-001');assert.equal(r.clean.agreements[0].id,'SF4201-001-03');assert.equal(r.clean.agreements[0].object_id,'SF4201-001');validateData(r.clean);
 const plan=importCreationPlan(r,emptyData());assert.equal(plan.length,3);assert.equal(approveImportPlan(r,emptyData()).clean.properties.length,0,'New roots still need one explicit approval');
 const choices=Object.fromEntries(plan.map(e=>[e.key,{signature:e.signature,action:'create'}]));assert.equal(approveImportPlan(r,emptyData(),choices).clean.agreements.length,1);
});
test('source spelling, hyphen prefix and leading zeroes survive agreement/object derivation',()=>{
 for(const [management,agreement,property,object]of [['004201','SF004201-0001-03','SF004201','SF004201-0001'],['4201','SF-4201-001-03','SF4201','SF-4201-001'],['INH42','SF4201-001-3','INH42','SF4201-001']]){
  const {result:r}=prepare([[management,agreement,'Provgatan 1',100]]);assert.equal(r.report.blocking,0);assert.equal(r.clean.properties[0].id,property);assert.equal(r.clean.objects[0].id,object);assert.equal(r.clean.agreements[0].id,agreement);
 }
 assert.equal(agreementNumberParts('2027-01-01'),null);assert.equal(agreementNumberParts('Okänt nummer'),null);
});
test('different agreement IDs share a business-numbered object, including overlapping periods',()=>{
 const headers=['Förvaltningsobjekt','Avtalsnummer','Gatuadress','From','Tom'],rows=[['4201','SF4201-001-03','Provgatan 1','2027-01-01','2027-12-31'],['4201','SF4201-001-04','Provgatan 1','2028-01-01','2028-12-31']];
 const {result:r}=prepare(rows,emptyData(),headers);assert.equal(r.report.blocking,0);assert.equal(r.clean.properties.length,1);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.agreements.length,2);
 rows[1][3]='2027-06-01';const overlap=prepare(rows,emptyData(),headers).result;assert.equal(overlap.clean.agreements.length,2);assert.equal(overlap.report.blocking,0);validateData(overlap.clean);
});
test('reimport preserves legacy canonical keys and locked budgets while displaying business numbers',()=>{
 const base=legacy(),before=structuredClone(base),{result:r}=prepare([['4201','SF4201-001-03','Provgatan 1',100]],base);
 assert.equal(r.report.blocking,0);assert.equal(r.clean.properties.length,1);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.properties[0].id,base.properties[0].id);assert.equal(r.clean.agreements[0].object_id,base.objects[0].id);assert.deepEqual(r.clean.workspace.budgetPlans,base.workspace.budgetPlans);assert.deepEqual(base,before);
 const view=projectWorkspace(r.clean);assert.equal(view.objects[0].number,'SF4201-001');assert.equal(collectWorkspace(view).objects[0].id,base.objects[0].id);assert(!Object.hasOwn(collectWorkspace(view).objects[0],'number'));
});
test('explicit business object references reuse an unambiguous legacy object instead of duplicating it',()=>{
 const base=legacy(),{result:r}=prepare([['4201','SF4201-001','SF4201-001-03']],base,['Förvaltningsobjekt','Objektnummer','Avtalsnummer']);
 assert.equal(r.report.blocking,0);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.agreements[0].object_id,base.objects[0].id);
});
test('ambiguous legacy object numbers need a saved agreement or an explicit choice',()=>{
 const base=legacy();base.objects.push(normalize('objects',{id:'OB-SF4201-001-04',property_id:base.properties[0].id}));base.agreements.push(normalize('agreements',{id:'SF4201-001-04',object_id:base.objects[1].id}));
 const headers=['Förvaltningsobjekt','Objektnummer','Avtalsnummer'];
 const ambiguous=prepare([['4201','SF4201-001','SF4201-001-05']],base,headers).result;assert.equal(ambiguous.report.blocking,1);assert.equal(ambiguous.clean.objects.length,2);assert.equal(ambiguous.clean.agreements.length,2);
 const known=prepare([['4201','SF4201-001','SF4201-001-03']],base,headers).result;assert.equal(known.report.blocking,0);assert.equal(known.clean.objects.length,2);assert.equal(known.clean.agreements[0].object_id,base.objects[0].id);
});
test('conflicting management and agreement property numbers block derivation',()=>{
 const {result:r}=prepare([['4201','SF9999-001-03','Provgatan 1',100]]);assert(r.data.importReview.some(r=>r.recordRejected));assert.equal(r.clean.objects.length,0);assert.equal(r.clean.agreements.length,0);assert.equal(r.clean.properties.length,1);assert.match(r.data.importReview[0].reason,/olika fastigheter/);
});
test('internal identifiers never become labels or visible chain/approval/history text',()=>{
 const base=legacy(),{result:r,profiles}=prepare([['4201','SF4201-001-03','Provgatan 1',100]],base),labels=createBusinessLabels(base);
 assert.equal(labels.number('properties',base.properties[0].id),'SF4201');assert.equal(labels.number('objects',base.objects[0].id),'SF4201-001');
 const row=explainImport(r,base,{profiles}).rows[0],html=importRowHtml(row,r,base);assert.match(visible(html),/SF4201/);assert.match(visible(html),/SF4201-001/);assert.doesNotMatch(visible(html),/FAS-|OB-|KOP-|PER-/);
 const fresh={...r,clean:base},plan=importCreationPlan(fresh,emptyData());assert.doesNotMatch(visible(importApprovalHtml(plan,{},emptyData())),/FAS-|OB-/);
 const view=projectWorkspace(base);view.auditLog=[{collection:'objects',recordId:base.objects[0].id,fields:[{field:'propertyId',from:base.properties[0].id,to:base.properties[0].id}]}];assert.doesNotMatch(visible(fieldHistory(view,'objects',view.objects[0],importSchemas)),/FAS-/);
});
test('missing or contradictory business numbers are honest labels and UUIDs stay internal',()=>{
 const data=legacy();data.properties[0].management_object_number=null;data.agreements=[];let labels=createBusinessLabels(data);
 assert.equal(labels.number('properties',data.properties[0].id),'Fastighetsnummer saknas');assert.equal(labels.number('objects',data.objects[0].id),'Objektnummer saknas');
 data.agreements=[{id:'SF4201-001-03',object_id:data.objects[0].id},{id:'SF4201-002-03',object_id:data.objects[0].id}];labels=createBusinessLabels(data);assert.equal(labels.number('objects',data.objects[0].id),'Objektnummer behöver kontrolleras');
 assert.doesNotMatch(labels.text('Personkoppling KOP-12345678-1234-1234-1234-123456789012 väntar på FAS-ab123cd och OB-SF4201-001-03'),/KOP-|FAS-|OB-/);
 assert.equal(labels.text('base|SF4201-001-03'),'Nummer saknas');
});


test('a new agreement reuses the legacy object by its derived number even for overlapping periods',()=>{
 const base=legacy();base.agreements[0].valid_from='2027-01-01';base.agreements[0].valid_to='2027-12-31';
 const headers=['Förvaltningsobjekt','Avtalsnummer','Gatuadress','From','Tom'],rows=[['4201','SF4201-001-04','Provgatan 1','2028-01-01','2028-12-31']];
 const r=prepare(rows,base,headers).result;assert.equal(r.report.review,0);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.agreements[1].object_id,base.objects[0].id);validateData(r.clean);
 rows[0][3]='2027-06-01';const overlapping=prepare(rows,base,headers).result;assert.equal(overlapping.clean.objects.length,1);assert.equal(overlapping.clean.agreements.length,2);assert.equal(overlapping.report.blocking,0);validateData(overlapping.clean);
});
