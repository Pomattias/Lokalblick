import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {editorDisplayValue,prepareEditorModeFields,refreshEditorModeFields} from "../frontend/v2/editor-mode-fields.js";

const input=(name,value,type="text")=>({tagName:"INPUT",name,value,type});
const select=(name,items,multiple=false)=>({
 tagName:"SELECT",name,type:"select-one",multiple,
 selectedOptions:items.map(([value,textContent])=>({value,textContent}))
});
test("all supported fields have text values, with no duplicate date year",()=>{
 assert.equal(editorDisplayValue(input("address","Testgatan 1")),"Testgatan 1");
 assert.equal(editorDisplayValue(input("cost","0","number")),"0");
 assert.equal(editorDisplayValue(input("date","2026-10-15","date")),"15/10/2026");
 assert.equal(editorDisplayValue(input("date","","date")),"–");
 assert.equal(editorDisplayValue({tagName:"TEXTAREA",value:"Rad 1\nRad 2"}),"Rad 1\nRad 2");
 assert.equal(editorDisplayValue(select("type",[["","Välj"],["office","Kontor"]])),"Kontor");
 assert.equal(editorDisplayValue(select("organizations",[["o1","Bolag A"],["o2","Bolag B"]],true)),"Bolag A, Bolag B");
 assert.equal(editorDisplayValue({...input("done","on","checkbox"),checked:false}),"Nej");
 assert.equal(editorDisplayValue({...input("done","on","checkbox"),checked:true}),"Ja");
});
test("a shared field generates its read value only once without removing the input",()=>{
 const original=globalThis.document;
 const makeClassList=()=>{const set=new Set();return {add:x=>set.add(x),contains:x=>set.has(x)}};
 const displayed=[];
 globalThis.document={createElement(tag){
   assert.equal(tag,"span");
   return {
     className:"",dataset:{},attributes:{},
     setAttribute(k,v){this.attributes[k]=v;},
     classList:{contains:token=>token==="editor-mode-value"},textContent:""
   };
 }};
 try{
   function field(name,value,type="text"){
     const control={...input(name,value,type),dataset:{},classList:makeClassList(),
       getAttribute(){return null;},closest(){return null;},
       insertAdjacentElement(where,el){assert.equal(where,"afterend");this.nextElementSibling=el;displayed.push(el);}};
     return control;
   }
   const one=field("address","Gamla gatan");
   const two=field("start","2026-11-01","date");
   const controls=[one,two];
   const form={dataset:{collection:"properties"},
     querySelectorAll(selector){return selector.startsWith("input[name]")?controls:selector===".editor-mode-control"?controls:[];}};
   assert.equal(prepareEditorModeFields(form),2);
   assert.equal(prepareEditorModeFields(form),0);
   assert.equal(displayed.length,2);
   assert.equal(one.nextElementSibling.textContent,"Gamla gatan");
   assert.equal(two.nextElementSibling.textContent,"01/11/2026");
   assert.equal(one.nextElementSibling.attributes["aria-label"],"address");
   one.value="Nya gatan";
   refreshEditorModeFields(form);
   assert.equal(one.nextElementSibling.textContent,"Nya gatan");
   assert.equal(one.value,"Nya gatan","original control is kept for FormData and saving");
   assert.equal(prepareEditorModeFields({...form,dataset:{collection:"activities"}}),0);
 }finally{
   globalThis.document=original;
 }
});
test("shared edit mode is used for all existing editors, without altering activity mode",()=>{
 const app=readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
 for(const text of [
    'if(editor.col!=="activities"){',
    "prepareEditorModeFields(form);",
    "if(editor.readOnly)refreshEditorModeFields(form);",
    "if(col!==\"activities\")prepareEditorModeFields(form);",
    'form.classList.toggle("editor-readonly",editor.readOnly)',
    'form.classList.toggle("editor-editing",!editor.readOnly)'
 ]) assert.ok(app.includes(text),"Missing shared invariant: "+text);
 assert.ok(css.includes(".editor:not(.issue-editor) #edit-form.editor-readonly .editor-mode-control"));
 assert.ok(css.includes(".editor:not(.issue-editor) #edit-form.editor-readonly .editor-mode-value"));
 assert.ok(css.includes(".editor-activate-placeholder"));
 assert.ok(app.includes("if(undo)undo.disabled=false;"),"Undo always available to exit edit mode");
 assert.ok(app.includes('setEditorReadMode(false);'),"Redigera only unlocks controls");
 assert.ok(!app.includes('if(editor.col!=="activities")\n        editorForm()?.querySelector('),"Editing must not auto focus a field");
});


test("focus does not enlarge any iPhone editor value or field geometry",()=>{
 const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
 const last=css.slice(css.indexOf("/* Read/edit geometry: a mode switch"));
 assert.ok(last.includes("font-size:16px!important"),"iOS read and editable values must both use stable sizing despite legacy CSS specificity");
 assert.ok(last.includes(".editor:not(.issue-editor) #edit-form .editor-mode-value"));
 assert.ok(last.includes(".issue-editor #edit-form .issue-mode-field"));
 assert.ok(last.includes(".issue-editor #edit-form .issue-dates-edit input[type=\"date\"]"));
 assert.ok(last.includes("height:34px"),"mobile view and edit share a stable height");
 assert.ok(last.includes("height:30px"),"case date height is always fixed");
 assert.ok(last.includes('input.editor-mode-control:is([type="checkbox"],[type="radio"])'),
  "checkbox and radio must not inherit oversized editor input geometry");
 assert.doesNotMatch(last,/:focus\s*\{[^}]*font-size/,"no focus-only typography changes");
});


test("multi-select values keep the same footprint when edit becomes a listbox",()=>{
 const helper=readFileSync(new URL("../frontend/v2/editor-mode-fields.js",import.meta.url),"utf8");
 const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
 assert.ok(helper.includes('control.tagName==="SELECT"&&control.multiple'));
 assert.ok(css.includes('.editor-mode-value[data-mode-kind="multiselect"]'));
 assert.ok(css.includes('select.editor-mode-control[multiple]'));
 assert.ok(css.includes('height:90px'));
});


test("no mobile editor font sizes change only upon focus, including Android",()=>{
 const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
 const focused=[...css.matchAll(/([^{}]*:focus[^{}]*)\{([^{}]*)\}/g)]
   .filter(([,selector,body])=>selector.includes("editor")&&/font-size\s*:/.test(body));
 assert.deepEqual(focused.map(([,s])=>s.trim()),[]);
});


test("journal read and edit share the same second row on mobile",()=>{
 const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
 const fragment=css.slice(css.lastIndexOf("/* Issue details: description"));
 assert.ok(fragment.includes("grid-template-rows:auto minmax(36px,auto)"));
 assert.ok(fragment.includes("> .issue-history-value"));
 assert.ok(fragment.includes(".issue-cost-edit,"));
 assert.ok(fragment.includes(".issue-dates-edit"));
 assert.ok(fragment.includes("grid-row:2"));
 assert.ok(fragment.includes("min-height:52px"),"description display and textarea reserve same height");
});


test("mobile editing uses a real overlay and keeps normal-weight text",()=>{
  const app=readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
  const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
  const rule=css.slice(css.lastIndexOf("/* CANONICAL EDIT MODE"));
  assert.ok(app.includes('function syncEditorFrame(active)'));
  assert.ok(app.includes('frame=document.createElement("div")'));
  assert.ok(app.includes('body.appendChild(frame)'));
  assert.ok(app.includes('syncEditorFrame(!editor.readOnly)'));
  assert.ok(app.includes('syncEditorFrame(!id)'));
  assert.ok(app.includes('syncEditorFrame(false)'));
  assert.ok(rule.includes('body.editor-frame-active > #editor-edit-frame'));
  assert.ok(rule.includes('position:fixed!important'));
  assert.ok(rule.includes('z-index:2147483000!important'));
  assert.ok(rule.includes('pointer-events:none!important'));
  assert.ok(rule.includes('border:3px solid #177b5d'));
  assert.ok(rule.includes('.issue-field-value'));
  assert.ok(rule.includes('.editor-mode-value'));
  assert.ok(rule.includes('font-weight:400!important'));
  assert.ok(!rule.includes('toDataURL')&&!rule.includes('html2canvas'));
});

test("editing frame lifecycle creates one real element and cleans up on exit",()=>{
  const app=readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
  const expr=app.slice(app.indexOf("function syncEditorFrame(active)"),app.indexOf("function setEditorReadMode("));
  const oldDocument=globalThis.document;
  const elements=new Map();
  const classes=new Set();
  const body={classList:{
    add:v=>classes.add(v),
    remove:v=>classes.delete(v)
  },appendChild(el){elements.set(el.id,el);}};
  globalThis.document={
    body,
    getElementById(id){return elements.get(id)||null;},
    createElement(){return {id:"",attrs:{},setAttribute(k,v){this.attrs[k]=v;},remove(){elements.delete(this.id);}};}
  };
  try{
    const sync=new Function("document",expr+"return syncEditorFrame;")(globalThis.document);
    sync(true);sync(true);
    assert.equal(elements.size,1);
    assert.equal(elements.get("editor-edit-frame")?.attrs["aria-hidden"],"true");
    assert.ok(classes.has("editor-frame-active"));
    sync(false);
    assert.equal(elements.size,0);
    assert.ok(!classes.has("editor-frame-active"));
  }finally{globalThis.document=oldDocument;}
});

test("Siri-inspired fade stays outside the green mobile editing outline",()=>{
  const css=readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
  const start=css.indexOf("body.editor-frame-active > #editor-edit-frame {");
  const end=css.indexOf("}",start);
  assert.ok(start>=0&&end>start,"editing outline must exist");
  const frame=css.slice(start,end);
  assert.match(frame,/right:5px;/);
  assert.match(frame,/left:5px;/);
  assert.match(frame,/border:3px solid #177b5d;/);
  assert.match(frame,/box-shadow:/);
  assert.match(frame,/rgba\(81,148,247,/,"soft blue outside glow");
  assert.match(frame,/rgba\(255,144,177,/,"soft pink outside glow");
  assert.match(frame,/rgba\(65,204,164,/,"soft green outside glow");
  assert.doesNotMatch(frame,/\binset\s+\d+px|\bbackground:|\bfilter:blur/,"no inner-facing glow");
  assert.match(frame,/pointer-events:none!important/);
  assert.match(frame,/z-index:2147483000!important/);
  assert.doesNotMatch(frame,/\b(?:font-size|font-weight|transform|zoom|margin|padding)\s*:/);
  assert.ok(css.includes("#editor-edit-frame { display:none; }"),
    "hidden in view mode");
});
