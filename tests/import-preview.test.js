import test from 'node:test';
import assert from 'node:assert/strict';
import {columnPreviewHtml,reviewProfiles,importColumnSettingsHtml} from '../frontend/v2/import-mapping.js';
const schemas=[{key:'contracts',sheet:'Avtal',columns:[['number','Avtalsnummer'],['end','Giltigt t.o.m.']]}];
const prepared={fileName:'Test.xlsx'};
const mapping={profiles:[{name:'Lokallista',rowCount:154,columns:[{header:'Avtalsnr',target:'contracts.number',identity:true,examples:['A-1'],filled:154},{header:'t.o.m.',target:'contracts.end',examples:['2027-12-31'],filled:154}]}]};
test('one vertical row per column offers a direct field picker and an independent exclusion',()=>{
 const result={data:{importReview:Array.from({length:154},(_,i)=>({id:'r'+i,status:'pending',source:'Test.xlsx',sheet:'Lokallista',row:i+2,collection:'contracts',rowRejected:true,reason:'Hemvist saknas'}))},report:{changes:[]}};
 const html=columnPreviewHtml(prepared,mapping,result,schemas);
 assert.equal((html.match(/data-preview-map=/g)||[]).length,2);
 assert.equal((html.match(/data-ignore-column=/g)||[]).length,2);
 assert.equal((html.match(/<td>Hemvist saknas<\/td>/g)||[]).length,1);
 assert.ok(html.includes('>Avtal</option>'));assert.ok(html.includes('>Avtalsnummer</option>'));
 assert.ok(!html.includes('data-preview-collection'));assert.ok(!html.includes('sheet-preview'));assert.ok(!html.includes('Kompletterande information'));
 assert.ok(!html.includes('Används för att identifiera och koppla poster.'));assert.ok(!html.includes('data-column-settings'));assert.ok(!html.includes('data-date-mode'));
 assert.ok(importColumnSettingsHtml(prepared,mapping,result,schemas).includes('Används för att identifiera och koppla poster.'));
});
test('field conflicts aggregate beside their column with one reusable source rule',()=>{
 const result={data:{importReview:Array.from({length:50},()=>({source:'Test.xlsx',sheet:'Lokallista',collection:'contracts',field:'end',status:'pending'}))},report:{changes:[{collection:'contracts',field:'end',provenance:{sheet:'Lokallista'}}]}};
 const html=importColumnSettingsHtml(prepared,mapping,result,schemas,{'contracts|end|test.xlsx':'accept'},{},0,1);
 assert.ok(html.includes('1 fältändringar · 50 avvikelser'));
 assert.ok(html.includes('Använd denna källa vid avvikelse'));assert.ok(html.includes('Sparad kolumnregel'));
});
test('column examples and source labels are escaped, including expanded examples',()=>{
 const unsafe=structuredClone(mapping);unsafe.profiles[0].columns[0].examples=['<script>alert(1)</script>'];
 const html=importColumnSettingsHtml(prepared,unsafe,{data:{},report:{}},schemas);
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
});
test('unknown and formerly supplemental columns require an explicit decision before apply',()=>{
 const profiles=structuredClone(mapping.profiles);profiles[0].columns.push({header:'Extra',target:'@extra',examples:['Behöver bedömas']});
 const reviewed=reviewProfiles(profiles,schemas);assert.equal(reviewed[0].columns[2].target,'@unmapped');assert.equal(profiles[0].columns[2].target,'@extra');
 let html=columnPreviewHtml(prepared,{profiles:reviewed},{data:{},report:{}},schemas);
 assert.ok(html.includes('data-ignore-unmapped'));assert.ok(html.includes('data-apply class="primary-action" disabled'));
 reviewed[0].columns[2].target='@ignore';html=columnPreviewHtml(prepared,{profiles:reviewed},{data:{},report:{}},schemas);
 assert.ok(!html.includes('data-apply class="primary-action" disabled'));assert.ok(html.includes('data-ignore-column="0:2" checked'));
});
test('saved targets removed from the database return to pending and all-excluded input cannot apply',()=>{
 const profiles=reviewProfiles([{name:'Test',columns:[{header:'Gammalt',target:'contracts.removed'},{header:'Bortvald',target:'@ignore'}]}],schemas);
 assert.deepEqual(profiles[0].columns.map(column=>column.target),['@unmapped','@ignore']);
 profiles[0].columns[0].target='@ignore';
 assert.ok(columnPreviewHtml(prepared,{profiles},{data:{},report:{}},schemas).includes('data-apply class="primary-action" disabled'));
});
test('expanded examples retain actual source row numbers and empty cells',()=>{
 const aligned=structuredClone(mapping);aligned.profiles[0].headerRow=4;aligned.profiles[0].columns[1].samples=['2027-12-31','','2029-12-31'];
 const html=importColumnSettingsHtml(prepared,aligned,{data:{},report:{}},schemas,{}, {},0,1);
 assert.ok(html.includes('Rad 5: 2027-12-31'));assert.ok(html.includes('Rad 6: Tomt'));assert.ok(html.includes('Rad 7: 2029-12-31'));
});

test('table and field are separate controls and exclusion is one checkbox per source column',()=>{
 const html=columnPreviewHtml(prepared,mapping,{data:{},report:{}},schemas);
 assert.equal((html.match(/<select data-preview-table=/g)||[]).length,2);
 assert.equal((html.match(/<select class="import-target" data-preview-map=/g)||[]).length,2);
 assert.equal((html.match(/type="checkbox" data-ignore-column=/g)||[]).length,2);
 assert.doesNotMatch(html,/data-ignore-column[^>]*>Importera inte|Avtal → Avtalsnummer/);
});
