import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {importReceiptHtml} from '../frontend/v2/views.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';

function prepare(rows,base=emptyData(),adjust=()=>{}){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),'Fastigheter');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,base.workspace.importMappings||[],{reviewed:true});adjust(profiles);
 return {profiles,result:prepareCleanImport(workbook,profiles,base,{fileName:'test.xlsx'},XLSX)};
}
const receipt=result=>result.clean.workspace.sourceRegistry.find(source=>source.name==='test.xlsx').receipt;
const propertyRows=[['FastighetsID','Fastighetsnamn','Gatuadress'],['F1','Test 1','Testgata 1']];

test('receipt counts only affected records and repeated rows never inflate record totals',()=>{
 const base=emptyData();for(const id of ['F1','F2','F3'])base.properties.push(normalize('properties',{id,name:id==='F1'?'Test 1':id,address:id==='F1'?'Testgata 1':null}));
 const {result}=prepare([...propertyRows,propertyRows[1]],base),saved=receipt(result),table=saved.tables.find(row=>row.collection==='properties');
 assert.equal(table.unchanged,1);assert.equal(table.created,0);assert.equal(table.updated,0);assert.equal(saved.readRows,2);assert.equal(saved.columns[0].read,2);assert.equal(result.clean.properties.length,3);
});
test('a rejected row contributes no records or successful values and remains separate in the receipt',()=>{
 const {result}=prepare([['FastighetsID','Fastighetsnamn','Latitud'],['F1','Test 1',55],['F2\ninvalid','Felaktig rad','ogiltigt']]),saved=receipt(result);
 assert.equal(saved.rows,2);assert.equal(saved.readRows,1);assert.equal(saved.rejectedRows,1);assert.equal(saved.tables.find(row=>row.collection==='properties').created,1);assert.equal(result.clean.properties.length,1);
 for(const column of saved.columns){assert.equal(column.read,1);assert.equal(column.skipped,1);}
 const html=importReceiptHtml(result.data.sourceRegistry[0],result.data);assert.match(html,/1 rad lämnades utanför/);assert.match(html,/data-receipt-review/);
});
test('resolved scalar choices refresh the receipt and preserve the original preview',()=>{
 const base=prepare(propertyRows).result.clean,{result}=prepare([propertyRows[0],['F1','Test 1','Ny gata']],base),before=structuredClone(receipt(result));
 assert.equal(before.columns[2].review,1);
 for(const mode of ['keep','replace']){
  const resolved=resolveImportChoices(result,{mode}),saved=receipt(resolved);assert.equal(saved.columns[2].review,0);assert.equal(saved.tables.find(row=>row.collection==='properties').updated,mode==='replace'?1:0);
  assert(!importReceiptHtml(resolved.data.sourceRegistry[0],resolved.data).includes('data-receipt-review'));
 }
 assert.deepEqual(receipt(result),before);
});
test('receipt keeps exclusions without their cell contents and a later exclusion does not delete data',()=>{
 const base=prepare(propertyRows).result.clean,{result,profiles}=prepare([propertyRows[0],['F1','Test 1','Privat bortvald text']],base,profiles=>{profiles[0].columns[2].target='@ignore';profiles[0].columns[2].approved=true;});
 const saved=receipt(result);assert.equal(saved.columns[2].target,'@ignore');assert.equal(saved.columns[2].read,0);assert(!JSON.stringify(saved).includes('Privat bortvald text'));assert.equal(result.clean.properties[0].address,'Testgata 1');
 const html=columnPreviewHtml({fileName:'test.xlsx'},{profiles},result,importSchemas);
 assert.match(html,/<details data-column-group="mapped"><summary>/);assert.match(html,/<details data-column-group="ignored"><summary>/);assert.match(html,/data-ignore-column/);
 const next=prepare(propertyRows,result.clean);assert.equal(next.profiles[0].columns[2].target,'@ignore');
});
test('receipt metadata and decisions survive the canonical Excel round trip',async()=>{
 const {result}=prepare(propertyRows),restored=await readWorkbook(await writeWorkbook(result.clean));
 assert.deepEqual(restored.workspace.sourceRegistry,result.clean.workspace.sourceRegistry);assert.deepEqual(restored.properties,result.clean.properties);
});
test('completed receipt uses escaped captions, collapsed successes and no editable controls',()=>{
 const {result}=prepare([['FastighetsID','Fastighetsnamn'],['F1','Test']]);const source=result.data.sourceRegistry[0];source.receipt.columns[0].header='<img src=x onerror=alert(1)>';
 const html=importReceiptHtml(source,result.data);assert.match(html,/&lt;img/);assert(!html.includes('<img'));assert.match(html,/<details data-receipt-columns="used"><summary>/);assert(!/data-ignore-column|data-preview-map/.test(html));
});
