import test from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDatabase } from '../backend/lokaler/v3/database.js';
import { CoreV3Store } from '../backend/lokaler/v3/core-store.js';
import { createServer } from '../backend/lokaler/server.mjs';
async function setup(){
 const db=openMemoryDatabase(),store=new CoreV3Store(db),server=createServer(store,{v3:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const get=async()=>{const response=await fetch(origin+'/api/v3/core?date=2026-10-27');assert.equal(response.status,200);return response.json()};
 let state=await get();
 const post=async(action,fields={},id,expected=200)=>{
  const response=await fetch(origin+'/api/v3/core',{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({version:state.version,asOf:'2026-10-27',command:{action,fields,...(id?{id}:{})}})});
  const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));if(expected===200)state=result;
  return result;
 };
 const close=async()=>{await new Promise(resolve=>server.close(resolve));db.close()};
 return {post,get,close,state:()=>state,db};
}
test('v3 issues, orders and cost evidence share a single validated property model',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Alfa'});
  const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'101',valid_from:'2020-01-01',area:45});
  await s.post('createIssue',{object_id:s.state().objects[0].id,title:'Värmeanläggning',priority:'high',estimated_cost:30000});
  const issue=s.state().issues[0].id;
  await s.post('createOrder',{issue_id:issue,title:'Byt pump',amount:15000,ordered_at:'2026-09-01'});
  assert.equal(s.state().orders[0].property_id,null);
  assert.equal(s.state().orders[0].resolved_property_id,property);
  await s.post('updateIssue',{status:'ongoing',final_cost:19000},issue);
  assert.equal(s.state().issues[0].status,'ongoing');
  await s.post('createCost',{property_id:property,category:'heat',name:'Värme',annual_amount:200000,valid_from:'2026-01-01'});
  const cost=s.state().recurringCosts[0].id;
  await s.post('addCostEvidence',{cost_id:cost,type:'annual',year:2026,amount:210000});
  assert.equal(s.state().recurringCosts[0].actual.amount,210000);
  assert.equal(s.state().financialSummary.annualPlannedCost,200000);
  assert.equal(s.state().financialSummary.annualActualCost,210000);
  await s.post('addCostEvidence',{cost_id:cost,type:'annual',year:2026,amount:1},undefined,400);
  assert.equal(s.state().costEvidence.length,1);
 }finally{await s.close();}
});
test('v3 budget lines can be added only before locking, then budget is immutable',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Budgethuset'});const property=s.state().properties[0].id;
  await s.post('createCost',{property_id:property,category:'water',name:'VA',annual_amount:10000});const cost=s.state().recurringCosts[0].id;
  await s.post('createBudget',{property_id:property,budget_year:2026,version:1,scenario:'base',scenario_index:424.22});const budget=s.state().budgets[0].id;
  assert.equal(s.state().budgets[0].scenario_index,424.22);
  await s.post('setBudgetScenario',{scenario_index:425.12},budget);
  assert.equal(s.state().budgets[0].scenario_index,425.12);
  await s.post('addBudgetLine',{budget_id:budget,cost_id:cost,line_type:'operating',name:'VA-budget',budget_amount:12000});
  assert.equal(s.state().budgets[0].total,12000);
  await s.post('setBudgetStatus',{status:'locked'},budget);
  assert.equal(s.state().budgets[0].status,'locked');assert.equal(s.state().financialSummary.budgetAmount,12000);
  await s.post('addBudgetLine',{budget_id:budget,line_type:'revenue',name:'Nytt',budget_amount:4000},undefined,400);
  await s.post('updateBudgetLine',{name:'Ändra'},s.state().budgetLines[0].id,400);
  await s.post('setBudgetScenario',{scenario_index:429},budget,400);
  assert.equal(s.state().budgetLines.length,1);
 }finally{await s.close();}
});
test('v3 spatial inspection history checks scope, one point each and locks completed report',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Första huset'});const first=s.state().properties[0].id;
  await s.post('createProperty',{name:'Andra huset'});const second=s.state().properties[1].id;
  await s.post('createSpace',{property_id:first,name:'Trapphus',floor:'1'});
  await s.post('createSpace',{property_id:second,name:'Källare',floor:'0'});
  const firstSpace=s.state().spaces[0].id,wrongSpace=s.state().spaces[1].id;
  await s.post('createPart',{space_id:firstSpace,name:'Golv',responsibility:'owner'});
  const part=s.state().buildingParts[0].id;
  await s.post('createInspection',{property_id:first,inspected_on:'2026-10-27'});
  const inspection=s.state().inspections[0].id;
  await s.post('addInspectionPoint',{inspection_id:inspection,part_id:part,assessment:'defect',comment:'Slitet'});
  assert.equal(s.state().inspections[0].points.length,1);
  await s.post('addInspectionPoint',{inspection_id:inspection,space_id:wrongSpace,assessment:'ok'},undefined,400);
  await s.post('addInspectionPoint',{inspection_id:inspection,part_id:part,assessment:'ok'},undefined,400);
  await s.post('completeInspection',{},inspection);
  await s.post('addInspectionPoint',{inspection_id:inspection,space_id:firstSpace,assessment:'good'},undefined,400);
  assert.equal(s.state().inspections[0].status,'completed');
 }finally{await s.close();}
});
test('v3 batch import is atomic and rejects a duplicate object without partial inserts',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Importhuset'});const id=s.state().properties[0].id;
  const base=s.state().version;
  // Use the same store with a batch command; the second row violates the unique key.
  const direct=new CoreV3Store(s.db);
  await assert.rejects(direct.mutate({version:base,commands:[
   {action:'createObject',fields:{property_id:id,object_number:'S1',valid_from:'2020-01-01',area:50}},
   {action:'createObject',fields:{property_id:id,object_number:'S1',valid_from:'2021-01-01',area:60}}
  ]}),/UNIQUE/);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM objects').get().n,0);
  assert.equal(s.db.prepare('SELECT version FROM store_meta').get().version,base);
 }finally{await s.close();}
});
test('v3 dated rent items can close a previous period and introduce the next rent safely',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Hyresfastighet'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'1',valid_from:'2020-01-01',area:100});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'HYR-1',valid_from:'2020-01-01'});
  const agreement=s.state().agreements[0].id;
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra',base_amount:120000,valid_from:'2020-01-01',base_year:2020,index_share:0.7,adjustment_method:'kpi'});
  const item=s.state().agreementItems[0];
  assert.equal(item.index_share,0.7);
  await s.post('updateAgreementItem',{valid_to:'2026-12-31'},item.id);
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra 2027',base_amount:135000,valid_from:'2027-01-01'});
  assert.equal(s.state().agreementItems.length,2);
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Felaktig överlappning',base_amount:1,valid_from:'2026-06-01'},undefined,400);
  assert.equal(s.state().agreementItems.length,2);
 }finally{await s.close();}
});
test('v3 introspection and all 21 business tables are present in API',async()=>{
 const s=await setup();try{
  const snapshot=s.state();
  assert.equal(snapshot.schema.length,21);
  const named=new Set(snapshot.schema.map(t=>t.name));
  for(const table of ['stakeholder_assignments','object_versions','agreement_versions','budget_lines','inspection_points'])assert(named.has(table));
  assert(snapshot.schema.find(x=>x.name==='inspection_points').references.some(r=>r.table==='inspections'));
  for(const list of ['issues','orders','recurringCosts','costEvidence','budgets','budgetLines','spaces','buildingParts','inspections','inspectionPoints'])assert(Array.isArray(snapshot[list]),list);
 }finally{await s.close();}
});


test('v3 financial summary excludes deselected invoices but retains them as evidence',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Fakturahuset'});const property=s.state().properties[0].id;
  await s.post('createCost',{property_id:property,category:'heat',name:'Värme',annual_amount:12000});
  const cost=s.state().recurringCosts[0].id;
  await s.post('addCostEvidence',{cost_id:cost,type:'invoice',invoice_reference:'EXCLUDED',valid_from:'2026-01-01',valid_to:'2026-12-31',amount:10000,selected:0});
  await s.post('addCostEvidence',{cost_id:cost,type:'invoice',invoice_reference:'INCLUDED',valid_from:'2026-01-01',valid_to:'2026-12-31',amount:900,selected:1});
  assert.equal(s.state().costEvidence.length,2);
  assert.equal(s.state().recurringCosts[0].actual.amount,900);
  assert.equal(s.state().financialSummary.annualActualCost,900);
 }finally{await s.close();}
});

test('v3 financial summary counts only latest locked base budget version per property',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Budget A'});const a=s.state().properties[0].id;
  await s.post('createProperty',{name:'Budget B'});const b=s.state().properties[1].id;
  for(const [property,version,amount] of [[a,1,100],[a,2,150],[b,1,75]]){
   await s.post('createBudget',{property_id:property,budget_year:2026,version,scenario:'base'});
   const budget=s.state().budgets.find(x=>x.property_id===property&&x.version===version);
   await s.post('addBudgetLine',{budget_id:budget.id,line_type:'operating',name:'Drift',budget_amount:amount});
   await s.post('setBudgetStatus',{status:'locked'},budget.id);
  }
  assert.equal(s.state().budgets.length,3);
  assert.equal(s.state().financialSummary.budgetAmount,225);
 }finally{await s.close();}
});

test('v3 inspection points cannot link to an issue on another property',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Besiktningshus'});const a=s.state().properties[0].id;
  await s.post('createProperty',{name:'Annat hus'});const b=s.state().properties[1].id;
  await s.post('createSpace',{property_id:a,name:'Entré'});
  const space=s.state().spaces[0].id;
  await s.post('createInspection',{property_id:a,inspected_on:'2026-10-27'});
  const inspection=s.state().inspections[0].id;
  await s.post('createIssue',{property_id:b,title:'Annan fastighets ärende'});
  const wrongIssue=s.state().issues[0].id;
  await s.post('addInspectionPoint',{inspection_id:inspection,space_id:space,assessment:'defect',issue_id:wrongIssue},undefined,400);
  assert.equal(s.state().inspectionPoints.length,0);
  await s.post('addInspectionPoint',{inspection_id:inspection,space_id:space,assessment:'defect'});
  const point=s.state().inspectionPoints[0].id;
  await s.post('updateInspectionPoint',{issue_id:wrongIssue},point,400);
  assert.equal(s.state().inspectionPoints[0].issue_id,null);
  await s.post('createIssue',{property_id:a,title:'Rätt fastighet'});
  await s.post('updateInspectionPoint',{issue_id:s.state().issues[1].id},point);
  assert.equal(s.state().inspectionPoints[0].issue_id,s.state().issues[1].id);
 }finally{await s.close();}
});

test('v3 rent revisions preserve history, reject in-place amount edits and roll back invalid changes',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Historikfastighet'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'1',valid_from:'2020-01-01',area:200});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'R-1',valid_from:'2020-01-01'});
  const agreement=s.state().agreements[0].id;
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra',base_amount:120000,valid_from:'2020-01-01'});
  const old=s.state().agreementItems[0];
  await s.post('updateAgreementItem',{base_amount:1},old.id,400);
  await s.post('reviseAgreementItem',{valid_from:'2026-01-01',base_amount:150000,name:'Bashyra ny period'},old.id);
  assert.equal(s.state().agreementItems.length,2);
  assert.equal(s.state().agreementItems.find(x=>x.id===old.id).base_amount,120000);
  assert.equal(s.state().agreementItems.find(x=>x.id===old.id).valid_to,'2025-12-31');
  assert.equal(s.state().agreementItems.find(x=>x.base_amount===150000).valid_from,'2026-01-01');
  assert.equal(s.state().financialSummary.annualRent,150000);
  assert.equal((await new CoreV3Store(s.db).readSnapshot('2025-10-27')).financialSummary.annualRent,120000);
  const version=s.state().version;
  await s.post('reviseAgreementItem',{valid_from:'2026-09-01',base_amount:2},old.id,400);
  assert.equal(s.state().version,version);
  assert.equal(s.state().agreementItems.length,2);
  await s.post('updateAgreementItem',{valid_to:'2027-12-31'},old.id,400);
 }finally{await s.close();}
});
test('v3 nominal rent excludes contracts and objects outside their valid period',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Avtalshuset'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'A',valid_from:'2020-01-01',area:100});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'A-1',valid_from:'2020-01-01',legal_end_on:'2025-12-31'});
  await s.post('addAgreementItem',{agreement_id:s.state().agreements[0].id,type:'base',name:'Bashyra',base_amount:120000,valid_from:'2020-01-01'});
  assert.equal((await new CoreV3Store(s.db).readSnapshot('2025-10-27')).financialSummary.annualRent,120000);
  assert.equal(s.state().financialSummary.annualRent,0);
  await s.post('createObject',{property_id:property,object_number:'B',valid_from:'2020-01-01',area:80});
  await s.post('createAgreement',{object_id:s.state().objects[1].id,agreement_number:'A-2',valid_from:'2020-01-01'});
  await s.post('addAgreementItem',{agreement_id:s.state().agreements[1].id,type:'base',name:'Bashyra',base_amount:50000,valid_from:'2020-01-01'});
  assert.equal(s.state().financialSummary.annualRent,50000);
  await s.post('endObject',{ended_on:'2026-01-01'},s.state().objects[1].id);
  assert.equal(s.state().financialSummary.annualRent,0);
 }finally{await s.close();}
});

test('v3 rent remains nominally active after notice if the legal agreement end has not passed',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Uppsägning'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'1',valid_from:'2020-01-01'});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'NOTICE-1',valid_from:'2020-01-01',legal_end_on:'2026-12-31'});
  const agreement=s.state().agreements[0].id;
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra',base_amount:120000,valid_from:'2020-01-01'});
  s.db.prepare('UPDATE agreement_versions SET terminated_on=? WHERE agreement_id=?').run('2026-02-01',agreement);
  assert.equal((await new CoreV3Store(s.db).readSnapshot('2026-10-27')).financialSummary.annualRent,120000);
  assert.equal((await new CoreV3Store(s.db).readSnapshot('2027-01-01')).financialSummary.annualRent,0);
 }finally{await s.close();}
});

test('v3 API separates nominal rent from calculated fixed rent and missing CPI inputs',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Indexhuset'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'100',valid_from:'2020-01-01',area:100});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'IDX-2026',valid_from:'2020-01-01'});
  const agreement=s.state().agreements[0].id;
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra',base_amount:100000,adjustment_method:'fixed',base_year:2024,annual_percent:5,valid_from:'2020-01-01'});
  await s.post('addAgreementItem',{agreement_id:agreement,type:'addition',name:'KPI-tillägg',base_amount:20000,adjustment_method:'kpi',base_index:400,index_share:0.75,valid_from:'2020-01-01'});
  const summary=s.state().financialSummary;
  assert.equal(summary.annualRent,120000);
  assert.equal(summary.annualRentCalculated,null);
  assert.equal(summary.annualRentUnresolved,1);
  assert.equal(s.state().rentCalculations.length,2);
  const fixed=s.state().rentCalculations.find(r=>r.method==='fixed');
  assert.equal(fixed.amount,110250);
  const kpi=s.state().rentCalculations.find(r=>r.method==='kpi');
  assert.equal(kpi.amount,null);
  assert.match(kpi.reason,/KPI/);
 }finally{await s.close();}
});

test('v3 floor flag from rental form remains dated and affects fixed annual adjustment',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Golvkontroll'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'101',valid_from:'2020-01-01'});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'FLOOR-1',valid_from:'2020-01-01'});
  const agreement=s.state().agreements[0].id;
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra',base_amount:120000,valid_from:'2020-01-01',adjustment_method:'fixed',base_year:2024,annual_percent:-5,floor:'1'});
  const old=s.state().agreementItems[0];
  await s.post('reviseAgreementItem',{valid_from:'2025-01-01',floor:'0'},old.id);
  const current=s.state().agreementItems.find(x=>x.id!==old.id);
  assert.equal(current.floor,0);
  assert.equal(s.state().rentCalculations[0].amount,108300);
  assert.equal(s.state().agreementItems.find(x=>x.id===old.id).floor,1);
 }finally{await s.close();}
});

test('v3 enforces separate min/max limits for base rent and additions without changing history',async()=>{
 const s=await setup();try{
  await s.post('createProperty',{name:'Spannfastighet'});const property=s.state().properties[0].id;
  await s.post('createObject',{property_id:property,object_number:'CAP',valid_from:'2020-01-01'});
  await s.post('createAgreement',{object_id:s.state().objects[0].id,agreement_number:'CAP-2026',valid_from:'2020-01-01'});
  const agreement=s.state().agreements[0].id;
  await s.post('addAgreementItem',{agreement_id:agreement,type:'base',name:'Bashyra',base_amount:100000,adjustment_method:'kpi-limited',index_share:1,base_index:400,min_percent:2,max_percent:5,valid_from:'2025-01-01'});
  await s.post('addAgreementItem',{agreement_id:agreement,type:'addition',name:'Tillägg',base_amount:20000,adjustment_method:'kpi-limited',index_share:1,base_index:400,min_percent:0,max_percent:8,valid_from:'2025-01-01'});
  const items=s.state().agreementItems;
  assert.equal(items.length,2);
  const old=items.find(x=>x.type==='base');
  assert.equal(old.max_percent,5);
  assert.equal(items.find(x=>x.type==='addition').max_percent,8);
  await s.post('addAgreementItem',{agreement_id:agreement,type:'addition',name:'Fel ordning',base_amount:1000,adjustment_method:'kpi-limited',index_share:1,base_index:400,min_percent:6,max_percent:3},undefined,400);
  await s.post('addAgreementItem',{agreement_id:agreement,type:'addition',name:'Negativ',base_amount:1000,adjustment_method:'kpi-limited',index_share:1,base_index:400,min_percent:-1,max_percent:3},undefined,400);
  await s.post('addAgreementItem',{agreement_id:agreement,type:'addition',name:'Ingen gräns',base_amount:1000,adjustment_method:'kpi-limited',index_share:1,base_index:400},undefined,400);
  await s.post('reviseAgreementItem',{valid_from:'2026-01-01',min_percent:1,max_percent:4},old.id);
  const latest=s.state().agreementItems.find(x=>x.type==='base'&&x.id!==old.id);
  assert.equal(latest.min_percent,1);assert.equal(latest.max_percent,4);
  assert.equal(s.state().agreementItems.find(x=>x.id===old.id).max_percent,5);
  assert.equal(s.state().agreementItems.find(x=>x.id===old.id).valid_to,'2025-12-31');
  await s.post('reviseAgreementItem',{valid_from:'2027-01-01',min_percent:9,max_percent:2},latest.id,400);
  assert.equal(s.state().agreementItems.length,3);
  assert.equal(s.state().agreementItems.find(x=>x.id===latest.id).valid_to,null);
 }finally{await s.close();}
});
