import test from 'node:test';
import assert from 'node:assert/strict';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
const schemas=[{key:'contracts',sheet:'Avtal',columns:[['number','Avtalsnummer'],['end','Giltigt t.o.m.']]}];
const prepared={fileName:'Test.xlsx'};
const mapping={profiles:[{name:'Lokallista',rowCount:154,columns:[{header:'Avtalsnr',target:'contracts.number',identity:true,examples:['A-1'],filled:154},{header:'t.o.m.',target:'contracts.end',examples:['2027-12-31'],filled:154}]}]};
test('preview shows one mapping per column rather than one selector per source record',()=>{
 const result={data:{importReview:[]},report:{counts:{unresolved:154},decisions:Array.from({length:154},(_,i)=>({sheet:'Lokallista',row:i+2,collection:'contracts',classification:'B',reason:'Hemvist saknas'})),changes:[]}};
 const html=columnPreviewHtml(prepared,mapping,result,schemas);
 assert.equal((html.match(/data-preview-map=/g)||[]).length,2);
 assert.equal((html.match(/Hemvist saknas/g)||[]).length,1);
 assert.ok(!html.includes('data-match'));assert.ok(!html.includes('Lokallista rad 2'));
 assert.ok(html.includes('Giltigt t.o.m.'));assert.ok(html.includes('154'));
});
test('field conflicts aggregate beside their column with one reusable source rule',()=>{
 const result={data:{importReview:Array.from({length:50},()=>({source:'Test.xlsx',sheet:'Lokallista',collection:'contracts',field:'end',status:'pending'}))},report:{counts:{conflicts:50},changes:[{collection:'contracts',field:'end',provenance:{sheet:'Lokallista'}}]}};
 const html=columnPreviewHtml(prepared,mapping,result,schemas,{'contracts|end|test.xlsx':'accept'});
 assert.ok(html.includes('1 fältändringar · 50 avvikelser'));
 assert.ok(html.includes('Använd denna källa vid avvikelse'));assert.ok(html.includes('Sparad kolumnregel'));
});
test('column examples and file names are safely escaped',()=>{
 const unsafe=structuredClone(mapping);unsafe.profiles[0].columns[0].examples=['<script>alert(1)</script>'];
 const html=columnPreviewHtml(prepared,unsafe,{data:{},report:{}},schemas);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});

test('sheet preview places headers above three aligned rows and column-wide choices',()=>{
 const aligned=structuredClone(mapping);aligned.profiles[0].headerRow=4;
 aligned.profiles[0].columns[0].samples=['A-1','A-2','A-3'];
 aligned.profiles[0].columns[1].samples=['2027-12-31','','2029-12-31'];
 const html=columnPreviewHtml(prepared,aligned,{data:{},report:{}},schemas);
 assert.equal((html.match(/data-sample-row/g)||[]).length,3);
 assert.ok(html.includes('Rad 5'));assert.ok(html.includes('Rad 7'));
 assert.ok(html.includes('<td>A-2</td><td></td>'));
 assert.ok(html.includes('Gäller hela kolumnen'));
 assert.ok(html.indexOf('Avtalsnr')<html.indexOf('Rad 5'));
});
