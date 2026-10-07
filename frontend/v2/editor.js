import { esc, options, calc, units } from "./views.js";
import { clone } from "./model.js";
const relations = {
  propertyId: ["properties", (x) => x.address || x.id],
  contractId: ["contracts", (x) => x.number || x.id],
  organizationId: ["organizations", (x) => x.name],
  ownerOrgId: ["organizations", (x) => x.name],
  tenantOrgId: ["organizations", (x) => x.name],
  personId: ["people", (x) => x.name],
  responsiblePersonId: ["people", (x) => x.name],
};
const internalPeople = (data) =>
  data.people.filter((person) => {
    if (!person.organizationId) return true;
    return (
      data.organizations.find((org) => org.id === person.organizationId)?.type ===
      "our"
    );
  });
const generated =
  /^(?:id|sourceId|sourceSheet|sourceRow|enrichment|derived|calculated|rentPerSqm|rentCalculation|additionCalculation|rentIndexCurrent|additionIndexCurrent|rentIndexYear|additionIndexYear|provenance|createdAt|createdBy|updatedAt|updatedBy)/;
const numeric =
  /^(?:area|annual|baseRent|baseAdditions|rentBase|additionBase|rentIndexPercent|additionIndexPercent|employees|users|rooms|commonArea|apartmentArea|latitude|longitude|budgetYear|budgetInvestigation|budgetExecution|budgetFurnishing|cost|estimatedCost|preliminaryCost|finalCost|orderedCost|year|period|planningQuarter|planningMonth|actual|budget|allocation|noticePeriodMonths|renewalPeriodMonths)/;
const group = (key) =>
  /^media/.test(key)
    ? "Media"
    : /^(employees|users|rooms|commonArea|apartmentArea)$/.test(key)
      ? "Verksamhet"
      : /Document/.test(key)
        ? "Dokument"
        : /Base|IndexPercent/.test(key)
          ? "Index"
          : /annual|baseRent|baseAdditions|budget|cost|Cost|actual/.test(key)
            ? "Ekonomi"
            : /personId|responsible|OrgId|unitId|organizationId|allocation/.test(
                  key,
                )
              ? "Relationer"
              : /start|end|Date|planning|year|period|moveIn|notice|Term|At|paid/.test(
                    key,
                  )
                ? "Tidplan"
                : "Uppgifter";
export function editorHtml(data, col, id, company = false, defaults = {}) {
  const schema = window.LokalblickSourceService.schemas.find(
    (s) => s.key === col,
  );
  if (!schema) throw Error("Denna posttyp saknar editor");
  const record = Object.assign(clone(data[col].find((x) => x.id === id) || {}), defaults || {});
  const fieldLabels = {
    propertyId: "Fastighet",
    contractId: "Avtal",
    unitId: "Organisation",
    ownerOrgId: "Fastighetsägare",
    tenantOrgId: "Hyresgäst",
    organizationId: "Organisation",
    personId: "Person",
    responsiblePersonId: "Ansvarig hos oss",
    targetType: "Posttyp",
    targetId: "Post",
  };
  const fields = new Map(
    schema.columns
      .filter(([k]) => !generated.test(k))
      .map(([key, label]) => [
        key,
        fieldLabels[key] || label.replace(/^_/, ""),
      ]),
  );
  Object.keys(relations)
    .filter((k) => record[k] != null)
    .forEach((k) => {
      if (!fields.has(k))
        fields.set(k, k === "responsiblePersonId" ? "Ansvarig" : k);
    });
  if (["properties", "activities"].includes(col))
    fields.set("responsiblePersonId", "Ansvarig hos oss");
  const groups = new Map();
  fields.forEach((label, key) => {
    const g = group(key);
    if (!groups.has(g)) groups.set(g, []);
    let control;
    if (relations[key]) {
      const [collection, fn] = relations[key];
      const items =
        key === "responsiblePersonId" ? internalPeople(data) : data[collection];
      control = `<select name="${key}">${options(items, (x) => x.id, fn, record[key], "Ej kopplad")}</select>`;
    } else if (key === "type" && col === "activities")
      control = `<select name="type">${options(
        ["Projekt", "Underhåll", "Drift", "Önskemål", "Utredning"],
        (x) => x,
        (x) => x,
        record.type,
        "Välj typ",
      )}</select>`;
    else if (key === "includeInBudget" && col === "activities")
      control = `<select name="includeInBudget">${options(
        ["Ja", "Nej"],
        (x) => x,
        (x) => x,
        record.includeInBudget || "Ja",
        "Välj",
      )}</select>`;
    else if (key === "targetType" && col === "contacts")
      control = `<select name="targetType">${options(
        ["property", "contract"],
        (x) => x,
        (x) => (x === "property" ? "Fastighet" : "Avtal"),
        record.targetType,
        "Välj måltyp",
      )}</select>`;
    else if (key === "unitId")
      control = `<select name="${key}">${options(
        Object.entries(units),
        (x) => x[0],
        (x) => x[1],
        record[key],
        "Ej vald",
      )}</select>`;
    else {
      const type = numeric.test(key)
        ? "number"
        : /^(start|end|moveIn|.*Date|fromDate|toDate|paidAt|orderedAt|completedAt)$/.test(
              key,
            )
          ? "date"
          : "text";
      control = `<input name="${key}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(record[key])}">`;
    }
    const master =
      col === "contracts"
        ? [
            "number",
            "source",
            "propertyId",
            ...(company ? ["area", "category", "use"] : []),
          ]
        : col === "properties" && company
          ? ["type", "designation", "address", "owner", "manager"]
          : [];
    if (!data.isDemo && id && master.includes(key))
      control = control.replace(/<(input|select) /, "<$1 disabled ");
    groups.get(g).push(`<label>${esc(label)}${control}</label>`);
  });
  const result =
    col === "contracts"
      ? calc().annualValues(
          record,
          new Date().getFullYear(),
          0,
          data.indexSeries,
        )
      : null;
  return {
    record,
    html: `<div class="editor-backdrop"></div><aside class="editor" aria-labelledby="editor-title"><form id="edit-form" data-collection="${col}" data-record-id="${esc(id)}"><div class="section-title"><div><small>${id ? "ÄNDRA" : "NY POST"}</small><h2 id="editor-title">${esc(schema.sheet)}</h2></div><button type="button" data-editor-close>Stäng</button></div><nav class="tabs" aria-label="Redigeringssektioner">${[...groups.keys()].map((g, i) => `<button type="button" data-editor-tab="${g}" class="${i ? "" : "active"}">${g}</button>`).join("")}</nav>${[...groups].map(([g, controls], i) => `<section data-editor-section="${g}" ${i ? "hidden" : ""}><div class="form-grid">${controls.join("")}</div></section>`).join("")}${company ? '<p class="computed">Mastervärden från INT/EXT ändras i underlaget. Kompletteringar sparas i backend.</p>' : ""}${result ? `<p class="computed">Beräknat för ${new Date().getFullYear()}: hyra ${Math.round(result.rent.amount)} kr · ${esc(result.rent.status)}. Tillägg ${Math.round(result.addition.amount)} kr · ${esc(result.addition.status)}.</p>` : ""}<div class="actions editor-actions"><span>Ändringar sparas via aktiv datakoppling.</span><button type="submit" class="primary">Spara ändring</button></div></form></aside>`,
  };
}
export function readEditor(form, record) {
  const out = clone(record);
  new FormData(form).forEach((value, key) => {
    out[key] = numeric.test(key) && value !== "" ? Number(value) : value;
  });
  if (Number(out.planningMonth)) {
    if (out.planningMonth < 1 || out.planningMonth > 12)
      throw Error("Månad måste vara 1–12");
    out.planningQuarter = Math.ceil(out.planningMonth / 3);
  }
  if (
    out.planningQuarter !== "" &&
    out.planningQuarter != null &&
    (out.planningQuarter < 1 || out.planningQuarter > 4)
  )
    throw Error("Kvartal måste vara 1–4");
  if (out.area != null && Number(out.area) < 0)
    throw Error("Area får inte vara negativ");
  for (const key of ["rentIndexPercent", "additionIndexPercent"])
    if (
      out[key] !== "" &&
      out[key] != null &&
      (Number(out[key]) < 0 || Number(out[key]) > 1)
    )
      throw Error("Indexandel anges mellan 0 och 1");
  if (out.start && out.end && out.end < out.start)
    throw Error("Slutdatum är före startdatum");
  return out;
}
