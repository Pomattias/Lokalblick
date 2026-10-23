import {sourceServiceScript} from "./helpers/source-service.js";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";
import XLSX from "xlsx";
import {activityChoices,changeActivityOption,normalizeActivityOptions,optionUsage} from "../frontend/v2/activity-options.js";
import {activityOptionSettings} from "../frontend/v2/activity-option-settings.js";
import {normalize} from "../frontend/v2/model.js";

test("central options start with legacy-compatible defaults but are configurable",()=>{
  const data=normalize({activities:[{id:"a",type:"Projekt",category:"Tak",status:"Planerad"}]});
  assert.ok(activityChoices(data,"type").some(x=>x.value==="Projekt"));
  assert.ok(activityChoices(data,"status").some(x=>x.value==="Planerad"));
  assert.ok(activityChoices(data,"category",{current:"Tak"}).some(x=>x.value==="Tak"));
  assert.equal(data.activityOptions.category.find(x=>x.name==="Tak").active,false);
  changeActivityOption(data,{kind:"category",action:"toggle",name:"Tak",active:true});
  changeActivityOption(data,{kind:"category",action:"scope",name:"Tak",type:"Underhåll"});
  assert.ok(activityChoices(data,"category",{type:"Underhåll"}).some(x=>x.value==="Tak"));
  assert.ok(!activityChoices(data,"category",{type:"Projekt"}).some(x=>x.value==="Tak"));
  assert.ok(activityChoices(data,"category",{type:"Projekt",current:"Tak"}).some(x=>x.value==="Tak"));
  assert.equal(optionUsage(data,"category","Tak"),1);
});
test("disabled entries are not selectable for new cases, old cases preserve their values",()=>{
  const data=normalize({activities:[{id:"a",type:"Projekt",status:"Planerad",category:"Ventilation"}]});
  changeActivityOption(data,{kind:"status",action:"toggle",name:"Planerad",active:false});
  assert.ok(!activityChoices(data,"status").some(x=>x.value==="Planerad"));
  assert.ok(activityChoices(data,"status",{current:"Planerad"}).some(x=>x.value==="Planerad"));
  assert.equal(data.activities[0].status,"Planerad");
  assert.throws(()=>changeActivityOption(data,{kind:"status",action:"delete",name:"Planerad"}),/används/);
  changeActivityOption(data,{kind:"status",action:"add",newName:"Beslutat"});
  assert.ok(activityChoices(data,"status").some(x=>x.value==="Beslutat"));
  changeActivityOption(data,{kind:"status",action:"move",name:"Beslutat",direction:-1});
  assert.equal(normalizeActivityOptions(data.activityOptions).status.at(-2).name,"Beslutat");
  assert.throws(()=>changeActivityOption(data,{kind:"status",action:"add",newName:"beslutat"}),/redan/);
});
test("unused codes truly disappear, referenced categories prevent type removal",()=>{
  const data=normalize({activities:[]});
  changeActivityOption(data,{kind:"category",action:"add",newName:"Fasad",type:"Projekt"});
  assert.throws(()=>changeActivityOption(data,{kind:"type",action:"delete",name:"Projekt"}),/kategorier/);
  changeActivityOption(data,{kind:"category",action:"delete",name:"Fasad"});
  assert.ok(!normalizeActivityOptions(data.activityOptions).category.some(x=>x.name==="Fasad"));
  changeActivityOption(data,{kind:"type",action:"delete",name:"Projekt"});
  assert.ok(!activityChoices(data,"type").some(x=>x.value==="Projekt"));
});
test("settings screen contains three compact central registers",()=>{
  const html=activityOptionSettings(normalize({activities:[]}));
  for(const key of ["type","status","category"]){
    assert.ok(html.includes('data-activity-option-kind="'+key+'"'));
    assert.ok(html.includes('data-option-new="'+key+'"'));
  }
  for(const action of ["toggle","move","delete","add"]) assert.ok(html.includes('data-option-action="'+action+'"'));
  assert.ok(html.includes('data-option-scope'));
});
test("Excel workbook persists option ordering, activity categories and disabled values",()=>{
  const sandbox={window:{},XLSX,Date,Map,Set,URL,Uint8Array,TextDecoder,console,
    localStorage:{removeItem(){},getItem(){return null},setItem(){}}};
  vm.runInNewContext(sourceServiceScript(),sandbox);
  const svc=sandbox.window.LokalblickSourceService;
  const data=normalize({properties:[],contracts:[],activities:[{id:"a",type:"Projekt",status:"Planerad",category:"Ventilation"}]});
  changeActivityOption(data,{kind:"status",action:"toggle",name:"Planerad",active:false});
  changeActivityOption(data,{kind:"status",action:"add",newName:"Beslutat"});
  changeActivityOption(data,{kind:"category",action:"scope",name:"Ventilation",type:"Projekt"});
  const workbook=svc.dataToWorkbook(data);
  const output=svc.workbookToData(workbook);
  const restored=normalize(output);
  assert.equal(restored.activities[0].status,"Planerad");
  assert.equal(restored.activityOptions.status.find(x=>x.name==="Planerad").active,false);
  assert.ok(restored.activityOptions.status.some(x=>x.name==="Beslutat"));
  assert.deepEqual(restored.activityOptions.category.find(x=>x.name==="Ventilation").types,["Projekt"]);
});
