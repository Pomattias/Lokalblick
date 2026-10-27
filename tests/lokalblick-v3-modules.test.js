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
  assert.equal(s.state().orders[0].property_id,property);
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
  await s.post('createBudget',{property_id:property,budget_year:2026,version:1,scenario:'base'});const budget=s.state().budgets[0].id;
  await s.post('addBudgetLine',{budget_id:budget,cost_id:cost,line_type:'operating',name:'VA-budget',budget_amount:12000});
  assert.equal(s.state().budgets[0].total,12000);
  await s.post('setBudgetStatus',{status:'locked'},budget);
  assert.equal(s.state().budgets[0].status,'locked');assert.equal(s.state().financialSummary.budgetAmount,12000);
  await s.post('addBudgetLine',{budget_id:budget,line_type:'revenue',name:'Nytt',budget_amount:4000},undefined,400);
  await s.post('updateBudgetLine',{name:'Ändra'},s.state().budgetLines[0].id,400);
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
