// Planning list and timeline presentation.
import {planningMonthHeader,planningMonthButtons} from "./planning-visual.js";
import {money,esc,propertyById,personLabel,propertyDesignation,calc,table,row,propertyAddressCell,options,propertyReference,units,internalPeople,edit} from "./view-format.js";
import {scope,responsible} from "./model.js";
import {activityChoices} from "./activity-options.js";
function activityHomeLabel(data,activity) {
  const property=(data.properties||[]).find(p=>p.id===activity.propertyId);
  if(activity.contractId){
    const contract=(data.contracts||[]).find(c=>c.id===activity.contractId);
    if(!contract)return "Avtal · Saknas";
    const contractProperty=(data.properties||[]).find(p=>p.id===contract.propertyId);
    return "Avtal "+(contract.number||contract.id)+" · "+(contract.businessName||contract.use||"Verksamhet saknas")+" · "+propertyReference(contractProperty);
  }
  if(activity.objectId){
    const object=(data.objects||[]).find(o=>o.id===activity.objectId);
    return object?"Objekt · "+(object.number||object.name||object.id):"Objekt · Saknas";
  }
  if(activity.propertyId)return "Fastighet · "+propertyReference(property);
  if(activity.scopeType==="unit"&&activity.unitId)return "Område · "+(units[activity.unitId]||activity.unitId);
  if(activity.scopeType==="general")return "Generell";
  return "Ej fördelad";
}
function timelineView(data, items, ui) {
  const year=Number(ui.year)||new Date().getFullYear();
  const span=ui.timelineSpan===3?3:1;
  const visible=items.filter(x=>x.collection==="activities");
  const header=planningMonthHeader(year,span);
  const rows=visible.map(x=>{
    const a=x.record,allocations=a.yearAllocations||[];
    const readOnly=false; // Live allocations remain editable; locked budget lines are snapshots.
    const unverified=a.project2027BudgetUnit==="unverified";
    const rentFinanced=a.financingMethod==="rent_supplement"||a.project2027RentSurcharge;
    const annual=allocations.find(t=>Number(t.year)===year);
    const home=a.contractId?"Avtal":a.propertyId?"Fastighet":a.scopeType==="unit"?"Område":a.scopeType==="general"?"Generell":"Utan hemvist";
    const amount=readOnly || unverified || rentFinanced
      ? `<span title="${readOnly?"Budgetåret är låst":unverified?"Källbeloppet behöver verifieras":"Finansieras via hyra"}">${unverified?"Ej verifierad":rentFinanced?"Hyrespåslag":annual?money(Number(annual.amount)||0):"–"}</span>`
      : `<input type="number" min="0" step="1" data-activity-year-amount="${esc(a.id)}" data-allocation-year="${year}" aria-label="Årsbelopp ${year} för ${esc(x.title)}" placeholder="Ej fördelad" value="${esc(annual?.amount ?? "")}">`;
    return `<div class="timeline-row"><div class="timeline-label"><button type="button" class="text-button" data-edit="activities" data-id="${esc(a.id)}">${esc(x.title)}</button><small>${esc(home)} · ${esc(a.status||"Planerad")}</small></div><div class="timeline-track" style="--timeline-columns:${12*span}">${planningMonthButtons(a,year,span,"plan")}</div><div class="timeline-cost">${amount}</div></div>`;
  }).join("");
  return `<details class="planning-timeline-help"><summary>Så väljer du period</summary><p>Välj startmånad och slutmånad i raden. Klicka igen för en ny period.</p></details><div class="timeline-scroll"><div class="timeline-content" style="--timeline-columns:${12*span}"><div class="timeline-row timeline-head"><div class="timeline-label">Ärende</div><div class="timeline-track">${header}</div><div class="timeline-cost">Årsbelopp</div></div>${rows||"<p>Inga ärenden i urvalet.</p>"}</div></div>`;
}
export function planning(data, s, ui) {
  const v = scope(data, s);
  const propertyItems = v.properties.map((p) => ({
    collection: "properties",
    label: "Fastighet",
    record: p,
    propertyId: p.id,
    title: "Fastighetsansvar",
    cost: 0,
  }));
  const typeChoices = ["Alla",...new Set([
    ...activityChoices(data,"type").map(x=>x.value),
    ...(data.activities||[]).map(x=>x.type).filter(Boolean)
  ])];
  const issueType=typeChoices.includes(ui.issueType)?ui.issueType:"Alla";
  const visibleIssues = issueType === "Alla" ? v.items : v.items.filter(x=>x.record.type===issueType);
  let items = issueType === "Alla" ? propertyItems.concat(visibleIssues) : visibleIssues;
  const missing = items.filter(
    (x) => !responsible(data, x.collection, x.record),
  );
  if (ui.unassigned) items = missing;
  const withoutHome = items.filter(x => x.collection === "activities" &&
    !x.record.propertyId && !x.record.objectId && !x.record.contractId &&
    x.record.scopeType !== "general" &&
    !(x.record.scopeType === "unit" && x.record.unitId));
  if (ui.unassignedHome) items = withoutHome;
  const history = (data.auditLog || [])
    .filter((h) =>
      (h.fields || []).some((f) => f.field === "responsiblePersonId"),
    )
    .slice(-30)
    .reverse();
  const types = `<div class="issue-type-filters" aria-label="Filtrera ärenden">${typeChoices.map(type=>`<button type="button" data-issue-type="${esc(type)}" class="${issueType===type?"active":""}" aria-pressed="${issueType===type}">${esc(type)}</button>`).join("")}</div>`;
  const timelineControls = `<div class="actions"><button type="button" data-planning-mode="list" class="${ui.planningMode==="timeline"?"":"active"}">Lista</button><button type="button" data-planning-mode="timeline" class="${ui.planningMode==="timeline"?"active":""}">Tidslinje</button>${ui.planningMode==="timeline"?`<button type="button" data-timeline-span="1" class="${ui.timelineSpan===3?"":"active"}">1 år</button><button type="button" data-timeline-span="3" class="${ui.timelineSpan===3?"active":""}">3 år</button>`:""}</div>`;
  const timelineBody = ui.planningMode==="timeline" ? timelineView(data,items,ui) : null;
  const mobileCard=x=>{
    const p=propertyById(data,x.propertyId);
    const isActivity=x.collection==="activities";
    const who=personLabel(data,responsible(data,x.collection,x.record));
    const home=isActivity?(x.record.contractId?"Avtal":x.record.objectId?"Objekt":x.record.propertyId?"Fastighet":x.record.scopeType==="unit"?"Område":"Generellt"):"Fastighet";
    return `<article class="plan-mobile-card">
      <div class="plan-mobile-card-head"><div class="plan-mobile-card-main"><span class="plan-mobile-kind">${esc(isActivity?x.record.type||"Ärende":"Fastighet")}</span><strong>${esc(isActivity?x.title:propertyDesignation(p)||x.title)}</strong><small>${esc(p?.address||"Ingen fastighetsadress")}</small></div>
      <button type="button" class="plan-mobile-open" data-edit="${esc(x.collection)}" data-id="${esc(x.record.id)}" aria-label="Öppna ${esc(x.title)}">Redigera</button></div>
      <div class="plan-mobile-card-foot"><span>${esc(who||"Ej fördelat")} · ${esc(home)}</span>${isActivity?`<b>${money(x.cost)}</b>`:""}</div>
      ${isActivity&&x.record.startDate?`<small class="plan-mobile-date">${esc(x.record.startDate)} → ${esc(x.record.endDate||"–")}</small>`:""}
      </article>`;
  };
  const mobileList=timelineBody?"":`<div class="plan-mobile-list">
    <div class="plan-mobile-activities">${items.filter(x=>x.collection==="activities").map(mobileCard).join("")||"<p>Inga ärenden i urvalet.</p>"}</div>
    ${items.some(x=>x.collection==="properties")?`<details class="plan-property-group"><summary>Fastighetsansvar (${items.filter(x=>x.collection==="properties").length})</summary>${items.filter(x=>x.collection==="properties").map(mobileCard).join("")}</details>`:""}
    </div>`;
  const planHeader=`<div class="plan-topbar"><h2>Ärenden och ansvar</h2></div>
    ${missing.length||ui.unassigned||withoutHome.length||ui.unassignedHome?`<div class="plan-exceptions">${missing.length||ui.unassigned?`<button data-unassigned class="${ui.unassigned?"active":""}">${missing.length} utan ansvarig</button>`:""}${withoutHome.length||ui.unassignedHome?`<button data-unassigned-home class="${ui.unassignedHome?"active":""}">${withoutHome.length} utan hemvist</button>`:""}</div>`:""}`;
  const mobileActions=`<div class="plan-mobile-actions">${timelineControls}<button type="button" data-new-issue class="primary">+ Nytt ärende</button></div>`;
  const budgetSettings=`<details class="plan-budget-settings"><summary>Budgetstyrning och hyrespåverkan (${visibleIssues.length} ärenden)</summary>
    <p class="plan-budget-help">Ange om ärendet ska ingå i budgetförslaget. Låsta budgetar ändras inte av detta val. Hyrespåslag visas bara för ärenden som enligt ägarreglerna är hyresfinansierade.</p>
    <div class="plan-budget-rows">${visibleIssues.map(x=>{
      const a=x.record,eco=calc().activityEconomics(data,a,ui.year);
      const included=a.includeInBudget || (a.budgetIncluded===false?"Nej":"Ja");
      return `<div class="plan-budget-row"><strong>${esc(x.title)}</strong><label>Ingår i budgetförslag
        <select data-plan-budget-include="${esc(a.id)}" aria-label="Budgetval för ${esc(x.title)}"><option value="Ja" ${included==="Ja"?"selected":""}>Ja</option><option value="Nej" ${included==="Nej"?"selected":""}>Nej</option></select></label>
        ${eco.rentFinanced?`<label>Hyrespåslag från<input type="date" data-plan-rent-start="${esc(a.id)}" value="${esc(a.rentSurchargeStartDate||"")}" aria-label="Hyrespåslag från för ${esc(x.title)}"></label><small>Hyresfinansierad investering – redovisas inte som direkt budgetkostnad.</small>`:""}
      </div>`;
    }).join("")||"<p>Inga ärenden att budgetstyra i urvalet.</p>"}</div></details>`;
  return `${planHeader}<div class="plan-filter-toolbar">${types}${mobileActions}</div>${mobileList}${timelineBody||`<div class="plan-desktop-list"><div class="plan-column-heading"><strong>Ärenden och ansvar</strong><details class="plan-column-config"><summary>Anpassa kolumner</summary><div class="plan-column-options">${["Ärende / ansvar","Fastighet","Adress","Hemvist","Lokalsamordnare","Datum","Kostnad"].map((label,i)=>`<label><input type="checkbox" data-plan-col="${i+1}" checked> ${label}</label>`).join("")}</div></details></div>`+table(
    ["Ärende / ansvar", "Fastighet", "Adress", "Hemvist", "Lokalsamordnare", "Datum", "Kostnad", ""],
    items.map((x) =>
      row([
        `<strong>${esc(x.title)}</strong><small>${esc(x.label)}</small>${x.collection==="activities"&&x.record.actionKind ? `<small>${x.record.actionKind==="value_enhancing"?"Värdehöjande":"Utbyte 1:1"}</small>` : ""}`,
        esc(propertyDesignation(propertyById(data, x.propertyId)) || "–"),
        propertyAddressCell(propertyById(data, x.propertyId)),
        x.collection === "activities"
          ? `<span class="plan-home-readonly" title="${esc(activityHomeLabel(data,x.record))}">${esc(activityHomeLabel(data,x.record))}</span>`
          : "<small>Fastighet</small>",
        `<span class="plan-coordinator" title="Ändra lokalsamordnare via Redigera">${esc(personLabel(data,responsible(data,x.collection,x.record))||"Ej fördelat")}</span>`,
        x.collection === "activities"
          ? `<span class="plan-date-range">${x.record.startDate || x.record.endDate ? esc(x.record.startDate || "–") + " → " + esc(x.record.endDate || "–") : "Ej tidsatt"}</span>`
          : "<small>Löpande fastighetsansvar</small>",
        x.collection === "activities" && x.record.project2027SourceId
          ? `<span title="Beloppet är inte budgetfört förrän enhet och finansiering har verifierats">${x.record.project2027BudgetRaw == null ? "Budget saknas" : esc(String(x.record.project2027BudgetRaw)) + " · enhet ej verifierad"}${x.record.project2027RentSurcharge ? "<small>Hyresfinansierad · utanför budget</small>" : "<small>Ej budgetförd</small>"}</span>`
          : money(x.cost),
        `${edit(x.collection, x.record.id)}`,
      ]),
    ),
  )+`</div>`}<details><summary>Ansvarsändringar (${history.length})</summary>${table(
    ["Tid", "Post", "Från → till", "Av"],
    history.map((x) => {
      const change = (x.fields || []).find(
        (f) => f.field === "responsiblePersonId",
      ) || { from: "", to: "" };
      return row([
        esc(x.at),
        esc(x.recordId),
        esc(personLabel(data, change.from)) +
          " → " +
          esc(personLabel(data, change.to)),
        esc(x.by),
      ]);
    }),
  )}</details>${budgetSettings}`;
}
