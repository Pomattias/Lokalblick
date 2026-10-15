import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../frontend/domain/calculations.js";
import "../frontend/domain/budget-followup.js";
import {budget} from "../frontend/v2/views.js";

const data=()=>({
  properties:[{id:"p",address:"Exempelgatan 1"}],
  contracts:[{id:"c",propertyId:"p",number:"TEST-1",area:200,start:"2025-01-01",end:"2032-12-31",
    baseRent:100000,rentBaseYear:2025,rentBaseIndex:419.35,rentIndexPercent:1,
    baseAdditions:0,additionIndexPercent:0}],
  objects:[],people:[],organizations:[],activities:[],orders:[],
  indexSeries:[{year:2026,month:9,value:441.45,seriesBase:"1980",source:"SCB KPI",preliminary:false}],
  budgetPlans:[]
});
const selection={propertyId:"",unit:"",person:"",owner:"",q:""};
const render=(state)=>{
  const previous=globalThis.LokalblickBudgetUI;
  globalThis.LokalblickBudgetUI={html:()=>""};
  try{return budget(state,selection,{year:2027});}
  finally{globalThis.LokalblickBudgetUI=previous;}
};
test("short budget introduction is collapsed and explains index choices",()=>{
  const html=render(data());
  assert.match(html,/<details class="budget-about/);
  assert.doesNotMatch(html,/<details class="budget-about[^"]*" open/);
  for(const word of ["Om budgeten","Aktiviteter","budgetåret","KPI","eget oktoberindextal"])
    assert.ok(html.includes(word),word);
  for(const attr of ["data-budget-index","data-preliminary","data-budget-index-reset","data-budget-totals","data-budget-rent-compare","Senaste fastställda KPI","Nuvarande hyra","Preliminär hyra"])
    assert.ok(html.includes(attr),attr);
});
test("own index changes rent forecast and leaves source records unmodified",()=>{
  const original=data(),beforeJSON=JSON.stringify(original),calcs=globalThis.LokalblickCalculations;
  const proposed={...original,budgetPlans:[{year:2027,status:"Arbetsbudget",preliminaryIndex:466,adjustments:{},lines:[]}]};
  const sum=x=>calcs.budgetProposal(x,2027).filter(r=>r.budgetGroup==="Hyra").reduce((s,r)=>s+r.amount,0);
  assert.ok(sum(proposed)>sum(original));
  assert.equal(JSON.stringify(original),beforeJSON);
  assert.match(render(proposed),/value="466"/);
});
test("a locked budget cannot edit index and keeps locked value",()=>{
  const state=data();
  state.budgetPlans=[{year:2027,status:"Låst",preliminaryIndex:466,lockedIndexValue:466,lines:[],targets:{}}];
  const html=render(state);
  assert.match(html,/Låst index/);
  assert.doesNotMatch(html,/data-preliminary/);
  assert.doesNotMatch(html,/data-budget-index-reset/);
});
test("typing computes an unsaved scenario and updates the budget cards immediately",()=>{
  const app=readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
  for(const fragment of ['function previewBudgetIndex(','document.addEventListener("input",event=>',
    'previewBudgetIndex(field)','temporary.innerHTML=budget(draft,selection,ui)',
    'live.replaceWith(updated)','data-budget-index-reset','if(plan?.status==="Låst")return',
    'if (x.hasAttribute("data-preliminary")) {','if (x.dataset.adjust)'])
    assert.ok(app.includes(fragment),fragment);
});


test("last confirmed KPI month is displayed and a manual assumption wins over confirmed October",()=>{
  const calc=globalThis.LokalblickCalculations;
  const d=data();
  assert.deepEqual(
    [calc.latestKnownKpi(d,2027).year,calc.latestKnownKpi(d,2027).month],
    [2026,9]
  );
  assert.match(render(d),/september 2026/);
  const withOctober={...d,indexSeries:[{year:2026,month:10,value:448.5,seriesBase:"1980",source:"SCB KPI",preliminary:false}]};
  const official=calc.annualValues(withOctober.contracts[0],2027,0,withOctober.indexSeries);
  const manual=calc.annualValues(withOctober.contracts[0],2027,466,withOctober.indexSeries);
  assert.ok(manual.total>official.total);
  assert.equal(calc.budgetIndex(withOctober,2027,466).value,466);
  assert.equal(manual.rent.preliminary,true);
});
test("missing target October falls back to a dated confirmed KPI, not a guessed value",()=>{
 const calc=globalThis.LokalblickCalculations;
 const d=data();d.indexSeries=[];
 const known=calc.latestKnownKpi(d,2027);
 assert.equal(known.year,2025);
 assert.equal(known.month,10);
 assert.equal(known.value,419.35);
 const assumed=calc.budgetIndex(d,2027,0);
 assert.equal(assumed.value,419.35);
 assert.equal(assumed.status,"Preliminär");
});
test("locked rent comparison uses the saved rows, not a newly indexed forecast",()=>{
  const d=data();
  d.budgetPlans=[{year:2027,status:"Låst",preliminaryIndex:466,lockedIndexValue:466,
     lines:[{sourceType:"contract",sourceId:"c",contractId:"c",category:"Hyra + drift",amount:90000,baseAmount:90000,lockedAt:"2026-10-15"}],targets:{}}];
  const html=render(d);
  assert.match(html,/Låst hyra 2027/);
  assert.ok(html.replaceAll("\u00a0"," ").includes("90 000 kr"));
  assert.doesNotMatch(html,/data-preliminary/);
});


test("ordinary lease validation remains strict when October index is unavailable",()=>{
  const calc=globalThis.LokalblickCalculations;
  const c={baseRent:100000,rentBaseYear:2025,rentBaseIndex:419.35,rentIndexPercent:0.8};
  assert.equal(calc.component(c,"rent",2027,0,[]).status,"Behöver kontroll");
  const budget=calc.annualValues(c,2027,0,[],{allowLatestKpi:true});
  assert.equal(budget.rent.status,"Preliminär");
  assert.ok(budget.rent.amount>0);
});


test("connected corrected SCB October reading takes precedence over static reference without false conflict",()=>{
  const c=globalThis.LokalblickCalculations;
  const d=data();
  d.indexSeries=[{year:2025,month:10,value:420,seriesBase:"1980",source:"SCB KPI, rättad",preliminary:false}];
  assert.equal(c.latestKnownKpi(d,2026).value,420);
  assert.equal(c.latestKnownKpi(d,2026).status,"Fastställd");
});
