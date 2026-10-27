// View entry point. Keep rendering separate from navigation and persistence.
import {organizationLabel,esc,options,internalPeople,units,calc,num,money} from "./view-format.js";
import {responsible,scope} from "./model.js";
import {rentalTotals,contractPeriodCounts} from "./portfolio-context.js";
import {buildPortfolioInsights} from "./portfolio-dashboard.js";
import {scopedBudgetRows} from "./view-budget.js";
export function filters(data, s, dashboardMode, presentation = {}) {
  const owners = new Map();
  data.contracts.forEach((c) => {
    const p = data.properties.find((x) => x.id === c.propertyId) || {};
    const id = p.ownerPartyId;
    if (id) owners.set(id, organizationLabel(data, id));
  });
  data.properties.forEach((p) => {
    if (p.ownerPartyId)
      owners.set(p.ownerPartyId, organizationLabel(data, p.ownerPartyId));
  });
  const chip=(key,caption,items,value,label,selected,binding='data-filter')=>{
    const name=items.find(item=>String(value(item))===String(selected));
    const selectedName=name?label(name):selected;
    return `<label class="filter-chip${selected?' is-selected':''}"><span class="filter-caption">${esc(caption)}</span><span class="filter-value" aria-hidden="true">${esc(selected?selectedName:caption)}</span><select aria-label="${esc(caption)}" ${binding}="${key}">${options(items,value,label,selected,caption)}</select></label>`;
  };
  const contextFilters=(presentation.contextFilters||[]).map(filter=>chip(filter.key,filter.caption,filter.items,x=>x.id,x=>x.label,filter.selected,'data-portfolio-issue')).join('');
  const modeButtons = dashboardMode !== undefined ? [["person","Medarbetare"],["unit","Organisatoriskt område"],["owner","Fastighetsägare"]].map(([key,label]) => `<button type="button" class="filter-chip dashboard-mode-button${dashboardMode===key?" active":""}" data-dashboard-mode="${key}" aria-pressed="${dashboardMode===key}">${label}</button>`).join("") : null;
  return `<div class="filters${modeButtons!==null?" dashboard-mode-filters":""}">${modeButtons!==null?modeButtons:chip('person',presentation.personLabel||'Ansvarig',internalPeople(data),x=>x.id,x=>x.name,s.person)+chip('unit','Organisatoriskt område',Object.entries(units),x=>x[0],x=>x[1],s.unit)+chip('owner','Fastighetsägare',[...owners],x=>x[0],x=>x[1],s.owner)}${contextFilters}<div class="ui-search-action-row"><label class="search ui-search"><span class="visually-hidden">${esc(presentation.searchLabel||"Sök")}</span><svg class="ui-search-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.8" cy="10.8" r="6.6"></circle><path d="m16 16 5 5"></path></svg><input data-filter="q"${presentation.searchView?` data-portfolio-search-view="${esc(presentation.searchView)}"`:""} type="search" value="${esc(s.q)}" placeholder="${esc(presentation.placeholder||"Adress, avtal eller hyresgäst")}"></label><div class="ui-filter-actions-slot"></div></div></div>`;
}
function rentMetrics(data, contracts, year) {
  let rent = 0, area = 0, rentForAverage = 0, rentArea = 0, needsReview = 0;
  (contracts || []).forEach((contract) => {
    const values = calc().annualValues(contract, year, 0, data.indexSeries);
    const contractRent =
      Number(values.rent.amount || 0) + Number(values.addition.amount || 0);
    const contractArea = Number(contract.area || 0);
    const incomplete =
      values.rent.status === "Behöver kontroll" ||
      values.addition.status === "Behöver kontroll";
    rent += contractRent;
    area += contractArea;
    if (incomplete) needsReview++;
    else if (contractArea > 0) {
      rentForAverage += contractRent;
      rentArea += contractArea;
    }
  });
  return {
    rent,
    area,
    rentPerSqm: rentArea > 0 ? rentForAverage / rentArea : 0,
    needsReview,
  };
}
function activityMetrics(data, items, year) {
  const rows = items || [];
  return {
    count: rows.length,
    cost: rows.reduce((sum, item) => sum + (Number(item.cost) || 0), 0),
    inYear: rows.filter((item) =>
      calc().activityPlannedInYear(item.record, year),
    ).length,
    unassigned: rows.filter(
      (item) => !responsible(data, item.collection, item.record),
    ).length,
  };
}
function summaryCards(cards) {
  return `<div class="summary">${cards
    .map(
      ([label, value, foot, detail]) =>
        `<div${foot ? ` title="${esc(foot)}"` : ""}><span>${label}</span><strong>${value}</strong>${detail?`<span class="summary-explanation">${esc(detail)}</span>`:''}${foot ? `<span class="visually-hidden">${esc(foot)}</span>` : ""}</div>`,
    )
    .join("")}</div>`;
}
export function summary(data, s, year, ui = {}) {
  const view = ui.portfolioView || scope(data, s);
  const counts=contractPeriodCounts(data,view.allContracts||view.contracts);
  const periodNote=`Gällande enligt registrerad avtals- och objekttid per ${counts.at}. Avtal utan datum räknas som gällande om objektets period tillåter det.`;
  const periodDetail=`${num(counts.past)} tidigare · ${num(counts.future)} kommande`;
  const agreementCard=ui.portfolioView
    ? ['Gällande avtal',num(view.contracts.length),periodNote,`${num(counts.total)} totalt · ${periodDetail}`]
    : ['Avtal totalt',num(view.contracts.length),periodNote,`${num(counts.current)} gällande · ${periodDetail}`];
  const perspective =
    ui.view === "contracts" ? "Avtal"
    : ui.view === "overview" ? "Fastigheter"
    : ui.view === "properties" ? "Fastigheter"
    : ui.view === "activities" ? "Ärenden"
    : ui.perspective || "Fastigheter";
  const rent = ui.portfolioView ? rentalTotals(data,view.contracts,year) : rentMetrics(data, view.contracts, year);
  if(ui.view==='objects')return summaryCards([
    ['Objekt',num((view.objects||[]).length)],
    ['Fastigheter',num(view.properties.length)],
    agreementCard,
    ['Objektarea',num((view.objects||[]).reduce((sum,object)=>sum+(Number(object.area)||0),0))+' m²'],
  ]);
  if (ui.view === "overview") {
    const insights=buildPortfolioInsights(data,s,year,ui.dashboardMode||"");
    return summaryCards([
      ["Årshyra "+year,money(insights.rent)],
      [agreementCard[0],num(view.contracts.length)+" st",agreementCard[2],agreementCard[3]],
      ["Avtalad yta",num(insights.area)+" m²"],
      ["Fastigheter",num(view.properties.length)+" st"],
      ["Ärenden · kr",money(insights.activityCost),"Bedömd totalkostnad, samtliga år"],
      ["Ärenden · antal",num(view.items.length)+" st"],
    ]);
  }

  if (ui.view === "map") {
    const mapped = view.properties.filter(
      (p) =>
        p.latitude !== null &&
        p.latitude !== undefined &&
        p.latitude !== "" &&
        p.longitude !== null &&
        p.longitude !== undefined &&
        p.longitude !== "" &&
        Number.isFinite(Number(p.latitude)) &&
        Number.isFinite(Number(p.longitude)),
    ).length;
    return summaryCards([
      ["Fastigheter", num(view.properties.length)],
      ["På karta", num(mapped)],
      ["Saknar koordinat", num(view.properties.length - mapped)],
      ["Total hyra", money(rent.rent)],
    ]);
  }

  if (ui.view === "budget") {
    const rows = scopedBudgetRows(data, s, year, view);
    const totals = calc().summarize(rows);
    return summaryCards([
      ["Hyra + drift", money(totals["Hyra + drift"] || 0)],
      ["Underhåll", money(totals.Underhåll || 0)],
      ["Projekt", money(totals.Projekt || 0)],
      ["Löpande", money(totals.Driftkostnader || 0)],
    ]);
  }

  if (ui.view === "plan") {
    const selected=ui.issueType && ui.issueType!=="Alla" ?
      view.items.filter(x=>x.record.type===ui.issueType):view.items;
    const metrics = activityMetrics(data, selected, year);
    return summaryCards([
      ["Ärenden", num(metrics.count)],
      ["Utan ansvarig", num(metrics.unassigned)],
      ["Planerade " + year, num(metrics.inYear)],
      ["Bedömd kostnad", money(metrics.cost)],
    ]);
  }

  if (perspective === "Fastigheter") {
    return summaryCards([
      ["Fastigheter", num(view.properties.length)],
      agreementCard,
      ["Total hyra " + year, money(rent.rent)],
      ["Hyra / kvm", rent.area > 0 && rent.rentPerSqm!==null ? money(rent.rentPerSqm) : "–"],
    ]);
  }

  if (perspective === "Avtal") {
    return summaryCards([
      agreementCard,
      ["Area", num(rent.area) + " m²"],
      ["Total hyra " + year, money(rent.rent)],
      ["Hyra / kvm", rent.area > 0 && rent.rentPerSqm!==null ? money(rent.rentPerSqm) : "–"],
    ]);
  }

  const matchingItems = perspective === "Ärenden" ?
    view.items.filter(x=>!ui.issueType||ui.issueType==="Alla"||x.record.type===ui.issueType) :
    view.items.filter((item) => item.label === perspective);
  const metrics = activityMetrics(data, matchingItems, year);
  return summaryCards([
    [perspective, num(metrics.count) + " st"],
    ["Bedömd kostnad", money(metrics.cost)],
    ["Planerade " + year, num(metrics.inYear)],
    ["Utan ansvarig", num(metrics.unassigned)],
  ]);
}
export {esc,num,money,units,calc,options,propertyDesignation,propertyAddress,propertyReference,categories} from "./view-format.js";
export {economicSettings,budget} from "./view-budget.js";
export {dashboard,overview,contractDetail,objectList} from "./view-portfolio.js";
export {planning} from "./view-planning.js";
export {reviewCandidateChoices,importReceiptHtml,sources,organization} from "./view-sources.js";
