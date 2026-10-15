import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../frontend/domain/calculations.js";
import {normalize} from "../frontend/v2/model.js";
import {updateLegacyDemoIndexTerms} from "../frontend/v2/demo-index-migration.js";

const fixture=()=>{
 const js=readFileSync(new URL("../frontend/data/demo-data.js",import.meta.url),"utf8");
 const win={};new Function("window",js)(win);
 return win.LokalblickDemoData;
};
const engine=globalThis.LokalblickCalculations;
const totalRent=(data,year)=>engine.budgetRows(data,year)
 .filter(row=>row.sourceType==="contract")
 .reduce((sum,row)=>sum+row.amount,0);

test("all four demo lease fixtures include indexed base rent, year and reference CPI",()=>{
 const demo=normalize(fixture());
 assert.equal(demo.contracts.length,4);
 for(const contract of demo.contracts){
  assert.ok(contract.baseRent>0,contract.id+" baseRent");
  assert.ok(contract.rentBaseYear>=2023,contract.id+" rentBaseYear");
  assert.ok(contract.rentBaseIndex>0,contract.id+" rentBaseIndex");
  assert.ok(contract.rentIndexPercent>0&&contract.rentIndexPercent<=1,contract.id+" rentIndexPercent");
  const indexed=engine.annualValues(contract,2027,460,demo.indexSeries,{allowLatestKpi:true});
  assert.ok(indexed.rent.amount>contract.baseRent,contract.id+" annual rent indexed");
 }
});

test("demo budget rent responds to a manual October assumption",()=>{
 const demo=normalize(fixture()),current=totalRent(demo,2026),baseline=totalRent(demo,2027);
 const draft={...demo,budgetPlans:[...(demo.budgetPlans||[]).filter(p=>Number(p.year)!==2027),
   {year:2027,status:"Arbetsbudget",preliminaryIndex:460,adjustments:{},lines:[]}]};
 const forecast=totalRent(draft,2027);
 assert.ok(current>0);
 assert.ok(forecast>baseline,"higher provisional KPI must increase demo budget rent");
 assert.ok(forecast>current,"provisional budget rent should exceed current rent");
});

test("legacy cached demo upgrades untouched lease index only, not real/user-edited content",()=>{
 const current=fixture(),cached=structuredClone(current);
 for(const contract of cached.contracts){
  delete contract.rentBaseYear;
  delete contract.rentBaseIndex;
  delete contract.rentSeriesBase;
  contract.rentIndexPercent=0;
 }
 cached.contracts[0].tenantName="Lokalt ändrad demotext";
 cached.contracts[1].baseRent+=100;
 assert.equal(updateLegacyDemoIndexTerms(cached,current),3);
 assert.equal(cached.contracts[0].tenantName,"Lokalt ändrad demotext");
 assert.equal(cached.contracts[0].rentIndexPercent,1);
 assert.equal(cached.contracts[1].rentIndexPercent,0);
 assert.equal(cached.contracts[1].baseRent,950100);
 assert.equal(updateLegacyDemoIndexTerms(cached,current),0);
 assert.equal(updateLegacyDemoIndexTerms({...cached,isDemo:false},current),0);
});
