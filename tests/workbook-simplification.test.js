import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import XLSX from "xlsx";
const source=fs.readFileSync(new URL("../frontend/services/source-service.js",import.meta.url),"utf8");
function service(){
 const sandbox={window:{},XLSX,console,Date,Map,Set,URL,Uint8Array,TextDecoder,localStorage:{removeItem(){},getItem(){return null;},setItem(){}}};
 vm.runInNewContext(source,sandbox);
 return sandbox.window.LokalblickSourceService;
}
const plain=x=>JSON.parse(JSON.stringify(x));
test("new workbook exposes business sheets and hides technical sheets",()=>{
 const adapter=service();
 const wb=adapter.dataToWorkbook({properties:[{id:"p1",address:"Testgatan 1"}],contracts:[{id:"c1",propertyId:"p1",number:"1"}],
   activities:[{id:"a1",title:"Test",planningYear:2027,planningQuarter:2,planningMonth:4,budgetCategory:"Underhåll",estimatedCost:5000}],
   budgetPlans:[{year:2027,status:"Låst",lines:[{sourceId:"a1",amount:5000}],versions:[{snapshot:{lines:[{sourceId:"a1",amount:5000}]}}]}],
   operations:[{id:"o1",period:2027,actual:100}],maintenanceStatus:[{id:"m1",status:"Bra"}],
   organizations:[],people:[],orders:[],sourceRegistry:[],auditLog:[],importReview:[]});
 const state=Object.fromEntries(wb.Workbook.Sheets.map(x=>[x.name,x.Hidden]));
 for(const sheet of ["Fastigheter","Avtal","Parter","Personer","Beställningar","Aktiviteter","Budget"])
   assert.equal(state[sheet],0,sheet+" should be visible");
 for(const sheet of ["Lokalblick","Budgetrader","Källor","Ändringslogg","Tilläggsdata"])
   assert.equal(state[sheet],1,sheet+" should be hidden");
 const activityHeaders=XLSX.utils.sheet_to_json(wb.Sheets.Aktiviteter,{header:1})[0];
 assert.ok(activityHeaders.includes("Kvartal")&&activityHeaders.includes("Budgetkategori"));
 const visibleCount=wb.Sheets.Aktiviteter["!cols"].filter(x=>!x.hidden).length;
 assert.ok(activityHeaders.indexOf("Kvartal")>=visibleCount);
 const restored=plain(adapter.workbookToData(wb));
 assert.equal(restored.activities[0].planningQuarter,2);
 assert.equal(restored.activities[0].budgetCategory,"Underhåll");
 assert.equal(restored.operations[0].actual,100);
 assert.equal(restored.maintenanceStatus[0].status,"Bra");
 assert.equal(restored.budgetPlans[0].status,"Låst");
 assert.ok(restored.budgetPlans[0].versions.length);
});
test("own Lokalblick workbook is not accepted as enrichment input",()=>{
 const adapter=service();
 const own=adapter.dataToWorkbook({properties:[],contracts:[],activities:[],organizations:[],people:[],orders:[],budgetPlans:[]});
 assert.equal(adapter.isCanonicalDataWorkbook(own),true);
 assert.throws(()=>adapter.analyzeImportWorkbook(own,{},"Lokalblick-data.xlsx"),/Anslut Lokalblick-data/);
 const external=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(external,XLSX.utils.aoa_to_sheet([["Projektnamn"],["A"]]),"2027");
 assert.equal(adapter.isCanonicalDataWorkbook(external),false);
});
