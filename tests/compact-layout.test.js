import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import "../frontend/domain/calculations.js";
import {renderPropertyEditor} from "../frontend/v2/property-editor.js";
import {renderContractEditor} from "../frontend/v2/contract-editor.js";
const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
const views=["view-planning.js","view-portfolio.js"].map(file=>readFileSync(new URL("../frontend/v2/"+file,import.meta.url),"utf8")).join("\n");

test("property and lease fields keep accessible labels next to native controls",()=>{
  const data={properties:[{id:"p",address:"Testgatan 1",city:"Malmö"}],
    objects:[],contracts:[],organizations:[],people:[],orders:[],activities:[],
    indexSeries:[],auditLog:[],assignments:[],isDemo:true};
  const property=renderPropertyEditor(data,data.properties[0],"p");
  assert.match(property,/<label class="property-heading-edit property-heading-edit-address"><span class="visually-hidden">Adress<\/span><input[^>]*name="address"/);
  assert.equal((property.match(/name="address"/g)||[]).length,1);
  assert.match(property,/<span class="field-name">Ort<\/span><input[^>]*name="city"/);
  assert.match(property,/<span class="field-name">Fastighetsägare<\/span><select name="ownerPartyId"/);
  const agreement={id:"c",propertyId:"p",number:"1",baseRent:150000,rentIndexPercent:0,baseAdditions:0,additionIndexPercent:0};
  const contract=renderContractEditor({...data,contracts:[agreement]},agreement,"c");
  assert.match(contract,/<label class="contract-field"><span class="field-name">Avtalsnummer<\/span><input[^>]*name="number"/);
  assert.match(contract,/<span class="field-name">Bashyra, kr\/år<\/span><input[^>]*name="baseRent"/);
  for(const html of [property,contract]){
    assert.match(html,/data-editor-close/);
    assert.match(html,/type="submit"/);
    assert.doesNotMatch(html,/Ändringar sparas via aktiv datakoppling/);
  }
});

test("all main sections share compact spacing and inline detail values",()=>{
  for(const selector of [
    "main .detail-grid > div",
    "main .detail-grid > div > small",
    "main .detail-grid > div > strong",
    "main .compact-data-table td",
    "main .budget-category-card",
    "main .plan-mobile-card",
    'body[data-view="budget"] .budget-rent-metric',
    ".editor:not(.issue-editor) #edit-form",
    ".issue-editor #edit-form .issue-main-section"
  ]) assert.ok(css.includes(selector),"Missing shared compact rule: "+selector);
  assert.match(css,/grid-template-columns:minmax\(0,45%\) minmax\(0,1fr\)/);
  assert.match(css,/\.budget-rent-metric \{[\s\S]*?display:flex;align-items:baseline;/);
  assert.ok(views.includes('<details class="planning-timeline-help">'));
  assert.ok(views.includes('<details class="rent-source">'));
});
