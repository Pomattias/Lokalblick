import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {importConflictGroups,resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';
function prepare(sheets,base=emptyData(),fileName='syntetiskt.xlsx'){
 const book=XLSX.utils.book_new(),profiles=[];
 for(const {name,targets,rows} of sheets){XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([targets,...rows]),name);profiles.push({name,headerRow:1,startColumn:0,fileName,columns:targets.map((target,index)=>({target,index,header:target}))});}
 return prepareCleanImport(book,profiles,base,{fileName,actor:'Testare'},XLSX);
}
const sheet=(targets,rows,name='Underlag')=>({name,targets,rows});
const base=()=>prepare([sheet(['properties.id','properties.designation','properties.address','objects.id','objects.area','contracts.id'],[['F1','Testfastighet 1','Testgatan 1','O1',100,'A1'],['F2','Testfastighet 2','Testgatan 2','O2',80,'A2']])]).clean;
const enrichment=(data=base())=>prepare([sheet(['properties.id','properties.address','contracts.id','contracts.businessName'],[['F1','Ny testgata 1','A1','Beskrivning 1'],['F1','Ny testgata 1','A1','Beskrivning 1'],['F1','Ny testgata 1','A1','Beskrivning 1'],['F2','Ny testgata 2','A2','Beskrivning 2']])],data,'berikning.xlsx');

test('later property tables complement blank fields, preserve existing roots and create only genuinely new IDs',()=>{
 const first=prepare([sheet(['properties.id','properties.designation'],[['F1','Testfastighet 1']],'Fastigheter')]);
 const result=prepare([sheet(['properties.id','properties.address','properties.popularName'],[['F1','Testgatan 1','Testnamn'],['F2','Testgatan 2','Nytt testnamn']],'Berikning')],first.clean);
 assert.equal(result.clean.properties.length,2);assert.equal(result.clean.properties.find(p=>p.id==='F1').popular_name,'Testnamn');assert.equal(result.clean.properties.find(p=>p.id==='F1').name,'Testfastighet 1');assert.equal(result.report.review,0);assert.equal(result.report.blocking,0);
 const again=prepare([sheet(['properties.id','properties.address','properties.popularName'],[['F1','Testgatan 1','Testnamn'],['F2','Testgatan 2','Nytt testnamn']],'Berikning')],result.clean);assert.equal(again.clean.properties.length,2);assert.equal(again.report.changes.length,0);
});
test('an existing object or agreement anchors descriptive property enrichment when the property ID is absent',()=>{
 const data=base();
 for(const target of ['objects.id','contracts.id']){
  const result=prepare([sheet([target,'properties.address','properties.popularName'],[[target==='objects.id'?'O1':'A1','Alternativ testadress','Testnamn']])],data);
  assert.equal(result.report.blocking,0);assert.equal(result.clean.properties.length,2);assert.equal(result.clean.properties.find(p=>p.id==='F1').popular_name,'Testnamn');assert.equal(result.clean.properties.find(p=>p.id==='F1').address,'Testgatan 1');assert.equal(result.clean.objects.length,2);assert.equal(result.clean.agreements.length,2);assert.equal(importConflictGroups(result).length,1);validateData(result.clean);
 }
});
test('repeated address differences consolidate to two choices while preserving all four source rows',()=>{
 const result=enrichment(),groups=importConflictGroups(result);assert.equal(result.report.blocking,0);assert.equal(result.report.review,2);assert.equal(groups.length,2);
 const f1=result.clean.workspace.importReview.find(r=>r.recordId==='F1');assert.deepEqual(f1.occurrences.map(o=>o.row),[2,3,4]);assert.equal(f1.proposed,'Ny testgata 1');assert.equal(result.clean.agreements[0].business_name,'Beskrivning 1');
 const selected=resolveImportChoices(result,{mode:'replace'},'Testare');assert.equal(selected.clean.properties[0].address,'Ny testgata 1');assert.equal(selected.clean.properties[1].address,'Ny testgata 2');assert.equal(selected.report.review,0);assert.equal(selected.report.tables.find(t=>t.collection==='properties').updated,2);assert.equal(selected.report.tables.find(t=>t.collection==='properties').unchanged,0);assert.equal(result.clean.properties[0].address,'Testgatan 1','Preview choices do not mutate the original draft');
 assert.equal(selected.clean.workspace.auditLog.find(e=>e.action==='Importvärde valt'&&e.recordId==='F1').fields[0].provenance.occurrences.length,3);
 assert(selected.clean.workspace.importReview.every(r=>r.status==='accepted'));assert(!selected.report.decisions.some(r=>r.classification==='B'),'Resolved differences disappear from the problem summary');
});
test('keep all and per-record overrides complete other values without losing data or changing roots',()=>{
 const result=enrichment(),groups=importConflictGroups(result),kept=resolveImportChoices(result,{mode:'keep'},'Testare');assert.equal(kept.report.review,0);assert.equal(kept.clean.properties[0].address,'Testgatan 1');assert.equal(kept.clean.agreements[0].business_name,'Beskrivning 1');assert.equal(kept.report.tables.find(t=>t.collection==='properties').updated,0);
 const chosen=resolveImportChoices(result,{mode:'replace',choices:{[groups[0].key]:'keep'}},'Testare');assert.equal(chosen.clean.properties[0].address,'Testgatan 1');assert.equal(chosen.clean.properties[1].address,'Ny testgata 2');assert.equal(chosen.report.review,0);assert.equal(chosen.clean.objects[0].property_id,'F1');
 const individual=resolveImportChoices(result,{choices:{[groups[0].key]:groups[0].candidates[0].key}},'Testare');assert.equal(individual.report.review,1);assert.equal(individual.clean.properties[0].address,'Ny testgata 1');assert.equal(individual.clean.properties[1].address,'Testgatan 2');
});
test('multiple different new values require a per-record choice, not a last-row overwrite',()=>{
 const result=prepare([sheet(['properties.id','properties.address'],[['F1','Alternativ 1'],['F1','Alternativ 2'],['F1','Alternativ 1']])],base()),group=importConflictGroups(result)[0];
 const automatic=resolveImportChoices(result,{mode:'replace'});assert.equal(automatic.clean.properties[0].address,'Testgatan 1');assert.equal(automatic.report.review,2);assert.equal(group.candidates.length,2);
 const selected=resolveImportChoices(result,{mode:'replace',choices:{[group.key]:group.candidates[1].key}},'Testare');assert.equal(selected.clean.properties[0].address,'Alternativ 2');assert.equal(selected.report.review,0);assert.equal(selected.clean.workspace.importReview.filter(r=>r.status==='accepted').length,1);assert.equal(selected.clean.workspace.importReview.filter(r=>r.status==='rejected').length,1);
});
test('scalar object and agreement differences do not discard enrichment or their linked new records',()=>{
 const result=prepare([sheet(['contracts.id','objects.area','contracts.businessName'],[['A1',125,'Ny beskrivning']])],base());
 assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements[0].business_name,'Ny beskrivning');assert.equal(result.clean.objects[0].area,100);assert.equal(result.clean.properties.length,2);
 const selected=resolveImportChoices(result,{mode:'replace'},'Testare');assert.equal(selected.clean.objects[0].area,125);assert.equal(selected.report.review,0);
 const zero=prepare([sheet(['objects.id','objects.area'],[['O1',0]])],base());assert.equal(resolveImportChoices(zero,{mode:'replace'}).clean.objects[0].area,0);
});
test('all selected values are validated together and a failed period change leaves the draft intact',()=>{
 const data=base();data.agreements[0].valid_from='2025-01-01';data.agreements[0].valid_to='2025-12-31';data.agreements.push(normalize('agreements',{id:'A3',object_id:'O1',valid_from:'2026-01-01',valid_to:'2026-12-31'}));validateData(data);
 const result=prepare([sheet(['contracts.id','contracts.end','contracts.businessName'],[['A1','2026-06-01','Berikad']])],data),before=JSON.stringify(result);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements[0].business_name,'Berikad');assert.throws(()=>resolveImportChoices(result,{mode:'replace'}),/redan ett avtal/);assert.equal(JSON.stringify(result),before);
});
test('global overwrite never bypasses ID, reference or date errors',()=>{
 const result=prepare([sheet(['properties.id','objects.id','objects.area'],[['F2','O1',200]])],base());assert.equal(result.report.blocking,1);assert.equal(importConflictGroups(result).length,0);const chosen=resolveImportChoices(result,{mode:'replace'});assert.equal(chosen.clean.objects[0].property_id,'F1');assert.equal(chosen.clean.objects[0].area,100);
 const bad=prepare([sheet(['contracts.id','contracts.start'],[['A1','Se avtal']])],base());assert.equal(bad.report.blocking,0);assert.equal(importConflictGroups(bad).length,0);assert.equal(bad.clean.agreements[0].valid_from,base().agreements[0].valid_from);assert.equal(bad.clean.workspace.importReview[0].fieldRejected,true);assert.equal(resolveImportChoices(bad,{mode:'replace'}).clean.agreements[0].valid_from,base().agreements[0].valid_from);
});
test('choices are limited to this import and do not change pending reviews from other files',()=>{
 const data=base();data.workspace.importReview=[{id:'old',kind:'canonical-conflict',status:'pending',source:'annan-fil.xlsx',sheet:'Annat',collection:'properties',recordId:'F1',field:'address',current:'Testgatan 1',proposed:'Annat förslag'}];
 const result=enrichment(data),groups=importConflictGroups(result);assert.equal(groups.length,2);assert.equal(groups[0].candidates.length,1);const selected=resolveImportChoices(result,{mode:'replace'});assert.equal(selected.clean.workspace.importReview.find(r=>r.id==='old').status,'pending');assert.equal(selected.report.review,0);assert(selected.report.tables.every(t=>t.review===0));
});
test('enrichment decisions and every source occurrence survive an Excel round trip',async()=>{
 const selected=resolveImportChoices(enrichment(),{mode:'replace'},'Testare'),roundtrip=await readWorkbook(await writeWorkbook(selected.clean));assert.deepEqual(roundtrip.properties,selected.clean.properties);assert.deepEqual(roundtrip.workspace.importReview,selected.clean.workspace.importReview);assert.deepEqual(roundtrip.workspace.auditLog,selected.clean.workspace.auditLog);assert.equal(roundtrip.objects.length,2);assert.equal(roundtrip.agreements.length,2);
});
test('preview offers one overall policy and one row per distinct record field, without blocking scalar conflicts',()=>{
 const result=enrichment(),html=columnPreviewHtml({fileName:'berikning.xlsx'},{profiles:[]},result,importSchemas);
 assert.match(html,/Övergripande val för importen/);assert.match(html,/data-import-conflict-mode/);assert.equal((html.match(/data-import-conflict-choice=/g)||[]).length,2);assert.match(html,/3 källrader/);assert.match(html,/Nya fastigheter, objekt och avtal.*måste godkännas/i);
});

test('simultaneous start/end choices are applied together instead of validating a temporary mixed period',()=>{
 const data=base();data.agreements[0].valid_from='2025-01-01';data.agreements[0].valid_to='2025-12-31';
 const result=prepare([sheet(['contracts.id','contracts.start','contracts.end'],[['A1','2027-01-01','2028-12-31']])],data);assert.equal(result.report.blocking,0);const selected=resolveImportChoices(result,{mode:'replace'});assert.equal(selected.clean.agreements[0].valid_from,'2027-01-01');assert.equal(selected.clean.agreements[0].valid_to,'2028-12-31');validateData(selected.clean);
});

test('property-ID providers establish roots before mixed enrichment sheets even when the sheet names sort the other way',()=>{
 const result=prepare([
  sheet(['contracts.id','properties.address','contracts.businessName'],[['A1','Ny testadress','Kompletterad']],'A Berikning'),
  sheet(['properties.id','properties.designation','objects.id','objects.area','contracts.id'],[['F1','Testfastighet 1','O1',100,'A1']],'Z Grundregister')
 ]);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.properties[0].id,'F1');assert.equal(result.clean.properties[0].address,'Ny testadress');assert.equal(result.clean.objects[0].id,'O1');assert.equal(result.clean.agreements[0].business_name,'Kompletterad');
});
