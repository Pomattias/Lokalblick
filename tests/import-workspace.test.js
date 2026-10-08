import test from "node:test";
import assert from "node:assert/strict";
import { retainImportedData } from "../frontend/v2/import-workspace.js";
const clone = data => JSON.parse(JSON.stringify(data));
test("first import and later enrichment are cumulative without an Excel file", async () => {
  let workspace = null, mode = "demo";
  const bridge = {
    async save(data) { workspace = clone(data); return { data: clone(data) }; },
    activate() { mode = "view-bridge"; },
  };
  const transport = {
    status() { return { connected: false, staged: mode === "view-bridge" }; },
    async load() { return clone(workspace); },
    async save(data) { workspace = clone(data); return clone(data); },
  };
  const first = await retainImportedData({
    isDemo: false, properties: [{ id: "p1" }],
    contracts: [{ id: "c1", propertyId: "p1", baseRent: 100 }],
    activities: [],
  }, transport, bridge, {});
  assert.equal(first.mode, "staged");
  assert.equal(mode, "view-bridge");
  assert.equal(first.data.properties.length, 1);
  const enriched = clone(first.data);
  enriched.contracts[0].baseAdditions = 20;
  enriched.activities.push({id:"a1",contractId:"c1",type:"Underhåll"});
  const second = await retainImportedData(enriched, transport, bridge, {});
  assert.equal(second.data.contracts[0].baseRent, 100);
  assert.equal(second.data.contracts[0].baseAdditions, 20);
  assert.equal(second.data.activities.length, 1);
  const edited = await transport.save({...second.data,sourceName:"arbetsyta"});
  assert.equal(edited.isDemo, false);
});
test("existing connected Excel workspace retains all previous records", async () => {
  let saved;
  const transport = {
    status:()=>({connected:true,sourceKind:"canonical"}),
    save:async value=>{saved=clone(value);return saved;}
  };
  const result=await retainImportedData({
    properties:[{id:"p1"},{id:"p2"}],contracts:[{id:"c1"}],activities:[{id:"a1"}],
  },transport,null,null);
  assert.equal(result.mode,"connected");
  assert.equal(saved.properties.length,2);
  assert.equal(saved.activities.length,1);
});
test("read-only migration source stays in memory for further enrichment",async()=>{
 let memory=null;
 const source={adoptViewState:data=>{memory=clone(data);return memory;}};
 const transport={status:()=>({connected:true,sourceKind:"migration"})};
 const first=await retainImportedData({properties:[{id:"p1"}],contracts:[{id:"c1"}]},transport,null,source);
 const second=await retainImportedData({...first.data,activities:[{id:"a1"}]},transport,null,source);
 assert.equal(second.mode,"migration");
 assert.equal(memory.contracts.length,1);
 assert.equal(memory.activities.length,1);
});
test("failed browser persistence blocks replacing the active workspace",async()=>{
 await assert.rejects(
   retainImportedData({properties:[{id:"p1"}]}, {status:()=>({connected:false})},{
     save:async()=>null,activate:()=>{throw Error("must not activate");}
   },{}),/kunde inte sparas/
 );
});
