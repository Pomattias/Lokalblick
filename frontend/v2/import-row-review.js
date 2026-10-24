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
 return {...flags,primary,caption:blocked&&/redan ett avtal under perioden/.test(reason||'')?'Avtalsperiod överlappar':importAttentionLabels[primary]||importStatuses[row.status],reason};
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
 const sourceName=propertyDesignation({designation:hints.propertyName,address:hints.address})||'Fastighetsbeteckning saknas';
 const sourceNumber=hints.managementNumber||hints.propertyId||proposal.inferredIds?.propertyId||'Saknas i filen';
 const row=(type,number,name,address,city,action,selected=false)=>`<tr${selected?' class="import-comparison-selected"':''}><th scope="row">${esc(type)}</th><td data-register="properties">${esc(labels.text(number))}</td><td data-register="properties">${esc(name)}</td><td data-register="properties">${esc(address||'–')}</td><td data-register="properties">${esc(city||'–')}</td><td>${action}</td></tr>`;
 const sourceAction=proposal.canCreateNew?`<input type="text" data-new-property-number="${index}" data-matching-key="${esc(proposal.matchingKey)}" aria-label="Nytt fastighetsnummer för rad ${proposal.row}" placeholder="Eget nummer (valfritt)" value="${esc(number||proposal.propertyNumber||'')}"><button type="button" data-link-new="${index}" aria-pressed="${proposal.newProperty}">Egen fastighet</button>`:'';
 return `<section class="import-link-comparison import-row-detail" data-link-proposal="${index}" data-source-key="${esc(proposal.matchingKey)}"><strong>${proposal.canCreateNew?'Är detta samma fastighet eller en egen fastighet?':'Kontrollera kopplingen från numren'}</strong><p>${proposal.canCreateNew?'Identifierare saknas på raden. Adress eller namn matchar en fastighet som sparats före denna import.':esc(proposal.evidence)+' ger följande nummer. Fastigheter jämförs inte genom adress här.'}</p><div class="import-comparison-scroll"><table class="import-comparison-table" aria-label="Jämför fastighetskoppling"><thead><tr><th>Underlag</th><th data-register="properties">Fastighetsnummer</th><th data-register="properties">Fastighetsbeteckning</th><th data-register="properties">Adress</th><th data-register="properties">Ort</th><th>Välj koppling</th></tr></thead><tbody>${row(proposal.newProperty?'Ny fastighet · ditt val':'Från filen · Rad '+proposal.row,sourceNumber,sourceName,hints.address||address,hints.city,sourceAction,proposal.newProperty)}${proposal.matches.map(candidate=>{
  const record=properties.get(candidate.id),name=propertyDesignation({designation:record?.name||candidate.label,address:record?.address||address})||'Fastighetsbeteckning saknas';
  return row(candidate.existing===false?'Föreslagen fastighet':'Sparad fastighet',candidate.number||labels.number('properties',candidate.id),name,record?.address||candidate.detail,record?.city,`<button type="button" data-link-use="${index}" data-link-target="${esc(candidate.id)}"${candidate.disabled?' disabled':''} aria-pressed="${proposal.approved&&proposal.propertyId===candidate.id}">${proposal.canCreateNew?'Samma fastighet':candidate.existing===false?'Använd föreslaget nummer':'Använd sparad koppling'}</button>`,proposal.approved&&proposal.propertyId===candidate.id);
 }).join('')}</tbody></table></div>${proposal.records?.length?`<small>${proposal.records.map(record=>esc(record.label)+' '+esc(visibleNumber(record.value))).join(' · ')}</small>`:''}${proposal.approved?`<button type="button" data-link-reset="${index}">Ångra valet</button>`:''}</section>`;
}

export function importColumnWarning(column){
 if(column.target!=='properties.designation')return '';
 return (column.samples||column.examples||[]).some(value=>/^\d+$/.test(String(value??'').trim()))?'Vissa exempel är enbart siffror. Kontrollera om kolumnen avser kostnadsställe i stället för fastighetsbeteckning.':'';
}
