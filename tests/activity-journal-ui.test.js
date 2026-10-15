import test from "node:test";
import assert from "node:assert/strict";
import { activityJournalHtml, activityJournalEntries } from "../frontend/v2/activity-journal.js";

const event=(action,fields,at)=>({
 id:at,collection:"activities",recordId:"a1",action,by:"Anna Lind",at,fields
});
const data={
 activities:[{
   id:"a1",estimatedCost:3200000,startDate:"2026-09-01",endDate:"2027-05-31"
 }],
 auditLog:[
   event("Journalanteckning",[{field:"comment",from:"",to:"Tidsplan avstämd"}],"2026-10-08T13:45:00Z"),
   event("Ändring",[{field:"endDate",from:"2027-04-30",to:"2027-05-31"}],"2026-10-08T13:40:00Z"),
   event("Ändring",[{field:"estimatedCost",from:2800000,to:3200000}],"2026-10-02T11:20:00Z")
 ]
};

test("journal shows notes first and cost/date history collapsed by default",()=>{
 const html=activityJournalHtml(data,"a1");
 assert.match(html,/Tidsplan avstämd/);
 assert.match(html,/3 200 tkr/);
 assert.match(html,/class="journal-cost-enhancing"/);
 assert.match(html,/type="checkbox" disabled tabindex="-1" aria-label="Värdehöjande"/);
 assert.match(html,/2026-09-01 → 2027-05-31/);
 assert.equal((html.match(/class="activity-journal-history"/g)||[]).length,2);
 assert.doesNotMatch(html,/<details class="activity-journal-history" open/);
 assert.ok(html.indexOf("Tidsplan avstämd")<html.indexOf("activity-journal-history-group"));
 assert.match(html,/Historik \(1\)/);
 assert.match(html,/2 800 tkr/);
 assert.match(html,/Startdatum|Slutdatum/);
});

test("read-only cost badge mirrors the saved value-enhancing classification",()=>{
 const checked=activityJournalHtml({...data,activities:[{...data.activities[0],actionKind:"value_enhancing"}]},"a1");
 assert.match(checked,/aria-label="Värdehöjande" checked/);
 assert.equal((checked.match(/aria-label="Värdehöjande"/g)||[]).length,1);
});

test("journal history is append-only and only matches its activity",()=>{
 const entries=activityJournalEntries(data,"a1");
 assert.equal(entries.length,3);
 assert.equal(data.auditLog.length,3);
 assert.equal(activityJournalEntries(data,"other").length,0);
 assert.ok(entries[0].at>entries[1].at);
});
