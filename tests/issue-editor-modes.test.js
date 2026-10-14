import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderIssueEditor} from "../frontend/v2/issue-editor.js";

const app=readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
const css=readFileSync(new URL("../frontend/v2/design-system.css",import.meta.url),"utf8");

const stubNode=(name="")=>({
 name,hidden:false,disabled:false,dataset:{},
 matches(selector){return selector.split(",").some(s=>s.trim()===name);},
 querySelector(){return null;}
});

test("existing cases have a read-only class and one Redigera action",()=>{
 const data={
   properties:[],objects:[],contracts:[],people:[],organizations:[],orders:[],activities:[],auditLog:[],
   priceBaseAmounts:[],indexSeries:[],budgetPlans:[]
 };
 const caseData={id:"a1",title:"Ventilation",type:"Projekt",estimatedCost:300000,
   startDate:"2026-10-01",endDate:"2027-01-01",planningYear:2027};
 data.activities=[caseData];
 const html=renderIssueEditor(data,caseData,"a1");
 assert.match(html,/id="edit-form" class="editor-readonly"/);
 assert.equal((html.match(/data-editor-activate/g)||[]).length,1);
 assert.match(html,/data-issue-save/);
 assert.match(html,/name="estimatedCostTkr"/);
 assert.match(html,/name="startDate"/);
 assert.equal((html.match(/class="issue-history-card"/g)||[]).length,2);
 assert.match(css,/\.issue-editor #edit-form \[hidden\] \{ display:none!important; \}/);
});

test("new cases start editable in the same structure",()=>{
 const data={properties:[],objects:[],contracts:[],people:[],organizations:[],orders:[],activities:[],auditLog:[],
   priceBaseAmounts:[],indexSeries:[],budgetPlans:[]};
 const html=renderIssueEditor(data,{type:"Projekt"},"");
 assert.match(html,/id="edit-form" class="editor-editing"/);
 assert.doesNotMatch(html,/data-editor-activate/);
 assert.equal((html.match(/class="issue-history-card"/g)||[]).length,2);
});

test("Redigera unlocks the same existing controls without rebuilding or moving them",()=>{
 const a=app.indexOf("function setEditorReadMode(readOnly){");
 const b=app.indexOf("function updateEditorActions(){",a);
 assert.ok(a>=0&&b>a,"mode controller found");
 const classSet=new Set(["editor-readonly"]);
 const classList={
   toggle(name,active){if(active)classSet.add(name);else classSet.delete(name);}
 };
 const value=stubNode(),control=stubNode(),title=stubNode(),titleControl=stubNode();
 const costValue=stubNode(),costInput=stubNode(),enhancing=stubNode();
 const note=stubNode("[data-activity-journal-note]");
 const close=stubNode("[data-editor-close]");
 const edit=stubNode("[data-editor-activate]");
 const save=stubNode("[data-issue-save]");
 const undo=stubNode("[data-editor-undo]");
 const select=stubNode("select");
 const slot={querySelector:s=>s===".issue-field-value"?value:s===".issue-field-control"?control:null};
 const costCard={
   querySelector:s=>s===".issue-history-value"?costValue:s===".journal-cost-enhancing"?enhancing:null,
   querySelectorAll:s=>s===".issue-history-edit"?[costInput]:[]
 };
 const nodes=[note,close,edit,save,undo,select,costInput];
 const allRefs=[slot,costCard,...nodes,value,control,title,titleControl,costValue,enhancing];
 const map={
   ".issue-title-heading":title,
   ".issue-edit-title":titleControl,
   "[data-issue-save]":save,
   "[data-editor-undo]":undo,
   "[data-editor-activate]":edit
 };
 const form={
   classList,
   querySelector(selector){return map[selector]||null;},
   querySelectorAll(selector){
     if(selector===".issue-mode-field")return [slot];
     if(selector===".issue-history-card")return [costCard];
     if(selector==="input, select, textarea, button")return nodes;
     return [];
   }
 };
 const editor={id:"a1",col:"activities",readOnly:true};
 let notifications=0;
 const mode=new Function("editorForm","editor","updateEditorActions",
   app.slice(a,b)+";return setEditorReadMode;"
 )(()=>form,editor,()=>notifications++);
 mode(true);
 assert.equal(value.hidden,false);
 assert.equal(control.hidden,true);
 assert.equal(costValue.hidden,false);
 assert.equal(costInput.hidden,true);
 assert.equal(title.hidden,false);
 assert.equal(titleControl.hidden,true);
 assert.equal(save.hidden,true);
 assert.equal(edit.hidden,false);
 assert.equal(select.disabled,true);
 assert.equal(note.disabled,false);
 assert.equal(close.disabled,false);
 mode(false);
 assert.equal(value.hidden,true);
 assert.equal(control.hidden,false);
 assert.equal(costInput.hidden,false);
 assert.equal(title.hidden,true);
 assert.equal(titleControl.hidden,false);
 assert.equal(save.hidden,false);
 assert.equal(edit.hidden,true);
 assert.equal(select.disabled,false);
 assert.equal(note.disabled,false);
 mode(true);
 assert.equal(value.hidden,false);
 assert.equal(control.hidden,true);
 assert.equal(notifications,3);
 assert.equal(allRefs[0],slot);
 assert.equal(allRefs[1],costCard);
 assert.match(app,/form&&id&&!form\.querySelector\("\[data-editor-activate\]"\)/);
 assert.match(app,/if\(editor\.col!=="activities"\)[\s\S]*?\.focus\(\)/);
});
