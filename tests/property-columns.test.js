import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import XLSX from "xlsx";
import { normalize } from "../frontend/v2/model.js";
import { overview, planning, propertyReference } from "../frontend/v2/views.js";
import "../frontend/domain/calculations.js";
const sample=()=>normalize({
 properties:[{id:"p1",designation:"HAMNEN 2",address:"Kajgatan 14"},{id:"p2",designation:"",address:"Hamnvägen 10"}],
 contracts:[{id:"c1",number:"AVT-1",propertyId:"p1",area:100,baseRent:100000,rentIndexPercent:0}],
 activities:[{id:"a1",title:"Renovering",type:"Underhåll",contractId:"c1",estimatedCost:15000}],
});
const selection={propertyId:"",unit:"",owner:"",person:"",q:""};
function excelService(){
 const window={};
 const context={window,XLSX,console,Date,Map,Set,URL,Uint8Array,TextDecoder,localStorage:{removeItem(){},getItem(){return null;},setItem(){}}};
 vm.runInNewContext(fs.readFileSync("frontend/services/source-service.js","utf8"),context);
 return window.LokalblickSourceService;
}
test("property and address remain distinct in V2 tables",()=>{
 const data=sample();
 for(const perspective of ["Fastigheter","Avtal","Projekt","Underhåll","Drift","Önskemål"]){
   const html=overview(data,selection,{year:2026,perspective,contractId:""});
   assert.match(html,/Fastighet(?:\s*<span|<\/th>)/);
   assert.match(html,/Adress(?:\s*<span|<\/th>)/);
 }
 const properties=overview(data,selection,{year:2026,perspective:"Fastigheter",contractId:""});
 assert.match(properties,/<td class="primary-cell">HAMNEN 2<\/td>/);
 assert.match(properties,/<td class="primary-cell">–<\/td>/);
 assert.match(properties,/Kajgatan 14/);
 const upkeep=overview(data,selection,{year:2026,perspective:"Underhåll",contractId:""});
 assert.match(upkeep,/Renovering/);
 assert.match(upkeep,/HAMNEN 2/);
 assert.match(upkeep,/Kajgatan 14/);
 assert.match(upkeep,/Ansvarig(?:\s*<span|<\/th>)/);
 assert.match(upkeep,/Status(?:\s*<span|<\/th>)/);
 const plan=planning(data,selection,{year:2026,planningMode:"list"});
 assert.match(plan,/>Fastighet</);
 assert.match(plan,/>Adress</);
 assert.match(plan,/>Hemvist</);
 assert.match(plan,/HAMNEN 2/);
 assert.match(plan,/Kajgatan 14/);
 assert.equal(propertyReference(data.properties[1]),"Beteckning saknas · Hamnvägen 10");
});
test("Excel export holds fastighetsbeteckning and address in separate columns",()=>{
 const svc=excelService(),data=sample(),workbook=svc.dataToWorkbook(data);
 for(const sheet of ["Avtal","Aktiviteter"]){
   const row=XLSX.utils.sheet_to_json(workbook.Sheets[sheet],{defval:""})[0];
   assert.equal(row.Fastighet,"HAMNEN 2");
   assert.equal(row.Adress,"Kajgatan 14");
 }
 const restored=svc.workbookToData(workbook);
 assert.equal(restored.contracts[0].propertyId,"p1");
 assert.equal(restored.activities[0].contractId,"c1");
});
test("legacy address-only and new designation plus address workbook resolve safely",()=>{
 const svc=excelService(),data=sample();
 const legacy=svc.dataToWorkbook(data);
 const rows=XLSX.utils.sheet_to_json(legacy.Sheets.Avtal,{defval:""});
 legacy.Sheets.Avtal=XLSX.utils.json_to_sheet(rows.map(row=>({...row,Fastighet:row.Adress,Adress:undefined,_propertyId:""})));
 assert.equal(svc.workbookToData(legacy).contracts[0].propertyId,"p1");
 const newer=svc.dataToWorkbook(data);
 const current=XLSX.utils.sheet_to_json(newer.Sheets.Avtal,{defval:""});
 newer.Sheets.Avtal=XLSX.utils.json_to_sheet(current.map(row=>({...row,_propertyId:""})));
 assert.equal(svc.workbookToData(newer).contracts[0].propertyId,"p1");
 const ambiguous=svc.dataToWorkbook(normalize({properties:[{id:"p1",designation:"Samma",address:"Gata 1"},{id:"p2",designation:"Samma",address:"Gata 2"}],contracts:[{id:"c1",number:"1",propertyId:"p1"}]}));
 const currentRows=XLSX.utils.sheet_to_json(ambiguous.Sheets.Avtal,{defval:""});
 ambiguous.Sheets.Avtal=XLSX.utils.json_to_sheet(currentRows.map(row=>({...row,_propertyId:"",Adress:undefined})));
 assert.equal(svc.workbookToData(ambiguous).contracts[0].propertyId,"");
});
