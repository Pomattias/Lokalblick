// Budget and index settings presentation. Mutations live in budget-actions.js.
import {calc,money,esc,indexFormat,badge} from "./view-format.js";
import {scope} from "./model.js";
function budgetRowInScope(row, view) {
  const contractIds = new Set((view.contracts || []).map((x) => x.id));
  const propertyIds = new Set((view.properties || []).map((x) => x.id));
  const activityIds = new Set((view.items || []).map((x) => x.record.id));
  if (row.sourceType === "activity")
    return activityIds.has(row.sourceId);
  if (row.sourceType === "contract")
    return contractIds.has(row.sourceId) || contractIds.has(row.contractId);
  if (row.contractId) return contractIds.has(row.contractId);
  if (row.propertyId) return propertyIds.has(row.propertyId);
  return false;
}
export function scopedBudgetRows(data, s, year, view) {
  const activeScope = Boolean(
    s.propertyId || s.unit || s.owner || s.person || s.q,
  );
  const rows = calc().budgetScenarioRows(data, year);
  if (!activeScope) return rows;
  return rows.filter((row) => budgetRowInScope(row, view));
}
export function economicSettings(data, ui) {
  const year=Number(ui.settingsYear || new Date().getFullYear());
  const entry=(data.priceBaseAmounts||[]).find(p=>Number(p.year)===year);
  const amount=Number(entry?.amount)||0;
  const normal=amount>0?money(amount/2):"Saknas";
  const owners=(data.organizations||[]).filter(o=>o.type==="owner");
  const ownerRows=owners.map(o=>`<tr><td>${esc(o.name)}</td><td>${esc(o.investmentRule==="stadsfastigheter"?"Stadsfastigheter":"Normalregel")}</td><td>${o.investmentRule==="stadsfastigheter" ? money(Number(o.investmentThreshold)||200000) : normal}</td><td>${o.investmentRule==="stadsfastigheter"?esc(String(o.rentSurchargeRate??7.5))+" %":"–"}</td><td><button data-edit="organizations" data-id="${esc(o.id)}">Ändra</button></td></tr>`).join("");
  return `<div class="section-title"><h2>Ekonomiska regler</h2></div>
    <section class="detail compact-settings"><h3>Prisbasbelopp</h3><label class="settings-inline-field"><span class="field-name">År</span><input type="number" min="2000" max="2200" data-settings-year="${year}" value="${year}"></label>
    <label class="settings-inline-field"><span class="field-name">Prisbasbelopp</span><input type="number" min="1" step="1" data-price-base-year="${year}" value="${entry?.amount??""}" placeholder="Saknas"></label>
    <div class="settings-inline-field"><span class="field-name">Investeringsgräns (½ PBB)</span><strong>${normal}</strong></div>
    <div class="settings-inline-actions"><small>Källa: ${esc(entry?.source||"Ej registrerad")}</small><button type="button" data-price-base-official="${year}">${entry?"Uppdatera SCB":"Hämta från SCB"}</button></div></section>
    <section class="detail"><h3>Fastighetsägarnas regler</h3><table><thead><tr><th>Ägare</th><th>Regel</th><th>Gräns</th><th>Årligt hyrespåslag</th><th></th></tr></thead><tbody>${ownerRows||'<tr><td colspan="5">Inga fastighetsägare registrerade.</td></tr>'}</tbody></table></section>`;
}
export function budget(data,s,ui) {
  const scoped=Boolean(s.propertyId||s.unit||s.owner||s.person||s.q),view=scope(data,s);
  const plan=data.budgetPlans.find(p=>Number(p.year)===ui.year),locked=plan?.status==='Låst';
  const rows=scopedBudgetRows(data,s,ui.year,view);
  const baselineRows=locked?(plan?.lines||[]):calc().budgetProposal(data,ui.year);
  const included=baselineRows.filter(r=>r.included!==false&&(!scoped||budgetRowInScope(r,view)));
  const comparison=globalThis.LokalblickBudgetFollowup.compare(data,included,rows,ui.year);

  const total=included.reduce((sum,r)=>sum+r.amount,0);

  const known=calc().latestKnownKpi(data,ui.year);
  const idx=calc().budgetScenarioIndex(data,ui.year,plan?.preliminaryIndex);
  const contractRentRows=calc().budgetRows(data,ui.year).filter(row=>
    row.sourceType==='contract'&&view.contracts.some(c=>c.id===row.sourceId));
  const ordinaryRentNeedsReview=contractRentRows.some(row=>row.status==='Behöver kontroll');
  const ordinaryRent=contractRentRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const months=['','januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];
  const knownMonth=known.year&&known.month?(months[known.month]||'')+' '+known.year:'Månad saknas';
  const usingOwn=Number(plan?.preliminaryIndex)>0&&!locked;
  const usedValue=locked?Number(plan?.lockedIndexValue)||0:idx.value;
  const existingContractIds=new Set(view.contracts.map(c=>c.id));
  const previousRentRows=calc().budgetRows(data,ui.year-1).filter(row=>
    row.sourceType==='contract'&&existingContractIds.has(row.sourceId||row.contractId));
  const currentRent=previousRentRows.reduce((sum,row)=>sum+Number(row.amount||0),0);
  // Compare rent-only contract rows: amounts reflect period, additions and property tax,
  // without mixing in manually adjusted project/drift budget amounts.
  const plannedRent=(locked?included:rows).filter(row=>row.sourceType==='contract').reduce((sum,row)=>sum+Number(row.amount||0),0);
  const rentChange=plannedRent-currentRent;
  const rentChangePercent=currentRent>0?(rentChange/currentRent*100):null;
  const formatChange=rentChange>0?'+':rentChange<0?'−':'';
  const rentCompare='<div class="budget-rent-compare" data-budget-rent-compare>'+
    '<div class="budget-rent-metric"><span>Nuvarande hyra '+(ui.year-1)+'</span><strong>'+money(currentRent)+'</strong></div>'+
    '<div class="budget-rent-metric" data-budget-official><span>Avtalshyra utan scenario '+ui.year+'</span><strong>'+
    (ordinaryRentNeedsReview?'Behöver kontroll':money(ordinaryRent))+'</strong></div>'+
    '<div class="budget-rent-metric"><span>'+(locked?'Låst hyra ':'Preliminär hyra ')+ui.year+'</span><strong>'+money(plannedRent)+'</strong></div>'+
    '<div class="budget-rent-delta">Förändring: <strong>'+formatChange+money(Math.abs(rentChange))+
    (rentChangePercent===null?'':' · '+(rentChangePercent>0?'+':'')+new Intl.NumberFormat('sv-SE',{maximumFractionDigits:1}).format(rentChangePercent)+' %')+
    '</strong></div></div>';
  const info='<details class="budget-about ui-card ui-card--compact"><summary>Om budgeten <span aria-hidden="true">ⓘ</span></summary>'+
    '<div class="budget-about-body"><p>Hyror hämtas från avtal. Aktiviteter och åtgärder tas med när de är planerade att belasta budgetåret; fleråriga åtgärder använder årsbelopp.</p>'+
    '<p>Ordinarie avtalshyra styrs av fastställt KPI och påverkas aldrig av ett manuellt budgetantagande. Om oktoberindex för budgetåret saknas kan budgetscenariot använda senaste fastställda månadsindex som preliminärt underlag. Ett eget oktoberindextal används bara i budgetscenariot, även om oktober är fastställt. Avtalens indexandelar och separat indexerade tillägg respekteras.</p>'+
    '<p>Hyresjämförelsen visar föregående års beräknade hyreskostnad och budgetårets preliminära kostnad för aktuella avtal, inklusive tillägg och eventuell fastighetsskatt. Låsta budgetar behåller sin beslutad baslinje.</p></div></details>';
  const indexControl='<div class="budget-index-panel budget-index-compact">'+
    '<div class="budget-index-head"><strong>Senaste fastställda KPI</strong>'+
    '<span class="budget-index-published">'+(known.value?indexFormat(known.value)+' · '+esc(knownMonth):'Saknas')+'</span>'+
    '<button type="button" data-budget-index class="ui-button ui-button--compact">Uppdatera SCB</button></div>'+
    (locked?'<div class="budget-index-current">Låst index: <strong>'+(usedValue?indexFormat(usedValue):'saknas')+'</strong></div>':
      '<div class="budget-index-edit"><label class="budget-index-manual">Scenario · eget oktoberindex '+(ui.year-1)+
      '<input data-preliminary type="number" inputmode="decimal" min="0.01" step="any" placeholder="'+
      (known.value?indexFormat(known.value):'Ange indextal')+'" value="'+(usingOwn?Number(plan.preliminaryIndex):'')+'"></label>'+
      '<button type="button" data-budget-index-reset class="ui-button ui-button--compact">Återgå till KPI</button></div>'+
      '<small class="budget-index-current" data-budget-index-used>'+(usingOwn?'Budgetscenario med eget KPI: ':'Budgetscenario med käll-KPI: ')+
      '<strong>'+(usedValue?indexFormat(usedValue):'saknas')+'</strong></small>'+
      '<small data-budget-index-live class="budget-index-live" aria-live="polite"></small>')+
    '</div>';

  return `<div class="section-title"><h2>Budget ${ui.year} ${badge(locked?'Låst baslinje':plan?'Arbetsbudget':'Ej skapad')}</h2><label>År<input data-year type="number" min="2000" max="2200" value="${ui.year}"></label></div>${info}<div class="budget-controls budget-controls-compact">${indexControl}${rentCompare}${!plan?'<button data-budget-create>Skapa budget</button>':!scoped?(locked?'<button class="primary-action" data-budget-reopen>Skapa ny budgetversion</button>':'<button class="primary-action" data-budget-lock>Lås budget</button>'):''}</div><p data-budget-totals class="budget-overview-total">Årsbudget <strong>${money(total)}</strong> · prognos <strong>${money(comparison.reduce((sum,r)=>sum+r.forecast,0))}</strong></p><div class="budget-category-cards">${['Hyra','Investering','Drift'].map(k=>{
    const groupRows=included.filter(r=>(r.budgetGroup||calc().budgetGroup(r))===k),base=groupRows.reduce((n,r)=>n+Number(r.baseAmount??r.amount),0),target=groupRows.reduce((n,r)=>n+r.amount,0);
    const groupForecast=comparison.filter(r=>calc().budgetGroup(r)===k).reduce((n,r)=>n+r.forecast,0),groupActual=comparison.filter(r=>calc().budgetGroup(r)===k).reduce((n,r)=>n+(r.finalCost||0),0);
    return `<article class="budget-category-card"><div class="section-title"><h3>${esc(k)}</h3>${!scoped?`<button data-budget-adjust="${k}">Justera i kr</button>`:''}</div><dl><div><dt>Underlag</dt><dd>${money(base)}</dd></div><div><dt>Justering</dt><dd>${money(target-base)}</dd></div><div class="budget-card-total"><dt>${locked?'Låst budget':'Budgetförslag'}</dt><dd>${money(target)}</dd></div><div><dt>Prognos</dt><dd>${money(groupForecast)}</dd></div><div><dt>Slutkostnad</dt><dd>${money(groupActual)}</dd></div></dl></article>`;
  }).join('')}</div>${plan?globalThis.LokalblickBudgetUI.html(plan,comparison,scoped,{state:data,esc,money}):''}`;
}
