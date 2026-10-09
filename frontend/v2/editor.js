import { esc, options, calc, units, propertyReference } from "./views.js";
import { clone } from "./model.js";
import { renderContractEditor } from "./contract-editor.js";
import { renderPropertyEditor } from "./property-editor.js";
const relations = {
  propertyId: ["properties", propertyReference],
  contractId: ["contracts", (x) => x.number || x.id],
  activityId: ["activities", (x) => x.title || x.id],
  organizationId: ["organizations", (x) => x.name],
  ownerPartyId: ["organizations", (x) => x.name],
  businessPartyId: ["organizations", (x) => x.name],
  personId: ["people", (x) => x.name],
  responsiblePersonId: ["people", (x) => x.name],
  ownerResponsiblePersonId: ["people", (x) => x.name],
  businessResponsiblePersonId: ["people", (x) => x.name],
  orderedByPersonId: ["people", (x) => x.name],
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
  /^(?:area|annual|baseRent|baseAdditions|rentBase|additionBase|rentIndexPercent|additionIndexPercent|employees|users|rooms|commonArea|apartmentArea|latitude|longitude|budgetYear|budgetInvestigation|budgetExecution|budgetFurnishing|cost|estimatedCost|preliminaryCost|finalCost|orderedCost|year|period|planningQuarter|planningMonth|actual|budget|allocation|noticePeriodMonths|renewalPeriodMonths|investmentThreshold|rentSurchargeRate)/;
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
  if (col === "contracts")
    return { record, html: renderContractEditor(data, record, id, company) };
  if (col === "properties")
    return { record, html: renderPropertyEditor(data, record, id, company) };
  const fieldLabels = {
    propertyId: "Fastighet",
    contractId: "Avtal",
    activityId: "Aktivitet",
    unitId: "Område",
    ownerPartyId: "Fastighetsägare",
    businessPartyId: "Verksamhetspart",
    organizationId: "Part",
    personId: "Person",
    responsiblePersonId: "Ansvarig hos oss",
    ownerResponsiblePersonId: "Fastighetsägarens kontaktperson",
    businessResponsiblePersonId: "Verksamhetsansvarig",
    orderedByPersonId: "Beställd av",
    start: "Avtalsstart",
    end: "Avtalsslut",
    moveInDate: "Inflyttning",
    moveOutDate: "Utflyttning",
    targetType: "Posttyp",
    targetId: "Post",
  };
  const fields = new Map(
    schema.columns
      .filter(([k]) => !generated.test(k) && !(col === "activities" && ["planningQuarter", "planningMonth", "budgetCategory"].includes(k)))
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
    fields.set("responsiblePersonId", col === "properties" ? "Vår kontaktperson" : "Ansvarig hos oss");
  const groups = new Map();
  fields.forEach((label, key) => {
    const g = group(key);
    if (!groups.has(g)) groups.set(g, []);
    let control;
    if (relations[key]) {
      const [collection, fn] = relations[key];
      let items=data[collection];
      if(key==="responsiblePersonId"||key==="orderedByPersonId")items=internalPeople(data);
      if(key==="ownerResponsiblePersonId"&&record.ownerPartyId)items=data.people.filter((p)=>p.organizationId===record.ownerPartyId);
      if(key==="businessResponsiblePersonId"&&record.businessPartyId)items=data.people.filter((p)=>p.organizationId===record.businessPartyId);
      control = `<select name="${key}">${options(items, (x) => x.id, fn, record[key], "Ej kopplad")}</select>`;
    } else if (key === "type" && col === "activities")
      control = `<select name="type">${options(
        ["Projekt", "Underhåll", "Drift", "Önskemål", "Utredning"],
        (x) => x,
        (x) => x,
        record.type,
        "Välj typ",
      )}</select>`;
    else if (key === "actionKind" && col === "activities")
      control = `<select name="actionKind">${options([
        {id:"",name:"Ej bedömd"},{id:"value_enhancing",name:"Värdehöjande"},
        {id:"like_for_like",name:"Utbyte 1:1"}
      ], x=>x.id,x=>x.name,record.actionKind || (record.standardEnhancing===true?"value_enhancing":record.standardEnhancing===false?"like_for_like":""), "Ej bedömd")}</select>`;
    else if (key === "investmentRule" && col === "organizations")
      control = `<select name="investmentRule">${options([
        {id:"",name:"Normalregel (½ prisbasbelopp)"},
        {id:"stadsfastigheter",name:"Stadsfastigheter – ägarinvestering"}
      ],x=>x.id,x=>x.name,record.investmentRule||"","Normalregel")}</select>`;
    else if (key === "category" && col === "activities") {
      const unique = [...new Map((data.activities || [])
        .map(a => String(a.category || "").trim())
        .filter(Boolean).concat(record.category ? [String(record.category).trim()] : [])
        .map(value => [value.toLocaleLowerCase("sv"), value])).values()];
      control = unique.length
        ? `<select name="category">${options(unique, x=>x, x=>x, record.category || "", "Välj kategori")}</select>`
        : `<input name="category" value="${esc(record.category || "")}" placeholder="Ange första kategorin">`;
    }
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
    else if (col === "contracts" && (key === "rentIndexPercent" || key === "additionIndexPercent")) {
      const existing = record[key] === "" || record[key] == null ? "" : Number(record[key]);
      const displayed = existing === "" || !Number.isFinite(existing)
        ? "" : (existing > 1 ? existing : existing * 100);
      control = `<input name="${key}" type="number" step="any" min="0" max="100" value="${esc(displayed)}" placeholder="0–100">`;
    }
    else if (key === "rentSurchargeStartDate")
      control = `<input name="${key}" type="date" value="${esc(record[key]||"")}">`;
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
  const economicYear=Number(record.planningYear) || new Date().getFullYear();
  const assessment = col==="activities" ? calc().activityEconomics(data,record,economicYear) : null;
  const economicSummary = !assessment ? "" :
    `<p class="computed">Ekonomisk klassificering ${economicYear}: <strong>${
      assessment.kind==="investment"?"Investering":assessment.kind==="operating"?"Drift":
      assessment.kind==="missing_base_amount"?"Prisbasbelopp saknas":"Åtgärd ej bedömd"
    }</strong> · Gräns: ${assessment.threshold==null?"saknas":Math.round(assessment.threshold).toLocaleString("sv-SE")+" kr"}${
      assessment.special?" · Stadsfastigheters regel":""}${
      assessment.rentFinanced?" · Beräknat hyrespåslag "+Math.round(assessment.annualRentAddition).toLocaleString("sv-SE")+" kr/år"+(assessment.rentStartDate?" från "+assessment.rentStartDate:" · startdatum saknas"):""
    }. Klassificeringen är beräknad, inte en kopia av importerad drift/investering.</p>`;
  return {
    record,
    html: `<div class="editor-backdrop"></div><aside class="editor" aria-labelledby="editor-title"><form id="edit-form" data-collection="${col}" data-record-id="${esc(id)}"><div class="section-title"><div><small>${id ? "ÄNDRA" : "NY POST"}</small><h2 id="editor-title">${esc(schema.sheet)}</h2></div><button type="button" data-editor-close>Stäng</button></div><nav class="tabs" aria-label="Redigeringssektioner">${[...groups.keys()].map((g, i) => `<button type="button" data-editor-tab="${g}" class="${i ? "" : "active"}">${g}</button>`).join("")}</nav>${[...groups].map(([g, controls], i) => `<section data-editor-section="${g}" ${i ? "hidden" : ""}><div class="form-grid">${controls.join("")}</div></section>`).join("")}${economicSummary}${company ? '<p class="computed">Mastervärden från INT/EXT ändras i underlaget. Kompletteringar sparas i backend.</p>' : ""}${result ? `<p class="computed">Beräknat för ${new Date().getFullYear()}: hyra ${Math.round(result.rent.amount)} kr · ${esc(result.rent.status)}. Tillägg ${Math.round(result.addition.amount)} kr · ${esc(result.addition.status)}.</p>` : ""}<div class="actions editor-actions"><span>Ändringar sparas via aktiv datakoppling.</span><button type="submit" class="primary">Spara ändring</button></div></form></aside>`,
  };
}
export function readEditor(form, record) {
  const out = clone(record);
  const submitted = new Set();
  new FormData(form).forEach((value, key) => {
    submitted.add(key);
    out[key] = numeric.test(key) && value !== "" ? Number(value) : value;
    // Editor explicitly shows percentage points (80 means 80 %);
    // canonical model stores the share as 0.80.
    if ((key === "rentIndexPercent" || key === "additionIndexPercent") && value !== "")
      out[key] = Number(value) / 100;
  });
  // On the first edit of an old contract, migrate its legacy Media amount
  // into the visible Tillägg field and explicitly zero the duplicate alias.
  // Do not alter imported contracts that the user has not edited.
  if (form.dataset?.collection === "contracts" && submitted.has("baseAdditions") &&
      Number(record.annualContractDrift) > 0 && !(Number(record.baseAdditions) > 0)) {
    if (out.additionIndexPercent === "" || out.additionIndexPercent == null)
      out.additionIndexPercent = 0;
    // A 0% non-indexed annual addition is safe to migrate immediately.
    // Keep the old source as fallback if a new indexed base needs verification.
    if (Number(out.additionIndexPercent) === 0)
      out.annualContractDrift = 0;
  }
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
    throw Error("Avtalsslut är före avtalsstart");
  if (out.moveInDate && out.moveOutDate && out.moveOutDate < out.moveInDate)
    throw Error("Utflyttning är före inflyttning");
  return out;
}
