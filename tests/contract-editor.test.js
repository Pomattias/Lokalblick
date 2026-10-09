import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import { renderContractEditor } from "../frontend/v2/contract-editor.js";
import { readEditor } from "../frontend/v2/editor.js";

const contract = {
  id:"c1", number:"L-100", propertyId:"p1", businessPartyId:"tenant", tenantName:"Hyresgäst AB", unitId:"VARDBO",
  businessResponsiblePersonId:"person1", category:"ÄBO Äldreboende",
  area:100, source:"SF", use:"VÅRDBO", annualContractDrift:12000,
  start:"2024-01-01", end:"2028-12-31",
  noticePeriodMonths:9, renewalPeriodMonths:36,
  baseRent:100000, rentBaseYear:2020, rentBaseIndex:300, rentIndexPercent:.8,
  baseAdditions:20000, additionBaseYear:2021, additionBaseIndex:320, additionIndexPercent:.5,
};
const data = {
  isDemo:true,
  properties:[{id:"p1",address:"Testgatan 1",ownerPartyId:"owner",ownerResponsiblePersonId:"ownerP",responsiblePersonId:"ourP"}],
  organizations:[{id:"owner",name:"Ägaren",type:"owner"},{id:"tenant",name:"Hyresgästen",type:"tenant"}],
  people:[{id:"person1",name:"Kontaktperson A",organizationId:"tenant",unitId:"VARDBO"}, {id:"ownerP",name:"Ägarkontakt",organizationId:"owner"}, {id:"ourP",name:"Vår kontakt",unitId:"VARDBO"}],
  contracts:[contract],
  indexSeries:[{year:2025,month:10,value:400,seriesBase:"1980",source:"Test-KPI"}]
};

test("compact contract form distinguishes owner from tenant and retains indexed addition", () => {
  const html=renderContractEditor(data,contract,"c1");
  assert.doesNotMatch(html,/data-editor-tab|data-editor-section/);
  assert.match(html,/Fastighetsägare/);
  assert.match(html,/Ägaren/);
  assert.match(html,/Hyresgäst/);
  assert.match(html,/Verksamhetsansvarig/);
  assert.match(html,/Fastighetsägarens kontaktperson/);
  assert.match(html,/Ägarkontakt/);
  assert.match(html,/Vår kontaktperson/);
  assert.match(html,/Vår kontakt/);
  assert.match(html,/name="tenantName"/);
  assert.match(html,/value="Hyresgäst AB"/);
  assert.match(html,/name="unitId"/);
  assert.match(html,/value="VARDBO" selected/);
  assert.doesNotMatch(html,/name="businessPartyId"/);
  assert.doesNotMatch(html,/name="ownerResponsiblePersonId"|name="responsiblePersonId"/);
  assert.match(html,/Kontaktperson A/);
  assert.match(html,/value="Äldreboende" selected/);
  assert.match(html,/name="category"/);
  assert.doesNotMatch(html,/name="(?:source|use|annualContractDrift|moveInDate|moveOutDate|ekotObject|costCenterOperations|costCenterPremises|originalTerm)"/);
  assert.match(html,/name="baseAdditions"/);
  assert.match(html,/name="additionIndexPercent"/);
  assert.match(html,/Tillägg/);
  assert.match(html,/Fastighetsskatt/);
  assert.match(html,/name="annualPropertyTax"/);
  assert.match(html,/2028-03-31/);
  assert.match(html,/2031-12-31/);
});

test("the edit merge preserves currently imported values until safe backend migration", () => {
  const original=globalThis.FormData;
  globalThis.FormData=class {
    forEach(callback) {
      callback("2025-01-01","start");
      callback("80","rentIndexPercent");
      callback("50","additionIndexPercent");
      callback("Äldreboende","category");
      callback("Fastighetsförvaltning AB","tenantName");
      callback("ORDBO","unitId");
    }
  };
  try {
    const updated=readEditor({},contract);
    assert.equal(updated.start,"2025-01-01");
    assert.equal(updated.rentIndexPercent,.8);
    assert.equal(updated.additionIndexPercent,.5);
    assert.equal(updated.category,"Äldreboende");
    assert.equal(updated.tenantName,"Fastighetsförvaltning AB");
    assert.equal(updated.unitId,"ORDBO");
    assert.equal(updated.businessPartyId,"tenant");
    assert.equal(updated.annualContractDrift,12000);
    assert.equal(updated.source,"SF");
  } finally { globalThis.FormData=original; }
});

test("contractual extension rolls at notice deadline and does not rewrite signed end", () => {
  const calc=globalThis.LokalblickCalculations;
  const before=calc.projectedContractTerm(contract,"2027-01-01");
  assert.equal(before.end,"2028-12-31");
  assert.equal(before.noticeBy,"2028-03-31");
  assert.equal(before.nextEnd,"2031-12-31");
  const after=calc.projectedContractTerm(contract,"2028-04-01");
  assert.equal(after.end,"2031-12-31");
  assert.equal(after.noticeBy,"2031-03-31");
  assert.equal(contract.end,"2028-12-31");
  const unknown=calc.projectedContractTerm({end:"2028-12-31",renewalPeriodMonths:36},"2029-01-01");
  assert.equal(unknown.nextEnd,"");
});

test("legacy media becomes editable tillägg and tax remains a separate annual amount",()=>{
 const legacy={...contract,baseAdditions:0,additionIndexPercent:"",annualContractDrift:460000,annualPropertyTax:15000};
 const html=renderContractEditor(data,legacy,"c1");
 assert.match(html,/name="baseAdditions"[^>]*value="460000"/);
 assert.match(html,/name="additionIndexPercent"[^>]*value="0"/);
 assert.match(html,/name="annualPropertyTax"[^>]*value="15000"/);
 assert.doesNotMatch(html,/name="annualContractDrift"/);
});

test("editing an old Media field migrates it to one non-indexed addition without double count",()=>{
 const legacy={...contract,baseAdditions:0,additionIndexPercent:"",annualContractDrift:460000,annualPropertyTax:15000};
 const old=globalThis.FormData;
 globalThis.FormData=class {forEach(cb){cb("460000","baseAdditions");cb("0","additionIndexPercent");cb("15000","annualPropertyTax");}};
 try {
   const updated=readEditor({dataset:{collection:"contracts"}},legacy);
   assert.equal(updated.baseAdditions,460000);
   assert.equal(updated.additionIndexPercent,0);
   assert.equal(updated.annualContractDrift,0);
   assert.equal(updated.annualPropertyTax,15000);
   const v=globalThis.LokalblickCalculations.annualValues(updated,2026,0,data.indexSeries);
   assert.equal(v.addition.amount,460000);
   assert.equal(v.tax,15000);
 }finally{globalThis.FormData=old;}
});

test("new contract can pick property only when not already bound", () => {
  const existing=renderContractEditor(data,contract,"c1");
  assert.doesNotMatch(existing,/name="propertyId"/);
  const next=renderContractEditor(data,{tenantName:"",unitId:""},"");
  assert.match(next,/name="propertyId"/);
});
test("unrecognized imported verksamhet survives until explicit reclassification",()=>{
  const html=renderContractEditor(data,{...contract,unitId:"OLD_UNIT"},"c1");
  assert.match(html,/value="OLD_UNIT" selected/);
  assert.match(html,/tidigare värde/);
});
