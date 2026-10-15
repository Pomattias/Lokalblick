import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/recurring-costs.js";
import {recurringCostPanel} from "../frontend/v2/recurring-costs-ui.js";

test("Recurring costs render in budget without extra top-level navigation",()=>{
 const data={
  properties:[{id:"p1",designation:"Hamnen 4"},{id:"p2",designation:"Parken 2"}],
  contracts:[{id:"a1",propertyId:"p1",number:"A-1"}],
  recurringCosts:[
   {id:"el",name:"El",propertyId:"p1",contractId:"",annualAmount:60000,startYear:2027,endYear:null,actuals:[]},
   {id:"rent-clean",name:"Städning",propertyId:"",contractId:"a1",annualAmount:12000,startYear:2027,endYear:null,actuals:[]},
   {id:"water",name:"VA",propertyId:"p2",contractId:"",annualAmount:4000,startYear:2027,endYear:null,actuals:[]}
  ]
 };
 const visible={properties:[data.properties[0]],contracts:[data.contracts[0]]};
 const panel=recurringCostPanel(data,2027,visible,true);
 assert.match(panel,/Löpande kostnader/);
 assert.match(panel,/Hamnen 4/);
 assert.match(panel,/Städning/);
 assert.match(panel,/Ny kostnad/);
 assert.doesNotMatch(panel,/VA<\/td>/);
 assert.match(panel,/72\s?000 kr/);
});
