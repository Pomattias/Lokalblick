// Compact review of the actual v2 import. One register at a time.
// Underlying data is only written after all four approvals (atomic save).
import {viewCollections} from '../lokaler/view-fields.js';
import {creationChoice,creationAvailable} from '../lokaler/import-plan.js';
import {esc} from './view-format.js';

// Canonical sheets do not expose profile.rowCount; count source rows from
// the workbook range so the visible import is guided in either data mode.
export function guidedWorkbookRowCount(profiles,workbook,XLSX){
 return (profiles||[]).reduce((total,p)=>{
  const sheet=workbook?.Sheets?.[p.sheetKey||p.name];
  let fromSheet=0;
  if(sheet?.['!ref']&&XLSX?.utils?.decode_range){
   const range=XLSX.utils.decode_range(sheet['!ref']);
   const header=p.headerRow??range.s.r+1;
   fromSheet=Math.max(0,range.e.r-header+1);
  }
  return total+Math.max(p.rowCount||0,fromSheet);
 },0);
}
export const guidedStages=[
 {title:'Fastigheter',tables:['properties'],button:'Godkänn fastigheter och fortsätt'},
 {title:'Objekt',tables:['objects'],button:'Godkänn objekt och fortsätt'},
 {title:'Avtal',tables:['agreements','agreement_items'],button:'Godkänn avtal och fortsätt'},
 {title:'Hyresgäster, parter & personer',tables:['parties','people','contacts'],button:'Spara säkra uppgifter'}
];
const formatCount=n=>new Intl.NumberFormat('sv-SE').format(n||0);
const clean=v=>String(v??'').trim();
const label=(table,row,data)=>{
 const properties=data.properties||[],objects=data.objects||[],agreements=data.agreements||[];
 const property=id=>properties.find(p=>p.id===id);
 const object=id=>objects.find(o=>o.id===id);
 if(table==='properties')return [row.management_object_number||row.id,row.name||'',row.address||'',row.city||''];
 if(table==='objects')return [row.id,property(row.property_id)?.name||row.property_id||'',
  row.area==null?'':row.area+' m²',''];
 if(table==='agreements')return [row.id,object(row.object_id)?.id||row.object_id||'',
  property(object(row.object_id)?.property_id)?.name||'',row.valid_from||''];
 if(table==='agreement_items')return [row.name||row.type||'',agreements.find(a=>a.id===row.agreement_id)?.id||'',
  row.base_amount==null?'':row.base_amount+' kr',row.base_year||''];
 if(table==='parties')return [row.name||'',row.organization_number||'',row.kind||'',''];
 if(table==='people')return [row.name||'',row.email||'',row.phone||'',''];
 if(table==='contacts')return [data.people?.find(p=>p.id===row.person_id)?.name||'',
  row.role||'',row.property_id||row.agreement_id||'',row.valid_from||''];
 return [row.id||'','','',''];
};
const stageIssues=(candidate,tables)=>{
 const collection=new Set(tables.map(t=>viewCollections[t]||t));
 return (candidate?.data?.importReview||candidate?.clean?.workspace?.importReview||[])
  .filter(item=>item.status==='pending'&&(!item.collection||collection.has(item.collection)));
};
function affectedByRejectedSource(candidate,table,id){
 return (candidate?.report?.sourceRows||[]).some(row=>
  row.rejected&&(row.records?.[table]||row.records?.[viewCollections[table]]||[]).includes(id));
}
export function guidedSafeCreation(entry,candidate){
 const problems=stageIssues(candidate,[entry.table]);
 return !problems.some(issue=>issue.recordId===entry.record.id&&(issue.blocking||issue.recordRejected||issue.rowRejected))&&
  !affectedByRejectedSource(candidate,entry.table,entry.record.id);
}
export function guidedReviewModel(prepared,candidate,base,plan,choices,step=0,{skippedColumns=[]}={}){
 const stage=guidedStages[Math.max(0,Math.min(3,step))],tables=stage.tables;
 const data=candidate?.clean||{},current=base||{},rows=[],newIds=new Set(plan.filter(p=>tables.includes(p.table)).map(p=>p.record.id));
 for(const table of tables){
  const before=new Map((current[table]||[]).map(row=>[row.id,row]));
  const states=candidate?.report?.recordStates?.[viewCollections[table]||table]||{};
  const values=(data[table]||[]).filter(row=>
   newIds.has(row.id)||Boolean(states[row.id]));
  for(const row of values){
   const proposed=!before.has(row.id);
   const entry=plan.find(p=>p.table===table&&p.record.id===row.id);
   const safe=!entry||guidedSafeCreation(entry,candidate);
   const approved=entry&&creationChoice(entry,choices)?.action==='create';
   rows.push({table,id:row.id,cells:label(table,row,data),source:entry?.origins?.[0],
    status:!safe?'review':proposed?(approved?'approved':'new'):
     states[row.id]==='unchanged'?'existing':'update',
    safe,approved,entry});
  }
 }
 const reviews=stageIssues(candidate,tables);
 const excluded=(candidate?.report?.sourceRows||[]).filter(r=>r.rejected).length;
 return {stage,rows,reviews,excluded,skippedColumns,
  stats:{new:rows.filter(r=>r.status==='new'||r.status==='approved').length,
   updated:rows.filter(r=>r.status==='update').length,
   review:rows.filter(r=>r.status==='review').length,
   existing:rows.filter(r=>r.status==='existing').length,
   issues:reviews.length}};
}
export function guidedApproveStage(plan,choices,candidate,base,step){
 const tables=guidedStages[step]?.tables||[];
 const next={...choices};
 for(const entry of plan.filter(p=>tables.includes(p.table))){
  if(creationChoice(entry,next))continue; // preserve explicit expert decisions
  const safe=guidedSafeCreation(entry,candidate);
  const available=creationAvailable(entry,plan,next,base);
  next[entry.key]={signature:entry.signature,action:safe&&available?'create':'defer'};
 }
 return next;
}
export function guidedReviewHtml(prepared,candidate,base,plan,choices,step,options={}){
 const model=guidedReviewModel(prepared,candidate,base,plan,choices,step,options);
 const {stage,rows,reviews,stats}=model,done=step===guidedStages.length-1;
 const identifierIssues=step===2?(options.identifierIssues||[]):[];
 const rowText=r=>r.status==='review'?'Behöver åtgärdas':r.status==='approved'?'Godkänd':
  r.status==='new'?'Ny – klar för import':r.status==='existing'?'Finns redan':'Kompletteras';
 const steps='<ol class="import-guided-steps" aria-label="Importens steg">'+guidedStages.map((s,i)=>
  '<li class="'+(i<step?'is-done':i===step?'is-current':'')+'"'+(i===step?' aria-current="step"':'')+'>'+
  '<span>'+ (i<step?'✓':i+1)+'</span><strong>'+esc(s.title)+'</strong>'+
  '<small>'+(i<step?'Godkänd':i===step?'Pågår':'Kommer sedan')+'</small></li>').join('')+'</ol>';
 const header=step===0?['Fastighetsnummer','Fastighet','Adress','Ort','Status']:
  step===1?['Objektsnummer','Fastighet','Area','Övrigt','Status']:
  step===2?['Nummer / Post','Objekt / Avtal','Fastighet / Belopp','Fr.o.m. / Basår','Status']:
  ['Part / Person','Org.nr / E-post','Typ / Roll','Koppling','Status'];
 const table='<div class="import-guided-list" role="region" aria-label="Förhandsgranskning '+esc(stage.title)+'" tabindex="0">'+
  '<table><thead><tr>'+header.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+
  (rows.length?rows.map(r=>'<tr data-guided-record="'+esc(r.table+':'+r.id)+'"><td>'+
   r.cells.map(v=>esc(v||'–')).join('</td><td>')+'</td><td>'+esc(rowText(r))+'</td></tr>').join(''):
   '<tr><td colspan="5">Inga nya uppgifter i detta steg. Du kan fortsätta.</td></tr>')+'</tbody></table></div>'+
  '';
 const allIssues=[...identifierIssues,...reviews],issueCount=allIssues.length+stats.review;
 const issueSummary='<details class="import-guided-issues"'+(identifierIssues.length?' open':'')+
  '><summary>Behöver åtgärdas · '+formatCount(issueCount)+
  '</summary><p>Osäkra uppgifter stoppar inte säker import. Rätta i Excel och importera senare.</p>'+
  (allIssues.length?'<ul>'+allIssues.slice(0,50).map(r=>'<li><strong>'+
   esc([r.sheet,r.row?'rad '+r.row:'',r.field].filter(Boolean).join(' · '))+
   '</strong> '+esc(r.reason||r.message||'Uppgiften behöver kontrolleras')+'</li>').join('')+'</ul>':
   '<p>Inga nya avvikelser för detta register.</p>')+
  (allIssues.length>50?'<p>Visar 50 av '+formatCount(allIssues.length)+' avvikelser. Alla finns i avancerad granskning.</p>':'')+'</details>';
 const nextDisabled=options.stale||!candidate?.clean||options.mappingRowPending||options.duplicates;
 return '<section class="import-guided-review" data-guided-review data-guided-stage="'+step+'">'+
  '<p class="import-guided-lead">En sak i taget. Granska '+esc(stage.title.toLocaleLowerCase('sv'))+
  '. Säkra uppgifter godkänns och sparas tillsammans när alla steg är genomgångna.</p>'+
  steps+
  '<div class="import-guided-heading"><h3>'+esc((step+1)+'. '+stage.title)+'</h3>'+
  '<small>'+esc(prepared.fileName||'')+'</small></div>'+
  '<div class="import-guided-stats"><span><strong>'+formatCount(stats.new)+'</strong>Nya</span>'+
   '<span><strong>'+formatCount(stats.updated)+'</strong>Kompletteras</span>'+
   '<span><strong>'+formatCount(issueCount)+'</strong>Behöver åtgärdas</span></div>'+
  (options.skippedColumns?.length?'<p class="import-guided-note">'+formatCount(options.skippedColumns.length)+
   ' kolumner saknar säker koppling och lämnas utanför importen. Du kan se eller ändra dem under Avancerad granskning.</p>':'')+
  table+issueSummary+
  (options.mappingRowPending||options.duplicates?'<p role="alert">Rubrikrad eller dubbla fältkopplingar behöver kontrolleras under Avancerad granskning innan import.</p>':'')+
  '<div class="import-guided-footer">'+(step?'<button type="button" data-guided-back>Tillbaka</button>':'')+
  '<button type="button" data-guided-advanced>Avancerad granskning</button>'+
  '<button type="button" data-cancel>Avbryt</button>'+
  '<button type="button" class="primary-action" data-guided-next '+(nextDisabled?'disabled':'')+'>'+
  esc(done?'Godkänn och spara säkra uppgifter':stage.button)+'</button></div></section>';
}
