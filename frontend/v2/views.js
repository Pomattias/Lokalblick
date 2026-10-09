import { scope, responsible, kinds, bulkEligible } from "./model.js";
export const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const num = (x) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(
    Number(x) || 0,
  );
export const money = (x) => num(x) + " kr";
export const units = {
  VARDBO: "Vårdbo",
  ORDBO: "Ordbo",
  MYND_STAB: "Myndighet / Stab",
  HOF: "Hälsa & Förebyggande",
};
export const calc = () => globalThis.LokalblickCalculations;
const edit = (col, id, label = "Ändra") =>
  `<button data-edit="${esc(col)}" data-id="${esc(id)}">${label}</button>`;
const table = (head, rows, interactive = false, heading = "") =>
  `<div class="table-wrap${interactive?" compact-data-table":""}">${interactive?`<div class="compact-table-heading"><strong>${esc(heading)}</strong><span>${rows.length} poster</span><button type="button" data-toggle-column-filters aria-label="Visa kolumnfilter" title="Visa kolumnfilter">⚑</button></div>`:""}<table${interactive?' data-smart-table="1"':""}><thead><tr>${head.map((x,i) => `<th scope="col">${interactive && x ? `<button type="button" class="column-sort" data-column-sort="${i}" aria-label="Sortera på ${esc(x)}">${esc(x)} <span aria-hidden="true">↕</span></button>` : x}</th>`).join("")}</tr>${interactive?`<tr class="column-filters" hidden>${head.map((x,i)=>`<th>${x && i<head.length-1 ? `<input type="search" data-column-filter="${i}" aria-label="Filtrera ${esc(x)}" placeholder="Filtrera" autocomplete="off">`:""}</th>`).join("")}</tr>`:""}</thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${head.length}" class="empty">Inga poster i aktuellt urval.</td></tr>`}</tbody></table></div>`;
const row = (cells) =>
  `<tr>${cells.map((x, i) => `<td${i === 0 ? ' class="primary-cell"' : ""}>${x}</td>`).join("")}</tr>`;
const badge = (x) =>
  `<span class="badge ${/kontroll|Prelim|saknas|Ej /.test(x) ? "warning" : ""}">${esc(x || "–")}</span>`;
export function options(items, value, label, selected = "", empty = "Alla") {
  return (
    `<option value="">${empty}</option>` +
    [...items]
      .sort((a, b) =>
        new Intl.Collator("sv-SE", { numeric: true, sensitivity: "base" }).compare(
          String(label(a) ?? ""),
          String(label(b) ?? ""),
        ),
      )
      .map(
        (x) =>
          `<option value="${esc(value(x))}"${String(value(x)) === String(selected) ? " selected" : ""}>${esc(label(x))}</option>`,
      )
      .join("")
  );
}
const organizationLabel = (data, id) =>
  data.organizations.find((x) => x.id === id)?.name || id || "";
const propertyOwnerLabel = (data, property) =>
  organizationLabel(data, property?.ownerPartyId);
export function filters(data, s) {
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
  return `<div class="filters"><label>Ansvarig hos oss<select data-filter="person">${options(
    internalPeople(data),
    (x) => x.id,
    (x) => x.name,
    s.person,
    "Alla ansvariga hos oss",
  )}</select></label><label>Område<select data-filter="unit">${options(
    Object.entries(units),
    (x) => x[0],
    (x) => x[1],
    s.unit,
    "Alla områden",
  )}</select></label><label>Fastighetsägare<select data-filter="owner">${options(
    [...owners],
    (x) => x[0],
    (x) => x[1],
    s.owner,
    "Alla ägare",
  )}</select></label><label class="search">Sök<input data-filter="q" type="search" value="${esc(s.q)}" placeholder="Adress, avtal eller verksamhet"></label></div>`;
}
// Treat the cadastral designation and street address as independent values.
export const propertyDesignation = property => String(property?.designation || "").trim();
export const propertyAddress = property => String(property?.address || "").trim();
export const propertyReference = property => property
  ? [propertyDesignation(property) || "Beteckning saknas", propertyAddress(property)].filter(Boolean).join(" · ")
  : "Ej kopplad";
const propertyById = (data, id) => (data.properties || []).find(p => p.id === id);
const propertyLabel = (data, id) => propertyReference(propertyById(data, id));
const propertyAddressCell = property => property?.id && propertyAddress(property)
  ? `<button class="text-button" data-property="${esc(property.id)}">${esc(propertyAddress(property))}</button>`
  : "–";
const personLabel = (data, id) =>
  data.people.find((x) => x.id === id)?.name || "Ej fördelat";
const internalPeople = (data) =>
  data.people.filter((person) => {
    if (!person.organizationId) return true;
    return (
      data.organizations.find((org) => org.id === person.organizationId)?.type ===
      "our"
    );
  });
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
function scopedBudgetRows(data, s, year, view) {
  const activeScope = Boolean(
    s.propertyId || s.unit || s.owner || s.person || s.q,
  );
  const rows = calc().budgetRows(data, year);
  if (!activeScope) return rows;
  return rows.filter((row) => budgetRowInScope(row, view));
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
      ([label, value, foot]) =>
        `<div><span>${label}</span><strong>${value}</strong>${foot ? `<small>${foot}</small>` : ""}</div>`,
    )
    .join("")}</div>`;
}
export function summary(data, s, year, ui = {}) {
  const view = scope(data, s);
  const perspective =
    ui.view === "contracts" ? "Avtal" : ui.perspective || "Fastigheter";
  const rent = rentMetrics(data, view.contracts, year);

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
    const metrics = activityMetrics(data, view.items, year);
    return summaryCards([
      ["Aktiviteter", num(metrics.count)],
      ["Utan ansvarig", num(metrics.unassigned)],
      ["Planerade " + year, num(metrics.inYear)],
      ["Bedömd kostnad", money(metrics.cost)],
    ]);
  }

  if (perspective === "Fastigheter") {
    return summaryCards([
      ["Fastigheter", num(view.properties.length)],
      ["Avtal", num(view.contracts.length)],
      ["Total hyra " + year, money(rent.rent), rent.needsReview ? rent.needsReview + " avtal behöver hyresunderlag" : "Beräknad från avtalsvillkor"],
      ["Hyra / kvm", rent.area > 0 ? money(rent.rentPerSqm) : "–"],
    ]);
  }

  if (perspective === "Avtal") {
    return summaryCards([
      ["Avtal", num(view.contracts.length)],
      ["Area", num(rent.area) + " m²"],
      ["Total hyra " + year, money(rent.rent), rent.needsReview ? rent.needsReview + " avtal behöver hyresunderlag" : "Beräknad från avtalsvillkor"],
      ["Hyra / kvm", rent.area > 0 ? money(rent.rentPerSqm) : "–"],
    ]);
  }

  const matchingItems = view.items.filter((item) => item.label === perspective);
  const metrics = activityMetrics(data, matchingItems, year);
  return summaryCards([
    [perspective, num(metrics.count) + " st"],
    ["Bedömd kostnad", money(metrics.cost)],
    ["Planerade " + year, num(metrics.inYear)],
    ["Utan ansvarig", num(metrics.unassigned)],
  ]);
}
function contractComponentLabel(v) {
  if (v.status === "Behöver kontroll")
    return `<span title="${esc(v.reason || "Kontrollera avtalsunderlaget")}" class="rent-needs-review">${v.amount > 0 ? money(v.amount) + " · " : ""}Kontrollera</span>`;
  return v.amount > 0
    ? `<span title="${esc(v.status + " · " + v.source)}">${money(v.amount)}</span>`
    : "–";
}
function contractRows(data, contracts, year) {
  return contracts.map(c=>{
    const p=(data.properties||[]).find(p=>p.id===c.propertyId)||{};
    const v=calc().annualValues(c,year,0,data.indexSeries);
    const area=Number(c.area)||0;
    const total=v.total;
    const complete=v.rent.status!=="Behöver kontroll"&&v.addition.status!=="Behöver kontroll";
    return row([
      esc(propertyDesignation(p) || "–"),
      propertyAddressCell(p),
      `<button class="text-button" data-open-contract="${esc(c.id)}"><strong>${esc(c.number||"Avtalsnummer saknas")}</strong></button>`,
      num(area),
      contractComponentLabel(v.rent),
      contractComponentLabel(v.addition),
      area&&total&&complete?money(total/area):"–",
      esc(c.end||"–"),
      esc(c.noticePeriodMonths==null||c.noticePeriodMonths===""?"–":c.noticePeriodMonths+" mån"),
      `<button class="table-pencil" data-edit="contracts" data-id="${esc(c.id)}" aria-label="Redigera avtal ${esc(c.number||c.id)}" title="Redigera">✎</button>`
    ]);
  });
}
function activityRows(data, items) {
  return items.map(x => {
    const property = propertyById(data, x.propertyId);
    return row([
      `<strong>${esc(x.title)}</strong><small>${esc(x.label)}</small>`,
      esc(propertyDesignation(property) || "–"),
      propertyAddressCell(property),
      esc(personLabel(data, responsible(data, x.collection, x.record))),
      badge(x.record.status),
      money(x.cost),
      edit(x.collection, x.record.id),
    ]);
  });
}
export function overview(data, s, ui) {
  const v = scope(data, s);
  const title = s.propertyId
    ? propertyLabel(data, s.propertyId)
    : "Aktuellt urval";
  const tabs = [
    "Fastigheter",
    "Avtal",
    "Projekt",
    "Underhåll",
    "Drift",
    "Önskemål",
  ];
  let body = "";
  if (ui.perspective === "Fastigheter") {
    body = table(
      ["Fastighet", "Adress", "Ansvarig hos oss", "Avtal", "Area", `Årskostnad ${ui.year}`, ""],
      v.properties.map((p) => {
        const cs = v.contracts.filter((c) => c.propertyId === p.id);
        return row([
          esc(propertyDesignation(p) || "–"),
          `${propertyAddressCell(p)}<small>${esc(propertyOwnerLabel(data, p))}</small>`,
          esc(personLabel(data, p.responsiblePersonId)),
          num(cs.length) + " avtal",
          num(cs.reduce((sum, c) => sum + (Number(c.area) || 0), 0)) + " m²",
          (() => {
            const calculated=calc().propertyAnnualCost(data,p.id,ui.year);
            return `<span title="Beräknat från avtalets hyra, tillägg, drift, skatt och aktuella avtalsperioder">${money(calculated.annualCost)}</span>${calculated.needsReview ? `<small class="rent-needs-review">${calculated.needsReview} avtal behöver kontroll</small>` : ""}${calculated.preliminary ? `<small>${calculated.preliminary} preliminära index</small>` : ""}`;
          })(),
          edit("properties", p.id),
        ]);
      }),
    );
  } else if (ui.perspective === "Avtal")
    body = table(
      ["Fastighet", "Adress", "Avtal", "Kvm", `Hyra ${ui.year}`, `Tillägg ${ui.year}`, "Kr/kvm", "Avtal t.o.m.", "Uppsägning", ""],
      contractRows(data, v.contracts, ui.year),
      true,
      "Avtal",
    );
  else
    body = table(
      ["Aktivitet", "Fastighet", "Adress", "Ansvarig", "Status", "Kostnad", ""],
      activityRows(
        data,
        v.items.filter((x) => x.label === ui.perspective),
      ),
      true,
      ui.perspective,
    );
  return `<div class="section-title"><h2>${esc(title)}</h2>${s.propertyId ? "<button data-clear-property>Visa hela urvalet</button>" : ""}</div><div class="tabs">${tabs.map((x) => `<button data-perspective="${x}" class="${ui.perspective === x ? "active" : ""}">${x}</button>`).join("")}</div>${body}${ui.contractId ? contractDetail(data, ui.contractId, ui.year) : ""}`;
}
function contractIndexBreakdown(c, name, v, rawShare) {
  const amount = v.status === "Behöver kontroll" && v.amount <= 0
    ? "Kan inte beräknas" : money(v.amount);
  const indexText = v.calculated && v.share > 0
    ? `${v.indexYear}: ${indexFormat(v.usedIndex)}${v.preliminary ? " (preliminärt)" : ""}`
    : v.share === 0 && v.calculated ? "Ej tillämpligt (0 %)" : "Saknas";
  const basisText = v.calculated && v.share > 0
    ? `${v.baseYear}: ${indexFormat(v.bastal)}` :
      v.baseYear ? String(v.baseYear) : "–";
  const share = rawShare === "" || rawShare == null ? "Saknas" :
    Number.isFinite(v.share) ? indexFormat(v.share * 100) + " %" : "Ogiltig";
  return `<tr><th scope="row">${esc(name)}</th><td>${money(v.base)}</td><td>${esc(basisText)}</td><td>${esc(share)}</td><td>${esc(indexText)}</td><td><strong>${esc(amount)}</strong></td><td>${badge(v.status)}</td></tr>`;
}
const indexFormat = v => new Intl.NumberFormat("sv-SE", {maximumFractionDigits:4}).format(Number(v)||0);
export function contractDetail(data, id, year) {
  const c=data.contracts.find((x)=>x.id===id);
  if(!c)return "";
  const p=data.properties.find((x)=>x.id===c.propertyId)||{};
  const v=calc().annualValues(c,year,0,data.indexSeries),notice=calc().noticeDate(c);
  const doc=globalThis.LokalblickDocuments.resolve(globalThis.LokalblickDocuments.fromContract(c),globalThis.LokalblickContractDocumentCache);
  const acts=(data.activities||[]).filter((a)=>a.contractId===c.id);
  const orders=(data.orders||[]).filter((o)=>acts.some((a)=>a.id===o.activityId));
  return `<section class="detail"><div class="section-title"><h2>Avtal ${esc(c.number||c.id)}</h2><button data-close-contract>Stäng detalj</button></div>
  <section class="rent-calculation">
    <h3>Årsberäkning ${year}</h3>
    <p><small>Hyra och tillägg räknas separat: basbelopp × (1 + indexandel × (KPI oktober ${year-1} / bastal − 1)). Indexandelen 0 % innebär oförändrat basbelopp. Avtalets golvregel kan hindra sänkning. Preliminära eller ofullständiga underlag markeras.</small></p>
    <div class="table-wrap"><table><thead><tr><th>Del</th><th>Basbelopp / år</th><th>Basår / bastal</th><th>Indexandel</th><th>KPI oktober</th><th>Belopp ${year}</th><th>Kontroll</th></tr></thead><tbody>
    ${contractIndexBreakdown(c,"Hyra",v.rent,c.rentIndexPercent)}
    ${contractIndexBreakdown(c,"Tillägg",v.addition,c.additionIndexPercent)}
    </tbody></table></div>
    <p><strong>Fastighetsskatt:</strong> ${money(v.tax)} · <strong>Total årskostnad:</strong> ${money(v.total)}</p>
    <p><small>Indexkälla hyra: ${esc(v.rent.source)}${v.rent.reason ? " · "+esc(v.rent.reason) : ""}. Tillägg: ${esc(v.addition.source)}${v.addition.reason ? " · "+esc(v.addition.reason) : ""}.</small></p>
  </section>
  <div class="detail-grid">
    <div><small>Verksamhet</small><strong>${esc(units[c.unitId]||c.use||"–")}</strong></div>
    <div><small>Hyresgäst</small><strong>${esc(c.tenantName||"–")}</strong></div>
    <div><small>Verksamhetsansvarig · avtal</small><strong>${esc(personLabel(data,c.businessResponsiblePersonId))}</strong></div>
    <div><small>Vår kontaktperson · fastighet</small><strong>${esc(personLabel(data,p.responsiblePersonId))}</strong></div>
    <div><small>Fastighetsägarens kontaktperson · fastighet</small><strong>${esc(personLabel(data,p.ownerResponsiblePersonId))}</strong></div>
    <div><small>Hyra ${year} · ${esc(v.rent.status)}</small><strong>${v.rent.status==="Behöver kontroll"&&v.rent.amount<=0?"Kontrollera":money(v.rent.amount)}</strong></div>
    <div><small>Tillägg · ${esc(v.addition.status)}</small><strong>${v.addition.status==="Behöver kontroll"&&v.addition.amount<=0?"Kontrollera":money(v.addition.amount)}</strong></div>
    <div><small>Fastighetsskatt</small><strong>${money(v.tax)}</strong></div>
    <div><small>Total årskostnad</small><strong>${money(v.total)}</strong></div>
    <div><small>Hyra kr/kvm · beräknat</small><strong>${c.area>0?num(v.rent.amount/c.area):"–"}</strong></div>
    <div><small>Säg upp senast · beräknat</small><strong>${esc(notice||"–")}</strong></div>
  </div>
  <p>${esc(v.rent.basedOn.join(" · ")||v.rent.source)}${v.rent.reason?" · "+esc(v.rent.reason):""}</p>
  <p>${doc.status==="ready"?`<a href="${esc(doc.href)}" target="_blank" rel="noopener noreferrer">${esc(doc.label)}</a>`:esc(doc.label)} <small>${esc(doc.name)}</small></p>
  <h3>Beställningar</h3>
  ${table(["Aktivitet","Leverantör","Beställt","Utfall","Status",""],orders.map((o)=>{const a=acts.find((x)=>x.id===o.activityId)||{};return row([esc(a.title||o.activityId),esc(o.supplier),money(o.orderedCost),money(o.finalCost),esc(o.paymentStatus||o.completedAt||""),edit("orders",o.id)]);}))}
  <details><summary>Värdenas ursprung</summary>${table(["Fält","Värde","Källa","Rad"],Object.entries(c.provenance||{}).map(([field,x])=>row([esc(field),esc(x.value),esc(x.source),esc(x.row)])))}</details>
  ${edit("contracts",c.id,"Ändra avtal")}</section>`;
}
function timelineView(data, items, ui) {
  const year = Number(ui.year);
  const span = ui.timelineSpan === 3 ? 3 : 1;
  const first = year;
  const months = Array.from({length:12*span}, (_,i)=>({year:first+Math.floor(i/12),month:i%12+1}));
  const visible = items.filter(x => x.collection === "activities");
  const header = months.map((m,i)=>`<div class="timeline-month" title="${m.year}-${String(m.month).padStart(2,"0")}">${span===1?["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"][m.month-1]:(m.month===1?m.year:"")}</div>`).join("");
  const rows = visible.map(x => {
    const a=x.record;
    const start=typeof a.startDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(a.startDate)?new Date(a.startDate+"T00:00:00Z"):null;
    const end=typeof a.endDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(a.endDate)?new Date(a.endDate+"T00:00:00Z"):null;
    const base=Date.UTC(first,0,1), limit=Date.UTC(first+span,0,1), total=limit-base;
    let bar="";
    if(start||end) {
      const from=start?start.getTime():end.getTime();
      const to=end?end.getTime():from;
      if(from<limit&&to>=base&&from<=to){
        const left=Math.max(0,(from-base)/total*100);
        const right=Math.min(100,(to+86400000-base)/total*100);
        const status=String(a.status||"Planerad").toLocaleLowerCase("sv");
        const kind=/klar|slutförd|avslutad/.test(status)?"done":/pågår|pagar/.test(status)?"active":/beställ/.test(status)?"ordered":"planned";
        bar=`<span class="timeline-bar ${kind}" style="left:${left}%;width:${Math.max(0.8,right-left)}%" title="${esc(a.startDate||"")} – ${esc(a.endDate||"")} · ${esc(a.status||"Planerad")}"></span>`;
      }
    } else if(Array.isArray(a.planningMonths)&&a.planningMonths.length && Number(a.planningYear)===first) {
      bar=a.planningMonths.filter(n=>Number(n)>=1&&Number(n)<=12).map(n=>`<span class="timeline-bar planned" style="left:${((Number(n)-1)/(12*span))*100}%;width:${100/(12*span)}%"></span>`).join("");
    }
    const allocations=(a.yearAllocations||[]);
    const readOnly = (data.budgetPlans||[]).some(p=>Number(p.year)===year && p.status==="Låst");
    const unverified=a.project2027BudgetUnit==="unverified";
    const rentFinanced=a.financingMethod==="rent_supplement"||a.project2027RentSurcharge;
    const annual=allocations.find(t=>Number(t.year)===year);
    const home=a.contractId?"Avtal":a.propertyId?"Fastighet":a.scopeType==="unit"?"Område":a.scopeType==="general"?"Generell":"Utan hemvist";
    const amount = readOnly || unverified || rentFinanced
      ? `<span title="${readOnly?"Budgetåret är låst":unverified?"Källbeloppet behöver verifieras":"Finansieras via hyra"}">${unverified?"Ej verifierad":rentFinanced?"Hyrespåslag":annual?money(Number(annual.amount)||0):"–"}</span>`
      : `<input type="number" min="0" step="1" data-activity-year-amount="${esc(a.id)}" data-allocation-year="${year}" aria-label="Årsbelopp ${year} för ${esc(x.title)}" placeholder="Ej fördelad" value="${esc(annual?.amount ?? "")}">`;
    return `<div class="timeline-row"><div class="timeline-label"><button type="button" class="text-button" data-edit="activities" data-id="${esc(a.id)}">${esc(x.title)}</button><small>${esc(home)} · ${esc(a.status||"Planerad")}</small></div><div class="timeline-track">${months.map(()=>'<span class="timeline-grid-cell"></span>').join("")}${bar||'<span class="timeline-unscheduled">Ej tidsatt</span>'}</div><div class="timeline-cost">${amount}</div></div>`;
  }).join("");
  return `<div class="timeline-scroll"><div class="timeline-content" style="--timeline-columns:${12*span}"><div class="timeline-row timeline-head"><div class="timeline-label">Aktivitet</div><div class="timeline-track">${header}</div><div class="timeline-cost">Årsbelopp</div></div>${rows||'<p>Inga aktiviteter i urvalet.</p>'}</div></div>`;
}
export function economicSettings(data, ui) {
  const year=Number(ui.settingsYear || new Date().getFullYear());
  const entry=(data.priceBaseAmounts||[]).find(p=>Number(p.year)===year);
  const amount=Number(entry?.amount)||0;
  const normal=amount>0?money(amount/2):"Saknas";
  const owners=(data.organizations||[]).filter(o=>o.type==="owner");
  const ownerRows=owners.map(o=>`<tr><td>${esc(o.name)}</td><td>${esc(o.investmentRule==="stadsfastigheter"?"Stadsfastigheter":"Normalregel")}</td><td>${o.investmentRule==="stadsfastigheter" ? money(Number(o.investmentThreshold)||200000) : normal}</td><td>${o.investmentRule==="stadsfastigheter"?esc(String(o.rentSurchargeRate??7.5))+" %":"–"}</td><td><button data-edit="organizations" data-id="${esc(o.id)}">Ändra</button></td></tr>`).join("");
  return `<div class="section-title"><h2>Ekonomiska regler</h2></div>
    <p>Gemensamma grundvärden gäller vid beräkning av drift och investering. Regler för en viss fastighetsägare ändras på ägaren.</p>
    <section class="detail"><h3>Prisbasbelopp</h3><label>År <input type="number" min="2000" max="2200" data-settings-year="${year}" value="${year}"></label>
    <label>Fastställt prisbasbelopp (kr) <input type="number" min="1" step="1" data-price-base-year="${year}" value="${entry?.amount??""}" placeholder="Saknas"></label>
    <p>Normal investeringsgräns: <strong>${normal}</strong> (½ prisbasbelopp).</p>
    <small>Källa: ${esc(entry?.source||"Ej registrerad")}. ${entry ? "Värdet är sparat för "+year+"." : year===new Date().getFullYear() ? "Årets prisbasbelopp hämtas automatiskt från SCB." : "Hämta officiellt belopp för året."}</small>
    <p><button type="button" data-price-base-official="${year}">${entry?"Uppdatera från SCB":"Hämta officiellt belopp"}</button></p></section>
    <section class="detail"><h3>Fastighetsägarnas regler</h3><table><thead><tr><th>Ägare</th><th>Regel</th><th>Gräns</th><th>Årligt hyrespåslag</th><th></th></tr></thead><tbody>${ownerRows||'<tr><td colspan="5">Inga fastighetsägare registrerade.</td></tr>'}</tbody></table></section>`;
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
  let items = propertyItems.concat(v.items);
  const missing = items.filter(
    (x) => !responsible(data, x.collection, x.record),
  );
  if (ui.unassigned) items = missing;
  const withoutHome = items.filter(x => x.collection === "activities" &&
    !x.record.propertyId && !x.record.contractId &&
    x.record.scopeType !== "general" &&
    !(x.record.scopeType === "unit" && x.record.unitId));
  if (ui.unassignedHome) items = withoutHome;
  const history = (data.auditLog || [])
    .filter((h) =>
      (h.fields || []).some((f) => f.field === "responsiblePersonId"),
    )
    .slice(-30)
    .reverse();
  const timelineControls = `<div class="actions"><button type="button" data-planning-mode="list" class="${ui.planningMode==="timeline"?"":"active"}">Lista</button><button type="button" data-planning-mode="timeline" class="${ui.planningMode==="timeline"?"active":""}">Tidslinje</button>${ui.planningMode==="timeline"?`<button type="button" data-timeline-span="1" class="${ui.timelineSpan===3?"":"active"}">1 år</button><button type="button" data-timeline-span="3" class="${ui.timelineSpan===3?"active":""}">3 år</button>`:""}</div>`;
  const timelineBody = ui.planningMode==="timeline" ? timelineView(data,items,ui) : null;
  return `<div class="section-title"><h2>Fördela och planera</h2><div class="actions"><button data-unassigned class="${ui.unassigned ? "active" : ""}">${missing.length} utan ansvarig</button><button data-unassigned-home class="${ui.unassignedHome ? "active" : ""}">${withoutHome.length} utan hemvist</button></div></div>${timelineControls}${timelineBody||table(
    ["Uppgift", "Fastighet", "Adress", "Hemvist", "Ansvarig hos oss", "Datum", "Kostnad", ""],
    items.map((x) =>
      row([
        `<strong>${esc(x.title)}</strong><small>${esc(x.label)}</small>${x.collection==="activities"&&x.record.actionKind ? `<small>${x.record.actionKind==="value_enhancing"?"Värdehöjande":"Utbyte 1:1"}</small>` : ""}`,
        esc(propertyDesignation(propertyById(data, x.propertyId)) || "–"),
        propertyAddressCell(propertyById(data, x.propertyId)),
        x.collection === "activities"
          ? `<select data-activity-home="${esc(x.record.id)}" aria-label="Hemvist för ${esc(x.title)}">${options([
              ...(data.contracts || []).map(c => {
                const property = (data.properties || []).find(p => p.id === c.propertyId);
                return {
                  id: "contract:" + c.id,
                  label: "Avtal " + (c.number || c.id) + " · " +
                    (c.businessName || c.use || "Verksamhet saknas") + " · " +
                    propertyReference(property)
                };
              }),
              ...(data.properties || []).map(p => ({id:"property:"+p.id,label:"Fastighet · "+propertyReference(p)})),
              ...Object.entries(units).map(([id,label])=>({id:"unit:"+id,label:"Område · "+label})),
              {id:"general",label:"Generell"}
            ],x=>x.id,x=>x.label,x.record.contractId?"contract:"+x.record.contractId:
            x.record.propertyId?"property:"+x.record.propertyId:
            x.record.scopeType==="unit"&&x.record.unitId?"unit:"+x.record.unitId:
            x.record.scopeType==="general"?"general":"","Ej fördelad")}</select>`
          : "<small>Fastighet</small>",
        `<select aria-label="Ansvarig för ${esc(x.title)}" data-assign="${x.collection}" data-id="${esc(x.record.id)}">${options(
          internalPeople(data),
          (p) => p.id,
          (p) => p.name,
          responsible(data, x.collection, x.record),
          "Ej fördelat",
        )}</select>`,
        x.collection === "activities"
          ? `<span class="plan-date-range">${x.record.startDate || x.record.endDate ? esc(x.record.startDate || "–") + " → " + esc(x.record.endDate || "–") : "Ej tidsatt"}</span>`
          : "<small>Löpande fastighetsansvar</small>",
        x.collection === "activities" && x.record.project2027SourceId
          ? `<span title="Beloppet är inte budgetfört förrän enhet och finansiering har verifierats">${x.record.project2027BudgetRaw == null ? "Budget saknas" : esc(String(x.record.project2027BudgetRaw)) + " · enhet ej verifierad"}${x.record.project2027RentSurcharge ? "<small>Hyresfinansierad · utanför budget</small>" : "<small>Ej budgetförd</small>"}</span>`
          : money(x.cost),
        `${edit(x.collection, x.record.id)}${x.collection === "activities" && x.record.type === "Önskemål" ? `<button data-move="Underhåll" data-id="${esc(x.record.id)}">Till UH</button><button data-move="Drift" data-id="${esc(x.record.id)}">Till drift</button>` : ""}`,
      ]),
    ),
  )}<details><summary>Ansvarsändringar (${history.length})</summary>${table(
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
  )}</details>`;
}
export const categories = [
  "Hyra + drift",
  "Underhåll",
  "Projekt",
  "Driftkostnader",
  "Utredningar",
];
export function budget(data,s,ui) {
  const scoped=Boolean(s.propertyId||s.unit||s.owner||s.person||s.q),view=scope(data,s);
  const plan=data.budgetPlans.find(p=>Number(p.year)===ui.year),locked=plan?.status==='Låst';
  const rows=scopedBudgetRows(data,s,ui.year,view);
  const baselineRows=locked?(plan?.lines||[]):rows;
  const included=baselineRows.filter(r=>r.included!==false&&(!scoped||budgetRowInScope(r,view)));
  const comparison=globalThis.LokalblickBudgetFollowup.compare(data,included,rows,ui.year);
  const baseline=calc().summarize(included),forecast=calc().summarize(comparison.map(r=>({...r,amount:r.forecast}))),actual=calc().summarize(comparison.map(r=>({...r,amount:r.finalCost??0})));
  const total=categories.reduce((sum,k)=>sum+(scoped?baseline[k]||0:Number(plan?.targets?.[k]??baseline[k]??0)),0);
  const indexControl = locked
    ? `<span><strong>Låst oktoberindex ${Number(plan?.lockedIndexYear)||ui.year-1}: ${Number(plan?.lockedIndexValue)||0}</strong>${plan?.lockedIndexSource?` · ${esc(plan.lockedIndexSource)}`:""}</span>`
    : `<label>Preliminärt oktoberindex ${ui.year-1}<input type="number" min="0" step="0.01" data-preliminary value="${Number(plan?.preliminaryIndex)||0}" ${!plan?'disabled':''}></label><span>Känt oktoberindex används först.</span>`;
  return `<div class="section-title"><h2>Budget ${ui.year} ${badge(locked?'Låst baslinje':plan?'Arbetsbudget':'Ej skapad')}</h2><label>År<input data-year type="number" min="2000" max="2200" value="${ui.year}"></label></div><div class="budget-controls">${indexControl}${!plan?'<button data-budget-create>Skapa budget</button>':!locked&&!scoped?'<button data-budget-lock>Lås budget</button>':''}</div><p>Årsbudget <strong>${money(total)}</strong> · prognos <strong>${money(comparison.reduce((sum,r)=>sum+r.forecast,0))}</strong></p>${table(['Kategori','Underlag','Justering','Årsbudget','Prognos','Slutkostnad'],categories.map(k=>{
    const base=baseline[k]||0,target=scoped?base:Number(plan?.targets?.[k]??base);
    return row([esc(k),money(base),plan&&!locked&&!scoped?`<input aria-label="Justering ${k}" data-adjust="${k}" type="number" value="${target-base}">`:money(target-base),money(target),money(forecast[k]),money(actual[k])]);
  }))}${plan?globalThis.LokalblickBudgetUI.html(plan,comparison,scoped,{state:data,esc,money}):''}`;
}
const importFieldLabels = {
  sourceId: "Objekts-ID",
  address: "Adress",
  designation: "Fastighetsbeteckning",
  propertyId: "Fastighet",
  number: "Avtalsnummer",
  area: "Area",
  category: "Kategori",
  use: "Verksamhet / användning",
  businessName: "Namn på verksamheten",
  ownerPartyId: "Fastighetsägare",
  businessPartyId: "Äldre partskoppling",
  tenantName: "Hyresgäst",
  responsiblePersonId: "Ansvarig hos oss",
  ownerResponsiblePersonId: "Ansvarig hos fastighetsägaren",
  businessResponsiblePersonId: "Verksamhetsansvarig",
  start: "Avtalsstart",
  end: "Avtalsslut",
  noticePeriodMonths: "Uppsägningstid",
  renewalPeriodMonths: "Förlängningstid",
  originalTerm: "Ursprunglig avtalstid",
  baseRent: "Bashyra",
  baseAdditions: "Tillägg",
  rentBaseYear: "Basår hyra",
  rentIndexPercent: "Indexandel hyra",
  additionBaseYear: "Basår tillägg",
  additionIndexPercent: "Indexandel tillägg",
  annualContractDrift: "Avtalsdrift",
  annualPropertyTax: "Fastighetsskatt",
  unitId: "Verksamhet / område",
  employees: "Antal anställda",
  users: "Antal brukare",
  rooms: "Antal rum",
  commonArea: "Allmän yta",
  apartmentArea: "Lägenhetsyta",
};
const importFieldLabel = (field) => importFieldLabels[field] || field || "Uppgift";
const sourceKindLabel = (kind) =>
  ({
    "core-import": "Grunddata",
    "operational-enrichment": "Fastigheter & aktiviteter",
    "contract-enrichment": "Avtalsberikning",
    migration: "Migrering",
  })[kind] || kind || "";
function reviewCollection(item) {
  if (item.collection) return item.collection;
  if (item.entity === "Fastighet") return "properties";
  if (item.entity === "Avtal" || item.contractId) return "contracts";
  return "";
}
function reviewRecord(data, item) {
  const collection = reviewCollection(item);
  const records = Array.isArray(data[collection]) ? data[collection] : [];
  let record = records.find((x) => x.id === item.recordId);
  if (!record && item.field) {
    const matches = records.filter(
      (x) => JSON.stringify(x[item.field] ?? "") === JSON.stringify(item.current ?? ""),
    );
    if (matches.length === 1) record = matches[0];
  }
  return { collection, record };
}
function reviewRecordLabel(data, item) {
  if (item.recordLabel) return item.recordLabel;
  const { collection, record } = reviewRecord(data, item);
  if (!record) return item.entity || "";
  if (collection === "properties")
    return [record.address, record.designation, record.sourceId].filter(Boolean).join(" · ");
  if (collection === "contracts")
    return [
      record.number,
      propertyLabel(data, record.propertyId),
      record.businessName || record.use,
    ].filter(Boolean).join(" · ");
  if (collection === "activities") return record.title || record.id;
  return record.name || record.id || "";
}
function reviewCurrentSource(data, item) {
  if (item.currentSource)
    return [item.currentSource, item.currentSheet, item.currentRow ? "rad " + item.currentRow : ""]
      .filter(Boolean)
      .join(" · ");
  const { record } = reviewRecord(data, item);
  const provenance = record?.provenance?.[item.field] || {};
  return [
    provenance.source || record?.sourceSheet || "Lokalblick-data",
    provenance.sheet || record?.sourceSheet || "",
    provenance.row || record?.sourceRow ? "rad " + (provenance.row || record?.sourceRow) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function reviewIncomingSource(item) {
  return [
    item.source || "Importerad fil",
    item.sheet ? "flik " + item.sheet : "",
    item.row ? "rad " + item.row : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function reviewValue(data, item, value) {
  if (value == null || value === "") return "Tomt";
  if (["ownerPartyId", "businessPartyId"].includes(item.field))
    return organizationLabel(data, value) || value;
  if (
    ["responsiblePersonId", "ownerResponsiblePersonId", "businessResponsiblePersonId"].includes(
      item.field,
    )
  )
    return personLabel(data, value) || value;
  if (item.field === "propertyId") return propertyLabel(data, value);
  if (typeof value === "number")
    return ["area", "commonArea", "apartmentArea"].includes(item.field)
      ? num(value) + " m²"
      : num(value);
  return String(value);
}
function reviewSuggestion(data,x) {
  const normalizeAddress=s=>String(s??"").toLocaleLowerCase("sv")
    .replace(/\s+/g," ").replace(/(\d)\s+([a-zåäö])(?=$|[\s,.])/gi,"$1$2").trim();
  if(x.field==="address" && normalizeAddress(x.current)===normalizeAddress(x.proposed))
    return {side:"current",title:"Samma adress – olika skrivsätt",detail:"Behåll tidigare registrerad stavning."};
  if(x.field==="designation" && /står för lokalen/i.test(String(x.proposed||"")))
    return {side:"current",title:"Inte en fastighetsbeteckning",detail:"Texten från filen ser ut att vara en kommentar."};
  if(x.field==="ownerPartyId") return {side:"",title:"Kontrollera juridiskt bolag",detail:"Liknande företagsnamn innebär inte att fastighetsägaren är samma juridiska part."};
  if(x.collection==="activities" && ["title","estimatedCost","name"].includes(x.field))
    return {side:"",title:"Kan vara två skilda aktiviteter",detail:"Jämför källrad och arbetsbeskrivning innan du väljer."};
  return null;
}
function reviewConflictCard(data,x) {
  const label=reviewRecordLabel(data,x),hint=reviewSuggestion(data,x);
  const notice=hint?`<p class="review-recommendation"><strong>${esc(hint.title)}</strong> · ${esc(hint.detail)}</p>`:"";
  return `<section class="review review-conflict"><div class="review-main"><div class="review-heading"><div><strong>${esc(x.entity||(x.contractId?"Avtal":"Datakonflikt"))} · ${esc(importFieldLabel(x.field))}</strong>${label?`<small class="review-context">${esc(label)}</small>`:""}</div></div>${notice}
  <div class="review-compare">
    <div class="review-value current"><span>1 · Registrerat tidigare</span><strong>${esc(reviewValue(data,x,x.current))}</strong><small>${esc(reviewCurrentSource(data,x))}</small><button type="button" data-review="${esc(x.id)}" data-decision="reject" class="${hint?.side==="current"?"primary-action":""}">Välj detta värde</button></div>
    <div class="review-value proposed"><span>2 · Från nya importfilen</span><strong>${esc(reviewValue(data,x,x.proposed))}</strong><small>${esc(reviewIncomingSource(x))}</small><button type="button" data-review="${esc(x.id)}" data-decision="accept">Välj detta värde</button></div>
  </div></div></section>`;
}
function importRecordPreview(record) {
  if(!record)return "<p><small>Källdetaljer saknas. Sök på adress eller nummer.</small></p>";
  const fields=[["Adress",record.address],["Fastighetsbeteckning",record.designation],
    ["Ort",record.city],["Objekt",record.objectNo],
    ["Avtalsnummer",record.number],["Verksamhet",record.use||record.business],
    ["Area",record.area?num(record.area)+" m²":""],["Start",record.start],["Slut",record.end],
    ["Bashyra",record.baseRent?money(record.baseRent):""],
    ["Bastillägg",record.baseAdditions?money(record.baseAdditions):""],
    ["Ägare",record.ownerName],["Benämning",record.name||record.title]]
    .filter(([,value])=>value!==""&&value!=null);
  return `<dl class="review-record-preview">${fields.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
}
export function reviewCandidateChoices(data,item,searchValue="") {
  const matcher=globalThis.LokalblickAddressMatch;
  if(!matcher)return "<p>Adressmatchningen är inte tillgänglig. Ladda om sidan.</p>";
  const isContract=item.kind==="match",r=item.record||{address:item.address||""};
  const search=String(searchValue||"").trim();
  let choices=isContract?matcher.rankContracts(data,r,5):matcher.rankProperties(data.properties||[],r,5);
  if(search.length>=2){
    const q=matcher.norm(search);
    choices=isContract?(data.contracts||[]).filter(c=>{
      const p=(data.properties||[]).find(p=>p.id===c.propertyId);
      return matcher.norm([c.number,p?.address,p?.designation,p?.city,c.area,c.businessName].join(" ")).includes(q);
    }).slice(0,8).map(c=>({id:c.id,contract:c,property:(data.properties||[]).find(p=>p.id===c.propertyId),reason:"Sökresultat"}))
    :(data.properties||[]).filter(p=>matcher.norm([p.address,p.designation,p.city,p.sourceId,p.name].join(" ")).includes(q))
      .slice(0,8).map(p=>({id:p.id,property:p,reason:"Sökresultat"}));
  }
  if(!choices.length)return '<p class="review-no-candidates">Ingen entydig kandidat. Kontrollera adress och objektsnummer; sök vid behov nedan.</p>';
  const name="match-"+String(item.id).replace(/[^a-z0-9-]/gi,"-");
  return `<div class="review-match-options">${choices.map(c=>{
    const p=c.property||{},contract=c.contract;
    const title=contract?"Avtal "+(contract.number||"utan nummer"):propertyDesignation(p)||"Fastighetsbeteckning saknas";
    const details=contract?[
      propertyAddress(p),propertyDesignation(p),contract.area?num(contract.area)+" m²":"",
      [contract.start,contract.end].filter(Boolean).join(" – "),contract.businessName||contract.use
    ]:[
      propertyAddress(p),p.city,p.sourceId?"Objektsnummer "+p.sourceId:"",
      organizationLabel(data,p.ownerPartyId)||p.sourceOwner,p.name
    ];
    return `<label class="review-match-option"><input type="radio" name="${esc(name)}" data-review-target="${esc(item.id)}" value="${esc(c.id)}">
      <span><strong>${esc(title)}</strong><small>${esc(details.filter(Boolean).join(" · "))}</small><small class="review-match-reason">${esc(c.reason||"")}</small></span></label>`;
  }).join("")}</div>`;
}
function reviewStandardCard(data,x) {
  const titles={match:"Matcha importerat avtal",record:"Koppla importerad post",
    "activity-property":"Koppla aktivitet till fastighet","property-match":"Matcha fastighet via adress",person:"Komplettera person"};
  const isMatch=["record","activity-property","property-match","match"].includes(x.kind);
  const preview=isMatch?`<section class="review-source-record"><strong>Inläst post – ${esc(reviewIncomingSource(x))}</strong>${importRecordPreview(x.record)}</section>`:
    `<p>${esc([x.personName,x.message].filter(Boolean).join(" · "))}</p>`;
  const picker=isMatch?`<div class="review-candidates">
    <h4>${x.kind==="match"?"Möjliga avtal":"Möjliga fastigheter"}</h4>
    <small>Endast relevanta förslag visas. Kontrollera innehållet innan du kopplar.</small>
    ${reviewCandidateChoices(data,x)}
    <details class="review-search"><summary>Sök annan ${x.kind==="match"?"avtalspost":"fastighet"}</summary>
      <label>Adress, beteckning eller nummer
        <input type="search" autocomplete="off" placeholder="Skriv minst två tecken" data-review-search="${esc(x.id)}">
      </label><div data-review-search-results="${esc(x.id)}"></div></details></div>`:"";
  const actions=isMatch?`<div class="review-match-actions">
    <button data-review="${esc(x.id)}" data-decision="accept" class="primary-action">${x.kind==="match"?"Koppla valt avtal och berika":"Koppla vald fastighet"}</button>
    <button data-review="${esc(x.id)}" data-decision="reject">Avvisa matchningen</button></div>`:
    `<div class="actions"><button data-review="${esc(x.id)}" data-decision="accept">${x.kind==="person"?"Behåll preliminär person":"Godkänn"}</button>
      <button data-review="${esc(x.id)}" data-decision="reject">${x.kind==="person"?"Ta bort preliminär person":"Avvisa"}</button></div>`;
  return `<section class="review review-match"><div class="review-main">
    <div class="review-heading"><strong>${esc(titles[x.kind]||x.kind)}</strong></div>
    ${preview}${picker}${actions}</div></section>`;
}
function priorityPanel(data,reviews){
  const groups=new Map();
  reviews.filter(bulkEligible).forEach(x=>{
    const key=JSON.stringify([reviewCollection(x),x.field,x.source]);
    const row=groups.get(key)||{collection:reviewCollection(x),field:x.field,source:x.source,count:0,previous:new Set()};
    row.count++;row.previous.add(x.currentSource||"Tidigare registrerat");groups.set(key,row);
  });
  const rules=Object.entries(data.importFieldPreferences||{});
  if(!groups.size&&!rules.length)return "";
  const controls=[...groups.values()].sort((a,b)=>b.count-a.count).map(row=>{
    const key=encodeURIComponent(JSON.stringify([row.collection,row.field,row.source]));
    const prev=[...row.previous].join(" / ");
    return `<div class="source-priority-row">
      <div><strong>${esc(importFieldLabel(row.field))}</strong><small>${row.count} konflikter · ${esc(row.collection==="properties"?"Fastighet":row.collection==="contracts"?"Avtal":"Aktivitet")}</small></div>
      <label>Prioriterad källa
        <select data-priority-choice="${esc(key)}"><option value="">Välj källa</option>
          <option value="reject">Behåll tidigare (${esc(prev.length>80?"Registrerat i Lokalblick":prev)})</option>
          <option value="accept">Använd ${esc(row.source)}</option>
        </select>
      </label>
      <button type="button" data-priority-apply="${esc(key)}">Välj för alla ${row.count}</button>
    </div>`;
  }).join("");
  const saved=rules.length?`<details><summary>Sparad källprioritet (${rules.length})</summary>
    ${rules.map(([key,choice])=>`<div class="source-priority-row"><small>${esc(key.split("|").join(" · "))}</small><strong>${choice==="accept"?"Importerad fil":"Tidigare data"}</strong><button type="button" data-priority-remove="${esc(encodeURIComponent(key))}">Ta bort regel</button></div>`).join("")}
    <small>Att ta bort en regel ändrar inte redan godkända data.</small></details>`:"";
  return `<section class="detail source-priority">
    <h3>Välj källa för alla konflikter av samma typ</h3>
    <p>Exempel: välj Lokallista eller berikningsfilen för alla fastighetsägare. Endast detta fält påverkas. Beslutet sparas även för nästa import från samma fil.</p>
    ${controls||"<p>Inga kvarvarande fältkonflikter.</p>"}${saved}
    <small>Avtalsmatchningar och preliminära personer kräver separat kontroll.</small>
  </section>`;
}
export function sources(data, transport) {
  const st = transport.status(),
    company = transport.company();
  const reviews = data.importReview.filter((x) => x.status === "pending");
  const activities = data.activities || [];
  const missingHome = activities.filter(a =>
    !a.contractId && !a.propertyId &&
    !(a.scopeType==="unit" && a.unitId) && a.scopeType!=="general"
  ).length;
  const missingResponsible = activities.filter(a=>!a.responsiblePersonId).length;
  const simplifiedQuality = '<section class="detail"><div class="section-title"><h3>Att komplettera</h3><button type="button" data-view="plan">Öppna Planera</button></div><p><strong>' +
    missingHome + '</strong> aktiviteter utan hemvist · <strong>' +
    missingResponsible + '</strong> utan ansvarig · <strong>' +
    reviews.length + '</strong> importärenden att granska.</p><small>Komplettera aktivitet och ansvar på ett ställe. Övriga vyer hämtar samma uppgifter.</small></section>';

  const allProperties = data.properties || [];
  const hasGeo = p => p.latitude != null && p.longitude != null && p.latitude !== "" && p.longitude !== "" &&
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
  const missingGeo = allProperties.filter(p => !hasGeo(p));
  const manualCount = allProperties.filter(p => hasGeo(p) && p.geoSource === "manual").length;
  const geoPanel = '<section class="detail geo-quality"><div class="section-title"><h3>Geodata och kartplacering</h3>' +
    '<button type="button" data-geo-retry>Försök geokoda igen</button></div>' +
    '<p><strong>' + (allProperties.length - missingGeo.length) + ' av ' + allProperties.length +
    '</strong> fastigheter har en position · ' + manualCount + ' manuellt placerade · ' +
    missingGeo.length + ' saknar koordinater.</p>' +
    (missingGeo.length
      ? '<p>Placera återstående fastigheter direkt på kartan. Klicka på adressen och välj byggnadens läge.</p>' +
        '<details class="geo-details"><summary>Visa fastigheter som saknar position (' + missingGeo.length + ')</summary><div class="geo-missing-list">' + missingGeo.slice().sort((a,b) =>
          new Intl.Collator("sv-SE",{numeric:true,sensitivity:"base"}).compare(a.address || a.designation || "",b.address || b.designation || "")
        ).map(p => '<div class="geo-missing-row"><span><strong>' +
          esc(p.address || p.designation || "Fastighet utan adress") + '</strong><small>' +
          esc(p.city || "Ort saknas") + '</small></span><button type="button" data-geo-place="' +
          esc(p.id) + '">Placera på karta</button></div>').join("") + '</div></details>'
      : '<p>Alla fastigheter har koordinater.</p>') + '</section>';

  const workingState = st.staged
    ? '<section class="detail"><strong>Osparad Lokalblick-arbetsyta</strong><p>Importerna och berikningarna ligger samlade i den här webbläsaren. Du kan läsa in fler filer utan mellansparning. Välj Spara som Lokalblick-data för att skapa din permanenta Excel-fil.</p><button type="button" data-source="create">Spara som Lokalblick-data</button></section>'
    : '';
  // Source registry may have several processing stages for one physical file.
  const sourceGroups=new Map();
  (data.sourceRegistry||[]).forEach(src=>{
    const name=String(src.name||"").trim(),key=name.toLocaleLowerCase("sv");
    const sheets=String(src.sheets||"").split(",").map(x=>x.trim()).filter(Boolean);
    const existing=sourceGroups.get(key);
    if(!existing)sourceGroups.set(key,{
      name,sheets:new Set(sheets),kinds:new Set([sourceKindLabel(src.kind)]),
      rows:Number(src.rows)||0,matched:Number(src.matched)||0,created:Number(src.created)||0,
      review:Number(src.review)||0,importedAt:src.importedAt||""
    });
    else {
      sheets.forEach(x=>existing.sheets.add(x));existing.kinds.add(sourceKindLabel(src.kind));
      existing.rows+=Number(src.rows)||0;existing.matched+=Number(src.matched)||0;
      existing.created+=Number(src.created)||0;
      existing.review=Math.max(existing.review,Number(src.review)||0);
      if(String(src.importedAt||"")>String(existing.importedAt))existing.importedAt=src.importedAt;
    }
  });
  return workingState + simplifiedQuality + priorityPanel(data,reviews) + geoPanel + `<div class="section-title"><h2>Datakällor och kvalitet</h2><button data-view="people">Personer och parter</button>${st.connected ? `<button data-source="refresh">Läs om</button>` : ""}</div><section class="detail"><strong>${esc(st.fileName || "Ingen arbetsfil ansluten")}</strong><p>${company ? "Läsning och sparande sker genom företagets lokala API. Källadaptrar konfigureras i backend." : st.sourceKind === "migration" ? "Källfilen är skrivskyddad. Läs in fler Excel-filer och skapa sedan Lokalblick-data." : "Excel är källunderlag. Lokalblick matchar och berikar sin egen datamodell utan att skapa parallella tabeller."}</p>${company ? "" : `<div class="actions"><button data-source="import">Läs in underlag</button><button data-source="connect">Anslut Lokalblick-data</button><button data-source="create">Skapa Lokalblick-data</button></div><details><summary>Avancerade filåtgärder</summary><button data-source="blank">Ny tom Lokalblick-data</button><p><small>En tom arbetsfil innehåller ingen tidigare data.</small></p></details><p><small>Importen läser kända flikar automatiskt. Fastigheter och avtal byggs eller matchas först; därefter berikas de med fastighetsägare, verksamhet, ansvariga, ekonomi, aktiviteter, beställningar och KPI när uppgifterna finns.</small></p>`}</section>${table(
    ["Källa", "Flik(ar)", "Typ", "Rader", "Matchat", "Skapat", "Granska", "Importerad"],
    [...sourceGroups.values()].map(x =>
      row([
        esc(x.name),
        esc([...x.sheets].join(", ") || "–"),
        esc([...x.kinds].join(" + ")),
        num(x.rows),
        num(x.matched),
        num(x.created),
        num(x.review),
        esc(x.importedAt),
      ]),
    ),
  )}<div class="section-title review-title"><h3>Behöver granskas (${reviews.length})</h3><div class="actions"><small>Välj vilket värde som ska gälla. Valet loggas i ändringshistoriken.</small><button type="button" data-export-reviews ${reviews.length ? "" : "disabled"}>Exportera granskningsfel (JSON)</button></div></div><details class="review-details"><summary>Visa granskningsärenden (${reviews.length})</summary>${
    reviews
      .map((x) =>
        x.kind === "conflict" || x.kind === "operational-conflict"
          ? reviewConflictCard(data, x)
          : reviewStandardCard(data, x),
      )
      .join("") || "<p>Inga öppna matchningar eller konflikter.</p>"
  }</details><details><summary>Ändringar som väntar på Excel (${st.pendingChanges?.length || 0})</summary>${table(
    ["Flik", "Post", "Ändring"],
    (st.pendingChanges || []).map((x) =>
      row([esc(x.sheet), esc(x.id), esc(x.action)]),
    ),
  )}</details>`;
}
export function organization(data) {
  return `<div class="section-title"><h2>Personer och parter</h2><div>${edit("people","","Lägg till person")}${edit("organizations","","Lägg till part")}</div></div>
  ${table(["Person","Befattning","Telefonnummer","Part",""],data.people.map((x)=>row([esc(x.name),esc(x.role),esc(x.phone||"–"),esc(data.organizations.find((o)=>o.id===x.organizationId)?.name||""),edit("people",x.id)])))}
  <h3>Parter</h3>
  ${table(["Part","Typ",""],data.organizations.map((x)=>row([esc(x.name),esc(x.type),edit("organizations",x.id)])))}`;
}
