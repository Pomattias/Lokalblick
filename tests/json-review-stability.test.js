import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import XLSX from "xlsx";
import "../frontend/domain/calculations.js";
import { normalize } from "../frontend/v2/model.js";
import { overview, sources } from "../frontend/v2/views.js";
const C=globalThis.LokalblickCalculations;
function adapter() {
 const context={XLSX,console,Date,Map,Set,Math};
 vm.runInNewContext(fs.readFileSync("frontend/services/address-match.js","utf8"),context);
 vm.runInNewContext(fs.readFileSync("frontend/services/operational-enrichment-adapter.js","utf8"),context);
 return context.LokalblickOperationalEnrichmentAdapter;
}
test("property annual cost is calculated from contract periods and never saved on properties",()=>{
 const data=normalize({isDemo:false,properties:[{id:"p",address:"Exempelgatan 1",designation:"TEST 1"}],contracts:[
  {id:"c1",propertyId:"p",baseRent:120000,rentIndexPercent:0,baseAdditions:12000,additionIndexPercent:0,annualContractDrift:6000,start:"2026-07-01",end:"2026-12-31"},
  {id:"c2",propertyId:"p",baseRent:70000,rentIndexPercent:0,end:"2025-12-31"}]});
 const value=C.propertyAnnualCost(data,"p",2026);
 assert.ok(Math.abs(value.annualCost-138000*184/365)<0.001);
 assert.equal(value.activeContracts,1);
 assert.equal(C.propertyAnnualCost(data,"p",2027).annualCost,0);
 const html=overview(data,{propertyId:"",unit:"",owner:"",person:"",q:""},{perspective:"Fastigheter",year:2026,contractId:""});
 assert.match(html,/Årskostnad 2026/);
 assert.equal(data.properties[0].annualCost,undefined);
});
test("distinct numbered orders stay separate and repeated import does not duplicate",()=>{
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
  ["Beställningsdatum","Beställt av","Produktnamn/beskrivning","Verksamhet","Pris drift & underhåll"],
  ["2026-04-01","Anna","Flytt nummer 1, Växelvården","",4705],
  ["2026-04-02","Anna","Flytt nummer 2, Växelvården","",3904]
 ]),"Beställningar");
 const api=adapter(),data=normalize({isDemo:false,properties:[],contracts:[]});
 const first=api.enrich(wb,data,"fake.xlsx");
 assert.equal(first.data.activities.length,2);
 assert.equal(new Set(first.data.activities.map(x=>x.id)).size,2);
 assert.equal(api.enrich(wb,first.data,"fake.xlsx").data.activities.length,2);
});
test("harmless formatting in address does not create a conflict",()=>{
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
  ["Benämning","Postadress","Fastighetsägare","Förvaltare","Objekt. nr"],
  ["Testlokalen","Gånglåtsvägen 1 H","","","ID-1"]
 ]),"Fastighetslista");
 const data=normalize({isDemo:false,properties:[{id:"p",sourceId:"ID-1",address:"GÅNGLÅTSVÄGEN 1H"}]});
 const result=adapter().enrich(wb,data,"test.xlsx");
 assert.equal((result.data.importReview||[]).filter(x=>x.field==="address").length,0);
});
test("source processing stages appear once per file in review view",()=>{
 const data=normalize({isDemo:false,sourceRegistry:[
  {name:"underlag.xlsx",kind:"core-import",sheets:"SF",rows:10,matched:4,created:6,review:2},
  {name:"underlag.xlsx",kind:"operational-enrichment",sheets:"Beställningar",rows:3,matched:1,created:2,review:2}
 ]});
 const html=sources(data,{status:()=>({connected:false,dirty:false,pendingChanges:[]}),company:()=>false});
 assert.equal((html.match(/underlag\.xlsx<\/td>/g)||[]).length,1);
 assert.match(html,/Grunddata \+ Fastigheter/);
});
