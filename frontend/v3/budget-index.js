import {calculateAnnualRate,annualRateSummary,snapshotAnnualRate} from './rent-calculation.js';
// October index: SCB observation and private budget scenario are separate values.
// The calculated amounts are illustrative and never overwrite contractual base rent.
const money=n=>new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK',maximumFractionDigits:0}).format(n);
const text=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Compatibility helper: missing index terms remain unresolved (null).
export function indexedBaseAmount(item,index){
 return calculateAnnualRate({...item,adjustment_method:'kpi'},{year:Number(item.base_year)||2026,index}).amount;
}
// One rate at 31 December; old and new periods within the year are not added.
export function indexPreview(snapshot,index,year,propertyId){
 const at=year+'-12-31';
 if(Array.isArray(snapshot)){
  // Original helper signature, now delegated to the same calculation rules.
  const result=annualRateSummary(snapshot,at,{index});
  return {...result,total:result.known,selected:result.count-result.unresolved,unable:result.unresolved};
 }
 return snapshotAnnualRate(snapshot,at,{index,propertyId});
}
export function mountBudgetIndex(panel,budget,s){
 const year=Number(budget.budget_year)-1,yearOk=year>=2025&&year<=2200;
 const node=document.createElement('section');node.className='budget-index-panel';
 node.innerHTML='<div class="relation-heading"><h3>KPI & avtalsindex · Budget '+text(budget.budget_year)+'</h3></div>'+
  '<p class="muted">För budget '+text(budget.budget_year)+' jämför vi oktober '+text(year)+
  '. Publicerat indextal hämtas från SCB. Eget scenarioindex lagras separat på budgetversionen.</p>'+
  '<div class="details">'+
  '<div class="fact"><small>Manuellt scenario, oktober '+text(year)+'</small><strong>'+text(budget.scenario_index||'Ej angivet')+'</strong></div>'+
  '<div class="fact"><small>SCB oktober '+text(year)+'</small><strong data-scb-value>Ej hämtat</strong></div></div>'+
  '<button type="button" class="secondary" data-fetch-kpi '+(!yearOk?'disabled':'')+'>Hämta publicerat KPI från SCB</button>'+
  '<p class="muted" data-scb-info></p><div data-kpi-preview></div>';
 panel.append(node);
 const renderPreview=(value,label)=>{
  if(!Number.isFinite(Number(value))||Number(value)<=0)return;
  const result=indexPreview(s,Number(value),Number(budget.budget_year),budget.property_id);
  node.querySelector('[data-kpi-preview]').innerHTML='<h3>Indikativ årshyresnivå 31 december '+text(budget.budget_year)+' · '+text(label)+'</h3>'+
   '<div class="details"><div class="fact"><small>Fullständig beräknad årsnivå</small><strong>'+(result.calculated===null?'Kräver komplettering':money(result.calculated))+'</strong></div>'+
   '<div class="fact"><small>Beräknad del, kr/år</small><strong>'+money(result.known)+'</strong></div>'+
   '<div class="fact"><small>Aktiva poster</small><strong>'+result.count+'</strong></div>'+
   '<div class="fact"><small>Kräver kontroll</small><strong>'+result.unresolved+'</strong></div></div>'+
   '<p class="muted">Nivån är annualiserad per årets sista dag, inte årets fakturerade hyra. KPI bygger på valt oktoberindex eller scenario. Fasta årsjusteringar beräknas med basår. Saknade villkor och oklara min/max-klausuler redovisas som ej beräkningsbara.</p>';
 };
 if(budget.scenario_index!=null)renderPreview(budget.scenario_index,'manuellt scenario');
 node.querySelector('[data-fetch-kpi]').addEventListener('click',async event=>{
  const btn=event.currentTarget;btn.disabled=true;btn.textContent='Hämtar SCB…';
  try{
   const response=await fetch('/api/budget-index?year='+year,{cache:'no-store'});
   const data=await response.json();if(!response.ok)throw Error(data.error||'SCB kunde inte nås.');
   const october=(data.rows||[]).find(r=>r.month===10&&Number(r.year)===year);
   const value=node.querySelector('[data-scb-value]'),info=node.querySelector('[data-scb-info]');
   if(october){
    value.textContent=String(october.value).replace('.',',');
    info.textContent='SCB fastställda KPI · Oktober '+year+' · serie 1980=100. Hämtat '+new Date().toLocaleString('sv-SE');
    if(budget.scenario_index==null)renderPreview(october.value,'SCB oktober');
   }else{
    value.textContent='Ej publicerat';
    info.textContent='Oktoberindex '+year+' finns ännu inte publicerat i hämtat underlag. Senaste tillgängliga månad: '+(data.rows?.at(-1)?.month||'–')+'. Scenarioindex ändras inte.';
   }
  }catch(error){
   node.querySelector('[data-scb-info]').textContent=error.message;
  }finally{btn.disabled=false;btn.textContent='Hämta KPI igen';}
 });
}
