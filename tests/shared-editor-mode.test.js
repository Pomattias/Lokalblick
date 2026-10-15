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
 const css=readFileSync(new URL("../frontend/v2/design-system.css",import.meta.url),"utf8");
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
