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
export function filters(data, s) {
  const owners = new Map();
  data.contracts.forEach((c) => {
    const p = data.properties.find((x) => x.id === c.propertyId) || {};
    const id = c.ownerOrgId || p.owner;
    if (id)
      owners.set(
        id,
        data.organizations.find((x) => x.id === id)?.name || p.owner || id,
      );
  });
  data.properties.forEach((p) => {
    if (p.owner) owners.set(p.owner, p.owner);
  });
  return `<div class="filters"><label>Ansvarig<select data-filter="person">${options(
    data.people,
    (x) => x.id,
    (x) => x.name,
    s.person,
    "Alla ansvariga",
  )}</select></label><label>Organisation<select data-filter="unit">${options(
    Object.entries(units),
    (x) => x[0],
    (x) => x[1],
    s.unit,
    "Alla organisationer",
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
export function summary(data, s, year) {
  const view = scope(data, s),
    rows = calc().budgetRows(data, year, view.contracts, view.properties),
    tot = calc().summarize(rows);
  return `<div class="summary">${[
    ["Avtal", view.contracts.length + " st"],
    ["Hyra + drift", money(tot["Hyra + drift"])],
    ["Projekt", money(tot.Projekt)],
    ["Löpande", money((tot.Underhåll || 0) + (tot.Driftkostnader || 0))],
  ]
    .map(
      ([label, value]) =>
        `<div><span>${label}</span><strong>${value}</strong></div>`,
    )
    .join("")}</div>`;
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
      ["Fastighet", "Avtal", "Area", "Årskostnad", ""],
      v.properties.map((p) => {
        const cs = v.contracts.filter((c) => c.propertyId === p.id);
        return row([
          `<button class="text-button" data-property="${esc(p.id)}">${esc(p.address || p.designation || p.id)}</button><small>${esc(p.owner || "")}</small>`,
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
        v.items.filter(
          (x) =>
            x.label === ui.perspective ||
            (ui.perspective === "Underhåll" && x.label === "Status"),
        ),
      ),
    );
  return `<div class="section-title"><h2>${esc(title)}</h2>${s.propertyId ? "<button data-clear-property>Visa hela urvalet</button>" : ""}</div><div class="tabs">${tabs.map((x) => `<button data-perspective="${x}" class="${ui.perspective === x ? "active" : ""}">${x}</button>`).join("")}</div>${body}${ui.contractId ? contractDetail(data, ui.contractId, ui.year) : ""}`;
}
export function contractDetail(data, id, year) {
  const c = data.contracts.find((x) => x.id === id);
  if (!c) return "";
  const v = calc().annualValues(c, year, 0, data.indexSeries),
    doc = globalThis.LokalblickDocuments.resolve(
      globalThis.LokalblickDocuments.fromContract(c),
      globalThis.LokalblickContractDocumentCache,
    );
  return `<section class="detail"><div class="section-title"><h2>Avtal ${esc(c.number || c.id)}</h2><button data-close-contract>Stäng detalj</button></div><div class="detail-grid"><div><small>Verksamhet</small><strong>${esc(c.use || "–")}</strong></div><div><small>Hyra ${year} · ${esc(v.rent.status)}</small><strong>${money(v.rent.amount)}</strong></div><div><small>Tillägg · ${esc(v.addition.status)}</small><strong>${money(v.addition.amount)}</strong></div><div><small>Hyra kr/kvm</small><strong>${c.area > 0 ? num(v.rent.amount / c.area) : "–"}</strong></div></div><p>${esc(v.rent.basedOn.join(" · ") || v.rent.source)}${v.rent.reason ? " · " + esc(v.rent.reason) : ""}</p><p>${doc.status === "ready" ? `<a href="${esc(doc.href)}" target="_blank" rel="noopener noreferrer">${esc(doc.label)}</a>` : esc(doc.label)} <small>${esc(doc.name)}</small></p><details><summary>Värdenas ursprung</summary>${table(
    ["Fält", "Värde", "Källa", "Rad"],
    Object.entries(c.provenance || {}).map(([field, p]) =>
      row([esc(field), esc(p.value), esc(p.source), esc(p.row)]),
    ),
  )}</details>${edit("contracts", c.id, "Ändra avtal")}</section>`;
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
  return `<div class="section-title"><h2>Fördela och planera</h2><button data-unassigned class="${ui.unassigned ? "active" : ""}">${missing.length} utan ansvarig</button></div>${table(
    ["Uppgift", "Ansvarig", "År / period", "Kostnad", ""],
    items.map((x) =>
      row([
        `<strong>${esc(x.title)}</strong><small>${esc(propertyLabel(data, x.propertyId))} · ${esc(x.label)}</small>`,
        `<select aria-label="Ansvarig för ${esc(x.title)}" data-assign="${x.collection}" data-id="${esc(x.record.id)}">${options(
          data.people,
          (p) => p.id,
          (p) => p.name,
          responsible(data, x.collection, x.record),
          "Ej fördelat",
        )}</select>`,
        `<small>${esc(x.record.year || x.record.budgetYear || x.record.period || "År saknas")}</small><select aria-label="Kvartal för ${esc(x.title)}" data-quarter="${x.collection}" data-id="${esc(x.record.id)}">${options(
          [1, 2, 3, 4],
          (n) => n,
          (n) => "Kvartal " + n,
          x.record.planningQuarter,
          "Ej tidsatt",
        )}</select>`,
        money(x.cost),
        `${edit(x.collection, x.record.id)}${x.collection === "wishes" ? `<button data-move="maintenance" data-id="${esc(x.record.id)}">Till UH</button><button data-move="driftIssues" data-id="${esc(x.record.id)}">Till drift</button>` : ""}`,
      ]),
    ),
  )}<details><summary>Ansvarsändringar (${data.assignmentChanges.length})</summary>${table(
    ["Tid", "Post", "Från → till", "Av"],
    data.assignmentChanges
      .slice(-30)
      .reverse()
      .map((x) =>
        row([
          esc(x.changedAt),
          esc(x.targetId),
          esc(personLabel(data, x.fromPersonId)) +
            " → " +
            esc(personLabel(data, x.toPersonId)),
          esc(x.changedBy),
        ]),
      ),
  )}</details>`;
}
export const categories = [
  "Hyra + drift",
  "Underhåll",
  "Projekt",
  "Driftkostnader",
  "Utredningar",
];
export function budget(data, s, ui) {
  const scoped = Boolean(s.propertyId || s.unit || s.owner || s.person || s.q),
    view = scope(data, s),
    plan = data.budgetPlans.find((x) => Number(x.year) === ui.year),
    locked = plan?.status === "Låst";
  const rows = calc().budgetRows(
      data,
      ui.year,
      view.contracts,
      view.properties,
    ),
    forecast = calc().summarize(rows),
    actual = calc().summarize(calc().actualRows(data, ui.year, view.contracts)),
    baseline = calc().summarize(
      plan
        ? plan.lines.filter(
            (x) =>
              !scoped ||
              view.contracts.some((c) =>
                x.contractId
                  ? c.id === x.contractId
                  : c.propertyId === x.propertyId,
              ),
          )
        : rows,
    );
  const total = categories.reduce(
    (sum, k) =>
      sum +
      (scoped
        ? baseline[k] || 0
        : Number(plan?.targets?.[k] ?? baseline[k] ?? 0)),
    0,
  );
  return `<div class="section-title"><h2>Budget ${ui.year} ${badge(locked ? "Låst baslinje" : plan ? "Arbetsbudget" : "Ej skapad")}</h2><label>År<input data-year type="number" min="2000" max="2200" value="${ui.year}"></label></div><div class="budget-controls"><label>Preliminärt oktoberindex ${ui.year - 1}<input type="number" min="0" step="0.01" data-preliminary value="${Number(plan?.preliminaryIndex) || 0}" ${locked || !plan ? "disabled" : ""}></label><span>Känt oktoberindex används först. Index måste ha samma KPI-bas som bastalet.</span>${!plan ? "<button data-budget-create>Skapa budget</button>" : !locked && !scoped ? "<button data-budget-lock>Lås budget</button>" : ""}</div><p>Årsbudget <strong>${money(total)}</strong> · prognos <strong>${money(rows.reduce((s, x) => s + x.amount, 0))}</strong>${scoped ? " · Justeringar beslutas för hela portföljen." : ""}</p>${table(
    ["Kategori", "Underlag", "Justering", "Årsbudget", "Prognos", "Utfall"],
    categories.map((k) => {
      const base = baseline[k] || 0,
        target = scoped ? base : Number(plan?.targets?.[k] ?? base);
      return row([
        `<details><summary>${k}</summary>${rows
          .filter((x) => x.category === k)
          .map(
            (x) =>
              `<p>${esc(x.source)} <strong>${money(x.amount)}</strong> ${badge(x.status)}</p>`,
          )
          .join("")}</details>`,
        money(base),
        plan && !locked && !scoped
          ? `<input aria-label="Justering ${k}" data-adjust="${k}" type="number" value="${target - base}">`
          : money(target - base),
        money(target),
        money(forecast[k]),
        money(actual[k]),
      ]);
    }),
  )}<p>Utfall registreras på aktiviteter och drift. Låst budget förändras inte när underlaget ändras.</p>`;
}
export function sources(data, transport) {
  const st = transport.status(),
    company = transport.company();
  const reviews = data.importReview.filter((x) => x.status === "pending");
  return `<div class="section-title"><h2>Datakällor och kvalitet</h2><button data-view="people">Personer och organisationer</button>${st.connected ? `<button data-source="refresh">Läs om</button>` : ""}</div><section class="detail"><strong>${esc(st.fileName || "Ingen arbetsfil ansluten")}</strong><p>${company ? "Läsning och sparande sker genom företagets lokala API. Källadaptrar konfigureras i backend." : st.sourceKind === "migration" ? "Read-only underlag. Skapa Lokalblick-data innan du ändrar eller berikar." : "Källunderlag läses. Godkända ändringar sparas i Lokalblick-data."}</p>${company ? "" : `<div class="actions"><button data-source="connect">Anslut arbetsfil / INT–EXT</button><button data-source="create">Skapa Lokalblick-data</button><button data-source="blank">Ny tom arbetsfil</button><button data-source="enrich" ${!st.connected || st.sourceKind === "migration" ? "disabled" : ""}>Berika avtal</button><button data-source="index" ${!st.connected || st.sourceKind === "migration" ? "disabled" : ""}>Läs KPI</button><label>Kompletterande lista<select id="supplement-kind"><option value="projects">Projekt</option><option value="maintenance">Underhåll</option><option value="driftIssues">Driftärenden</option><option value="wishes">Önskemål</option><option value="operations">Driftbudget / utfall</option></select></label><button data-source="supplement" ${!st.connected || st.sourceKind === "migration" ? "disabled" : ""}>Läs lista</button></div>`}</section>${table(
    ["Källa", "Typ", "Poster", "Importerad"],
    data.sourceRegistry.map((x) =>
      row([esc(x.name), esc(x.kind), num(x.rows), esc(x.importedAt)]),
    ),
  )}<h3>Behöver granskas (${reviews.length})</h3>${
    reviews
      .map(
        (x) =>
          `<section class="review"><div><strong>${esc(x.kind === "match" ? "Avtalsmatchning" : x.kind === "record" ? "Import till " + (kinds[x.collection] || x.collection) : x.field)}</strong><small>${esc(x.source)} · rad ${esc(x.row)}</small><p>${x.kind === "conflict" ? `${esc(x.current)} → ${esc(x.proposed)}` : esc([x.record?.name, x.record?.title, x.record?.number, x.record?.address, x.address, x.record?.use].filter(Boolean).join(" · "))}</p></div><div class="actions">${
            x.kind === "record"
              ? `<label>Fastighet<select data-review-target="${esc(x.id)}">${options(
                  data.properties,
                  (p) => p.id,
                  (p) => p.address || p.id,
                  x.record?.propertyId || "",
                  "Välj fastighet",
                )}</select></label>`
              : ""
          }${
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
              : ""
          }<button data-review="${esc(x.id)}" data-decision="accept">Godkänn</button><button data-review="${esc(x.id)}" data-decision="reject">Behåll nuvarande</button></div></section>`,
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
  return `<div class="section-title"><h2>Personer och organisationer</h2><div>${edit("people", "", "Lägg till person")}${edit("organizations", "", "Lägg till organisation")}</div></div>${table(
    ["Person", "Roll", "Organisation", ""],
    data.people.map((x) =>
      row([
        esc(x.name),
        esc(x.role),
        esc(
          data.organizations.find((o) => o.id === x.organizationId)?.name || "",
        ),
        edit("people", x.id),
      ]),
    ),
  )}${table(
    ["Organisation", "Typ", ""],
    data.organizations.map((x) =>
      row([esc(x.name), esc(x.type), edit("organizations", x.id)]),
    ),
  )}`;
}
