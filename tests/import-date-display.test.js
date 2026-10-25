import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {importCellKey} from '../frontend/lokaler/import-cell-edits.js';
import {emptyData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {importSourceValue,importDateColumn,importCellProblem,importRowAttention} from '../frontend/v2/import-row-review.js';
import {importTableHtml} from '../frontend/v2/import-table.js';

function display(cell,column={index:0,target:'contracts.end',dateMode:'auto'},extra={}){
 const workbook={Sheets:{Underlag:{A2:cell}},Workbook:{WBProps:{date1904:false}}},prepared={workbook,XLSX,...extra},profile={name:'Underlag',columns:[column]},row={source:'syntetiskt.xlsx',row:2};
 return {value:importSourceValue(prepared,profile,row,column),workbook,profile,row,column};
}
test('native Excel dates use Swedish ISO display rather than the cached American cell text',()=>{
 const cell={t:'n',v:46753,w:'1/1/28',z:'m/d/yy'},before=JSON.stringify(cell);
 assert.equal(display(cell).value,'2028-01-01');assert.equal(JSON.stringify(cell),before);
 const d=new Date('2027-10-31T00:00:00Z');assert.equal(display({t:'d',v:d,w:'10/31/27'}).value,'2027-10-31');
 assert.equal(display({t:'s',v:'31/10/2027'}).value,'2027-10-31');
});
test('excluded date columns retain Swedish date display and the original date-system interpretation',()=>{
 const c={index:0,target:'@ignore',excludedTarget:'contracts.start',date1904:true,dateMode:'auto'};
 assert.equal(display({t:'n',v:45291,w:'1/1/28',z:'m/d/yy'},c).value,'2028-01-01');
 assert.equal(display({t:'s',v:'45291'}, {...c,dateMode:'excel-1904'}).value,'2028-01-01');
 assert.equal(display({t:'n',v:46753,w:'1/1/28'},{index:0,target:'@unmapped',format:{type:'date'}}).value,'2028-01-01');
});
test('manual date corrections render in Swedish standard without mutating the source or draft value',()=>{
 const c={index:0,target:'contracts.end'},f=display({t:'s',v:'Se avtal'},c),key=importCellKey(f.profile,2,c,f.row.source),cellEdits={[key]:{value:'31/10/2027'}};
 assert.equal(importSourceValue({workbook:f.workbook,XLSX,cellEdits},f.profile,f.row,c),'2027-10-31');assert.equal(cellEdits[key].value,'31/10/2027');assert.equal(f.workbook.Sheets.Underlag.A2.v,'Se avtal');
});
test('identity fields stay as identifiers and unresolved or two-digit-year text is never guessed',()=>{
 for(const field of ['id','number','sourceId','phone','email','costCenter']){
  const c={index:0,target:'contracts.'+field,format:{type:'date'}};assert.equal(importDateColumn(c),false);assert.equal(display({t:'s',v:'20270101'},c).value,'20270101');
 }
 for(const raw of ['01/02/27','Se avtal','31/02/2027'])assert.equal(display({t:'s',v:raw}).value,raw);
 assert.equal(display({t:'n',v:46753,w:'1/1/28'},{index:0,target:'contracts.notice'}).value,'2028-01-01');
});
test('invalid dates identify the exact source field and expose its error beside the editable cell',()=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['FastighetsID','ObjektID','Avtalsnummer','Säg upp avtal senast'],['P1','O1','A1','Se avtal <script>']]),'Underlag');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true}),base=emptyData(),r=prepareCleanImport(workbook,profiles,base,{fileName:'syntetiskt.xlsx'},XLSX),story=explainImport(r,base,{profiles}),row=story.rows[0],date=profiles[0].columns[3];
 assert.match(importRowAttention(row).reason,/Säg upp avtal senast: Datum kan inte tolkas/);assert.match(importCellProblem(row,date),/ÅÅÅÅ-MM-DD/);
 const html=importTableHtml({workbook,XLSX,fileName:'syntetiskt.xlsx'},profiles,r,base,{openRows:new Set([row.key])});
 assert.equal((html.match(/ data-cell-problem/g)||[]).length,1);assert.match(html,/aria-invalid="true" aria-describedby="import-cell-error-0-2-3"/);assert.match(html,/id="import-cell-error-0-2-3"/);assert.match(html,/placeholder="ÅÅÅÅ-MM-DD"/);assert.match(html,/Se avtal &lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('a column-mapping problem names the column, separately from a date error on the same row',()=>{
 const row={status:'pending',rejected:false,nodes:[],held:[],columns:[{index:0,header:'Källans kommentar',needsMapping:true}],reviews:[{columnIndex:1,column:'Slutdatum',fieldRejected:true,reason:'Ogiltigt eller tvetydigt datum'}]};
 const attention=importRowAttention(row);assert.equal(attention.primary,'columns');assert.equal(attention.reason,'Källans kommentar: välj kolumn eller Importera ej.');
});
test('differing saved scalar values and excluded columns are not marked as invalid input cells',()=>{
 const row={reviews:[{collection:'contracts',field:'end',columnIndex:0,reason:'Olika värden för Hyrestid t.o.m.'}]},c={index:0,target:'contracts.end'};
 assert.equal(importCellProblem(row,c),null);row.reviews[0].fieldRejected=true;assert.equal(importCellProblem(row,{...c,target:'@ignore'}),null);
});
