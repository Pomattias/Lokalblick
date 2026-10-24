import {objectLabel} from './view-format.js';
import {esc,money,num,options} from './views.js';
import {isOpenIssue,rentalTotals,tenantName,recordContext,periodPhase,contractPhase} from './portfolio-context.js';

const recordButton=(collection,id,label,tab='')=>`<button type="button" class="text-button" data-context-record="${collection}" data-id="${esc(id)}"${tab?` data-context-target-tab="${tab}"`:''}>${esc(label)}</button>`;
const amount=(value,suffix='')=>value===null?'Behöver kontroll':num(value)+suffix;
export function contractCard(data,contract,year,showPeriod=false) {
  if(showPeriod){
    const object=(data.objects||[]).find(row=>row.id===contract.objectId);
    const date=contractPhase(data,contract)==='future'?contract.start||object?.start:contract.end||object?.end;
    year=Number(date?.slice(0,4))||year;
  }
  const value=rentalTotals(data,[contract],year);
  return `<button type="button" class="context-contract-card" data-context-record="contracts" data-id="${esc(contract.id)}"><span class="context-contract-name"><strong>${esc(contract.number||contract.id)}</strong><span>${esc(tenantName(data,contract))}</span></span><span class="context-metrics"><span><small>Yta</small><strong>${num(value.area)} m²</strong></span><span><small>Årshyra ${year}</small><strong>${amount(value.needsReview&&value.rent===0?null:value.rent,' kr')}</strong></span><span><small>Årshyra/m²</small><strong>${amount(value.rentPerSqm,' kr')}</strong></span></span>${showPeriod?`<small class="context-period">${esc(contract.start||'Start saknas')} – ${esc(contract.end||'Tills vidare')}</small>`:!contract.start?'<small class="context-period">Startdatum saknas – kontrollera avtalstiden</small>':''}${value.needsReview?'<small class="rent-needs-review">Hyresunderlag behöver kontroll</small>':value.preliminary?'<small>Preliminär indexhyra</small>':''}</button>`;
}
function issueCards(data,issues,compact=false) {
  if(!issues.length)return '<p class="context-empty">Inga ärenden i aktuellt urval.</p>';
  const today=globalThis.LokalblickResponsibility.today();
  return `<ul class="context-issue-list">${issues.map(issue=>{
    const contract=data.contracts.find(row=>row.id===issue.contractId),object=(data.objects||[]).find(row=>row.id===issue.objectId);
    const home=contract?'Avtal '+(contract.number||contract.id):object?'Objekt '+objectLabel(object):'Fastigheten';
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
  const tabs=collection==='contracts'?[['info','Avtalsuppgifter']]:[['contracts',collection==='properties'?'Objekt och avtal':'Avtal']];
  tabs.push(['issues','Ärenden · '+openCount+' öppna']);
  if(collection!=='contracts')tabs.push(['info',collection==='properties'?'Fastighetsuppgifter':'Objektuppgifter']);
  return `<nav class="context-tabs" aria-label="Vyer för posten">${tabs.map(([key,label])=>`<button type="button" data-context-tab="${key}" aria-pressed="false">${esc(label)}</button>`).join('')}</nav>`;
}
export function contextContracts(data,context,year) {
  const groups=phase=>{
    const contracts=context.allContracts.filter(contract=>contractPhase(data,contract)===phase);
    const objects=context.allObjects.filter(object=>periodPhase(object)===phase||contracts.some(contract=>contract.objectId===object.id));
    const rendered=objects.map(object=>{
      const linked=contracts.filter(contract=>contract.objectId===object.id);
      const label=['Objekt '+objectLabel(object),object.name].filter(Boolean).join(' · ');
      const heading=context.object?'':`<h3>${recordButton('objects',object.id,label)}</h3>`;
      return `<section class="context-object">${heading}${phase==='current'&&linked.length>1?'<p class="rent-needs-review">Flera avtal gäller samtidigt för objektet. Kontrollera avtalstiderna.</p>':''}${linked.map(contract=>contractCard(data,contract,year,phase!=='current')).join('')||'<p class="context-empty">Inget gällande avtal.</p>'}</section>`;
    }).join('');
    const unlinked=contracts.filter(contract=>!objects.some(object=>object.id===contract.objectId));
    return rendered+(unlinked.length?`<section class="context-object"><h3>Avtal utan objektkoppling</h3>${unlinked.map(contract=>contractCard(data,contract,year,phase!=='current')).join('')}</section>`:'');
  };
  const current=groups('current'),past=groups('past'),future=groups('future');
  const history=(content,caption,phase)=>content?`<details class="context-periods" data-context-period="${phase}"><summary>${caption}</summary><p class="context-empty">Registrerade avtalstider. Eventuell förlängning behöver bekräftas.</p>${content}</details>`:'';
  return (current||'<p class="context-empty">Inga aktuella objekt eller avtal i urvalet.</p>')+
    history(future,'Kommande objekt och avtal','future')+history(past,'Tidigare objekt och avtal','past');
}

// Resolve dated assignments rather than scalar compatibility fields (which are
// empty for shared roles). Render each person once with their current roles.
export function currentContacts(data,type,record,roles) {
  const model=globalThis.LokalblickResponsibility,people=new Map();
  for(const [role,label,fallback] of roles){
    const links=model.current(data,type,record.id,role);
    const ids=links.length?links.map(link=>link.personId):model.history(data,type,record.id,role).length?[]:[record[fallback]];
    for(const id of new Set(ids.filter(Boolean))){
      const person=data.people.find(row=>row.id===id);if(!person)continue;
      if(!people.has(id))people.set(id,{name:person.name,roles:[]});
      people.get(id).roles.push(label);
    }
  }
  return `<dl class="context-contacts">${[...people.values()].map(person=>`<div><dt>${esc(person.roles.join(' · '))}</dt><dd>${esc(person.name)}</dd></div>`).join('')||'<div><dt>Kontaktpersoner</dt><dd>Ingen aktuell kontaktperson</dd></div>'}</dl>`;
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
  return `<p class="context-count">${primary.length+common.length} ärenden i urvalet</p>${context.contract?'<h3>För avtalet och objektet</h3>':context.object?'<h3>För objektet och dess avtal</h3>':'<h3>För objekt och avtal</h3>'}${issueCards(data,primary)}${common.length?'<h3>Gemensamt för fastigheten</h3>'+issueCards(data,common):''}`;
}
