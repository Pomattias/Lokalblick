import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/recurring-costs.js";
import "../frontend/domain/calculations.js";
const C=globalThis.LokalblickCalculations;

test("media is a recurring contract expense, not an indexed lease addition",()=>{
  const contract={id:"A",propertyId:"P",start:"2024-01-01",end:"2028-12-31",
    baseRent:100000,rentIndexPercent:0,annualPropertyTax:15000};
  const media={id:"D",name:"Media",contractId:"A",propertyId:"",
    annualAmount:460000,startYear:2024,endYear:null,actuals:[]};
  const data={properties:[{id:"P"}],contracts:[contract],recurringCosts:[media],
    indexSeries:[],budgetPlans:[],activities:[],orders:[]};
  const lease=C.annualValues(contract,2026,0,[]);
  assert.equal(lease.rent.amount,100000);
  assert.equal(lease.addition.amount,0);
  assert.equal(lease.tax,15000);
  assert.equal(lease.total,115000);
  const property=C.propertyAnnualCost(data,"P",2026);
  assert.equal(property.annualCost,115000);
  const rows=C.budgetRows(data,2026);
  assert.equal(rows.find(x=>x.sourceType==="contract").amount,115000);
  assert.equal(rows.find(x=>x.sourceType==="recurringCost").amount,460000);
  assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),575000);
});

test("indexed contractual supplement and separately owned recurring cost cannot double count",()=>{
  const contract={id:"A",propertyId:"P",start:"2024-01-01",end:"2028-12-31",
    baseRent:100000,rentIndexPercent:0,baseAdditions:20000,
    additionBaseYear:2021,additionBaseIndex:320,additionIndexPercent:0.5,
    annualPropertyTax:15000};
  const data={properties:[{id:"P"}],contracts:[contract],
    indexSeries:[{year:2025,month:10,value:400,seriesBase:"1980",source:"SCB KPI"}],
    recurringCosts:[{id:"D",name:"Energi",contractId:"A",propertyId:"",annualAmount:460000}],
    activities:[],orders:[],budgetPlans:[]};
  const lease=C.annualValues(contract,2026,0,data.indexSeries);
  assert.equal(lease.addition.amount,22500);
  assert.equal(lease.total,137500);
  const rows=C.budgetRows(data,2026);
  assert.equal(rows.find(row=>row.sourceType==="contract").amount,137500);
  assert.equal(rows.find(row=>row.sourceType==="recurringCost").amount,460000);
  assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),597500);
});

test("zero supplement and tax never create phantom additions",()=>{
  const c={baseRent:80000,rentIndexPercent:0,baseAdditions:0,annualPropertyTax:0};
  const v=C.annualValues(c,2026,0,[]);
  assert.equal(v.addition.amount,0);
  assert.equal(v.total,80000);
});
