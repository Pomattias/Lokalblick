import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalize} from "../frontend/v2/model.js";

test("Lokalblick V2 loads one ordered stylesheet with both existing and shared editor geometry",()=>{
  const html=readFileSync(new URL("../frontend/v2/index.html",import.meta.url),"utf8");
  const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
  assert.equal((html.match(/href="styles\.css"/g)||[]).length,1);
  assert.doesNotMatch(html,/design-system\.css|unified-design\.css/);
  assert.ok(css.includes("/* --- Shared visual components and view/edit geometry (consolidated) --- */"));
  assert.ok(css.indexOf("/* --- Shared visual components")>css.indexOf("--accent:"));
  for(const rule of [
    ".editor:not(.issue-editor) #edit-form.editor-readonly .editor-mode-control",
    ".editor:not(.issue-editor) #edit-form.editor-readonly .editor-mode-value",
    ".issue-editor #edit-form .issue-dates-edit input[type=\"date\"]",
    ".editor-activate-placeholder",
  ]) assert.ok(css.includes(rule),"Missing canonical CSS rule: "+rule);
});

test("canonical normalization does not duplicate contact, business or review data",()=>{
 const source={
   isDemo:false,
   properties:[{id:"p",address:"Kajgatan 1"}],
   contracts:[{id:"c",number:"1",propertyId:"p",
     tenantName:"Hyresgäst AB",businessName:"Vårdbo 1",unitId:"VARDBO",
     annualContractDrift:12345}],
   organizations:[],people:[],
   sourceRegistry:[{id:"s1",name:"underlag.xlsx"}],
   importReview:[{id:"r1",status:"pending",kind:"activity-property",source:"underlag.xlsx"}]
 };
 const once=normalize(source),twice=normalize(once);
 assert.deepEqual(twice,once);
 assert.equal(once.contractBusinesses.length,1);
 assert.equal(once.businesses.length,1);
 assert.equal(once.organizations.filter(p=>p.type==="tenant").length,1);
 assert.equal(once.sourceRegistry[0].review,0);
 assert.equal(once.importReview[0].status,"planning");
 assert.ok(!Object.hasOwn(once.contracts[0],"annualContractDrift"));
 assert.ok(!Object.hasOwn(once.contractBusinesses[0],"migratedFromLegacy"));
});
