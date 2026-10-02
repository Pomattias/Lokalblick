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
  { id: "properties", label: "Fastigheter & avtal", icon: "▦", eyebrow: "LEB · FASTIGHET · AVTAL" },
  { id: "map", label: "Karta", icon: "⌖", eyebrow: "GEOGRAFI" },
  { id: "budget", label: "Årsbudget", icon: "¤", eyebrow: "EKONOMI" },
  { id: "portfolio", label: "Projekt & behov", icon: "◇", eyebrow: "ÅTGÄRDER" },
  { id: "organisation", label: "Organisation", icon: "◎", eyebrow: "PERSONER & ANSVAR" },
  { id: "about", label: "Om", icon: "ⓘ", eyebrow: "SÄKERHET & ARKITEKTUR" }
];

let state = clone(demo);
let currentView = "dashboard";
let selectedBudgetYear = new Date().getFullYear() + 1;
let editorType = null;
let portfolioExplorer = { propertyId: "", contractId: "", activity: "all" };

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
  if (currentView !== "map" && window.LokalblickMapService) {
    window.LokalblickMapService.destroy();
  }
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
  else if (currentView === "map") html = renderMap();
  else if (currentView === "budget") html = renderBudget();
  else if (currentView === "portfolio") html = renderPortfolio();
  else if (currentView === "organisation") html = renderOrganisation();
  else html = renderAbout();
  document.getElementById("content").innerHTML = html;
  bindViewEvents();
  if (currentView === "map") initPropertyMap();
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
    kpi("Avtal", num(state.contracts.length), num(totalArea) + " kvm") +
    kpi("Budget " + selectedBudgetYear, money(totalBudget), "automatiskt från källor") +
    kpi("Öppna driftärenden", num(openIssues), "aktiva ärenden") +
    kpi("Önskemål / UH-behov", num(openWishes + maintenanceNeeds), openWishes + " önskemål · " + maintenanceNeeds + " statusbehov") +
    '</div><div class="grid two-col" style="margin-top:16px">' +
    card("Årsbudget", "Hyra + drift, projekt, UH, driftkostnader och utredningar", '<div class="bar-list">' + budgetBars + "</div>", '<button class="button secondary" data-goto="budget">Öppna budget</button>') +
    card("Arbetsfördelning", "Vår organisation – tilldelning till objekt och projekt", '<div class="bar-list">' + loadBars + "</div>", '<button class="button secondary" data-goto="organisation">Öppna organisation</button>') +
    "</div>" +
    '<div style="margin-top:16px">' + card("Geografi", "Se fastigheter och objekt på karta.", '<div class="map-dashboard-copy">Hover på dator eller tryck på en markör på mobil för snabbfakta.</div>', '<button class="button secondary" data-goto="map">Öppna karta</button>') + '</div>';
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter(function(item) {
    if (!item || !item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
function contractPartyPeople(c, type) {
  const assignments = state.assignments.filter(function(a) {
    return (a.targetType === "object" && a.targetId === c.id) ||
      (a.targetType === "property" && a.targetId === c.propertyId);
  });
  return uniqueById(assignments.map(function(a) {
    return state.people.find(function(p) { return p.id === a.personId; });
  }).filter(function(p) {
    if (!p) return false;
    const organization = state.organizations.find(function(o) { return o.id === p.organizationId; });
    return organization && organization.type === type;
  }));
}
function contractCustomer(c) {
  if (c.tenantOrgId) return orgName(c.tenantOrgId);
  return c.customer || c.customerName || "Ej satt";
}
function contractOwner(c, property) {
  if (c.ownerOrgId) return orgName(c.ownerOrgId);
  return property && property.owner ? property.owner : "Ej satt";
}
function contractOwnerKey(c, property) {
  return c.ownerOrgId || contractOwner(c, property);
}
function contractCustomerKey(c) {
  return c.tenantOrgId || contractCustomer(c);
}
function peopleText(c, type) {
  return contractPartyPeople(c, type).map(function(p) { return p.name; }).join(", ") || "–";
}
function selectOptions(items, placeholder) {
  return '<option value="">' + esc(placeholder) + '</option>' + items.map(function(item) {
    return '<option value="' + esc(item.value) + '">' + esc(item.label) + '</option>';
  }).join("");
}
function dedupeOptions(items) {
  const map = new Map();
  items.forEach(function(item) {
    if (item && item.value && !map.has(item.value)) map.set(item.value, item);
  });
  return Array.from(map.values()).sort(function(a, b) { return a.label.localeCompare(b.label, "sv"); });
}
function portfolioFilterOptions() {
  const customer = [];
  const unit = [];
  const owner = [];
  let ourPeople = [];
  let tenantPeople = [];
  let ownerPeople = [];
  state.contracts.forEach(function(c) {
    const property = state.properties.find(function(p) { return p.id === c.propertyId; });
    const customerKey = contractCustomerKey(c);
    if (customerKey) customer.push({ value: customerKey, label: contractCustomer(c) });
    if (c.unitId) unit.push({ value: c.unitId, label: unitName(c.unitId) });
    const ownerKey = contractOwnerKey(c, property);
    if (ownerKey) owner.push({ value: ownerKey, label: contractOwner(c, property) });
    ourPeople = ourPeople.concat(contractPartyPeople(c, "our").map(function(p) { return { value: p.id, label: p.name }; }));
    tenantPeople = tenantPeople.concat(contractPartyPeople(c, "tenant").map(function(p) { return { value: p.id, label: p.name }; }));
    ownerPeople = ownerPeople.concat(contractPartyPeople(c, "owner").map(function(p) { return { value: p.id, label: p.name }; }));
  });
  return {
    customer: dedupeOptions(customer),
    unit: dedupeOptions(unit),
    owner: dedupeOptions(owner),
    ourPeople: dedupeOptions(ourPeople),
    tenantPeople: dedupeOptions(tenantPeople),
    ownerPeople: dedupeOptions(ownerPeople)
  };
}
function contractSummaryRow(c, property) {
  const total = totalContractCost(c);
  return '<tr data-contract-id="' + esc(c.id) + '">' +
    '<td><button type="button" class="table-link" data-explorer-contract="' + esc(c.id) + '"><strong>' + esc(c.number || c.id) + '</strong></button><div class="muted mono">' + esc(c.id) + '</div></td>' +
    '<td>' + esc(contractCustomer(c)) + '</td>' +
    '<td>' + esc(unitName(c.unitId)) + '</td>' +
    '<td>' + esc(contractOwner(c, property)) + '</td>' +
    '<td>' + num(c.area) + ' kvm</td>' +
    '<td>' + money(total) + '</td>' +
    '<td>' + esc(peopleText(c, "our")) + '</td>' +
    '<td>' + esc(peopleText(c, "tenant")) + '</td>' +
    '<td>' + esc(peopleText(c, "owner")) + '</td>' +
  '</tr>';
}
function detailedContractRow(c) {
  const property = state.properties.find(function(p) { return p.id === c.propertyId; });
  const total = totalContractCost(c);
  const commonPct = c.area ? Number(c.commonArea || 0) / Number(c.area) * 100 : 0;
  const aptPct = c.area ? Number(c.apartmentArea || 0) / Number(c.area) * 100 : 0;
  return '<tr data-contract-id="' + esc(c.id) + '">' +
    '<td><button type="button" class="table-link" data-explorer-contract="' + esc(c.id) + '"><strong>' + esc(c.number || c.id) + '</strong></button><div class="muted mono">' + esc(c.id) + '</div></td>' +
    '<td>' + esc(propertyName(c.propertyId)) + '</td>' +
    '<td>' + esc(contractCustomer(c)) + '</td>' +
    '<td>' + esc(unitName(c.unitId)) + '</td>' +
    '<td>' + esc(contractOwner(c, property)) + '</td>' +
    '<td>' + num(c.area) + ' kvm</td>' +
    '<td>' + esc(c.start || "–") + ' → ' + esc(c.end || "–") + '<div class="muted">Säg upp ' + esc(c.notice || "–") + '</div></td>' +
    '<td>' + money(c.annualRent) + '</td>' +
    '<td>' + money(c.annualContractDrift) + '</td>' +
    '<td>' + money(total) + '<div class="muted">' + (c.area && total ? num(total / c.area) + ' kr/kvm' : '–') + '</div></td>' +
    '<td>' + (c.employees || "–") + ' / ' + (c.users || "–") + ' / ' + (c.rooms || "–") + '</td>' +
    '<td>' + num(c.commonArea) + ' kvm (' + percent(commonPct) + ')<div class="muted">Lägenhet ' + num(c.apartmentArea) + ' kvm (' + percent(aptPct) + ')</div></td>' +
    '<td><div><strong>Hos oss:</strong> ' + esc(peopleText(c, "our")) + '</div>' +
      '<div><strong>Kund:</strong> ' + esc(peopleText(c, "tenant")) + '</div>' +
      '<div><strong>Ägare:</strong> ' + esc(peopleText(c, "owner")) + '</div></td>' +
  '</tr>';
}
function portfolioPatternRows(contracts, keyFn, labelFn, valueFn) {
  const groups = new Map();
  contracts.forEach(function(c) {
    const key = keyFn(c) || "Ej satt";
    const label = labelFn(c) || "Ej satt";
    const value = Number(valueFn(c)) || 0;
    const existing = groups.get(key) || { key: key, label: label, count: 0, value: 0 };
    existing.count += 1;
    existing.value += value;
    groups.set(key, existing);
  });
  return Array.from(groups.values()).sort(function(a, b) {
    return b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "sv");
  });
}
function portfolioPatternHtml(title, subtitle, rows, formatter, filterId) {
  const max = Math.max.apply(null, [1].concat(rows.map(function(row) { return row.value; })));
  const body = rows.length ? rows.slice(0, 8).map(function(row) {
    const width = row.value > 0 ? Math.max(3, row.value / max * 100) : 3;
    const tag = filterId ? "button" : "div";
    const attrs = filterId ? ' type="button" class="pattern-row pattern-button" data-set-filter="' + esc(filterId) + '" data-filter-value="' + esc(row.key) + '"' : ' class="pattern-row"';
    return '<' + tag + attrs + '>' +
      '<div class="pattern-row-head"><strong>' + esc(row.label) + '</strong><span>' + esc(formatter(row)) + '</span></div>' +
      '<div class="pattern-track"><div class="pattern-fill" style="width:' + width + '%"></div></div>' +
    '</' + tag + '>';
  }).join("") : '<div class="empty compact">Ingen data i urvalet.</div>';
  return '<section class="pattern-card"><div class="pattern-head"><h3>' + esc(title) + '</h3><p>' + esc(subtitle) + '</p></div>' + body + '</section>';
}
function monthsUntil(dateValue) {
  if (!dateValue) return null;
  const date = new Date(dateValue + "T00:00:00");
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth()) +
    (date.getDate() >= now.getDate() ? 0 : -1);
}
function portfolioActivityItems(contracts) {
  const contractIds = new Set(contracts.map(function(c) { return c.id; }));
  const propertyIds = new Set(contracts.map(function(c) { return c.propertyId; }));
  function inScope(item) {
    return (item.contractId && contractIds.has(item.contractId)) ||
      (!item.contractId && item.propertyId && propertyIds.has(item.propertyId));
  }
  function responsibleFromAssignments(type, id) {
    const names = state.assignments.filter(function(a) {
      return a.targetType === type && a.targetId === id && !a.toDate;
    }).map(function(a) { return personName(a.personId); }).filter(Boolean);
    return Array.from(new Set(names)).join(", ");
  }
  const items = [];
  state.projects.filter(inScope).forEach(function(x) {
    items.push({ group:"project", type:"Projekt", id:x.id, title:x.name, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.end || x.start || "", cost:Number(x.preliminaryCost)||projectBudgetTotal(x),
      responsible:responsibleFromAssignments("project", x.id) });
  });
  state.maintenance.filter(inScope).forEach(function(x) {
    items.push({ group:"maintenance", type:"Underhåll", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status || x.priority, when:x.year ? String(x.year) : "", cost:Number(x.cost)||0, responsible:"" });
  });
  state.maintenanceStatus.filter(inScope).forEach(function(x) {
    items.push({ group:"maintenance", type:"Underhållsstatus", id:x.id, title:x.category + (x.actionNeed ? " · " + x.actionNeed : ""),
      propertyId:x.propertyId, contractId:x.contractId, status:x.status, when:x.assessedDate || "", cost:Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId) });
  });
  state.driftIssues.filter(inScope).forEach(function(x) {
    items.push({ group:"drift", type:"Driftärende", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.targetDate || x.createdDate || "", cost:Number(x.finalCost)||Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId) });
  });
  state.wishes.filter(inScope).forEach(function(x) {
    items.push({ group:"wish", type:"Önskemål", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.targetDate || x.createdDate || "", cost:Number(x.finalCost)||Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId) });
  });
  state.investigations.filter(inScope).forEach(function(x) {
    items.push({ group:"investigation", type:"Utredning", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.year ? String(x.year) : "", cost:Number(x.cost)||0, responsible:"" });
  });
  state.operations.filter(inScope).forEach(function(x) {
    items.push({ group:"operations", type:"Driftkostnad", id:x.id, title:x.category, propertyId:x.propertyId, contractId:x.contractId,
      status:"Budget / utfall", when:x.period ? String(x.period) : "", cost:Number(x.actual)||Number(x.budget)||0, responsible:"" });
  });
  return items.sort(function(a, b) {
    return String(a.when || "9999").localeCompare(String(b.when || "9999")) || a.type.localeCompare(b.type, "sv");
  });
}
function activityGroupLabel(group) {
  return {
    all:"Allt aktuellt",
    project:"Projekt",
    maintenance:"Underhåll",
    drift:"Driftärenden",
    wish:"Önskemål",
    investigation:"Utredningar",
    operations:"Driftkostnader"
  }[group] || "Allt aktuellt";
}
function portfolioActivityHtml(contracts) {
  const allItems = portfolioActivityItems(contracts);
  const groups = [
    ["all","Allt",allItems],
    ["project","Projekt",allItems.filter(function(x){return x.group==="project";})],
    ["maintenance","Underhåll",allItems.filter(function(x){return x.group==="maintenance";})],
    ["drift","Driftärenden",allItems.filter(function(x){return x.group==="drift";})],
    ["wish","Önskemål",allItems.filter(function(x){return x.group==="wish";})],
    ["investigation","Utredningar",allItems.filter(function(x){return x.group==="investigation";})],
    ["operations","Driftkostnader",allItems.filter(function(x){return x.group==="operations";})]
  ];
  const cards = groups.map(function(group) {
    const key=group[0], label=group[1], items=group[2];
    const cost=items.reduce(function(sum,x){return sum+(Number(x.cost)||0);},0);
    return '<button type="button" class="activity-card ' + (portfolioExplorer.activity===key ? "active" : "") +
      '" data-explorer-activity="' + key + '"><span>' + esc(label) + '</span><strong>' + items.length +
      '</strong><small>' + (key==="all" ? "poster i urvalet" : money(cost)) + '</small></button>';
  }).join("");
  const selected = portfolioExplorer.activity==="all" ? allItems : allItems.filter(function(x){return x.group===portfolioExplorer.activity;});
  const rows = selected.map(function(x) {
    const property = state.properties.find(function(p){return p.id===x.propertyId;});
    return '<tr>' +
      '<td>' + statusBadge(x.type) + '</td>' +
      '<td><strong>' + esc(x.title || "–") + '</strong></td>' +
      '<td><button type="button" class="table-link" data-explorer-property="' + esc(x.propertyId||"") + '">' +
        esc(property ? (property.address||property.id) : (x.propertyId||"–")) + '</button></td>' +
      '<td>' + (x.contractId ? '<button type="button" class="table-link mono" data-explorer-contract="' + esc(x.contractId) + '">' +
        esc((state.contracts.find(function(c){return c.id===x.contractId;})||{}).number || x.contractId) + '</button>' : "–") + '</td>' +
      '<td>' + esc(x.status || "–") + '</td><td>' + esc(x.when || "–") + '</td><td>' + money(x.cost) + '</td><td>' +
      esc(x.responsible || "–") + '</td></tr>';
  });
  return '<section class="activity-section"><div class="activity-section-head"><div><h3>Aktuellt i urvalet</h3>' +
    '<p>Samma poster oavsett om du tittar på helheten, VÅRDBO, en fastighet eller ett avtal.</p></div>' +
    '<strong>' + esc(activityGroupLabel(portfolioExplorer.activity)) + '</strong></div>' +
    '<div class="activity-cards">' + cards + '</div>' +
    table(["Typ","Aktivitet","Fastighet","Avtal","Status","Tid","Kostnad","Ansvarig"], rows) + '</section>';
}
function portfolioContextHtml() {
  const parts = ['<span class="context-root">Helhet</span>'];
  const unit = document.getElementById("filter-unit");
  if (unit && unit.value) parts.push('<span>›</span><button type="button" data-clear-filter="filter-unit">' + esc(unit.options[unit.selectedIndex].text) + ' ×</button>');
  if (portfolioExplorer.propertyId) {
    const p=state.properties.find(function(x){return x.id===portfolioExplorer.propertyId;});
    parts.push('<span>›</span><button type="button" data-clear-explorer="property">' + esc(p ? (p.address||p.id) : portfolioExplorer.propertyId) + ' ×</button>');
  }
  if (portfolioExplorer.contractId) {
    const c=state.contracts.find(function(x){return x.id===portfolioExplorer.contractId;});
    parts.push('<span>›</span><button type="button" data-clear-explorer="contract">' + esc(c ? (c.number||c.id) : portfolioExplorer.contractId) + ' ×</button>');
  }
  if (portfolioExplorer.activity!=="all") parts.push('<span>›</span><button type="button" data-explorer-activity="all">' + esc(activityGroupLabel(portfolioExplorer.activity)) + ' ×</button>');
  return parts.join("");
}
function updatePortfolioContextBanner() {
  const el=document.getElementById("portfolio-context");
  if(el) el.innerHTML=portfolioContextHtml();
}

function portfolioOverviewHtml(contracts) {
  const propertyIds = new Set(contracts.map(function(c) { return c.propertyId; }).filter(Boolean));
  const totalArea = contracts.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0);
  const totalCost = contracts.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0);
  const costPerSqm = totalArea ? totalCost / totalArea : 0;

  const customerRows = portfolioPatternRows(
    contracts,
    function(c) { return contractCustomerKey(c); },
    function(c) { return contractCustomer(c); },
    function(c) { return c.area; }
  );
  const unitRows = portfolioPatternRows(
    contracts,
    function(c) { return c.unitId || "Ej satt"; },
    function(c) { return unitName(c.unitId); },
    function(c) { return c.area; }
  );
  const ownerRows = portfolioPatternRows(
    contracts,
    function(c) {
      const property = state.properties.find(function(p) { return p.id === c.propertyId; });
      return contractOwnerKey(c, property);
    },
    function(c) {
      const property = state.properties.find(function(p) { return p.id === c.propertyId; });
      return contractOwner(c, property);
    },
    function(c) { return totalContractCost(c); }
  );

  const responsibility = new Map();
  let missingResponsible = 0;
  contracts.forEach(function(c) {
    const people = contractPartyPeople(c, "our");
    if (!people.length) {
      missingResponsible += 1;
      return;
    }
    people.forEach(function(person) {
      const row = responsibility.get(person.id) || { key: person.id, label: person.name, count: 0, value: 0 };
      row.count += 1;
      row.value += 1;
      responsibility.set(person.id, row);
    });
  });
  const responsibilityRows = Array.from(responsibility.values()).sort(function(a, b) { return b.count - a.count; });

  const watch = contracts.map(function(c) {
    const months = monthsUntil(c.notice || c.end);
    return { contract: c, months: months, date: c.notice || c.end || "" };
  }).filter(function(x) { return x.months != null && x.months >= 0; }).sort(function(a, b) { return a.months - b.months; });

  const within12 = watch.filter(function(x) { return x.months <= 12; }).length;
  const within24 = watch.filter(function(x) { return x.months > 12 && x.months <= 24; }).length;
  const noDate = contracts.filter(function(c) { return !c.notice && !c.end; }).length;

  function concentrationText(rows, denominator, suffix) {
    if (!rows.length || !denominator) return "–";
    return percent(rows[0].value / denominator * 100) + " hos " + rows[0].label + (suffix || "");
  }

  const watchRows = watch.slice(0, 6).map(function(item) {
    const c = item.contract;
    return '<tr><td><strong>' + esc(c.number || c.id) + '</strong></td><td>' +
      esc(propertyName(c.propertyId)) + '</td><td>' + esc(item.date) + '</td><td>' +
      (item.months <= 12 ? statusBadge("≤ 12 mån") : statusBadge(item.months <= 24 ? "13–24 mån" : "> 24 mån")) +
      '</td></tr>';
  });

  return '<div class="overview-kpis">' +
      kpi("Fastigheter", num(propertyIds.size), "i aktuellt urval") +
      kpi("Avtal", num(contracts.length), "aktiva i urvalet") +
      kpi("Area", num(totalArea) + " kvm", contracts.length ? num(totalArea / Math.max(1, propertyIds.size)) + " kvm / fastighet" : "–") +
      kpi("Hyra + drift", money(totalCost), totalArea ? num(costPerSqm) + " kr/kvm" : "kostnad per kvm saknas") +
    '</div>' +
    '<div class="pattern-insights">' +
      '<div><span>Största kundkoncentration</span><strong>' + esc(concentrationText(customerRows, totalArea, " av arean")) + '</strong></div>' +
      '<div><span>Största ägarkoncentration</span><strong>' + esc(concentrationText(ownerRows, totalCost, " av kostnaden")) + '</strong></div>' +
      '<div><span>Avtal att bevaka</span><strong>' + within12 + ' inom 12 mån · ' + within24 + ' inom 24 mån</strong></div>' +
      '<div><span>Saknar ansvarig hos oss</span><strong>' + missingResponsible + ' av ' + contracts.length + ' avtal</strong></div>' +
    '</div>' +
    '<div class="pattern-grid">' +
      portfolioPatternHtml("Kunder", "Fördelning av area", customerRows, function(row) { return num(row.value) + " kvm · " + row.count + " avtal"; }, "filter-customer") +
      portfolioPatternHtml("Organisation", "Klicka t.ex. VÅRDBO för att se hela verksamhetsområdet", unitRows, function(row) { return num(row.value) + " kvm · " + row.count + " avtal"; }, "filter-unit") +
      portfolioPatternHtml("Fastighetsägare", "Fördelning av hyra + drift", ownerRows, function(row) { return money(row.value) + " · " + row.count + " avtal"; }, "filter-owner") +
      portfolioPatternHtml("Ansvar hos oss", "Antal avtal per ansvarig", responsibilityRows, function(row) { return row.count + " avtal"; }, "filter-our-person") +
    '</div>' +
    '<div class="pattern-watch">' +
      '<div class="pattern-head"><h3>Avtalsbevakning</h3><p>Närmaste uppsägningsdatum, annars avtalslut. ' +
      (noDate ? noDate + ' avtal saknar båda datumen.' : 'Alla avtal har bevakningsdatum.') + '</p></div>' +
      table(["Avtal", "Fastighet", "Bevakningsdatum", "Tid kvar"], watchRows) +
    '</div>' +
    portfolioActivityHtml(contracts);
}
function updatePortfolioOverview(contracts) {
  const container = document.getElementById("portfolio-overview-content");
  if (container) container.innerHTML = portfolioOverviewHtml(contracts);
}

function renderProperties() {
  const filters = portfolioFilterOptions();
  const propertyGroups = state.properties.map(function(p) {
    const contracts = state.contracts.filter(function(c) { return c.propertyId === p.id; });
    const area = contracts.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0);
    const cost = contracts.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0);
    const owners = Array.from(new Set(contracts.map(function(c) { return contractOwner(c, p); }).filter(Boolean)));
    const units = Array.from(new Set(contracts.map(function(c) { return unitName(c.unitId); }).filter(Boolean)));
    const customers = Array.from(new Set(contracts.map(contractCustomer).filter(Boolean)));
    const contractRows = contracts.map(function(c) { return contractSummaryRow(c, p); });
    return '<details class="property-group" data-property-id="' + esc(p.id) + '">' +
      '<summary class="property-summary">' +
        '<span class="property-summary-main"><strong>' + esc(p.address || "Adress saknas") + '</strong>' +
          '<span class="muted mono">' + esc(p.id) + (p.designation ? ' · ' + esc(p.designation) : '') + '</span></span>' +
        '<span><small>Typ</small>' + statusBadge(p.type) + '</span>' +
        '<span><small>Kund</small><strong>' + esc(customers.join(", ") || "–") + '</strong></span>' +
        '<span><small>Fastighetsägare</small><strong>' + esc(owners.join(", ") || p.owner || "–") + '</strong></span>' +
        '<span><small>Avtal</small><strong>' + contracts.length + '</strong></span>' +
        '<span><small>Area</small><strong>' + num(area) + ' kvm</strong></span>' +
        '<span><small>Hyra + drift</small><strong>' + money(cost) + '</strong></span>' +
        '<span class="property-chevron" aria-hidden="true">⌄</span>' +
      '</summary>' +
      '<div class="property-body">' +
        '<div class="property-meta"><span><strong>Organisation</strong> ' + esc(units.join(", ") || "–") + '</span>' +
        '<span><strong>Fastighetsbeteckning</strong> ' + esc(p.designation || "–") + '</span>' +
        '<span><strong>Förvaltare</strong> ' + esc(p.manager || "–") + '</span>' +
        '<button type="button" class="inline-link" data-explorer-property="' + esc(p.id) + '">Visa allt för fastigheten</button></div>' +
        table(["Avtal", "Kund", "Organisation", "Fastighetsägare", "Area", "Hyra + drift", "Ansvarig hos oss", "Kundansvarig", "Ägaransvarig"], contractRows) +
      '</div>' +
    '</details>';
  }).join("") || '<div class="empty">Ingen fastighetsdata.</div>';

  const contractRows = state.contracts.map(detailedContractRow);
  const filterBar =
    '<div class="portfolio-filters">' +
      '<input class="search portfolio-search" id="portfolio-search" placeholder="Sök fastighet, adress, avtal, kund, person…">' +
      '<select class="select" id="filter-customer">' + selectOptions(filters.customer, "Alla kunder") + '</select>' +
      '<select class="select" id="filter-unit">' + selectOptions(filters.unit, "Alla organisationer") + '</select>' +
      '<select class="select" id="filter-owner">' + selectOptions(filters.owner, "Alla fastighetsägare") + '</select>' +
      '<select class="select" id="filter-our-person">' + selectOptions(filters.ourPeople, "Ansvarig hos oss") + '</select>' +
      '<select class="select" id="filter-tenant-person">' + selectOptions(filters.tenantPeople, "Kundansvarig") + '</select>' +
      '<select class="select" id="filter-owner-person">' + selectOptions(filters.ownerPeople, "Ägaransvarig") + '</select>' +
      '<button class="button secondary filter-reset" id="portfolio-filter-reset">Rensa</button>' +
    '</div>' +
    '<div class="filter-result" id="portfolio-filter-result">' + state.properties.length + ' fastigheter · ' + state.contracts.length + ' avtal</div>';

  return '<div class="section-stack">' +
    '<div class="view-tabs" role="tablist" aria-label="Fastigheter och avtal">' +
      '<button class="view-tab active" type="button" data-property-tab="overview" role="tab" aria-selected="true">Helhet <span>↗</span></button>' +
      '<button class="view-tab" type="button" data-property-tab="properties" role="tab" aria-selected="false">Fastigheter <span>' + state.properties.length + '</span></button>' +
      '<button class="view-tab" type="button" data-property-tab="contracts" role="tab" aria-selected="false">Avtal <span>' + state.contracts.length + '</span></button>' +
    '</div>' +
    card("Fastigheter & avtal", "Se först portföljens helhet och mönster. Gå sedan vidare till fastighet eller avtal utan att tappa samma filterurval.",
      filterBar +
      '<div class="portfolio-context" id="portfolio-context">' + portfolioContextHtml() + '</div>' +
      '<div class="property-tab-panel" id="overview-panel"><div id="portfolio-overview-content">' + portfolioOverviewHtml(state.contracts) + '</div></div>' +
      '<div class="property-tab-panel" id="properties-panel" hidden>' + propertyGroups + '</div>' +
      '<div class="property-tab-panel" id="contracts-panel" hidden>' +
        table(["Avtal", "Fastighet", "Kund", "Organisation", "Fastighetsägare", "Area", "Avtalsperiod", "Årshyra", "Avtalsdrift", "Summa", "Anst./brukare/rum", "Ytor", "Ansvariga"], contractRows) +
      '</div>',
      '<button class="button primary" data-add="object">Komplettera avtal</button>') +
  '</div>';
}
function renderMap() {
  const mapped = state.properties.filter(function(p) {
    return Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
  });
  const missing = state.properties.length - mapped.length;
  const units = Array.from(new Set(state.contracts.map(function(c) { return c.unitId; }).filter(Boolean)));
  return card(
    "Karta",
    "Hover på dator eller tryck på mobil för att se information om platsen.",
    '<div class="toolbar map-toolbar">' +
      '<select class="select" id="map-type"><option value="">Alla fastigheter</option><option>Intern</option><option>Extern</option></select>' +
      '<select class="select" id="map-unit"><option value="">Alla verksamhetsområden</option>' +
        units.map(function(id) { return '<option value="' + esc(id) + '">' + esc(unitName(id)) + '</option>'; }).join("") +
      '</select>' +
      '<span class="map-count">' + mapped.length + ' kartlagda' + (missing ? ' · ' + missing + ' saknar koordinat' : '') + '</span>' +
    '</div>' +
    '<div id="property-map" class="property-map" role="region" aria-label="Karta över fastigheter"></div>' +
    '<div class="map-footnote">Demokartan använder syntetiska koordinater. I företagsversionen hämtas koordinater via backend och godkänd karttjänst.</div>'
  );
}

function mapPropertySummary(p) {
  const cs = state.contracts.filter(function(c) { return c.propertyId === p.id; });
  const area = cs.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0);
  const cost = cs.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0);
  const units = Array.from(new Set(cs.map(function(c) { return unitName(c.unitId); }).filter(Boolean)));
  const projects = state.projects.filter(function(x) { return x.propertyId === p.id && x.status !== "Klar"; }).length;
  const issues = state.driftIssues.filter(function(x) { return x.propertyId === p.id && x.status !== "Klar"; }).length;
  const wishes = state.wishes.filter(function(x) { return x.propertyId === p.id && x.status !== "Klart" && x.status !== "Avslaget"; }).length;
  return {
    contracts: cs.length,
    area: area,
    cost: cost,
    units: units,
    projects: projects,
    issues: issues,
    wishes: wishes
  };
}

function mapPopupHtml(p) {
  const x = mapPropertySummary(p);
  return '<div class="map-popup">' +
    '<div class="map-popup-kicker">' + esc(p.type || "Fastighet") + ' · ' + esc(p.id) + '</div>' +
    '<div class="map-popup-title">' + esc(p.address || "Adress saknas") + '</div>' +
    '<div class="map-popup-sub">' + esc(p.designation || "") + '</div>' +
    '<div class="map-popup-grid">' +
      '<span>Fastighetsägare</span><strong>' + esc(p.owner || "–") + '</strong>' +
      '<span>Objekt / avtal</span><strong>' + num(x.contracts) + '</strong>' +
      '<span>Area</span><strong>' + num(x.area) + ' kvm</strong>' +
      '<span>Hyra + drift</span><strong>' + money(x.cost) + '</strong>' +
      '<span>Organisation</span><strong>' + esc(x.units.join(", ") || "–") + '</strong>' +
    '</div>' +
    '<div class="map-popup-status">' +
      '<span>' + x.projects + ' projekt</span>' +
      '<span>' + x.issues + ' driftärenden</span>' +
      '<span>' + x.wishes + ' önskemål</span>' +
    '</div>' +
  '</div>';
}

function initPropertyMap() {
  const mapService = window.LokalblickMapService;
  if (!mapService) return;

  function buildPoints() {
    const type = document.getElementById("map-type") ? document.getElementById("map-type").value : "";
    const unit = document.getElementById("map-unit") ? document.getElementById("map-unit").value : "";

    return state.properties.filter(function(p) {
      if (!Number.isFinite(Number(p.latitude)) || !Number.isFinite(Number(p.longitude))) return false;
      if (type && p.type !== type) return false;
      if (unit) {
        const hasUnit = state.contracts.some(function(c) {
          return c.propertyId === p.id && c.unitId === unit;
        });
        if (!hasUnit) return false;
      }
      return true;
    }).map(function(p) {
      return {
        id: p.id,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        popupHtml: mapPopupHtml(p),
        category: p.type || "Fastighet"
      };
    });
  }

  mapService.render({
    elementId: "property-map",
    points: buildPoints(),
    fallbackCenter: { latitude: 55.6050, longitude: 13.0038, zoom: 12 }
  });

  function redraw() {
    mapService.update(buildPoints());
  }

  const type = document.getElementById("map-type");
  const unit = document.getElementById("map-unit");
  if (type) type.addEventListener("change", redraw);
  if (unit) unit.addEventListener("change", redraw);
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

function renderAbout() {
  return '<div class="about-page">' +
    '<div class="about-intro">' +
      '<div><div class="about-kicker">LOKALBLICK-PRINCIPEN</div><h2>Produkten kan vara publik – kundens data ska inte vara det.</h2>' +
      '<p>Lokalblick kan köras som vanlig webb, Teams-flik eller white-label. Det som skiljer kunderna åt är datakällorna och behörigheten bakom API-gränsen.</p></div>' +
      '<div class="about-rule"><strong>Grundregel</strong><span>Ingen rå kunddata, fil, API-nyckel eller hemlighet byggs in i frontend eller publik kod.</span></div>' +
    '</div>' +

    '<div class="security-architecture" aria-label="Illustration över publik och skyddad miljö">' +
      '<section class="security-zone public-zone">' +
        '<div class="security-zone-head"><span class="zone-icon">◎</span><div><span class="zone-label">PUBLIK / EXTERN</span><h3>Lokalblick-tjänsten</h3></div></div>' +
        '<p class="zone-copy">Det här kan ligga på internet och användas från webb, Teams eller en kundportal.</p>' +
        '<div class="zone-items">' +
          '<div class="zone-item"><strong>Frontend / UI</strong><span>Fastighet, objekt, budget, projekt och karta</span></div>' +
          '<div class="zone-item"><strong>Map adapter</strong><span>Visualiserar koordinater som användaren får se</span></div>' +
          '<div class="zone-item"><strong>Inloggning</strong><span>Visar inget skyddat innehåll före godkänd autentisering</span></div>' +
        '</div>' +
        '<div class="zone-safe"><strong>Får vara publikt:</strong> programkod, layout, tomma vyer, dokumentation och API-adress.</div>' +
      '</section>' +

      '<section class="security-bridge">' +
        '<div class="bridge-arrow">→</div>' +
        '<div class="bridge-card">' +
          '<span class="zone-label">SÄKER GRÄNS</span><h3>Lokalblick API + connector</h3>' +
          '<div class="bridge-list">' +
            '<span>✓ autentiserar användaren</span>' +
            '<span>✓ kontrollerar behörighet</span>' +
            '<span>✓ mappar till Lokalblick-modellen</span>' +
            '<span>✓ filtrerar bort otillåten data</span>' +
            '<span>✓ loggar och validerar anrop</span>' +
          '</div>' +
          '<div class="bridge-lock">🔒 Endast godkända anrop passerar</div>' +
        '</div>' +
        '<div class="bridge-arrow">←</div>' +
      '</section>' +

      '<section class="security-zone private-zone">' +
        '<div class="security-zone-head"><span class="zone-icon">⌂</span><div><span class="zone-label">SKYDDAD HEMMAMILJÖ</span><h3>Kundens datalager</h3></div></div>' +
        '<p class="zone-copy">Masterdata ligger kvar i kundens godkända miljö och kopplas via en adapter.</p>' +
        '<div class="zone-items">' +
          '<div class="zone-item"><strong>M365 / SharePoint / Lists</strong><span>LEB, dokument, personer och kompletteringar</span></div>' +
          '<div class="zone-item"><strong>Fastighetssystem / API</strong><span>Kundens befintliga verksamhetssystem</span></div>' +
          '<div class="zone-item"><strong>SQL / Dataverse / filer</strong><span>Andra interna eller avtalade datalager</span></div>' +
        '</div>' +
        '<div class="zone-danger"><strong>Ska stanna här:</strong> råfiler, full masterdata, credentials, API-nycklar och systemhemligheter.</div>' +
      '</section>' +
    '</div>' +

    '<div class="data-flow-note"><strong>Vad passerar gränsen?</strong><span>Bara den information den inloggade användaren behöver och har rätt att se. Frontend måste få de visade posterna, men källsystemet och dess hemligheter exponeras aldrig.</span></div>' +

    '<div class="about-grid">' +
      '<section class="about-card"><div class="about-card-head"><span>1</span><h3>Så bygger ni kopplingen</h3></div>' +
        '<ol class="connection-steps">' +
          '<li><strong>Välj datakällan</strong><span>Behåll data i M365, fastighetssystem, SQL eller annan godkänd källa.</span></li>' +
          '<li><strong>Välj eller bygg en adapter</strong><span>Adaptern kan ligga nära datakällan och pratar med dess API eller filer.</span></li>' +
          '<li><strong>Mappa till Lokalblick-modellen</strong><span>Fastighet, Objekt/Avtal, Projekt, Person, Budget, geodata med mera får samma struktur.</span></li>' +
          '<li><strong>Sätt autentisering och behörighet</strong><span>OAuth/Entra eller annan godkänd metod och minsta möjliga rättighet.</span></li>' +
          '<li><strong>Anslut till Lokalblick API</strong><span>API:t returnerar endast tillåtna fält och poster till användaren.</span></li>' +
        '</ol>' +
      '</section>' +

      '<section class="about-card"><div class="about-card-head"><span>2</span><h3>Vad kan bytas utan att UI byggs om?</h3></div>' +
        '<div class="swap-stack">' +
          '<div><strong>Datakälla</strong><span>M365 ↔ fastighetssystem ↔ SQL ↔ annat API</span></div>' +
          '<div class="swap-arrow">↓</div>' +
          '<div><strong>Source adapter</strong><span>Översätter kundens struktur till Lokalblick</span></div>' +
          '<div class="swap-arrow">↓</div>' +
          '<div><strong>Lokalblick API</strong><span>Samma kontrakt mot frontend</span></div>' +
          '<div class="swap-arrow">↓</div>' +
          '<div><strong>Samma Lokalblick</strong><span>Webb · Teams · white-label</span></div>' +
        '</div>' +
      '</section>' +
    '</div>' +

    '<section class="about-principles">' +
      '<h3>Fyra regler vi bygger efter</h3>' +
      '<div class="principle-grid">' +
        '<div><span>01</span><strong>Frontend är inte databasen</strong><p>Webbläsaren visar data men äger inte kundens masterdata.</p></div>' +
        '<div><span>02</span><strong>Hemligheter stannar server-side</strong><p>API-nycklar och credentials får aldrig hamna i JavaScript eller GitHub.</p></div>' +
        '<div><span>03</span><strong>Minsta möjliga åtkomst</strong><p>Varje connector får bara läsa eller skriva det som behövs.</p></div>' +
        '<div><span>04</span><strong>Adapter före specialkod</strong><p>Nya källor kopplas in utan att Lokalblicks vyer byggs om.</p></div>' +
      '</div>' +
    '</section>' +
  '</div>';
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
  document.querySelectorAll("[data-property-tab]").forEach(function(button) {
    button.addEventListener("click", function() {
      const target = button.dataset.propertyTab;
      document.querySelectorAll("[data-property-tab]").forEach(function(tab) {
        const active = tab.dataset.propertyTab === target;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      });
      const overviewPanel = document.getElementById("overview-panel");
      const propertiesPanel = document.getElementById("properties-panel");
      const contractsPanel = document.getElementById("contracts-panel");
      if (overviewPanel) overviewPanel.hidden = target !== "overview";
      if (propertiesPanel) propertiesPanel.hidden = target !== "properties";
      if (contractsPanel) contractsPanel.hidden = target !== "contracts";
    });
  });
  ["portfolio-search", "filter-customer", "filter-unit", "filter-owner", "filter-our-person", "filter-tenant-person", "filter-owner-person"].forEach(function(id) {
    const control = document.getElementById(id);
    if (control) control.addEventListener(id === "portfolio-search" ? "input" : "change", filterPropertyPortfolio);
  });
  const reset = document.getElementById("portfolio-filter-reset");
  if (reset) reset.addEventListener("click", function() {
    ["portfolio-search", "filter-customer", "filter-unit", "filter-owner", "filter-our-person", "filter-tenant-person", "filter-owner-person"].forEach(function(id) {
      const control = document.getElementById(id);
      if (control) control.value = "";
    });
    portfolioExplorer = { propertyId: "", contractId: "", activity: "all" };
    filterPropertyPortfolio();
  });
  bindPortfolioExplorerControls();
  const by = document.getElementById("budget-year");
  if (by) by.addEventListener("change", function() { selectedBudgetYear = Number(by.value); render(); });
}
function portfolioFilterValues() {
  function value(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
  }
  return {
    q: value("portfolio-search").trim().toLowerCase(),
    customer: value("filter-customer"),
    unit: value("filter-unit"),
    owner: value("filter-owner"),
    ourPerson: value("filter-our-person"),
    tenantPerson: value("filter-tenant-person"),
    ownerPerson: value("filter-owner-person")
  };
}
function contractMatchesPortfolio(c, filters) {
  const property = state.properties.find(function(p) { return p.id === c.propertyId; });
  if (portfolioExplorer.propertyId && c.propertyId !== portfolioExplorer.propertyId) return false;
  if (portfolioExplorer.contractId && c.id !== portfolioExplorer.contractId) return false;
  if (filters.customer && contractCustomerKey(c) !== filters.customer) return false;
  if (filters.unit && c.unitId !== filters.unit) return false;
  if (filters.owner && contractOwnerKey(c, property) !== filters.owner) return false;
  if (filters.ourPerson && !contractPartyPeople(c, "our").some(function(p) { return p.id === filters.ourPerson; })) return false;
  if (filters.tenantPerson && !contractPartyPeople(c, "tenant").some(function(p) { return p.id === filters.tenantPerson; })) return false;
  if (filters.ownerPerson && !contractPartyPeople(c, "owner").some(function(p) { return p.id === filters.ownerPerson; })) return false;
  if (filters.q) {
    const searchable = [
      c.id, c.number, c.category, c.use, contractCustomer(c), unitName(c.unitId), contractOwner(c, property),
      property && property.id, property && property.address, property && property.designation,
      peopleText(c, "our"), peopleText(c, "tenant"), peopleText(c, "owner")
    ].filter(Boolean).join(" ").toLowerCase();
    if (!searchable.includes(filters.q)) return false;
  }
  return true;
}
function bindPortfolioExplorerControls() {
  document.querySelectorAll("[data-set-filter]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function() {
      const control=document.getElementById(button.dataset.setFilter);
      if(control) {
        control.value=button.dataset.filterValue || "";
        portfolioExplorer.propertyId="";
        portfolioExplorer.contractId="";
        filterPropertyPortfolio();
      }
    });
  });
  document.querySelectorAll("[data-explorer-property]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound="1";
    button.addEventListener("click", function(event) {
      event.preventDefault(); event.stopPropagation();
      portfolioExplorer.propertyId=button.dataset.explorerProperty || "";
      portfolioExplorer.contractId="";
      filterPropertyPortfolio();
      const overviewTab=document.querySelector('[data-property-tab="overview"]');
      if(overviewTab) overviewTab.click();
    });
  });
  document.querySelectorAll("[data-explorer-contract]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound="1";
    button.addEventListener("click", function(event) {
      event.preventDefault(); event.stopPropagation();
      const contract=state.contracts.find(function(x){return x.id===button.dataset.explorerContract;});
      portfolioExplorer.contractId=button.dataset.explorerContract || "";
      portfolioExplorer.propertyId=contract ? contract.propertyId : portfolioExplorer.propertyId;
      filterPropertyPortfolio();
      const overviewTab=document.querySelector('[data-property-tab="overview"]');
      if(overviewTab) overviewTab.click();
    });
  });
  document.querySelectorAll("[data-explorer-activity]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound="1";
    button.addEventListener("click", function() {
      portfolioExplorer.activity=button.dataset.explorerActivity || "all";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-clear-explorer]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound="1";
    button.addEventListener("click", function() {
      if(button.dataset.clearExplorer==="property") { portfolioExplorer.propertyId=""; portfolioExplorer.contractId=""; }
      if(button.dataset.clearExplorer==="contract") portfolioExplorer.contractId="";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-clear-filter]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound="1";
    button.addEventListener("click", function() {
      const control=document.getElementById(button.dataset.clearFilter);
      if(control) control.value="";
      filterPropertyPortfolio();
    });
  });
}
function filterPropertyPortfolio() {
  const filters = portfolioFilterValues();
  const matchedPortfolioContracts = state.contracts.filter(function(c) { return contractMatchesPortfolio(c, filters); });
  const matchedContractIds = new Set(matchedPortfolioContracts.map(function(c) { return c.id; }));
  updatePortfolioOverview(matchedPortfolioContracts);
  updatePortfolioContextBanner();
  bindPortfolioExplorerControls();
  let visibleProperties = 0;
  let visibleContracts = 0;
  document.querySelectorAll(".property-group[data-property-id]").forEach(function(group) {
    const property = state.properties.find(function(p) { return p.id === group.dataset.propertyId; });
    const contracts = state.contracts.filter(function(c) { return c.propertyId === group.dataset.propertyId; });
    const matchedContracts = contracts.filter(function(c) { return matchedContractIds.has(c.id); });
    let propertyMatches = matchedContracts.length > 0;
    if (!contracts.length && !filters.customer && !filters.unit && !filters.owner && !filters.ourPerson && !filters.tenantPerson && !filters.ownerPerson) {
      const propertyText = [property && property.id, property && property.address, property && property.designation, property && property.owner].filter(Boolean).join(" ").toLowerCase();
      propertyMatches = !filters.q || propertyText.includes(filters.q);
    }
    group.hidden = !propertyMatches;
    if (propertyMatches) {
      visibleProperties += 1;
      group.querySelectorAll("tbody tr[data-contract-id]").forEach(function(row) {
        const contract = state.contracts.find(function(c) { return c.id === row.dataset.contractId; });
        row.hidden = !contract || !matchedContractIds.has(contract.id);
      });
    }
  });
  document.querySelectorAll("#contracts-panel tbody tr[data-contract-id]").forEach(function(row) {
    const contract = state.contracts.find(function(c) { return c.id === row.dataset.contractId; });
    const match = contract && matchedContractIds.has(contract.id);
    row.hidden = !match;
    if (match) visibleContracts += 1;
  });
  const result = document.getElementById("portfolio-filter-result");
  if (result) result.textContent = visibleProperties + " fastigheter · " + visibleContracts + " avtal";
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
