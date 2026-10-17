import {esc,money,num,options} from './views.js';
import {isOpenIssue,rentalTotals,tenantName,recordContext} from './portfolio-context.js';

const recordButton=(collection,id,label,tab='')=>`<button type="button" class="text-button" data-context-record="${collection}" data-id="${esc(id)}"${tab?` data-context-target-tab="${tab}"`:''}>${esc(label)}</button>`;
const amount=(value,suffix='')=>value===null?'Behöver kontroll':num(value)+suffix;
export function contractCard(data,contract,year) {
  const value=rentalTotals(data,[contract],year);
  return `<button type="button" class="context-contract-card" data-context-record="contracts" data-id="${esc(contract.id)}"><span class="context-contract-name"><strong>${esc(contract.number||'Avtalsnummer saknas')}</strong><span>${esc(tenantName(data,contract))}</span></span><span class="context-metrics"><span><small>Yta</small><strong>${num(value.area)} m²</strong></span><span><small>Årshyra ${year}</small><strong>${amount(value.needsReview&&value.rent===0?null:value.rent,' kr')}</strong></span><span><small>Årshyra/m²</small><strong>${amount(value.rentPerSqm,' kr')}</strong></span></span>${value.needsReview?'<small class="rent-needs-review">Hyresunderlag behöver kontroll</small>':value.preliminary?'<small>Preliminär indexhyra</small>':''}</button>`;
}
function issueCards(data,issues,compact=false) {
  if(!issues.length)return '<p class="context-empty">Inga ärenden i aktuellt urval.</p>';
  const today=globalThis.LokalblickResponsibility.today();
  return `<ul class="context-issue-list">${issues.map(issue=>{
    const contract=data.contracts.find(row=>row.id===issue.contractId),object=(data.objects||[]).find(row=>row.id===issue.objectId);
    const home=contract?'Avtal '+contract.number:object?'Objekt '+(object.number||object.name):'Fastigheten';
    const end=issue.endDate||issue.end||'';
    const overdue=isOpenIssue(issue)&&end&&end<today;
    return `<li>${recordButton('activities',issue.id,issue.title||'Ärende')}<small>${esc(issue.status||'Status saknas')}${overdue?' · <strong class="context-overdue">Försenat</strong>':''}${compact?'':' · '+esc(home)+' · '+esc(data.people.find(row=>row.id===issue.responsiblePersonId)?.name||'Utan ärendeansvarig')}</small></li>`;
  }).join('')}</ul>`;
}
export function propertyPopup(data,property,selection,source,year,selectedScope=null) {
  const context=recordContext(data,'properties',property.id,selection,source,false,selectedScope);
  const open=context.issues.filter(isOpenIssue);
  const totals=rentalTotals(data,context.contracts,year);
  return `<article class="map-property-card"><header>${recordButton('properties',property.id,property.designation||'Beteckning saknas')}<small>${esc(property.address||'Adress saknas')}</small></header><p class="context-count">${context.contracts.length===context.totalContracts?context.contracts.length+' avtal':context.contracts.length+' av '+context.totalContracts+' avtal i urvalet'}</p>${context.contracts.length>1?`<p class="context-count">Totalt ${num(totals.area)} m² · ${money(totals.rent)}${totals.needsReview?' · Kontrollera hyresunderlaget':''}</p>`:''}<div>${context.contracts.map(contract=>contractCard(data,contract,year)).join('')||'<p class="context-empty">Inga avtal i urvalet.</p>'}</div><section><h3>${recordButton('properties',property.id,'Öppna ärenden ('+open.length+')','issues')}</h3>${issueCards(data,open,true)}</section></article>`;
}
export function contextTabs(collection,openCount) {
  const tabs=collection==='properties'?[['contracts','Objekt och avtal'],['issues','Ärenden · '+openCount+' öppna'],['info','Fastighetsuppgifter']]:[['info','Avtalsuppgifter'],['issues','Ärenden · '+openCount+' öppna']];
  return `<nav class="context-tabs" aria-label="${collection==='properties'?'Fastighetsvyer':'Avtalsvyer'}">${tabs.map(([key,label])=>`<button type="button" data-context-tab="${key}" aria-pressed="false">${esc(label)}</button>`).join('')}</nav>`;
}
export function contextContracts(data,context,state,year) {
  const today=globalThis.LokalblickResponsibility.today();
  const matches=contract=>{
    if(state.period==='all'||!state.period)return true;
    const term=globalThis.LokalblickCalculations.projectedContractTerm(contract,today);
    const current=(!contract.start||contract.start<=today)&&(!term.end||term.end>=today);
    return state.period==='current'?current:!current;
  };
  const contracts=context.contracts.filter(matches);
  const totals=rentalTotals(data,contracts,year);
  const groups=context.objects.map(object=>({label:'Objekt '+(object.number||object.name||object.id),contracts:contracts.filter(contract=>contract.objectId===object.id)}));
  const unlinked=contracts.filter(contract=>!context.objects.some(object=>object.id===contract.objectId));
  if(unlinked.length)groups.push({label:'Avtal utan objektkoppling',contracts:unlinked});
  return `<div class="context-summary"><span>${contracts.length} av ${context.totalContracts} avtal</span><span>${num(totals.area)} m²</span><span>Årshyra ${year}: ${money(totals.rent)}${totals.needsReview?' · behöver kontroll':''}</span></div>${groups.map(group=>`<section class="context-object"><h3>${esc(group.label)}</h3>${group.contracts.map(contract=>contractCard(data,contract,year)).join('')||'<p class="context-empty">Inga avtal i aktuellt urval.</p>'}</section>`).join('')||'<p class="context-empty">Inga objekt eller avtal i aktuellt urval.</p>'}`;
}
export function contextIssueFilters(data,state) {
  return `<div class="context-filters"><label>Sök ärenden<input type="search" data-context-filter="q" aria-label="Sök ärenden i sammanhanget" value="${esc(state.q||'')}"></label><label>Status<select data-context-filter="status">${[['open','Öppna'],['all','Alla'],['closed','Avslutade']].map(([value,label])=>`<option value="${value}" ${state.status===value?'selected':''}>${label}</option>`).join('')}</select></label><label>Ärendeansvarig<select data-context-filter="person">${options(data.people,row=>row.id,row=>row.name,state.person||'','Alla ärendeansvariga')}</select></label></div>`;
}
export function contextIssues(data,context,state) {
  const query=String(state.q||'').toLocaleLowerCase('sv').trim();
  const matches=issue=>(!query||[issue.title,issue.description,issue.type].join(' ').toLocaleLowerCase('sv').includes(query))&&
    (!state.person||issue.responsiblePersonId===state.person)&&
    (state.status==='all'||(state.status==='closed'?!isOpenIssue(issue):isOpenIssue(issue)));
  const primary=context.primary.filter(matches),common=context.common.filter(matches);
  return `<p class="context-count">${primary.length+common.length} ärenden i urvalet</p>${context.contract?'<h3>För avtalet och objektet</h3>':'<h3>För objekt och avtal</h3>'}${issueCards(data,primary)}${common.length?'<h3>Gemensamt för fastigheten</h3>'+issueCards(data,common):''}`;
}
