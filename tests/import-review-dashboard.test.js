import test from 'node:test';
import assert from 'node:assert/strict';
import {importDashboardModel,importDashboardHtml} from '../frontend/v2/import-review-dashboard.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';

const prepared={fileName:'Masterdata_Lokal_fargmarkerad.xlsx'};
const profiles=[{name:'Lokallista',fileName:prepared.fileName,rowCount:568,columns:Array.from({length:40},(_,i)=>({
 index:i,header:'Kolumn '+i,target:i<18?'@unmapped':'@ignore',
 filled:568,samples:['Värde'],selectionTable:'contracts'
}))}];
const rows=Array.from({length:568},(_,i)=>({
 key:'source-'+i,source:prepared.fileName,sheet:'Lokallista',row:i+2,status:'pending',
 reviews:[],held:[],nodes:[],reasons:[],columns:i<175?[{needsMapping:true,header:'Fastighetsnummer'}]:[]
}));
const candidate={data:{importReview:[]},report:{rows:568,linkProposals:[],blocking:0,tables:[]}};
const plan=Array.from({length:691},(_,i)=>({key:'new-'+i,table:'agreements'}));

test('large real-world shaped v2 import has a concise decision overview before its source table',()=>{
 const model=importDashboardModel(prepared,profiles,candidate,rows,plan,{});
 assert.deepEqual([model.columns,model.unresolved,model.rows,model.pendingCreation,model.attention],
  [40,18,568,691,175]);
 const html=importDashboardHtml(prepared,profiles,candidate,rows,plan,{});
 assert.match(html,/Granska bara det som behöver ett beslut/);
 assert.match(html,/Nya poster att ta ställning till/);
 assert.match(html,/Kolumner att kontrollera/);
 assert.match(html,/Rader som behöver kontrolleras/);
 assert.match(html,/data-import-review-action="columns"/);
 assert.match(html,/data-import-review-action="new"/);
 assert.match(html,/data-import-review-action="issues"/);
 assert.equal((html.match(/data-import-open-source-row=/g)||[]).length,5);
 assert.ok(!html.includes('<script>'));
});

test('v2 review folds wide spreadsheet behind explicit technical detail, preserving all manual column fields and final approval',()=>{
 const schemas=[{key:'contracts',sheet:'Avtal',columns:[['number','Avtalsnummer']]}];
 const html=columnPreviewHtml(prepared,{profiles},candidate,schemas,{},{explanation:{rows,records:[],counts:{}},plan});
 assert.match(html,/<details class="import-detailed-table" data-import-detailed-table\s*>/);
 assert.ok(html.indexOf('data-import-dashboard')<html.indexOf('data-import-detailed-table'));
 assert.equal((html.match(/data-preview-map=/g)||[]).length,40);
 assert.match(html,/data-apply class="primary-action" disabled/);
});

test('short or narrow import keeps the source editor visible by default for quick corrections',()=>{
 const narrow={profiles:[{name:'Lokallista',rowCount:2,columns:[{index:0,header:'Avtal',target:'contracts.number',samples:['A-1']}]}]};
 const html=columnPreviewHtml(prepared,narrow,{data:{},report:{}},
  [{key:'contracts',sheet:'Avtal',columns:[['number','Avtalsnummer']]}]);
 assert.match(html,/<details class="import-detailed-table" data-import-detailed-table open>/);
 assert.match(html,/data-preview-map="0:0"/);
});

test('review-only projection never marks any new entity as approved',()=>{
 const choices={};
 const before=structuredClone({plan,choices,profiles});
 importDashboardModel(prepared,profiles,candidate,rows,plan,choices);
 importDashboardHtml(prepared,profiles,candidate,rows,plan,choices);
 assert.deepEqual({plan,choices,profiles},before);
});
