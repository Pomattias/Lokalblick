const ORG_UNITS = [
  { id: "VARDBO", name: "VÅRDBO" },
  { id: "ORDBO", name: "ORDBO" },
  { id: "MYND_STAB", name: "Myndighet / Stab" },
  { id: "HOF", name: "Hälsa & Förebyggande" }
];

const MAINTENANCE_STATUS_CATEGORIES = [
  "Ytskick", "Utrustning", "Möbler", "Passage", "Inbrottslarm",
  "Brandlarm", "Brandskydd", "Utrymning", "Kök", "Installationer", "Övrigt"
];
const WISH_CATEGORIES = [
  "Lokal", "Arbetsmiljö", "Verksamhetsanpassning", "Utrustning", "Möbler",
  "Passage / säkerhet", "Brand / utrymning", "Teknik", "Tillgänglighet", "Övrigt"
];
const DRIFT_ISSUE_CATEGORIES = [
  "El", "Värme", "Ventilation", "Vatten", "Larm", "Passage", "Brand",
  "Skada", "Städ", "Service", "Övrigt"
];

const demo = window.LokalblickDemoData;

const views = [
  { id: "dashboard", label: "Översikt", icon: "◫", eyebrow: "PORTFÖLJ" },
  { id: "properties", label: "Fastigheter", icon: "▦", eyebrow: "LEB · FASTIGHET" },
  { id: "contracts", label: "Objekt / avtal", icon: "≣", eyebrow: "LEB · OBJEKT = AVTAL" },
  { id: "budget", label: "Årsbudget", icon: "¤", eyebrow: "EKONOMI" },
  { id: "portfolio", label: "Projekt & behov", icon: "◇", eyebrow: "ÅTGÄRDER" },
  { id: "organisation", label: "Organisation", icon: "◎", eyebrow: "PERSONER & ANSVAR" }
];

let state = clone(demo);
let currentView = "dashboard";
let selectedBudgetYear = new Date().getFullYear() + 1;
let editorType = null;

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function ensureShape(data) {
  const base = clone(demo);
  return Object.assign(base, data || {}, {
    properties: (data && data.properties) || [],
    contracts: (data && data.contracts) || [],
    organizations: (data && data.organizations) || [],
    people: (data && data.people) || [],
    assignments: (data && data.assignments) || [],
    projects: (data && data.projects) || [],
    maintenance: (data && data.maintenance) || [],
    operations: (data && data.operations) || [],
    investigations: (data && data.investigations) || [],
    maintenanceStatus: (data && data.maintenanceStatus) || [],
    driftIssues: (data && data.driftIssues) || [],
    wishes: (data && data.wishes) || []
  });
}
async function loadState() {
  state = ensureShape(await window.LokalblickDataService.load());
  return state;
}
async function saveState() {
  state = ensureShape(await window.LokalblickDataService.save(state));
  return state;
}
function money(n) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Number(n) || 0) + " kr"; }
function num(n) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(Number(n) || 0); }
function percent(n) { return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(Number(n) || 0) + " %"; }
function esc(v) {
  return String(v == null ? "" : v).replace(/[&<>'"]/g, function(ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch];
  });
}
function unitName(id) {
  const u = ORG_UNITS.find(function(x) { return x.id === id; });
  return u ? u.name : "Ej satt";
}
function orgName(id) {
  const o = state.organizations.find(function(x) { return x.id === id; });
  return o ? o.name : "Ej satt";
}
function orgType(id) {
  const o = state.organizations.find(function(x) { return x.id === id; });
  if (!o) return "Ej satt";
  if (o.type === "our") return "Vår organisation";
  if (o.type === "tenant") return "Hyresgästen";
  return "Fastighetsägare" + (o.ownerClass ? " · " + o.ownerClass : "");
}
function propertyName(id) {
  const p = state.properties.find(function(x) { return x.id === id; });
  return p ? p.id + " · " + (p.address || "Adress saknas") : id;
}
function contractName(id) {
  const c = state.contracts.find(function(x) { return x.id === id; });
  return c ? (c.number || c.id) + " · " + propertyName(c.propertyId).split(" · ").slice(1).join(" · ") : id;
}
function projectName(id) {
  const p = state.projects.find(function(x) { return x.id === id; });
  return p ? p.name : id;
}
function personName(id) {
  const p = state.people.find(function(x) { return x.id === id; });
  return p ? p.name : "Ej tilldelad";
}
function targetName(type, id) {
  if (type === "property") return propertyName(id);
  if (type === "object") return contractName(id);
  if (type === "project") return projectName(id);
  if (type === "driftIssue") {
    const x = state.driftIssues.find(function(r) { return r.id === id; });
    return x ? x.title : id;
  }
  if (type === "wish") {
    const x = state.wishes.find(function(r) { return r.id === id; });
    return x ? x.title : id;
  }
  if (type === "maintenanceStatus") {
    const x = state.maintenanceStatus.find(function(r) { return r.id === id; });
    return x ? x.category + " · " + contractName(x.contractId) : id;
  }
  return id;
}
function personLoad(personId) {
  const today = new Date().toISOString().slice(0, 10);
  return state.assignments.filter(function(a) {
    return a.personId === personId && (!a.toDate || a.toDate >= today);
  }).reduce(function(sum, a) {
    return sum + (Number(a.allocation) || 0);
  }, 0);
}
function totalContractCost(c) {
  return (Number(c.annualRent) || 0) + (Number(c.annualContractDrift) || 0);
}
function projectBudgetTotal(p) {
  return (Number(p.budgetInvestigation) || 0) + (Number(p.budgetExecution) || 0) + (Number(p.budgetFurnishing) || 0);
}
function activeInYear(c, year) {
  const start = c.start ? new Date(c.start) : null;
  const end = c.end ? new Date(c.end) : null;
  const from = new Date(String(year) + "-01-01T00:00:00");
  const to = new Date(String(year) + "-12-31T23:59:59");
  return (!start || start <= to) && (!end || end >= from);
}
function contractYearFactor(c, year) {
  if (!activeInYear(c, year)) return 0;
  const yearStart = new Date(String(year) + "-01-01T00:00:00");
  const nextYear = new Date(String(Number(year) + 1) + "-01-01T00:00:00");
  const contractStart = c.start ? new Date(c.start + "T00:00:00") : yearStart;
  const contractEndExclusive = c.end ? new Date(new Date(c.end + "T00:00:00").getTime() + 86400000) : nextYear;
  const start = contractStart > yearStart ? contractStart : yearStart;
  const end = contractEndExclusive < nextYear ? contractEndExclusive : nextYear;
  const covered = Math.max(0, end - start);
  const yearMs = nextYear - yearStart;
  return yearMs ? covered / yearMs : 0;
}
function statusBadge(status) {
  const s = String(status || "");
  let cls = "";
  if (/pågår|aktiv|klar/i.test(s)) cls = "green";
  else if (/risk|sen|hög/i.test(s)) cls = "red";
  else if (/plan|förstudie|identifierad|utred/i.test(s)) cls = "amber";
  return '<span class="badge ' + cls + '">' + esc(s || "–") + "</span>";
}
function table(headers, rows) {
  if (!rows.length) return '<div class="empty">Ingen data ännu.</div>';
  return '<div class="table-wrap"><table><thead><tr>' +
    headers.map(function(h) { return "<th>" + h + "</th>"; }).join("") +
    "</tr></thead><tbody>" + rows.join("") + "</tbody></table></div>";
}
function kpi(label, value, foot) {
  return '<div class="card kpi"><div class="kpi-label">' + label + '</div><div class="kpi-value">' +
    value + '</div><div class="kpi-foot">' + (foot || "") + "</div></div>";
}
function card(title, subtitle, body, action) {
  return '<section class="card pad"><div class="card-head"><div><h2>' + title + "</h2>" +
    (subtitle ? "<p>" + subtitle + "</p>" : "") + "</div>" + (action || "") + "</div>" + body + "</section>";
}

function budgetRows(year) {
  const rows = [];
  state.contracts.filter(function(c) { return activeInYear(c, year); }).forEach(function(c) {
    const factor = contractYearFactor(c, year);
    const amount = totalContractCost(c) * factor;
    if (amount > 0) rows.push({
      category: "Hyra + drift",
      sub: factor < 0.999 ? "Avtal · periodiserat " + percent(factor * 100) : "Avtal",
      source: c.number || c.id,
      contractId: c.id,
      amount: amount
    });
  });
  state.projects.filter(function(p) { return Number(p.budgetYear) === Number(year); }).forEach(function(p) {
    const investigation = Number(p.budgetInvestigation) || 0;
    const project = (Number(p.budgetExecution) || 0) + (Number(p.budgetFurnishing) || 0);
    if (investigation > 0) rows.push({ category: "Utredningar", sub: "Projektutredning", source: p.name, contractId: p.contractId, amount: investigation });
    if (project > 0) rows.push({ category: "Projekt", sub: "Genomförande + inredning", source: p.name, contractId: p.contractId, amount: project });
  });
  state.maintenance.filter(function(u) { return Number(u.year) === Number(year) && Number(u.cost) > 0; }).forEach(function(u) {
    rows.push({ category: "Underhåll", sub: u.title, source: u.title, contractId: u.contractId, amount: Number(u.cost) });
  });
  state.operations.filter(function(o) { return Number(o.period) === Number(year) && Number(o.budget) > 0; }).forEach(function(o) {
    rows.push({ category: "Driftkostnader", sub: o.category, source: o.category, contractId: o.contractId, amount: Number(o.budget) });
  });
  state.investigations.filter(function(u) { return Number(u.year) === Number(year) && Number(u.cost) > 0; }).forEach(function(u) {
    rows.push({ category: "Utredningar", sub: u.title, source: u.title, contractId: u.contractId, amount: Number(u.cost) });
  });
  state.maintenanceStatus.filter(function(x) {
    return x.includeInBudget === "Ja" && Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0;
  }).forEach(function(x) {
    rows.push({ category: "Underhåll", sub: x.category, source: "Status: " + x.category, contractId: x.contractId, amount: Number(x.estimatedCost) });
  });
  state.driftIssues.filter(function(x) {
    return x.includeInBudget === "Ja" && Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0 && x.status !== "Klar";
  }).forEach(function(x) {
    rows.push({ category: "Driftkostnader", sub: x.category, source: "Ärende: " + x.title, contractId: x.contractId, amount: Number(x.estimatedCost) });
  });
  state.wishes.filter(function(x) {
    return x.includeInBudget === "Ja" && x.budgetCategory && x.budgetCategory !== "Ej budget" &&
      Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0 && x.status !== "Avslaget";
  }).forEach(function(x) {
    rows.push({ category: x.budgetCategory, sub: x.category, source: "Önskemål: " + x.title, contractId: x.contractId, amount: Number(x.estimatedCost) });
  });
  return rows;
}
function budgetSummary(year) {
  const cats = ["Hyra + drift", "Projekt", "Underhåll", "Driftkostnader", "Utredningar"];
  const rows = budgetRows(year);
  return cats.map(function(category) {
    return {
      category: category,
      amount: rows.filter(function(r) { return r.category === category; }).reduce(function(sum, r) { return sum + r.amount; }, 0)
    };
  });
}
function budgetYears() {
  const years = new Set([new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2]);
  state.projects.forEach(function(x) { if (x.budgetYear) years.add(Number(x.budgetYear)); });
  state.maintenance.forEach(function(x) { if (x.year) years.add(Number(x.year)); });
  state.operations.forEach(function(x) { if (x.period) years.add(Number(x.period)); });
  state.investigations.forEach(function(x) { if (x.year) years.add(Number(x.year)); });
  state.maintenanceStatus.forEach(function(x) { if (x.budgetYear) years.add(Number(x.budgetYear)); });
  state.driftIssues.forEach(function(x) { if (x.budgetYear) years.add(Number(x.budgetYear)); });
  state.wishes.forEach(function(x) { if (x.budgetYear) years.add(Number(x.budgetYear)); });
  return Array.from(years).filter(Boolean).sort(function(a, b) { return a - b; });
}

function renderNav() {
  document.getElementById("main-nav").innerHTML = views.map(function(v) {
    return '<button class="nav-button ' + (v.id === currentView ? "active" : "") + '" data-view="' + v.id + '">' +
      '<span class="nav-icon">' + v.icon + "</span><span>" + v.label + "</span></button>";
  }).join("");
  document.querySelectorAll("[data-view]").forEach(function(btn) {
    btn.addEventListener("click", function() { currentView = btn.dataset.view; render(); });
  });
}
function render() {
  renderNav();
  const meta = views.find(function(v) { return v.id === currentView; });
  document.getElementById("page-title").textContent = meta.label;
  document.getElementById("page-eyebrow").textContent = meta.eyebrow;
  const banner = document.getElementById("mode-banner");
  banner.className = "mode-banner " + (state.isDemo ? "demo" : "live");
  banner.innerHTML = state.isDemo
    ? "<strong>Publik demo</strong><span>Endast syntetisk demodata. Ingen LEB-, person-, hyres- eller kostnadsdata från företaget får läsas in här.</span>"
    : "<strong>LEB-data aktiv</strong><span>" + esc(state.sourceName || "Importerad fil") + " · " + state.properties.length + " fastigheter · " + state.contracts.length + " objekt/avtal. Kompletteringar ligger kvar vid ny import.</span>";
  let html = "";
  if (currentView === "dashboard") html = renderDashboard();
  else if (currentView === "properties") html = renderProperties();
  else if (currentView === "contracts") html = renderContracts();
  else if (currentView === "budget") html = renderBudget();
  else if (currentView === "portfolio") html = renderPortfolio();
  else html = renderOrganisation();
  document.getElementById("content").innerHTML = html;
  bindViewEvents();
}

function renderDashboard() {
  const totalArea = state.contracts.reduce(function(s, c) { return s + (Number(c.area) || 0); }, 0);
  const annualCost = state.contracts.reduce(function(s, c) { return s + totalContractCost(c); }, 0);
  const budget = budgetRows(selectedBudgetYear);
  const totalBudget = budget.reduce(function(s, r) { return s + r.amount; }, 0);
  const ourPeople = state.people.filter(function(p) {
    const o = state.organizations.find(function(x) { return x.id === p.organizationId; });
    return o && o.type === "our";
  });
  const loads = ourPeople.map(function(p) {
    return { name: p.name, load: personLoad(p.id) };
  }).sort(function(a, b) { return b.load - a.load; });
  const loadBars = loads.map(function(p) {
    return '<div class="bar-row"><div class="bar-label">' + esc(p.name) + '</div><div class="bar-track"><div class="bar-fill ' +
      (p.load > 100 ? "over" : "") + '" style="width:' + (Math.min(p.load, 130) / 1.3) +
      '%"></div></div><div class="bar-value">' + p.load + "%</div></div>";
  }).join("") || '<div class="empty">Ingen intern persondata.</div>';
  const summary = budgetSummary(selectedBudgetYear);
  const max = Math.max.apply(null, [1].concat(summary.map(function(x) { return x.amount; })));
  const budgetBars = summary.map(function(x) {
    return '<div class="bar-row"><div class="bar-label">' + esc(x.category) + '</div><div class="bar-track"><div class="bar-fill" style="width:' +
      (x.amount / max * 100) + '%"></div></div><div class="bar-value">' + num(x.amount / 1000000) + "m</div></div>";
  }).join("");
  const openIssues = state.driftIssues.filter(function(x) { return x.status !== "Klar"; }).length;
  const openWishes = state.wishes.filter(function(x) { return x.status !== "Klart" && x.status !== "Avslaget"; }).length;
  const maintenanceNeeds = state.maintenanceStatus.filter(function(x) { return x.status === "Åtgärdsbehov" || x.status === "Akut"; }).length;
  return '<div class="grid kpi-grid">' +
    kpi("Objekt / avtal", num(state.contracts.length), num(totalArea) + " kvm") +
    kpi("Budget " + selectedBudgetYear, money(totalBudget), "automatiskt från källor") +
    kpi("Öppna driftärenden", num(openIssues), "aktiva ärenden") +
    kpi("Önskemål / UH-behov", num(openWishes + maintenanceNeeds), openWishes + " önskemål · " + maintenanceNeeds + " statusbehov") +
    '</div><div class="grid two-col" style="margin-top:16px">' +
    card("Årsbudget", "Hyra + drift, projekt, UH, driftkostnader och utredningar", '<div class="bar-list">' + budgetBars + "</div>", '<button class="button secondary" data-goto="budget">Öppna budget</button>') +
    card("Arbetsfördelning", "Vår organisation – tilldelning till objekt och projekt", '<div class="bar-list">' + loadBars + "</div>", '<button class="button secondary" data-goto="organisation">Öppna organisation</button>') +
    "</div>";
}

function renderProperties() {
  const rows = state.properties.map(function(p) {
    const cs = state.contracts.filter(function(c) { return c.propertyId === p.id; });
    const area = cs.reduce(function(s, c) { return s + (Number(c.area) || 0); }, 0);
    const cost = cs.reduce(function(s, c) { return s + totalContractCost(c); }, 0);
    const units = Array.from(new Set(cs.map(function(c) { return unitName(c.unitId); }))).join(", ");
    return '<tr><td class="mono">' + esc(p.id) + "</td><td><strong>" + esc(p.address || "Adress saknas") + '</strong><div class="muted">' +
      esc(p.designation || "") + "</div></td><td>" + statusBadge(p.type) + "</td><td>" + esc(p.owner || "–") + "</td><td>" + cs.length +
      "</td><td>" + num(area) + " kvm</td><td>" + money(cost) + "</td><td>" + esc(units || "–") + "</td></tr>";
  });
  return card("Fastigheter", "Fysisk nivå. Ett objekt/avtal hör till en fastighet.",
    '<div class="toolbar"><input class="search" id="property-search" placeholder="Sök objektsnummer, adress, ägare…"><select class="select" id="property-type"><option value="">Alla</option><option>Intern</option><option>Extern</option></select></div>' +
    '<div id="property-table">' + table(["Fastighet", "Adress", "Typ", "Fastighetsägare", "Objekt/avtal", "Area", "Hyra + drift", "Organisation"], rows) + "</div>");
}

function renderContracts() {
  const rows = state.contracts.map(function(c) {
    const total = totalContractCost(c);
    const commonPct = c.area ? Number(c.commonArea || 0) / Number(c.area) * 100 : 0;
    const aptPct = c.area ? Number(c.apartmentArea || 0) / Number(c.area) * 100 : 0;
    const contacts = state.assignments.filter(function(a) { return a.targetType === "object" && a.targetId === c.id; }).map(function(a) {
      const p = state.people.find(function(x) { return x.id === a.personId; });
      return p ? p.name + " · " + a.role : "";
    }).filter(Boolean).join(", ");
    return "<tr><td><strong>" + esc(c.number || c.id) + '</strong><div class="muted mono">' + esc(c.id) + "</div></td><td>" +
      esc(propertyName(c.propertyId)) + "</td><td>" + esc(unitName(c.unitId)) + "</td><td>" + num(c.area) + " kvm</td><td>" +
      money(c.annualRent) + "</td><td>" + money(c.annualContractDrift) + "</td><td>" + money(total) + "</td><td>" +
      (c.area && total ? num(total / c.area) + " kr/kvm" : "–") + "</td><td>" + (c.employees || "–") + " / " + (c.users || "–") + " / " + (c.rooms || "–") +
      "</td><td>" + num(c.commonArea) + " kvm (" + percent(commonPct) + ")</td><td>" + num(c.apartmentArea) + " kvm (" + percent(aptPct) +
      ")</td><td>" + esc(contacts || "–") + "</td></tr>";
  });
  return card("Objekt / avtal", "Operativ nivå: ett objekt motsvarar ett avtal. Här kompletteras LEB med ekonomi, verksamhet och ytor.",
    '<div class="toolbar"><input class="search" id="contract-search" placeholder="Sök avtal, fastighet, organisation…"></div><div id="contract-table">' +
    table(["Objekt / avtal", "Fastighet", "Organisation", "Area", "Årshyra", "Avtalsdrift", "Summa", "Kr/kvm", "Anst./brukare/rum", "Allmän yta", "Lägenhetsyta", "Personer"], rows) + "</div>",
    '<button class="button primary" data-add="object">Komplettera objekt</button>');
}

function renderBudget() {
  const rows = budgetRows(selectedBudgetYear);
  const summary = budgetSummary(selectedBudgetYear);
  const total = rows.reduce(function(s, r) { return s + r.amount; }, 0);
  const max = Math.max.apply(null, [1].concat(summary.map(function(x) { return x.amount; })));
  const bars = summary.map(function(x) {
    return '<div class="bar-row"><div class="bar-label">' + esc(x.category) + '</div><div class="bar-track"><div class="bar-fill" style="width:' +
      (x.amount / max * 100) + '%"></div></div><div class="bar-value">' + num(x.amount / 1000000) + "m</div></div>";
  }).join("");
  const detail = rows.map(function(r) {
    return "<tr><td>" + esc(r.category) + "</td><td>" + esc(r.sub || "") + "</td><td>" + esc(r.source) + "</td><td>" +
      (r.contractId ? esc(contractName(r.contractId)) : "–") + "</td><td>" + money(r.amount) + "</td></tr>";
  });
  const missing = [];
  state.contracts.filter(function(c) { return activeInYear(c, selectedBudgetYear) && totalContractCost(c) === 0; }).forEach(function(c) {
    missing.push((c.number || c.id) + ": hyra/drift saknas");
  });
  state.maintenance.filter(function(x) { return !x.year || !Number(x.cost); }).forEach(function(x) { missing.push(x.title + ": planår eller kostnad saknas"); });
  state.projects.filter(function(x) { return !x.budgetYear || projectBudgetTotal(x) === 0; }).forEach(function(x) { missing.push(x.name + ": budgetår eller budget saknas"); });
  const yearSelect = '<select class="select" id="budget-year">' + budgetYears().map(function(y) {
    return '<option value="' + y + '"' + (Number(y) === Number(selectedBudgetYear) ? " selected" : "") + ">" + y + "</option>";
  }).join("") + "</select>";
  return '<div class="section-stack"><div class="grid kpi-grid">' +
    summary.map(function(x) { return kpi(x.category, money(x.amount), "budget " + selectedBudgetYear); }).join("") +
    '</div><div class="grid two-col">' +
    card("Årsbudget " + selectedBudgetYear, "Budget hämtas automatiskt från avtal och tidsatta behov.", '<div class="toolbar">' + yearSelect + '</div><div class="bar-list">' + bars + "</div>") +
    card("Underlag som inte kommer med", "Poster utan år eller kostnad tas inte in i årsbudgeten.",
      missing.length ? '<div class="section-stack">' + missing.map(function(x) { return '<div class="notice">' + esc(x) + "</div>"; }).join("") + "</div>" : '<div class="notice">Alla aktuella källor har tillräckligt budgetunderlag.</div>') +
    "</div>" +
    card("Budgetdetaljer · total " + money(total), "Varje rad kan spåras tillbaka till sin källa.", table(["Kategori", "Underkategori", "Källa", "Objekt / avtal", "Belopp"], detail)) +
    "</div>";
}

function renderPortfolio() {
  const projectRows = state.projects.map(function(p) {
    const people = state.assignments.filter(function(a) { return a.targetType === "project" && a.targetId === p.id; }).map(function(a) {
      return personName(a.personId);
    }).filter(Boolean).join(", ");
    return "<tr><td><strong>" + esc(p.name) + '</strong><div class="muted">' + esc(p.description || "") + "</div></td><td>" +
      esc(contractName(p.contractId)) + "</td><td>" + statusBadge(p.status) + "</td><td>" + esc(p.phase || "–") + "</td><td>" +
      esc(p.start || "–") + " → " + esc(p.end || "–") + "</td><td>" + esc(p.moveIn || "–") + "</td><td>" + money(p.budgetInvestigation) +
      "</td><td>" + money(p.budgetExecution) + "</td><td>" + money(p.budgetFurnishing) + "</td><td>" +
      money(p.preliminaryCost || projectBudgetTotal(p)) + "</td><td>" + esc(people || "Ej tilldelad") + "</td></tr>";
  });
  const uhRows = state.maintenance.map(function(u) {
    return "<tr><td><strong>" + esc(u.title) + "</strong></td><td>" + esc(u.contractId ? contractName(u.contractId) : propertyName(u.propertyId)) +
      "</td><td>" + (u.year || "–") + "</td><td>" + statusBadge(u.priority) + "</td><td>" + statusBadge(u.status) + "</td><td>" + money(u.cost) + "</td></tr>";
  });
  const statusRows = state.maintenanceStatus.map(function(x) {
    return "<tr><td>" + esc(contractName(x.contractId)) + "</td><td><strong>" + esc(x.category) + "</strong></td><td>" +
      esc(x.assessedDate || "–") + "</td><td>" + statusBadge(x.status) + "</td><td>" + statusBadge(x.priority) + "</td><td>" +
      esc(x.actionNeed || "–") + "</td><td>" + (x.budgetYear || "–") + "</td><td>" + money(x.estimatedCost) + "</td><td>" +
      esc(personName(x.responsiblePersonId)) + "</td><td>" + esc(x.comment || "") + "</td></tr>";
  });
  const issueRows = state.driftIssues.map(function(x) {
    return "<tr><td><strong>" + esc(x.title) + '</strong><div class="muted">' + esc(x.description || "") + "</div></td><td>" +
      esc(contractName(x.contractId)) + "</td><td>" + esc(x.category) + "</td><td>" + statusBadge(x.status) + "</td><td>" +
      statusBadge(x.priority) + "</td><td>" + esc(x.createdDate || "–") + "</td><td>" + esc(x.targetDate || "–") + "</td><td>" +
      esc(personName(x.responsiblePersonId)) + "</td><td>" + money(x.estimatedCost) + "</td><td>" + money(x.finalCost) + "</td></tr>";
  });
  const wishRows = state.wishes.map(function(x) {
    return "<tr><td><strong>" + esc(x.title) + '</strong><div class="muted">' + esc(x.description || "") + "</div></td><td>" +
      esc(contractName(x.contractId)) + "</td><td>" + esc(x.category) + "</td><td>" + statusBadge(x.status) + "</td><td>" +
      esc(x.createdDate || "–") + "</td><td>" + esc(x.targetDate || "–") + "</td><td>" + esc(x.decisionDate || "–") + "</td><td>" +
      esc(x.completedDate || "–") + "</td><td>" + esc(x.budgetCategory || "–") + "</td><td>" + money(x.estimatedCost) + "</td><td>" +
      money(x.finalCost) + "</td><td>" + esc(personName(x.responsiblePersonId)) + "</td></tr>";
  });
  const opRows = state.operations.map(function(o) {
    return "<tr><td>" + esc(o.contractId ? contractName(o.contractId) : propertyName(o.propertyId)) + "</td><td>" + esc(o.period) + "</td><td>" +
      esc(o.category) + "</td><td>" + money(o.budget) + "</td><td>" + money(o.actual) + "</td></tr>";
  });
  const invRows = state.investigations.map(function(u) {
    return "<tr><td><strong>" + esc(u.title) + "</strong></td><td>" + esc(u.contractId ? contractName(u.contractId) : propertyName(u.propertyId)) +
      "</td><td>" + (u.year || "–") + "</td><td>" + statusBadge(u.status) + "</td><td>" + money(u.cost) + "</td></tr>";
  });
  return '<div class="section-stack">' +
    card("Projekt", "Text, tidplan, inflyttning och budgetdelar per projekt.", table(["Projekt", "Objekt / avtal", "Status", "Skede", "Start → slut", "Inflyttning", "Utredning", "Genomförande", "Inredning", "Prel kostnad", "Personer"], projectRows), '<button class="button primary" data-add="project">+ Projekt</button>') +
    card("Underhållsstatus", "Status per objekt och kategori. Tidsatt kostnadsbehov kan föras till årsbudgeten.", table(["Objekt / avtal", "Kategori", "Bedömd", "Status", "Prioritet", "Åtgärdsbehov", "Budgetår", "Kostnad", "Ansvarig", "Kommentar"], statusRows), '<button class="button primary" data-add="maintenanceStatus">+ Status</button>') +
    card("Underhållsåtgärder", "Tidsatta behov går automatiskt in i årsbudgeten.", table(["Åtgärd", "Fastighet / objekt", "Planår", "Prioritet", "Status", "Kostnad"], uhRows), '<button class="button primary" data-add="maintenance">+ UH-behov</button>') +
    card("Driftärenden", "Operativa ärenden med datum, ansvarig, kostnad och slutkostnad.", table(["Ärende", "Objekt / avtal", "Kategori", "Status", "Prioritet", "Upplagt", "Tidplan", "Ansvarig", "Bedömd kostnad", "Slutkostnad"], issueRows), '<button class="button primary" data-add="driftIssue">+ Driftärende</button>') +
    card("Önskemål", "Önskemål följs från upplagt till tidplan, beslut och klart. Tidsatta kostnader kan mata vald budgetkategori.", table(["Önskemål", "Objekt / avtal", "Kategori", "Status", "Upplagt", "Tidplan", "Beslutat", "Klart", "Budgetkategori", "Bedömd kostnad", "Slutkostnad", "Ansvarig"], wishRows), '<button class="button primary" data-add="wish">+ Önskemål</button>') +
    card("Driftkostnader", "Budget och utfall per år och kostnadsslag.", table(["Fastighet / objekt", "År", "Kostnadsslag", "Budget", "Utfall"], opRows), '<button class="button primary" data-add="operation">+ Driftpost</button>') +
    card("Utredningar", "Tidsatta utredningar går automatiskt in i årsbudgeten.", table(["Utredning", "Objekt / avtal", "År", "Status", "Kostnad"], invRows), '<button class="button primary" data-add="investigation">+ Utredning</button>') +
    "</div>";
}

function renderOrganisation() {
  const objectStats = ORG_UNITS.map(function(u) {
    const cs = state.contracts.filter(function(c) { return c.unitId === u.id; });
    const people = state.people.filter(function(p) {
      const org = state.organizations.find(function(o) { return o.id === p.organizationId; });
      return p.unitId === u.id && org && org.type === "our";
    });
    return "<tr><td><strong>" + esc(u.name) + "</strong></td><td>" + cs.length + "</td><td>" +
      num(cs.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0)) + " kvm</td><td>" +
      money(cs.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0)) + "</td><td>" + people.length + "</td></tr>";
  });
  const peopleRows = state.people.map(function(p) {
    const ass = state.assignments.filter(function(a) { return a.personId === p.id && !a.toDate; });
    const objects = ass.filter(function(a) { return a.targetType === "property" || a.targetType === "object"; }).map(function(a) { return targetName(a.targetType, a.targetId); });
    const projects = ass.filter(function(a) { return a.targetType === "project"; }).map(function(a) { return projectName(a.targetId); });
    const other = ass.filter(function(a) { return a.targetType !== "property" && a.targetType !== "object" && a.targetType !== "project"; }).map(function(a) { return targetName(a.targetType, a.targetId); });
    const load = personLoad(p.id);
    return "<tr><td><strong>" + esc(p.name) + '</strong><div class="muted">' + esc(p.role || "") + "</div></td><td>" + esc(orgType(p.organizationId)) +
      "</td><td>" + esc(orgName(p.organizationId)) + "</td><td>" + esc(unitName(p.unitId)) + "</td><td>" + esc(objects.join(", ") || "–") +
      "</td><td>" + esc(projects.join(", ") || "–") + "</td><td>" + esc(other.join(", ") || "–") + "</td><td>" + (load ? load + "%" : "–") + "</td></tr>";
  });
  const assignmentRows = state.assignments.slice().sort(function(a,b) {
    return String(b.fromDate || "").localeCompare(String(a.fromDate || ""));
  }).map(function(a) {
    return "<tr><td>" + esc(personName(a.personId)) + "</td><td>" + esc(a.targetType) + "</td><td>" +
      esc(targetName(a.targetType, a.targetId)) + "</td><td>" + esc(a.role || "–") + "</td><td>" +
      esc(a.fromDate || "–") + "</td><td>" + esc(a.toDate || "Pågående") + "</td><td>" +
      (Number(a.allocation) ? Number(a.allocation) + "%" : "–") + "</td></tr>";
  });
  const ourPeople = state.people.filter(function(p) {
    const org = state.organizations.find(function(o) { return o.id === p.organizationId; });
    return org && org.type === "our";
  });
  const bars = ourPeople.map(function(p) { return { name: p.name, load: personLoad(p.id) }; }).sort(function(a, b) { return b.load - a.load; }).map(function(p) {
    return '<div class="bar-row"><div class="bar-label">' + esc(p.name) + '</div><div class="bar-track"><div class="bar-fill ' +
      (p.load > 100 ? "over" : "") + '" style="width:' + (Math.min(p.load, 130) / 1.3) +
      '%"></div></div><div class="bar-value">' + p.load + "%</div></div>";
  }).join("");
  return '<div class="section-stack">' +
    card("Organisation per verksamhetsområde", "Objekt och våra personer kopplas till VÅRDBO, ORDBO, Myndighet/Stab eller Hälsa & Förebyggande.",
      table(["Organisation", "Objekt / avtal", "Area", "Hyra + drift", "Våra personer"], objectStats)) +
    '<div class="grid two-col">' +
    card("Arbetsfördelning · vår organisation", "Belastning räknas från aktiva tilldelningar till objekt och projekt.", '<div class="bar-list">' + (bars || '<div class="empty">Ingen intern persondata.</div>') + "</div>") +
    card("Tre personnivåer", "Samma objekt kan ha personer från tre parter.",
      '<div class="section-stack"><div class="notice"><strong>Vår organisation</strong><br>Objektansvarig, projektledare, samordnare.</div>' +
      '<div class="notice"><strong>Hyresgästen</strong><br>Verksamhetschef, lokal kontakt, ekonom.</div>' +
      '<div class="notice"><strong>Fastighetsägaren</strong><br>Intern (SF) eller extern förvaltare, teknisk och ekonomisk kontakt.</div></div>') +
    "</div>" +
    card("Personer och aktiva kopplingar", "En person hör till en organisation och kan vara ansvarig för objekt, projekt, status, driftärenden och önskemål.",
      table(["Person", "Nivå", "Organisation", "Verksamhetsområde", "Fastighet / objekt", "Projekt", "Ärenden / önskemål", "Belastning"], peopleRows),
      '<button class="button primary" data-add="person">+ Person</button> <button class="button secondary" data-add="assignment">+ Tilldelning</button>') +
    card("Ansvarshistorik", "Från- och tilldatum gör att ansvar kan bytas utan att historiken försvinner.",
      table(["Person", "Typ", "Mål", "Roll", "Från", "Till", "Omfattning"], assignmentRows)) +
    "</div>";
}

function bindViewEvents() {
  document.querySelectorAll("[data-goto]").forEach(function(b) {
    b.addEventListener("click", function() { currentView = b.dataset.goto; render(); });
  });
  document.querySelectorAll("[data-add]").forEach(function(b) {
    b.addEventListener("click", function() { openEditor(b.dataset.add); });
  });
  const pSearch = document.getElementById("property-search");
  const pType = document.getElementById("property-type");
  if (pSearch) {
    pSearch.addEventListener("input", filterProperties);
    pType.addEventListener("input", filterProperties);
  }
  const cSearch = document.getElementById("contract-search");
  if (cSearch) cSearch.addEventListener("input", filterContracts);
  const by = document.getElementById("budget-year");
  if (by) by.addEventListener("change", function() { selectedBudgetYear = Number(by.value); render(); });
}
function filterProperties() {
  const q = (document.getElementById("property-search") ? document.getElementById("property-search").value : "").toLowerCase();
  const type = document.getElementById("property-type") ? document.getElementById("property-type").value : "";
  document.querySelectorAll("#property-table tbody tr").forEach(function(tr) {
    const match = tr.textContent.toLowerCase().includes(q) && (!type || tr.textContent.includes(type));
    tr.style.display = match ? "" : "none";
  });
}
function filterContracts() {
  const q = (document.getElementById("contract-search") ? document.getElementById("contract-search").value : "").toLowerCase();
  document.querySelectorAll("#contract-table tbody tr").forEach(function(tr) {
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

const fieldTemplates = {
  object: [
    ["contractId", "Objekt / avtal", "contract", "", true],
    ["unitId", "Verksamhetsområde", "unit", "", true],
    ["annualRent", "Årshyra", "number", "0", false],
    ["annualContractDrift", "Avtalsdrift per år", "number", "0", false],
    ["employees", "Antal anställda", "number", "0", false],
    ["users", "Antal brukare", "number", "0", false],
    ["rooms", "Antal rum", "number", "0", false],
    ["commonArea", "Allmän yta kvm", "number", "0", false],
    ["apartmentArea", "Lägenhetsyta kvm", "number", "0", false]
  ],
  person: [
    ["name", "Namn", "text", "", true],
    ["organizationId", "Organisation / part", "organization", "", true],
    ["unitId", "Verksamhetsområde", "unit", "", false],
    ["role", "Grundroll", "text", "", true],
    ["email", "E-post", "email", "", false]
  ],
  assignment: [
    ["personId", "Person", "person", "", true],
    ["targetType", "Typ", "select", "property|object|project|driftIssue|wish|maintenanceStatus", true],
    ["targetId", "Mål-ID", "target", "", true],
    ["role", "Roll i uppdraget", "text", "", true],
    ["fromDate", "Från", "date", "", false],
    ["toDate", "Till", "date", "", false],
    ["allocation", "Omfattning %", "number", "0", false]
  ],
  project: [
    ["name", "Projektnamn", "text", "", true],
    ["contractId", "Objekt / avtal", "contract", "", true],
    ["description", "Fritext", "textarea", "", false],
    ["status", "Status", "select", "Planerad|Pågår|Pausad|Klar", true],
    ["phase", "Skede", "text", "Förstudie", false],
    ["start", "Start", "date", "", false],
    ["end", "Slut", "date", "", false],
    ["moveIn", "Inflyttning", "date", "", false],
    ["budgetYear", "Budgetår", "number", String(new Date().getFullYear() + 1), true],
    ["budgetInvestigation", "Budget utredning", "number", "0", false],
    ["budgetExecution", "Budget genomförande", "number", "0", false],
    ["budgetFurnishing", "Budget inredning", "number", "0", false],
    ["preliminaryCost", "Preliminär totalkostnad", "number", "0", false]
  ],
  maintenance: [
    ["title", "Åtgärd", "text", "", true],
    ["contractId", "Objekt / avtal", "contract", "", false],
    ["year", "Planår", "number", String(new Date().getFullYear() + 1), true],
    ["priority", "Prioritet", "select", "Låg|Medel|Hög", true],
    ["status", "Status", "select", "Identifierad|Planerad|Pågår|Klar", true],
    ["cost", "Bedömd kostnad", "number", "0", false]
  ],
  operation: [
    ["contractId", "Objekt / avtal", "contract", "", false],
    ["period", "Budgetår", "number", String(new Date().getFullYear() + 1), true],
    ["category", "Kostnadsslag", "text", "Energi", true],
    ["budget", "Budget", "number", "0", false],
    ["actual", "Utfall", "number", "0", false]
  ],
  investigation: [
    ["title", "Utredning", "text", "", true],
    ["contractId", "Objekt / avtal", "contract", "", true],
    ["year", "Budgetår", "number", String(new Date().getFullYear() + 1), true],
    ["status", "Status", "select", "Planerad|Pågår|Klar", true],
    ["cost", "Kostnad", "number", "0", true]
  ],
  maintenanceStatus: [
    ["contractId", "Objekt / avtal", "contract", "", true],
    ["category", "Kategori", "maintenanceCategory", "", true],
    ["assessedDate", "Bedömningsdatum", "date", "", true],
    ["status", "Status", "select", "Bra|Acceptabel|Åtgärdsbehov|Akut", true],
    ["priority", "Prioritet", "select", "Låg|Medel|Hög|Akut", true],
    ["comment", "Kommentar", "textarea", "", false],
    ["actionNeed", "Åtgärdsbehov", "textarea", "", false],
    ["budgetYear", "Budgetår", "number", "", false],
    ["estimatedCost", "Bedömd kostnad", "number", "0", false],
    ["includeInBudget", "Till årsbudget", "select", "Nej|Ja", true],
    ["responsiblePersonId", "Ansvarig hos oss", "internalperson", "", false]
  ],
  driftIssue: [
    ["contractId", "Objekt / avtal", "contract", "", true],
    ["category", "Kategori", "issueCategory", "", true],
    ["title", "Ärende", "text", "", true],
    ["description", "Beskrivning", "textarea", "", false],
    ["createdDate", "Upplagt", "date", "", true],
    ["targetDate", "Tidplan", "date", "", false],
    ["decisionDate", "Beslutat", "date", "", false],
    ["completedDate", "Klart", "date", "", false],
    ["status", "Status", "select", "Nytt|Utreds|Beslutat|Pågår|Klar", true],
    ["priority", "Prioritet", "select", "Låg|Medel|Hög|Akut", true],
    ["responsiblePersonId", "Ansvarig hos oss", "internalperson", "", false],
    ["budgetYear", "Budgetår", "number", "", false],
    ["estimatedCost", "Bedömd kostnad", "number", "0", false],
    ["finalCost", "Slutkostnad", "number", "0", false],
    ["includeInBudget", "Till årsbudget", "select", "Nej|Ja", true]
  ],
  wish: [
    ["contractId", "Objekt / avtal", "contract", "", true],
    ["category", "Kategori", "wishCategory", "", true],
    ["title", "Önskemål", "text", "", true],
    ["description", "Fritext", "textarea", "", false],
    ["createdDate", "Upplagt", "date", "", true],
    ["targetDate", "Tidplan", "date", "", false],
    ["decisionDate", "Beslutat", "date", "", false],
    ["completedDate", "Klart", "date", "", false],
    ["status", "Status", "select", "Nytt|Utreds|Tidplanerat|Beslutat|Pågår|Klart|Avslaget", true],
    ["responsiblePersonId", "Ansvarig hos oss", "internalperson", "", false],
    ["budgetYear", "Budgetår", "number", "", false],
    ["budgetCategory", "Budgetkategori", "select", "Ej budget|Projekt|Underhåll|Driftkostnader|Utredningar", true],
    ["estimatedCost", "Bedömd kostnad", "number", "0", false],
    ["finalCost", "Slutkostnad", "number", "0", false],
    ["includeInBudget", "Till årsbudget", "select", "Nej|Ja", true]
  ]
};

function options(items, valueKey, labelFn) {
  return items.map(function(x) { return '<option value="' + esc(x[valueKey]) + '">' + esc(labelFn(x)) + "</option>"; }).join("");
}
function openEditor(type) {
  editorType = type;
  const titles = {
    object: "Komplettera objekt / avtal",
    person: "Lägg till person",
    assignment: "Lägg till tilldelning",
    project: "Lägg till projekt",
    maintenance: "Lägg till UH-behov",
    operation: "Lägg till driftpost",
    investigation: "Lägg till utredning",
    maintenanceStatus: "Lägg till underhållsstatus",
    driftIssue: "Lägg till driftärende",
    wish: "Lägg till önskemål"
  };
  document.getElementById("dialog-title").textContent = titles[type] || "Lägg till";
  document.getElementById("dialog-eyebrow").textContent = "NY / ÄNDRA";
  document.getElementById("dialog-fields").innerHTML = fieldTemplates[type].map(function(field) {
    const name = field[0], label = field[1], kind = field[2], preset = field[3], required = field[4];
    let control = "";
    if (kind === "select") {
      control = '<select name="' + name + '"' + (required ? " required" : "") + ">" +
        String(preset).split("|").map(function(v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("") + "</select>";
    } else if (kind === "contract") {
      control = '<select name="' + name + '"' + (required ? " required" : "") + '><option value="">–</option>' +
        options(state.contracts, "id", function(c) { return (c.number || c.id) + " · " + propertyName(c.propertyId); }) + "</select>";
    } else if (kind === "person") {
      control = '<select name="' + name + '" required>' + options(state.people, "id", function(p) { return p.name; }) + "</select>";
    } else if (kind === "organization") {
      control = '<select name="' + name + '" required>' + options(state.organizations, "id", function(o) { return orgType(o.id) + " · " + o.name; }) + "</select>";
    } else if (kind === "unit") {
      control = '<select name="' + name + '"' + (required ? " required" : "") + '><option value="">–</option>' +
        options(ORG_UNITS, "id", function(u) { return u.name; }) + "</select>";
    } else if (kind === "internalperson") {
      const internalPeople = state.people.filter(function(p) {
        const org = state.organizations.find(function(o) { return o.id === p.organizationId; });
        return org && org.type === "our";
      });
      control = '<select name="' + name + '"><option value="">–</option>' + options(internalPeople, "id", function(p) { return p.name; }) + "</select>";
    } else if (kind === "maintenanceCategory") {
      control = '<select name="' + name + '" required>' + MAINTENANCE_STATUS_CATEGORIES.map(function(v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("") + "</select>";
    } else if (kind === "issueCategory") {
      control = '<select name="' + name + '" required>' + DRIFT_ISSUE_CATEGORIES.map(function(v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("") + "</select>";
    } else if (kind === "wishCategory") {
      control = '<select name="' + name + '" required>' + WISH_CATEGORIES.map(function(v) { return '<option value="' + esc(v) + '">' + esc(v) + "</option>"; }).join("") + "</select>";
    } else if (kind === "target") {
      control = '<input name="' + name + '" placeholder="Objekt-ID eller ProjektID" required>';
    } else if (kind === "textarea") {
      control = '<textarea name="' + name + '" rows="4"></textarea>';
    } else {
      control = '<input name="' + name + '" type="' + kind + '" value="' + esc(preset) + '"' + (required ? " required" : "") + ">";
    }
    return '<div class="field ' + (kind === "textarea" ? "full" : "") + '"><label>' + label + "</label>" + control + "</div>";
  }).join("");
  document.getElementById("editor-dialog").showModal();
}
function nextId(prefix, list) {
  const max = Math.max.apply(null, [0].concat(list.map(function(x) { return Number(String(x.id).replace(/\D/g, "")) || 0; })));
  return prefix + (max + 1);
}
async function saveEditor(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (editorType === "object") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    if (!c) return false;
    ["annualRent", "annualContractDrift", "employees", "users", "rooms", "commonArea", "apartmentArea"].forEach(function(k) { c[k] = Number(data[k]) || 0; });
    c.unitId = data.unitId || "";
  } else if (editorType === "person") {
    data.id = nextId("P", state.people);
    state.people.push(data);
  } else if (editorType === "assignment") {
    data.id = nextId("A", state.assignments);
    data.allocation = Number(data.allocation) || 0;
    state.assignments.push(data);
  } else if (editorType === "project") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("PR", state.projects);
    data.propertyId = c ? c.propertyId : "";
    ["budgetYear", "budgetInvestigation", "budgetExecution", "budgetFurnishing", "preliminaryCost"].forEach(function(k) { data[k] = Number(data[k]) || 0; });
    state.projects.push(data);
  } else if (editorType === "maintenance") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("UH", state.maintenance);
    data.propertyId = c ? c.propertyId : "";
    data.year = Number(data.year) || null;
    data.cost = Number(data.cost) || 0;
    state.maintenance.push(data);
  } else if (editorType === "operation") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("D", state.operations);
    data.propertyId = c ? c.propertyId : "";
    data.period = Number(data.period) || null;
    data.budget = Number(data.budget) || 0;
    data.actual = Number(data.actual) || 0;
    state.operations.push(data);
  } else if (editorType === "investigation") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("U", state.investigations);
    data.propertyId = c ? c.propertyId : "";
    data.year = Number(data.year) || null;
    data.cost = Number(data.cost) || 0;
    state.investigations.push(data);
  } else if (editorType === "maintenanceStatus") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("MS", state.maintenanceStatus);
    data.propertyId = c ? c.propertyId : "";
    data.budgetYear = Number(data.budgetYear) || null;
    data.estimatedCost = Number(data.estimatedCost) || 0;
    state.maintenanceStatus.push(data);
    if (data.responsiblePersonId) state.assignments.push({ id:nextId("A",state.assignments), personId:data.responsiblePersonId, targetType:"maintenanceStatus", targetId:data.id, role:"Ansvarig", fromDate:data.assessedDate||"", toDate:"", allocation:0 });
  } else if (editorType === "driftIssue") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("DI", state.driftIssues);
    data.propertyId = c ? c.propertyId : "";
    data.budgetYear = Number(data.budgetYear) || null;
    data.estimatedCost = Number(data.estimatedCost) || 0;
    data.finalCost = Number(data.finalCost) || 0;
    state.driftIssues.push(data);
    if (data.responsiblePersonId) state.assignments.push({ id:nextId("A",state.assignments), personId:data.responsiblePersonId, targetType:"driftIssue", targetId:data.id, role:"Ansvarig", fromDate:data.createdDate||"", toDate:"", allocation:0 });
  } else if (editorType === "wish") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("W", state.wishes);
    data.propertyId = c ? c.propertyId : "";
    data.budgetYear = Number(data.budgetYear) || null;
    data.estimatedCost = Number(data.estimatedCost) || 0;
    data.finalCost = Number(data.finalCost) || 0;
    state.wishes.push(data);
    if (data.responsiblePersonId) state.assignments.push({ id:nextId("A",state.assignments), personId:data.responsiblePersonId, targetType:"wish", targetId:data.id, role:"Ansvarig", fromDate:data.createdDate||"", toDate:"", allocation:0 });
  }
  await saveState();
  render();
  return true;
}

// Real LEB import belongs to the authenticated backend.
// The public GitHub Pages frontend contains no Excel/LEB import path.

document.getElementById("clear-data").addEventListener("click", async function() {
  if (confirm("Återställ publik demodata i denna webbläsare?")) {
    state = ensureShape(await window.LokalblickDataService.reset());
    currentView = "dashboard";
    render();
  }
});
document.getElementById("dialog-cancel").addEventListener("click", function() {
  document.getElementById("editor-dialog").close();
});
document.getElementById("editor-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  if (await saveEditor(e.currentTarget)) {
    document.getElementById("editor-dialog").close();
    e.currentTarget.reset();
  }
});

async function init() {
  await loadState();
  render();
}

init();
