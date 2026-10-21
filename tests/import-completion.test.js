import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {importReviewGroups,importTableRows,resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {importReceiptHtml,sources} from '../frontend/v2/views.js';
import {resolveReview} from '../frontend/v2/model.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';

function prepare(targets,rows,base=emptyData(),sheet='Underlag'){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([targets,...rows]),sheet);
 const profiles=[{name:sheet,fileName:'test.xlsx',primaryTable:'contracts',canonical:true,headerRow:1,columns:targets.map((target,index)=>({index,target,header:target}))}];
 return {profiles,result:prepareCleanImport(workbook,profiles,base,{fileName:'test.xlsx'},XLSX)};
}
const fields=['properties.id','properties.designation','objects.id','objects.area','contracts.id','contracts.start','contracts.end','contracts.contractDocumentUrl'];
const row=(i=1)=>['F'+i,'Test '+i,'O'+i,100,'A'+i,'2025-01-01','2029-12-31','https://example.invalid/'+i];
test('one mixed source row builds property → object → agreement → issue and holds only invalid optional fields',()=>{
 const input=[...row(), 'I1','Fiktiv åtgärd'];input[3]=-4;input[5]='Se avtal';input[7]='streamToClient';
 const {result}=prepare([...fields,'activities.id','activities.title'],[input]);
 assert.equal(result.report.blocking,0);for(const table of ['properties','objects','agreements','issues'])assert.equal(result.clean[table].length,1);
 assert.equal(result.clean.objects[0].property_id,'F1');assert.equal(result.clean.agreements[0].object_id,'O1');assert.equal(result.clean.issues[0].object_id,'O1');
 assert.equal(result.clean.objects[0].area,null);assert.equal(result.clean.agreements[0].valid_from,null);assert.equal(result.clean.agreements[0].main_contract_url,null);
 assert.equal(result.clean.workspace.importReview.length,3);assert(result.clean.workspace.importReview.every(review=>review.fieldRejected&&!review.blocking&&review.recordId));
 assert.equal(result.clean.workspace.sourceRegistry[0].receipt.readRows,1);validateData(result.clean);
});
test('invalid replacements preserve saved dates/amounts and valid enrichment without accepting the failed values',()=>{
 const first=prepare(fields,[row()]).result.clean;first.workspace.budgetPlans=[{id:'locked',year:2027,locked:true,snapshot:{amount:12345},history:['Bevara']}];
 const bad=row();bad[3]='okänd yta';bad[5]='inte ett datum';
 const {result}=prepare([...fields,'contracts.business'],[[...bad,'Beskrivande verksamhet']],first),chosen=resolveImportChoices(result,{mode:'replace'});
 assert.equal(chosen.clean.objects[0].area,100);assert.equal(chosen.clean.agreements[0].valid_from,'2025-01-01');assert.equal(chosen.clean.agreements[0].business,'Beskrivande verksamhet');
 assert.deepEqual(chosen.clean.workspace.budgetPlans,first.workspace.budgetPlans);assert.equal(chosen.clean.workspace.importReview.length,2);
 for(const review of chosen.data.importReview)assert.throws(()=>resolveReview(chosen.data,review.id,'accept','','Testare'),/läs in på nytt/);
});
test('reversed optional dates are held together; an agreement still cannot escape its object period',()=>{
 const reversed=row();reversed[5]='2029-12-31';reversed[6]='2025-01-01';
 const {result}=prepare(fields,[reversed]);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements[0].valid_from,null);assert.equal(result.clean.agreements[0].valid_to,null);assert.equal(result.clean.workspace.importReview.length,2);
 const base=prepare(fields,[row()]).result.clean;base.objects[0].valid_from='2025-01-01';base.objects[0].valid_to='2029-12-31';
 const invalid=row();invalid[4]='A2';invalid[5]='Se avtal';const blocked=prepare(fields,[invalid],base).result;
 assert.equal(blocked.report.blocking,1);assert.equal(blocked.clean.agreements.length,1);assert(blocked.clean.workspace.importReview.every(review=>review.rowRejected));
});
test('rent amounts, item index terms, identity and relationship conflicts remain blocking',()=>{
 const base=prepare(fields,[row()]).result.clean;
 for(const [targets,values]of [
  [['contracts.id','contracts.baseRent'],['A1','okänd hyra']],
  [['agreementItems.id','agreementItems.contractId','agreementItems.type','agreementItems.name','agreementItems.baseAmount','agreementItems.baseYear'],['P1','A1','base','Bashyra',1000,'okänt basår']],
  [['properties.id','properties.designation','objects.id'],['F2','Annan fastighet','O1']],
  [['contracts.business'],['Avtal utan identifierare']]
 ]){
  const {result}=prepare(targets,[values],base);assert.equal(result.report.blocking,1,targets.join(','));assert.deepEqual(result.clean.agreements,base.agreements);assert.equal(result.clean.agreement_items.length,0);assert.equal(result.clean.properties.length,1);
 }
});
test('duplicate mappings of optional numeric fields still block instead of silently choosing one value',()=>{
 const {result}=prepare(['properties.id','properties.designation','objects.id','objects.area','objects.area'],[['F1','Test','O1',100,200]]);
 assert.equal(result.report.blocking,1);assert.equal(result.clean.objects.length,0);assert.equal(result.clean.properties.length,0);
});
test('100 repeated field failures are one expandable problem type with all source records preserved',()=>{
 const input=Array.from({length:100},(_,i)=>{const values=row(i);values[5]='Se avtal';return values;});
 const {result,profiles}=prepare(fields,input),reviews=result.clean.workspace.importReview,groups=importReviewGroups(reviews);
 assert.equal(reviews.length,100);assert.equal(groups.length,1);assert.equal(groups[0].rowCount,100);assert.equal(groups[0].recordCount,100);assert.equal(groups[0].category,'fields');
 assert.deepEqual(importTableRows(result.report.tables).map(item=>item.collection),['properties','objects','contracts']);
 const html=columnPreviewHtml({fileName:'test.xlsx'},{profiles},result,importSchemas);
 assert.equal((html.match(/data-review-problem=/g)||[]).length,1);assert(!html.includes('import-problems'));assert(!html.includes('data-import-safe-rows'));assert(!html.includes('data-invalid-link'));assert(!html.includes('data-import-register="costEvidence"'));
 assert(html.indexOf('data-import-register="properties"')<html.indexOf('data-import-register="objects"'));assert.match(html,/Inget är sparat ännu/);assert.match(html,/100 källrader/);
 const receipt=importReceiptHtml(result.data.sourceRegistry[0],result.data);assert.match(receipt,/1 problemtyp/);assert.match(receipt,/data-receipt-tables open/);
 const saved=sources(result.data,{status:()=>({}),company:()=>false});assert.equal((saved.match(/data-source-review-group/g)||[]).length,1);assert.match(saved,/<details class="review-details">/);
});
test('corrected reimport fills held fields without duplicating entities or discarding another sheet’s pending reviews',()=>{
 const bad=row();bad[5]='Se avtal';const first=prepare(fields,[bad],emptyData(),'A').result;
 const other=prepare(fields,[bad],first.clean,'B').result;assert.equal(other.clean.workspace.importReview.length,2);
 const fixed=prepare(fields,[row()],other.clean,'A').result;
 assert.equal(fixed.clean.properties.length,1);assert.equal(fixed.clean.objects.length,1);assert.equal(fixed.clean.agreements.length,1);assert.equal(fixed.clean.agreements[0].valid_from,'2025-01-01');
 assert.equal(fixed.clean.workspace.importReview.length,1);assert.equal(fixed.clean.workspace.importReview[0].sheet,'B');
});
test('required record choices remain visible even after more than 100 optional field failures',()=>{
 const base=emptyData();for(const id of ['P','Q'])base.properties.push(normalize('properties',{id,name:'Gemensamt namn',address:id}));
 const rows=Array.from({length:150},(_,i)=>{const values=row(i);values[5]='Se avtal';return values;});rows.push(['','Gemensamt namn','O-amb',100,'A-amb','2025-01-01','2029-12-31','']);
 const {result,profiles}=prepare(fields,rows,base),groups=importReviewGroups(result.clean.workspace.importReview);
 assert.equal(result.report.blocking,1);assert.equal(groups[0].category,'blocked');
 const html=columnPreviewHtml({fileName:'test.xlsx'},{profiles},result,importSchemas);assert.match(html,/<select data-row-match=/);assert(html.indexOf('data-review-category="blocked"')<html.indexOf('data-review-category="fields"'));assert.match(html,/Alla källrader finns i granskningsunderlaget/);
});
test('held source values, field receipt counts and Budget survive the actual Excel roundtrip',async()=>{
 const input=row();input[5]='Se avtal';const {result}=prepare(fields,[input]);result.clean.workspace.budgetPlans=[{year:2027,locked:true,rows:[{amount:987}]}];
 const restored=await readWorkbook(await writeWorkbook(result.clean));assert.deepEqual(restored,JSON.parse(JSON.stringify(result.clean)));
 const stat=restored.workspace.sourceRegistry[0].receipt.columns.find(column=>column.target==='contracts.start');assert.equal(stat.read,0);assert.equal(stat.skipped,1);assert.equal(stat.review,1);
 assert.equal(restored.workspace.importReview[0].value,'Se avtal');assert.equal(restored.workspace.importReview[0].recordId,'A1');
});
