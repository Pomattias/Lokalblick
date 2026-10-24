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
 const reason=link?(proposal.matches.length>1?'Flera fastigheter matchar. Välj rätt koppling på raden.':`${proposal.evidence||'Underlaget'} ger ett förslag. Godkänn kopplingen på raden.`):blocked||complete||columns?row.reviews[0]?.reason||row.columns.find(column=>column.needsMapping)?.reason||'Fastighetsbeteckning saknas. Fyll i den här eller efter importen.':null;
 return {...flags,primary,caption:blocked&&/redan ett avtal under perioden/.test(reason||'')?'Avtalsperiod överlappar':importAttentionLabels[primary]||importStatuses[row.status],reason};
}

export function importSourceValue(prepared,profile,row,column){
 const xlsx=prepared.XLSX||globalThis.XLSX;
 if(prepared.workbook&&xlsx){
  const at=prepared.workbook.Sheets[profile.sheetKey||profile.name]?.[xlsx.utils.encode_cell({r:row.row-1,c:(profile.startColumn||0)+(column.index??profile.columns.indexOf(column))})];
  return at?.w??at?.v;
 }
 return (column.samples||column.examples||[])[row.sample||0];
}

// The same predicate governs table rows and bulk approval, including matches
// beyond the visible page. A filtered action never approves hidden candidates.
export function matchingImportRows(prepared,profiles,candidate,rows,{filter='',query=''}={}){
 const proposals=new Map((candidate.report.linkProposals||[]).map((proposal,index)=>[proposal.matchingKey,{proposal,index}]));
 return rows.map(row=>{
  const match=proposals.get(row.key),attention=importRowAttention(row,match?.proposal);
  return {...row,attention,proposal:match?.proposal,proposalIndex:match?.index};
 }).filter(row=>{
  if(filter.startsWith('attention:')?!row.attention[filter.slice(10)]:filter&&row.status!==filter)return false;
  if(!query)return true;
  const profile=profiles.find(profile=>profile.name===row.sheet&&(!profile.fileName||profile.fileName===row.source));
  return [row.source,row.sheet,'Rad '+row.row,row.explanation,row.attention.reason,...row.reasons,...row.nodes.map(node=>[node.id,node.actualId,node.record?.name,node.record?.address,node.record?.title].join(' ')),...(profile?.columns||[]).map(column=>importSourceValue(prepared,profile,row,column))].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv'));
 });
}

export function importLinkChoiceHtml(proposal,index,{properties=new Map(),address=null,labels=null}={}){
 if(!proposal)return '';
 labels ||= createBusinessLabels({properties:[...properties.values()]});
 const number=candidate=>candidate.number||labels.number('properties',candidate.id);
 const single=proposal.matches.length===1&&!proposal.requiresSelection,match=proposal.matches[0];
 const name=candidate=>{const record=properties.get(candidate.id);return propertyDesignation({designation:record?.name||candidate.label,address:record?.address||address})||'Fastighetsbeteckning saknas';};
 const caption=match&&[name(match)===number(match)?'':name(match),number(match)].filter(Boolean).join(' · ');
 return `<div class="import-inline-link" data-link-proposal="${index}">${single?`<strong>${esc(caption||'Koppling saknas')}</strong><small>${esc(labels.text(match?.detail||''))}</small>`:`<label>${proposal.inferredIds?.identityChoice?'Välj fastighetsnummer':'Välj fastighet'}<select data-link-property="${index}" aria-label="Fastighet för rad ${proposal.row}"><option value="">${proposal.matches.length} möjliga – välj</option>${proposal.matches.map(candidate=>`<option value="${esc(candidate.id)}"${candidate.disabled?' disabled':''}${candidate.id===proposal.propertyId?' selected':''}>${esc(name(candidate))} · ${esc(number(candidate))} · ${esc(labels.text(candidate.detail))}</option>`).join('')}</select></label>`}<small>${(proposal.records||[]).map(record=>esc(record.label)+' '+esc(visibleNumber(record.value,'Nummer saknas'))).join(' · ')}</small>${single?`<label class="import-link-approval"><input type="checkbox" data-approve-link="${index}"${proposal.approved?' checked':''}${!match||match.disabled?' disabled':''}> ${proposal.approved?'Kopplingen används':'Använd föreslagen koppling'}</label>`:`<small>${proposal.approved?'Vald koppling används':'Ditt val används direkt.'}</small>`}</div>`;
}

export function importColumnWarning(column){
 if(column.target!=='properties.designation')return '';
 return (column.samples||column.examples||[]).some(value=>/^\d+$/.test(String(value??'').trim()))?'Vissa exempel är enbart siffror. Kontrollera om kolumnen avser kostnadsställe i stället för fastighetsbeteckning.':'';
}
