import {sourceServiceScript} from "./helpers/source-service.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import XLSX from "xlsx";
import "../frontend/domain/calculations.js";
import {normalize} from "../frontend/v2/model.js";
import {renderContractEditor} from "../frontend/v2/contract-editor.js";

const C=globalThis.LokalblickCalculations;
const nearly=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.01,actual+" != "+expected);
const base={id:"t",baseRent:100000,rentBaseYear:2024,rentBaseIndex:415.51,rentIndexPercent:0.8,baseAdditions:25000,
  additionBaseYear:2024,additionBaseIndex:415.51,additionIndexPercent:0};
const series=[
 {year:2025,month:10,value:419.35,seriesBase:"1980",source:"SCB KPI"},
 {year:2026,month:10,value:460,seriesBase:"1980",source:"SCB KPI"},
 {year:2027,month:10,value:500,seriesBase:"1980",source:"SCB KPI"}
];
test("legacy lease uses existing base-index formula without a method value",()=>{
 const original=C.annualValues(base,2027,0,series);
 nearly(original.rent.amount,100000*(1+0.8*(460/415.51-1)));
 assert.equal(original.addition.amount,25000);
 assert.equal(original.rent.status,"Beräknad");
});
test("a fixed yearly percentage compounds from the year after the baseline",()=>{
 const c={...base,rentAdjustmentMethod:"fixed",rentAnnualPercent:3};
 nearly(C.annualValues(c,2025,0,series).rent.amount,100000);
 nearly(C.annualValues(c,2026,0,series).rent.amount,103000);
 nearly(C.annualValues(c,2027,0,series).rent.amount,106090);
 nearly(C.annualValues(c,2028,0,series).rent.amount,109272.7);
 assert.equal(C.annualValues(c,2028,0,series).addition.amount,25000);
});
test("KPI with limits on RENT increases applies its floor and ceiling each year",()=>{
 const c={...base,rentAdjustmentMethod:"kpi-limited",rentMinPercent:2,rentMaxPercent:4,rentLimitBasis:"rent"};
 nearly(C.annualValues(c,2026,0,series).rent.amount,102000);
 nearly(C.annualValues(c,2027,0,series).rent.amount,106080);
 nearly(C.annualValues(c,2028,0,series).rent.amount,110323.2);
});
test("a limit on KPI growth is applied before the contractual index share",()=>{
 const c={...base,rentAdjustmentMethod:"kpi-limited",rentMinPercent:2,rentMaxPercent:4,rentLimitBasis:"index"};
 nearly(C.annualValues(c,2026,0,series).rent.amount,101600);
 nearly(C.annualValues(c,2027,0,series).rent.amount,104851.2);
});
test("bounded KPI remains preliminary for a user-provided current October figure",()=>{
 const c={...base,rentAdjustmentMethod:"kpi-limited",rentMinPercent:2,rentMaxPercent:4,rentLimitBasis:"rent"};
 const own=C.annualValues(c,2027,475,series,{scenario:true});
 assert.equal(own.rent.status,"Preliminär");
 nearly(own.rent.amount,106080);
 assert.equal(own.rent.usedIndex,475);
 assert.equal(C.annualValues(c,2027,475,series).rent.usedIndex,460);
});
test("missing intermediate October and reversed min/max cannot silently calculate",()=>{
 const c={...base,rentAdjustmentMethod:"kpi-limited",rentMinPercent:4,rentMaxPercent:2,rentLimitBasis:"rent"};
 assert.equal(C.annualValues(c,2027,0,series).rent.status,"Behöver kontroll");
 const valid={...c,rentMinPercent:2,rentMaxPercent:4};
 assert.equal(C.annualValues(valid,2028,0,series.slice(0,1)).rent.status,"Behöver kontroll");
 assert.throws(()=>C.budgetProposal({contracts:[{...c,id:"c",start:"2027-01-01",end:"2027-12-31"}],budgetPlans:[],activities:[]},2027,{strict:true}),/index/);
});
test("rent and additions have distinct agreed adjustment methods",()=>{
 const c={...base,rentAdjustmentMethod:"fixed",rentAnnualPercent:3,
   additionAdjustmentMethod:"none"};
 const a=C.annualValues(c,2027,0,series);
 nearly(a.rent.amount,106090);
 nearly(a.addition.amount,25000);
 const b=C.annualValues({...c,additionAdjustmentMethod:"fixed",additionAnnualPercent:2},2027,0,series);
 nearly(b.addition.amount,26010);
});
test("roundtrip through Avtal worksheet preserves both component rules and limits",()=>{
 const data=normalize({properties:[{id:"p",address:"Demogatan 1"}],contracts:[{...base,propertyId:"p",
   rentAdjustmentMethod:"kpi-limited",rentMinPercent:2,rentMaxPercent:4,rentLimitBasis:"index",
   additionAdjustmentMethod:"fixed",additionAnnualPercent:1.5}]});
 const context=vm.createContext({window:{},XLSX,console,Date,Map,Set,URL,Uint8Array,TextDecoder,
   localStorage:{removeItem(){},getItem(){return null},setItem(){}}});
 vm.runInContext(sourceServiceScript(),context);
 const svc=context.window.LokalblickSourceService;
 const saved=svc.workbookToData(svc.dataToWorkbook(data));
 const c=saved.contracts[0];
 assert.equal(c.rentAdjustmentMethod,"kpi-limited");
 assert.equal(c.rentMinPercent,2);assert.equal(c.rentMaxPercent,4);
 assert.equal(c.rentLimitBasis,"index");
 assert.equal(c.additionAdjustmentMethod,"fixed");
 assert.equal(c.additionAnnualPercent,1.5);
 nearly(C.annualValues(c,2027,0,series).addition.amount,25000*Math.pow(1.015,2));
});
test("both rent and additions offer method fields independently in editor",()=>{
 const contract={...base,propertyId:"p",rentAdjustmentMethod:"fixed",rentAnnualPercent:3,
  additionAdjustmentMethod:"kpi-limited",additionMinPercent:1,additionMaxPercent:4};
 const data={isDemo:true,contracts:[contract],properties:[{id:"p",address:"Demogatan 1"}],
   people:[],organizations:[],objects:[],activities:[],assignments:[],businesses:[],contractBusinesses:[],indexSeries:series};
 const html=renderContractEditor(data,contract,contract.id);
 for(const field of ["rentAdjustmentMethod","rentAnnualPercent","rentMinPercent","rentMaxPercent",
   "rentLimitBasis","additionAdjustmentMethod","additionAnnualPercent","additionMinPercent","additionMaxPercent","additionLimitBasis"])
   assert.ok(html.includes('name="'+field+'"'),field);
 assert.match(html,/data-rule-for="rent"/);
 assert.match(html,/data-rule-for="addition"/);
 assert.match(html,/Fast årlig procent/);
});
