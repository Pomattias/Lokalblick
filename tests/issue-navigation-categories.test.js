import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import "../frontend/domain/calculations.js";
import { renderIssueEditor, ISSUE_CATEGORIES } from "../frontend/v2/issue-editor.js";
import { readEditor } from "../frontend/v2/editor.js";
import { overview, planning } from "../frontend/v2/views.js";

const item={
  id:"a1",type:"Projekt",title:"Ventilationsåtgärder",category:"Ytskick",
  status:"Pågår",propertyId:"p1",estimatedCost:3350000,planningYear:2027,
  planningMonths:[3,5],sourceId:"IMP-1",budgetCategory:"Projekt",
  yearAllocations:[{year:2027,amount:1000000}]
};
const data={
  isDemo:true,properties:[{id:"p1",designation:"Hamnen 4",address:"Hamnvägen 12",
    ownerPartyId:"org1"}],
  contracts:[{id:"c1",number:"SF-101",propertyId:"p1",start:"2026-01-01",end:"2030-01-01"}],
  organizations:[{id:"org1",name:"Stadsfastigheter",type:"owner"}],
  people:[],activities:[item],orders:[],budgetPlans:[],operations:[],
  priceBaseAmounts:[{year:2027,amount:60000}],auditLog:[],indexSeries:[]
};
const selection={owner:"",unit:"",person:"",propertyId:"",q:""};

test("category dropdown uses shared categories, including historic unknown values",()=>{
 const html=renderIssueEditor(data,item,"a1");
 for(const cat of ["Ytskikt","Inredning","Installationer","Ventilation","Ombyggnad","Nya lokaler"])
   assert.ok(ISSUE_CATEGORIES.includes(cat));
 assert.match(html,/name="category"/);
 assert.match(html,/value="Ventilation"/);
 assert.match(html,/value="Ytskick" selected/);
 assert.doesNotMatch(html,/name="category" type="text"/);
});

test("issue name leads, links are labelled clearly and planning months reuse timeline values",()=>{
 const html=renderIssueEditor(data,item,"a1");
 assert.match(html,/class="issue-name">Ventilationsåtgärder/);
 assert.ok(html.indexOf('name="title"')<html.indexOf('name="type"'));
 assert.match(html,/Kopplat till/);
 assert.match(html,/data-issue-month="3" aria-pressed="true"/);
 assert.match(html,/name="planningMonthsInput" value="3,5"/);
 assert.doesNotMatch(html,/data-editor-tab/);
 const legacy=renderIssueEditor(data,{...item,planningMonths:[],planningMonth:7},"a1");
 assert.match(legacy,/data-issue-month="7" aria-pressed="true"/);
});

test("multi-month save, standard classification, provenance and budget allocations survive",()=>{
 const old=globalThis.FormData;
 globalThis.FormData=class {
   forEach(cb) {
     for (const [k,v] of Object.entries({
       type:"Projekt",title:"Ny ventilation",category:"Ventilation",
       issueHome:"contract:c1",planningYear:"2027",planningMonthsInput:"1,3,5,12"
     })) cb(v,k);
   }
 };
 try{
   const updated=readEditor({dataset:{collection:"activities"}},item);
   assert.deepEqual(updated.planningMonths,[1,3,5,12]);
   assert.equal(updated.planningMonth,null);
   assert.equal(updated.category,"Ventilation");
   assert.equal(updated.contractId,"c1");
   assert.equal(updated.propertyId,"");
   assert.equal(updated.id,"a1");
   assert.equal(updated.sourceId,"IMP-1");
   assert.deepEqual(updated.yearAllocations,[{year:2027,amount:1000000}]);
   assert.equal("planningMonthsInput" in updated,false);
   assert.equal("issueHome" in updated,false);
 } finally {globalThis.FormData=old;}
});

test("non-numeric month strings are rejected rather than silently lost",()=>{
 const old=globalThis.FormData;
 globalThis.FormData=class {forEach(cb) {
   cb("Projekt","type");cb("Ärende","title");cb("3,99","planningMonthsInput");
 }};
 try {
   assert.throws(()=>readEditor({dataset:{collection:"activities"}},item),/giltiga planeringsmånader/);
 } finally {globalThis.FormData=old;}
});

test("Fastigheter and Avtal offer contextual shortcuts to the same Ärende editor",()=>{
 const propertyTable=overview(data,selection,{year:2027,perspective:"Fastigheter",hidePerspectiveTabs:true});
 assert.match(propertyTable,/data-new-issue-property="p1"/);
 assert.doesNotMatch(propertyTable,/data-perspective="Avtal"/);
 const contractTable=overview(data,selection,{year:2027,perspective:"Avtal",hidePerspectiveTabs:true});
 assert.match(contractTable,/SF-101/);
 const plan=planning(data,selection,{issueType:"Alla",planningMode:"list",year:2027,unassigned:false,unassignedHome:false});
 assert.match(plan,/data-new-issue/);
 assert.match(plan,/Kopplat till/);
 const nav=fs.readFileSync("frontend/v2/index.html","utf8");
 assert.match(nav,/data-view="properties">Fastigheter/);
 assert.match(nav,/data-view="issues">Ärenden/);
});
