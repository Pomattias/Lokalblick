import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {extractBudgetIndex} from '../api/budget-index.js';
const ctx={};vm.runInNewContext(fs.readFileSync('frontend/domain/calculations.js','utf8'),ctx);const calc=ctx.LokalblickCalculations;
test('six million project yields five twelfths in budget year',()=>{
 const a={estimatedCost:6000000,startDate:'2027-08-01',endDate:'2028-07-31'};
 assert.equal(calc.activityBudgetAmount(a,2027),2500000);assert.equal(calc.activityBudgetAmount(a,2028),3500000);
});
test('latest published pre-October month is preliminary, October supersedes it',()=>{
 const data={indexSeries:[{year:2026,month:8,value:419,seriesBase:'1980'},{year:2026,month:9,value:420,seriesBase:'1980'},{year:2026,month:11,value:999,seriesBase:'1980'}]};
 assert.equal(calc.budgetIndex(data,2027).value,420);assert.equal(calc.budgetIndex(data,2027).month,9);
 assert.equal(calc.budgetIndex(data,2027).status,'Preliminär');
 data.indexSeries.push({year:2026,month:10,value:421,seriesBase:'1980'});
 assert.equal(calc.budgetIndex(data,2027).value,421);assert.equal(calc.budgetIndex(data,2027).status,'Fastställd');
});
test('adjustment is allocated to individual objects with exact total and no base mutation',()=>{
 const data={contracts:[],activities:[{id:'a',type:'Projekt',planningYear:2027,estimatedCost:100},{id:'b',type:'Projekt',planningYear:2027,estimatedCost:200}],budgetPlans:[{year:2027,adjustments:{Investering:-10}}]};
 const rows=calc.budgetProposal(data,2027);
 assert.equal(rows.reduce((n,r)=>n+r.amount,0),290);assert.equal(rows[0].adjustmentAmount,-3.33);
 assert.equal(rows[1].adjustmentAmount,-6.67);assert.equal(data.activities[0].estimatedCost,100);
});
test('nonzero adjustment without eligible objects is rejected',()=>{
 assert.throws(()=>calc.budgetProposal({budgetPlans:[{year:2027,adjustments:{Hyra:100}}]},2027,{strict:true}),/saknar objekt/);
});
test('SCB parser selects correct 1980 measure, ignores null and post-October values',()=>{
 const d={id:['Tid','ContentsCode'],size:[3,2],dimension:{Tid:{category:{index:{'2026M08':0,'2026M09':1,'2026M11':2}}},ContentsCode:{category:{index:{'000007MM':0,'other':1}}}},value:[419,123,null,124,999,125]};
 const rows=extractBudgetIndex(d,2026);assert.equal(rows.length,1);assert.equal(rows[0].value,419);assert.equal(rows[0].month,8);
});
test('latest monthly index enters rent calculation and is marked preliminary',()=>{
 const data={indexSeries:[{year:2026,month:9,value:420,seriesBase:'1980'}],budgetPlans:[],activities:[],contracts:[{id:'c',number:'A',start:'2027-01-01',end:'2027-12-31',baseRent:100000,rentBaseIndex:400,rentBaseYear:2025,rentIndexPercent:100}]};
 const rows=calc.budgetRows(data,2027);assert.equal(rows[0].amount,105000);assert.equal(rows[0].status,'Preliminär');
});
test('new budget version preserves prior locked snapshot and metadata',()=>{
 vm.runInNewContext(fs.readFileSync('frontend/domain/budget-followup.js','utf8'),ctx);
 const plan={year:2027,status:'Låst',lockedAt:'2026-10-01',lockedBy:'Mattias',lockedIndexValue:420,lines:[{sourceId:'a',amount:2500000}],adjustments:{Investering:1000}};
 ctx.LokalblickBudgetFollowup.beginVersion(plan,'Ny justering','Mattias','2026-10-09');
 plan.adjustments.Investering=2000;plan.lines[0].amount=3000000;
 assert.equal(plan.status,'Arbetsbudget');assert.equal(plan.versions.length,1);
 assert.equal(plan.versions[0].snapshot.lines[0].amount,2500000);
 assert.equal(plan.versions[0].snapshot.adjustments.Investering,1000);
 assert.equal(plan.versions[0].snapshot.lockedAt,'2026-10-01');
 assert.throws(()=>ctx.LokalblickBudgetFollowup.beginVersion(plan,'igen','Mattias'),/arbetsbudget/);
});
test('manual preliminary index overrides monthly fallback but official October takes precedence',()=>{
 const data={indexSeries:[{year:2026,month:9,value:420,seriesBase:'1980'}]};
 assert.equal(calc.budgetIndex(data,2027,425).value,425);
 assert.equal(calc.budgetIndex(data,2027,0).value,420);
 data.indexSeries.push({year:2026,month:10,value:422,seriesBase:'1980'});
 assert.equal(calc.budgetIndex(data,2027,425).value,422);
});
test('locked budget view shows current September separately from missing saved index',async()=>{
 const {budget}=await import('../frontend/v2/views.js');
 const {normalize}=await import('../frontend/v2/model.js');
 globalThis.LokalblickCalculations=calc;
 vm.runInNewContext(fs.readFileSync('frontend/domain/budget-followup.js','utf8'),ctx);
 globalThis.LokalblickBudgetFollowup=ctx.LokalblickBudgetFollowup;
 globalThis.LokalblickBudgetUI={html:()=>''};
 const data=normalize({indexSeries:[{year:2026,month:9,value:420,seriesBase:'1980'}],budgetPlans:[{year:2027,status:'Låst',lockedAt:'2026-10-01',lockedIndexValue:0,lines:[]}]});
 const html=budget(data,{}, {year:2027});
 assert.ok(html.includes('september 2026: 420'));assert.ok(html.includes('data-budget-index'));
 assert.equal(data.budgetPlans[0].lockedIndexValue,0);
 data.budgetPlans[0].status='Arbetsbudget';
 assert.ok(budget(data,{}, {year:2027}).includes('data-preliminary'));
});
test('saved object adjustment survives index recalculation and repeated locking',()=>{
 vm.runInNewContext(fs.readFileSync('frontend/domain/budget-followup.js','utf8'),ctx);
 const service=ctx.LokalblickBudgetFollowup;
 const plan={year:2027,status:'Arbetsbudget',adjustments:{Hyra:1},lines:[]};
 const data={budgetPlans:[plan],activities:[],indexSeries:[{year:2026,month:9,value:400,seriesBase:'1980'}],contracts:[{id:'c',number:'A',start:'2027-01-01',end:'2027-12-31',baseRent:460000,rentBaseIndex:400,rentBaseYear:2025,rentIndexPercent:100}]};
 plan.lines=calc.budgetProposal(data,2027);plan.status='Låst';
 assert.equal(plan.lines[0].amount,460001);
 service.revise(plan,'danger','Tillägg','Mattias');
 service.setRowAdjustment(plan,plan.lines[0],460006,true,'Mattias','Tillägg');
 service.beginVersion(plan,'Nytt index','Mattias');
 assert.equal(calc.budgetProposal(data,2027)[0].amount,460006);
 data.indexSeries.push({year:2026,month:10,value:420,seriesBase:'1980'});
 plan.lines=calc.budgetProposal(data,2027);plan.status='Låst';
 assert.equal(plan.lines[0].baseAmount,483000);
 assert.equal(plan.lines[0].adjustmentAmount,1);assert.equal(plan.lines[0].manualAdjustmentAmount,5);
 assert.equal(plan.lines[0].amount,483006);
 assert.equal(calc.budgetProposal(data,2027)[0].amount,483006);
 assert.equal(plan.versions[1].snapshot.lines[0].amount,460006);
});
test('object exclusion and independent adjustments remain saved in proposal',()=>{
 vm.runInNewContext(fs.readFileSync('frontend/domain/budget-followup.js','utf8'),ctx);
 const plan={year:2027,lines:[],adjustments:{}},data={budgetPlans:[plan],contracts:[],activities:[{id:'a',type:'Projekt',planningYear:2027,estimatedCost:100},{id:'b',type:'Projekt',planningYear:2027,estimatedCost:200}]};
 plan.lines=calc.budgetProposal(data,2027);
 ctx.LokalblickBudgetFollowup.setRowAdjustment(plan,plan.lines[0],110,false,'Mattias','Undanta');
 const result=calc.budgetProposal(data,2027);
 assert.equal(result[0].included,false);assert.equal(result[0].amount,110);assert.equal(result[1].amount,200);
});
