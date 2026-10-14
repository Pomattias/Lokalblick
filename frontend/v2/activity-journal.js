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
 if(field==="estimatedCost"&&Number.isFinite(Number(value)))return cost.format(Number(value)/1000)+" tkr";
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
export function activityJournalHtml(data,id,{draft=null,editable=false}={}){
 const activity=draft||(data.activities||[]).find(x=>String(x.id)===String(id))||{};
 const entries=id?activityJournalEntries(data,id):[];
 const notes=entries.filter(e=>e.action==="Journalanteckning");
 const costs=entries.filter(e=>e.action!=="Journalanteckning" && (e.fields||[]).some(f=>f.field==="estimatedCost"));
 const dates=entries.filter(e=>e.action!=="Journalanteckning" && (e.fields||[]).some(f=>["startDate","endDate"].includes(f.field)));
 const toTkr=value=>new Intl.NumberFormat("sv-SE",{maximumFractionDigits:1}).format((Number(value)||0)/1000)+" tkr";
 const currentCost=activity.estimatedCost==null||activity.estimatedCost===""?"Ej angiven":toTkr(activity.estimatedCost);
 const currentDates=[activity.startDate||"–",activity.endDate||"–"].join(" → ");
 const enhancing=activity.actionKind==="value_enhancing" || activity.standardEnhancing===true;
 const enhancingIndicator='<span class="journal-cost-enhancing"><input type="checkbox" disabled tabindex="-1" aria-label="Värdehöjande" '+(enhancing?'checked':'')+'> Värdehöjande</span>';


 const costControl=editable?'<label class="issue-history-edit issue-cost-edit"><span class="visually-hidden">Bedömd kostnad i tkr</span><input name="estimatedCostTkr" type="number" min="0" step="0.1" value="'+esc(Math.round((Number(activity.estimatedCost)||0)/100)/10)+'" aria-label="Bedömd kostnad i tkr"><span>tkr</span></label>':"";
 const enhancingControl=editable?'<label class="issue-history-edit issue-enhancing-edit"><input type="checkbox" name="enhancingToggle" value="Ja" data-initial-checked="'+enhancing+'" '+(enhancing?"checked":"")+'>Värdehöjande</label>':"";
 const datesControl=editable?'<div class="issue-history-edit issue-dates-edit"><label><span class="visually-hidden">Startdatum</span><input name="startDate" type="date" value="'+esc(activity.startDate||"")+'" aria-label="Startdatum"></label><span aria-hidden="true">→</span><label><span class="visually-hidden">Slutdatum</span><input name="endDate" type="date" value="'+esc(activity.endDate||"")+'" aria-label="Slutdatum"></label><input type="hidden" name="planningYear" value="'+esc(Number(activity.planningYear)||new Date().getFullYear())+'"></div>':"";
 const renderNote=e=>{
   const body=(e.fields||[]).filter(f=>["comment","note","journal"].includes(f.field)).map(f=>f.to).filter(Boolean).join(" · ");
   if(!body)return "";
   return `<article class="activity-journal-entry is-note"><div class="activity-journal-entry-meta"><time datetime="${esc(e.at||"")}">${esc(dateLabel(e.at))}</time><span>· ${esc(e.by||"Okänd avsändare")}</span></div><p>${esc(body)}</p></article>`;
 };
 const renderChange=(e,allowed)=>{
   const body=(e.fields||[]).filter(f=>allowed.includes(f.field)).map(f=>labels[f.field]+": "+formatValue(f.field,f.from)+" → "+formatValue(f.field,f.to)).join("; ");
   if(!body)return "";
   return `<article class="activity-journal-entry is-change"><div class="activity-journal-entry-meta"><time datetime="${esc(e.at||"")}">${esc(dateLabel(e.at))}</time><span>· ${esc(e.by||"Okänd avsändare")}</span></div><p>${esc(body)}</p></article>`;
 };
 const history=(title,value,items,allowed,adornment="",controls="")=>
  '<div class="issue-history-card"><div class="issue-history-card-row"><span class="issue-history-label">'+esc(title)+'</span>'+
  '<strong class="issue-history-value">'+esc(value)+'</strong>'+controls+adornment+
  '<details class="activity-journal-history"><summary>Historik ('+items.length+')</summary><div class="activity-journal-entries">'+
  (items.map(e=>renderChange(e,allowed)).join("")||"<small>Ingen tidigare ändring registrerad</small>")+"</div></details></div></div>";
 return `<section class="issue-section activity-journal" id="activity-journal" aria-label="Noteringar och ärendehistorik">
 <div class="activity-journal-heading"><h3>Journal</h3><span>${notes.length} noteringar</span></div>
 ${id?`<div class="activity-journal-compose-row"><label class="activity-journal-compose"><span class="visually-hidden">Ny notering</span><textarea data-activity-journal-note rows="2" maxlength="5000" placeholder="Skriv en notering …"></textarea></label><button type="button" data-activity-journal-save data-activity-id="${esc(id)}">Spara</button></div>`:"<p class=\"issue-note\">Spara ärendet först för att börja föra en daterad journal.</p>"}
 <div class="activity-journal-groups">
 <div class="activity-journal-group"><h4>Noteringar</h4><div class="activity-journal-entries" role="log" aria-label="Noteringar">${notes.slice(0,2).map(renderNote).join("")||"<small>Inga noteringar ännu</small>"}</div>${notes.length>2?`<details><summary>Visa ${notes.length-2} äldre noteringar</summary>${notes.slice(2).map(renderNote).join("")}</details>`:""}</div>
 <div class="activity-journal-group activity-journal-history-group">${history("Kostnad",currentCost,costs,["estimatedCost"],enhancingIndicator,costControl+enhancingControl)}${history("Tidplan",currentDates,dates,["startDate","endDate"],"",datesControl)}</div>
 </div></section>`;
}
