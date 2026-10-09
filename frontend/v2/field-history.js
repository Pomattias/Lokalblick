import {esc} from './views.js';
export function fieldHistory(data,collection,record,schemas) {
  const schema=schemas.find(s=>s.key===collection);
  const name=field=>schema?.columns.find(c=>c[0]===field)?.[1]||field;
  const history=(data.auditLog||[]).filter(e=>e.collection===collection&&e.recordId===record.id);
  const origins=Object.entries(record.provenance||{}).filter(([,v])=>v&&typeof v==='object');
  const extras=record.supplemental||[];
  if(!origins.length&&!history.length&&!extras.length)return '';
  return `<details class="field-history"><summary>Källor och ändringshistorik</summary>${origins.map(([field,p])=>`<details><summary>${esc(name(field))}: ${esc(p.value??record[field]??'')}</summary><p>${esc(p.source||'Källa saknas')} · ${esc(p.sheet||'')} ${esc(p.cell||p.row||'')}<br>${esc(p.at||'')} · ${esc(p.confirmedBy||'Automatiskt')} ${p.confirmedBy?'(självangiven identitet)':''}</p><small>${esc(p.matchReason||'')}</small></details>`).join('')}
    ${extras.map(x=>`<p><strong>${esc(x.label)}</strong>: ${esc(x.value)}<small> ${esc(x.provenance?.source||'')} ${esc(x.provenance?.sheet||'')}!${esc(x.provenance?.cell||'')}</small></p>`).join('')}
    ${history.map(e=>`<details><summary>${esc(e.at)} · ${esc(e.by||'')} · ${esc(e.action)}</summary>${(e.fields||[]).filter(f=>f.field!=='provenance').map(f=>`<p>${esc(name(f.field))}: ${esc(typeof f.from==='object'?JSON.stringify(f.from):f.from)} → ${esc(typeof f.to==='object'?JSON.stringify(f.to):f.to)}</p>`).join('')}</details>`).join('')}</details>`;
}
