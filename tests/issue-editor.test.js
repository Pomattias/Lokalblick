import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import { renderIssueEditor, applyIssueHome } from "../frontend/v2/issue-editor.js";
import { editorHtml, readEditor } from "../frontend/v2/editor.js";
import { overview, planning } from "../frontend/v2/views.js";

const property={id:"p1",designation:"Hamnen 4",address:"Hamnvägen 12",ownerPartyId:"owner"};
const contract={id:"c1",number:"A-101",propertyId:"p1",unitId:"VARDBO"};
const project={
 id:"a1",type:"Projekt",title:"Bygg om lokal",description:"Planerat arbete",status:"Planerad",
 propertyId:"p1",responsiblePersonId:"person",estimatedCost:300000,
 planningYear:2027,startDate:"2027-01-01",endDate:"2027-09-30",
 actionKind:"value_enhancing",budgetCategory:"Projekt",includeInBudget:"Ja",
 yearAllocations:[{year:2027,amount:150000},{year:2028,amount:150000}],
 sourceId:"SOURCE-1",
};
const wish={
 id:"a2",type:"Önskemål",title:"Ny belysning",description:"Önskat byte",
 status:"Nytt",contractId:"c1",budgetCategory:"Ej budget",includeInBudget:"Nej",
 yearAllocations:[],estimatedCost:20000,
};
const data={
 isDemo:true,
 properties:[property],contracts:[contract],organizations:[
  {id:"owner",name:"Stadsfastigheter",type:"owner"},
  {id:"our",name:"Vår organisation",type:"our"}
 ],
 people:[{id:"person",name:"Ansvarig",organizationId:"our"}],
 activities:[project,wish],orders:[{id:"o1",activityId:"a1",supplier:"Firma AB",paymentStatus:"Betald",finalCost:12000}],
 indexSeries:[],budgetPlans:[],priceBaseAmounts:[{year:2027,amount:60000}],auditLog:[],
};
const selection={unit:"",owner:"",person:"",q:"",propertyId:""};

test("every issue uses the same compact activities form, without tabs",()=>{
 const html=renderIssueEditor(data,project,"a1");
 assert.match(html,/id="edit-form" data-collection="activities"/);
 assert.match(html,/Ärende/);
 for(const field of ["type","title","description","status","priority","issueHome",
   "responsiblePersonId","startDate","endDate","estimatedCost",
   "actionKind","includeInBudget"])
   assert.match(html,new RegExp('name="'+field+'"'));
 assert.doesNotMatch(html,/data-editor-tab|data-editor-section/);
 assert.match(html,/Årsfördelning/);
 assert.match(html,/Firma AB/);
 assert.match(html,/Beräknad ekonomisk bedömning/);
 assert.match(html,/name="issueHome"/);
 assert.match(html,/value="property:p1" selected/);
 assert.match(renderIssueEditor(data,wish,"a2"),/value="contract:c1" selected/);
});

test("editorHtml routes any activity to the exact same form",()=>{
 const old=globalThis.window;
 globalThis.window={LokalblickSourceService:{schemas:[{key:"activities",sheet:"Aktiviteter",columns:[]}]}};
 try{
   const wrapped=editorHtml(data,"activities","a1",false);
   const direct=renderIssueEditor(data,project,"a1");
   assert.equal(wrapped.html,direct);
   assert.equal(wrapped.record.id,project.id);
 } finally {globalThis.window=old;}
});

test("renaming a wish to underhåll keeps id, source and annual allocations",()=>{
 const form={dataset:{collection:"activities"}};
 const old=globalThis.FormData;
 globalThis.FormData=class {
   forEach(cb){
     for(const [k,v] of [
       ["type","Underhåll"],["title","Ny belysning"],["status","Planerad"],
       ["issueHome","property:p1"],["estimatedCost","23000"],
       ["actionKind","like_for_like"],["includeInBudget","Ja"]
     ])cb(v,k);
   }
 };
 try{
   const next=readEditor(form,{...wish,sourceId:"OLD-IMPORT",yearAllocations:[{year:2027,amount:3000}]});
   assert.equal(next.id,"a2");
   assert.equal(next.type,"Underhåll");
   assert.equal(next.budgetCategory,"Underhåll");
   assert.equal(next.includeInBudget,"Ja");
   assert.equal(next.propertyId,"p1");
   assert.equal(next.contractId,"");
   assert.equal(next.scopeType,"property");
   assert.equal("issueHome" in next,false);
   assert.equal(next.sourceId,"OLD-IMPORT");
   assert.deepEqual(next.yearAllocations,[{year:2027,amount:3000}]);
   assert.equal(next.estimatedCost,23000);
 } finally {globalThis.FormData=old;}
});

test("an issue keeps one identity when switching between home types",()=>{
 const issue={id:"a",propertyId:"p1",contractId:""};
 applyIssueHome(issue,"contract:c1");
 assert.equal(issue.id,"a");
 assert.equal(issue.contractId,"c1");
 assert.equal(issue.propertyId,"");
 assert.equal(issue.scopeType,"contract");
 applyIssueHome(issue,"unit:VARDBO");
 assert.equal(issue.contractId,"");
 assert.equal(issue.unitId,"VARDBO");
 applyIssueHome(issue,"general");
 assert.equal(issue.scopeType,"general");
 assert.equal(issue.unitId,"");
 assert.throws(()=>applyIssueHome(issue,"bad:source"),/Ogiltig hemvist/);
});

test("missing title and reversed dates reject edits",()=>{
 const base={...project};
 const original=globalThis.FormData;
 try {
   globalThis.FormData=class {forEach(cb){cb("","title");cb("Projekt","type");}};
   assert.throws(()=>readEditor({dataset:{collection:"activities"}},base),/rubrik/);
   globalThis.FormData=class {forEach(cb){
     cb("Planerat","title");cb("Projekt","type");
     cb("2028-01-01","startDate");cb("2027-01-01","endDate");
   }};
   assert.throws(()=>readEditor({dataset:{collection:"activities"}},base),/Slutdatum/);
 } finally {globalThis.FormData=original;}
});

test("overview groups all types under Ärenden and Planera is another route",()=>{
 const all=overview(data,selection,{perspective:"Ärenden",issueType:"Alla",year:2027});
 assert.match(all,/data-perspective="Ärenden"/);
 assert.match(all,/data-issue-type="Projekt"/);
 assert.doesNotMatch(all,/data-perspective="Projekt"/);
 assert.match(all,/Bygg om lokal/);
 assert.match(all,/Ny belysning/);
 const filtered=overview(data,selection,{perspective:"Ärenden",issueType:"Projekt",year:2027});
 assert.match(filtered,/Bygg om lokal/);
 assert.doesNotMatch(filtered,/Ny belysning/);
 const plan=planning(data,selection,{issueType:"Alla",year:2027,planningMode:"list",unassigned:false,unassignedHome:false,timelineSpan:1});
 assert.match(plan,/data-new-issue/);
 assert.match(plan,/data-edit="activities" data-id="a1"/);
 assert.match(plan,/Ärenden och ansvar/);
});
