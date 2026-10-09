import {fieldCatalog,prepareMappedImport} from '../services/import-engine.js';
import {esc} from './views.js';
const label=x=>[x.address,x.designation,x.city,x.number,x.tenantName,x.name,x.title,x.area?x.area+' m²':''].filter(Boolean).join(' · ');
const countLabels={matched:'Säkert matchade poster',created:'Nya poster',fields:'Ändrade fält',conflicts:'Fältkonflikter',preserved:'Bevarade kompletterande uppgifter',unresolved:'Poster som kräver granskning',propertiesBefore:'Fastigheter före',propertiesAfter:'Fastigheter efter',contractsBefore:'Avtal före',contractsAfter:'Avtal efter',activitiesAfter:'Aktiviteter efter',review:'Granskningsärenden'};
const countsHtml=counts=>Object.entries(counts||{}).map(([key,value])=>`<p><strong>${esc(countLabels[key]||key)}:</strong> ${esc(value)}</p>`).join('');
function dialog(html) {
  const d=document.createElement('dialog');d.className='followup-dialog import-dialog';d.innerHTML=html;document.body.append(d);d.showModal();return d;
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
export async function previewImport(prepared,mapping,base,schemas,actor,legacyResult) {
  const context={fingerprint:prepared.fingerprint,fileName:prepared.fileName,schemas,actor,decisions:{}};
  const evaluate=()=>prepareMappedImport(prepared.workbook,mapping.profiles,base,context,window.XLSX);
  let result=legacyResult || evaluate();
  if(legacyResult){
    result.report.changes=schemas.flatMap(s=>(result.data[s.key]||[]).flatMap(record=>{
      const previous=(base[s.key]||[]).find(x=>x.id===record.id)||{};
      return s.columns.filter(([field])=>field!=='id'&&JSON.stringify(previous[field])!==JSON.stringify(record[field])&&record[field]!=null).map(([field])=>({collection:s.key,recordId:record.id,field,from:previous[field]??'',to:record[field],provenance:record.provenance?.[field]||{sheet:record.sourceSheet||'',cell:record.sourceRow||''}}));
    }));
  }
  const render=()=>{
    const changes=result.report.changes||[];
    const decisions=result.report.decisions||[];
    return `<h2>3. Förhandsgranska berikningen</h2><p>${esc(prepared.fileName)}. Arbetsdatan ändras först när du genomför importen.</p>
    <div data-import-counts>${countsHtml(result.report.counts)}</div>
    ${decisions.filter(x=>['B','D'].includes(x.classification)).map(x=>{const key=x.sheet+'|'+x.row+'|'+x.collection;const candidates=x.candidates?.length?x.candidates:(base[x.collection]||[]);return `<details><summary>${esc(x.sheet)} rad ${x.row} · ${esc(x.reason)}</summary><p>${esc(Object.entries(x.values).map(([k,v])=>k+': '+v).join(' · '))}</p><select data-match="${esc(key)}"><option value="">Behåll i granskningsunderlaget</option><option value="ignore">Ignorera</option>${candidates.map(c=>`<option value="${esc(c.id)}">${esc(label(c))}</option>`).join('')}</select>${['contracts','orders'].includes(x.collection)?`<label>Hemvist för ny post<select data-parent="${esc(key)}"><option value="">Välj hemvist</option>${(base[x.collection==='contracts'?'properties':'activities']||[]).map(c=>`<option value="${esc(c.id)}">${esc(label(c))}</option>`).join('')}</select></label>`:''}</details>`;}).join('')}
    <div class="mapping-table"><table><thead><tr><th>Post / fält</th><th>Nuvarande</th><th>Föreslaget</th><th>Källa</th></tr></thead><tbody>${changes.slice(0,200).map(c=>`<tr><td>${esc(label(result.data[c.collection]?.find(x=>x.id===c.recordId)||{}))}<br>${esc(c.field)}</td><td>${esc(c.from)}</td><td>${esc(c.to)}</td><td>${esc(c.provenance.sheet)}!${esc(c.provenance.cell)}</td></tr>`).join('')}</tbody></table></div>
    ${changes.length>200?'<p>De första 200 fältändringarna visas.</p>':''}<div class="actions"><button data-cancel>Avbryt</button><button data-apply class="primary-action">4. Genomför import</button></div>`;
  };
  const d=dialog(render());
  return waitForDialog(d,(finish,abort)=>{
    const bind=()=>{d.querySelector('[data-cancel]').onclick=abort;d.querySelector('[data-apply]').onclick=()=>finish(result);};
    d.addEventListener('change',e=>{
      if(e.target.dataset.match){const key=e.target.dataset.match;context.decisions[key]=e.target.value==='ignore'?'ignore':e.target.value?{recordId:e.target.value}:undefined;}
      if(e.target.dataset.parent){context.decisions[e.target.dataset.parent]=e.target.value?{parentId:e.target.value}:undefined;}
      if(!legacyResult){
        result=evaluate();d.innerHTML=render();
        for(const node of d.querySelectorAll('[data-match]')){const choice=context.decisions[node.dataset.match];node.value=choice==='ignore'?'ignore':choice?.recordId||'';}
        for(const node of d.querySelectorAll('[data-parent]'))node.value=context.decisions[node.dataset.parent]?.parentId||'';
        bind();
      }
    });
    bind();
  });
}
