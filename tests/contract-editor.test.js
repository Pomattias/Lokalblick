import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import { renderContractEditor } from "../frontend/v2/contract-editor.js";
import { readEditor } from "../frontend/v2/editor.js";

const contract = {
  id:"c1", number:"L-100", propertyId:"p1", businessPartyId:"tenant",
  businessResponsiblePersonId:"person1", category:"ÄBO Äldreboende",
  area:100, source:"SF", use:"VÅRDBO", annualContractDrift:12000,
  start:"2024-01-01", end:"2028-12-31",
  noticePeriodMonths:9, renewalPeriodMonths:36,
  baseRent:100000, rentBaseYear:2020, rentBaseIndex:300, rentIndexPercent:.8,
  baseAdditions:20000, additionBaseYear:2021, additionBaseIndex:320, additionIndexPercent:.5,
};
const data = {
  isDemo:true,
  properties:[{id:"p1",address:"Testgatan 1",ownerPartyId:"owner"}],
  organizations:[{id:"owner",name:"Ägaren",type:"owner"},{id:"tenant",name:"Hyresgästen",type:"tenant"}],
  people:[{id:"person1",name:"Kontaktperson A",organizationId:"tenant"}],
  contracts:[contract],
  indexSeries:[{year:2025,month:10,value:400,seriesBase:"1980",source:"Test-KPI"}]
};

test("compact contract form distinguishes owner from tenant and retains indexed addition", () => {
  const html=renderContractEditor(data,contract,"c1");
  assert.doesNotMatch(html,/data-editor-tab|data-editor-section/);
  assert.match(html,/Fastighetsägare/);
  assert.match(html,/Ägaren/);
  assert.match(html,/Hyresgäst/);
  assert.match(html,/Kontaktperson/);
  assert.match(html,/Kontaktperson A/);
  assert.match(html,/value="Äldreboende" selected/);
  assert.match(html,/name="category"/);
  assert.doesNotMatch(html,/name="(?:source|use|annualContractDrift|annualPropertyTax|moveInDate|moveOutDate|ekotObject|costCenterOperations|costCenterPremises|originalTerm)"/);
  assert.match(html,/name="baseAdditions"/);
  assert.match(html,/name="additionIndexPercent"/);
  assert.match(html,/Hyrestillägg/);
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
    }
  };
  try {
    const updated=readEditor({},contract);
    assert.equal(updated.start,"2025-01-01");
    assert.equal(updated.rentIndexPercent,.8);
    assert.equal(updated.additionIndexPercent,.5);
    assert.equal(updated.category,"Äldreboende");
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
