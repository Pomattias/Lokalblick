import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {emptyData,normalize,validateData,coordinator} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {nextIssueId,issueNeedsLink} from '../frontend/lokaler/issue-identity.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {applyIssueHome} from '../frontend/v2/issue-editor.js';
import {portfolioScope} from '../frontend/v2/portfolio-context.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {LocalStore} from '../backend/lokaler/store.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';

function fixture(){
 const data=emptyData();
 data.properties.push(normalize('properties',{id:'F1',name:'Test 1',address:'Testgatan 1'}));
 data.objects.push(normalize('objects',{id:'O1',property_id:'F1',area:100}));
 data.people.push(normalize('people',{id:'P1',name:'Fiktiv Samordnare'}));
 data.contacts.push(normalize('contacts',{id:'C1',person_id:'P1',role:'coordinator',property_id:'F1'}));
 data.workspace.budgetPlans=[{id:'budget-test',year:2027,locked:true,snapshot:{amount:12345},history:[{action:'Låst'}]}];
 return data;
}
const targets=['activities.title','activities.objectId','activities.propertyId','activities.estimatedCost','activities.startDate','activities.rentSurchargeStartDate'];
function prepare(rows,selected=targets){
 const workbook=XLSX.utils.book_new(),name='2027';
 const headers=selected.map(target=>target==='activities.startDate'?'Planerad start':target==='activities.estimatedCost'?'Kostnad':target==='activities.rentSurchargeStartDate'?'Betalas som hyrespåslag':target);
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),name);
 const profiles=[{name,fileName:'syntetiska-arenden.xlsx',headerRow:1,canonical:true,primaryTable:'activities',columns:selected.map((target,index)=>({index,target,header:headers[index]}))}];
 return {workbook,profiles};
}
function run(rows,base=fixture(),selected=targets,context={}){
 const {workbook,profiles}=prepare(rows,selected);
 return prepareCleanImport(workbook,profiles,base,{fileName:'syntetiska-arenden.xlsx',...context},XLSX);
}
test('ID-less cases receive stable sequential IDs, safe homes and Att koppla without invented records',()=>{
 const base=fixture(),first=run([['Ventilation','O1','',12000],['Tak','','F1',8000],['Ny koppling','','',4000],['Okänt objekt','O-unknown','F1',2000]],base);
 assert.equal(first.report.blocking,0);assert.equal(first.clean.issues.length,4);
 assert.deepEqual(first.clean.issues.map(row=>row.id),['ÄR-000001','ÄR-000002','ÄR-000003','ÄR-000004']);
 assert.equal(first.clean.properties.length,1);assert.equal(first.clean.objects.length,1);
 assert.equal(first.clean.issues[0].object_id,'O1');assert.equal(first.clean.issues[1].property_id,'F1');
 assert(first.data.activities.slice(2).every(issueNeedsLink));assert.equal(first.data.activities[2].scopeType,'');
 assert.equal(first.clean.issues[2].include_in_budget,'Nej');assert.equal(first.clean.issues[2].budget_category,'Ej budget');
 assert.match(first.clean.issues[3].sources[0].homeHint,/O-unknown/);
 assert.deepEqual(first.clean.workspace.budgetPlans,base.workspace.budgetPlans);validateData(first.clean);
});
test('reimport is idempotent, survives reordering rows/columns and updates by source identity',()=>{
 const rows=[['Ventilation','O1','',12000],['Tak','','F1',8000]],first=run(rows),again=run(rows,first.clean);
 assert.deepEqual(again.clean.issues,first.clean.issues);assert.equal(again.report.tables.find(row=>row.collection==='activities').unchanged,2);
 const reversed=run([...rows].reverse(),again.clean);assert.deepEqual(reversed.clean.issues.map(row=>row.id),first.clean.issues.map(row=>row.id));
 const columns=run(rows.map(row=>[row[3],row[0],row[2],row[1]]),reversed.clean,['activities.estimatedCost','activities.title','activities.propertyId','activities.objectId']);
 assert.equal(columns.clean.issues.length,2);assert.equal(columns.report.blocking,0);
 const changed=run([['Ventilation','O1','',15000],rows[1],['Ny åtgärd','','F1',1000]],first.clean,targets,{preferences:{'activities|estimatedcost|syntetiska-arenden.xlsx':'accept'}});
 assert.equal(changed.clean.issues.length,3);assert.equal(changed.clean.issues[0].estimated_cost,15000);assert.equal(changed.clean.issues[0].id,first.clean.issues[0].id);assert.equal(changed.clean.issues[2].id,'ÄR-000003');
});
test('ambiguous new/edited rows and duplicate ID-less identities are reviewed instead of duplicated',()=>{
 const first=run([['Kontroll','O1','',1000]]),changed=run([['Nytt namn','O1','',2000]],first.clean);
 assert.equal(changed.report.blocking,1);assert.deepEqual(changed.clean.issues,first.clean.issues);assert.match(changed.clean.workspace.importReview[0].reason,/Ny eller ändrad/);
 const duplicated=run([['Kontroll','O1','',1000],['Kontroll','O1','',2000]]);
 assert.equal(duplicated.report.blocking,2);assert.equal(duplicated.clean.issues.length,0);
 const corrected=run([[first.clean.issues[0].id,'Nytt namn','O1']],first.clean,['activities.id','activities.title','activities.objectId']);
 assert.equal(corrected.report.blocking,0);assert.equal(corrected.clean.issues.length,1);
});
test('an identical issue under another filename is reviewed rather than silently duplicated or merged',()=>{
 const rows=[['Kontroll','O1','',1000]],first=run(rows),{workbook,profiles}=prepare(rows);profiles[0].fileName='annan-kalla.xlsx';
 const result=prepareCleanImport(workbook,profiles,first.clean,{},XLSX);
 assert.equal(result.report.blocking,1);assert.equal(result.clean.issues.length,1);assert.match(result.clean.workspace.importReview[0].reason,/annan fil eller flik/);assert.match(result.clean.workspace.importReview[0].reason,/ÄR-000001/);
});
test('ambiguous property names need approval and unknown names leave issues Att koppla with source hints',()=>{
 const base=fixture();base.properties.push(normalize('properties',{id:'F2',name:'Test 1',address:'Testgatan 2'}));
 const result=run([['Ventilation','Test 1'],['Tak','Fiktiv okänd']],base,['activities.title','properties.designation']);
 assert.equal(result.report.blocking,1);assert(result.data.activities.every(issueNeedsLink));assert.equal(result.clean.properties.length,2);assert.equal(result.report.linkProposals[0].matches.length,2);
 assert.match(result.clean.issues[0].sources[0].homeHint,/Fiktiv okänd/);
 const safe=run([['Unik koppling','Test 1','Testgatan 1']],base,['activities.title','properties.designation','properties.address']);
 assert.equal(safe.clean.issues.length,0);assert.equal(safe.report.linkProposals[0].matches[0].id,'F1');
});
test('linking an imported issue keeps ID, own responsibility, audit and reimport identity',()=>{
 const first=run([['Att reda ut','','',4000]]),view=projectWorkspace(first.clean),id=view.activities[0].id;
 const incoming=first.clean.issues[0].sources;
 view.assignments.push({id:'C2',personId:'P1',targetType:'activity',targetId:id,roleKey:'our',fromDate:'2026-01-01',shared:false});
 applyIssueHome(view.activities[0],'object:O1');
 view.auditLog.push({collection:'activities',recordId:id,action:'Fastighet kopplad',at:'2026-10-21T12:00:00Z'});
 const saved=collectWorkspace(view,first.clean),again=run([['Att reda ut','','',4000]],saved);
 assert.equal(again.clean.issues[0].id,id);assert.equal(again.clean.issues[0].object_id,'O1');assert(!issueNeedsLink(again.data.activities[0]));
 assert.equal(coordinator(again.clean,'issues',again.clean.issues[0]).person.id,'P1');
 assert.deepEqual(again.clean.contacts,saved.contacts);assert.deepEqual(again.clean.issues[0].sources,incoming);
 assert(again.clean.workspace.auditLog.some(entry=>entry.recordId===id&&entry.action==='Fastighet kopplad'));
 const pending=portfolioScope(projectWorkspace(first.clean),{},{view:'activities',status:'unlinked'});assert.equal(pending.items.length,1);
 assert.equal(portfolioScope(again.data,{},{view:'activities',status:'unlinked'}).items.length,0);
 assert.equal(portfolioScope(again.data,{},{view:'activities',status:'all',q:id}).items.length,1);
});
test('date and number failures point to the actual source column, never the last selected field',()=>{
 const rows=[['Fel datum','O1','',1000,'inte ett datum',''],['Fel belopp','O1','','okänt','2027-01-01','']],{workbook,profiles}=prepare(rows);
 const result=prepareCleanImport(workbook,profiles,fixture(),{},XLSX),reviews=result.clean.workspace.importReview;
 assert.equal(result.report.blocking,0);assert.equal(result.clean.issues.length,2);assert(reviews.every(review=>review.fieldRejected&&!review.rowRejected));assert.equal(reviews[0].column,'Planerad start');assert.equal(reviews[0].value,'inte ett datum');assert.equal(reviews[1].column,'Kostnad');assert.equal(reviews[1].value,'okänt');
 const html=columnPreviewHtml({fileName:'test.xlsx'},{profiles},result,importSchemas);
 assert.match(html,/Kolumn: Planerad start/);assert(!html.includes('Kolumn: Betalas som hyrespåslag'));
});
test('a 158-row source keeps all identifiable cases and leaves only the 14 invalid optional values for completion',()=>{
 const rows=[...Array.from({length:144},(_,i)=>['Ärende '+i,'O1','',1000,'2027-01-01','']),...Array.from({length:11},(_,i)=>['Datumfel '+i,'O1','',1000,'osäkert datum','']),...Array.from({length:3},(_,i)=>['Beloppsfel '+i,'O1','','okänt','2027-01-01',''])];
 const result=run(rows);assert.equal(result.clean.issues.length,158);assert.equal(result.report.blocking,0);assert.equal(result.report.rows,158);
 assert(result.clean.workspace.importReview.slice(0,11).every(review=>review.column==='Planerad start'));
 assert(result.clean.workspace.importReview.slice(11).every(review=>review.column==='Kostnad'));
 assert.equal(result.clean.workspace.sourceRegistry[0].receipt.readRows,158);
 const again=run(rows,result.clean);assert.equal(again.clean.issues.length,158);assert.equal(again.report.blocking,0);assert.equal(again.clean.workspace.importReview.length,14);
});
test('an optional empty issue column does not fail an unrelated property import',()=>{
 const result=run([['F1','Test 1','']],fixture(),['properties.id','properties.designation','activities.title']);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.issues.length,0);assert.equal(result.clean.properties.length,1);
});
test('issue numbering is not reused after deletion and previews do not reserve numbers in the saved workspace',()=>{
 const settings={issueSequence:8};assert.equal(nextIssueId([{id:'ÄR-000012'},{id:'manual'}],settings),'ÄR-000013');
 assert.equal(nextIssueId([],settings),'ÄR-000014');
 const base=fixture();const a=run([['Test','O1']],base),b=run([['Test','O1']],base);
 assert.equal(a.clean.issues[0].id,b.clean.issues[0].id);assert.equal(base.workspace.settings,undefined);
});
for(const mode of ['sqlite','excel'])test('generated issue IDs, source matches and linking survive '+mode+' and Excel roundtrip',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'issue-import-')),file=path.join(dir,mode==='excel'?'data.xlsx':'data.sqlite');let store=await LocalStore.open({file,mode});
 try{
  const rows=[['Fiktiv åtgärd','','',1234]],first=run(rows);await store.replace(first.clean,0);await store.close();store=await LocalStore.open({file,mode});
  const reopened=store.snapshot().data,roundtrip=await readWorkbook(await writeWorkbook(reopened));
  assert.deepEqual(roundtrip,JSON.parse(JSON.stringify(reopened)));const again=run(rows,roundtrip);assert.equal(again.clean.issues.length,1);assert.equal(again.clean.issues[0].id,first.clean.issues[0].id);
  const view=projectWorkspace(again.clean);applyIssueHome(view.activities[0],'property:F1');await store.replace(collectWorkspace(view,again.clean),store.snapshot().version);
  assert.equal(store.snapshot().data.issues[0].id,first.clean.issues[0].id);assert.deepEqual(store.snapshot().data.workspace.budgetPlans,first.clean.workspace.budgetPlans);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
test('current SQLite issue constraints are relaxed without losing references, optional fields or Budget',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'issue-home-upgrade-')),file=path.join(dir,'data.sqlite');let store=await LocalStore.open({file});
 try{
  const data=fixture();data.issues.push(normalize('issues',{id:'old',object_id:'O1',title:'Befintligt',kind:'Projekt',journal:[{text:'Bevara'}]}));
  data.orders.push(normalize('orders',{id:'B1',issue_id:'old',title:'Order'}));data.contacts.push(normalize('contacts',{id:'C2',person_id:'P1',role:'coordinator',issue_id:'old'}));await store.replace(data,0);
  const before=JSON.parse(JSON.stringify(store.snapshot()));await store.close();
  const db=new DatabaseSync(file),sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='issues'").get().sql;
  const columns=db.prepare('PRAGMA table_info(issues)').all().map(column=>column.name).join(',');
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  db.exec(sql.replace('"issues"','issues').replace('CREATE TABLE issues','CREATE TABLE issue_previous').replace('<= 1','= 1'));
  db.exec(`INSERT INTO issue_previous (${columns}) SELECT ${columns} FROM issues; DROP TABLE issues; ALTER TABLE issue_previous RENAME TO issues; COMMIT`);db.close();
  store=await LocalStore.open({file});assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot())),before);assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length,0);
  const next=store.snapshot().data;next.issues.push(normalize('issues',{id:'new',title:'Att koppla'}));await store.replace(next,before.version);assert.equal(store.snapshot().data.issues.length,2);
  assert.deepEqual(store.snapshot().data.workspace.budgetPlans,data.workspace.budgetPlans);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
