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
  for(const word of ["Om budgeten","planerade aktiviteter","budgetår","SCB","antaget indextal"])
    assert.ok(html.includes(word),word);
  for(const attr of ["data-budget-index","data-preliminary","data-budget-index-reset","data-budget-totals"])
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
  assert.match(html,/Låst indextal/);
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
