// Case journal: an append-only timeline stored in the existing auditLog.
// Entries remain distinct from editable descriptions, cost estimates and dates.
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cost=new Intl.NumberFormat("sv-SE",{maximumFractionDigits:0});
const labels={estimatedCost:"Bedömd kostnad",startDate:"Startdatum",endDate:"Slutdatum"};
const dateLabel=value=>{
 const d=new Date(value);
 return Number.isNaN(d.getTime())?"Datum saknas":d.toLocaleString("sv-SE",{dateStyle:"short",timeStyle:"short"});
};
const formatValue=(field,value)=>{
 if(value==null||value==="")return "Ej angivet";
 if(field==="estimatedCost"&&Number.isFinite(Number(value)))return cost.format(Number(value))+" kr";
 return String(value);
};
export function activityJournalEntries(data,id){
 return (data.auditLog||[]).filter(e=>e.collection==="activities"&&String(e.recordId)===String(id)&&(
   e.action==="Journalanteckning"||(e.fields||[]).some(f=>Object.hasOwn(labels,f.field))
 )).slice().sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
}
export function appendActivityNote(data,id,text,actor){
 const activity=(data.activities||[]).find(a=>String(a.id)===String(id));
 if(!activity)throw Error("Ärendet finns inte längre.");
 const note=String(text||"").trim();
 if(!note)throw Error("Skriv en notering innan du sparar.");
 if(note.length>5000)throw Error("Noteringen är för lång (max 5 000 tecken).");
 const by=String(actor?.name||"").trim();
 if(!by||by==="Okänd användare")throw Error("Ange vem som skriver noteringen.");
 const entry={
   id:globalThis.crypto?.randomUUID?.()||"NOTE|"+Date.now()+"|"+Math.random().toString(36).slice(2),
   at:new Date().toISOString(),
   by,
   byUserId:actor?.id||"",
   actorVerified:actor?.verified===true,
   collection:"activities",recordId:activity.id,action:"Journalanteckning",
   fields:[{field:"comment",from:"",to:note}]
 };
 data.auditLog ||= [];
 data.auditLog.push(entry);
 return entry;
}
export function activityJournalHtml(data,id){
 const entries=activityJournalEntries(data,id);
 const noteCount=entries.filter(e=>e.action==="Journalanteckning").length;
 const history=entries.map(e=>{
   const note=e.action==="Journalanteckning";
   const body=note?(e.fields||[]).filter(f=>["comment","note","journal"].includes(f.field)).map(f=>f.to).filter(Boolean).join(" · "):
     (e.fields||[]).filter(f=>Object.hasOwn(labels,f.field)).map(f=>labels[f.field]+": "+formatValue(f.field,f.from)+" → "+formatValue(f.field,f.to)).join("; ");
   if(!body)return "";
   return `<article class="activity-journal-entry ${note?"is-note":"is-change"}">
     <div class="activity-journal-entry-meta"><time datetime="${esc(e.at||"")}">${esc(dateLabel(e.at))}</time><span>· ${esc(e.by||"Okänd avsändare")}</span><span>· ${note?"Notering":"Ändring"}</span></div>
     <p>${esc(body)}</p>
   </article>`;
 }).join("");
 return `<section class="issue-section activity-journal" id="activity-journal" aria-label="Noteringar och ärendehistorik">
 <div class="activity-journal-heading"><h3>Noteringar och historik</h3><span>${noteCount} noteringar · ${entries.length} händelser</span></div>
 <label class="activity-journal-compose">Ny notering
   <textarea data-activity-journal-note rows="3" maxlength="5000" placeholder="Skriv exempelvis mötesanteckning, beslut eller uppföljning …"></textarea>
 </label>
 <div class="activity-journal-actions"><small>Datum och avsändare loggas automatiskt. Tidigare noteringar kan inte skrivas över.</small><button type="button" data-activity-journal-save data-activity-id="${esc(id)}">Spara notering</button></div>
 <div class="activity-journal-entries" role="log" aria-label="Ärendets noteringar och ändringar" aria-live="polite">${history||"<p>Ännu inga noteringar eller ändringar.</p>"}</div>
 </section>`;
}
