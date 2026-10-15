import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {LokalblickRepository} from "../backend/company/data-repository.js";

test("Recurring costs persist through the private company repository", async t=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),"lokalblick-recurring-"));
 t.after(()=>fs.rm(folder,{recursive:true,force:true}));
 const dataPath=path.join(folder,"data.json");
 const sourceAdapter={
  loadCore:async()=>({properties:[{id:"p1",address:"Testgatan 1"}],contracts:[{id:"a1",propertyId:"p1",number:"A-1"}]}),
  loadCoordinates:async()=>[]
 };
 const repo=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();
 const row={id:"energy",name:"El",propertyId:"p1",contractId:"",annualAmount:10000,startYear:2027,endYear:null,actuals:[]};
 await repo.create("recurringCosts",row);
 assert.equal((await repo.list("recurringCosts")).length,1);
 await assert.rejects(repo.create("recurringCosts",{...row,id:"invalid",contractId:"a1"}),/antingen fastighet eller avtal/);
 await repo.update("recurringCosts","energy",{annualAmount:12500,actuals:[{year:2027,amount:12000}]});
 assert.equal((await repo.get("recurringCosts","energy")).annualAmount,12500);
 const restarted=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();
 const saved=(await restarted.bootstrap()).recurringCosts;
 assert.equal(saved.length,1);
 assert.equal(saved[0].actuals[0].amount,12000);
});
