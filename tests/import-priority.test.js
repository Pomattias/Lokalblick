import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import XLSX from "xlsx";
import { normalize, bulkReviewDecision, importPreferenceKey } from "../frontend/v2/model.js";
import { sources } from "../frontend/v2/views.js";
const fixture=()=>normalize({isDemo:false,properties:[{id:"p1",ownerPartyId:"o1",address:"Gata 1"},{id:"p2",ownerPartyId:"o1",address:"Gata 2"}],organizations:[{id:"o1",name:"Bolag A",type:"owner"},{id:"o2",name:"Bolag B",type:"owner"}],importReview:[
 {id:"r1",kind:"operational-conflict",status:"pending",collection:"properties",recordId:"p1",field:"ownerPartyId",source:"berikning.xlsx",current:"o1",proposed:"o2"},
 {id:"r2",kind:"operational-conflict",status:"pending",collection:"properties",recordId:"p2",field:"ownerPartyId",source:"berikning.xlsx",current:"o1",proposed:"o2"},
 {id:"r3",kind:"operational-conflict",status:"pending",collection:"properties",recordId:"p1",field:"address",source:"berikning.xlsx",current:"Gata 1",proposed:"Gata 3"},
 {id:"r4",kind:"match",status:"pending",source:"berikning.xlsx"}
 ]});
test("one source priority solves owner field only; person and address reviews stay open",()=>{
 const d=fixture(),n=bulkReviewDecision(d,{collection:"properties",field:"ownerPartyId",source:"berikning.xlsx"},"accept","test");
 assert.equal(n,2);
 assert.equal(d.properties[0].ownerPartyId,"o2");
 assert.equal(d.properties[1].ownerPartyId,"o2");
 assert.equal(d.properties[0].address,"Gata 1");
 assert.equal(d.importReview.filter(x=>x.status==="pending").length,2);
 assert.equal(d.importFieldPreferences[importPreferenceKey("properties","ownerPartyId","berikning.xlsx")],"accept");
});
test("stale values abort the entire group before any edits",()=>{
 const d=fixture();d.properties[1].ownerPartyId="changed";
 assert.throws(()=>bulkReviewDecision(d,{collection:"properties",field:"ownerPartyId",source:"berikning.xlsx"},"accept","test"),/ändrats/);
 assert.equal(d.properties[0].ownerPartyId,"o1");
 assert.equal(d.importReview[0].status,"pending");
});
test("source selection lists field, count, and filename",()=>{
 const markup=sources(fixture(),{status:()=>({connected:false,dirty:false,pendingChanges:[]}),company:()=>false});
 assert.match(markup,/Välj källa för alla konflikter/);
 assert.match(markup,/2 konflikter/);
 assert.match(markup,/berikning.xlsx/);
 assert.match(markup,/data-priority-apply/);
});
test("priority rules persist in the canonical workbook",()=>{
 const ctx={window:{},XLSX,console,Date,Map,Set,URL,Uint8Array,TextDecoder,localStorage:{removeItem(){},getItem(){return null;},setItem(){}}};
 vm.runInNewContext(fs.readFileSync("frontend/services/source-service.js","utf8"),ctx);
 const source=ctx.window.LokalblickSourceService;
 const d=fixture();
 bulkReviewDecision(d,{collection:"properties",field:"ownerPartyId",source:"berikning.xlsx"},"reject","test");
 const reloaded=source.workbookToData(source.dataToWorkbook(d));
 assert.equal(reloaded.importFieldPreferences[importPreferenceKey("properties","ownerPartyId","berikning.xlsx")],"reject");
});

// The original review export may contain the same property/field discrepancy
// twice, once from the core importer and once from operational enrichment.
test("duplicate source reviews are resolved with a single property modification",()=>{
 const d=fixture();
 d.importReview.splice(1,0,{...d.importReview[0],id:"r1-duplicate"});
 const result=bulkReviewDecision(d,{collection:"properties",field:"ownerPartyId",source:"berikning.xlsx"},"accept","test");
 assert.equal(result,3);
 assert.equal(d.properties[0].ownerPartyId,"o2");
 assert.equal(d.importReview.filter(x=>x.status==="pending").length,2);
 const ownerChanges=d.auditLog.filter(x=>x.recordId==="p1");
 assert.equal(ownerChanges.length,1);
});
