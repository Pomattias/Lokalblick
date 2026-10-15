import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const runtime={};runtime.globalThis=runtime;
vm.runInNewContext(fs.readFileSync(new URL("../frontend/domain/calculations.js",import.meta.url),"utf8"),runtime);
const calc=runtime.LokalblickCalculations;
const base=()=>({priceBaseAmounts:[{year:2027,amount:60000}],properties:[
{id:"p1",ownerPartyId:"normal"},{id:"p2",ownerPartyId:"sf"}],
contracts:[{id:"a1",propertyId:"p1"},{id:"a2",propertyId:"p2"}],
organizations:[{id:"normal",name:"Extern ägare"},{id:"sf",name:"Stadsfastigheter",type:"owner",investmentRule:"stadsfastigheter",investmentThreshold:200000,rentSurchargeRate:7.5}],
activities:[],budgetPlans:[]});
const assess=(data,contractId,amount,actionKind)=>calc.activityEconomics(data,{contractId,estimatedCost:amount,actionKind},2027);
test("normal threshold is half of the configured PBB and strictly above",()=>{
 const data=base();
 assert.equal(assess(data,"a1",30000,"value_enhancing").kind,"operating");
 assert.equal(assess(data,"a1",30001,"value_enhancing").kind,"investment");
 assert.equal(assess(data,"a1",100000,"like_for_like").kind,"operating");
});
test("SF owner: even 1:1 above 200k is owner investment",()=>{
 const data=base();
 assert.equal(assess(data,"a2",200000,"like_for_like").kind,"operating");
 const result=assess(data,"a2",1000000,"like_for_like");
 assert.equal(result.kind,"investment");
 assert.equal(result.rentFinanced,true);
 assert.equal(result.annualRentAddition,75000);
});
test("unassessed activity and missing price base amount remain unresolved",()=>{
 const data=base();
 assert.equal(assess(data,"a1",100000,"").kind,"unassessed");
 data.priceBaseAmounts=[];
 assert.equal(assess(data,"a1",100000,"value_enhancing").kind,"missing_base_amount");
});
test("SF investment is excluded from own budget",()=>{
 const data=base();
 data.activities=[{id:"test",contractId:"a2",type:"Projekt",title:"Utbyte",
 actionKind:"like_for_like",estimatedCost:1000000,planningYear:2027,includeInBudget:"Ja"}];
 const rows=calc.budgetRows(data,2027);
 assert.equal(rows.some(x=>x.sourceId==="test"),false);
});
