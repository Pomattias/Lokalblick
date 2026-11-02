// One column decision repairs all affected source rows. Review-only projection:
// no implicit relationship approvals, writes or field replacements are allowed.
import {matchingImportRows} from './import-row-review.js';
import {importReviewGroups} from '../lokaler/import-conflicts.js';
import {schemaFields} from '../services/import-matching.js';
import {esc} from './view-format.js';

const num=v=>new Intl.NumberFormat('sv-SE').format(v||0);
const word=v=>String(v??'').trim();
const isPending=c=>c.target!=='@ignore'&&(!c.target||c.target.startsWith('@')||c.itemAmbiguous);
const preferredLabel=(target,label)=>({
 'properties.managementObjectNumber':'Fastighet → Fastighetsnummer',
 'properties.designation':'Fastighet → Fastighetsbeteckning',
 'properties.id':'Fastighet → FastighetsID',
 'objects.id':'Objekt → Objektnummer',
 'contracts.id':'Avtal → Avtalsnummer',
 'contracts.tenantPartyId':'Avtal → Hyresgäst (Part)',
 'properties.ownerPartyId':'Fastighet → Fastighetsägare (Part)',
 'properties.ownerOrganizationNumber':'Part → Fastighetsägarens organisationsnummer',
 'contracts.tenantOrganizationNumber':'Part → Hyresgästens organisationsnummer',
 'properties.ownerResponsiblePersonId':'Fastighet → Förvaltare (Person och ansvar)',
 'properties.responsiblePersonId':'Fastighet → Lokalsamordnare (Person och ansvar)'
})[target]||label||target;

export function importDashboardModel(prepared,profiles,candidate,storyRows,plan=[],choices={},options={}){
 const columns=profiles.flatMap((profile,pi)=>(profile.columns||[]).map((column,ci)=>({
  profile:profile.name,key:pi+':'+ci,column
 })));
 const unresolved=columns.filter(({column})=>isPending(column));
 const annotated=matchingImportRows(prepared,profiles,candidate,storyRows||[],{});
 const flags=['link','columns','blocked','complete','create'];
 const counts=Object.fromEntries(flags.map(key=>[key,annotated.filter(r=>r.attention[key]).length]));
 const pendingCreation=plan.filter(entry=>!choices[entry.key]).length;
 const attention=annotated.filter(r=>['link','blocked','complete','columns'].some(key=>r.attention[key]));
 const order={link:0,blocked:1,columns:2,complete:3,create:4};
 const queue=annotated.filter(r=>r.attention.primary).sort((a,b)=>(order[a.attention.primary]??5)-(order[b.attention.primary]??5)).slice(0,5);
 // Group repeated row failures by cause. Review groups never auto-approve data.
 const problems=importReviewGroups((options.reviews||[]).filter(r=>!r.linkProposal)).filter(g=>g.category!=='values');
 return {columns:columns.length,unresolved:unresolved.length,columnTasks:unresolved,
  mapped:columns.filter(({column})=>!isPending(column)&&column.target!=='@ignore'),
  ignored:columns.filter(({column})=>column.target==='@ignore'),
  counts,rows:annotated.length,pendingCreation,attention:attention.length,queue,problems,
  ready:unresolved.length===0&&attention.length===0&&pendingCreation===0};
}
export function importDashboardHtml(prepared,profiles,candidate,storyRows,plan=[],choices={},options={}){
 const m=importDashboardModel(prepared,profiles,candidate,storyRows,plan,choices,options);
 const fields=new Map((options.schemas?schemaFields(options.schemas):[]).map(f=>[f.target,f.label]));
 const typeLabels=options.schemas?.find(schema=>schema.key==='agreementItems')?.itemTypes||{};
 const mappingText=c=>{
  const label=preferredLabel(c.target,fields.get(c.target));
  if(!c.target.startsWith('agreementItems.')||!c.itemType)return label;
  const type=Object.entries(typeLabels).find(([,id])=>id===c.itemType)?.[0]||c.itemType;
  const field=label.split(' → ').at(-1);
  return 'Avtalspris · '+type+' → '+field;
 };
 const tasks=[
  {key:'columns',count:m.unresolved,title:'Kolumner att kontrollera',description:'Ett fältval gäller alla rader i samma kolumn',action:'Granska kolumner'},
  {key:'new',count:m.pendingCreation,title:'Nya poster att godkänna',description:'Granska föreslagna fastigheter, objekt och avtal',action:'Granska nya'},
  {key:'issues',count:m.problems.length||m.attention,title:'Avvikelser att granska',description:m.problems.length?
   num(m.problems.length)+' problemtyper i stället för en varning per källrad':
   'Rader med osäkra kopplingar eller uppgifter',action:'Visa avvikelser'}
 ].filter(x=>x.count>0);
 const taskHtml=tasks.map((task,i)=>'<div class="import-review-task"><span class="import-review-task-number">'+(i+1)+'</span><div><strong>'+esc(task.title)+'</strong><small>'+esc(task.description)+'</small></div><b>'+num(task.count)+'</b><button type="button" data-import-review-action="'+task.key+'">'+esc(task.action)+'</button></div>').join('');
 const columnHtml=m.columnTasks.map(({key,profile,column})=>
  '<li><div><strong>'+esc(column.header)+'</strong><small>'+esc(profile)+' · '+num(column.filled??0)+' ifyllda värden</small>'+
  (column.warning?'<small>'+esc(column.warning)+'</small>':'')+'</div><button type="button" data-import-choose-column="'+esc(key)+'">Välj mål</button></li>').join('');
 const mapHtml=m.mapped.map(({column,profile})=>
  '<li><span>'+esc(column.header)+' <small>· '+esc(profile)+'</small></span><strong>'+esc(mappingText(column))+'</strong></li>').join('');
 const causeHtml=m.problems.map(group=>
  '<li><div><strong>'+esc(group.reason||'Kontrollera uppgifterna')+'</strong><small>'+
  esc(num(group.rowCount)+' berörda källrader · '+(group.collection||'Uppgift'))+
  '</small></div><button type="button" data-filter-import-rows="problem:'+esc(group.key)+'">Visa berörda</button></li>').join('');
 const examples=m.queue.map(row=>{
  const reason=word(row.attention.reason)||word(row.reasons?.[0])||'Kontrollera uppgifterna';
  return '<li><div><strong>Rad '+row.row+'</strong><small>'+esc(reason)+'</small></div><button type="button" data-import-open-source-row="'+esc(row.key)+'">Visa rad</button></li>';
 }).join('');
 return '<section class="import-decision-overview" data-import-dashboard>'+
  '<div class="import-review-steps" aria-label="Importens steg"><span>1 <strong>Fil inläst</strong></span><span aria-current="step">2 <strong>Granska</strong></span><span>3 <strong>Spara</strong></span></div>'+
  '<div class="import-decision-heading"><div><p class="import-eyebrow">LOKALBLICK / IMPORT</p><h3>Granska bara det som behöver ett beslut</h3>'+
  '<p>Lokalblick har läst '+num(m.rows)+' källrader. En säker fastighetsnyckel används för att koppla objekt, avtal och parter – inte som separata manuella val.</p></div>'+
  '<button type="button" data-import-review-action="all">Visa källtabell</button></div>'+
  '<div class="import-review-numbers"><div><strong>'+num(m.rows)+'</strong><span>Källrader</span></div><div><strong>'+num(m.mapped.length)+'</strong><span>Kolumner kopplade</span></div>'+
  '<div><strong>'+num(m.pendingCreation)+'</strong><span>Nya poster att välja</span></div><div><strong>'+num(m.problems.length||m.attention)+'</strong><span>Problemtyper / avvikelser</span></div></div>'+
  '<div class="import-review-queue"><div class="import-review-queue-head"><h4>Det här återstår</h4><small>'+(options.stale?'Uppdaterar förslaget…':m.ready?'Inga öppna granskningsfrågor':'Börja med översta punkten')+'</small></div>'+
  (tasks.length?taskHtml:'<div class="import-review-empty">Inga granskningsfrågor återstår. Kontrollera resultatet och välj Spara import när allt stämmer.</div>')+'</div>'+
  (columnHtml?'<details class="import-review-group" data-import-column-decisions'+(m.unresolved>0?' open':'')+'><summary>Kolumner utan säker koppling <small>'+num(m.unresolved)+' att välja en gång</small></summary><ul>'+columnHtml+'</ul></details>':'')+
  (causeHtml?'<details class="import-review-group" data-import-problem-groups><summary>Avvikelser grupperade efter orsak <small>'+num(m.problems.length)+' problemtyper</small></summary><ul>'+causeHtml+'</ul></details>':'')+
  '<details class="import-review-group" data-import-mapped-columns><summary>Visa föreslagna kolumnkopplingar <small>'+num(m.mapped.length)+' kopplade · '+num(m.ignored.length)+' ignorerade</small></summary>'+
  '<ul class="import-review-map-list">'+(mapHtml||'<li>Inga säkra kolumnkopplingar ännu.</li>')+'</ul></details>'+
  (examples?'<details class="import-review-samples" data-import-review-samples><summary>Exempel på rader att kontrollera ('+m.queue.length+')</summary><ul>'+examples+'</ul></details>':'')+
  '<p class="import-review-footnote">Fastighetsnummer identifierar fastigheten; objekt och avtal kopplas via sina relationer. Hyresgäst, ägare, förvaltare samt bashyra och tillägg med respektive basår granskas utan att felaktiga kopplingar sparas automatiskt.</p></section>';
}
