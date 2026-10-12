import '../domain/responsibility-model.js';
import {esc} from './views.js';
export function responsibilityHtml(data,type,id,readOnly=false){
 const model=globalThis.LokalblickResponsibility;
 const related=type==='property'?(data.contracts||[]).filter(c=>c.propertyId===id).flatMap(c=>model.history(data,'contract',c.id).map(a=>({...a,home:c.number||c.id}))):[];
 const rows=[...model.history(data,type,id),...related];
 const issues=model.issues(data).filter(e=>rows.some(a=>a.id===e.id));
 return `<section class="property-section responsibility-section">${readOnly?'':`<label>Datum för ansvar- och verksamhetsbyte<input type="date" name="responsibilityChangeDate" value="${model.today()}"></label><small>Datumet används när en kontaktperson eller ansvarig ändras. Historiska datum som saknas lämnas tomma.</small>`}${issues.length?`<p class="warning">${esc(issues[0].message)}. Kontrollera ansvarshistoriken.</p>`:''}<details><summary>Ansvarshistorik (${rows.length})</summary>${rows.length?`<div class="mapping-table"><table><thead><tr><th>Person / roll</th><th>Part</th><th>Från</th><th>Till</th></tr></thead><tbody>${rows.map(a=>`<tr><td>${esc(data.people.find(p=>p.id===a.personId)?.name||a.personId)}<small>${esc(model.roles[model.roleKey(a)]||a.role)}${a.home?' · '+esc(a.home):''}${a.shared?' · Delat ansvar':''}${a.cancelled?' · Avslutat före tillträde':''}</small></td><td>${esc(data.organizations.find(o=>o.id===a.organizationId)?.name||'Ej angiven')}</td><td>${esc(a.fromDate||'Okänt')}</td><td>${esc(a.toDate||'Ej angivet')}</td></tr>`).join('')}</tbody></table></div>`:'<p>Ingen tidigare tilldelning.</p>'}</details></section>`;
}
