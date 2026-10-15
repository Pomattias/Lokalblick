import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import { renderIssueEditor } from "../frontend/v2/issue-editor.js";

const data={
  properties:[{id:"p",designation:"Hamnen 4",address:"Hamnvägen 12"}],
  contracts:[],people:[],organizations:[],orders:[],activities:[],indexSeries:[],
};
const issue={id:"a",title:"Takrenovering",type:"Underhåll",category:"Ytskikt",propertyId:"p",estimatedCost:125000};

test("issue name is the heading and first editable field",()=>{
  const html=renderIssueEditor(data,issue,"a");
  assert.match(html,/class="issue-title-heading">Takrenovering/);
  assert.match(html,/class="issue-title-field"/);
  assert.ok(html.indexOf('name="title"') < html.indexOf('name="type"'));
  assert.match(html,/Ärendenamn/);
  assert.match(html,/Kopplat till/);
  assert.doesNotMatch(html,/field\("Hemvist"/);
  assert.match(html,/name="category"/);
  assert.match(html,/value="Ytskikt" selected/);
  assert.match(html,/data-editor-close/);
});

test("new issue renders without modifying shared editor lifecycle",()=>{
  const html=renderIssueEditor(data,{title:"",type:"",category:""},"");
  assert.match(html,/class="issue-title-heading">Nytt ärende/);
  assert.match(html,/name="title"/);
  assert.match(html,/data-editor-close/);
});
