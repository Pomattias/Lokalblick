import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileTables} from '../frontend/services/import-matching.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {readWorkbook,writeWorkbook} from '../backend/lokaler/workbook.js';
function fixture(){const data=emptyData();data.properties.push(normalize('properties',{id:'F1',name:'TESTET 1',address:'Testgatan 1A'}),normalize('properties',{id:'F2',name:'TESTET 2',address:'Andragatan 2'}));data.workspace.budgetPlans=[{id:'locked',year:2027,locked:true,snapshot:{amount:12345}}];return data;}
function source(rows,headers=['Adress','Populärnamn'],name='Fastigheter'){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),name);return {workbook,profiles:profileTables(workbook,importSchemas,XLSX)};}
const run=(src,base=fixture(),rowMatches={})=>prepareCleanImport(src.workbook,src.profiles,base,{fileName:'syntetiska-kopplingar.xlsx',rowMatches},XLSX);
const choice=(proposal,id=proposal.matches[0].id)=>({[proposal.matchingKey]:{propertyId:id,signature:proposal.signature}});
test('keyless address enrichment proposes only saved properties and requires one explicit approval',()=>{
 const src=source([['Testgatan 1 A','Nytt namn']]),base=fixture(),before=structuredClone(base),pending=run(src,base);
 assert.equal(pending.report.blocking,1);assert.deepEqual(base,before);const p=pending.report.linkProposals[0];assert.equal(p.approved,false);assert.equal(p.matches[0].id,'F1');assert.deepEqual(p.records,[]);
 const accepted=run(src,base,choice(p));assert.equal(accepted.report.blocking,0);assert.equal(accepted.clean.properties[0].popular_name,'Nytt namn');assert.equal(accepted.clean.objects.length,0);assert.equal(accepted.clean.agreements.length,0);assert.equal(accepted.clean.properties.length,2);assert.deepEqual(accepted.clean.workspace.budgetPlans,base.workspace.budgetPlans);validateData(accepted.clean);
});
test('approving one keyless source row never approves another or chooses an ambiguous property',()=>{
 const src=source([['Testgatan 1A','Första'],['Andragatan 2','Andra']]),pending=run(src),accepted=run(src,fixture(),choice(pending.report.linkProposals[0]));assert.equal(accepted.report.blocking,1);assert.equal(accepted.clean.properties[0].popular_name,'Första');assert.equal(accepted.clean.properties[1].popular_name,null);
 const base=fixture();base.properties[1].address='Testgatan 1A';const s=source([['Testgatan 1A','Valt namn']]),ambiguous=run(s,base);assert.equal(ambiguous.report.linkProposals[0].matches.length,2);const chosen=run(s,base,choice(ambiguous.report.linkProposals[0],'F2'));assert.equal(chosen.clean.properties[1].popular_name,'Valt namn');
});
test('address approvals are bound to source contents, mapping and current candidates',()=>{
 const src=source([['Testgatan 1A','Namn']]),pending=run(src),approval=choice(pending.report.linkProposals[0]);
 assert.equal(run(source([['Andragatan 2','Namn']]),fixture(),approval).report.blocking,1);assert.equal(run(source([['Andragatan 2','Annat'],['Testgatan 1A','Namn']]),fixture(),approval).report.blocking,2);
 const renamed=fixture();renamed.properties[0].name='Ny beteckning';assert.equal(run(src,renamed,approval).report.blocking,1);assert.equal(run(src,fixture(),choice(pending.report.linkProposals[0],'unknown')).report.blocking,1);
 const retargeted=structuredClone(src);retargeted.profiles[0].columns[0].target='properties.designation';const named=fixture();named.properties[0].name='Testgatan 1A';assert.equal(run(retargeted,named,approval).report.blocking,1);
});
test('explicit IDs keep saved relationships while address differences remain field reviews',()=>{
 const base=fixture();base.objects.push(normalize('objects',{id:'O1',property_id:'F1'}));base.agreements.push(normalize('agreements',{id:'A1',object_id:'O1'}));
 const id=run(source([['F1','O2','A2']],['FastighetsID','ObjektID','Avtalsnummer']),base);assert.equal(id.report.linkProposals.length,0);assert.equal(id.clean.objects[1].property_id,'F1');
 const conflict=run(source([['Andragatan 2','O1','A1']],['Adress','ObjektID','Avtalsnummer']),base);assert.equal(conflict.report.blocking,0);assert.equal(conflict.report.linkProposals.length,0);assert.equal(conflict.clean.objects[0].property_id,'F1');assert.equal(conflict.clean.properties[0].address,'Testgatan 1A');assert(conflict.data.importReview.some(r=>r.field==='address'));
});
test('keyless issue address enrichment requires approval and preserves saved homes on reimport',()=>{
 const base=fixture();base.objects.push(normalize('objects',{id:'O1',property_id:'F1'}));const src=source([['Kontroll','Testgatan 1A']],['Ärendenamn','Adress'],'Ärenden'),pending=run(src,base);assert.equal(pending.clean.issues.length,0);
 const approved=run(src,base,choice(pending.report.linkProposals[0]));assert.equal(approved.clean.issues[0].property_id,'F1');assert.equal(approved.clean.issues[0].object_id,null);const repeat=run(src,approved.clean);assert.equal(repeat.clean.issues[0].id,approved.clean.issues[0].id);assert.equal(repeat.report.linkProposals.length,0);
 approved.clean.issues[0].object_id='O1';approved.clean.issues[0].property_id=null;assert.equal(run(src,approved.clean).clean.issues[0].object_id,'O1');
});
test('approved identities and provenance survive Excel without a second relation register',async()=>{
 const src=source([['Testgatan 1A','Namn']]),p=run(src).report.linkProposals[0],approved=run(src,fixture(),choice(p)),restored=await readWorkbook(await writeWorkbook(approved.clean));assert.deepEqual(restored,JSON.parse(JSON.stringify(approved.clean)));assert(restored.workspace.auditLog.some(r=>r.fields.some(f=>f.provenance?.matchingDecision?.method==='explicit-row-choice')));assert(!Object.hasOwn(restored.workspace,'importRowMatches'));
});
test('ambiguous keyless choices are inline, escaped and have no duplicate approval checkbox',()=>{
 const base=fixture();base.properties[1].address='Testgatan 1A';base.properties[0].name='<Test & hus>';const src=source([['Testgatan 1A','Namn']]),pending=run(src,base),html=columnPreviewHtml({fileName:'syntetiska-kopplingar.xlsx'},{profiles:src.profiles},pending,importSchemas);
 assert.match(html,/data-import-link-proposals/);assert.match(html,/&lt;Test &amp; hus&gt;/);assert.match(html,/data-link-use/);assert.doesNotMatch(html,/data-approve-link-proposals|data-approve-link="0"|<section class="import-link-proposals"/);assert.match(html,/data-import-source-row=/);
});
