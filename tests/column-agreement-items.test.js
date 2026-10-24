import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook,mappingConflicts,retargetColumn} from '../frontend/services/import-engine.js';
import {assignAgreementItemKeys,setMappingRow,mappingTemplate} from '../frontend/services/import-matching.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {importRowHtml} from '../frontend/v2/import-table.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';
const headers=['FastighetsID','ObjektID','Avtalsnummer','Bashyra','Tillägg','Tillägg','Fastighetsskatt'];
const values=['F1','O1','A1',100000,5000,6000,1000];
function book(h=headers,rows=[values]){const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([h,...rows]),'Lokaldata');return b;}
const profiles=(b,saved=[])=>profileWorkbook(b,importSchemas,XLSX,saved,{reviewed:true});
const run=(b,p=profiles(b),base=emptyData())=>prepareCleanImport(b,p,base,{fileName:'syntetisk-lokaldata.xlsx'},XLSX);

test('wide Lokaldata creates one linked record per amount column, including repeated additions, with source trace and actual record preview',()=>{
 const b=book(),ps=profiles(b),r=run(b,ps);assert.equal(mappingConflicts(ps).length,0);assert.equal(r.report.review,0);
 assert.deepEqual(r.clean.agreement_items.map(i=>[i.id,i.agreement_id,i.type,i.base_amount]),[['base|A1','A1','base',100000],['addition|A1','A1','addition',5000],['addition:2|A1','A1','addition',6000],['tax|A1','A1','tax',1000]]);
 for(const item of r.clean.agreement_items){const at=item.sources[0];assert.equal(at.sheet,'Lokaldata');assert.equal(at.row,2);assert.equal(headers[at.columnIndex],at.column);assert.equal(item.base_amount,values[at.columnIndex]);}
 assert.deepEqual(r.clean.agreement_items.map(i=>i.name),['Bashyra','Tillägg','Tillägg (2)','Fastighetsskatt']);assert.equal(r.clean.recurring_costs.length,0);assert.equal(r.clean.agreements[0].annual_rent,undefined);validateData(r.clean);
 const html=columnPreviewHtml({fileName:'syntetisk-lokaldata.xlsx'},{profiles:ps},r,importSchemas);const detail=explainImport(r,emptyData(),{profiles:ps}).rows.map(row=>importRowHtml(row,r,emptyData())).join('');assert.equal((detail.match(/data-chain-table="agreement_items"/g)||[]).length,4);assert.doesNotMatch(html,/data-import-item-records/);assert.match(html,/Denna beloppskolumn skapar en egen post/);
});
test('an existing agreement can be enriched solely from agreement ID and amount columns; repeat import keeps stable rows',()=>{
 const seeded=run(book()).clean,b=book(['Avtalsnummer','Bashyra','Tillägg','Tillägg','Fastighetsskatt'],[['A1',100000,5000,6000,1000]]),r=run(b,profiles(b),seeded);
 assert.equal(r.report.blocking,0);assert.equal(r.report.review,0);assert.equal(r.clean.agreement_items.length,4);assert.equal(r.clean.properties.length,1);assert.equal(r.clean.objects.length,1);
 const again=run(b,profiles(b,r.clean.workspace.importMappings),r.clean);assert.equal(again.report.review,0);assert.equal(again.report.tables.find(t=>t.collection==='agreementItems').created,0);assert.deepEqual(again.clean.agreement_items,r.clean.agreement_items);
});
test('reimport updates the selected addition only, with the correct column and record in review and history',()=>{
 const b=book(),seeded=run(b).clean,changed=book(headers,[[...values.slice(0,5),7000,1000]]),r=run(changed,profiles(changed,seeded.workspace.importMappings),seeded),review=r.data.importReview.find(i=>i.field==='baseAmount');
 assert.equal(review.recordId,'addition:2|A1');assert.equal(review.columnIndex,5);assert.equal(review.column,'Tillägg');assert.equal(review.current,6000);assert.equal(review.proposed,7000);
 const accepted=resolveImportChoices(r,{mode:'replace'},'Test');assert.equal(accepted.clean.agreement_items.length,4);assert.deepEqual(accepted.clean.agreement_items.filter(i=>i.type==='addition').map(i=>i.base_amount),[5000,7000]);assert(accepted.clean.workspace.auditLog.some(e=>e.recordId==='addition:2|A1'));
});
test('excluding one addition never renumbers or overwrites another; zero is a real amount and blank is not',()=>{
 const b=book(),seeded=run(b).clean,ps=profiles(b,seeded.workspace.importMappings);ps[0].columns[4].target='@ignore';assignAgreementItemKeys(ps[0]);const r=run(b,ps,seeded);assert.equal(r.report.review,0);assert.equal(ps[0].columns[5].itemKey,'addition:2');assert.equal(r.clean.agreement_items.length,4);
 const zero=book(headers,[[...values.slice(0,3),100000,'',0,1000]]),z=run(zero);assert.equal(z.report.blocking,0);assert.deepEqual(z.clean.agreement_items.filter(i=>i.type==='addition').map(i=>[i.id,i.base_amount]),[['addition:2|A1',0]]);
});
test('separate conditions require an explicit item when the category has multiple amounts, and the template retains that choice',async()=>{
 const h=[...headers,'Tillägg basår','Tillägg uppräkningsmetod'],v=[...values,2025,'Ingen'],b=book(h,[v]),ps=profiles(b),p=ps[0],year=p.columns.at(-2),method=p.columns.at(-1);
 assert.equal(year.itemAmbiguous,true);assert.equal(method.itemAmbiguous,true);
 year.itemKey='addition:2';method.itemKey='addition:2';assignAgreementItemKeys(p);assert.equal(year.itemAmbiguous,undefined);
 const r=run(b,ps);assert.equal(r.report.review,0);assert.equal(r.clean.agreement_items.find(i=>i.id==='addition|A1').base_year,null);assert.equal(r.clean.agreement_items.find(i=>i.id==='addition:2|A1').base_year,2025);assert.equal(r.clean.agreement_items.find(i=>i.id==='addition:2|A1').adjustment_method,'none');
 const template=mappingTemplate(b,ps,importSchemas,XLSX);XLSX.utils.sheet_add_aoa(template.Sheets.Lokaldata,[v],{origin:'A3'});const restored=XLSX.read(XLSX.write(template,{type:'buffer',bookType:'xlsx'}),{type:'buffer'}),q=profiles(restored)[0];setMappingRow(restored,q,true,importSchemas,XLSX);assert.equal(q.columns.at(-2).itemKey,'addition:2');assert.equal(q.columns[5].itemKey,'addition:2');assert.equal(mappingConflicts([q]).length,0);
 const roundtrip=await readWorkbook(await writeWorkbook(r.clean)),again=run(restored,[q],roundtrip);assert.equal(again.report.review,0);assert.equal(again.clean.agreement_items.length,4);validateData(again.clean);
});
test('manual amount mapping requires post type and then creates its own row rather than overwriting another amount',()=>{
 const b=book([...headers,'Specialbelopp'],[[...values,1500]]),p=profiles(b)[0],c=p.columns.at(-1);retargetColumn(b,p,c,'agreementItems.baseAmount',XLSX);assignAgreementItemKeys(p);assert.equal(c.itemAmbiguous,true);c.itemType='heat';assignAgreementItemKeys(p);const r=run(b,[p]);assert.equal(r.report.review,0);assert.equal(r.clean.agreement_items.length,5);assert.equal(r.clean.agreement_items.find(i=>i.type==='heat').base_amount,1500);
});
test('multiple active base rent columns still fail the existing financial validation',()=>{
 const b=book(['FastighetsID','Avtalsnummer','Bashyra','Bashyra'],[['F1','A1',100000,5000]]),r=run(b);assert.equal(r.report.review,1);assert.equal(r.clean.agreement_items.length,0);assert.match(r.data.importReview[0].reason,/bashyra/i);assert.equal(r.clean.agreements.length,1);
});

test('excluding an amount never silently moves its conditions to the remaining addition',()=>{
 const h=[...headers,'Tillägg basår'],v=[...values,2025],b=book(h,[v]),p=profiles(b)[0],year=p.columns.at(-1);year.itemKey='addition';assignAgreementItemKeys(p);assert.equal(year.itemAmbiguous,undefined);
 p.columns[4].target='@ignore';assignAgreementItemKeys(p);assert.equal(year.itemKey,'addition');assert.equal(year.itemAmbiguous,true);
 const template=mappingTemplate(b,[p],importSchemas,XLSX);XLSX.utils.sheet_add_aoa(template.Sheets.Lokaldata,[v],{origin:'A3'});const q=profiles(template)[0];setMappingRow(template,q,true,importSchemas,XLSX);assert.equal(q.columns.at(-1).itemKey,'addition');assert.equal(q.columns.at(-1).itemAmbiguous,true);
 year.itemKey='addition:2';assignAgreementItemKeys(p);assert.equal(year.itemAmbiguous,undefined);const r=run(b,[p]);assert.equal(r.report.review,0);assert.equal(r.clean.agreement_items.find(i=>i.type==='addition').base_year,2025);
});
test('reimport reviews for two changed additions retain separate record and source-column identities',()=>{
 const b=book(),first=run(b).clean,changed=book(headers,[[...values.slice(0,4),8000,8000,1000]]),r=run(changed,profiles(changed,first.workspace.importMappings),first),reviews=r.data.importReview.filter(i=>i.field==='baseAmount');
 assert.equal(reviews.length,2);assert.deepEqual(reviews.map(i=>[i.recordId,i.columnIndex]),[['addition|A1',4],['addition:2|A1',5]]);
});
test('a shared source post ID yields stable column IDs even when one of several amounts is blank',()=>{
 const h=['FastighetsID','Avtalsnummer','PostID','Bashyra','Tillägg'],b=book(h,[['F1','A1','SOURCE-1',100000,'']]),first=run(b),filled=book(h,[['F1','A1','SOURCE-1',100000,5000]]),again=run(filled,profiles(filled,first.clean.workspace.importMappings),first.clean);
 assert.equal(first.clean.agreement_items[0].id,'base|SOURCE-1');assert.equal(again.report.review,0);assert.deepEqual(again.clean.agreement_items.map(i=>i.id),['base|SOURCE-1','addition|SOURCE-1']);
});
