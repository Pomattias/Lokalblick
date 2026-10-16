import test from "node:test";
import assert from "node:assert/strict";
import { applyIssueViewMode } from "../frontend/v2/issue-mode.js";
import { editorSnapshot } from "../frontend/v2/editor-safety.js";

class Element {
  constructor(){this.hidden=false;this.single=new Map();this.many=new Map();}
  querySelector(s){return this.single.get(s)||null;}
  querySelectorAll(s){return this.many.get(s)||[];}
}

function mockIssueForm(){
  const form=new Element(), field=new Element(), history=new Element();
  const label=new Element(), input=new Element(), amount=new Element(), amountInput=new Element();
  const currentClassification=new Element(), title=new Element(), titleInput=new Element();
  const save=new Element(), undo=new Element();
  field.single.set(".issue-field-value",label);
  field.single.set(".issue-field-control",input);
  history.single.set(".issue-history-value",amount);
  history.single.set(".journal-cost-enhancing",currentClassification);
  history.many.set(".issue-history-edit",[amountInput]);
  form.many.set(".issue-mode-field",[field]);
  form.many.set(".issue-history-card",[history]);
  form.single.set(".issue-title-heading",title);
  form.single.set(".issue-edit-title",titleInput);
  form.single.set("[data-issue-save]",save);
  form.single.set("[data-editor-undo]",undo);
  return {form,label,input,amount,amountInput,currentClassification,title,titleInput,save,undo};
}

test("switching from view to edit and back keeps exactly the same DOM nodes",()=>{
 const n=mockIssueForm();
 const original=Object.fromEntries(Object.entries(n));
 applyIssueViewMode(n.form,true);
 assert.equal(n.label.hidden,false);
 assert.equal(n.input.hidden,true);
 assert.equal(n.amount.hidden,false);
 assert.equal(n.amountInput.hidden,true);
 assert.equal(n.currentClassification.hidden,false);
 assert.equal(n.title.hidden,false);
 assert.equal(n.titleInput.hidden,true);
 assert.equal(n.save.hidden,true);
 assert.equal(n.undo.hidden,true);

 applyIssueViewMode(n.form,false);
 assert.equal(n.label.hidden,true);
 assert.equal(n.input.hidden,false);
 assert.equal(n.amount.hidden,true);
 assert.equal(n.amountInput.hidden,false);
 assert.equal(n.currentClassification.hidden,true);
 assert.equal(n.title.hidden,true);
 assert.equal(n.titleInput.hidden,false);
 assert.equal(n.save.hidden,false);
 assert.equal(n.undo.hidden,false);

 applyIssueViewMode(n.form,true);
 assert.equal(n.input.hidden,true);
 assert.equal(n.amount.hidden,false);
 for(const [key,value] of Object.entries(original))
   assert.equal(n[key],value,key+" must not be recreated");
});

test("new issue works without existing save/undo buttons",()=>{
 const n=mockIssueForm();
 n.form.single.delete("[data-editor-undo]");
 assert.doesNotThrow(()=>applyIssueViewMode(n.form,false));
 assert.equal(n.input.hidden,false);
});

test("empty optional slots do not break toggling",()=>{
 const f=new Element();
 f.many.set(".issue-mode-field",[new Element()]);
 f.many.set(".issue-history-card",[new Element()]);
 assert.doesNotThrow(()=>applyIssueViewMode(f,true));
 assert.doesNotThrow(()=>applyIssueViewMode(f,false));
});

test("changing presentation does not create unsaved edits or lose journal draft",()=>{
 const {form}=mockIssueForm();
 form.dataset={manualGeoSelected:""};
 const title={name:"title",type:"text",tagName:"INPUT",value:"Ventilation"};
 const cost={name:"estimatedCostTkr",type:"number",tagName:"INPUT",value:"3200"};
 const enhancing={name:"enhancingToggle",type:"checkbox",tagName:"INPUT",value:"Ja",checked:true};
 const date={name:"startDate",type:"date",tagName:"INPUT",value:"2026-09-01"};
 const records=[title,cost,enhancing,date];
 form.many.set("input[name], select[name], textarea[name]",records);
 const before=editorSnapshot(form);
 applyIssueViewMode(form,true);
 assert.equal(editorSnapshot(form),before);
 applyIssueViewMode(form,false);
 assert.equal(editorSnapshot(form),before);
 cost.value="3250";
 assert.notEqual(editorSnapshot(form),before);
 assert.equal(title.value,"Ventilation");
 assert.equal(enhancing.checked,true);
});
