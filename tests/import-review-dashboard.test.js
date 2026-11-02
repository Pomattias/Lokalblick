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
 assert.match(html,/Nya poster att godkänna/);
 assert.match(html,/Kolumner att kontrollera/);
 assert.match(html,/Avvikelser att granska/);
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


test('175 repeated row problems become one cause, while each unresolved column is actionable once',()=>{
 const reviews=Array.from({length:175},(_,i)=>({
  source:prepared.fileName,sheet:'Lokallista',row:i+2,status:'pending',
  collection:'properties',field:'managementObjectNumber',
  reason:'Kontrollera fastighetsnummer',fieldRejected:true
 }));
 const m=importDashboardModel(prepared,profiles,candidate,rows,plan,{}, {reviews});
 assert.equal(m.unresolved,18);
 assert.equal(m.columnTasks.length,18);
 assert.equal(m.problems.length,1);
 assert.equal(m.problems[0].rowCount,175);
 const html=importDashboardHtml(prepared,profiles,candidate,rows,plan,{}, {reviews});
 assert.match(html,/1 problemtyper/);
 assert.match(html,/175 berörda källrader/);
 assert.equal((html.match(/data-import-choose-column=/g)||[]).length,18);
 assert.equal((html.match(/data-filter-import-rows="problem:/g)||[]).length,1);
});
test('one automatically mapped source column shows a single readable destination, not two register selectors',()=>{
 const selected=[{name:'Lokallista',columns:[
  {header:'FastighetsNr',target:'properties.managementObjectNumber',filled:568},
  {header:'Fastighetsbeteckning',target:'properties.designation',filled:568},
  {header:'Avtalsnummer',target:'contracts.id',filled:568},
  {header:'Hyresgäst',target:'contracts.tenantPartyId',filled:568},
  {header:'Fastighetsägare',target:'properties.ownerPartyId',filled:568},
  {header:'Förvaltare',target:'properties.ownerResponsiblePersonId',filled:568}
 ]}];
 const html=importDashboardHtml(prepared,selected,candidate,[],[],{},{
  schemas:[{key:'properties',sheet:'Fastighet',columns:[['managementObjectNumber','Fastighetsnummer'],['designation','Fastighetsnamn'],['ownerPartyId','Fastighetsägare'],['ownerResponsiblePersonId','Förvaltare']]},{key:'contracts',sheet:'Avtal',columns:[['id','Avtalsnummer'],['tenantPartyId','Hyresgäst']]}]
 });
 assert.match(html,/Fastighet → Fastighetsnummer/);
 assert.match(html,/Fastighet → Fastighetsbeteckning/);
 assert.match(html,/Avtal → Avtalsnummer/);
 assert.match(html,/Hyresgäst/);
 assert.match(html,/Förvaltare/);
 assert.doesNotMatch(html,/data-preview-table/);
 assert.doesNotMatch(html,/data-preview-map/);
});
