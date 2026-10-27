// October index: SCB observation and private budget scenario are separate values.
// The calculated amounts are illustrative and never overwrite contractual base rent.
const money=n=>new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK',maximumFractionDigits:0}).format(n);
const text=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function indexedBaseAmount(item,index){
 const amount=Number(item.base_amount),basis=Number(item.base_index),share=Number(item.index_share);
 if(!Number.isFinite(amount)||amount<0||!Number.isFinite(basis)||basis<=0||
  !Number.isFinite(index)||index<=0||item.index_share==null||share<0||share>1)return null;
 const adjusted=amount*(1+share*(index/basis-1));
 return item.floor===0?adjusted:Math.max(amount,adjusted);
}
export function indexPreview(items,index,year){
 const first=year+'-01-01',last=year+'-12-31';
 let total=0,unable=0,selected=0;
 for(const r of items){
  if(r.valid_from&&r.valid_from>last||r.valid_to&&r.valid_to<first)continue;
  if(r.adjustment_method==='none'){total+=Number(r.base_amount)||0;selected++;continue;}
  if(r.adjustment_method==='kpi'){
   const amount=indexedBaseAmount(r,index);
   if(amount!=null){total+=amount;selected++;}else unable++;
  }else unable++; // fixed and KPI-limited require their own contract computations.
 }
 return {total,unable,selected};
}
export function mountBudgetIndex(panel,budget,s){
 const year=Number(budget.budget_year)-1,yearOk=year>=2025&&year<=2200;
 const items=s.agreementItems.filter(item=>{
  const a=s.agreements.find(a=>a.id===item.agreement_id),o=s.objects.find(o=>o.id===a?.object_id);
  return o?.property_id===budget.property_id;
 });
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
  const result=indexPreview(items,Number(value),Number(budget.budget_year));
  node.querySelector('[data-kpi-preview]').innerHTML='<h3>Indikativ årshyra · '+text(label)+'</h3>'+
   '<div class="details"><div class="fact"><small>Beräknat årsbelopp</small><strong>'+money(result.total)+'</strong></div>'+
   '<div class="fact"><small>Beräkningsbara poster</small><strong>'+result.selected+'</strong></div>'+
   '<div class="fact"><small>Kräver kontroll</small><strong>'+result.unable+'</strong></div></div>'+
   '<p class="muted">Enbart poster med avtalade parametrar räknas med. Beloppet är en indikation, inte en beslutad hyra eller komplett budgetprognos. KPI med min/max och fasta årsregler behöver särskild avtalsberäkning.</p>';
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
