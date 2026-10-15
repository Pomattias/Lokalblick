import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import {
  planActivityPeriod, plannedMonthsForDisplay, planningMonthHeader, planningMonthButtons
} from "../frontend/v2/planning-visual.js";
import { planning } from "../frontend/v2/views.js";
import { renderIssueEditor } from "../frontend/v2/issue-editor.js";

const activity={
  id:"ACT-7",title:"Renovering",type:"Underhåll",status:"Planerad",
  propertyId:"p1",startDate:"2027-03-10",endDate:"2027-05-18",planningYear:2027,
  yearAllocations:[{year:2027,amount:230000}],responsiblePersonId:"person",
  estimatedCost:450000,
};
const data={
  isDemo:true,activities:[activity],properties:[{id:"p1",designation:"Hamnen 4",address:"Exempelgatan 1"}],
  people:[{id:"person",name:"Förvaltaren"}],organizations:[],contracts:[],orders:[],
  operations:[],auditLog:[],budgetPlans:[],indexSeries:[],priceBaseAmounts:[{year:2027,amount:60000}]
};

test("Both Planera and Ärende use the same months and the same date fields",()=>{
  const selection={owner:"",unit:"",person:"",propertyId:"",q:""};
  const timeline=planning(data,selection,{year:2027,planningMode:"timeline",
    timelineSpan:1,issueType:"Alla",unassigned:false,unassignedHome:false});
  const form=renderIssueEditor(data,activity,activity.id);
  assert.match(timeline,/data-plan-month="2027-03"/);
  assert.match(timeline,/data-plan-month="2027-05"/);
  assert.match(form,/data-form-plan-month="2027-03"/);
  assert.match(form,/data-form-plan-month="2027-05"/);
  assert.match(form,/name="startDate"/);
  assert.match(form,/name="endDate"/);
  assert.match(form,/data-issue-plan-span="3"/);
  assert.match(timeline,/data-timeline-span="3"/);
  assert.match(timeline,/data-activity-year-amount="ACT-7"/);
  assert.match(form,/data-editor-close/);
});

test("Month planner changes canonical dates but not amounts, contacts, or identity",()=>{
  const edited=planActivityPeriod(activity,"2027-04","2027-09");
  assert.equal(edited.startDate,"2027-04-01");
  assert.equal(edited.endDate,"2027-09-30");
  assert.equal(edited.planningYear,2027);
  assert.equal(edited.id,activity.id);
  assert.equal(edited.responsiblePersonId,activity.responsiblePersonId);
  assert.deepEqual(edited.yearAllocations,activity.yearAllocations);
  assert.equal(edited.planningQuarter,null);
});

test("End month may precede first click and periods can cross year boundary",()=>{
  const edited=planActivityPeriod(activity,"2028-02","2027-12");
  assert.equal(edited.startDate,"2027-12-01");
  assert.equal(edited.endDate,"2028-02-29");
  assert.deepEqual([...plannedMonthsForDisplay(edited,2027,3)],
    ["2027-12","2028-01","2028-02"]);
  assert.throws(()=>planActivityPeriod(activity,"2027-00"),/giltiga månader/);
});

test("Legacy one-month and quarter data remain visible before re-planning",()=>{
  assert.deepEqual([...plannedMonthsForDisplay({planningYear:2027,planningMonth:9},2027,1)],
    ["2027-09"]);
  assert.deepEqual([...plannedMonthsForDisplay({planningYear:2027,planningQuarter:2},2027,1)],
    ["2027-04","2027-05","2027-06"]);
});

test("Rendering supports three years and accessible buttons, without a second stored plan",()=>{
  assert.match(planningMonthHeader(2027,3),/2029/);
  const plan=planningMonthButtons(activity,2027,3,"plan");
  const form=planningMonthButtons(activity,2027,3,"form");
  assert.equal((plan.match(/data-plan-month=/g)||[]).length,36);
  assert.equal((form.match(/data-form-plan-month=/g)||[]).length,36);
  assert.match(plan,/aria-pressed="true"/);
  assert.match(form,/aria-label=/);
});
