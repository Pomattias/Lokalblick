import '../domain/business-model.js';
import {esc,options,calc,money,propertyReference} from './views.js';
import {responsibilityHtml} from './responsibility-editor.js';
export function contractBusinessControls(data,c){
 const model=globalThis.LokalblickBusinessModel;
 const links=model.links(data,null,globalThis.LokalblickResponsibility.today()).filter(l=>l.contractId===c.id);
 const ids=links.map(l=>l.businessId);
 const mainId=ids[0]||"";
 const businesses=data.businesses||[];
 const primary=`<label>Verksamhet<select name="businessIds" aria-label="Verksamhet"><option value="">Ingen verksamhet vald</option>${businesses.map(b=>`<option value="${esc(b.id)}" ${mainId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`;
 const extras=`<details><summary>Flera verksamheter delar avtalet${ids.length>1?' ('+ids.length+' kopplade)':''}</summary><p>Markera ytterligare verksamheter endast när flera nyttjar samma avtal.</p><div style="display:grid;gap:8px">${businesses.filter(b=>b.id!==mainId).map(b=>`<label><input type="checkbox" name="businessIds" value="${esc(b.id)}" ${ids.includes(b.id)?'checked':''}> ${esc(b.name)}</label>`).join('')}</div></details>`;
 const distribution=links.length>1?`<details><summary>Nyttjad area och kostnadsfördelning</summary><div class="mapping-table"><table><thead><tr><th>Verksamhet</th><th>Area, m²</th><th>Kostnadsandel, %</th></tr></thead><tbody>${links.map(l=>`<tr><td>${esc(businesses.find(b=>b.id===l.businessId)?.name||l.businessId)}</td><td><input name="businessArea|${esc(l.businessId)}" aria-label="Nyttjad area" type="number" min="0" step="any" value="${esc(l.usedArea??'')}"></td><td><input name="businessShare|${esc(l.businessId)}" aria-label="Kostnadsandel" type="number" min="0" max="100" step="any" value="${esc(l.costSharePercent??'')}"></td></tr>`).join('')}</tbody></table></div><small>Frivilligt. Ingen automatisk 100-procentsandel sätts vid 1:1.</small></details>`:"";
 return `<section class="contract-section"><h3>Verksamhet</h3>${primary}${extras}${distribution}<small>Normalt en verksamhet per avtal. Kopplingarnas giltighet och historik bevaras vid ändring.</small>${!businesses.length?'<p>Verksamheter kan kopplas här när de finns i underlaget.</p>':''}</section>`;
}
export function businessDetails(data,business){
 const links=business.id?globalThis.LokalblickBusinessModel.links(data,business.id):[],contracts=[...new Set(links.map(l=>l.contractId))].map(id=>data.contracts.find(c=>c.id===id)).filter(Boolean),year=new Date().getFullYear();
 let cost;try{cost=business.id?globalThis.LokalblickBusinessModel.cost(data,business.id,year,calc()):{amount:0,allocated:false};}catch(e){cost={error:e.message};}
 return `<details><summary>Avtal och lokaler (${contracts.length})</summary><div class="mapping-table"><table><thead><tr><th>Avtal / lokal</th><th>Nyttjad area</th><th>Period</th></tr></thead><tbody>${links.map(l=>{const c=data.contracts.find(c=>c.id===l.contractId),p=data.properties.find(p=>p.id===c?.propertyId);return `<tr><td>${esc(c?.number||l.contractId)}<small>${esc(p?propertyReference(p):'')}</small></td><td>${l.usedArea==null?'Ej angiven':esc(l.usedArea)+' m²'}</td><td>${esc(l.fromDate||'Okänt')} – ${esc(l.toDate||'Ej angivet')}</td></tr>`;}).join('')}</tbody></table></div><p>Fördelad avtalskostnad ${year}: ${cost.error?esc(cost.error):cost.allocated?money(cost.amount):'Ingen uttrycklig kostnadsandel registrerad'}</p></details>`;
}
