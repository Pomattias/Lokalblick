import {fieldCatalog,prepareMappedImport,retargetColumn} from '../services/import-engine.js';
import {esc} from './views.js';
const countLabels={matched:'Säkert matchade poster',created:'Nya poster',fields:'Ändrade fält',conflicts:'Fältkonflikter',preserved:'Bevarade kompletterande uppgifter',unresolved:'Poster som kräver granskning',objectsBefore:'Objekt före',objectsAfter:'Objekt efter',propertiesBefore:'Fastigheter före',propertiesAfter:'Fastigheter efter',contractsBefore:'Avtal före',contractsAfter:'Avtal efter',activitiesAfter:'Aktiviteter efter',review:'Granskningsärenden'};
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
function sheetTable(profile, controls) {
  const cells=render=>profile.columns.map((col,ci)=>`<td>${render(col,ci)}</td>`).join('');
  const sampleCount=Math.min(3,Math.max(0,...profile.columns.map(c=>(c.samples||c.examples||[]).length)));
  return `<div class="mapping-table sheet-preview"><table><thead><tr><th scope="col">Importerad flik</th>${profile.columns.map(c=>`<th scope="col">${esc(c.header)}</th>`).join('')}</tr></thead><tbody>
    ${Array.from({length:sampleCount},(_,ri)=>`<tr data-sample-row><th scope="row">Rad ${(profile.headerRow||1)+ri+1}</th>${cells(c=>esc((c.samples||c.examples||[])[ri]??''))}</tr>`).join('')}
    <tr class="column-targets"><th scope="row">Lokalblick-data<br><small>Gäller hela kolumnen</small></th>${cells(controls)}</tr>
    </tbody></table></div>`;
}
export function mappingFieldOptions(fields,collection) {
  return fields.filter(f=>f.collection===collection).map(f=>`<option value="${esc(f.target)}">${esc(f.label.split(' → ').slice(1).join(' → ')||f.label)}</option>`).join('');
}
const collectionOptions=schemas=>schemas.map(s=>`<option value="${esc(s.key)}">${esc(s.sheet)}</option>`).join('');
export const formatHtml=column=>`${esc(column.format?.label||'Text')} · tolkas automatiskt${column.format?.invalid?' · '+column.format.invalid+' värden behöver granskas':''}${column.transform==='monthly'||/månadshyra|kr\s*\/\s*mån/i.test(column.header)?' · månadshyra räknas om till år':''}`;
export async function mapImport(prepared,schemas) {
  const profiles=structuredClone(prepared.profiles), fields=fieldCatalog(schemas);

  const d=dialog(`<h2>2. Koppla kolumner</h2><p>${esc(prepared.fileName)}. Vi föreslår var varje kolumn hör hemma och tolkar datum, tal och kronor automatiskt. Kontrollera förslagen i de tre exempelraderna. En flik kan berika flera tabeller. Uppgifter utan standardfält bevaras med sin källa.</p>
    ${prepared.known?'<details><summary>Inställningar för igenkänt underlag</summary><label><input type="checkbox" data-existing checked> Använd igenkänd tolkning av index och tillägg</label></details>':''}
    <label>Sök målfält<input data-field-search type="search" placeholder="Area, hyra, adress…"></label>
    ${profiles.map((p,pi)=>`<details open><summary>${esc(p.fileName||prepared.fileName)} · ${esc(p.name)} · rubrikrad ${p.headerRow} · ${p.rowCount} rader</summary>${sheetTable(p,(c,ci)=>`<label>Måltabell<select aria-label="Måltabell för ${esc(c.header)}" data-extra="${pi}:${ci}">${collectionOptions(schemas)}</select></label><label>Fält<select aria-label="Koppling för ${esc(c.header)}" data-map="${pi}:${ci}"><option value="@extra">Kompletterande information</option><option value="@ignore">Ignorera</option>${mappingFieldOptions(fields,c.target.startsWith('@')?c.collection:c.target.split('.')[0])}</select></label><small>${c.filled} ifyllda · ${c.approved?'Tidigare godkänd regel':'Automatiskt förslag'}</small><small data-format="${pi}:${ci}">${formatHtml(c)}</small>`)}</details>`).join('')}
    <p data-mapping-status></p><div class="actions"><button data-cancel>Avbryt</button><button data-next class="primary-action">Förhandsgranska</button></div>`);
  const locate=node=>{const [pi,ci]=Object.values(node.dataset)[0].split(':').map(Number);return profiles[pi].columns[ci];};
  d.querySelectorAll('[data-map]').forEach(n=>{n.value=locate(n).target;});
  d.querySelectorAll('[data-extra]').forEach(n=>{n.value=locate(n).target.startsWith('@')?locate(n).collection:locate(n).target.split('.')[0];});
  const update=()=>{
    d.querySelectorAll('[data-map]').forEach(n=>{const [pi]=n.dataset.map.split(':').map(Number);retargetColumn(prepared.workbook,profiles[pi],locate(n),n.value,window.XLSX);});
    d.querySelectorAll('[data-extra]').forEach(n=>{locate(n).collection=n.value;});
    d.querySelectorAll('[data-format]').forEach(n=>{n.innerHTML=formatHtml(locate(n));});
    d.querySelector('[data-mapping-status]').textContent='Föreslagna kopplingar: '+schemas.map(s=>{const n=profiles.flatMap(p=>p.columns).filter(c=>c.target.startsWith(s.key+'.')).length;return n?s.sheet+': '+n+' kolumner':'';}).filter(Boolean).join(' · ')+'. Vi matchar först fastigheter, sedan objekt och avtal.';
  };
  d.addEventListener('change',e=>{if(e.target.matches('[data-extra]')){const col=locate(e.target),select=d.querySelector(`[data-map="${e.target.dataset.extra}"]`);col.collection=e.target.value;const keep=col.target.startsWith('@')||col.target.split('.')[0]===col.collection?col.target:'@extra';select.innerHTML='<option value="@extra">Kompletterande information</option><option value="@ignore">Ignorera</option>'+mappingFieldOptions(fields,col.collection);select.value=keep;}if(e.target.matches('[data-map],[data-extra]')&&d.querySelector('[data-existing]'))d.querySelector('[data-existing]').checked=false;update();});update();
  d.querySelector('[data-field-search]').oninput=e=>{const q=e.target.value.toLocaleLowerCase('sv');d.querySelectorAll('[data-map] option').forEach(o=>{o.hidden=!o.value.startsWith('@')&&o.value!==o.parentElement.value&&!o.textContent.toLocaleLowerCase('sv').includes(q);});};
  return waitForDialog(d,finish=>{d.querySelector('[data-next]').onclick=()=>finish({profiles,existing:Boolean(d.querySelector('[data-existing]')?.checked)});});
}
export function columnPreviewHtml(prepared,mapping,result,schemas,preferences={}) {
  const fields=fieldCatalog(schemas), names=Object.fromEntries(fields.map(f=>[f.target,f.label.split(' → ').slice(1).join(' → ')]));
  const sources=new Set(mapping.profiles.map(p=>p.fileName||prepared.fileName));
  const reviews=(result.data.importReview||[]).filter(r=>r.status==='pending'&&sources.has(r.source));
  const problems=new Map();
  const uncertainRows=new Set();
  for(const row of result.report.decisions||[]){
    if(!['B','D'].includes(row.classification))continue;
    uncertainRows.add(JSON.stringify([row.source,row.sheet,row.row]));
    const key=JSON.stringify([row.source,row.sheet,row.collection,row.reason]);
    if(!problems.has(key))problems.set(key,{source:row.source,sheet:row.sheet,collection:row.collection,reason:row.reason,count:0});
    problems.get(key).count++;
  }

  return `<h2>3. Kontrollera kolumnkopplingar</h2><p>${esc(prepared.fileName)}. Underlagen har sammanförts: fastigheter först, sedan objekt, avtal och aktiviteter. Kontrollera resultatet för hela kolumner. Ändra endast kopplingar eller avvikelser som behöver det. Manuellt verifierade värden skyddas.</p>
    ${result.report.consolidation?`<p>${result.report.consolidation.files} filer · ${result.report.consolidation.sheets} flikar · ${result.report.consolidation.uniqueRecords} identifierade poster · ${result.report.consolidation.mergedOccurrences} återkommande kopplingar sammanförda.</p>`:''}<details><summary>Visa sammanställning av importen</summary>${countsHtml(result.report.counts)}</details>
    ${mapping.profiles.map((profile,pi)=>`<details open><summary>${esc(profile.fileName||prepared.fileName)} · ${esc(profile.name)} · ${profile.rowCount} rader</summary>${sheetTable(profile,(col,ci)=>{
      const [collection,field]=col.target.split('.');
      const changes=(result.report.changes||[]).filter(c=>c.collection===collection&&c.field===field&&(c.provenance?.sheet===profile.name||!c.provenance?.sheet)&&(!profile.fileName||!c.provenance?.source||c.provenance.source===profile.fileName));
      const conflicts=reviews.filter(r=>r.collection===collection&&r.field===field&&(!r.sheet||r.sheet===profile.name)&&(!profile.fileName||r.source===profile.fileName));
      const key=[collection,field,profile.fileName||prepared.fileName].map(x=>String(x||'').trim().toLocaleLowerCase('sv')).join('|');
      const canPrioritize=!col.target.startsWith('@')&&!['id','sourceId','objectId','propertyId','contractId','activityId'].includes(field);
      return `<label>Måltabell<select data-preview-collection="${pi}:${ci}" aria-label="Måltabell för ${esc(col.header)}">${collectionOptions(schemas)}</select></label><label>Fält<select aria-label="Koppling för ${esc(col.header)}" data-preview-map="${pi}:${ci}"><option value="@extra">Kompletterande information</option><option value="@ignore">Ignorera</option>${mappingFieldOptions(fields,col.target.startsWith('@')?col.collection:collection)}</select></label><small>${esc(names[col.target]|| (col.target==='@extra'?'Bevaras som kompletterande information':'Importeras inte'))}</small><small>${formatHtml(col)}</small>${canPrioritize?`<select aria-label="Berikningsregel för ${esc(col.header)}" data-column-rule="${pi}:${ci}"><option value="">Komplettera tomma fält, granska konflikter</option><option value="accept">Använd denna källa vid avvikelse</option><option value="reject">Behåll befintliga värden vid avvikelse</option></select>`:''}<small>${col.target.startsWith('@')?'':changes.length+' fältändringar · '+conflicts.length+' avvikelser'}${preferences[key]?' · Sparad kolumnregel':''}</small>`;
    })}</details>`).join('')}
    ${problems.size?`<details><summary>Rader som behöver bättre identitet eller koppling (${uncertainRows.size})</summary><p>Ändra kolumnkopplingarna ovan. Poster som fortfarande saknar säker identitet sparas i granskningsunderlaget och läggs inte automatiskt in som nya objekt.</p><table><thead><tr><th>Flik / objekttyp</th><th>Orsak</th><th>Antal</th></tr></thead><tbody>${[...problems.values()].map(p=>`<tr><td>${esc(p.source||prepared.fileName)} · ${esc(p.sheet)} · ${esc(schemas.find(s=>s.key===p.collection)?.sheet||p.collection)}</td><td>${esc(p.reason)}</td><td>${p.count}</td></tr>`).join('')}</tbody></table></details>`:''}
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
      d.querySelectorAll('[data-preview-collection]').forEach(node=>{const [pi,ci]=node.dataset.previewCollection.split(':').map(Number),col=mapping.profiles[pi].columns[ci];node.value=col.target.startsWith('@')?col.collection:col.target.split('.')[0];});
      d.querySelectorAll('[data-preview-map]').forEach(node=>{const [pi,ci]=node.dataset.previewMap.split(':').map(Number);node.value=mapping.profiles[pi].columns[ci].target;});
      d.querySelectorAll('[data-column-rule]').forEach(node=>{
        const [pi,ci]=node.dataset.columnRule.split(':').map(Number), col=mapping.profiles[pi].columns[ci];
        const key=[...col.target.split('.'),mapping.profiles[pi].fileName||prepared.fileName].map(x=>String(x).trim().toLocaleLowerCase('sv')).join('|');node.value=draft.importFieldPreferences[key]||'';
      });
    };
    d.addEventListener('change',e=>{
      if(e.target.dataset.previewCollection){
        const [pi,ci]=e.target.dataset.previewCollection.split(':').map(Number),col=mapping.profiles[pi].columns[ci];
        col.collection=e.target.value;
        if(!col.target.startsWith('@')&&col.target.split('.')[0]!==col.collection)retargetColumn(prepared.workbook,mapping.profiles[pi],col,'@extra',window.XLSX);
        usingLegacy=false;
      }else if(e.target.dataset.previewMap){
        const [pi,ci]=e.target.dataset.previewMap.split(':').map(Number);
        retargetColumn(prepared.workbook,mapping.profiles[pi],mapping.profiles[pi].columns[ci],e.target.value,window.XLSX);usingLegacy=false;
      }else if(e.target.dataset.columnRule){
        const [pi,ci]=e.target.dataset.columnRule.split(':').map(Number), col=mapping.profiles[pi].columns[ci];
        const key=[...col.target.split('.'),mapping.profiles[pi].fileName||prepared.fileName].map(x=>String(x).trim().toLocaleLowerCase('sv')).join('|');
        if(e.target.value)draft.importFieldPreferences[key]=e.target.value;else delete draft.importFieldPreferences[key];
      }else return;
      result=usingLegacy?window.LokalblickSourceService.analyzeImportWorkbook(prepared.workbook,draft,prepared.fileName):evaluate();
      recordLegacyChanges();
      const scrolls=[...d.querySelectorAll('.sheet-preview')].map(n=>n.scrollLeft);
      d.innerHTML=columnPreviewHtml(prepared,mapping,result,schemas,draft.importFieldPreferences);bind();
      d.querySelectorAll('.sheet-preview').forEach((n,i)=>{n.scrollLeft=scrolls[i]||0;});
    });
    bind();
  });
}
