// Task-first projection of the v2 import review. This module never saves data.
import {matchingImportRows} from './import-row-review.js';
import {esc} from './view-format.js';
const num=v=>new Intl.NumberFormat('sv-SE').format(v||0);
const word=v=>String(v??'').trim();
export function importDashboardModel(prepared,profiles,candidate,storyRows,plan=[],choices={}){
 const columns=profiles.flatMap(p=>p.columns||[]);
 const unresolved=columns.filter(c=>c.target!=='@ignore'&&(c.itemAmbiguous||!c.target||c.target.startsWith('@')));
 const annotated=matchingImportRows(prepared,profiles,candidate,storyRows||[],{});
 const flags=['link','columns','blocked','complete','create'];
 const counts=Object.fromEntries(flags.map(key=>[key,annotated.filter(r=>r.attention[key]).length]));
 const pendingCreation=plan.filter(entry=>!choices[entry.key]).length;
 const attention=annotated.filter(r=>['link','blocked','complete','columns'].some(key=>r.attention[key]));
 const order={link:0,blocked:1,columns:2,complete:3,create:4};
 const queue=annotated.filter(r=>r.attention.primary).sort((a,b)=>(order[a.attention.primary]??5)-(order[b.attention.primary]??5)).slice(0,5);
 return {columns:columns.length,unresolved:unresolved.length,counts,rows:annotated.length,
  pendingCreation,attention:attention.length,queue,
  ready:unresolved.length===0&&attention.length===0&&pendingCreation===0};
}
export function importDashboardHtml(prepared,profiles,candidate,storyRows,plan=[],choices={},options={}){
 const m=importDashboardModel(prepared,profiles,candidate,storyRows,plan,choices);
 const tasks=[
  {key:'columns',count:m.unresolved,title:'Kolumner att kontrollera',description:'Välj destination för rubriker som saknar säker tolkning',action:'Välj kolumner'},
  {key:'new',count:m.pendingCreation,title:'Nya poster att ta ställning till',description:'Godkänn vilka fastigheter, objekt och avtal som ska skapas',action:'Granska nya'},
  {key:'issues',count:m.attention,title:'Rader som behöver kontrolleras',description:'Kontrollera identifierare, kopplingar och värden',action:'Visa avvikelser'}
 ].filter(x=>x.count>0);
 const examples=m.queue.map(row=>{
  const desc=word(row.attention.reason)||word(row.reasons?.[0])||'Kontrollera källradens uppgifter';
  const node=row.nodes?.find(x=>x.table==='agreements'&&x.record)
   ||row.nodes?.find(x=>x.table==='properties'&&x.record)
   ||row.nodes?.find(x=>x.table==='objects'&&x.record);
  const name=node?.record?.agreement_number||node?.record?.number||node?.record?.name||'Källrad '+row.row;
  return '<li><div><strong>'+esc(word(name))+'</strong><small>Rad '+row.row+' · '+esc(desc)+'</small></div><button type="button" data-import-open-source-row="'+esc(row.key)+'">Visa rad</button></li>';
 }).join('');
 const taskHtml=tasks.map((task,i)=>'<div class="import-review-task"><span class="import-review-task-number">'+(i+1)+'</span><div><strong>'+esc(task.title)+'</strong><small>'+esc(task.description)+'</small></div><b>'+num(task.count)+'</b><button type="button" data-import-review-action="'+task.key+'">'+esc(task.action)+'</button></div>').join('');
 return '<section class="import-decision-overview" data-import-dashboard>'+
  '<div class="import-review-steps" aria-label="Importens steg"><span>1 <strong>Fil inläst</strong></span><span aria-current="step">2 <strong>Granska</strong></span><span>3 <strong>Spara</strong></span></div>'+
  '<div class="import-decision-heading"><div><p class="import-eyebrow">LOKALBLICK / IMPORT</p><h3>Granska bara det som behöver ett beslut</h3>'+
  '<p>Lokalblick har läst '+num(m.rows)+' källrader och '+num(m.columns)+' kolumner. Säkra matchningar behålls. Ändra bara det som inte går att avgöra automatiskt.</p></div>'+
  '<button type="button" data-import-review-action="all">Visa källtabell</button></div>'+
  '<div class="import-review-numbers"><div><strong>'+num(m.rows)+'</strong><span>Källrader</span></div><div><strong>'+num(m.columns-m.unresolved)+'</strong><span>Kolumner tolkade</span></div>'+
  '<div><strong>'+num(m.pendingCreation)+'</strong><span>Nya poster att välja</span></div><div><strong>'+num(m.attention)+'</strong><span>Rader att kontrollera</span></div></div>'+
  '<div class="import-review-queue"><div class="import-review-queue-head"><h4>Nästa steg</h4><small>'+(options.stale?'Uppdaterar förslaget…':m.ready?'Inga öppna granskningsfrågor':'Börja med översta punkten')+'</small></div>'+
  (tasks.length?taskHtml:'<div class="import-review-empty">Inga granskningsfrågor återstår. Kontrollera resultatet och välj Spara import när allt stämmer.</div>')+'</div>'+
  (examples?'<details class="import-review-samples" data-import-review-samples><summary>Exempel på rader att kontrollera ('+m.queue.length+')</summary><ul>'+examples+'</ul></details>':'')+
  '<p class="import-review-footnote">Avtal, hyresgäst, fastighetsägare och förvaltare kopplas till sina respektive register. Bashyra och varje tillägg behåller egna prisvillkor och basår. Inga osäkra relationer godkänns automatiskt.</p></section>';
}
