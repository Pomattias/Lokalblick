import {importReviewGroups} from '../lokaler/import-conflicts.js';
import {createBusinessLabels} from '../lokaler/business-identities.js';
import {esc} from './view-format.js';

const registers={properties:'Fastighet',objects:'Objekt',contracts:'Avtal',organizations:'Bolag / organisation',people:'Person',contacts:'Personkoppling',activities:'Ärende'};
const reason=group=>!group.field&&group.collection==='objects'?'Objekt- eller avtalsnummer saknas. Fastighetsuppgifter kan fortfarande kompletteras.':/Ogiltigt eller tvetydigt datum|Ogiltigt datum/.test(group.reason)?'Datum kan inte tolkas. Ange ÅÅÅÅ-MM-DD eller lämna tomt.':group.reason;

// One row per problem, rather than repeating the explanation for every source
// row. The source table is the only editor; this list takes the user to it.
export function importProblemsHtml(reviews,prepared,mapping,schemas,data){
 const groups=importReviewGroups(reviews.filter(row=>!row.linkProposal)).filter(group=>group.category!=='values');
 if(!groups.length)return '';
 const labels=createBusinessLabels(data);
 return `<section class="import-problems" data-import-errors><h3>Uppgifter som lämnas utanför (${groups.length} ${groups.length===1?'problemtyp':'problemtyper'})</h3><p>Övriga säkert kopplade uppgifter kan sparas. Rätta här eller komplettera vid en senare import.</p><div class="import-comparison-scroll"><table class="import-comparison-table" aria-label="Problem och nästa åtgärd"><thead><tr><th>Register</th><th>Kolumn</th><th>Orsak</th><th>Källrader</th><th>Åtgärd</th></tr></thead><tbody>${groups.map(group=>{
  const first=group.reviews[0],pi=mapping.profiles.findIndex(p=>p.name===first.sheet&&(!first.source||!p.fileName||p.fileName===first.source)),ci=mapping.profiles[pi]?.columns.findIndex(c=>c.index===first.columnIndex);
  const field=first.column||schemas.find(s=>s.key===group.collection)?.columns.find(([key])=>key===group.field)?.[1]||'Identifierare';
  const sample=first.value??first.proposed;
  return `<tr data-review-category="${group.category}"><td>${esc(registers[group.collection]||'Importerad uppgift')}</td><td>${esc(field)}</td><td>${esc(labels.text(reason(group)))}${sample!=null?`<small>Exempel: ${esc(labels.text(String(sample).slice(0,120)))}</small>`:''}</td><td>${group.rowCount}</td><td><button type="button" data-filter-import-rows="${esc('problem:'+group.key)}">Visa rader</button>${pi>=0&&ci>=0?`<button type="button" data-locate-import-column="${pi}:${ci}">Välj kolumn</button>`:''}</td></tr>`;
 }).join('')}</tbody></table></div><button type="button" data-export-import-review>Hämta granskningsunderlag</button></section>`;
}
