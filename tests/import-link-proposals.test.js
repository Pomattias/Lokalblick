import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileTables} from '../frontend/services/import-matching.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {readWorkbook,writeWorkbook} from '../backend/lokaler/workbook.js';

function fixture(){const data=emptyData();data.properties.push(normalize('properties',{id:'F1',name:'TESTET 1',address:'Testgatan 1A'}),normalize('properties',{id:'F2',name:'TESTET 2',address:'Andragatan 2'}));data.workspace.budgetPlans=[{id:'locked',year:2027,locked:true,snapshot:{amount:12345}}];return data;}
function source(rows,headers=['Adress','ObjektID','Avtalsnummer','From'],name='Avtal'){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),name);
 return {workbook,profiles:profileTables(workbook,importSchemas,XLSX)};
}
const run=(src,base=fixture(),rowMatches={})=>prepareCleanImport(src.workbook,src.profiles,base,{fileName:'syntetiska-kopplingar.xlsx',rowMatches},XLSX);
const choice=(proposal,id=proposal.matches[0].id)=>({[proposal.matchingKey]:{propertyId:id,signature:proposal.signature}});

test('unique addresses propose property/object/agreement links without creating or changing records before approval',()=>{
 const src=source([['Testgatan 1 A','O1','A1','Se avtal']]),base=fixture(),before=structuredClone(base),pending=run(src,base);
 assert.equal(pending.report.blocking,1);assert.equal(pending.clean.objects.length,0);assert.equal(pending.clean.agreements.length,0);assert.deepEqual(base,before);
 const proposal=pending.report.linkProposals[0];assert.equal(proposal.approved,false);assert.equal(proposal.matches[0].id,'F1');assert.deepEqual(proposal.records,[{label:'Objekt',value:'O1'},{label:'Avtal',value:'A1'}]);
 const accepted=run(src,base,choice(proposal));assert.equal(accepted.report.blocking,0);assert.equal(accepted.clean.objects[0].property_id,'F1');assert.equal(accepted.clean.agreements[0].object_id,'O1');assert.equal(accepted.clean.agreements[0].valid_from,null);
 assert(accepted.clean.workspace.importReview.some(row=>row.fieldRejected));assert.equal(accepted.report.linkProposals[0].approved,true);
 assert(accepted.clean.workspace.auditLog.some(row=>row.fields.some(field=>field.provenance?.matchingDecision?.method==='explicit-row-choice')));assert.deepEqual(accepted.clean.workspace.budgetPlans,base.workspace.budgetPlans);validateData(accepted.clean);
 const repeat=run(src,accepted.clean);assert.equal(repeat.report.linkProposals.length,0);assert.equal(repeat.clean.objects.length,1);assert.equal(repeat.clean.agreements.length,1);
});
test('approving one source row never approves another row or ambiguous candidate automatically',()=>{
 const src=source([['Testgatan 1A','O1','A1'],['Andragatan 2','O2','A2']]),pending=run(src),accepted=run(src,fixture(),choice(pending.report.linkProposals[0]));
 assert.equal(accepted.report.blocking,1);assert.deepEqual(accepted.clean.objects.map(row=>row.id),['O1']);assert.equal(accepted.report.linkProposals.filter(row=>row.approved).length,1);
 const base=fixture();base.properties[1].address='Testgatan 1A';const ambiguous=run(source([['Testgatan 1A','O1','A1']]),base);assert.equal(ambiguous.report.linkProposals[0].matches.length,2);
 const chosen=run(source([['Testgatan 1A','O1','A1']]),base,choice(ambiguous.report.linkProposals[0],'F2'));assert.equal(chosen.clean.objects[0].property_id,'F2');
});
test('approvals are bound to source contents, mapped targets and current candidates',()=>{
 const src=source([['Testgatan 1A','O1','A1']]),pending=run(src),approval=choice(pending.report.linkProposals[0]);
 const changed=source([['Andragatan 2','O1','A1']]);assert.equal(run(changed,fixture(),approval).clean.objects.length,0);
 const reordered=source([['Andragatan 2','O2','A2'],['Testgatan 1A','O1','A1']]);assert.equal(run(reordered,fixture(),approval).clean.objects.length,0);
 const renamed=fixture();renamed.properties[0].name='Ny fastighetsbeteckning';assert.equal(run(src,renamed,approval).clean.objects.length,0);
 const forged=choice(pending.report.linkProposals[0],'unknown');assert.equal(run(src,fixture(),forged).clean.objects.length,0);
 const retargeted=structuredClone(src);retargeted.profiles[0].columns[0].target='properties.designation';const named=fixture();named.properties[0].name='Testgatan 1A';assert.equal(run(retargeted,named,approval).clean.objects.length,0);
});
test('explicit IDs use the existing relationships and cannot be moved by an address approval',()=>{
 const base=fixture();base.objects.push(normalize('objects',{id:'O1',property_id:'F1'}));base.agreements.push(normalize('agreements',{id:'A1',object_id:'O1'}));
 const id=run(source([['F1','O2','A2']],['FastighetsID','ObjektID','Avtalsnummer']),base);assert.equal(id.report.linkProposals.length,0);assert.equal(id.clean.objects[1].property_id,'F1');
 const linked=run(source([['Testgatan 1A','O1','A1']]),base);assert.equal(linked.report.linkProposals.length,0);
 const conflict=run(source([['Andragatan 2','O1','A1']]),base);assert.equal(conflict.report.blocking,1);assert.equal(conflict.report.linkProposals.length,0);assert.equal(conflict.clean.objects[0].property_id,'F1');
});
test('issue address proposals require approval, never infer an object and preserve saved homes on reimport',()=>{
 const base=fixture();base.objects.push(normalize('objects',{id:'O1',property_id:'F1'}));const src=source([['Kontroll','Testgatan 1A']],['Ärendenamn','Adress'],'Ärenden'),pending=run(src,base);assert.equal(pending.clean.issues.length,0);
 const approved=run(src,base,choice(pending.report.linkProposals[0]));assert.equal(approved.clean.issues[0].property_id,'F1');assert.equal(approved.clean.issues[0].object_id,null);
 const repeat=run(src,approved.clean);assert.equal(repeat.clean.issues[0].id,approved.clean.issues[0].id);assert.equal(repeat.clean.issues[0].property_id,'F1');assert.equal(repeat.report.linkProposals.length,0);
 approved.clean.issues[0].object_id='O1';approved.clean.issues[0].property_id=null;const manual=run(src,approved.clean);assert.equal(manual.clean.issues[0].object_id,'O1');assert.equal(manual.report.linkProposals.length,0);
 const unlinked=run(source([['Okänd koppling','Okänd gata']],['Ärendenamn','Adress'],'Ärenden'),base);assert.equal(unlinked.clean.issues.length,1);assert.equal(unlinked.clean.issues[0].property_id,null);
});
test('approved IDs and their provenance survive Excel roundtrip without another relation table',async()=>{
 const src=source([['Testgatan 1A','O1','A1']]),pending=run(src),approved=run(src,fixture(),choice(pending.report.linkProposals[0])),restored=await readWorkbook(await writeWorkbook(approved.clean));
 assert.deepEqual(restored,JSON.parse(JSON.stringify(approved.clean)));assert.equal(run(src,restored).report.linkProposals.length,0);assert(!Object.hasOwn(restored.workspace,'importRowMatches'));
});
test('the compact list shows properties and linked records, escapes content and keeps ambiguous proposals out of bulk approval',()=>{
 const base=fixture();base.properties[1].address='Testgatan 1A';base.properties[0].name='<Test & hus>';
 const src=source([['Testgatan 1A','O1','A1']]),pending=run(src,base),html=columnPreviewHtml({fileName:'syntetiska-kopplingar.xlsx'},{profiles:src.profiles},pending,importSchemas);
 assert.match(html,/data-import-link-proposals/);assert.match(html,/&lt;Test &amp; hus&gt;/);assert.match(html,/Objekt O1 · Avtal A1/);assert.match(html,/data-link-property/);assert.doesNotMatch(html,/data-approve-link-proposals/);assert.doesNotMatch(html,/data-row-match/);assert.doesNotMatch(html,/data-import-errors/);assert.match(html,/type="checkbox" data-approve-link="0"  disabled/);
});
