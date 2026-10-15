import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const headers=["Verksamhet","Namn på verksamheten","Adress","Innehåll","Projektnamn","Kommentar",
  "Sanelas kommentarer","Stadsfastigheter","Prio ","Kluster","Ansvarig","Budget",
  "Drift eller investering","Standardhöjande","Budget Drift","Budget Inv.","Årshyra",
  "Inflytt","Avtalslängd","Påverkan 2027","Betalas som hyrespåslag"];
function workbook(data) {
  return {SheetNames:["2027"],Sheets:{"2027":{rows:[headers,...data]}}};
}
function row(overrides={}) {
  return headers.map(k=>({
    Verksamhet:"Vårdbo","Namn på verksamheten":"Solgården",Adress:"Testvägen 1",
    Innehåll:"Ytskikt",Projektnamn:"Renovering av golv",Kommentar:"Utred behovet",
    "Sanelas kommentarer":"Beslut inväntas","Prio ":2,Budget:800,
    "Budget Inv.":800,"Betalas som hyrespåslag":"X"
  })[k] ?? overrides[k] ?? "");
}
const context={globalThis:null,XLSX:{utils:{sheet_to_json:s=>s.rows}}};
context.globalThis=context;
vm.runInNewContext(fs.readFileSync(new URL("../frontend/services/project-2027-adapter.js",import.meta.url),"utf8"),context);
const adapter=context.LokalblickProject2027Adapter;
const baseline=()=>({
  properties:[{id:"p1",address:"Testvägen 1"}],
  contracts:[{id:"c1",propertyId:"p1",businessName:"Solgården"}],
  activities:[],people:[],sourceRegistry:[],importReview:[]
});
test("2027 activity attaches to matching contract and stores dated-source comments",()=>{
  const {data,report}=adapter.enrich(workbook([row()]),baseline(),"Projekt 2027.xlsx");
  assert.equal(report.counts.activitiesCreated,1);
  assert.equal(data.activities[0].contractId,"c1");
  assert.equal(data.activities[0].scopeType,"contract");
  assert.equal(data.activities[0].comments.length,2);
  assert.equal(data.activities[0].comments[0].createdAt,null);
  assert.equal(data.activities[0].priority,2);
});
test("reimport updates rather than duplicating activities or comments",()=>{
  const w=workbook([row()]);
  const first=adapter.enrich(w,baseline(),"Projekt 2027.xlsx").data;
  const second=adapter.enrich(w,first,"Projekt 2027.xlsx");
  assert.equal(second.data.activities.length,1);
  assert.equal(second.report.counts.activitiesUpdated,1);
  assert.equal(second.data.activities[0].comments.length,2);
});
test("unverified money never enters budget while rent-supplement preserves raw cost",()=>{
  const {data}=adapter.enrich(workbook([row()]),baseline(),"Projekt 2027.xlsx");
  const activity=data.activities[0];
  assert.equal(activity.project2027BudgetRaw,800);
  assert.equal(activity.project2027BudgetUnit,"unverified");
  assert.equal(activity.includeInBudget,"Nej");
  assert.equal(activity.project2027RentSurcharge,true);
  assert.equal(activity.estimatedCost,undefined);
});
test("possible identical title/home stops automatic new activity",()=>{
  const base=baseline();
  base.activities.push({id:"already",title:"Renovering av golv",propertyId:"p1"});
  const {data,report}=adapter.enrich(workbook([row()]),base,"Projekt 2027.xlsx");
  assert.equal(data.activities.length,1);
  assert.equal(report.counts.possibleDuplicates,1);
});
