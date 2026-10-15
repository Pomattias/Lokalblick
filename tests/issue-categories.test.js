import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import { ISSUE_CATEGORIES, issueCategoryChoices, renderIssueEditor } from "../frontend/v2/issue-editor.js";
import { renderContractEditor } from "../frontend/v2/contract-editor.js";
import { renderPropertyEditor } from "../frontend/v2/property-editor.js";

const property={id:"p1",designation:"Hamnen 4",address:"Hamnvägen 12",ownerPartyId:"owner"};
const data={
  isDemo:true,
  properties:[property],
  contracts:[{id:"c1",number:"A-101",propertyId:"p1"}],
  organizations:[{id:"owner",name:"Fastighetsägaren",type:"owner"}],
  people:[],activities:[],orders:[],indexSeries:[]
};
const issue={id:"i1",title:"Ventilationsåtgärder",type:"Projekt",category:"Ventilation",propertyId:"p1",estimatedCost:10000};

test("category list is bounded and standardized",()=>{
  for(const name of ["Ytskikt","Inredning","Installationer","Ventilation","Ombyggnad","Nya lokaler"])
    assert.ok(ISSUE_CATEGORIES.includes(name));
  assert.equal(issueCategoryChoices("Ventilation").length,ISSUE_CATEGORIES.length);
  const html=renderIssueEditor(data,issue,"i1");
  assert.match(html,/<select name="category">/);
  assert.match(html,/value="Ventilation" selected/);
  assert.doesNotMatch(html,/name="category" type="text"/);
  assert.match(html,/data-editor-close/);
});
test("unknown imported category is preserved as a selectable value",()=>{
  const old="Ytskick";
  const items=issueCategoryChoices(old);
  assert.ok(items.some(c=>c.value===old));
  assert.equal(items.length,ISSUE_CATEGORIES.length+1);
  const html=renderIssueEditor(data,{...issue,category:old},"i1");
  assert.match(html,/value="Ytskick" selected/);
  assert.match(html,/tidigare kategori/);
});
test("category change does not affect the other compact editors",()=>{
  assert.match(renderContractEditor(data,data.contracts[0],"c1"),/data-editor-close/);
  assert.match(renderPropertyEditor(data,property,"p1"),/data-editor-close/);
});
