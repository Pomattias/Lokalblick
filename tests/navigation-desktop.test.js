import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../frontend/domain/calculations.js";
import { dashboard, overview, planning, summary } from "../frontend/v2/views.js";

const page=fs.readFileSync(new URL("../frontend/v2/index.html",import.meta.url),"utf8");
const app=fs.readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
const css=fs.readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");

const data={
  isDemo:true,
  properties:[{id:"p",designation:"Hamnen 4",address:"Hamngatan 7",ownerPartyId:"o"}],
  contracts:[{id:"c",number:"A-101",propertyId:"p",area:85,start:"2023-01-01",end:"2030-01-01"}],
  organizations:[{id:"o",name:"Ägaren",type:"owner"}],
  people:[],
  activities:[
    {id:"i1",type:"Underhåll",title:"Takbyte",propertyId:"p",estimatedCost:350000,status:"Planerad",startDate:"2027-03-01",endDate:"2027-07-31"},
    {id:"i2",type:"Projekt",title:"Ombyggnad",propertyId:"p",estimatedCost:1000000,status:"Utreds",planningYear:2028}
  ],
  orders:[],operations:[],auditLog:[],priceBaseAmounts:[{year:2026,amount:59200}],
  indexSeries:[],budgetPlans:[]
};
const selection={owner:"",unit:"",person:"",q:"",propertyId:""};

test("Desktop sidebar has the requested ten sections in order",()=>{
  const menu=page.match(/<nav aria-label="Huvudnavigation">([\s\S]*?)<\/nav>/)?.[1]||"";
  const buttons=[...menu.matchAll(/<button data-view="([^"]+)">([^<]+)<\/button/g)]
    .map(([,view,label])=>({view,label}));
  assert.deepEqual(buttons,[
    {view:"overview",label:"Översikt"},
    {view:"properties",label:"Fastighet"},
    {view:"contracts",label:"Avtal"},
    {view:"activities",label:"Aktiviteter"},
    {view:"plan",label:"Planera"},
    {view:"budget",label:"Budget"},
    {view:"map",label:"Karta"},
    {view:"sources",label:"Datakällor"},
    {view:"people",label:"Organisation"},
    {view:"settings",label:"Inställningar"}
  ]);
});

test("Overview becomes a visual dashboard, Fastighet retains the old table",()=>{
  const html=dashboard(data,selection,2026);
  assert.match(html,/Portföljöversikt/);
  assert.match(html,/dashboard-bar-row/);
  assert.match(html,/data-view="properties"/);
  assert.match(html,/data-view="activities"/);
  assert.doesNotMatch(html,/data-edit="properties"/);
  const properties=overview(data,selection,{perspective:"Fastigheter",hidePerspectiveTabs:true,year:2026});
  assert.match(properties,/Hamnen 4/);
  assert.match(properties,/data-edit="properties"/);
  assert.doesNotMatch(properties,/data-perspective=/);
  assert.match(summary(data,selection,2026,{view:"properties"}),/Fastigheter/);
});

test("Direct Avtal and Aktiviteter pages share the existing records and edit actions",()=>{
  const contracts=overview(data,selection,{perspective:"Avtal",hidePerspectiveTabs:true,year:2026});
  assert.match(contracts,/A-101/);
  assert.match(contracts,/data-edit="contracts"/);
  const all=overview(data,selection,{perspective:"Ärenden",hidePerspectiveTabs:true,year:2026,issueType:"Alla"});
  assert.match(all,/Takbyte/);
  assert.match(all,/Ombyggnad/);
  assert.match(all,/data-edit="activities"/);
  const filtered=overview(data,selection,{perspective:"Ärenden",hidePerspectiveTabs:true,year:2026,issueType:"Projekt"});
  assert.match(filtered,/Ombyggnad/);
  assert.doesNotMatch(filtered,/Takbyte/);
});

test("No changes to editor lifecycle or interactive Planera timeline",()=>{
  assert.match(app,/ui\.view === "overview"\)\s*content\.innerHTML = dashboard/);
  assert.match(app,/ui\.view = "properties";\s*ui\.perspective = "Fastigheter";/);
  assert.match(app,/ui\.view === "contracts" \? "contracts"/);
  const plan=planning(data,selection,{year:2027,planningMode:"timeline",timelineSpan:1,issueType:"Alla",unassigned:false,unassignedHome:false});
  assert.match(plan,/data-plan-issue="i1"/);
  assert.match(plan,/data-edit="activities"/);
});

test("Mobile navigation still exposes the new pages through compact scrollable chips",()=>{
  assert.match(page,/<nav class="mobile-nav"/);
  for(const view of ["overview","properties","contracts","activities","plan","budget","map"])
    assert.ok(page.includes('data-view="'+view+'"'));
  assert.match(css,/\.mobile-nav\s*\{[^}]*overflow-x:auto/);
});
