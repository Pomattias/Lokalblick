import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalize } from "../frontend/v2/model.js";
import { shouldRestoreViewSnapshot, hasWorkspaceRecords } from "../frontend/v2/restore-policy.js";
test("demo file exists with three properties and four indexed leases and is normalizable",()=>{
 const file=fs.readFileSync(new URL("../frontend/data/demo-data.js",import.meta.url),"utf8");
 const window={};
 new Function("window",file)(window);
 const data=normalize(window.LokalblickDemoData);
 assert.equal(data.isDemo,true);
 assert.equal(data.properties.length,3);
 assert.equal(data.contracts.length,4);
 assert.ok(data.activities.length>0);
});
test("stale empty browser workspace cannot hide built-in demo",()=>{
 assert.equal(shouldRestoreViewSnapshot({data:{isDemo:false,properties:[],contracts:[],activities:[]}}, {mode:"demo"}),false);
 assert.equal(shouldRestoreViewSnapshot({data:{isDemo:true,properties:[],contracts:[]}}, {mode:"demo"}),false);
 assert.equal(hasWorkspaceRecords({properties:[{id:"p1"}]}),true);
});
test("imported unsaved data is still restored across reloads",()=>{
 assert.equal(shouldRestoreViewSnapshot({data:{isDemo:false,properties:[{id:"p1"}]},meta:{source:"import-staging"}}, {mode:"demo"}),true);
});
test("never override a connected Excel file using another browser snapshot",()=>{
 const snapshot={data:{isDemo:false,properties:[{id:"p1"}]},meta:{sourceMode:"local-excel",fileName:"different.xlsx"}};
 assert.equal(shouldRestoreViewSnapshot(snapshot,{mode:"local-excel",connected:true,fileName:"current.xlsx"}),false);
 assert.equal(shouldRestoreViewSnapshot({...snapshot,meta:{...snapshot.meta,fileName:"current.xlsx"}},{mode:"local-excel",connected:true,fileName:"current.xlsx"}),true);
 assert.equal(shouldRestoreViewSnapshot(snapshot,{mode:"company-api",connected:false}),false);
});

test("maintenance demo presents new, ongoing and completed cases with observations in their actual home",()=>{
 const window={};new Function("window",fs.readFileSync(new URL("../frontend/data/demo-data.js",import.meta.url),"utf8"))(window);
 const data=normalize(window.LokalblickDemoData),cases=data.activities.filter(row=>row.id.startsWith('ACT-DEMO-MAINT-'));
 assert.equal(cases.length,3);assert.deepEqual(cases.map(row=>row.status).sort(),['Klar','Nytt','Pågår']);
 assert(cases.every(row=>row.type==='Underhåll'&&row.includeInBudget==='Nej'));
 for(const point of data.inspectionPoints.filter(row=>row.assessment==='defect')){
  const issue=data.activities.find(row=>row.id===point.issueId),inspection=data.inspections.find(row=>row.id===point.inspectionId);assert(issue);
  assert.equal(issue.objectId||null,inspection.objectId||null);if(!inspection.objectId)assert.equal(issue.propertyId,inspection.propertyId);
 }
 assert(data.spaces.some(row=>row.name==='Toalett'));assert(data.inspectionPoints.some(row=>row.spaceId&&row.assessment==='unchecked'));
 const closed=data.inspectionPoints.find(row=>row.issueId==='ACT-DEMO-MAINT-DONE');assert(data.inspectionPoints.some(row=>row.partId===closed.partId&&row.assessment==='ok'));
 assert(data.inspections.some(row=>row.propertyId&&!row.objectId));assert.equal(data.isDemo,true);assert(data.demoRevision);
});
test("an old cached demo receives the new examples; current demo edits survive reload and imported data is left alone",async()=>{
 const window={};new Function("window",fs.readFileSync(new URL("../frontend/data/demo-data.js",import.meta.url),"utf8"))(window);
 const old=structuredClone(window.LokalblickDemoData);delete old.demoRevision;old.inspections=[];old.inspectionPoints=[];
 const values=new Map([['lokalblick-public-demo-v1',JSON.stringify(old)],['separate-import-workspace','untouched']]);
 const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 new Function('window','localStorage',fs.readFileSync(new URL('../frontend/services/data-service.js',import.meta.url),'utf8'))(window,localStorage);
 const refreshed=await window.LokalblickDemoDataService.load();assert(refreshed.inspections.length>0);
 refreshed.inspectionPoints[0].comment='Ändrat i demot';await window.LokalblickDemoDataService.save(refreshed);
 assert.equal((await window.LokalblickDemoDataService.load()).inspectionPoints[0].comment,'Ändrat i demot');
 const reset=await window.LokalblickDemoDataService.reset();assert.notEqual(reset.inspectionPoints[0].comment,'Ändrat i demot');assert.equal(values.get('separate-import-workspace'),'untouched');
});
