import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import { normalize } from "../frontend/v2/model.js";
import { contractDetail, overview } from "../frontend/v2/views.js";
import fs from "node:fs";
import vm from "node:vm";
import XLSX from "xlsx";
const C=globalThis.LokalblickCalculations;
const near=(value,wanted)=>assert.ok(Math.abs(value-wanted)<0.000001,`${value} vs ${wanted}`);
test("2026 annual rent and addition use separate baselines and index shares",()=>{
 const contract={id:"c1",propertyId:"p1",number:"A-1",area:100,
   baseRent:100000,rentBaseYear:2020,rentBaseIndex:300,rentIndexPercent:.8,
   baseAdditions:20000,additionBaseYear:2021,additionBaseIndex:320,additionIndexPercent:.5};
 const indexSeries=[{year:2025,month:10,value:400,seriesBase:"1980",source:"Test-KPI"}];
 const x=C.annualValues(contract,2026,0,indexSeries);
 near(x.rent.amount,100000*(1+.8*(400/300-1)));
 near(x.addition.amount,20000*(1+.5*(400/320-1)));
 assert.equal(x.rent.bastal,300);
 assert.equal(x.addition.bastal,320);
 assert.equal(x.rent.indexYear,2025);
 assert.equal(x.rent.status,"Beräknad");
 assert.equal(x.addition.status,"Beräknad");
 const normalized=normalize({contracts:[contract],properties:[{id:"p1",address:"Testgatan 1"}],indexSeries});
 assert.equal(normalized.contracts[0].rentBaseIndex,300);
 assert.equal(normalized.contracts[0].additionBaseIndex,320);
 const svcContext=vm.createContext({window:{},XLSX,console,Date,Map,Set,URL,Uint8Array,TextDecoder,localStorage:{removeItem(){},getItem(){return null},setItem(){}}});
 vm.runInContext(fs.readFileSync("frontend/services/source-service.js","utf8"),svcContext);
 const svc=svcContext.window.LokalblickSourceService;
 const saved=svc.workbookToData(svc.dataToWorkbook(normalized));
 assert.equal(saved.contracts[0].rentBaseIndex,300);
 assert.equal(saved.contracts[0].additionBaseIndex,320);
});
test("0% share is fixed even without October index or base year",()=>{
 const x=C.annualValues({baseRent:100000,rentIndexPercent:0,baseAdditions:20000,additionIndexPercent:0},2026,0,[]);
 assert.equal(x.rent.amount,100000);
 assert.equal(x.addition.amount,20000);
 assert.equal(x.rent.status,"Beräknad");
 assert.equal(x.addition.status,"Beräknad");
});
test("missing October values or conflicting index are explicitly flagged",()=>{
 const c={baseRent:100000,rentBaseYear:2025,rentIndexPercent:.8,rentBaseIndex:419.35};
 assert.equal(C.component(c,"rent",2027,0,[]).status,"Behöver kontroll");
 assert.equal(C.component(c,"rent",2026,0,[{year:2025,month:10,value:419.35},{year:2025,month:10,value:400}]).status,"Behöver kontroll");
});
test("contract detail and listing show current year and calculation inputs",()=>{
 const old=globalThis.LokalblickDocuments;
 globalThis.LokalblickDocuments={fromContract:()=>({}),resolve:()=>({status:"missing",name:"",label:"Dokument saknas"})};
 try {
  const data=normalize({properties:[{id:"p1",address:"Testgatan 1"}],contracts:[{
   id:"c1",propertyId:"p1",number:"A-1",area:100,
   baseRent:100000,rentBaseYear:2020,rentBaseIndex:336.97,rentIndexPercent:.8,
   baseAdditions:20000,additionBaseYear:2021,additionBaseIndex:346.44,additionIndexPercent:.5
  }]});
  const html=contractDetail(data,"c1",2026);
  assert.match(html,/Årsberäkning 2026/);
  assert.match(html,/Basår \/ bastal/);
  assert.match(html,/KPI oktober/);
  assert.match(html,/Indexandel/);
  assert.match(html,/419,35/);
  const summary=overview(data,{unit:"",owner:"",person:"",q:"",propertyId:""},{perspective:"Avtal",year:2026});
  assert.match(summary,/Hyra 2026/);
  assert.match(summary,/Tillägg 2026/);
 }finally{globalThis.LokalblickDocuments=old;}
});
