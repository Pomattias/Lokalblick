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


test("mobile read and edit use the same compact typography and two-column home row",()=>{
 const sheet=css;
 assert.match(sheet,/Keep case typography and dimensions stable between view and edit/);
 assert.match(sheet,/\.issue-editor #edit-form \.issue-mode-field \.issue-field-value,[\s\S]*?\.issue-field-control :is\(input,select,textarea\) \{[\s\S]*?font-size:13px;/);
 assert.match(sheet,/@media\(max-width:700px\) \{[\s\S]*?\.issue-editor #edit-form \.issue-home-row,[\s\S]*?\.issue-editor #edit-form\.editor-readonly \.issue-home-row \{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(sheet,/\.issue-field-control :is\(input,select,textarea\):focus,[\s\S]*?font-size:16px;/);
 const view=renderIssueEditor({properties:[],objects:[],contracts:[],people:[],organizations:[],orders:[],activities:[],auditLog:[],
   priceBaseAmounts:[],indexSeries:[],budgetPlans:[]},{id:"a1",title:"Rubrik",type:"Projekt"},"a1");
 assert.equal((view.match(/class="issue-home-row"/g)||[]).length,1);
 assert.equal((view.match(/class="issue-field issue-mode-field"/g)||[]).length,7);
});

test("Kostnad and Tidplan stay compact and retain a single editable field each",()=>{
 const data={properties:[],objects:[],contracts:[],people:[],organizations:[],orders:[],activities:[],auditLog:[],priceBaseAmounts:[],indexSeries:[],budgetPlans:[]};
 const item={id:"a1",title:"Test",type:"Projekt",estimatedCost:3200000,startDate:"2026-09-01",endDate:"2027-05-31",planningYear:2027};
 const html=renderIssueEditor(data,item,"a1");
 for(const field of ["estimatedCostTkr","enhancingToggle","startDate","endDate","planningYear"])
   assert.equal((html.match(new RegExp('name="'+field+'"',"g"))||[]).length,1,field);
 assert.match(html,/class="issue-history-edit issue-cost-edit"/);
 assert.match(html,/class="issue-history-edit issue-dates-edit"/);
 assert.match(html,/<input type="hidden" name="planningYear" value="2027">/);
 assert.doesNotMatch(html,/issue-year-edit/);
 assert.match(css,/Issue journal cards: same compact two-row geometry in View and Edit/);
 // Global label CSS is column-oriented; cost must explicitly override it.
 assert.match(css,/\.issue-editor #edit-form \.issue-cost-edit \{[\s\S]*?flex-direction:row;/);
 assert.match(css,/\.issue-editor #edit-form \.issue-cost-edit input\[name="estimatedCostTkr"\] \{[\s\S]*?flex:0 0 92px;/);
 assert.match(css,/\.issue-editor #edit-form \.issue-dates-edit \{[\s\S]*?height:30px;/);
 assert.match(css,/\.issue-editor #edit-form \.issue-dates-edit input\[type="date"\] \{[\s\S]*?height:30px;/);

 assert.match(css,/\.issue-editor #edit-form \.issue-cost-edit \{[\s\S]*?white-space:nowrap;/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\) 14px minmax\(0,1fr\);/);
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
