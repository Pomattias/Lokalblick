import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx={};vm.runInNewContext(fs.readFileSync('frontend/domain/budget-followup.js','utf8'),ctx);
const service=ctx.LokalblickBudgetFollowup;
const row={sourceType:'contract',sourceId:'c1',source:'SF-DEMO-101-1',category:'Hyra + drift',amount:460000};
test('budget row history finds one krona correction saved in plan versions',()=>{
 const plan={year:2027,status:'Låst',lines:[{...row}]};
 service.revise(plan,'danger','Rättelse','Mattias','2026-10-10T06:00:00Z');
 plan.lines[0].amount=460001;
 const entries=service.history({auditLog:[]},plan,row);
 assert.equal(entries.length,1);assert.equal(entries[0].by,'Mattias');assert.equal(entries[0].reason,'Rättelse');
 assert.equal(entries[0].fields[0].from,460000);assert.equal(entries[0].fields[0].to,460001);
});
test('row history includes source audit and budget changes without duplicate plan audit',()=>{
 const before={...row},after={...row,amount:460001},plan={year:2027,lines:[after],versions:[{at:'2026-10-10',by:'Mattias',reason:'Rättelse',snapshot:{lines:[before]}}]};
 const data={auditLog:[{collection:'budgetPlans',recordId:'2027',at:'2026-10-10',fields:[{field:'lines',from:[before],to:[after]}]},{collection:'contracts',recordId:'c1',at:'2026-10-09',action:'Ändrad',fields:[{field:'baseRent',from:1,to:2}]},{collection:'contracts',recordId:'other',at:'2026-10-09',action:'Ändrad',fields:[]}]};
 const entries=service.history(data,plan,row);
 assert.equal(entries.length,2);assert.ok(entries[1].action.startsWith('Källobjekt'));
});
test('legacy plan audit works without saved versions and unrelated rows are excluded',()=>{
 const plan={year:2027,lines:[{...row,amount:460001}]};
 const data={auditLog:[{collection:'budgetPlans',recordId:2027,by:'Mattias',at:'2026-10-10',fields:[{field:'lines',from:[row],to:plan.lines}]}]};
 assert.equal(service.history(data,plan,row).length,1);
 assert.equal(service.history(data,plan,{...row,sourceId:'other'}).length,0);
});
