// Unified, read-only timeline derived from the canonical audit log.
// New notes are appended as audit entries, never written into the activity's mutable description.
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const cost=new Intl.NumberFormat("sv-SE",{maximumFractionDigits:0});
const labels={estimatedCost:"Bedömd kostnad",startDate:"Startdatum",endDate:"Slutdatum"};
function dateLabel(value){
 const d=new Date(value);
 return Number.isNaN(d.getTime())?String(value||"Datum saknas"):d.toLocaleString("sv-SE",{year:"numeric",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function formatValue(field,value){
 if(value==null||value==="")return "Ej angivet";
 if(field==="estimatedCost"&&Number.isFinite(Number(value)))return cost.format(Number(value))+" kr";
 return String(value);
}
export function activityJournalHtml(data,id){
 const entries=(data.auditLog||[]).filter(e=>e.collection==="activities"&&String(e.recordId)===String(id)&&
   (e.action==="Journalanteckning"||(e.fields||[]).some(f=>Object.hasOwn(labels,f.field))))
   .slice().sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
 const history=entries.map(e=>{
   const note=e.action==="Journalanteckning";
   const body=note?(e.fields||[]).filter(f=>["comment","note","journal"].includes(f.field)).map(f=>f.to).filter(Boolean).join(" · "):
     (e.fields||[]).filter(f=>Object.hasOwn(labels,f.field)).map(f=>labels[f.field]+": "+formatValue(f.field,f.from)+" → "+formatValue(f.field,f.to)).join("; ");
   if(!body)return "";
   return `<article style="border-left:3px solid ${note?"#11735f":"#bb8e35"};padding:7px 12px;margin:9px 0;background:#f8faf9;border-radius:0 7px 7px 0"><small>${esc(dateLabel(e.at))} · ${esc(e.by||"Okänd avsändare")} · ${esc(note?"Anteckning":"Ändring")}</small><p style="margin:6px 0 0;white-space:pre-wrap">${esc(body)}</p></article>`;
 }).join("");
 return `<section class="activity-journal" aria-label="Löpande journal" style="margin:18px 0;border:1px solid #d6e0dc;border-radius:10px;padding:13px">
 <h3 style="margin:0 0 6px">Löpande journal · ${entries.length} händelser</h3>
 <p style="margin:0 0 10px"><small>Datum och avsändare för anteckningar samt ändringar av kostnad och tidplan.</small></p>
 <div style="max-height:330px;overflow-y:auto">${history||"<p>Inga journalanteckningar ännu.</p>"}</div>
 <label style="display:block;margin-top:12px">Ny anteckning<textarea data-activity-journal-note rows="3" placeholder="Skriv en uppföljning, ett beslut eller en kommentar …" style="width:100%;min-height:72px"></textarea></label>
 <button type="button" data-activity-journal-save data-activity-id="${esc(id)}">Spara daterad anteckning</button>
 <small style="display:block;margin-top:7px">Journalen sparas separat från ändringar i formuläret. Ändrad kostnad och tidplan loggas vid vanlig sparning.</small>
 </section>`;
}
