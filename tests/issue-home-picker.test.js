import test from "node:test";
import assert from "node:assert/strict";
import {renderIssueEditor,homeChoices,issueHomeOptionsHtml} from "../frontend/v2/issue-editor.js";
import "../frontend/domain/calculations.js";
const props=Array.from({length:10000},(_,i)=>({id:"p"+i,designation:"Fastighet "+i,address:"Gata "+i}));
const contracts=Array.from({length:14000},(_,i)=>({id:"c"+i,propertyId:"p"+(i%10000),number:"A-"+i}));
const data={properties:props,contracts,activities:[{
  id:"a1",type:"Underhåll",title:"Underhåll av tak",contractId:"c9000",
  status:"Planerad",estimatedCost:45000,planningYear:2027
}],orders:[],organizations:[],people:[],priceBaseAmounts:[],indexSeries:[]};

test("existing links are available immediately without thousands of DOM options",()=>{
 const opts=homeChoices(data,"contract:c9000");
 assert.ok(opts.length<30,JSON.stringify(opts.length));
 assert.ok(opts.some(x=>x.value==="contract:c9000"));
 const html=renderIssueEditor(data,data.activities[0],"a1");
 assert.match(html,/data-issue-home-search/);
 assert.match(html,/value="contract:c9000" selected/);
 assert.ok(html.length<30000);
 assert.ok((html.match(/<option/g)||[]).length<120);
});

test("on-demand search finds another fastighet or avtal while preserving current link",()=>{
 const html=issueHomeOptionsHtml(data,"A-9250","contract:c9000");
 assert.match(html,/value="contract:c9000"/);
 assert.match(html,/value="contract:c9250"/);
 const byProperty=issueHomeOptionsHtml(data,"Fastighet 6500","property:p1");
 assert.match(byProperty,/value="property:p6500"/);
 assert.match(byProperty,/value="property:p1"/);
});

test("empty, historical and missing links never throw",()=>{
 const c=homeChoices({properties:[],contracts:[]},"contract:missing");
 assert.ok(c.some(x=>x.value==="contract:missing"));
 assert.match(issueHomeOptionsHtml({properties:[],contracts:[]},"",""),/Ej kopplat/);
});
