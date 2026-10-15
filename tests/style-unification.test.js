import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../frontend/v2/index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");

test("V2 uses one local stylesheet for every feature and editor mode",()=>{
  const links=[...html.matchAll(/href="([^"]+\.css)"/g)]
    .map(([,href])=>href)
    .filter(href=>!/^https?:\/\//i.test(href));
  assert.deepEqual(links,["styles.css"]);
  for(const selector of [
    ".budget-comparison",
    ".budget-danger-zone",
    ".followup-dialog",
    ".issue-editor #edit-form",
    "body.editor-frame-active > #editor-edit-frame",
    ".editor-mode-value"
  ]) assert.ok(css.includes(selector),"Missing consolidated selector "+selector);
});

test("issue description has one stable read/edit height without textarea baseline expansion",()=>{
  const block=css.slice(css.lastIndexOf("/* Stable description cell in both modes"));
  assert.match(block,/\.issue-field-value,[\s\S]*?\.issue-field-control textarea\s*\{[\s\S]*?height:60px;/);
  assert.match(block,/\.issue-field-control textarea\s*\{\s*display:block;/);
});
