import { scope, responsible, kinds } from "./model.js";
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
const table = (head, rows) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.join("") : `<tr><td colspan="${head.length}" class="empty">Inga poster i aktuellt urval.</td></tr>`}</tbody></table></div>`;
const row = (cells) =>
  `<tr>${cells.map((x, i) => `<td${i === 0 ? ' class="primary-cell"' : ""}>${x}</td>`).join("")}</tr>`;
const badge = (x) =>
  `<span class="badge ${/kontroll|Prelim|saknas|Ej /.test(x) ? "warning" : ""}">${esc(x || "–")}</span>`;
export function options(items, value, label, selected = "", empty = "Alla") {
  return (
    `<option value="">${empty}</option>` +
    items
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
const propertyLabel = (data, id) =>
  data.properties.find((x) => x.id === id)?.address || id || "Ej kopplad";
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
function contractRows(data, contracts, year) {
  return contracts.map((c) => {
    const v = calc().annualValues(c, year, 0, data.indexSeries);
    return row([
      `<button class="text-button" data-open-contract="${esc(c.id)}">${esc(c.number || "Avtalsnummer saknas")}</button><small>${esc(propertyLabel(data, c.propertyId))}</small>`,
      num(c.area) + " m²",
      `${money(v.rent.amount)}<small>${money(v.addition.amount)} tillägg</small>`,
      badge(v.rent.status),
      esc(c.end || "Tillsvidare"),
      edit("contracts", c.id),
    ]);
  });
}
function activityRows(data, items) {
  return items.map((x) =>
    row([
      `<strong>${esc(x.title)}</strong><small>${esc(propertyLabel(data, x.propertyId))} · ${esc(x.label)}</small>`,
      esc(personLabel(data, responsible(data, x.collection, x.record))),
      badge(x.record.status),
      money(x.cost),
      edit(x.collection, x.record.id),
    ]),
  );
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
      ["Fastighet", "Ansvarig hos oss", "Avtal", "Area", "Årskostnad", ""],
      v.properties.map((p) => {
        const cs = v.contracts.filter((c) => c.propertyId === p.id);
        return row([
          `<button class="text-button" data-property="${esc(p.id)}">${esc(p.address || p.designation || p.id)}</button><small>${esc(propertyOwnerLabel(data, p))}</small>`,
          esc(personLabel(data, p.responsiblePersonId)),
          num(cs.length) + " avtal",
          num(cs.reduce((sum, c) => sum + (Number(c.area) || 0), 0)) + " m²",
          money(
            cs.reduce(
              (sum, c) =>
                sum +
                calc().annualValues(c, ui.year, 0, data.indexSeries).total,
              0,
            ),
          ),
          edit("properties", p.id),
        ]);
      }),
    );
  } else if (ui.perspective === "Avtal")
    body = table(
      ["Avtal", "Area", "Hyra / år", "Värdestatus", "Slutdatum", ""],
      contractRows(data, v.contracts, ui.year),
    );
  else
    body = table(
      ["Aktivitet", "Ansvarig", "Status", "Kostnad", ""],
      activityRows(
        data,
        v.items.filter((x) => x.label === ui.perspective),
      ),
    );
  return `<div class="section-title"><h2>${esc(title)}</h2>${s.propertyId ? "<button data-clear-property>Visa hela urvalet</button>" : ""}</div><div class="tabs">${tabs.map((x) => `<button data-perspective="${x}" class="${ui.perspective === x ? "active" : ""}">${x}</button>`).join("")}</div>${body}${ui.contractId ? contractDetail(data, ui.contractId, ui.year) : ""}`;
}
export function contractDetail(data, id, year) {
  const c=data.contracts.find((x)=>x.id===id);
  if(!c)return "";
  const p=data.properties.find((x)=>x.id===c.propertyId)||{};
  const v=calc().annualValues(c,year,0,data.indexSeries),notice=calc().noticeDate(c);
  const doc=globalThis.LokalblickDocuments.resolve(globalThis.LokalblickDocuments.fromContract(c),globalThis.LokalblickContractDocumentCache);
  const acts=(data.activities||[]).filter((a)=>a.contractId===c.id);
  const orders=(data.orders||[]).filter((o)=>acts.some((a)=>a.id===o.activityId));
  return `<section class="detail"><div class="section-title"><h2>Avtal ${esc(c.number||c.id)}</h2><button data-close-contract>Stäng detalj</button></div>
  <div class="detail-grid">
    <div><small>Verksamhet</small><strong>${esc(c.businessName||c.use||"–")}</strong><small>${esc(organizationLabel(data,c.businessPartyId))}</small></div>
    <div><small>Verksamhetsansvarig</small><strong>${esc(personLabel(data,c.businessResponsiblePersonId))}</strong></div>
    <div><small>Ansvarig hos oss · fastighet</small><strong>${esc(personLabel(data,p.responsiblePersonId))}</strong></div>
    <div><small>Fastighetsägarens ansvarige</small><strong>${esc(personLabel(data,p.ownerResponsiblePersonId))}</strong></div>
    <div><small>Hyra ${year} · ${esc(v.rent.status)}</small><strong>${money(v.rent.amount)}</strong></div>
    <div><small>Tillägg · ${esc(v.addition.status)}</small><strong>${money(v.addition.amount)}</strong></div>
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
export function planning(data, s, ui) {
  const v = scope(data, s);
  const propertyItems = v.properties.map((p) => ({
    collection: "properties",
    label: "Fastighet",
    record: p,
    propertyId: p.id,
    title: p.address || p.designation || p.id,
    cost: 0,
  }));
  let items = propertyItems.concat(v.items);
  const missing = items.filter(
    (x) => !responsible(data, x.collection, x.record),
  );
  if (ui.unassigned) items = missing;
  const history = (data.auditLog || [])
    .filter((h) =>
      (h.fields || []).some((f) => f.field === "responsiblePersonId"),
    )
    .slice(-30)
    .reverse();
  return `<div class="section-title"><h2>Fördela och planera</h2><button data-unassigned class="${ui.unassigned ? "active" : ""}">${missing.length} utan ansvarig</button></div>${table(
    ["Uppgift", "Ansvarig hos oss", "År / period", "Kostnad", ""],
    items.map((x) =>
      row([
        `<strong>${esc(x.title)}</strong><small>${esc(propertyLabel(data, x.propertyId))} · ${esc(x.label)}</small>`,
        `<select aria-label="Ansvarig för ${esc(x.title)}" data-assign="${x.collection}" data-id="${esc(x.record.id)}">${options(
          internalPeople(data),
          (p) => p.id,
          (p) => p.name,
          responsible(data, x.collection, x.record),
          "Ej fördelat",
        )}</select>`,
        x.collection === "activities"
          ? `<small>${esc(x.record.planningYear || "År saknas")}</small><select aria-label="Kvartal för ${esc(x.title)}" data-quarter="activities" data-id="${esc(x.record.id)}">${options(
              [1, 2, 3, 4],
              (n) => n,
              (n) => "Kvartal " + n,
              x.record.planningQuarter,
              "Ej tidsatt",
            )}</select>`
          : "<small>Löpande fastighetsansvar</small>",
        money(x.cost),
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
  businessPartyId: "Verksamhet",
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
  unitId: "Område",
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
function reviewConflictCard(data, x) {
  const label = reviewRecordLabel(data, x);
  return `<section class="review review-conflict"><div class="review-main"><div class="review-heading"><div><strong>${esc(x.entity || (x.contractId ? "Avtal" : "Datakonflikt"))} · ${esc(importFieldLabel(x.field))}</strong>${label ? `<small class="review-context">${esc(label)}</small>` : ""}</div></div><div class="review-compare"><div class="review-value current"><span>Registrerat i Lokalblick</span><strong>${esc(reviewValue(data, x, x.current))}</strong><small>${esc(reviewCurrentSource(data, x))}</small></div><div class="review-value proposed"><span>Från importen</span><strong>${esc(reviewValue(data, x, x.proposed))}</strong><small>${esc(reviewIncomingSource(x))}</small></div></div></div><div class="actions review-actions"><button data-review="${esc(x.id)}" data-decision="reject">Behåll registrerat</button><button class="primary-action" data-review="${esc(x.id)}" data-decision="accept">Använd från filen</button></div></section>`;
}
function reviewStandardCard(data, x) {
  const title =
    x.kind === "match"
      ? "Avtalsmatchning"
      : x.kind === "record"
        ? "Import till " + (kinds[x.collection] || x.collection)
        : x.kind === "person"
          ? "Komplettera person"
          : x.kind === "activity-property"
            ? "Koppla aktivitet till fastighet"
            : x.kind === "property-match"
              ? "Kontrollera fastighetsmatchning"
              : x.field || x.kind;
  const detail = [
    x.personName,
    x.record?.name,
    x.record?.title,
    x.record?.number,
    x.record?.address,
    x.address,
    x.record?.use,
    x.message,
  ]
    .filter(Boolean)
    .join(" · ");
  const source = reviewIncomingSource(x);
  const propertySelect = ["record", "activity-property", "property-match"].includes(x.kind)
    ? `<label>Fastighet<select data-review-target="${esc(x.id)}">${options(
        data.properties,
        (p) => p.id,
        (p) => p.address || p.id,
        x.record?.propertyId || "",
        "Välj fastighet",
      )}</select></label>`
    : "";
  const contractSelect =
    x.kind === "match"
      ? `<label>Matcha till avtal<select data-review-target="${esc(x.id)}">${options(
          data.contracts,
          (c) => c.id,
          (c) =>
            (c.number || "Utan nummer") +
            " · " +
            propertyLabel(data, c.propertyId),
          "",
          "Välj befintligt avtal",
        )}</select></label>`
      : "";
  return `<section class="review"><div><strong>${esc(title)}</strong><small>${esc(source)}</small><p>${esc(detail)}</p></div><div class="actions">${propertySelect}${contractSelect}<button data-review="${esc(x.id)}" data-decision="accept">Godkänn</button><button data-review="${esc(x.id)}" data-decision="reject">Avvisa</button></div></section>`;
}
export function sources(data, transport) {
  const st = transport.status(),
    company = transport.company();
  const reviews = data.importReview.filter((x) => x.status === "pending");
  return `<div class="section-title"><h2>Datakällor och kvalitet</h2><button data-view="people">Personer och parter</button>${st.connected ? `<button data-source="refresh">Läs om</button>` : ""}</div><section class="detail"><strong>${esc(st.fileName || "Ingen arbetsfil ansluten")}</strong><p>${company ? "Läsning och sparande sker genom företagets lokala API. Källadaptrar konfigureras i backend." : st.sourceKind === "migration" ? "Källfilen är skrivskyddad. Läs in fler Excel-filer och skapa sedan Lokalblick-data." : "Excel är källunderlag. Lokalblick matchar och berikar sin egen datamodell utan att skapa parallella tabeller."}</p>${company ? "" : `<div class="actions"><button data-source="import">Läs in Excel</button><button data-source="connect">Anslut Lokalblick-data</button><button data-source="create">Skapa Lokalblick-data</button><button data-source="blank">Ny tom Lokalblick-data</button></div><p><small>Importen läser kända flikar automatiskt. Fastigheter och avtal byggs eller matchas först; därefter berikas de med fastighetsägare, verksamhet, ansvariga, ekonomi, aktiviteter, beställningar och KPI när uppgifterna finns.</small></p>`}</section>${table(
    ["Källa", "Flik(ar)", "Typ", "Rader", "Matchat", "Skapat", "Granska", "Importerad"],
    data.sourceRegistry.map((x) =>
      row([
        esc(x.name),
        esc(x.sheets || "–"),
        esc(sourceKindLabel(x.kind)),
        num(x.rows),
        num(x.matched || 0),
        num(x.created || 0),
        num(x.review || 0),
        esc(x.importedAt),
      ]),
    ),
  )}<div class="section-title review-title"><h3>Behöver granskas (${reviews.length})</h3><small>Välj vilket värde som ska gälla. Valet loggas i ändringshistoriken.</small></div>${
    reviews
      .map((x) =>
        x.kind === "conflict" || x.kind === "operational-conflict"
          ? reviewConflictCard(data, x)
          : reviewStandardCard(data, x),
      )
      .join("") || "<p>Inga öppna matchningar eller konflikter.</p>"
  }<details><summary>Ändringar som väntar på Excel (${st.pendingChanges?.length || 0})</summary>${table(
    ["Flik", "Post", "Ändring"],
    (st.pendingChanges || []).map((x) =>
      row([esc(x.sheet), esc(x.id), esc(x.action)]),
    ),
  )}</details>`;
}
export function organization(data) {
  return `<div class="section-title"><h2>Personer och parter</h2><div>${edit("people","","Lägg till person")}${edit("organizations","","Lägg till part")}</div></div>
  ${table(["Person","Befattning","Part",""],data.people.map((x)=>row([esc(x.name),esc(x.role),esc(data.organizations.find((o)=>o.id===x.organizationId)?.name||""),edit("people",x.id)])))}
  <h3>Parter</h3>
  ${table(["Part","Typ",""],data.organizations.map((x)=>row([esc(x.name),esc(x.type),edit("organizations",x.id)])))}`;
}
