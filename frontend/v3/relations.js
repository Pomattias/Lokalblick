// V3 relational navigation. Links derive from authoritative foreign keys, never stored copies.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const target=(view,id,label,meta='')=>'<button type="button" class="relation-link" data-jump-view="'+esc(view)+'" data-jump-id="'+esc(id)+'"><span class="relation-name">'+esc(label)+'</span>'+ (meta?'<span class="relation-meta">'+esc(meta)+'</span>':'')+'<span aria-hidden="true" class="relation-arrow">›</span></button>';
const group=(label,rows)=>rows.length?'<section class="relation-group"><div class="relation-heading"><h3>'+esc(label)+'</h3><span class="relation-count">'+rows.length+'</span></div><div class="relation-items">'+rows.join('')+'</div></section>':'';
const propertyFor=(s,row)=>{
 if(row.property_id)return row.property_id;
 const objectId=row.object_id||(row.agreement_id?s.agreements.find(a=>a.id===row.agreement_id)?.object_id:null);
 return s.objects.find(o=>o.id===objectId)?.property_id||null;
};
const propertyName=(s,id)=>s.properties.find(p=>p.id===id)?.name||'Fastighet';
const agreementName=(s,id)=>s.agreements.find(p=>p.id===id)?.agreement_number||'Avtal';
const objectName=(s,id)=>s.objects.find(p=>p.id===id)?.object_number||'Objekt';
export const isVisibleAt=(view,row,asOf,showHistory=false)=>{
 if(showHistory)return true;
 if(view==='objects')return Boolean(row.currentVersion);
 if(view==='agreements')return Boolean(row.currentVersion&&row.original_start_on<=asOf && row.currentVersion.period_status!=='ended');
 return true;
};
export function relatedRecords(view,row,s){
 let segments=[],trail=[];
 const propertyId=view==='properties'?row.id:propertyFor(s,row);
 const linked=propertyId?s.properties.find(p=>p.id===propertyId):null;
 const o=view==='objects'?row:view==='agreements'?s.objects.find(x=>x.id===row.object_id):null;
 if(linked&&view!=='properties')trail.push(target('properties',linked.id,linked.name));
 if(o&&view!=='objects')trail.push(target('objects',o.id,'Objekt '+o.object_number));
 if(trail.length)segments.push('<div class="relation-breadcrumb"><span>Hemvist</span>'+trail.join('')+'</div>');
 if(view==='properties'){
  segments.push(group('Objekt',s.objects.filter(x=>x.property_id===row.id).map(x=>target('objects',x.id,'Objekt '+x.object_number,x.currentVersion?.area!=null?x.currentVersion.area+' m²':'Historiskt'))));
  const objs=new Set(s.objects.filter(x=>x.property_id===row.id).map(x=>x.id));
  segments.push(group('Avtal',s.agreements.filter(x=>objs.has(x.object_id)).map(x=>target('agreements',x.id,x.agreement_number,x.currentVersion?.period_status==='ended'?'Avslutat':'Aktuellt'))));
  segments.push(group('Ärenden',s.issues.filter(x=>x.resolved_property_id===row.id).map(x=>target('issues',x.id,x.title,x.status))));
  segments.push(group('Kostnader',s.recurringCosts.filter(x=>x.property_id===row.id).map(x=>target('recurringCosts',x.id,x.name,String(x.annual_amount)+' kr/år'))));
  segments.push(group('Budgetar',s.budgets.filter(x=>x.property_id===row.id).map(x=>target('budgets',x.id,String(x.budget_year),x.status))));
 }
 if(view==='objects'){
  segments.push(group('Avtal för objektet',s.agreements.filter(x=>x.object_id===row.id).map(x=>target('agreements',x.id,x.agreement_number,x.currentVersion?.period_status==='ended'?'Avslutat':'Aktuellt'))));
  segments.push(group('Ärenden',s.issues.filter(x=>x.object_id===row.id).map(x=>target('issues',x.id,x.title,x.status))));
  segments.push(group('Utrymmen',s.spaces.filter(x=>x.object_id===row.id).map(x=>target('spaces',x.id,x.name))));
 }
 if(view==='agreements')segments.push(group('Kopplade ärenden',s.issues.filter(x=>x.agreement_id===row.id).map(x=>target('issues',x.id,x.title,x.status))));
 if(view==='issues'){
  segments.push(group('Beställningar',s.orders.filter(x=>x.issue_id===row.id).map(x=>target('orders',x.id,x.title,x.status))));
  segments.push(group('Besiktningspunkter',s.inspectionPoints.filter(x=>x.issue_id===row.id).map(x=>target('inspectionPoints',x.id,x.assessment))));
 }
 if(view==='orders')segments.push(group('Ärende',s.issues.filter(x=>x.id===row.issue_id).map(x=>target('issues',x.id,x.title))));
 if(view==='recurringCosts')segments.push(group('Kostnadsunderlag',s.costEvidence.filter(x=>x.cost_id===row.id).map(x=>target('costEvidence',x.id,x.invoice_reference||String(x.year||''),String(x.amount)+' kr'))));
 if(view==='budgets')segments.push(group('Budgetposter',s.budgetLines.filter(x=>x.budget_id===row.id).map(x=>target('budgetLines',x.id,x.name,String(x.budget_amount)+' kr'))));
 if(view==='spaces')segments.push(group('Byggnadsdelar',s.buildingParts.filter(x=>x.space_id===row.id).map(x=>target('buildingParts',x.id,x.name))));
 if(view==='inspections')segments.push(group('Besiktningspunkter',s.inspectionPoints.filter(x=>x.inspection_id===row.id).map(x=>target('inspectionPoints',x.id,x.assessment))));
 if(view==='buildingParts')segments.push(group('Utrymme',s.spaces.filter(x=>x.id===row.space_id).map(x=>target('spaces',x.id,x.name))));
 if(view==='budgetLines')segments.push(group('Budget',s.budgets.filter(x=>x.id===row.budget_id).map(x=>target('budgets',x.id,String(x.budget_year),x.status))));
 if(view==='inspectionPoints')segments.push(group('Besiktning',s.inspections.filter(x=>x.id===row.inspection_id).map(x=>target('inspections',x.id,x.inspected_on,x.status))));
 return segments.filter(Boolean).length?'<div class="relations">'+segments.filter(Boolean).join('')+'</div>':'';
}
export function assignmentHistory(view,row,s){
 const scope={properties:'property_id',objects:'object_id',agreements:'agreement_id'}[view];
 if(!scope)return '';
 const rows=s.stakeholderAssignments.filter(x=>x[scope]===row.id).sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
 if(!rows.length)return '';
 const roles={owner:'Fastighetsägare',owner_contact:'Ägarkontakt',coordinator:'Lokalsamordnare',tenant:'Hyresgäst',tenant_contact:'Hyresgästkontakt',asset_manager:'Förvaltare',project_manager:'Projektledare'};
 return '<details class="assignment-history"><summary>Kontakt- och ansvarshistorik <span class="relation-count">'+rows.length+'</span></summary><div class="timeline">'+rows.map(a=>{
  const party=s.parties.find(p=>p.id===a.party_id)?.name||'—',person=s.people.find(p=>p.id===a.person_id)?.name;
  return '<article><strong>'+esc(roles[a.role_code]||a.role_code)+' · '+esc([party,person].filter(Boolean).join(' / '))+'</strong><span>'+esc(a.valid_from)+' – '+esc(a.valid_to||'')+'</span></article>';
 }).join('')+'</div></details>';
}
