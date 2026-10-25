import {importCellKey} from '../lokaler/import-cell-edits.js';
import {createBusinessLabels,visibleNumber} from '../lokaler/business-identities.js';
import {propertyDesignation,esc} from './view-format.js';
import {importStatuses} from '../lokaler/import-explanation.js';

export const importAttentionLabels={link:'Behöver kopplas',complete:'Behöver kompletteras',create:'Nya poster att godkänna',columns:'Kontrollera kolumnval',blocked:'Behöver rättas'};
export function importRowAttention(row,proposal=null){
 const link=Boolean(proposal&&!proposal.approved);
 const columns=row.columns.some(column=>column.needsMapping);
 const blocked=!link&&(row.rejected||row.reviews.some(review=>review.blocking||review.rowRejected||review.recordRejected));
 const complete=!blocked&&(row.reviews.some(review=>review.fieldRejected||review.personLinkRejected)||Boolean(row.held?.length)||row.nodes.some(node=>node.table==='properties'&&node.identified!==false&&node.record&&!propertyDesignation({designation:node.record.name,address:node.record.address})));
 const create=row.nodes.some(node=>['properties','objects','agreements'].includes(node.table)&&node.identified!==false&&!node.existing&&node.status==='pending');
 const flags={link,complete,create,columns,blocked},primary=['link','blocked','columns','complete','create'].find(key=>flags[key]);
 const reason=link?(proposal.matches.length>1?'Flera fastigheter matchar. Välj rätt koppling på raden.':'Jämför filens rad med förslaget nedan.'):blocked||complete||columns?row.reviews[0]?.reason||row.columns.find(column=>column.needsMapping)?.reason||'Fastighetsbeteckning saknas. Fyll i den här eller efter importen.':null;
 return {...flags,primary,caption:importAttentionLabels[primary]||importStatuses[row.status],reason};
}

export function importSourceValue(prepared,profile,row,column){
 const edit=prepared.cellEdits?.[importCellKey(profile,row.row,column,row.source)];if(edit)return edit.value;
 const xlsx=prepared.XLSX||globalThis.XLSX;
 if(prepared.workbook&&xlsx){
  const at=prepared.workbook.Sheets[profile.sheetKey||profile.name]?.[xlsx.utils.encode_cell({r:row.row-1,c:(profile.startColumn||0)+(column.index??profile.columns.indexOf(column))})];
  return at?.w??at?.v;
 }
 return (column.samples||column.examples||[])[row.sample||0];
}

// The same predicate governs table rows and bulk approval, including matches
// beyond the visible page. A filtered action never approves hidden candidates.
export function matchingImportRows(prepared,profiles,candidate,rows,{filter='',query='',cellEdits={}}={}){
 const proposals=new Map((candidate.report.linkProposals||[]).map((proposal,index)=>[proposal.matchingKey,{proposal,index}]));
 return rows.map(row=>{
  const match=proposals.get(row.key),attention=importRowAttention(row,match?.proposal);
  return {...row,attention,proposal:match?.proposal,proposalIndex:match?.index};
 }).filter(row=>{
  if(filter.startsWith('attention:')?!row.attention[filter.slice(10)]:filter&&row.status!==filter)return false;
  if(!query)return true;
  const profile=profiles.find(profile=>profile.name===row.sheet&&(!profile.fileName||profile.fileName===row.source));
  return [row.source,row.sheet,'Rad '+row.row,row.explanation,row.attention.reason,...row.reasons,...row.nodes.map(node=>[node.id,node.actualId,node.record?.name,node.record?.address,node.record?.title].join(' ')),...(profile?.columns||[]).map(column=>importSourceValue({...prepared,cellEdits},profile,row,column))].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv'));
 });
}

export function importLinkChoiceHtml(proposal,index,{properties=new Map(),address=null,labels=null,hints={},number=''}={}){
 if(!proposal)return '';
 labels ||= createBusinessLabels({properties:[...properties.values()]});
 const sourceName=propertyDesignation({designation:hints.propertyName,address:hints.address})||'Fastighetsbeteckning saknas',sourceAddress=hints.address||address;
 const sourceNumber=hints.managementNumber||hints.propertyId||proposal.inferredIds?.propertyId||'Saknas i filen';
 const nameOf=candidate=>{const record=properties.get(candidate.id);return propertyDesignation({designation:record?.name||candidate.label,address:record?.address||address})||'Fastighetsbeteckning saknas';};
 const key=value=>String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
 const differentName=proposal.matches.length===1&&hints.propertyName&&key(hints.propertyName)!==key(nameOf(proposal.matches[0]));
 const reason=proposal.matches.length>1?'Flera sparade fastigheter passar. Välj rätt post.':!proposal.canCreateNew?'Kontrollera kopplingen från numren'+(proposal.evidence?' · '+proposal.evidence:'')+'.':differentName?'Beteckningarna skiljer sig. Kontrollera vilken fastighet som avses.':proposal.matches.length>1?'Flera sparade fastigheter passar. Välj rätt post.':'Både adress och beteckning behövs för automatisk koppling.';
 const selected=candidate=>proposal.approved&&proposal.propertyId===candidate.id;
 const comparisonRow=(type,number,name,address,city)=>`<tr><th scope="row">${esc(type)}</th>${[number,name,address||'–',city||'–'].map(value=>`<td data-register="properties">${esc(labels.text(value))}</td>`).join('')}</tr>`;
 return `<section class="import-link-comparison import-row-detail" data-link-proposal="${index}" data-source-key="${esc(proposal.matchingKey)}"><small>${esc(reason)}</small><div class="import-comparison-scroll"><table class="import-comparison-table import-link-list" aria-label="Fastigheter att koppla"><thead><tr>${['Beteckning i filen','Adress i filen','Sparad / föreslagen beteckning','Fastighetsnummer','Välj koppling'].map(label=>`<th data-register="properties">${label}</th>`).join('')}</tr></thead><tbody>${proposal.matches.map(candidate=>{
  const record=properties.get(candidate.id),differentAddress=record?.address&&key(record.address)!==key(sourceAddress);
  return `<tr${selected(candidate)?' class="import-comparison-selected"':''}><td>${esc(sourceName)}</td><td>${esc(sourceAddress||'–')}</td><td>${esc(nameOf(candidate))}${differentAddress?`<small>Sparad adress: ${esc(record.address)}</small>`:''}</td><td>${esc(candidate.number||labels.number('properties',candidate.id))}</td><td><button type="button" data-link-use="${index}" data-link-target="${esc(candidate.id)}"${candidate.disabled?' disabled':''} aria-pressed="${Boolean(selected(candidate))}">${proposal.canCreateNew?'Använd befintlig':candidate.existing===false?'Använd föreslaget nummer':'Använd sparad koppling'}</button></td></tr>`;
 }).join('')}</tbody></table></div><div class="import-link-actions"><details data-property-comparison><summary>Jämför uppgifter</summary><div class="import-comparison-scroll"><table class="import-comparison-table" aria-label="Jämför fastighetskoppling"><thead><tr><th>Underlag</th><th>Fastighetsnummer</th><th>Fastighetsbeteckning</th><th>Adress</th><th>Ort</th></tr></thead><tbody>${comparisonRow(proposal.newProperty?'Ny fastighet · ditt val':'Från filen · Rad '+proposal.row,sourceNumber,sourceName,sourceAddress,hints.city)}${proposal.matches.map(candidate=>{const record=properties.get(candidate.id);return comparisonRow(candidate.existing===false?'Föreslagen fastighet':'Sparad fastighet',candidate.number||labels.number('properties',candidate.id),nameOf(candidate),record?.address||candidate.detail,record?.city);}).join('')}</tbody></table></div></details>${proposal.canCreateNew?`<details data-new-property-choice><summary>Egen fastighet</summary><label>Fastighetsnummer (valfritt)<input type="text" data-new-property-number="${index}" data-matching-key="${esc(proposal.matchingKey)}" aria-label="Nytt fastighetsnummer för rad ${proposal.row}" value="${esc(number||proposal.propertyNumber||'')}"></label><button type="button" data-link-new="${index}" aria-pressed="${Boolean(proposal.newProperty)}">Skapa egen fastighet</button></details>`:''}${proposal.approved?`<button type="button" data-link-reset="${index}">Ångra valet</button>`:''}</div>${proposal.records?.length?`<small>${proposal.records.map(record=>esc(record.label)+' '+esc(visibleNumber(record.value))).join(' · ')}</small>`:''}</section>`;
}

export function importColumnWarning(column){
 if(column.target!=='properties.designation')return '';
 return (column.samples||column.examples||[]).some(value=>/^\d+$/.test(String(value??'').trim()))?'Vissa exempel är enbart siffror. Kontrollera om kolumnen avser kostnadsställe i stället för fastighetsbeteckning.':'';
}
