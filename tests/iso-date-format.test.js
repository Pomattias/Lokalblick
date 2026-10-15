import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isoDate,isoDateTime} from "../frontend/v2/date-format.js";
import {editorDisplayValue} from "../frontend/v2/editor-mode-fields.js";
import {activityJournalHtml} from "../frontend/v2/activity-journal.js";

test("user-visible dates use YYYY-MM-DD without locale-dependent slashes",()=>{
  assert.equal(isoDate("2026-10-15"),"2026-10-15");
  assert.equal(isoDate("2026-10-15T10:45:00Z"),"2026-10-15");
  assert.equal(editorDisplayValue({type:"date",value:"2026-10-15",tagName:"INPUT"}),"2026-10-15");
  assert.equal(editorDisplayValue({type:"date",value:"",tagName:"INPUT"}),"–");
});
test("journal timestamp retains ISO date with 24-hour Swedish local time",()=>{
  const t=isoDateTime("2026-10-15T18:11:00Z");
  assert.match(t,/^2026-10-15 20:11$/);
  const data={auditLog:[{id:"j",collection:"activities",recordId:"a",action:"Journalanteckning",at:"2026-10-15T18:11:00Z",by:"Test",fields:[{field:"comment",to:"Notering"}]}],activities:[{id:"a",title:"Tak",startDate:"2026-10-01",endDate:"2026-10-30"}],orders:[]};
  const html=activityJournalHtml(data,"a",{draft:data.activities[0]});
  assert.match(html,/2026-10-15 20:11/);
  assert.doesNotMatch(html,/15\/10\/2026/);
});

test("all audit views use the shared ISO formatter rather than locale dates",()=>{
  const fs=requireSource();
  assert.match(fs,/import \{isoDateTime\} from "\.\/date-format\.js";/);
  assert.match(fs,/isoDateTime\(h\.at\)/);
  assert.match(fs,/isoDateTime\(entry\.at\)/);
  assert.doesNotMatch(fs,/new Date\((?:h|entry)\.at\)\.toLocaleString/);
});
function requireSource(){
  return readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
}
