import {esc} from "./view-format.js";

export function importValueChoices(groups,options){
 if(!groups.length&&!options.canonical)return '';
 const mode=options.conflictMode||'review',choices=options.conflictChoices||{};
 return `<details class="import-enrichment" data-import-enrichment><summary>Övergripande val för importen${groups.length?' · '+groups.length+' värdeskillnader':''}</summary>${options.reusedLinks?`<p data-import-reused-links>${options.reusedLinks} avtal använder sina sparade objekt- och fastighetskopplingar.</p>`:""}<p>Nya fastigheter, objekt och avtal måste godkännas i listan över nya poster. Tomma celler i filen lämnar sparade värden orörda.</p><p>${groups.length} ${groups.length===1?'uppgift har ett annat värde':'uppgifter har andra värden'}. Det stoppar inte övriga uppgifter eller kopplingar.</p>
 <label>Vid olika värden<select data-import-conflict-mode aria-label="Hantera avvikande uppgifter">${Object.entries({review:'Fyll tomma fält och granska värdeskillnader',keep:'Fyll tomma fält och behåll sparade värden',replace:'Uppdatera med filens entydiga värden'}).map(([value,label])=>`<option value="${value}" ${value===mode?'selected':''}>${label}</option>`).join('')}</select></label>
 ${groups.length?`<details data-import-value-choices><summary>Välj värde per post (${groups.length})</summary>${groups.map((group,index)=>{
  const choice=choices[group.key]||'';
  return `<article class="import-value-choice"><strong>${esc(group.recordLabel)}${group.recordLabel!==group.recordId?' · '+esc(group.recordId):''} · ${esc(group.label)}</strong><small>Sparat i utkastet: ${esc(group.current)}</small>
  ${group.candidates.map(candidate=>{const origins=candidate.reviews.flatMap(r=>r.occurrences||[r]);return `<small>Nytt: ${esc(candidate.value)} · ${esc([...new Set(origins.map(o=>(o.source||'')+' · '+o.sheet))].join(', '))} · ${origins.length} källrad${origins.length===1?'':'er'}</small>`;}).join('')}
  ${group.candidates.length>1?'<small>Flera nya värden för samma uppgift. Välj ett värde här; det övergripande valet skriver inte över automatiskt.</small>':''}
  <label>Värde för ${esc(group.label)}<select data-import-conflict-choice="${index}" aria-label="Värde för ${esc(group.recordId)} · ${esc(group.label)}"><option value="">Följ övergripande val</option><option value="keep" ${choice==='keep'?'selected':''}>Behåll: ${esc(group.current)}</option>${group.candidates.map((candidate,ci)=>`<option value="new:${ci}" ${choice===candidate.key?'selected':''}>Använd: ${esc(candidate.value)}</option>`).join('')}</select></label></article>`;
 }).join('')}</details>`:''}<small>Ditt val gäller hela den här importen. Du kan välja undantag per uppgift. Olösta värdeskillnader sparas för senare granskning. Identifierare, osäkra kopplingar och ogiltiga värden godkänns inte av detta val.</small></details>`;
}
