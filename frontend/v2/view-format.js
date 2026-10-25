// Shared presentation helpers; no state, persistence or event handling.
import {visibleNumber,isInternalIdentifier} from '../lokaler/business-identities.js';
export {visibleNumber,isInternalIdentifier};
export const objectLabel=object=>visibleNumber(object?.number||object?.id,'Objektnummer saknas');
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
export const edit = (col, id, label = "Ändra") =>
  `<button data-edit="${esc(col)}" data-id="${esc(id)}">${label}</button>`;
export const table = (head, rows, interactive = false, heading = "", grouped = false, presentation = {}) => {
  const portfolio=Boolean(presentation.key),noun=presentation.noun||'poster';
  const empty = `<tr${portfolio&&!grouped?` data-table-empty${rows.length?' hidden':''}`:''}><td colspan="${head.length}" class="empty">Inga ${portfolio?noun:grouped?'fastigheter':'poster'} i aktuellt urval.</td></tr>`;
  const bodies = grouped ? rows.join("") + `<tbody data-table-empty${rows.length ? " hidden" : ""}>${empty}</tbody>` : `<tbody>${rows.length?rows.join('')+(portfolio?empty:''):empty}</tbody>`;
  return `<div class="table-wrap${interactive?" compact-data-table":""}${grouped?(presentation.groupClass?" "+esc(presentation.groupClass):" property-list"):""}${portfolio?' portfolio-list':''}">${interactive?`<div class="compact-table-heading"><strong>${esc(heading)}</strong><span${grouped||portfolio?' data-table-count aria-live="polite"':''}>${rows.length} ${portfolio?noun:grouped?"fastigheter":"poster"}</span><button type="button" data-toggle-column-filters aria-label="Visa kolumnfilter" title="Visa kolumnfilter"${grouped||portfolio?' aria-expanded="false"':''}>${grouped||portfolio?"Kolumnfilter":"⚑"}</button></div>`:""}<table${interactive?' data-smart-table="1"':''}${portfolio?` data-list-key="${esc(presentation.key)}" data-table-noun="${esc(noun)}"`:''}${grouped?` data-row-groups aria-label="${esc(portfolio?noun:'Fastigheter')}"`:''}><thead><tr>${head.map((x,i) => `<th scope="col">${interactive && x ? `<button type="button" class="column-sort" data-column-sort="${i}" aria-label="Sortera på ${esc(x)}">${esc(x)} <span aria-hidden="true">↕</span></button>` : x}</th>`).join("")}</tr>${interactive?`<tr class="column-filters" hidden>${head.map((x,i)=>`<th${grouped||portfolio?` data-label="${esc(x)}"`:""}>${x && i<head.length-1 ? `<input type="search" data-column-filter="${i}" aria-label="Filtrera ${esc(x)}" placeholder="Filtrera" autocomplete="off">`:""}</th>`).join("")}</tr>`:""}</thead>${bodies}</table></div>`;
};
export const row = (cells,sortValues={}) =>
  `<tr>${cells.map((x, i) => `<td${i === 0 ? ' class="primary-cell"' : i===cells.length-1 ? ' class="row-actions"' : ""}${Object.hasOwn(sortValues,i)?` data-sort-value="${esc(sortValues[i])}"`:''}>${x}</td>`).join("")}</tr>`;
export const badge = (x) =>
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
export const organizationLabel = (data, id) =>
  data.organizations.find((x) => x.id === id)?.name || (id?visibleNumber(id,'Part saknas'):'');
export const propertyOwnerLabel = (data, property) =>
  organizationLabel(data, property?.ownerPartyId);
export const propertyDesignation = property => {
  const designation = String(property?.designation || "").trim();
  const key = value => String(value || "").normalize("NFKC").trim()
    .replace(/\s+/g, " ").replace(/(\d)\s+([a-zåäö])(?=$|[\s,.])/gi, "$1$2")
    .toLocaleLowerCase("sv");
  // An imported address fallback is not evidence of a designation.
  return designation==='Fastighetsbeteckning saknas'||isInternalIdentifier(designation)||key(designation) === key(property?.address) ? "" : designation;
};
export const propertyAddress = property => String(property?.address || "").trim();
export const propertyReference = property => property
  ? [propertyDesignation(property) || "Beteckning saknas", propertyAddress(property)].filter(Boolean).join(" · ")
  : "Ej kopplad";
export const propertyById = (data, id) => (data.properties || []).find(p => p.id === id);
export const propertyLabel = (data, id) => propertyReference(propertyById(data, id));
export const propertyAddressCell = property => property?.id && propertyAddress(property)
  ? `<button class="text-button" data-property="${esc(property.id)}">${esc(propertyAddress(property))}</button>`
  : "–";
export const personLabel = (data, id) =>
  data.people.find((x) => x.id === id)?.name || "Ej fördelat";
export const internalPeople = (data) =>
  data.people.filter((person) => {
    if (!person.organizationId) return true;
    return (
      data.organizations.find((org) => org.id === person.organizationId)?.type ===
      "our"
    );
  });
export const indexFormat = v => new Intl.NumberFormat("sv-SE", {maximumFractionDigits:4}).format(Number(v)||0);
export const categories = [
  "Hyra + drift",
  "Underhåll",
  "Projekt",
  "Driftkostnader",
  "Utredningar",
];
