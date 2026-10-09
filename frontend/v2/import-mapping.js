import {fieldCatalog,prepareMappedImport} from '../services/import-engine.js';
import {esc} from './views.js';
const countLabels={matched:'Säkert matchade poster',created:'Nya poster',fields:'Ändrade fält',conflicts:'Fältkonflikter',preserved:'Bevarade kompletterande uppgifter',unresolved:'Poster som kräver granskning',propertiesBefore:'Fastigheter före',propertiesAfter:'Fastigheter efter',contractsBefore:'Avtal före',contractsAfter:'Avtal efter',activitiesAfter:'Aktiviteter efter',review:'Granskningsärenden'};
const countsHtml=counts=>Object.entries(counts||{}).map(([key,value])=>`<p><strong>${esc(countLabels[key]||key)}:</strong> ${esc(value)}</p>`).join('');
function dialog(html) {
  const d=document.createElement('dialog');d.className='followup-dialog import-dialog import-mapping-dialog';d.innerHTML=html;document.body.append(d);d.showModal();return d;
}
function waitForDialog(d, setup) {
  return new Promise((resolve,reject)=>{
    const finish=value=>{d.close();d.remove();resolve(value);};
    const abort=()=>{d.close();d.remove();const e=Error('Importen avbröts');e.name='AbortError';reject(e);};
    d.addEventListener('cancel',e=>{e.preventDefault();abort();});
    d.querySelector('[data-cancel]').onclick=abort;
    setup(finish,abort);
  });
}
export async function mapImport(prepared,schemas) {
  const profiles=structuredClone(prepared.profiles), fields=fieldCatalog(schemas);
  const optionHtml=fields.map(f=>`<option value="${esc(f.target)}">${esc(f.label)}</option>`).join('');
  const d=dialog(`<h2>2. Koppla kolumner</h2><p>${esc(prepared.fileName)}. Kontrollera förslagen. Kolumner utan standardfält bevaras som kompletterande uppgifter.</p>
    ${prepared.known?'<label><input type="checkbox" data-existing checked> Använd befintlig specialadapter för denna kända struktur (bevarar index- och tilläggsregler)</label>':''}
    <label>Sök målfält<input data-field-search type="search" placeholder="Area, hyra, adress…"></label>
    ${profiles.map((p,pi)=>`<details open><summary>${esc(p.name)} · rubrikrad ${p.headerRow} · ${p.rowCount} rader</summary><div class="mapping-table"><table><thead><tr><th>Excelkolumn och exempel</th><th>Lokalblick</th><th>Tolkning</th></tr></thead><tbody>${p.columns.map((c,ci)=>`<tr><td><strong>${esc(c.header)}</strong><small>${c.examples.map(esc).join(' · ')}<br>${c.filled} ifyllda · ${c.missing} saknade<br>${c.approved?'Tidigare godkänd regel':'Automatiskt förslag'}</small></td><td><select data-map="${pi}:${ci}"><option value="@extra">Kompletterande information</option><option value="@ignore">Ignorera</option>${optionHtml}</select><select data-extra="${pi}:${ci}">${schemas.map(s=>`<option value="${esc(s.key)}">${esc(s.sheet)}</option>`).join('')}</select></td><td><select data-transform="${pi}:${ci}"><option value="auto">Automatisk datatyp</option><option value="text">Text</option><option value="monthly">Månadshyra × 12</option></select><label><input data-identity="${pi}:${ci}" type="checkbox" ${c.identity?'checked':''}> Identitetsnyckel</label></td></tr>`).join('')}</tbody></table></div></details>`).join('')}
    <p data-mapping-status></p><div class="actions"><button data-cancel>Avbryt</button><button data-next class="primary-action">Förhandsgranska</button></div>`);
  const locate=node=>{const [pi,ci]=Object.values(node.dataset)[0].split(':').map(Number);return profiles[pi].columns[ci];};
  d.querySelectorAll('[data-map]').forEach(n=>{n.value=locate(n).target;});
  d.querySelectorAll('[data-extra]').forEach(n=>{n.value=locate(n).collection;});
  d.querySelectorAll('[data-transform]').forEach(n=>{n.value=locate(n).transform;});
  const update=()=>{
    d.querySelectorAll('[data-map]').forEach(n=>{locate(n).target=n.value;});
    d.querySelectorAll('[data-extra]').forEach(n=>{locate(n).collection=n.value;n.hidden=locate(n).target!=='@extra';});
    d.querySelectorAll('[data-transform]').forEach(n=>{locate(n).transform=n.value;});
    d.querySelectorAll('[data-identity]').forEach(n=>{locate(n).identity=n.checked;});
    d.querySelector('[data-mapping-status]').textContent=profiles.map(p=>p.name+': '+p.columns.filter(c=>!c.target.startsWith('@')).length+' kopplade kolumner, '+p.columns.filter(c=>c.target==='@extra').length+' kompletterande').join(' · ');
  };
  d.addEventListener('change',e=>{if(e.target.matches('[data-map],[data-extra],[data-transform],[data-identity]')&&d.querySelector('[data-existing]'))d.querySelector('[data-existing]').checked=false;update();});update();
  d.querySelector('[data-field-search]').oninput=e=>{const q=e.target.value.toLocaleLowerCase('sv');d.querySelectorAll('[data-map] option').forEach(o=>{o.hidden=!o.value.startsWith('@')&&o.value!==o.parentElement.value&&!o.textContent.toLocaleLowerCase('sv').includes(q);});};
  return waitForDialog(d,finish=>{d.querySelector('[data-next]').onclick=()=>finish({profiles,existing:Boolean(d.querySelector('[data-existing]')?.checked)});});
}
export function columnPreviewHtml(prepared,mapping,result,schemas,preferences={}) {
  const fields=fieldCatalog(schemas), names=Object.fromEntries(fields.map(f=>[f.target,f.label]));
  const reviews=(result.data.importReview||[]).filter(r=>r.status==='pending'&&r.source===prepared.fileName);
  const problems=new Map();
  const uncertainRows=new Set();
  for(const row of result.report.decisions||[]){
    if(!['B','D'].includes(row.classification))continue;
    uncertainRows.add(JSON.stringify([row.sheet,row.row]));
    const key=JSON.stringify([row.sheet,row.collection,row.reason]);
    if(!problems.has(key))problems.set(key,{sheet:row.sheet,collection:row.collection,reason:row.reason,count:0});
    problems.get(key).count++;
  }
  const options=fields.map(f=>`<option value="${esc(f.target)}">${esc(f.label)}</option>`).join('');
  return `<h2>3. Kontrollera kolumnkopplingar</h2><p>${esc(prepared.fileName)}. Välj hur varje kolumn ska användas. Regeln gäller alla matchade poster i kolumnen. Manuellt verifierade värden skyddas.</p>
    <details><summary>Visa sammanställning av importen</summary>${countsHtml(result.report.counts)}</details>
    ${mapping.profiles.map((profile,pi)=>`<details open><summary>${esc(profile.name)} · ${profile.rowCount} rader</summary><div class="mapping-table"><table><thead><tr><th>Excelkolumn / exempel</th><th>Koppling i Lokalblick</th><th>Berikningsregel och resultat</th></tr></thead><tbody>${profile.columns.map((col,ci)=>{
      const [collection,field]=col.target.split('.');
      const changes=(result.report.changes||[]).filter(c=>c.collection===collection&&c.field===field&&(c.provenance?.sheet===profile.name||!c.provenance?.sheet));
      const conflicts=reviews.filter(r=>r.collection===collection&&r.field===field&&(!r.sheet||r.sheet===profile.name));
      const key=[collection,field,prepared.fileName].map(x=>String(x||'').trim().toLocaleLowerCase('sv')).join('|');
      const canPrioritize=!col.target.startsWith('@')&&!['id','sourceId','propertyId','contractId','activityId'].includes(field);
      return `<tr><td><strong>${esc(col.header)}</strong><small>${col.examples.map(esc).join(' · ')}<br>${col.filled} ifyllda</small></td><td><select aria-label="Koppling för ${esc(col.header)}" data-preview-map="${pi}:${ci}"><option value="@extra">Kompletterande information</option><option value="@ignore">Ignorera</option>${options}</select><small>${esc(names[col.target]|| (col.target==='@extra'?'Bevaras som kompletterande information':'Importeras inte'))}${col.identity?' · Identitetsnyckel':''}</small></td><td>${canPrioritize?`<select aria-label="Berikningsregel för ${esc(col.header)}" data-column-rule="${pi}:${ci}"><option value="">Komplettera tomma fält, granska konflikter</option><option value="accept">Använd denna källa vid avvikelse</option><option value="reject">Behåll befintliga värden vid avvikelse</option></select>`:''}<small>${col.target.startsWith('@')?'':changes.length+' fältändringar · '+conflicts.length+' avvikelser'}${preferences[key]?' · Sparad kolumnregel':''}</small></td></tr>`;
    }).join('')}</tbody></table></div></details>`).join('')}
    ${problems.size?`<details><summary>Rader som behöver bättre identitet eller koppling (${uncertainRows.size})</summary><p>Ändra kolumnkopplingarna ovan. Poster som fortfarande saknar säker identitet sparas i granskningsunderlaget och läggs inte automatiskt in som nya objekt.</p><table><thead><tr><th>Flik / objekttyp</th><th>Orsak</th><th>Antal</th></tr></thead><tbody>${[...problems.values()].map(p=>`<tr><td>${esc(p.sheet)} · ${esc(schemas.find(s=>s.key===p.collection)?.sheet||p.collection)}</td><td>${esc(p.reason)}</td><td>${p.count}</td></tr>`).join('')}</tbody></table></details>`:''}
    <div class="actions"><button data-cancel>Avbryt</button><button data-apply class="primary-action">4. Genomför import</button></div>`;
}
export async function previewImport(prepared,mapping,base,schemas,actor,legacyResult) {
  const context={fingerprint:prepared.fingerprint,fileName:prepared.fileName,schemas,actor,decisions:{}};
  const draft=structuredClone(base);draft.importFieldPreferences ||= {};
  const evaluate=()=>prepareMappedImport(prepared.workbook,mapping.profiles,draft,context,window.XLSX);
  let result=legacyResult||evaluate(), usingLegacy=Boolean(legacyResult);
  const recordLegacyChanges=()=>{
    if(!usingLegacy)return;
    result.report.changes=schemas.flatMap(s=>(result.data[s.key]||[]).flatMap(record=>{
      const before=(draft[s.key]||[]).find(r=>r.id===record.id)||{};
      return s.columns.filter(([field])=>field!=='id'&&record[field]!=null&&JSON.stringify(before[field])!==JSON.stringify(record[field])).map(([field])=>({collection:s.key,field,provenance:record.provenance?.[field]||{sheet:record.sourceSheet||''}}));
    }));
  };
  recordLegacyChanges();
  const d=dialog(columnPreviewHtml(prepared,mapping,result,schemas,draft.importFieldPreferences));
  return waitForDialog(d,(finish,abort)=>{
    const bind=()=>{
      d.querySelector('[data-cancel]').onclick=abort;
      d.querySelector('[data-apply]').onclick=()=>finish(result);
      d.querySelectorAll('[data-preview-map]').forEach(node=>{const [pi,ci]=node.dataset.previewMap.split(':').map(Number);node.value=mapping.profiles[pi].columns[ci].target;});
      d.querySelectorAll('[data-column-rule]').forEach(node=>{
        const [pi,ci]=node.dataset.columnRule.split(':').map(Number), col=mapping.profiles[pi].columns[ci];
        const key=[...col.target.split('.'),prepared.fileName].map(x=>String(x).trim().toLocaleLowerCase('sv')).join('|');node.value=draft.importFieldPreferences[key]||'';
      });
    };
    d.addEventListener('change',e=>{
      if(e.target.dataset.previewMap){
        const [pi,ci]=e.target.dataset.previewMap.split(':').map(Number);
        mapping.profiles[pi].columns[ci].target=e.target.value;usingLegacy=false;
      }else if(e.target.dataset.columnRule){
        const [pi,ci]=e.target.dataset.columnRule.split(':').map(Number), col=mapping.profiles[pi].columns[ci];
        const key=[...col.target.split('.'),prepared.fileName].map(x=>String(x).trim().toLocaleLowerCase('sv')).join('|');
        if(e.target.value)draft.importFieldPreferences[key]=e.target.value;else delete draft.importFieldPreferences[key];
      }else return;
      result=usingLegacy?window.LokalblickSourceService.analyzeImportWorkbook(prepared.workbook,draft,prepared.fileName):evaluate();
      recordLegacyChanges();
      d.innerHTML=columnPreviewHtml(prepared,mapping,result,schemas,draft.importFieldPreferences);bind();
    });
    bind();
  });
}
