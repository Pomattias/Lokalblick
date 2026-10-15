import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
const C=globalThis.LokalblickCalculations;

test("legacy Media is a Tillägg alias, never a fourth line in annual cost",()=>{
  const c={
    id:"A",propertyId:"P",start:"2024-01-01",end:"2028-12-31",
    baseRent:100000,rentIndexPercent:0,
    annualContractDrift:460000,annualPropertyTax:15000,
  };
  const amounts=C.annualValues(c,2026,0,[]);
  assert.equal(amounts.rent.amount,100000);
  assert.equal(amounts.addition.amount,460000);
  assert.equal(amounts.tax,15000);
  assert.equal(amounts.total,575000);
  assert.equal("media" in amounts,false);
  const property=C.propertyAnnualCost({contracts:[c],budgetPlans:[],indexSeries:[]}, "P",2026);
  assert.equal(property.addition,460000);
  assert.equal(property.tax,15000);
  assert.equal(property.annualCost,575000);
  assert.equal("media" in property,false);
  const budget=C.budgetRows({contracts:[c],budgetPlans:[],properties:[{id:"P"}],activities:[],orders:[],indexSeries:[]},2026);
  const agreement=budget.find(x=>x.sourceId==="A" && x.sourceType==="contract");
  assert.equal(agreement.amount,575000);
});

test("indexed Tillägg takes precedence over duplicate legacy Media; tax retained",()=>{
 const c={
   baseRent:100000,rentIndexPercent:0,
   baseAdditions:20000,additionBaseYear:2021,
   additionBaseIndex:320,additionIndexPercent:0.5,
   annualContractDrift:460000,annualPropertyTax:15000,
 };
 const index=[{year:2025,month:10,value:400,seriesBase:"1980",source:"Testindex"}];
 const v=C.annualValues(c,2026,0,index);
 assert.equal(v.addition.amount,22500);
 assert.equal(v.total,137500);
 assert.equal(v.tax,15000);
});

test("zero legacy Media and zero tax do not create any phantom additions",()=>{
 const c={baseRent:80000,rentIndexPercent:0,annualContractDrift:0,annualPropertyTax:0};
 const v=C.annualValues(c,2026,0,[]);
 assert.equal(v.addition.amount,0);
 assert.equal(v.total,80000);
});
