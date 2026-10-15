import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/recurring-costs.js";
import "../frontend/domain/calculations.js";
const calc=globalThis.LokalblickCalculations;

const fixture=()=>({
  properties:[{id:"p",address:"Kajgatan 1"}],
  contracts:[{id:"a",propertyId:"p",number:"AV-1",start:"2027-01-01",end:"2027-12-31",
    baseRent:100000,rentBaseYear:2025,rentBaseIndex:400,rentIndexPercent:100,
    baseAdditions:0,additionIndexPercent:0}],
  objects:[],activities:[],orders:[],recurringCosts:[],
  indexSeries:[{year:2026,month:10,value:420,seriesBase:"1980",source:"SCB KPI",preliminary:false}],
  budgetPlans:[{year:2027,status:"Arbetsbudget",preliminaryIndex:460,lines:[]}]
});

test("confirmed October is immutable for operational rent, even when budget contains a manual KPI",()=>{
  const d=fixture(),before=JSON.stringify(d);
  const a=d.contracts[0];
  const official=calc.annualValues(a,2027,460,d.indexSeries);
  assert.equal(official.rent.amount,105000);
  assert.equal(official.rent.status,"Beräknad");
  assert.equal(calc.propertyAnnualCost(d,"p",2027).annualCost,105000);
  assert.equal(calc.budgetRows(d,2027).find(x=>x.sourceType==="contract").amount,105000);
  assert.equal(calc.budgetIndex(d,2027,460).value,420);
  assert.equal(JSON.stringify(d),before);
});

test("only explicit budget scenario can override confirmed CPI",()=>{
  const d=fixture(),a=d.contracts[0];
  assert.equal(calc.budgetScenarioIndex(d,2027,460).value,460);
  const v=calc.annualValues(a,2027,460,d.indexSeries,{scenario:true});
  assert.equal(v.rent.amount,115000);
  assert.equal(v.rent.status,"Preliminär");
  assert.equal(calc.budgetScenarioRows(d,2027).find(x=>x.sourceType==="contract").amount,115000);
  assert.equal(calc.budgetProposal(d,2027).find(x=>x.sourceType==="contract").amount,115000);
  assert.equal(calc.propertyAnnualCost(d,"p",2027).annualCost,105000);
});

test("resetting scenario changes projection, not contract data or status",()=>{
  const d=fixture(),baseline=calc.budgetRows(d,2027);
  d.budgetPlans[0].preliminaryIndex=0;
  const proposal=calc.budgetProposal(d,2027).find(x=>x.sourceType==="contract");
  assert.equal(proposal.amount,105000);
  assert.equal(proposal.status,"Beräknad");
  assert.equal(calc.budgetRows(d,2027)[0].amount,baseline[0].amount);
});

test("missing target October is marked preliminary in budget scenarios, not contractual truth",()=>{
  const d=fixture();
  d.indexSeries=[{year:2026,month:9,value:418,seriesBase:"1980",source:"SCB KPI"}];
  d.budgetPlans[0].preliminaryIndex=0;
  assert.equal(calc.budgetRows(d,2027)[0].status,"Behöver kontroll");
  const forecast=calc.budgetScenarioRows(d,2027)[0];
  assert.equal(forecast.status,"Preliminär");
  assert.equal(forecast.amount,104500);
});

test("locked budget line stays a historical decision when CPI changes",()=>{
  const d=fixture();
  d.budgetPlans[0]={year:2027,status:"Låst",preliminaryIndex:460,lockedIndexValue:460,
    lines:[{sourceType:"contract",sourceId:"a",category:"Hyra + drift",amount:115000}]};
  const frozen=structuredClone(d.budgetPlans[0].lines);
  d.indexSeries[0].value=430;
  assert.deepEqual(d.budgetPlans[0].lines,frozen);
  assert.equal(calc.propertyAnnualCost(d,"p",2027).annualCost,107500);
});
