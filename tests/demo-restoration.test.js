import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalize } from "../frontend/v2/model.js";
import { shouldRestoreViewSnapshot, hasWorkspaceRecords } from "../frontend/v2/restore-policy.js";
test("demo file exists with three properties and leases and is normalizable",()=>{
 const file=fs.readFileSync(new URL("../frontend/data/demo-data.js",import.meta.url),"utf8");
 const window={};
 new Function("window",file)(window);
 const data=normalize(window.LokalblickDemoData);
 assert.equal(data.isDemo,true);
 assert.equal(data.properties.length,3);
 assert.equal(data.contracts.length,3);
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
