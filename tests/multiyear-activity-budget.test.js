import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const sandbox={globalThis:null};
sandbox.globalThis=sandbox;
vm.runInNewContext(fs.readFileSync(new URL("../frontend/domain/calculations.js",import.meta.url),"utf8"),sandbox);
const calc=sandbox.LokalblickCalculations;
test("multiyear activity appears in both years without repeating total cost",()=>{
  const a={id:"a",type:"Projekt",startDate:"2027-10-01",endDate:"2028-06-01",estimatedCost:100000,
    yearAllocations:[{year:2027,amount:40000},{year:2028,amount:60000}]};
  assert.equal(calc.activityPlannedInYear(a,2027),true);
  assert.equal(calc.activityPlannedInYear(a,2028),true);
  assert.equal(calc.activityPlannedInYear(a,2029),false);
  assert.equal(calc.activityBudgetAmount(a,2027),40000);
  assert.equal(calc.activityBudgetAmount(a,2028),60000);
  assert.equal(calc.activityBudgetAmount({...a,yearAllocations:[]},2027),0);
  assert.equal(calc.activityBudgetAmount({...a,yearAllocations:[]},2028),0);
});
test("explicit allocation of zero remains zero",()=>{
 const a={startDate:"2027-01-01",endDate:"2027-12-31",estimatedCost:1000,yearAllocations:[{year:2027,amount:0}]};
 assert.equal(calc.activityBudgetAmount(a,2027),0);
});
test("single-year legacy activity retains legacy year amount",()=>{
  const a={planningYear:2027,estimatedCost:1200};
  assert.equal(calc.activityPlannedInYear(a,2027),true);
  assert.equal(calc.activityBudgetAmount(a,2027),1200);
  assert.equal(calc.activityPlannedInYear(a,2028),false);
  assert.equal(calc.activityBudgetAmount(a,2028),0);
});
test("rent-financed activity is excluded from budget rows",()=>{
 const a={id:"rent",type:"Projekt",title:"Ombyggnad",planningYear:2027,estimatedCost:50000,
  budgetCategory:"Projekt",yearAllocations:[{year:2027,amount:50000}],financingMethod:"rent_supplement"};
 assert.equal(calc.budgetRows({activities:[a],contracts:[],budgetPlans:[]},2027).some(r=>r.sourceId==="rent"),false);
});
