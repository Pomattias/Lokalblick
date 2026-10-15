import test from "node:test";
import assert from "node:assert/strict";
import {isoDate,isoDateTime} from "../frontend/v2/date-format.js";
import {editorDisplayValue} from "../frontend/v2/editor-mode-fields.js";
import {responsibilityHtml} from "../frontend/v2/responsibility-editor.js";
import {activityJournalHtml} from "../frontend/v2/activity-journal.js";

test("user-facing dates use YYYY-MM-DD in ordinary values and timestamps",()=>{
  assert.equal(isoDate("2026-10-15"),"2026-10-15");
  assert.match(isoDate("2026-10-15T13:20:00Z"),/^2026-10-15$/);
  assert.match(isoDateTime("2026-10-15T13:20:00Z"),/^2026-10-15 15:20$/);
  assert.equal(editorDisplayValue({tagName:"INPUT",type:"date",value:"2026-10-15"}),"2026-10-15");
});

test("responsibility history and activity journal never display localized slash dates",()=>{
  const data={
    properties:[{id:"p",ownerPartyId:"owner",responsiblePersonId:"u"}],
    objects:[],contracts:[],businesses:[],activities:[{id:"a",type:"Underhåll",startDate:"2026-10-15",endDate:"2027-01-01",title:"Test"}],
    people:[{id:"u",name:"Kontakt",organizationId:"our"}],
    organizations:[{id:"owner",type:"owner",name:"Fastighetsägare"},{id:"our",type:"our",name:"Vi"}],
    assignments:[{id:"a1",personId:"u",organizationId:"our",targetType:"property",targetId:"p",
      role:"Ansvarig",roleKey:"our",fromDate:"2026-10-15",toDate:"2027-01-01"}],
    auditLog:[{id:"j1",collection:"activities",recordId:"a",action:"Journalanteckning",
      at:"2026-10-15T13:20:00Z",by:"Kontakt",fields:[{field:"comment",from:"",to:"Notering"}]}]
  };
  const contacts=responsibilityHtml(data,"property","p");
  assert.match(contacts,/2026-10-15/);
  assert.match(contacts,/2027-01-01/);
  assert.match(contacts,/name="responsibilityChangeDate"/);
  assert.doesNotMatch(contacts,/15\/10\/2026/);
  const journal=activityJournalHtml(data,"a",{draft:data.activities[0],editable:true});
  assert.match(journal,/2026-10-15/);
  assert.match(journal,/2027-01-01/);
  assert.doesNotMatch(journal,/15\/10\/2026/);
});
