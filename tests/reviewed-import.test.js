import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {profileWorkbook,prepareMappedImport} from '../frontend/services/import-engine.js';
import '../frontend/domain/object-model.js';
const ctx=vm.createContext({window:{},XLSX});vm.runInContext(fs.readFileSync('frontend/services/source-service.js','utf8'),ctx);
const schemas=ctx.window.LokalblickSourceService.schemas;
function book(rows,name='Lokallista'){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name);return workbook;}
function run(workbook,base={},decide=()=>{}){
 const profiles=profileWorkbook(workbook,schemas,XLSX,base.importMappings||[],{reviewed:true});decide(profiles);
 return prepareMappedImport(workbook,profiles,base,{schemas,fileName:'syntetiskt.xlsx',fingerprint:'test',actor:'Test',strictColumns:true},XLSX);
}
test('recognized source sheet obeys explicit exclusions and creates no supplemental data',()=>{
 const workbook=book([['Förvaltningsobjekt','Gatuadress','Ort','Avtalsnummer','Area','Kommentar','Okänd uppgift'],['P-1','Testgatan 1','Malmö','A-1',100,'Importera inte denna','Hemlig testtext']]);
 const result=run(workbook,{},profiles=>{for(const column of profiles[0].columns)if(['Kommentar','Okänd uppgift'].includes(column.header))column.target='@ignore';});
 assert.equal(result.data.properties.length,1);assert.equal(result.data.contracts.length,1);
 assert.equal(result.data.contracts[0].comment,undefined);assert.deepEqual(result.data.contracts[0].supplemental,[]);
 assert.ok(!JSON.stringify(result).includes('Importera inte denna'));assert.ok(!JSON.stringify(result).includes('Hemlig testtext'));
 const again=run(workbook,result.data);assert.equal(again.report.counts.created,0);assert.equal(again.report.counts.fields,0);assert.equal(again.data.auditLog.length,result.data.auditLog.length);
 assert.equal(again.report.tables.find(table=>table.collection==='contracts').unchanged,1);
});
test('unmapped or supplemental targets cannot be applied through reviewed import',()=>{
 const workbook=book([['Fast.bet','Okänt'],['Test 1','Extra']]);
 assert.throws(()=>run(workbook),/befintligt fält/);
 assert.throws(()=>run(workbook,{},profiles=>{profiles[0].columns[1].target='@extra';}),/befintligt fält/);
});
test('a formerly unknown column can populate a real field without a supplemental copy',()=>{
 const result=run(book([['Fast.bet','Ort','Avtalsnummer','Internt kostnadsställe'],['Test 1','Malmö','A-1','K-42']]),{},profiles=>{profiles[0].columns[3].target='contracts.costCenterPremises';});
 assert.equal(result.data.contracts[0].costCenterPremises,'K-42');assert.deepEqual(result.data.contracts[0].supplemental,[]);
});
test('distinct email addresses remain distinct people and exact reimport does not duplicate them',()=>{
 const workbook=book([['Namn','E-post'],['Anna Lind','anna.lind@example.invalid'],['Annan Person','annalind@example.invalid']],'Personer');
 const first=run(workbook);assert.equal(first.data.people.length,2);
 const again=run(workbook,first.data);assert.equal(again.data.people.length,2);assert.equal(again.report.counts.fields,0);
});
test('tenant contacts resolve to actual people and cannot save names as person IDs',()=>{
 const base={people:[{id:'person-1',name:'Anna Lind',email:'anna@example.invalid'}]};
 const workbook=book([['Fast.bet','Ort','Avtalsnummer','Hyresgästens kontaktperson'],['Test 1','Malmö','A-1','Anna Lind']]);
 const result=run(workbook,base);assert.equal(result.data.contracts[0].tenantResponsiblePersonId,'person-1');
 assert.equal(result.data.assignments[0].personId,'person-1');assert.deepEqual(globalThis.LokalblickResponsibility.issues(result.data),[]);
 const unknown=run(workbook);assert.equal(unknown.data.contracts.length,0);assert.ok(unknown.data.importReview.some(review=>review.reason.includes('tenantResponsiblePersonId')));
});
test('cross-sheet enrichment uses the source property identifier and one agreement',()=>{
 const workbook=book([['Förvaltningsobjekt','Gatuadress','Ort','Avtalsnummer'],['P-1','Testgatan 1','Malmö','A-1']]);
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Objektsnummer / Förvaltningsobjekt','Avtalsnummer','Lokalyta (kvm)'],['P-1','A-1',200]]),'Lokalbestånd');
 const result=run(workbook);assert.equal(result.data.properties.length,1);assert.equal(result.data.contracts.length,1);assert.equal(result.data.contracts[0].area,200);assert.equal(result.data.objects.length,1);
});
test('excluding the property identity stages the agreement instead of creating an orphan',()=>{
 const result=run(book([['Fast.bet','Avtalsnummer'],['Test 1','A-1']]),{},profiles=>{profiles[0].columns[0].target='@ignore';});
 assert.equal(result.data.contracts.length,0);assert.ok(result.data.importReview.some(review=>review.reason.includes('Hemvist saknas')));
});
