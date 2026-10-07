import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
const context=vm.createContext({});vm.runInContext(readFileSync('frontend/domain/budget-followup.js','utf8'),context);
const service=context.LokalblickBudgetFollowup;
const line=(id,amount=100)=>({sourceType:'activity',sourceId:id,category:'Underhåll',sub:'Tak',source:'Tak',amount});
test('union keeps removed baseline and distinguishes new and changed rows',()=>{
 const rows=service.compare({},[line('1'),line('2')],[line('1',120),line('3')],2026);
 assert.deepEqual(Array.from(rows,r=>r.change),['Ändrad','Utgår · finns i budget','Ny · ej budgeterad']);
 assert.equal(rows[1].budget,100);assert.equal(rows[1].forecast,0);assert.equal(rows[2].budget,null);
});
test('zero final cost is settled, never falls back to estimate',()=>{
 const rows=service.compare({activities:[{id:'1',type:'Underhåll',finalCosts:{2026:{Underhåll:0}}}]},[line('1')],[line('1')],2026);
 assert.equal(rows[0].finalCost,0);assert.equal(rows[0].forecast,0);
});
test('project activity final costs are separate from investigation budget',()=>{
 const row={...line('1'),sourceType:'activity',category:'Projekt'};
 const data={activities:[{id:'1',type:'Projekt',finalCost:500,finalCosts:{2026:{Projekt:500}},status:'Klar'}]};
 assert.equal(service.finalCost(data,row,2026),500);
 assert.equal(service.finalCost(data,{...row,category:'Utredningar'},2026),null);
 assert.equal(service.finalCost(data,row,2027),null);
});
test('danger and reason required; previous locked version retained',()=>{
 const plan={year:2026,status:'Låst',lines:[line('1')],targets:{Underhåll:100}};
 assert.throws(()=>service.revise(plan,'Danger','test','Mattias'));
 assert.throws(()=>service.revise(plan,'danger',' ','Mattias'));
 service.revise(plan,'danger','Rättelse','Mattias','2026-10-07T06:00:00Z');plan.lines[0].amount=200;
 assert.equal(plan.versions[0].snapshot.lines[0].amount,100);assert.equal(plan.versions[0].by,'Mattias');assert.equal(plan.status,'Låst');
});
test('renamed record keeps identity',()=>{assert.equal(service.key(line('1')),service.key({...line('1'),sub:'Nytt namn'}));});
function workbookAdapter(){
 const c=vm.createContext({window:{},XLSX,console});
 // Expose private conversion functions in this test only; production surface stays unchanged.
 let text=readFileSync('frontend/services/source-service.js','utf8').replace('schemas:SCHEMAS.concat([ACTIVITY_SCHEMA]),','schemas:SCHEMAS.concat([ACTIVITY_SCHEMA]), _read:workbookToData, _write:dataToWorkbook,');
 vm.runInContext(text,c);return c.window.LokalblickSourceService;
}
test('real XLSX roundtrip keeps canonical activity identities, versions, zero final costs and full history',()=>{
 const adapter=workbookAdapter();
 const data={properties:[{id:'P1',address:'Demogatan 1',responsiblePersonId:'P1-INTERN'}],contracts:[{id:'C1',propertyId:'P1',number:'DEMO-1'}],people:[{id:'P1-INTERN',name:'Intern'}],activities:[{id:'UH1',type:'Underhåll',propertyId:'P1',title:'Tak',planningYear:2026,estimatedCost:100,budgetCategory:'Underhåll',finalCosts:{2026:{Underhåll:0}},budgetIncluded:false,responsiblePersonId:'P1-INTERN'}],budgetPlans:[{year:2026,status:'Låst',lines:[line('UH1')],targets:{Underhåll:100},versions:[{by:'Mattias',reason:'Test',snapshot:{year:2026,lines:[line('UH1')]}}]}],auditLog:[{id:'H1',by:'Mattias',at:'2026-10-07',fields:[{field:'responsiblePersonId',from:'',to:'P1-INTERN'}],description:'x'.repeat(65000)}]};
 const workbook=adapter._write(data);const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'});
 const restored=adapter._read(XLSX.read(bytes,{type:'buffer'}));
 assert.equal(restored.budgetPlans[0].lines[0].sourceId,'UH1');assert.equal(restored.budgetPlans[0].versions[0].by,'Mattias');
 assert.equal(restored.activities[0].finalCosts[2026].Underhåll,0);assert.equal(restored.activities[0].budgetIncluded,false);
 assert.equal(restored.activities[0].responsiblePersonId,'P1-INTERN');assert.equal(restored.properties[0].responsiblePersonId,'P1-INTERN');
 assert.equal(restored.auditLog[0].description.length,65000);assert.equal(restored.assignments?.length||0,0);
 assert.equal(Boolean(workbook.Sheets.Ansvar),false);assert.equal(Boolean(workbook.Sheets.Projekt),false);
});
test('legacy snapshot matches only a unique source, ambiguous rows need review',()=>{
 const old={category:'Underhåll',source:'Tak',contractId:'C1',amount:100};
 const live=[{...line('1'),contractId:'C1'}];
 const rows=service.compare({},[old],live,2026);assert.equal(rows.length,1);assert.equal(rows[0].budget,100);
 const ambiguous=service.compare({},[old],[...live,{...live[0],sourceId:'2'}],2026);
 assert.equal(ambiguous.length,3);assert.match(ambiguous[0].change,/Behöver kontroll/);
});
test('removed completed action retains incurred final cost from deletion history',()=>{
 const data={auditLog:[{collection:'activities',recordId:'1',action:'Raderad',fields:[{field:'finalCosts',from:{2026:{Underhåll:40}}}]}]};
 const rows=service.compare(data,[line('1')],[],2026);assert.equal(rows[0].forecast,40);assert.equal(rows[0].finalCost,40);
});
function appContext() {
 const c=vm.createContext({console,Intl,Date,crypto:globalThis.crypto});c.window=c;
 vm.runInContext(readFileSync('frontend/data/demo-data.js','utf8'),c);
 c.LokalblickDataService={save:async data=>JSON.parse(JSON.stringify(data))};
 vm.runInContext(readFileSync('frontend/domain/calculations.js','utf8'),c);
 vm.runInContext(readFileSync('frontend/domain/budget-followup.js','utf8'),c);
 const app=readFileSync('frontend/app.js','utf8').split('document.getElementById("clear-data").addEventListener')[0];
 vm.runInContext(app,c);vm.runInContext(readFileSync("frontend/budget-followup-ui.js","utf8"),c);return c;
}
test('saving logs separate budget years with actor/time and changed fields; deletes retain prior values',async()=>{
 const c=appContext();
 vm.runInContext(`state.budgetPlans=[{year:2026,targets:{Underhåll:100}},{year:2027,targets:{Underhåll:200}}];state.auditLog=[];resetAuditBaseline();state.budgetPlans[0].targets.Underhåll=120;state.budgetPlans[1].targets.Underhåll=240;`,c);
 await vm.runInContext('saveState()',c);
 const logs=vm.runInContext('state.auditLog',c);assert.equal(logs.length,2);assert.equal(logs[0].recordId,'2026');assert.equal(logs[1].recordId,'2027');assert.equal(logs[0].by,'Demoanvändare');assert.ok(logs[0].at);assert.equal(logs[0].fields[0].from.Underhåll,100);
 vm.runInContext('state.budgetPlans.splice(0,1)',c);await vm.runInContext('saveState()',c);
 const deleted=vm.runInContext('state.auditLog.at(-1)',c);assert.equal(deleted.action,'Raderad');assert.ok(deleted.fields.length);
});
test('empty saved snapshot stays empty; frozen inclusion survives active exclusion',()=>{
 const c=appContext();vm.runInContext(readFileSync('frontend/budget-followup-ui.js','utf8'),c);
 const html=vm.runInContext('budgetFollowupHtml({year:2026,status:"Låst",lines:[]},[],false)',c);
 assert.match(html,/Riskzon/);assert.match(vm.runInContext('budgetRevisionFields({status:"Låst"})',c),/pattern="danger"/);
});
test('active exclusion does not mutate locked budget lines',async()=>{
 const c=appContext();
 const button={dataset:{budgetToggle:'exclude',budgetSourceType:'maintenance',budgetSourceId:'UH1'},addEventListener(type,fn){this.handler=fn;}};
 c.document={getElementById:()=>null,querySelectorAll:selector=>selector.startsWith('[data-budget-toggle]')?[button]:[]};
 vm.runInContext(`applyPortfolioFiltersToControls=()=>{};applyPortfolioSectionVisibility=()=>{};filterPropertyPortfolio=()=>{};render=()=>{};currentView='budget';accessMode='edit';selectedBudgetYear=2026;state.budgetPlans=[{year:2026,status:'Låst',lines:[{sourceType:'maintenance',sourceId:'UH1',category:'Underhåll',amount:100}]}];state.maintenance=[{id:'UH1',cost:100,year:2026}];resetAuditBaseline();bindViewEvents();`,c);
 await button.handler();
 assert.equal(vm.runInContext('state.maintenance[0].budgetIncluded',c),false);
 assert.equal(vm.runInContext('state.budgetPlans[0].lines[0].included',c),undefined);
 assert.equal(vm.runInContext('state.budgetPlans[0].lines[0].amount',c),100);
});
