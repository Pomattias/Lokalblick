import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {approveImportPlan} from '../frontend/lokaler/import-plan.js';
import {importTableHtml} from '../frontend/v2/import-table.js';
import {matchingImportRows,importRowAttention,importColumnWarning,importLinkChoiceHtml} from '../frontend/v2/import-row-review.js';

function fixture(){
 const base=emptyData();
 for(let i=1;i<=22;i++)base.properties.push(normalize('properties',{id:'P'+i,name:'TESTET '+i,address:'Testgatan '+i}));
 const input=[['FastighetsID','Gatuadress','ObjektID','Avtalsnummer','Area','Säg upp senast','Populärnamn'],
  ...Array.from({length:133},(_,i)=>['P1','Testgatan 1','O'+i,'KNOWN-'+i,100,i===0?'not a date':'']),
  ...Array.from({length:21},(_,i)=>['','Testgatan '+(i+2),'','','','','WAIT-'+String(i+1).padStart(3,'0')])];
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(input),'Underlag');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true}),prepared={workbook,XLSX,fileName:'syntetiskt.xlsx'};
 const run=(rowMatches={})=>prepareCleanImport(workbook,profiles,base,{fileName:prepared.fileName,rowMatches},XLSX);
 return {base,profiles,prepared,run};
}

test('all 154 source rows are retained and the 21 unresolved links are a filter in the same table',()=>{
 const {base,profiles,prepared,run}=fixture(),result=run(),story=explainImport(result,base,{profiles});
 assert.equal(result.report.blocking,21);assert.equal(story.rows.length,154);
 const rows=matchingImportRows(prepared,profiles,result,story.rows,{filter:'attention:link'});
 assert.equal(rows.length,21);assert(rows.every(row=>row.row>=135));assert(rows.every(row=>row.attention.caption==='Behöver kopplas'));
 const html=importTableHtml(prepared,profiles,result,base,{filter:'attention:link'});
 assert.equal((html.match(/data-import-source-row=/g)||[]).length,21);assert.equal((html.match(/data-link-proposal=/g)||[]).length,21);
 assert.equal((html.match(/data-link-use=/g)||[]).length,21);assert.doesNotMatch(html,/<section class="import-link-proposals"|data-import-link-suggestions/);
 assert.doesNotMatch(html,/Samtliga källrader finns i tabellen/);assert.match(html,/Behöver kopplas \(21\)/);
});

test('a filtered search resolves exactly one link and does not approve other source rows',()=>{
 const {base,profiles,prepared,run}=fixture(),result=run(),story=explainImport(result,base,{profiles});
 const selected=matchingImportRows(prepared,profiles,result,story.rows,{filter:'attention:link',query:'WAIT-021'});
 assert.equal(selected.length,1);const proposal=selected[0].proposal;
 const approved=run({[proposal.matchingKey]:{propertyId:proposal.matches[0].id,signature:proposal.signature}}),next=explainImport(approved,base,{profiles});
 assert.equal(approved.report.blocking,20);assert.equal(next.rows.length,154);
 assert.equal(matchingImportRows(prepared,profiles,approved,next.rows,{filter:'attention:link'}).length,20);
 assert.equal(approved.clean.properties.length,base.properties.length);
});

test('new-record approval is explained separately from missing or rejected data',()=>{
 const {base,profiles,prepared,run}=fixture(),result=run(),story=explainImport(result,base,{profiles});
 const waiting=story.rows.find(row=>row.row===3),attention=importRowAttention(waiting);
 assert.equal(attention.create,true);assert.equal(attention.link,false);assert.equal(attention.complete,false);assert.equal(attention.blocked,false);
 assert.equal(attention.caption,'Nya poster att godkänna');
 const partial=matchingImportRows(prepared,profiles,result,story.rows,{filter:'attention:complete'});
 assert.equal(partial.length,1);assert.equal(partial[0].row,2);assert.match(partial[0].attention.reason,/datum/);
});

test('the actual field error stays visible before its new agreement has been approved',()=>{
 const {base,profiles,prepared,run}=fixture(),result=run(),approved=approveImportPlan(result,base),story=explainImport(result,base,{approved,profiles});
 const rows=matchingImportRows(prepared,profiles,result,story.rows,{filter:'attention:complete'});
 assert.equal(rows.length,1);assert.equal(rows[0].row,2);assert.match(rows[0].attention.reason,/datum/);assert(rows[0].reasons.some(reason=>/datum/.test(reason)));
 assert.equal(approved.clean.agreements.length,0,'Explanations never bypass creation approval');
});

test('optional missing designations are marked for completion even when other facts can be imported',()=>{
 const row={status:'created',columns:[],reviews:[],nodes:[{table:'properties',identified:true,record:{name:'Testvägen 1',address:'Testvägen 1'},status:'created'}]};
 const attention=importRowAttention(row);assert.equal(attention.complete,true);assert.equal(attention.caption,'Behöver kompletteras');assert.equal(attention.blocked,false);
 assert.match(attention.reason,/efter importen/);
 const html=importLinkChoiceHtml({matches:[{id:'P',label:'Testvägen 1',detail:'Adress: Testvägen 1'}],row:2},0,{address:'Testvägen 1'});
 assert.match(html,/Fastighetsbeteckning saknas/);assert.doesNotMatch(html,/<strong>Testvägen/);
});

test('ambiguous candidates require one selection and never offer a bulk-approved checkbox',()=>{
 const proposal={matches:[{id:'A',label:'EKEN 1'},{id:'B',label:'EKEN 2'}],records:[],row:2},html=importLinkChoiceHtml(proposal,0);
 assert.match(html,/data-link-use="0"/);assert.doesNotMatch(html,/data-approve-link=/);assert.match(html,/Kontrollera kopplingen från numren/);
 const row={status:'pending',columns:[],reviews:[],nodes:[],rejected:true};
 assert.equal(importRowAttention(row,proposal).caption,'Behöver kopplas');
});

test('the inline choice escapes candidate labels, addresses and record identifiers',()=>{
 const html=importLinkChoiceHtml({matches:[{id:'<id>',label:'<script>bad</script>',detail:'<img>'}],records:[{label:'Avtal',value:'<id>'}],row:2},3);
 assert.doesNotMatch(html,/<script>|<img>|<id>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/data-link-use="3"/);
});

test('numeric values in a designation column produce advice without silently changing the mapping',()=>{
 const column={target:'properties.designation',samples:['TESTET 2','001234','009999']};
 assert.match(importColumnWarning(column),/kostnadsställe/);assert.equal(column.target,'properties.designation');
 assert.equal(importColumnWarning({...column,target:'contracts.costCenter'}),'');
 assert.equal(importColumnWarning({...column,samples:['EKEN 1','ASPEN 2']}),'');
});

test('expanded details are followed by source headers without repeating mapping controls or pending badges',()=>{
 const {base,profiles,prepared,run}=fixture(),result=run(),story=explainImport(result,base,{profiles}),html=importTableHtml(prepared,profiles,result,base,{openRows:new Set([story.rows[0].key])});
 assert.equal((html.match(/class="import-repeated-headers"/g)||[]).length,1);assert.match(html,/Nytt objekt/);assert.match(html,/Nytt avtal/);assert.doesNotMatch(html,/Ny objekt\b|Ny avtal\b|Behöver ditt val|Behöver åtgärd|Identifierade förslag väntar/);assert.doesNotMatch(html,/data-preview-map/);
});
