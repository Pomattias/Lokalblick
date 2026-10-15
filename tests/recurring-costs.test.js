import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/recurring-costs.js";
import "../frontend/domain/calculations.js";

const R=globalThis.LokalblickRecurringCosts;
const C=globalThis.LokalblickCalculations;
const sample=()=>({
 properties:[{id:"p1",address:"Hamngatan 1"},{id:"p2",address:"Storgatan 2"}],
 objects:[],
 contracts:[{id:"c1",propertyId:"p1",number:"A-1",baseRent:0}],
 recurringCosts:[
  {id:"electricity",name:"El",propertyId:"p1",contractId:"",annualAmount:120000,startYear:2027,endYear:null,actuals:[{year:2027,amount:110000}]},
  {id:"cleaning",name:"Städning",propertyId:"",contractId:"c1",annualAmount:18000,startYear:2028,endYear:2029,actuals:[]}
 ],
 activities:[],orders:[],budgetPlans:[],indexSeries:[]
});

test("Recurring costs have exactly one verified owner",()=>{
 const d=sample();
 assert.equal(R.validateCosts(d),d);
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[{...d.recurringCosts[0],contractId:"c1"}]}),/antingen fastighet eller avtal/);
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[{...d.recurringCosts[0],propertyId:"missing"}]}),/fastighet saknas/);
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[{...d.recurringCosts[1],contractId:"missing"}]}),/avtal saknas/);
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[d.recurringCosts[0],d.recurringCosts[0]]}),/flera gånger/);
});

test("One annual record rolls forward without cloned expense entries",()=>{
 const d=sample(),energy=d.recurringCosts[0],cleaning=d.recurringCosts[1];
 assert.equal(R.annualBudget(energy,2026),0);
 assert.equal(R.annualBudget(energy,2027),120000);
 assert.equal(R.annualBudget(energy,2030),120000);
 assert.equal(R.annualBudget(cleaning,2027),0);
 assert.equal(R.annualBudget(cleaning,2028),18000);
 assert.equal(R.annualBudget(cleaning,2030),0);
 assert.equal(R.annualActual(energy,2027),110000);
 assert.equal(R.annualActual(energy,2028),0);
});

test("Annual actual must be unique per year and within validity",()=>{
 const d=sample();
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[{...d.recurringCosts[1],actuals:[{year:2028,amount:5},{year:2028,amount:6}]}]}),/unikt år/);
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[{...d.recurringCosts[1],actuals:[{year:2027,amount:5}]}]}),/utanför/);
 assert.throws(()=>R.validateCosts({...d,recurringCosts:[{...d.recurringCosts[0],annualAmount:-1}]}),/negativ/);
});

test("Budget includes recurring costs once, and not before start year",()=>{
 const d=sample();
 assert.equal(C.budgetRows(d,2027).filter(x=>x.sourceType==="recurringCost").reduce((n,x)=>n+x.amount,0),120000);
 assert.equal(C.budgetRows(d,2028).filter(x=>x.sourceType==="recurringCost").reduce((n,x)=>n+x.amount,0),138000);
 const scoped=C.budgetRows(d,2028,d.contracts,[d.properties[0]]).filter(x=>x.sourceType==="recurringCost");
 assert.deepEqual(scoped.map(x=>x.sourceId).sort(),["cleaning","electricity"]);
 assert.equal(scoped.find(x=>x.sourceId==="cleaning").propertyId,"p1");
 assert.equal(scoped.find(x=>x.sourceId==="cleaning").contractId,"c1");
});

test("Actuals belong to each year; work orders remain independent",()=>{
 const d=sample();
 assert.equal(C.actualRows(d,2027).filter(x=>x.sourceType==="recurringCost").reduce((n,x)=>n+x.amount,0),110000);
 assert.equal(C.actualRows(d,2028).filter(x=>x.sourceType==="recurringCost").length,0);
});
