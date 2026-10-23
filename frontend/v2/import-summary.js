import {esc} from "./view-format.js";

export function importValueChoices(groups,options){
 if(!groups.length&&!options.canonical)return '';
 const mode=options.conflictMode||'review',choices=options.conflictChoices||{};
 return `<section class="import-enrichment" data-import-enrichment><h3>Övergripande val för importen</h3>${options.reusedLinks?`<p data-import-reused-links>${options.reusedLinks} avtal använder sina sparade objekt- och fastighetskopplingar.</p>`:""}<p>Nya poster läggs till och tomma fält kompletteras automatiskt. Tomma celler i filen lämnar sparade värden orörda.</p><p>${groups.length} ${groups.length===1?'uppgift har ett annat värde':'uppgifter har andra värden'}. Det stoppar inte övriga uppgifter eller kopplingar.</p>
 <label>Vid olika värden<select data-import-conflict-mode aria-label="Hantera avvikande uppgifter">${Object.entries({review:'Fyll tomma fält och granska värdeskillnader',keep:'Fyll tomma fält och behåll sparade värden',replace:'Uppdatera med filens entydiga värden'}).map(([value,label])=>`<option value="${value}" ${value===mode?'selected':''}>${label}</option>`).join('')}</select></label>
 ${groups.length?`<details data-import-value-choices><summary>Välj värde per post (${groups.length})</summary>${groups.map((group,index)=>{
  const choice=choices[group.key]||'';
  return `<article class="import-value-choice"><strong>${esc(group.recordLabel)}${group.recordLabel!==group.recordId?' · '+esc(group.recordId):''} · ${esc(group.label)}</strong><small>Sparat i utkastet: ${esc(group.current)}</small>
  ${group.candidates.map(candidate=>{const origins=candidate.reviews.flatMap(r=>r.occurrences||[r]);return `<small>Nytt: ${esc(candidate.value)} · ${esc([...new Set(origins.map(o=>(o.source||'')+' · '+o.sheet))].join(', '))} · ${origins.length} källrad${origins.length===1?'':'er'}</small>`;}).join('')}
  ${group.candidates.length>1?'<small>Flera nya värden för samma uppgift. Välj ett värde här; det övergripande valet skriver inte över automatiskt.</small>':''}
  <label>Värde för ${esc(group.label)}<select data-import-conflict-choice="${index}" aria-label="Värde för ${esc(group.recordId)} · ${esc(group.label)}"><option value="">Följ övergripande val</option><option value="keep" ${choice==='keep'?'selected':''}>Behåll: ${esc(group.current)}</option>${group.candidates.map((candidate,ci)=>`<option value="new:${ci}" ${choice===candidate.key?'selected':''}>Använd: ${esc(candidate.value)}</option>`).join('')}</select></label></article>`;
 }).join('')}</details>`:''}<small>Ditt val gäller hela den här importen. Du kan välja undantag per uppgift. Olösta värdeskillnader sparas för senare granskning. Identifierare, osäkra kopplingar och ogiltiga värden godkänns inte av detta val.</small></section>`;
}

// Keep individual questions for uncertain links. A large set of single-candidate
// proposals has one explicit approval action and stays collapsed by default.
export function importLinkProposalsHtml(proposals=[]){
 if(!proposals.length)return '';
 const indexed=proposals.map((proposal,index)=>({proposal,index}));
 const waiting=indexed.filter(({proposal})=>!proposal.approved);
 const single=waiting.filter(({proposal})=>proposal.matches.length===1&&!proposal.requiresSelection&&!proposal.matches[0].disabled);
 const singles=new Set(single.map(({index})=>index));
 const uncertain=waiting.filter(({index})=>!singles.has(index));
 const approved=indexed.filter(({proposal})=>proposal.approved);
 const row=({proposal,index})=>{
  const match=proposal.matches[0];
  const caption=match&&((match.label===match.id?'':match.label+' · ')+match.id);
  const selector=proposal.matches.length===1&&!proposal.requiresSelection
   ? `<strong>${esc(caption||'Koppling saknas')}</strong><small>${esc(match?.detail||'')}</small>`
   : `<label>${proposal.inferredIds?.identityChoice?"Olika FastighetsID – välj nummer":"Välj fastighet"}<select data-link-property="${index}" aria-label="Fastighet för rad ${proposal.row}"><option value="">${proposal.matches.length} möjliga fastigheter – välj</option>${proposal.matches.map(candidate=>`<option value="${esc(candidate.id)}" ${candidate.disabled?'disabled':''} ${candidate.id===proposal.propertyId?'selected':''}>${proposal.inferredIds?.identityChoice?'':esc(candidate.label)+' · '}${esc(candidate.id)} · ${esc(candidate.detail)}</option>`).join('')}</select></label>`;
  const disabled=!proposal.approved&&(proposal.matches.length>1||!proposal.matches.some(candidate=>!candidate.disabled));
  return `<li data-link-proposal="${index}"><div>${selector}</div><div><span>${(proposal.records||[]).length?proposal.records.map(record=>esc(record.label)+' '+esc(record.value)).join(' · '):'Fastighetsuppgifter'}</span><small title="${esc(proposal.source)}">${esc(proposal.evidence)} · ${esc(proposal.sheet)} · rad ${proposal.row}</small></div><label class="import-link-approval"><input type="checkbox" data-approve-link="${index}" ${proposal.approved?'checked':''} ${disabled?'disabled':''}> ${proposal.approved?'Godkänd':'Godkänn'}</label></li>`;
 };
 const list=items=>`<ul aria-label="Fastigheter och föreslagna kopplingar">${items.map(row).join('')}</ul>`;
 return `<section class="import-link-proposals" data-import-link-proposals><div class="section-title"><h3>Föreslagna kopplingar</h3>${single.length?`<button type="button" data-approve-link-proposals>Godkänn ${single.length} entydiga förslag</button>`:''}</div><small>${single.length} entydiga förslag · ${uncertain.length} behöver väljas · ${approved.length} godkända. Sparade avtalskopplingar återanvänds. Nya osäkra kopplingar kräver ditt val.</small>
 ${uncertain.length?`<details data-import-link-exceptions open><summary>Behöver väljas (${uncertain.length})</summary>${list(uncertain)}</details>`:''}
 ${single.length?`<details data-import-link-suggestions><summary>Visa entydiga förslag (${single.length})</summary>${list(single)}</details>`:''}
 ${approved.length?`<details data-import-link-approved><summary>Visa godkända kopplingar (${approved.length})</summary>${list(approved)}</details>`:''}
 </section>`;
}
