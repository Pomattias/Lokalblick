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
  { id: "properties", label: "Bestånd", icon: "▦", eyebrow: "URVAL · FASTIGHET · AVTAL · AKTUELLT" },
  { id: "map", label: "Karta", icon: "⌖", eyebrow: "GEOGRAFI" },
  { id: "budget", label: "Årsbudget", icon: "¤", eyebrow: "EKONOMI" },
  { id: "organisation", label: "Organisation", icon: "◎", eyebrow: "PERSONER & ANSVAR" },
  { id: "about", label: "Om", icon: "ⓘ", eyebrow: "SÄKERHET & ARKITEKTUR" }
];

let state = clone(demo);
let currentView = "properties";
let selectedBudgetYear = new Date().getFullYear() + 1;
let maintenancePlanning = { year: new Date().getFullYear() + 1, mode: "quarter" };
let mobileMapMetric = "cost";
let editorType = null;
let editorRecord = null;
let portfolioExplorer = { propertyId: "", contractId: "", section: "overview" };
let portfolioFilters = {
  q: "", customer: "", unit: "", owner: "", ourPerson: "", tenantPerson: "", ownerPerson: ""
};

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
    wishes: (data && data.wishes) || [],
    budgetPlans: (data && data.budgetPlans) || []
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

function shortMoney(n) {
  const value = Number(n) || 0;
  if (Math.abs(value) >= 1000000) return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(value / 1000000) + " mkr";
  if (Math.abs(value) >= 1000) return new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(value / 1000) + " tkr";
  return money(value);
}
function maintenanceSourceYear(type, item) {
  return type === "maintenanceStatus" ? Number(item.budgetYear) || null : Number(item.year) || null;
}
function maintenanceSourceCost(type, item) {
  return type === "maintenanceStatus" ? Number(item.estimatedCost) || 0 : Number(item.cost) || 0;
}
function maintenanceSourceTitle(type, item) {
  return type === "maintenanceStatus"
    ? item.category + (item.actionNeed ? " · " + item.actionNeed : "")
    : item.title;
}
function maintenanceTimingLabel(item) {
  const month = Number(item.planningMonth) || 0;
  const quarter = Number(item.planningQuarter) || (month ? Math.ceil(month / 3) : 0);
  if (month) return "Månad " + month;
  if (quarter) return "Q" + quarter;
  return "Ej placerad";
}
function maintenancePlanningYears() {
  const years = new Set([new Date().getFullYear(), new Date().getFullYear() + 1, new Date().getFullYear() + 2]);
  state.maintenance.forEach(function(x){ if (x.year) years.add(Number(x.year)); });
  state.maintenanceStatus.forEach(function(x){ if (x.budgetYear) years.add(Number(x.budgetYear)); });
  return Array.from(years).filter(Boolean).sort(function(a,b){return a-b;});
}
function maintenancePlanningItems(contracts) {
  const contractIds = new Set(contracts.map(function(c){return c.id;}));
  const propertyIds = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean));
  function inScope(item) {
    return (item.contractId && contractIds.has(item.contractId)) ||
      (!item.contractId && item.propertyId && propertyIds.has(item.propertyId));
  }
  const rows = [];
  state.maintenance.filter(inScope).forEach(function(item){
    rows.push({
      sourceType:"maintenance",
      source:item,
      id:item.id,
      title:maintenanceSourceTitle("maintenance",item),
      propertyId:item.propertyId,
      contractId:item.contractId,
      year:maintenanceSourceYear("maintenance",item),
      cost:maintenanceSourceCost("maintenance",item),
      status:item.status || item.priority || "",
      priority:item.priority || ""
    });
  });
  state.maintenanceStatus.filter(function(item){
    return inScope(item) && (item.actionNeed || Number(item.estimatedCost) > 0 || item.status === "Åtgärdsbehov" || item.status === "Akut");
  }).forEach(function(item){
    rows.push({
      sourceType:"maintenanceStatus",
      source:item,
      id:item.id,
      title:maintenanceSourceTitle("maintenanceStatus",item),
      propertyId:item.propertyId,
      contractId:item.contractId,
      year:maintenanceSourceYear("maintenanceStatus",item),
      cost:maintenanceSourceCost("maintenanceStatus",item),
      status:item.status || "",
      priority:item.priority || ""
    });
  });
  return rows.sort(function(a,b){
    return (b.cost-a.cost) || a.title.localeCompare(b.title,"sv");
  });
}
function maintenancePlannerHtml(contracts) {
  const years = maintenancePlanningYears();
  if (!years.includes(Number(maintenancePlanning.year))) maintenancePlanning.year = years[0] || (new Date().getFullYear()+1);
  const mode = maintenancePlanning.mode === "month" ? "month" : "quarter";
  const slotCount = mode === "month" ? 12 : 4;
  const rows = maintenancePlanningItems(contracts).filter(function(item){return Number(item.year)===Number(maintenancePlanning.year);});
  const slotTotals = Array.from({length:slotCount},function(){return {amount:0,count:0};});
  let unplacedAmount = 0;
  let unplacedCount = 0;

  rows.forEach(function(item){
    const month = Number(item.source.planningMonth) || 0;
    const quarter = Number(item.source.planningQuarter) || (month ? Math.ceil(month/3) : 0);
    const slot = mode === "month" ? month : quarter;
    if (slot >= 1 && slot <= slotCount) {
      slotTotals[slot-1].amount += item.cost;
      slotTotals[slot-1].count += 1;
    } else {
      unplacedAmount += item.cost;
      unplacedCount += 1;
    }
  });

  const headerSlots = slotTotals.map(function(slot,index){
    const label = mode === "month" ? String(index+1) : "Q"+(index+1);
    return '<div class="maintenance-plan-slot-head"><strong>' + label + '</strong><span>' +
      (slot.count ? shortMoney(slot.amount) : "–") + '</span></div>';
  }).join("");

  const bodyRows = rows.map(function(item){
    const property = state.properties.find(function(p){return p.id===item.propertyId;});
    const month = Number(item.source.planningMonth) || 0;
    const quarter = Number(item.source.planningQuarter) || (month ? Math.ceil(month/3) : 0);
    const buttons = Array.from({length:slotCount},function(_,index){
      const slot=index+1;
      const selected = mode === "month" ? month===slot : quarter===slot;
      const coarse = mode === "month" && !month && quarter && Math.ceil(slot/3)===quarter;
      const label = mode === "month" ? String(slot) : "Q"+slot;
      return '<button type="button" class="maintenance-plan-cell ' + (selected?"selected ":"") + (coarse?"coarse":"") +
        '" data-maintenance-source="' + esc(item.sourceType) + '" data-maintenance-id="' + esc(item.id) +
        '" data-maintenance-slot="' + slot + '" aria-label="Planera ' + esc(item.title) + ' till ' + label + '">' +
        (selected ? "✓" : coarse ? "·" : "") + '</button>';
    }).join("");
    const placement = maintenanceTimingLabel(item.source);
    return '<div class="maintenance-plan-row" style="--maintenance-slots:' + slotCount + '">' +
      '<div class="maintenance-plan-item"><strong>' + esc(item.title) + '</strong><span>' +
        esc(property ? (property.address||property.id) : (item.propertyId||"Fastighetsnivå")) +
        ' · ' + money(item.cost) + '</span><small>' + esc(item.priority || item.status || "Underhåll") +
        ' · ' + esc(placement) + '</small></div>' +
      buttons +
      '<button type="button" class="maintenance-plan-clear" data-maintenance-clear="' + esc(item.id) +
        '" data-maintenance-source="' + esc(item.sourceType) + '" aria-label="Rensa planering">×</button>' +
    '</div>';
  }).join("");

  return '<section class="maintenance-planner">' +
    '<div class="maintenance-planner-head"><div><span class="portfolio-kicker">ÅRSPLANERING</span><h3>När ska underhållet göras?</h3>' +
      '<p>Klicka direkt i tidslinjen. Kvartal räcker för överblick; välj månad när du vill planera mer exakt.</p></div>' +
      '<div class="maintenance-planner-controls"><select class="select" data-maintenance-plan-year>' +
        years.map(function(year){return '<option value="' + year + '"' + (Number(year)===Number(maintenancePlanning.year)?" selected":"") + '>' + year + '</option>';}).join("") +
      '</select><div class="planning-mode-toggle" role="group" aria-label="Detaljnivå">' +
        '<button type="button" data-maintenance-plan-mode="quarter" class="' + (mode==="quarter"?"active":"") + '">Q1–Q4</button>' +
        '<button type="button" data-maintenance-plan-mode="month" class="' + (mode==="month"?"active":"") + '">1–12</button>' +
      '</div></div></div>' +
    '<div class="maintenance-plan-summary"><div><span>' + (mode==="month"?"Månadsatt":"Planerat") + '</span><strong>' + shortMoney(slotTotals.reduce(function(s,x){return s+x.amount;},0)) +
      '</strong><small>' + slotTotals.reduce(function(s,x){return s+x.count;},0) + ' poster</small></div><div class="' + (unplacedCount?"attention":"") +
      '"><span>' + (mode==="month"?"Ej månadsatt":"Ej placerat") + '</span><strong>' + shortMoney(unplacedAmount) + '</strong><small>' + unplacedCount + ' poster</small></div></div>' +
    '<div class="maintenance-plan-scroll"><div class="maintenance-plan-board ' + mode + '">' +
      '<div class="maintenance-plan-header" style="--maintenance-slots:' + slotCount + '"><div><strong>Åtgärd</strong><span>Kostnad · nuvarande placering</span></div>' +
        headerSlots + '<div></div></div>' +
      (bodyRows || '<div class="empty">Inga underhållsposter för ' + maintenancePlanning.year + '.</div>') +
    '</div></div></section>';
}
function findMaintenancePlanningSource(type,id) {
  return planningSource(type,id);
}
function bindMaintenancePlannerControls() {
  document.querySelectorAll("[data-maintenance-plan-year]:not([data-plan-bound])").forEach(function(year){
    year.dataset.planBound="1";
    year.addEventListener("change",function(){
      maintenancePlanning.year=Number(year.value);
      if (currentView === "map") render(); else filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-maintenance-plan-mode]:not([data-plan-bound])").forEach(function(button){
    button.dataset.planBound="1";
    button.addEventListener("click",function(){
      maintenancePlanning.mode=button.dataset.maintenancePlanMode === "month" ? "month" : "quarter";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-maintenance-slot]:not([data-plan-bound])").forEach(function(button){
    button.dataset.planBound="1";
    button.addEventListener("click",async function(){
      const item=findMaintenancePlanningSource(button.dataset.maintenanceSource,button.dataset.maintenanceId);
      if(!item) return;
      const slot=Number(button.dataset.maintenanceSlot);
      if(maintenancePlanning.mode==="month") {
        item.planningMonth=slot;
        item.planningQuarter=Math.ceil(slot/3);
      } else {
        item.planningQuarter=slot;
        item.planningMonth=null;
      }
      await saveState();
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-maintenance-clear]:not([data-plan-bound])").forEach(function(button){
    button.dataset.planBound="1";
    button.addEventListener("click",async function(){
      const item=findMaintenancePlanningSource(button.dataset.maintenanceSource,button.dataset.maintenanceClear);
      if(!item) return;
      item.planningQuarter=null;
      item.planningMonth=null;
      await saveState();
      filterPropertyPortfolio();
    });
  });
}

function planningSource(type, id) {
  if (type === "maintenanceStatus") return state.maintenanceStatus.find(function(x){return x.id===id;});
  if (type === "maintenance") return state.maintenance.find(function(x){return x.id===id;});
  if (type === "project") return state.projects.find(function(x){return x.id===id;});
  if (type === "driftIssue") return state.driftIssues.find(function(x){return x.id===id;});
  return null;
}
function planningPeriod(item) {
  const month = Number(item && item.planningMonth) || 0;
  const quarter = Number(item && item.planningQuarter) || (month ? Math.ceil(month / 3) : 0);
  return { month:month, quarter:quarter };
}
function annualPlanningItems(contracts) {
  const contractIds = new Set(contracts.map(function(c){return c.id;}));
  const propertyIds = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean));
  function inScope(item) {
    return (item.contractId && contractIds.has(item.contractId)) ||
      (!item.contractId && item.propertyId && propertyIds.has(item.propertyId));
  }
  const rows = maintenancePlanningItems(contracts).map(function(item){
    return Object.assign({}, item, { category:"Underhåll", sourceType:item.sourceType });
  });
  state.projects.filter(inScope).forEach(function(item){
    const cost = Number(item.preliminaryCost) || projectBudgetTotal(item);
    if (!item.budgetYear || cost <= 0 || item.status === "Klar") return;
    rows.push({
      sourceType:"project", source:item, id:item.id, title:item.name, category:"Projekt",
      propertyId:item.propertyId, contractId:item.contractId, year:Number(item.budgetYear),
      cost:cost, status:item.status || item.phase || "Projekt", priority:item.phase || ""
    });
  });
  state.driftIssues.filter(inScope).forEach(function(item){
    const cost = Number(item.finalCost) || Number(item.estimatedCost) || 0;
    if (!item.budgetYear || cost <= 0 || item.status === "Klar") return;
    rows.push({
      sourceType:"driftIssue", source:item, id:item.id, title:item.title, category:"Drift",
      propertyId:item.propertyId, contractId:item.contractId, year:Number(item.budgetYear),
      cost:cost, status:item.status || "Drift", priority:item.priority || ""
    });
  });
  return rows.sort(function(a,b){
    return (Number(a.year)||9999)-(Number(b.year)||9999) || (b.cost-a.cost) || a.title.localeCompare(b.title,"sv");
  });
}
function annualPlanningYears() {
  const years = new Set(maintenancePlanningYears());
  state.projects.forEach(function(x){ if(x.budgetYear) years.add(Number(x.budgetYear)); });
  state.driftIssues.forEach(function(x){ if(x.budgetYear) years.add(Number(x.budgetYear)); });
  return Array.from(years).filter(Boolean).sort(function(a,b){return a-b;});
}
function annualPlanDashboardHtml(contracts, context) {
  const years = annualPlanningYears();
  if (!years.includes(Number(maintenancePlanning.year))) maintenancePlanning.year = years[0] || (new Date().getFullYear()+1);
  const year = Number(maintenancePlanning.year);
  const mode = maintenancePlanning.mode === "month" ? "month" : "quarter";
  const slotCount = mode === "month" ? 12 : 4;
  const rows = annualPlanningItems(contracts).filter(function(item){return Number(item.year)===year;});
  const slotTotals = Array.from({length:slotCount},function(){return {amount:0,count:0};});
  const categoryTotals = {Underhåll:0,Projekt:0,Drift:0};
  const propertyTotals = new Map();
  let unplacedAmount=0, unplacedCount=0;

  rows.forEach(function(item){
    categoryTotals[item.category] = (categoryTotals[item.category]||0) + item.cost;
    const property = state.properties.find(function(p){return p.id===item.propertyId;});
    const propertyNameValue = property ? (property.address||property.id) : (item.propertyId||"Fastighetsnivå");
    const prop = propertyTotals.get(item.propertyId||"NO_PROPERTY") || {label:propertyNameValue,amount:0,count:0,unplaced:0};
    prop.amount += item.cost; prop.count += 1;
    const period = planningPeriod(item.source);
    const slot = mode === "month" ? period.month : period.quarter;
    if(slot>=1 && slot<=slotCount) {
      slotTotals[slot-1].amount += item.cost;
      slotTotals[slot-1].count += 1;
    } else {
      unplacedAmount += item.cost; unplacedCount += 1; prop.unplaced += 1;
    }
    propertyTotals.set(item.propertyId||"NO_PROPERTY",prop);
  });

  const slotCards = slotTotals.map(function(slot,index){
    const label = mode === "month" ? String(index+1) : "Q"+(index+1);
    return '<div class="annual-slot-card"><span>' + label + '</span><strong>' + shortMoney(slot.amount) +
      '</strong><small>' + slot.count + ' poster</small></div>';
  }).join("");

  const categoryCards = ["Underhåll","Projekt","Drift"].map(function(category){
    const count = rows.filter(function(item){return item.category===category;}).length;
    const cls = category==="Underhåll" ? "maintenance" : category==="Projekt" ? "project" : "drift";
    return '<div class="annual-category-card ' + cls + '"><span>' + category +
      '</span><strong>' + shortMoney(categoryTotals[category]||0) + '</strong><small>' + count + ' poster</small></div>';
  }).join("");

  const propertyRows = Array.from(propertyTotals.values()).sort(function(a,b){return b.amount-a.amount;}).slice(0,6).map(function(prop){
    return '<div class="annual-property-row"><strong>' + esc(prop.label) + '</strong><span>' + prop.count +
      ' poster</span><span>' + (prop.unplaced ? prop.unplaced + ' ej placerade' : 'planerad') + '</span><b>' +
      shortMoney(prop.amount) + '</b></div>';
  }).join("");

  const itemRows = rows.slice(0, context==="property" ? 30 : 12).map(function(item){
    const property = state.properties.find(function(p){return p.id===item.propertyId;});
    const period = planningPeriod(item.source);
    const buttons = Array.from({length:slotCount},function(_,index){
      const slot=index+1;
      const selected = mode==="month" ? period.month===slot : period.quarter===slot;
      const coarse = mode==="month" && !period.month && period.quarter && Math.ceil(slot/3)===period.quarter;
      return '<button type="button" class="annual-plan-cell ' + (selected?"selected ":"") + (coarse?"coarse ":"") +
        '" data-annual-source="' + esc(item.sourceType) + '" data-annual-id="' + esc(item.id) + '" data-annual-slot="' + slot +
        '" aria-label="Planera ' + esc(item.title) + ' till ' + (mode==="month"?"månad "+slot:"Q"+slot) + '">' +
        (selected?"✓":coarse?"·":"") + '</button>';
    }).join("");
    return '<div class="annual-plan-row" style="--annual-slots:' + slotCount + '">' +
      '<div class="annual-plan-item"><span class="annual-kind ' + (item.category==="Underhåll"?"maintenance":item.category==="Projekt"?"project":"drift") + '">' +
      esc(item.category) + '</span><strong>' + esc(item.title) +
      '</strong><small>' + esc(property ? (property.address||property.id) : (item.propertyId||"Fastighetsnivå")) +
      ' · ' + shortMoney(item.cost) + '</small></div>' + buttons +
      '<button type="button" class="annual-plan-clear" data-annual-clear="' + esc(item.id) + '" data-annual-source="' +
      esc(item.sourceType) + '" aria-label="Rensa planering">×</button></div>';
  }).join("");

  const total = rows.reduce(function(sum,item){return sum+item.cost;},0);
  return '<section class="annual-plan-dashboard ' + (context==="portfolio"?"portfolio":"property") + '">' +
    '<div class="annual-plan-head"><div><span class="portfolio-kicker">' + (context==="portfolio"?"ÖVERGRIPANDE ÅRSPLAN":"FASTIGHETENS ÅRSPLAN") +
      '</span><h3>Vad ska göras, när och för hur mycket?</h3><p>Underhåll, projekt och kostnadsatta driftåtgärder i samma plan. Klicka i tidslinjen för att flytta en post.</p></div>' +
      '<div class="annual-plan-controls"><select class="select" data-annual-plan-year>' +
        years.map(function(y){return '<option value="' + y + '"' + (y===year?" selected":"") + '>' + y + '</option>';}).join("") +
      '</select><div class="planning-mode-toggle"><button type="button" data-annual-plan-mode="quarter" class="' + (mode==="quarter"?"active":"") +
      '">Q1–Q4</button><button type="button" data-annual-plan-mode="month" class="' + (mode==="month"?"active":"") + '">1–12</button></div></div></div>' +
    '<div class="annual-plan-kpis"><div><span>Årsvolym</span><strong>' + shortMoney(total) + '</strong><small>' + rows.length +
      ' poster</small></div><div class="' + (unplacedCount?"attention":"") + '"><span>Ej placerat</span><strong>' +
      shortMoney(unplacedAmount) + '</strong><small>' + unplacedCount + ' poster</small></div></div>' +
    '<div class="annual-slot-grid">' + slotCards + '</div>' +
    '<div class="annual-category-grid">' + categoryCards + '</div>' +
    (context==="portfolio" ? '<div class="annual-property-list"><div class="annual-subhead"><strong>Störst planerad belastning per fastighet</strong><span>Topplista i aktuellt urval</span></div>' +
      (propertyRows||'<div class="empty compact">Ingen planering ännu.</div>') + '</div>' : '') +
    '<div class="annual-plan-scroll"><div class="annual-plan-board ' + mode + '">' +
      '<div class="annual-plan-grid-head" style="--annual-slots:' + slotCount + '"><div>Post</div>' +
        slotTotals.map(function(_,index){return '<div>' + (mode==="month"?(index+1):"Q"+(index+1)) + '</div>';}).join("") + '<div></div></div>' +
      (itemRows || '<div class="empty compact">Inga poster för ' + year + '.</div>') +
    '</div></div></section>';
}
function bindAnnualPlannerControls() {
  document.querySelectorAll("[data-annual-plan-year]:not([data-annual-bound])").forEach(function(select){
    select.dataset.annualBound="1";
    select.addEventListener("change",function(){
      maintenancePlanning.year=Number(select.value);
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-annual-plan-mode]:not([data-annual-bound])").forEach(function(button){
    button.dataset.annualBound="1";
    button.addEventListener("click",function(){
      maintenancePlanning.mode=button.dataset.annualPlanMode==="month"?"month":"quarter";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-annual-slot]:not([data-annual-bound])").forEach(function(button){
    button.dataset.annualBound="1";
    button.addEventListener("click",async function(){
      const item=planningSource(button.dataset.annualSource,button.dataset.annualId);
      if(!item) return;
      const slot=Number(button.dataset.annualSlot);
      if(maintenancePlanning.mode==="month") {
        item.planningMonth=slot;
        item.planningQuarter=Math.ceil(slot/3);
      } else {
        item.planningQuarter=slot;
        item.planningMonth=null;
      }
      await saveState();
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-annual-clear]:not([data-annual-bound])").forEach(function(button){
    button.dataset.annualBound="1";
    button.addEventListener("click",async function(){
      const item=planningSource(button.dataset.annualSource,button.dataset.annualClear);
      if(!item) return;
      item.planningQuarter=null;
      item.planningMonth=null;
      await saveState();
      filterPropertyPortfolio();
    });
  });
}
function budgetRows(year, contracts) {
  const rows = [];
  state.contracts.filter(function(c) { return activeInYear(c, year); }).forEach(function(c) {
    const factor = contractYearFactor(c, year);
    const amount = totalContractCost(c) * factor;
    if (amount > 0) rows.push({
      category: "Hyra + drift",
      sub: factor < 0.999 ? "Avtal · periodiserat " + percent(factor * 100) : "Avtal",
      source: c.number || c.id,
      contractId: c.id,
      propertyId: c.propertyId,
      amount: amount
    });
  });
  state.projects.filter(function(p) { return Number(p.budgetYear) === Number(year); }).forEach(function(p) {
    const investigation = Number(p.budgetInvestigation) || 0;
    const project = (Number(p.budgetExecution) || 0) + (Number(p.budgetFurnishing) || 0);
    if (investigation > 0) rows.push({ category: "Utredningar", sub: "Projektutredning", source: p.name, contractId: p.contractId, propertyId:p.propertyId, amount: investigation, timing: maintenanceTimingLabel(p) });
    if (project > 0) rows.push({ category: "Projekt", sub: "Genomförande + inredning", source: p.name, contractId: p.contractId, propertyId:p.propertyId, amount: project, timing: maintenanceTimingLabel(p) });
  });
  state.maintenance.filter(function(u) { return Number(u.year) === Number(year) && Number(u.cost) > 0; }).forEach(function(u) {
    rows.push({ category: "Underhåll", sub: u.title, source: u.title, contractId: u.contractId, propertyId:u.propertyId, amount: Number(u.cost), timing: maintenanceTimingLabel(u) });
  });
  state.operations.filter(function(o) { return Number(o.period) === Number(year) && Number(o.budget) > 0; }).forEach(function(o) {
    rows.push({ category: "Driftkostnader", sub: o.category, source: o.category, contractId: o.contractId, propertyId:o.propertyId, amount: Number(o.budget) });
  });
  state.investigations.filter(function(u) { return Number(u.year) === Number(year) && Number(u.cost) > 0; }).forEach(function(u) {
    rows.push({ category: "Utredningar", sub: u.title, source: u.title, contractId: u.contractId, propertyId:u.propertyId, amount: Number(u.cost) });
  });
  state.maintenanceStatus.filter(function(x) {
    return x.includeInBudget === "Ja" && Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0;
  }).forEach(function(x) {
    rows.push({ category: "Underhåll", sub: x.category, source: "Status: " + x.category, contractId: x.contractId, propertyId:x.propertyId, amount: Number(x.estimatedCost), timing: maintenanceTimingLabel(x) });
  });
  state.driftIssues.filter(function(x) {
    return x.includeInBudget === "Ja" && Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0 && x.status !== "Klar";
  }).forEach(function(x) {
    rows.push({ category: "Driftkostnader", sub: x.category, source: "Ärende: " + x.title, contractId: x.contractId, propertyId:x.propertyId, amount: Number(x.estimatedCost), timing: maintenanceTimingLabel(x) });
  });
  state.wishes.filter(function(x) {
    return x.includeInBudget === "Ja" && x.budgetCategory && x.budgetCategory !== "Ej budget" &&
      Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0 && x.status !== "Avslaget";
  }).forEach(function(x) {
    rows.push({ category: x.budgetCategory, sub: x.category, source: "Önskemål: " + x.title, contractId: x.contractId, propertyId:x.propertyId, amount: Number(x.estimatedCost) });
  });
  return Array.isArray(contracts) ? budgetRowsForContracts(rows,contracts) : rows;
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
function mobileDockKey() {
  if (currentView === "map") return "map";
  if (currentView === "budget") return "budget";
  if (currentView === "properties" && portfolioExplorer.section === "activities") return "plan";
  if (currentView === "properties") return "overview";
  return "more";
}
function closeMobileMoreSheet() {
  const sheet = document.getElementById("mobile-more-sheet");
  if (sheet) sheet.hidden = true;
}
function renderMobileDock() {
  const dock = document.getElementById("mobile-dock");
  if (!dock) return;
  const active = mobileDockKey();
  if (window.matchMedia && window.matchMedia("(max-width: 700px)").matches) {
    const title=document.getElementById("page-title");
    if (title) {
      title.textContent = active==="overview" ? "Översikt" :
        active==="map" ? "Karta" :
        active==="plan" ? "Planera" :
        active==="budget" ? "Budget" :
        (views.find(function(v){return v.id===currentView;})||{}).label || "Lokalblick";
    }
  }
  dock.querySelectorAll("[data-mobile-dock]").forEach(function(button) {
    button.classList.toggle("active", button.dataset.mobileDock === active);
    if (button.dataset.mobileBound) return;
    button.dataset.mobileBound = "1";
    button.addEventListener("click", function() {
      const target = button.dataset.mobileDock;
      if (target === "more") {
        const sheet = document.getElementById("mobile-more-sheet");
        if (sheet) sheet.hidden = false;
        return;
      }
      closeMobileMoreSheet();

      if (target === "map") {
        currentView = "map";
        render();
        return;
      }
      if (target === "budget") {
        currentView = "budget";
        render();
        return;
      }
      currentView = "properties";
      portfolioExplorer.contractId = "";
      if (target === "overview") {
        portfolioExplorer.propertyId = "";
        portfolioExplorer.section = "overview";
      } else if (target === "plan") {
        portfolioExplorer.section = "activities";
      }
      render();
    });
  });
  document.querySelectorAll("[data-mobile-sheet-close]:not([data-mobile-bound])").forEach(function(button) {
    button.dataset.mobileBound = "1";
    button.addEventListener("click", closeMobileMoreSheet);
  });
  document.querySelectorAll("[data-mobile-target]:not([data-mobile-bound])").forEach(function(button) {
    button.dataset.mobileBound = "1";
    button.addEventListener("click", function() {
      currentView = button.dataset.mobileTarget;
      closeMobileMoreSheet();
      render();
    });
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
  if (currentView === "properties") html = renderProperties();
  else if (currentView === "map") html = renderMap();
  else if (currentView === "budget") html = renderBudget();
  else if (currentView === "organisation") html = renderOrganisation();
  else html = renderAbout();
  document.getElementById("content").innerHTML = html;
  bindViewEvents();
  renderMobileDock();
  if (currentView === "map") initPropertyMap();
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
  const properties = state.properties.map(function(p) {
    return {
      value:p.id,
      label:p.address || p.designation || p.id
    };
  }).filter(function(p){return p.value;}).sort(function(a,b){return String(a.label).localeCompare(String(b.label),"sv");});
  return {
    customer: dedupeOptions(customer),
    unit: dedupeOptions(unit),
    owner: dedupeOptions(owner),
    ourPeople: dedupeOptions(ourPeople),
    tenantPeople: dedupeOptions(tenantPeople),
    ownerPeople: dedupeOptions(ownerPeople),
    properties: properties
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
    return '<button type="button" class="pattern-row pattern-button" data-set-filter="' + esc(filterId) +
      '" data-filter-value="' + esc(row.key) + '">' +
      '<div class="pattern-row-head"><strong>' + esc(row.label) + '</strong><span>' + esc(formatter(row)) + '</span></div>' +
      '<div class="pattern-track"><div class="pattern-fill" style="width:' + width + '%"></div></div>' +
    '</button>';
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
function detailRowsHtml(rows) {
  return rows.filter(function(row) { return row[1] !== "" && row[1] != null; }).map(function(row) {
    return '<div><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
  }).join("");
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
      responsible:responsibleFromAssignments("project", x.id),
      detail:[["Skede",x.phase||"–"],["Planering",maintenanceTimingLabel(x)],["Start",x.start||"–"],["Slut",x.end||"–"],["Inflyttning",x.moveIn||"–"],
        ["Beskrivning",x.description||""],["Budget utredning",money(x.budgetInvestigation)],["Budget genomförande",money(x.budgetExecution)],
        ["Budget inredning",money(x.budgetFurnishing)]] });
  });
  state.maintenance.filter(inScope).forEach(function(x) {
    items.push({ group:"maintenance", type:"Underhåll", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status || x.priority, when:x.year ? String(x.year) : "", cost:Number(x.cost)||0, responsible:"",
      detail:[["Planår",x.year||"–"],["Planering",maintenanceTimingLabel(x)],["Prioritet",x.priority||"–"],["Status",x.status||"–"],["Kostnad",money(x.cost)]] });
  });
  state.maintenanceStatus.filter(inScope).forEach(function(x) {
    items.push({ group:"maintenance", type:"Underhållsstatus", id:x.id, title:x.category + (x.actionNeed ? " · " + x.actionNeed : ""),
      propertyId:x.propertyId, contractId:x.contractId, status:x.status, when:x.assessedDate || "", cost:Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId),
      detail:[["Bedömd",x.assessedDate||"–"],["Planering",maintenanceTimingLabel(x)],["Prioritet",x.priority||"–"],["Åtgärdsbehov",x.actionNeed||""],
        ["Kommentar",x.comment||""],["Budgetår",x.budgetYear||"–"],["Till årsbudget",x.includeInBudget||"–"]] });
  });
  state.driftIssues.filter(inScope).forEach(function(x) {
    items.push({ group:"drift", type:"Driftärende", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.targetDate || x.createdDate || "", cost:Number(x.finalCost)||Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId),
      detail:[["Kategori",x.category||"–"],["Planering",maintenanceTimingLabel(x)],["Prioritet",x.priority||"–"],["Upplagt",x.createdDate||"–"],["Tidplan",x.targetDate||"–"],
        ["Beskrivning",x.description||""],["Bedömd kostnad",money(x.estimatedCost)],["Slutkostnad",money(x.finalCost)]] });
  });
  state.wishes.filter(inScope).forEach(function(x) {
    items.push({ group:"wish", type:"Önskemål", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.targetDate || x.createdDate || "", cost:Number(x.finalCost)||Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId),
      detail:[["Kategori",x.category||"–"],["Upplagt",x.createdDate||"–"],["Tidplan",x.targetDate||"–"],["Beslutat",x.decisionDate||"–"],
        ["Klart",x.completedDate||"–"],["Beskrivning",x.description||""],["Budgetkategori",x.budgetCategory||"–"],
        ["Bedömd kostnad",money(x.estimatedCost)],["Slutkostnad",money(x.finalCost)]] });
  });
  state.investigations.filter(inScope).forEach(function(x) {
    items.push({ group:"investigation", type:"Utredning", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.year ? String(x.year) : "", cost:Number(x.cost)||0, responsible:"",
      detail:[["År",x.year||"–"],["Status",x.status||"–"],["Kostnad",money(x.cost)]] });
  });
  state.operations.filter(inScope).forEach(function(x) {
    items.push({ group:"operations", type:"Driftkostnad", id:x.id, title:x.category, propertyId:x.propertyId, contractId:x.contractId,
      status:"Budget / utfall", when:x.period ? String(x.period) : "", cost:Number(x.actual)||Number(x.budget)||0, responsible:"",
      detail:[["År",x.period||"–"],["Kostnadsslag",x.category||"–"],["Budget",money(x.budget)],["Utfall",money(x.actual)]] });
  });
  return items.sort(function(a, b) {
    return String(a.when || "9999").localeCompare(String(b.when || "9999")) || a.type.localeCompare(b.type, "sv");
  });
}
function activityGroupLabel(group) {
  return {
    project:"Projekt",
    maintenance:"Underhåll",
    drift:"Driftärenden",
    wish:"Önskemål",
    investigation:"Utredningar",
    operations:"Driftkostnader"
  }[group] || "Aktuellt";
}
function portfolioContentTabsHtml(contracts) {
  const items = portfolioActivityItems(contracts);
  const propertyMode = Boolean(portfolioExplorer.propertyId);
  const propertyCount = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
  const counts = {
    maintenance: items.filter(function(x){return x.group==="maintenance";}).length,
    project: items.filter(function(x){return x.group==="project";}).length,
    drift: items.filter(function(x){return x.group==="drift" || x.group==="operations";}).length,
    wish: items.filter(function(x){return x.group==="wish";}).length,
    contracts: contracts.length,
    properties: propertyCount
  };
  const modes = propertyMode ? [
    ["overview","Sammanställning","Översikt och allt som hör till fastigheten"],
    ["maintenance","Underhåll","Behov, planering och kostnad"],
    ["project","Projekt","Projekt, tid och budget"],
    ["drift","Drift","Driftkostnader och ärenden"],
    ["contracts","Avtal","Avtal, area och årskostnad"],
    ["wish","Övrigt","Önskemål och övriga behov"]
  ] : [
    ["overview","Sammanställning","Översikt och alla poster i urvalet"],
    ["properties","Fastigheter","Fastigheterna i aktuellt urval"],
    ["maintenance","Underhåll","Behov, planering och kostnad"],
    ["project","Projekt","Projekt, tid och budget"],
    ["drift","Drift","Driftkostnader och ärenden"],
    ["contracts","Avtal","Avtal, area och ekonomi"],
    ["wish","Övrigt","Önskemål och övriga behov"]
  ];
  return '<div class="view-choice-bar">' + modes.map(function(mode) {
    const active = portfolioExplorer.section === mode[0];
    const count = counts[mode[0]];
    return '<button class="view-choice ' + (active ? "active" : "") + '" type="button" data-portfolio-section="' + mode[0] +
      '" role="tab" aria-selected="' + (active ? "true" : "false") + '" title="' + esc(mode[2]) + '">' +
      '<span>' + esc(mode[1]) + '</span>' +
      (count == null ? "" : '<strong>' + count + '</strong>') +
    '</button>';
  }).join("") + '</div>';
}
function perspectiveSummaryHtml(contracts, group) {
  const selected = portfolioActivityItems(contracts).filter(function(item){
    return group === "drift" ? (item.group === "drift" || item.group === "operations") : item.group === group;
  });
  const propertyCount = new Set(selected.map(function(item){return item.propertyId;}).filter(Boolean)).size;
  const total = selected.reduce(function(sum,item){return sum+(Number(item.cost)||0);},0);
  const attention = selected.filter(function(item){
    return /akut|hög|sen|beslut|åtgärdsbehov|risk/i.test(String(item.status||""));
  }).length;
  const labels = {
    maintenance:["Underhåll","Identifierade och planerade åtgärder"],
    project:["Projekt","Utredning, genomförande och kostnad"],
    drift:["Drift","Driftkostnader och driftärenden"],
    wish:["Önskemål","Verksamhetens behov och bedömda kostnader"],
    investigation:["Utredningar","Beslutsunderlag och förberedelser"],
    operations:["Driftkostnader","Löpande kostnader och utfall"]
  };
  const copy = labels[group] || ["Aktuellt","Poster i aktuellt urval"];
  return '<section class="perspective-summary">' +
    '<div class="perspective-summary-head"><div><span class="portfolio-kicker">' + esc(copy[0].toUpperCase()) +
      '</span><h3>' + esc(copy[0]) + ' i urvalet</h3><p>' + esc(copy[1]) + '. Summeringen byggs direkt av detaljerna.</p></div></div>' +
    '<div class="perspective-summary-grid">' +
      '<div><span>Kostnad</span><strong>' + money(total) + '</strong><small>summerat från posterna</small></div>' +
      '<div><span>Poster</span><strong>' + selected.length + '</strong><small>i aktuellt urval</small></div>' +
      '<div><span>Fastigheter</span><strong>' + propertyCount + '</strong><small>berörda</small></div>' +
      '<div class="' + (attention ? "attention" : "") + '"><span>Att agera på</span><strong>' + attention + '</strong><small>prioriterade / beslut</small></div>' +
    '</div>' +
  '</section>';
}

function maintenanceDistributionHtml(contracts) {
  const maintenanceItems = portfolioActivityItems(contracts).filter(function(item) { return item.group === "maintenance"; });
  if (!maintenanceItems.length) return "";

  const total = maintenanceItems.reduce(function(sum, item) { return sum + (Number(item.cost) || 0); }, 0);
  const byUnit = new Map();
  const byProperty = new Map();

  maintenanceItems.forEach(function(item) {
    const contract = state.contracts.find(function(c) { return c.id === item.contractId; });
    const unitId = contract && contract.unitId ? contract.unitId : "";
    const unitKey = unitId || "NO_UNIT";
    const unit = byUnit.get(unitKey) || { id: unitId, label: unitId ? unitName(unitId) : "Ej kopplat område", amount: 0, count: 0 };
    unit.amount += Number(item.cost) || 0;
    unit.count += 1;
    byUnit.set(unitKey, unit);

    const propertyId = item.propertyId || "NO_PROPERTY";
    const property = state.properties.find(function(p) { return p.id === propertyId; });
    const propertyRow = byProperty.get(propertyId) || {
      id: propertyId,
      label: property ? (property.address || property.id) : (propertyId === "NO_PROPERTY" ? "Ej kopplad fastighet" : propertyId),
      amount: 0,
      count: 0
    };
    propertyRow.amount += Number(item.cost) || 0;
    propertyRow.count += 1;
    byProperty.set(propertyId, propertyRow);
  });

  function rowsHtml(rows, kind) {
    const sorted = Array.from(rows.values()).sort(function(a,b) { return b.amount - a.amount || b.count - a.count; });
    const max = Math.max.apply(null, [1].concat(sorted.map(function(row){ return row.amount; })));
    return sorted.slice(0,8).map(function(row) {
      const pct = total ? Math.round((row.amount / total) * 100) : 0;
      const width = Math.max(3, Math.round((row.amount / max) * 100));
      const attrs = kind === "unit"
        ? ' data-set-filter="filter-unit" data-filter-value="' + esc(row.id) + '"'
        : (row.id !== "NO_PROPERTY" ? ' data-explorer-property="' + esc(row.id) + '"' : '');
      return '<button type="button" class="distribution-row"' + attrs + '>' +
        '<span class="distribution-copy"><strong>' + esc(row.label) + '</strong><small>' + row.count + ' poster · ' + pct + '%</small></span>' +
        '<span class="distribution-value">' + money(row.amount) + '</span>' +
        '<span class="distribution-track" aria-hidden="true"><span style="width:' + width + '%"></span></span>' +
      '</button>';
    }).join("");
  }

  return '<section class="maintenance-distribution">' +
    '<div class="planning-section-head"><div><span>KOSTNADSFÖRDELNING</span><h3>Var uppstår underhållskostnaderna?</h3>' +
      '<p>Samma underhållsposter summeras per område och fastighet. Klicka för att borra ner utan att lämna Underhåll.</p></div>' +
      '<strong class="distribution-total">' + money(total) + '</strong></div>' +
    '<div class="maintenance-distribution-grid">' +
      '<div class="distribution-panel"><div class="distribution-panel-head"><span>OMRÅDE</span><strong>Verksamhetsfördelning</strong></div>' +
        rowsHtml(byUnit, "unit") + '</div>' +
      '<div class="distribution-panel"><div class="distribution-panel-head"><span>FASTIGHET</span><strong>Största kostnadsbärare</strong></div>' +
        rowsHtml(byProperty, "property") + '</div>' +
    '</div>' +
  '</section>';
}

function portfolioActivityGroupedHtml(contracts, group) {
  const selected = portfolioActivityItems(contracts).filter(function(x) {
    return group === "drift" ? (x.group === "drift" || x.group === "operations") : x.group === group;
  });
  const byProperty = new Map();
  selected.forEach(function(item) {
    const key = item.propertyId || "NO_PROPERTY";
    if (!byProperty.has(key)) byProperty.set(key, []);
    byProperty.get(key).push(item);
  });
  const action = {
    project:'<button class="button primary" data-add="project">+ Projekt</button>',
    maintenance:'<button class="button primary" data-add="maintenance">+ Underhåll</button> <button class="button secondary" data-add="maintenanceStatus">+ Status</button>',
    drift:'<button class="button primary" data-add="driftIssue">+ Driftärende</button>',
    wish:'<button class="button primary" data-add="wish">+ Önskemål</button>',
    investigation:'<button class="button primary" data-add="investigation">+ Utredning</button>',
    operations:'<button class="button primary" data-add="operation">+ Driftpost</button>'
  }[group] || "";
  const groups = Array.from(byProperty.entries()).map(function(entry) {
    const propertyId = entry[0], items = entry[1];
    const property = state.properties.find(function(p) { return p.id === propertyId; });
    const total = items.reduce(function(sum, item) { return sum + (Number(item.cost) || 0); }, 0);
    const records = items.map(function(item) {
      const contract = state.contracts.find(function(c) { return c.id === item.contractId; });
      return '<details class="activity-record">' +
        '<summary><span class="activity-record-type">' + esc(item.type) + '</span>' +
          '<span class="activity-record-main"><strong>' + esc(item.title || "–") + '</strong><small>' +
          esc(contract ? (contract.number || contract.id) : "Fastighetsnivå") + '</small></span>' +
          '<span>' + statusBadge(item.status) + '</span><span class="activity-record-time">' + esc(item.when || "–") + '</span>' +
          '<strong class="activity-record-cost">' + money(item.cost) + '</strong><span class="property-chevron">⌄</span></summary>' +
        '<div class="activity-record-body"><div class="activity-detail-grid">' +
          '<div><span>Fastighet</span><button type="button" class="table-link" data-explorer-property="' + esc(item.propertyId || "") + '">' +
            esc(property ? (property.address || property.id) : (item.propertyId || "–")) + '</button></div>' +
          '<div><span>Avtal</span>' + (item.contractId ? '<button type="button" class="table-link mono" data-explorer-contract="' +
            esc(item.contractId) + '">' + esc(contract ? (contract.number || contract.id) : item.contractId) + '</button>' : '<strong>–</strong>') + '</div>' +
          '<div><span>Ansvarig</span><strong>' + esc(item.responsible || "–") + '</strong></div>' +
          detailRowsHtml(item.detail || []) +
        '</div>' +
        (activityEditorType(item) ? '<div class="activity-record-actions"><button type="button" class="button secondary" data-edit-type="' +
          activityEditorType(item) + '" data-edit-id="' + esc(item.id) + '">Redigera samma post</button></div>' : '') +
        '</div></details>';
    }).join("");
    return '<section class="activity-property-group"><div class="activity-property-head"><div><button type="button" class="table-link" data-explorer-property="' +
      esc(propertyId) + '"><strong>' + esc(property ? (property.address || property.id) : propertyId) + '</strong></button>' +
      '<span class="muted mono">' + esc(propertyId) + '</span></div><div><strong>' + items.length + '</strong><span> poster</span></div>' +
      '<div><strong>' + money(total) + '</strong><span> kostnad</span></div></div>' + records + '</section>';
  }).join("");
  const planner = group === "maintenance" ? maintenancePlannerHtml(contracts) : "";
  const distribution = group === "maintenance" ? maintenanceDistributionHtml(contracts) : "";
  return perspectiveSummaryHtml(contracts,group) + distribution +
    '<div class="activity-view-head details-head"><div><h3>Detaljer</h3><p>Poster som bygger summeringen ovan, grupperade per fastighet.</p></div>' +
    '<div class="activity-view-actions">' + action + '</div></div>' + planner + (groups || '<div class="empty">Ingen data i urvalet.</div>');
}
function portfolioContextHtml() {
  const parts = ['<span class="context-root">Alla</span>'];
  const controls = [
    ["filter-customer","Kund"],["filter-unit","Organisation"],["filter-owner","Fastighetsägare"],
    ["filter-our-person","Ansvarig"],["filter-tenant-person","Kundansvarig"],["filter-owner-person","Ägaransvarig"]
  ];
  controls.forEach(function(entry) {
    const control = document.getElementById(entry[0]);
    if (control && control.value) parts.push('<span>›</span><button type="button" data-clear-filter="' + entry[0] + '">' +
      esc(control.options[control.selectedIndex].text) + ' ×</button>');
  });
  if (portfolioExplorer.propertyId) {
    const p=state.properties.find(function(x){return x.id===portfolioExplorer.propertyId;});
    parts.push('<span>›</span><button type="button" data-clear-explorer="property">' + esc(p ? (p.address||p.id) : portfolioExplorer.propertyId) + ' ×</button>');
  }
  if (portfolioExplorer.contractId) {
    const contract=state.contracts.find(function(x){return x.id===portfolioExplorer.contractId;});
    parts.push('<span>›</span><button type="button" data-clear-explorer="contract">' + esc(contract ? (contract.number||contract.id) : portfolioExplorer.contractId) + ' ×</button>');
  }
  return parts.join("");
}

function portfolioScopeCardsHtml() {
  const allContracts = state.contracts;
  const cards = [{ id:"", name:"Alla" }].concat(ORG_UNITS.map(function(unit) {
    return { id:unit.id, name:unit.name };
  }));
  return cards.map(function(card) {
    const contracts = card.id ? allContracts.filter(function(c){return c.unitId===card.id;}) : allContracts;
    const propertyCount = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
    const area = contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    const cost = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
    return '<button type="button" class="scope-card ' + (!card.id ? "active" : "") + '" data-quick-unit="' + esc(card.id) + '">' +
      '<span class="scope-card-label">' + esc(card.name) + '</span>' +
      '<strong>' + propertyCount + ' fastigheter</strong>' +
      '<small>' + num(area) + ' kvm · ' + money(cost) + '</small>' +
    '</button>';
  }).join("");
}

function portfolioScopeTitle() {
  if (portfolioExplorer.contractId) {
    const contract=state.contracts.find(function(c){return c.id===portfolioExplorer.contractId;});
    return contract ? "Avtal " + (contract.number || contract.id) : "Valt avtal";
  }
  if (portfolioExplorer.propertyId) {
    const property=state.properties.find(function(p){return p.id===portfolioExplorer.propertyId;});
    return property ? (property.address || property.id) : "Vald fastighet";
  }
  const unit=document.getElementById("filter-unit");
  const unitValue = unit ? unit.value : portfolioFilters.unit;
  if (unitValue) return unit ? unit.options[unit.selectedIndex].text : unitName(unitValue);
  const customer=document.getElementById("filter-customer");
  const customerValue = customer ? customer.value : portfolioFilters.customer;
  if (customerValue) {
    if (customer) return customer.options[customer.selectedIndex].text;
    const sample=state.contracts.find(function(c){return contractCustomerKey(c)===customerValue;});
    return sample ? contractCustomer(sample) : "Vald kund";
  }
  const owner=document.getElementById("filter-owner");
  const ownerValue = owner ? owner.value : portfolioFilters.owner;
  if (ownerValue) {
    if (owner) return owner.options[owner.selectedIndex].text;
    const sample=state.contracts.find(function(c){
      const property=state.properties.find(function(p){return p.id===c.propertyId;});
      return contractOwnerKey(c,property)===ownerValue;
    });
    const property=sample ? state.properties.find(function(p){return p.id===sample.propertyId;}) : null;
    return sample ? contractOwner(sample,property) : "Vald fastighetsägare";
  }
  if (portfolioFilters.ourPerson) return personName(portfolioFilters.ourPerson);
  return "Alla fastigheter";
}
function updatePortfolioScopeHeader(contracts) {
  const title=document.getElementById("portfolio-scope-title");
  const meta=document.getElementById("portfolio-scope-meta");
  if(title) title.textContent=portfolioScopeTitle();
  if(meta) {
    const properties=new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
    const area=contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    meta.textContent=properties+" fastigheter · "+contracts.length+" avtal · "+num(area)+" kvm";
  }
  const mobileLabel=document.getElementById("mobile-scope-label");
  if(mobileLabel) mobileLabel.textContent=portfolioScopeTitle();
}
function updateQuickScopeButtons() {
  const unit=document.getElementById("filter-unit");
  const selected=unit ? unit.value : "";
  document.querySelectorAll("[data-quick-unit]").forEach(function(button) {
    button.classList.toggle("active", button.dataset.quickUnit===selected);
  });
}

function mobileModeChooserHtml(contracts) {
  const items = portfolioActivityItems(contracts);

  const rentByProperty = new Map();
  contracts.forEach(function(contract) {
    const propertyId = contract.propertyId || "NO_PROPERTY";
    const property = state.properties.find(function(p){return p.id===contract.propertyId;});
    const row = rentByProperty.get(propertyId) || {
      label: property ? (property.address || property.designation || property.id) : (contract.propertyId || "Fastighet saknas"),
      amount: 0
    };
    row.amount += Number(contract.annualRent) || 0;
    rentByProperty.set(propertyId,row);
  });

  function moneyTotal(rows) {
    return rows.reduce(function(sum,row){return sum+(Number(row.amount)||Number(row.cost)||0);},0);
  }

  function compactRows(rows, labelFn, amountFn) {
    if (!rows.length) return '<div class="mobile-compact-empty">Inga poster i urvalet</div>';
    return rows.map(function(row) {
      return '<div class="mobile-compact-row"><span>' + esc(labelFn(row)) + '</span><strong>' +
        money(amountFn(row)) + '</strong></div>';
    }).join("");
  }

  function section(title, rows, total, labelFn, amountFn, extraClass) {
    return '<details class="mobile-compact-section ' + (extraClass||"") + '">' +
      '<summary><span class="mobile-compact-section-title">' + esc(title) + '</span>' +
        '<span class="mobile-compact-section-total"><strong>' + money(total) + '</strong><small>' +
          rows.length + (rows.length===1 ? ' post' : ' poster') + '</small></span><b>⌄</b></summary>' +
      '<div class="mobile-compact-section-body">' + compactRows(rows,labelFn,amountFn) + '</div>' +
    '</details>';
  }

  const rentRows = Array.from(rentByProperty.values()).sort(function(a,b){return b.amount-a.amount || a.label.localeCompare(b.label,"sv");});
  const projects = items.filter(function(x){return x.group==="project";});
  const maintenance = items.filter(function(x){return x.group==="maintenance";});
  const drift = items.filter(function(x){return x.group==="drift" || x.group==="operations";});
  const wishes = items.filter(function(x){return x.group==="wish";});

  function activityLabel(item, fallback) {
    const property=state.properties.find(function(p){return p.id===item.propertyId;});
    const address=property ? (property.address || property.designation || property.id) : (item.propertyId || "");
    return (address ? address + " · " : "") + (item.title || item.type || fallback);
  }

  if (portfolioExplorer.section === "activities") return "";

  return '<div class="mobile-compact-accordion" aria-label="Ekonomi och aktiviteter i urvalet">' +
    section("Hyra",rentRows,moneyTotal(rentRows),function(x){return x.label;},function(x){return x.amount;},"rent") +
    section("Projekt",projects,projects.reduce(function(s,x){return s+(Number(x.cost)||0);},0),
      function(x){return activityLabel(x,"Projekt");},function(x){return Number(x.cost)||0;},"project") +
    section("Underhåll",maintenance,maintenance.reduce(function(s,x){return s+(Number(x.cost)||0);},0),
      function(x){return activityLabel(x,"Underhåll");},function(x){return Number(x.cost)||0;},"maintenance") +
    section("Drift",drift,drift.reduce(function(s,x){return s+(Number(x.cost)||0);},0),
      function(x){return activityLabel(x,"Drift");},function(x){return Number(x.cost)||0;},"drift") +
    section("Önskemål",wishes,wishes.reduce(function(s,x){return s+(Number(x.cost)||0);},0),
      function(x){return activityLabel(x,"Önskemål");},function(x){return Number(x.cost)||0;},"wish") +
  '</div>';
}
function mobileFilterChoiceLabel(filterId, value) {
  if (!value) return "";
  if (filterId === "filter-unit") return unitName(value);
  if (filterId === "filter-our-person") return personName(value);
  if (filterId === "filter-property") {
    const property=state.properties.find(function(p){return p.id===value;});
    return property ? (property.address || property.designation || property.id) : value;
  }
  if (filterId === "filter-owner") {
    const sample=state.contracts.find(function(c){
      const property=state.properties.find(function(p){return p.id===c.propertyId;});
      return contractOwnerKey(c,property)===value;
    });
    const property=sample ? state.properties.find(function(p){return p.id===sample.propertyId;}) : null;
    return sample ? contractOwner(sample,property) : value;
  }
  return value;
}
function mobileFilterChipHtml(filterId, label, options, selectedValue, allLabel) {
  const selectedLabel=mobileFilterChoiceLabel(filterId,selectedValue);
  const rows=[{value:"",label:allLabel}].concat(options||[]);
  return '<details class="mobile-filter-chip ' + (selectedValue?"active":"") + '">' +
    '<summary><span>' + esc(label) + '</span>' + (selectedLabel?'<strong>' + esc(selectedLabel) + '</strong>':'<strong>Alla</strong>') + '<b>⌄</b></summary>' +
    '<div class="mobile-filter-menu">' +
      '<div class="mobile-filter-menu-head"><span>' + esc(label) + '</span><small>Filtrerar hela Lokalblick</small></div>' +
      rows.map(function(row){
        const selected=(row.value||"")===(selectedValue||"");
        return '<button type="button" class="' + (selected?"selected":"") + '" data-mobile-filter-id="' + filterId +
          '" data-mobile-filter-value="' + esc(row.value||"") + '">' +
          '<span><strong>' + esc(row.label) + '</strong></span><b>' + (selected?"✓":"") + '</b></button>';
      }).join("") +
    '</div></details>';
}
function mobileScopeFiltersHtml(filters) {
  return '<div class="mobile-scope-filter-row">' +
    mobileFilterChipHtml("filter-unit","Område",filters.unit,portfolioFilters.unit,"Alla områden") +
    mobileFilterChipHtml("filter-our-person","Ansvarig",filters.ourPeople,portfolioFilters.ourPerson,"Alla ansvariga") +
    mobileFilterChipHtml("filter-property","Fastighet",filters.properties,portfolioExplorer.propertyId,"Alla fastigheter") +
  '</div>';
}
function mobilePropertyCardsHtml(contracts) {
  const grouped = new Map();
  contracts.forEach(function(c) {
    if (!grouped.has(c.propertyId)) grouped.set(c.propertyId, []);
    grouped.get(c.propertyId).push(c);
  });
  const cards = Array.from(grouped.entries()).map(function(entry) {
    const propertyId=entry[0], cs=entry[1];
    const property=state.properties.find(function(p){return p.id===propertyId;});
    const area=cs.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    const cost=cs.reduce(function(sum,c){return sum+totalContractCost(c);},0);
    const activities=portfolioActivityItems(cs);
    const maintenance=activities.filter(function(x){return x.group==="maintenance";}).length;
    const projects=activities.filter(function(x){return x.group==="project";}).length;
    const issues=activities.filter(function(x){return x.group==="drift";}).length;
    return '<button type="button" class="mobile-property-card" data-explorer-property="' + esc(propertyId) + '">' +
      '<span class="mobile-card-main"><strong>' + esc(property ? (property.address||property.id) : propertyId) + '</strong>' +
        '<small>' + esc(property && property.designation ? property.designation : propertyId) + '</small></span>' +
      '<span class="mobile-card-stats"><span><strong>' + cs.length + '</strong><small>avtal</small></span>' +
        '<span><strong>' + num(area) + '</strong><small>kvm</small></span>' +
        '<span><strong>' + maintenance + '</strong><small>UH</small></span>' +
        '<span><strong>' + projects + '</strong><small>projekt</small></span></span>' +
      '<span class="mobile-card-foot"><span>' + money(cost) + '/år</span>' + (issues ? '<span class="mobile-alert">' + issues + ' ärenden</span>' : '') + '<strong>→</strong></span>' +
    '</button>';
  });
  return cards.join("") || '<div class="empty">Inga fastigheter i urvalet.</div>';
}
function mobileContractCardsHtml(contracts) {
  return contracts.map(function(c) {
    const property=state.properties.find(function(p){return p.id===c.propertyId;});
    const total=totalContractCost(c);
    return '<button type="button" class="mobile-contract-card" data-explorer-contract="' + esc(c.id) + '">' +
      '<span class="mobile-card-main"><strong>' + esc(c.number||c.id) + '</strong><small>' +
        esc(property ? (property.address||property.id) : c.propertyId) + '</small></span>' +
      '<span class="mobile-contract-meta"><span>' + esc(contractCustomer(c)) + '</span><span>' + num(c.area) + ' kvm</span></span>' +
      '<span class="mobile-card-foot"><span>' + money(total) + '/år</span><span>' + esc(c.end || "Slutdatum saknas") + '</span><strong>→</strong></span>' +
    '</button>';
  }).join("") || '<div class="empty">Inga avtal i urvalet.</div>';
}
function mobileQuickSummaryHtml(contracts) {
  const propertyCount = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
  const totalArea = contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
  const annualContracts = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  return '<section class="mobile-home-hero">' +
    '<div class="mobile-home-hero-copy"><span>AKTUELLT URVAL</span><h2>' + esc(portfolioScopeTitle()) + '</h2><p>' +
      propertyCount + ' fastigheter · ' + contracts.length + ' avtal · ' + num(totalArea) + ' kvm</p></div>' +
    '<div class="mobile-home-hero-value"><span>Årskostnad avtal</span><strong>' + money(annualContracts) +
      '</strong><small>Hyra + avtalsdrift</small></div>' +
  '</section>';
}

function mobileOverviewHtml(contracts) {
  const propertyCount = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
  const totalArea = contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
  const items = portfolioActivityItems(contracts);
  const groups = {
    maintenance: items.filter(function(x){return x.group==="maintenance";}),
    project: items.filter(function(x){return x.group==="project";}),
    drift: items.filter(function(x){return x.group==="drift" || x.group==="operations";}),
    wish: items.filter(function(x){return x.group==="wish";})
  };
  const plannedCost = groups.maintenance.concat(groups.project, groups.drift).reduce(function(sum,x){return sum+(Number(x.cost)||0);},0);
  const openItems = items.filter(function(item){return !/klar|klart|avslaget|utfört/i.test(String(item.status||""));});
  const due12 = contracts.filter(function(c){
    const months=monthsUntil(c.notice||c.end);
    return months!=null && months>=0 && months<=12;
  }).length;
  const attention = openItems.slice().sort(function(a,b){
    const aa=/akut|hög|sen|risk|åtgärdsbehov|pågår/i.test(String(a.status||""))?1:0;
    const bb=/akut|hög|sen|risk|åtgärdsbehov|pågår/i.test(String(b.status||""))?1:0;
    return bb-aa || (Number(b.cost)||0)-(Number(a.cost)||0);
  }).slice(0,4);
  return '<div class="mobile-kpi-grid">' +
    '<button type="button" data-portfolio-section="properties"><span>Fastigheter</span><strong>' + propertyCount + '</strong><small>' + num(totalArea) + ' kvm</small></button>' +
    '<button type="button" data-portfolio-section="activities"><span>Aktiva poster</span><strong>' + openItems.length + '</strong><small>' + money(plannedCost) + '</small></button>' +
  '</div>' +
  '<section class="mobile-shortcuts"><div class="mobile-section-title"><span>SE HELHETEN</span><h3>Välj vad du vill förstå</h3></div><div class="mobile-shortcut-grid">' +
    '<button type="button" class="maintenance" data-portfolio-section="maintenance"><span class="mobile-shortcut-icon">⌁</span><strong>Underhåll</strong><b>' + groups.maintenance.length + '</b><small>' + money(groups.maintenance.reduce(function(s,x){return s+(Number(x.cost)||0);},0)) + '</small></button>' +
    '<button type="button" class="drift" data-portfolio-section="drift"><span class="mobile-shortcut-icon">⚙</span><strong>Drift</strong><b>' + groups.drift.length + '</b><small>' + money(groups.drift.reduce(function(s,x){return s+(Number(x.cost)||0);},0)) + '</small></button>' +
    '<button type="button" class="contracts" data-portfolio-section="contracts"><span class="mobile-shortcut-icon">▤</span><strong>Avtal</strong><b>' + contracts.length + '</b><small>' + due12 + ' inom 12 mån</small></button>' +
    '<button type="button" class="wish" data-portfolio-section="wish"><span class="mobile-shortcut-icon">◇</span><strong>Önskemål</strong><b>' + groups.wish.length + '</b><small>' + money(groups.wish.reduce(function(s,x){return s+(Number(x.cost)||0);},0)) + '</small></button>' +
  '</div></section>' +
  '<section class="mobile-now"><div class="mobile-section-title"><span>ATT AGERA PÅ</span><h3>Det viktigaste just nu</h3></div>' +
    (attention.length ? attention.map(function(item){
      const property=state.properties.find(function(p){return p.id===item.propertyId;});
      return '<button type="button" class="mobile-now-row" data-portfolio-section="' + esc(item.group==="operations"?"drift":item.group) + '">' +
        '<span class="mobile-now-main"><strong>' + esc(item.title||item.type) + '</strong><small>' + esc(property ? (property.address||property.id) : "Fastighetsnivå") + ' · ' + esc(item.status||"") + '</small></span>' +
        '<span class="mobile-now-cost">' + money(item.cost) + '</span><b>›</b></button>';
    }).join("") : '<div class="empty compact">Inget kräver särskild uppmärksamhet just nu.</div>') +
  '</section>';
}
function mobileActivitiesHubHtml(contracts) {
  const items = portfolioActivityItems(contracts).filter(function(x){return ["maintenance","project","drift","operations","wish"].includes(x.group);});
  const categories = [
    ["maintenance","Underhåll","⌁"],["project","Projekt","◆"],["drift","Drift","⚙"],["wish","Önskemål","◇"]
  ];
  const open = items.filter(function(item){return !/klar|klart|avslaget|utfört/i.test(String(item.status||""));});
  const recent = open.slice().sort(function(a,b){return String(b.when||"").localeCompare(String(a.when||""));}).slice(0,8);
  return '<section class="mobile-activity-hub-head"><span>AKTIVITETER</span><h2>Allt som händer i urvalet</h2><p>Underhåll, projekt, drift och önskemål använder samma underlag och samma fastighetskoppling.</p></section>' +
    '<div class="mobile-activity-category-grid">' + categories.map(function(cat){
      const selected=items.filter(function(x){return cat[0]==="drift"?(x.group==="drift"||x.group==="operations"):x.group===cat[0];});
      const total=selected.reduce(function(s,x){return s+(Number(x.cost)||0);},0);
      return '<button type="button" data-portfolio-section="' + cat[0] + '"><span>' + cat[2] + '</span><strong>' + cat[1] + '</strong><b>' + selected.length + '</b><small>' + money(total) + '</small></button>';
    }).join("") + '</div>' +
    '<section class="mobile-now"><div class="mobile-section-title"><span>ÖPPET / PÅGÅENDE</span><h3>' + open.length + ' poster att följa</h3></div>' +
    (recent.length ? recent.map(function(item){
      const property=state.properties.find(function(p){return p.id===item.propertyId;});
      const group=item.group==="operations"?"drift":item.group;
      return '<button type="button" class="mobile-now-row" data-portfolio-section="' + group + '">' +
        '<span class="mobile-now-main"><strong>' + esc(item.title||item.type) + '</strong><small>' + esc(property ? (property.address||property.id) : "Fastighetsnivå") + ' · ' + esc(item.status||"") + '</small></span>' +
        '<span class="mobile-now-cost">' + money(item.cost) + '</span><b>›</b></button>';
    }).join("") : '<div class="empty compact">Inga öppna aktiviteter i urvalet.</div>') + '</section>';
}
function mobilePropertyHeroHtml(contracts) {
  const property=state.properties.find(function(p){return p.id===portfolioExplorer.propertyId;});
  if(!property) return "";
  const cs=propertyContractsForContext(contracts);
  const area=cs.reduce(function(s,c){return s+(Number(c.area)||0);},0);
  const annual=cs.reduce(function(s,c){return s+totalContractCost(c);},0);
  const people=Array.from(new Set(cs.flatMap(function(c){return contractPartyPeople(c,"our").map(function(p){return p.name;});}))).filter(Boolean);
  return '<section class="mobile-property-hero"><button type="button" class="mobile-property-back" data-clear-explorer="property">‹</button><div class="mobile-property-title"><span>FASTIGHET</span><h2>' + esc(property.address||property.id) + '</h2><p>' + esc(property.designation||property.id) + '</p></div>' +
    '<div class="mobile-property-facts"><div><span>Area</span><strong>' + num(area) + ' kvm</strong></div><div><span>Avtal</span><strong>' + cs.length + '</strong></div><div><span>Årskostnad</span><strong>' + money(annual) + '</strong></div><div><span>Ansvarig</span><strong>' + esc(people.join(", ")||property.manager||"–") + '</strong></div></div></section>';
}
function mobilePropertyOverviewHtml(contracts) {
  const cs=propertyContractsForContext(contracts);
  const items=portfolioActivityItems(cs);
  const cards=[
    ["maintenance","Underhåll",items.filter(function(x){return x.group==="maintenance";})],
    ["project","Projekt",items.filter(function(x){return x.group==="project";})],
    ["drift","Drift",items.filter(function(x){return x.group==="drift"||x.group==="operations";})],
    ["contracts","Avtal",cs],
    ["wish","Önskemål",items.filter(function(x){return x.group==="wish";})]
  ];
  return '<div class="mobile-property-overview-grid">' + cards.map(function(card){
    const total=card[0]==="contracts"?card[2].reduce(function(s,c){return s+totalContractCost(c);},0):card[2].reduce(function(s,x){return s+(Number(x.cost)||0);},0);
    return '<button type="button" data-portfolio-section="' + card[0] + '"><span>' + esc(card[1]) + '</span><strong>' + card[2].length + '</strong><small>' + money(total) + (card[0]==="contracts"?"/år":"") + '</small><b>→</b></button>';
  }).join("") + '</div>' + mobileActivitiesHubHtml(cs);
}
function mobileContextHtml() {
  if (portfolioExplorer.contractId) {
    const property=state.properties.find(function(p){return p.id===portfolioExplorer.propertyId;});
    return '<button type="button" class="mobile-back" data-clear-explorer="contract">← <span>' +
      esc(property ? (property.address||property.id) : "Fastigheten") + '</span></button>';
  }
  if (portfolioExplorer.propertyId) {
    const unit=document.getElementById("filter-unit");
    const parent=unit && unit.value ? unit.options[unit.selectedIndex].text : "Hela beståndet";
    return '<button type="button" class="mobile-back" data-clear-explorer="property">← <span>' + esc(parent) + '</span></button>';
  }
  return "";
}
function updateMobilePortfolioSurfaces(contracts) {
  const modes=document.getElementById("mobile-content-tabs");
  if(modes) {
    modes.innerHTML=mobileModeChooserHtml(contracts);
    bindPortfolioSectionControls();
  }

  const mobileFilters=document.getElementById("mobile-scope-filters");
  if(mobileFilters) {
    mobileFilters.innerHTML=mobileScopeFiltersHtml(portfolioFilterOptions());
    bindMobileScopeFilterControls();
  }

  const quickSummary=document.getElementById("mobile-quick-summary");
  if(quickSummary) quickSummary.innerHTML=mobileQuickSummaryHtml(contracts);

  const overview=document.getElementById("mobile-overview-content");
  if(overview) overview.innerHTML=portfolioExplorer.propertyId ? mobilePropertyOverviewHtml(contracts) : mobileOverviewHtml(contracts);

  const properties=document.getElementById("mobile-properties-content");
  if(properties) properties.innerHTML=mobilePropertyCardsHtml(contracts);

  const agreements=document.getElementById("mobile-contracts-content");
  if(agreements) agreements.innerHTML=mobileContractCardsHtml(contracts);

  const context=document.getElementById("mobile-context");
  if(context) context.innerHTML=mobileContextHtml();

  bindPortfolioExplorerControls();
}

function propertyContractsForContext(contracts) {
  if (!portfolioExplorer.propertyId) return contracts;
  return contracts.filter(function(c){return c.propertyId===portfolioExplorer.propertyId;});
}
function propertyPersistentContextHtml(contracts) {
  if (!portfolioExplorer.propertyId) return "";
  const property = state.properties.find(function(p){return p.id===portfolioExplorer.propertyId;});
  if (!property) return "";
  const cs = propertyContractsForContext(contracts);
  const area = cs.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
  const annual = cs.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  const owners = Array.from(new Set(cs.map(function(c){return contractOwner(c,property);}).filter(Boolean)));
  const customers = Array.from(new Set(cs.map(contractCustomer).filter(Boolean)));
  const units = Array.from(new Set(cs.map(function(c){return unitName(c.unitId);}).filter(Boolean)));
  const ourPeople = Array.from(new Set(cs.flatMap(function(c){return contractPartyPeople(c,"our").map(function(p){return p.name;});})));

  return '<section class="property-persistent">' +
    '<div class="property-identity"><div><span class="portfolio-kicker">FASTIGHET</span><h2>' + esc(property.address||property.id) + '</h2><p>' +
      esc(property.designation||property.id) + ' · ' + esc(property.type||"Fastighet") + '</p></div>' +
      '<button class="button secondary" type="button" data-clear-explorer="property">← Tillbaka till urvalet</button></div>' +
    '<div class="property-facts">' +
      '<div><span>Organisation</span><strong>' + esc(units.join(", ")||"–") + '</strong></div>' +
      '<div><span>Nyttjare</span><strong>' + esc(customers.join(", ")||"–") + '</strong></div>' +
      '<div><span>Fastighetsägare</span><strong>' + esc(owners.join(", ")||property.owner||"–") + '</strong></div>' +
      '<div><span>Ansvar hos oss</span><strong>' + esc(ourPeople.join(", ")||property.manager||"–") + '</strong></div>' +
      '<div><span>Area</span><strong>' + num(area) + ' kvm</strong></div>' +
      '<div><span>Avtal</span><strong>' + cs.length + ' st</strong></div>' +
      '<div><span>Hyra + avtalsdrift</span><strong>' + money(annual) + '/år</strong></div>' +
    '</div>' +
  '</section>';
}
function propertyAllSectionHtml(contracts, group, title, subtitle, addType) {
  const groups = group === "drift" ? ["drift","operations"] : [group];
  const items = portfolioActivityItems(contracts).filter(function(x){return groups.includes(x.group);});
  const total = items.reduce(function(sum,x){return sum+(Number(x.cost)||0);},0);
  const rows = items.slice(0,6).map(function(item){
    const editType = activityEditorType(item);
    return '<div class="property-work-row">' +
      '<div class="property-work-main"><strong>' + esc(item.title||"–") + '</strong><span>' + esc(item.type) + (item.responsible ? ' · ' + esc(item.responsible) : '') + '</span></div>' +
      '<div class="property-work-status">' + statusBadge(item.status) + '</div>' +
      '<div class="property-work-time">' + esc(item.when||"–") + '</div>' +
      '<div class="property-work-row-actions"><strong class="property-work-cost">' + money(item.cost) + '</strong>' +
        (editType ? '<button type="button" class="inline-link compact-link" data-edit-type="' + editType + '" data-edit-id="' + esc(item.id) + '">Redigera</button>' : '') +
      '</div>' +
    '</div>';
  }).join("");
  const add = addType ? '<button class="button secondary" data-add="' + addType + '">+ Lägg till</button>' : "";
  return '<section class="property-work-section"><div class="property-work-head"><div><span>' + esc(subtitle) + '</span><h3>' + esc(title) + '</h3></div>' +
    '<div class="property-work-actions"><strong>' + money(total) + '</strong><button class="inline-link" type="button" data-portfolio-section="' + group + '">Visa allt →</button>' + add + '</div></div>' +
    (rows || '<div class="empty compact">Inga poster ännu.</div>') + '</section>';
}
function propertyContractsSectionHtml(contracts) {
  const total = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  const rows = contracts.map(function(c){
    return '<div class="property-work-row"><div class="property-work-main"><strong>' + esc(c.number||c.id) + '</strong><span>' +
      esc(contractCustomer(c)) + ' · ' + num(c.area) + ' kvm</span></div><div class="property-work-status">' +
      statusBadge(activeInYear(c,new Date().getFullYear()) ? "Aktivt" : "Bevaka") + '</div><div class="property-work-time">' +
      esc(c.end||"–") + '</div><div class="property-work-row-actions"><strong class="property-work-cost">' + money(totalContractCost(c)) + '/år</strong>' +
      '<button type="button" class="inline-link compact-link" data-edit-type="object" data-edit-id="' + esc(c.id) + '">Redigera</button></div></div>';
  }).join("");
  return '<section class="property-work-section"><div class="property-work-head"><div><span>AVTAL & LOKALER</span><h3>Avtal</h3></div>' +
    '<div class="property-work-actions"><strong>' + money(total) + '/år</strong><button class="inline-link" type="button" data-portfolio-section="contracts">Visa allt →</button></div></div>' +
    (rows || '<div class="empty compact">Inga avtal ännu.</div>') + '</section>';
}
function propertyControlBoardHtml(contracts) {
  const activity = portfolioActivityItems(contracts);
  const planned = annualPlanningItems(contracts).filter(function(item) {
    return Number(item.year) === Number(maintenancePlanning.year);
  });
  const property = state.properties.find(function(p) { return p.id === portfolioExplorer.propertyId; });
  const groups = [
    { key:"maintenance", label:"Underhåll", items:activity.filter(function(x){return x.group==="maintenance";}), plannedCategory:"Underhåll" },
    { key:"project", label:"Projekt", items:activity.filter(function(x){return x.group==="project";}), plannedCategory:"Projekt" },
    { key:"drift", label:"Drift", items:activity.filter(function(x){return x.group==="drift" || x.group==="operations";}), plannedCategory:"Drift" }
  ];

  function groupCard(group) {
    const amount = group.items.reduce(function(sum,item){return sum+(Number(item.cost)||0);},0);
    const attention = group.items.filter(function(item){
      return /akut|hög|sen|beslut|åtgärdsbehov|risk|pågår|utreds/i.test(String(item.status||""));
    }).length;
    const unplaced = planned.filter(function(item){
      if(item.category!==group.plannedCategory) return false;
      const period=planningPeriod(item.source);
      return !period.quarter && !period.month;
    }).length;
    const largest = group.items.slice().sort(function(a,b){return (Number(b.cost)||0)-(Number(a.cost)||0);})[0];
    return '<button type="button" class="property-control-card" data-portfolio-section="' + group.key + '">' +
      '<span class="property-control-kicker">' + group.label.toUpperCase() + '</span>' +
      '<strong class="property-control-value">' + money(amount) + '</strong>' +
      '<div class="property-control-metrics"><span><b>' + group.items.length + '</b> poster</span>' +
        '<span class="' + (attention?"attention":"") + '"><b>' + attention + '</b> att följa</span>' +
        '<span class="' + (unplaced?"attention":"") + '"><b>' + unplaced + '</b> ej placerade</span></div>' +
      (largest ? '<small>Störst: ' + esc(largest.title||largest.type) + ' · ' + money(largest.cost) + '</small>' : '<small>Inga poster ännu</small>') +
      '<span class="property-control-link">Visa underlaget →</span>' +
    '</button>';
  }

  const annual = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  const contractWatch = contracts.map(function(c){
    return {contract:c, months:monthsUntil(c.notice||c.end)};
  }).filter(function(x){return x.months!=null && x.months>=0 && x.months<=12;});
  const contractCard = '<button type="button" class="property-control-card" data-portfolio-section="contracts">' +
    '<span class="property-control-kicker">AVTAL</span><strong class="property-control-value">' + money(annual) + '/år</strong>' +
    '<div class="property-control-metrics"><span><b>' + contracts.length + '</b> avtal</span><span class="' + (contractWatch.length?"attention":"") +
      '"><b>' + contractWatch.length + '</b> inom 12 mån</span></div>' +
    '<small>' + num(contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0)) + ' kvm i fastigheten</small>' +
    '<span class="property-control-link">Visa avtalen →</span></button>';

  const contractPeople = Array.from(new Set(contracts.flatMap(function(c){
    return contractPartyPeople(c,"our").map(function(p){return p.name;});
  }).filter(Boolean)));
  const activityPeople = Array.from(new Set(activity.map(function(item){return item.responsible;}).filter(Boolean)));
  const people = Array.from(new Set(contractPeople.concat(activityPeople)));
  const responsible = people.length ? people : (property && property.manager ? [property.manager] : []);
  const responsibilityCard = '<section class="property-control-card responsibility">' +
    '<span class="property-control-kicker">ANSVAR</span><strong class="property-control-value responsibility-value">' +
      esc(responsible.length ? responsible.slice(0,2).join(", ") : "Ansvarig saknas") + '</strong>' +
    '<div class="property-control-metrics"><span><b>' + responsible.length + '</b> ansvariga</span><span><b>' +
      activity.filter(function(item){return item.responsible;}).length + '</b> kopplade poster</span></div>' +
    '<small>' + (responsible.length ? 'Ansvar visas från avtal och kopplade arbetsobjekt.' : 'Lägg ansvar på avtal eller arbetsobjekt för tydlig uppföljning.') + '</small>' +
    '<span class="property-control-link muted-control-link">Samma ansvar följer objekten</span></section>';

  return '<section class="property-control-board">' +
    '<div class="planning-section-head"><div><span>STYRBILD</span><h3>Kostnad, aktivitet och ansvar</h3>' +
      '<p>Varje summa byggs av posterna i fastigheten. Klicka på ett block för att se och administrera underlaget.</p></div>' +
      '<strong class="property-control-year">' + esc(maintenancePlanning.year) + '</strong></div>' +
    '<div class="property-control-grid">' + groups.map(groupCard).join("") + contractCard + responsibilityCard + '</div>' +
  '</section>';
}

function propertyWorkspaceHtml(contracts) {
  const cs = propertyContractsForContext(contracts);
  return '<div class="property-all-workspace">' +
    '<div class="scope-details-intro property"><div><span class="portfolio-kicker">ALLT PÅ FASTIGHETEN</span><h3>Från sammanställning till post</h3></div>' +
      '<p>Samma kompakta upplägg som på områdes- och beståndsnivå. Redigera posten här eller via dess perspektiv.</p></div>' +
    scopeAllSectionsHtml(cs) +
  '</div>';
}

function scopeActivitySectionHtml(contracts, group, title, addType) {
  const groups = group === "drift" ? ["drift","operations"] : [group];
  const items = portfolioActivityItems(contracts).filter(function(item){return groups.includes(item.group);});
  const total = items.reduce(function(sum,item){return sum+(Number(item.cost)||0);},0);
  const multiProperty = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size > 1;

  const rows = items.map(function(item) {
    const property = state.properties.find(function(p){return p.id===item.propertyId;});
    const editType = activityEditorType(item);
    return '<div class="scope-list-row">' +
      '<div class="scope-list-main"><strong>' + esc(item.title||"–") + '</strong><span>' + esc(item.type) +
        (multiProperty && property ? ' · <button type="button" class="scope-inline-link" data-explorer-property="' + esc(property.id) + '">' +
          esc(property.address||property.id) + '</button>' : '') +
        (item.responsible ? ' · ' + esc(item.responsible) : '') +
      '</span></div>' +
      '<div class="scope-list-status">' + statusBadge(item.status) + '</div>' +
      '<div class="scope-list-time">' + esc(item.when||"–") + '</div>' +
      '<div class="scope-list-value"><strong>' + money(item.cost) + '</strong>' +
        (editType ? '<button type="button" class="inline-link compact-link" data-edit-type="' + editType + '" data-edit-id="' + esc(item.id) + '">Redigera</button>' : '') +
      '</div>' +
    '</div>';
  }).join("");

  return '<section class="scope-list-section">' +
    '<div class="scope-list-head"><button type="button" class="scope-list-title" data-portfolio-section="' + group + '">' +
      '<span>' + esc(title) + '</span><strong>' + money(total) + '</strong><small>' + items.length + ' poster</small></button>' +
      (addType ? '<button type="button" class="scope-add-button" data-add="' + addType + '">+ Ny</button>' : '') +
    '</div>' +
    (rows || '<div class="empty compact">Inga poster i urvalet.</div>') +
  '</section>';
}

function scopeContractsSectionHtml(contracts) {
  const total = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  const multiProperty = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size > 1;
  const rows = contracts.map(function(c) {
    const property = state.properties.find(function(p){return p.id===c.propertyId;});
    return '<div class="scope-list-row">' +
      '<div class="scope-list-main"><strong>' + esc(c.number||c.id) + '</strong><span>' + esc(contractCustomer(c)) +
        (multiProperty && property ? ' · <button type="button" class="scope-inline-link" data-explorer-property="' + esc(property.id) + '">' +
          esc(property.address||property.id) + '</button>' : '') + ' · ' + num(c.area) + ' kvm</span></div>' +
      '<div class="scope-list-status">' + statusBadge(activeInYear(c,new Date().getFullYear()) ? "Aktivt" : "Bevaka") + '</div>' +
      '<div class="scope-list-time">' + esc(c.end||"–") + '</div>' +
      '<div class="scope-list-value"><strong>' + money(totalContractCost(c)) + '/år</strong>' +
        '<button type="button" class="inline-link compact-link" data-edit-type="object" data-edit-id="' + esc(c.id) + '">Redigera</button></div>' +
    '</div>';
  }).join("");
  return '<section class="scope-list-section">' +
    '<div class="scope-list-head"><button type="button" class="scope-list-title" data-portfolio-section="contracts">' +
      '<span>Avtal</span><strong>' + money(total) + '/år</strong><small>' + contracts.length + ' avtal</small></button></div>' +
    (rows || '<div class="empty compact">Inga avtal i urvalet.</div>') +
  '</section>';
}

function scopeAllSectionsHtml(contracts) {
  return '<div class="scope-all-sections">' +
    scopeActivitySectionHtml(contracts,"maintenance","Underhåll","maintenance") +
    scopeActivitySectionHtml(contracts,"project","Projekt","project") +
    scopeActivitySectionHtml(contracts,"drift","Drift","driftIssue") +
    scopeContractsSectionHtml(contracts) +
    scopeActivitySectionHtml(contracts,"wish","Övriga behov","wish") +
  '</div>';
}

function portfolioOverviewHtml(contracts) {
  const propertyIds = new Set(contracts.map(function(c) { return c.propertyId; }).filter(Boolean));
  const totalArea = contracts.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0);
  const totalCost = contracts.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0);
  const costPerSqm = totalArea ? totalCost / totalArea : 0;
  const activity = portfolioActivityItems(contracts);
  const activeWork = activity.filter(function(item){
    return !/klar|klart|avslaget/i.test(String(item.status||""));
  }).length;

  return '<section class="summary-block">' +
    '<div class="summary-block-head"><div><span class="portfolio-kicker">SAMMANSTÄLLNING</span><h3>' + esc(portfolioScopeTitle()) + '</h3>' +
      '<p>Översikt först. Alla poster som bygger bilden ligger direkt under, med samma upplägg oavsett urval.</p></div></div>' +
    '<div class="overview-kpis compact">' +
      kpi("Fastigheter", num(propertyIds.size), "i aktuellt urval") +
      kpi("Avtal", num(contracts.length), "i aktuellt urval") +
      kpi("Area", num(totalArea) + " kvm", propertyIds.size ? num(totalArea / propertyIds.size) + " kvm / fastighet" : "–") +
      kpi("Hyra + drift", money(totalCost), totalArea ? num(costPerSqm) + " kr/kvm" : "–") +
      kpi("Aktuella poster", num(activeWork), "underhåll · projekt · drift") +
    '</div></section>' +
    '<div class="scope-details-intro"><div><span class="portfolio-kicker">ALLT I URVALET</span><h3>Från summa till post</h3></div>' +
      '<p>Rubrikerna visar totalsumman. Under varje rubrik ligger alla poster som bygger summan.</p></div>' +
    scopeAllSectionsHtml(contracts);
}
function renderProperties() {
  const filters=portfolioFilterOptions();
  const propertyGroups=state.properties.map(function(p) {
    const contracts=state.contracts.filter(function(c){return c.propertyId===p.id;});
    const area=contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    const cost=contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
    const owners=Array.from(new Set(contracts.map(function(c){return contractOwner(c,p);}).filter(Boolean)));
    const units=Array.from(new Set(contracts.map(function(c){return unitName(c.unitId);}).filter(Boolean)));
    const customers=Array.from(new Set(contracts.map(contractCustomer).filter(Boolean)));
    return '<details class="property-group" data-property-id="' + esc(p.id) + '"><summary class="property-summary">' +
      '<span class="property-summary-main"><strong>' + esc(p.address||"Adress saknas") + '</strong><span class="muted mono">' +
      esc(p.id)+(p.designation?' · '+esc(p.designation):'') + '</span></span><span><small>Typ</small>' + statusBadge(p.type) +
      '</span><span><small>Kund</small><strong>' + esc(customers.join(", ")||"–") + '</strong></span><span><small>Fastighetsägare</small><strong>' +
      esc(owners.join(", ")||p.owner||"–") + '</strong></span><span><small>Avtal</small><strong>' + contracts.length +
      '</strong></span><span><small>Area</small><strong>' + num(area) + ' kvm</strong></span><span><small>Hyra + drift</small><strong>' +
      money(cost) + '</strong></span><span class="property-chevron">⌄</span></summary><div class="property-body">' +
      '<div class="property-meta"><span><strong>Organisation</strong> ' + esc(units.join(", ")||"–") + '</span><span><strong>Fastighetsbeteckning</strong> ' +
      esc(p.designation||"–") + '</span><span><strong>Förvaltare</strong> ' + esc(p.manager||"–") + '</span>' +
      '<button type="button" class="inline-link" data-explorer-property="' + esc(p.id) + '">Öppna fastigheten →</button></div>' +
      table(["Avtal","Kund","Organisation","Fastighetsägare","Area","Hyra + drift","Ansvarig hos oss","Kundansvarig","Ägaransvarig"],
        contracts.map(function(c){return contractSummaryRow(c,p);})) + '</div></details>';
  }).join("") || '<div class="empty">Ingen fastighetsdata.</div>';

  const advancedFilters =
    '<details class="advanced-filters"><summary><span>Filter</span><span class="advanced-count">Kund · ägare · ansvariga</span></summary>' +
      '<div class="advanced-filter-grid">' +
        '<select class="select" id="filter-customer">' + selectOptions(filters.customer,"Alla kunder") + '</select>' +
        '<select class="select" id="filter-owner">' + selectOptions(filters.owner,"Alla fastighetsägare") + '</select>' +
        '<select class="select" id="filter-our-person">' + selectOptions(filters.ourPeople,"Ansvarig hos oss") + '</select>' +
        '<select class="select" id="filter-tenant-person">' + selectOptions(filters.tenantPeople,"Kundansvarig") + '</select>' +
        '<select class="select" id="filter-owner-person">' + selectOptions(filters.ownerPeople,"Ägaransvarig") + '</select>' +
      '</div></details>';

  return '<div class="bestands-page">' +
    '<section class="portfolio-hero">' +
      '<div class="desktop-only">' +
        '<div class="portfolio-hero-copy"><span class="portfolio-kicker">URVAL</span><h2 id="portfolio-scope-title">Alla fastigheter</h2>' +
          '<p id="portfolio-scope-meta">' + state.properties.length + ' fastigheter · ' + state.contracts.length + ' avtal</p></div>' +
        '<div class="scope-heading"><span>Zooma in</span><small>Välj område eller gå vidare till en fastighet</small></div>' +
        '<div class="scope-grid">' + portfolioScopeCardsHtml() + '</div>' +
      '</div>' +
      '<div id="mobile-quick-summary" class="mobile-only">' + mobileQuickSummaryHtml(state.contracts) + '</div>' +
      '<div id="mobile-scope-filters" class="mobile-only">' + mobileScopeFiltersHtml(filters) + '</div>' +
      '<div class="portfolio-search-row"><input class="search portfolio-search" id="portfolio-search" placeholder="Sök fastighet, avtal, kund eller person…">' +
        '<button class="button secondary" id="portfolio-filter-reset">Rensa</button></div>' +
      '<div id="mobile-content-tabs" class="mobile-content-tabs mobile-only">' + mobileModeChooserHtml(state.contracts) + '</div>' +
      '<div class="mobile-only" id="mobile-context"></div>' +
      '<select id="filter-unit" hidden>' + selectOptions(filters.unit,"Alla organisationer") + '</select>' +
      advancedFilters +
      '<div class="filter-result desktop-only" id="portfolio-filter-result">' + state.properties.length + ' fastigheter · ' + state.contracts.length + ' avtal</div>' +
      '<div class="portfolio-context desktop-only" id="portfolio-context"><span class="context-root">Alla</span></div>' +
    '</section>' +

    '<section class="card pad bestands-shell desktop-only">' +
      '<div id="property-persistent-context"></div>' +
      '<div class="view-choice-head"><span>Visa</span><small>Sammanställning eller fördjupning</small></div>' +
      '<div id="portfolio-content-tabs" role="tablist">' + portfolioContentTabsHtml(state.contracts) + '</div>' +
      '<div class="bestands-content">' +
        '<div class="property-tab-panel" id="overview-panel"><div id="portfolio-overview-content">' + portfolioOverviewHtml(state.contracts) + '</div></div>' +
        '<div class="property-tab-panel" id="properties-panel" hidden>' + propertyGroups + '</div>' +
        '<div class="property-tab-panel" id="contracts-panel" hidden><div class="content-action"><button class="button primary" data-add="object">Komplettera avtal</button></div>' +
          table(["Avtal","Fastighet","Kund","Organisation","Fastighetsägare","Area","Avtalsperiod","Årshyra","Avtalsdrift","Summa","Anst./brukare/rum","Ytor","Ansvariga"],
            state.contracts.map(detailedContractRow)) + '</div>' +
        '<div class="property-tab-panel" id="activity-panel" hidden><div id="portfolio-activity-content"></div></div>' +
      '</div></section>' +

    '<section class="mobile-only mobile-workspace ' + (portfolioExplorer.section==="activities" ? "plan-visible" : "") + '">' +
      '<div id="mobile-property-persistent-context"></div>' +
      '<div class="mobile-panels">' +
        '<div class="mobile-panel" id="mobile-overview-panel"><div id="mobile-overview-content">' + mobileOverviewHtml(state.contracts) + '</div></div>' +
        '<div class="mobile-panel" id="mobile-properties-panel" hidden><div id="mobile-properties-content">' + mobilePropertyCardsHtml(state.contracts) + '</div></div>' +
        '<div class="mobile-panel" id="mobile-contracts-panel" hidden><div id="mobile-contracts-content">' + mobileContractCardsHtml(state.contracts) + '</div></div>' +
        '<div class="mobile-panel" id="mobile-activity-panel" hidden><div id="mobile-activity-content"></div></div>' +
      '</div>' +
    '</section>' +
  '</div>';
}
function renderMap() {
  const filters = portfolioFilterOptions();
  const scopedContracts = portfolioScopeContracts();
  const scopedPropertyIds = new Set(scopedContracts.map(function(c){return c.propertyId;}).filter(Boolean));
  const scopedProperties = state.properties.filter(function(p){return scopedPropertyIds.has(p.id);});
  const mapped = scopedProperties.filter(function(p) {
    return Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
  });
  const missing = scopedProperties.length - mapped.length;
  const units = Array.from(new Set(state.contracts.map(function(c) { return c.unitId; }).filter(Boolean)));

  const mobileTop =
    '<div class="mobile-map-top mobile-only">' +
      '<div id="mobile-scope-filters">' + mobileScopeFiltersHtml(filters) + '</div>' +
      '<div class="portfolio-search-row"><input class="search portfolio-search" id="portfolio-search" value="' + esc(portfolioFilters.q||"") +
        '" placeholder="Sök fastighet, avtal, kund eller person…">' +
        '<button class="button secondary" id="portfolio-filter-reset">Rensa</button></div>' +
      '<select id="filter-unit" hidden>' + selectOptions(filters.unit,"Alla områden") + '</select>' +
      '<select id="filter-our-person" hidden>' + selectOptions(filters.ourPeople,"Alla ansvariga") + '</select>' +
      '<div class="mobile-map-metrics" role="tablist" aria-label="Nyckeltal på karta">' +
        [["cost","kr"],["sqm","kr/kvm"],["users","kr/brukare"],["employees","kr/anställd"]].map(function(metric){
          return '<button type="button" data-map-metric="' + metric[0] + '" class="' + (mobileMapMetric===metric[0]?"active":"") +
            '" role="tab" aria-selected="' + (mobileMapMetric===metric[0]?"true":"false") + '">' + metric[1] + '</button>';
        }).join("") +
      '</div>' +
    '</div>';

  const desktopToolbar =
    '<div class="toolbar map-toolbar desktop-only">' +
      '<select class="select" id="map-type"><option value="">Alla fastigheter</option><option>Intern</option><option>Extern</option></select>' +
      '<select class="select" id="map-unit"><option value="">Alla verksamhetsområden</option>' +
        units.map(function(id) { return '<option value="' + esc(id) + '"' + (portfolioFilters.unit===id?' selected':'') + '>' + esc(unitName(id)) + '</option>'; }).join("") +
      '</select>' +
      '<span class="map-count">' + mapped.length + ' kartlagda' + (missing ? ' · ' + missing + ' saknar koordinat' : '') + '</span>' +
    '</div>';

  return '<div class="map-page">' + mobileTop +
    '<div class="cross-view-scope desktop-only"><span>URVAL</span><strong>' + esc(portfolioScopeTitle()) +
      '</strong><small>Karta, listor och ekonomi använder samma urval</small></div>' +
    '<section class="card pad map-card">' +
      '<div class="card-head desktop-only"><div><h2>Karta</h2><p>Välj område eller klicka på en fastighet. Samma urval följer med tillbaka till övriga Lokalblick.</p></div></div>' +
      desktopToolbar +
      '<div id="property-map" class="property-map" role="region" aria-label="Karta över fastigheter"></div>' +
      '<div class="map-footnote desktop-only">Demokartan använder syntetiska koordinater. I företagsversionen hämtas koordinater via backend och godkänd karttjänst.</div>' +
    '</section></div>';
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

  function propertyMetric(property, contracts) {
    const cost = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
    const area = contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    const users = contracts.reduce(function(sum,c){return sum+(Number(c.users)||0);},0);
    const employees = contracts.reduce(function(sum,c){return sum+(Number(c.employees)||0);},0);
    if (mobileMapMetric === "sqm") return area ? cost/area : 0;
    if (mobileMapMetric === "users") return users ? cost/users : 0;
    if (mobileMapMetric === "employees") return employees ? cost/employees : 0;
    return cost;
  }

  function metricLabel(value) {
    if (mobileMapMetric === "cost") return money(value);
    return num(value) + " kr";
  }

  function buildPoints() {
    const type = document.getElementById("map-type") ? document.getElementById("map-type").value : "";
    const unit = document.getElementById("map-unit") ? document.getElementById("map-unit").value : portfolioFilters.unit;
    portfolioFilters.unit = unit || portfolioFilters.unit || "";
    const scopedContracts = portfolioScopeContracts();
    const scopedPropertyIds = new Set(scopedContracts.map(function(c){return c.propertyId;}).filter(Boolean));

    const rows = state.properties.filter(function(p) {
      if (!scopedPropertyIds.has(p.id)) return false;
      if (!Number.isFinite(Number(p.latitude)) || !Number.isFinite(Number(p.longitude))) return false;
      if (type && p.type !== type) return false;
      return true;
    }).map(function(p) {
      const cs=scopedContracts.filter(function(c){return c.propertyId===p.id;});
      return { property:p, contracts:cs, metric:propertyMetric(p,cs) };
    });
    const maxMetric=Math.max.apply(null,[1].concat(rows.map(function(row){return row.metric||0;})));

    return rows.map(function(row) {
      const p=row.property;
      return {
        id: p.id,
        latitude: Number(p.latitude),
        longitude: Number(p.longitude),
        popupHtml: mapPopupHtml(p),
        category: p.type || "Fastighet",
        metricValue: row.metric,
        metricLabel: metricLabel(row.metric),
        metricRatio: row.metric>0 ? Math.max(.08,row.metric/maxMetric) : .04
      };
    });
  }

  mapService.render({
    elementId: "property-map",
    points: buildPoints(),
    fallbackCenter: { latitude: 55.6050, longitude: 13.0038, zoom: 12 },
    onPointClick: function(point) {
      portfolioExplorer.propertyId = point.id || "";
      portfolioExplorer.contractId = "";
      portfolioExplorer.section = "overview";
      currentView = "properties";
      render();
    }
  });

  function redraw() {
    mapService.update(buildPoints());
  }

  const type = document.getElementById("map-type");
  const unit = document.getElementById("map-unit");
  if (type) type.addEventListener("change", redraw);
  if (unit) unit.addEventListener("change", function(){ portfolioFilters.unit=unit.value||""; redraw(); renderMobileDock(); });

  const search=document.getElementById("portfolio-search");
  if(search) search.addEventListener("input",function(){
    portfolioFilters.q=String(search.value||"").trim().toLowerCase();
    redraw();
  });

  document.querySelectorAll("[data-map-metric]").forEach(function(button){
    button.addEventListener("click",function(){
      mobileMapMetric=button.dataset.mapMetric||"cost";
      document.querySelectorAll("[data-map-metric]").forEach(function(b){
        b.classList.toggle("active",b===button);
        b.setAttribute("aria-selected",b===button?"true":"false");
      });
      redraw();
    });
  });
}
function budgetPlan(year) {
  return (state.budgetPlans || []).find(function(plan){return Number(plan.year)===Number(year);}) || null;
}
function budgetCategories() {
  return ["Hyra + drift","Projekt","Underhåll","Driftkostnader","Utredningar"];
}
function summarizeBudgetRows(rows) {
  return budgetCategories().map(function(category){
    return { category:category, amount:rows.filter(function(r){return r.category===category;}).reduce(function(sum,r){return sum+(Number(r.amount)||0);},0) };
  });
}
function budgetActualSummary(year, contracts) {
  const amounts = {"Hyra + drift":0,"Projekt":0,"Underhåll":0,"Driftkostnader":0,"Utredningar":0};
  const contractIds = new Set((contracts||state.contracts).map(function(c){return c.id;}));
  const propertyIds = new Set((contracts||state.contracts).map(function(c){return c.propertyId;}).filter(Boolean));
  function inScope(x) {
    return (x.contractId && contractIds.has(x.contractId)) || (!x.contractId && x.propertyId && propertyIds.has(x.propertyId));
  }
  state.operations.filter(function(x){return Number(x.period)===Number(year) && inScope(x);}).forEach(function(x){amounts["Driftkostnader"] += Number(x.actual)||0;});
  state.driftIssues.filter(function(x){return Number(x.budgetYear)===Number(year) && inScope(x);}).forEach(function(x){amounts["Driftkostnader"] += Number(x.finalCost)||0;});
  state.wishes.filter(function(x){return Number(x.budgetYear)===Number(year) && x.budgetCategory && x.budgetCategory!=="Ej budget" && inScope(x);}).forEach(function(x){
    amounts[x.budgetCategory] = (amounts[x.budgetCategory]||0) + (Number(x.finalCost)||0);
  });
  return budgetCategories().map(function(category){return {category:category,amount:amounts[category]||0};});
}
function budgetPropertyLabel(row) {
  const contract = row.contractId ? state.contracts.find(function(c){return c.id===row.contractId;}) : null;
  const property = contract ? state.properties.find(function(p){return p.id===contract.propertyId;}) : null;
  return property ? (property.address||property.id) : "–";
}
function budgetTimingLabel(row, year) {
  if (row.timing && row.timing !== "Ej placerad") return row.timing;
  if (row.category==="Hyra + drift" || row.category==="Driftkostnader") return "Löpande " + year;
  return String(year);
}
function budgetAdjustment(plan, category, baseAmount) {
  if (!plan || !plan.targets) return 0;
  return (Number(plan.targets[category])||0) - baseAmount;
}
function renderBudget() {
  const scopedContracts = portfolioScopeContracts();
  const scoped = hasPortfolioScope();
  const liveRows = budgetRows(selectedBudgetYear, scopedContracts);
  const plan = budgetPlan(selectedBudgetYear);
  const rawBaselineRows = plan && Array.isArray(plan.lines) && plan.lines.length ? plan.lines : budgetRows(selectedBudgetYear);
  const baselineRows = scoped ? budgetRowsForContracts(rawBaselineRows, scopedContracts) : rawBaselineRows;
  const baseSummary = summarizeBudgetRows(baselineRows);
  const forecastSummary = summarizeBudgetRows(liveRows);
  const actualSummary = budgetActualSummary(selectedBudgetYear, scopedContracts);
  const targets = {};
  baseSummary.forEach(function(row){
    targets[row.category] = !scoped && plan && plan.targets && Number.isFinite(Number(plan.targets[row.category])) ? Number(plan.targets[row.category]) : row.amount;
  });
  const budgetTotal = budgetCategories().reduce(function(sum,category){return sum+(Number(targets[category])||0);},0);
  const forecastTotal = forecastSummary.reduce(function(sum,row){return sum+row.amount;},0);
  const actualTotal = actualSummary.reduce(function(sum,row){return sum+row.amount;},0);
  const variance = forecastTotal - budgetTotal;
  const locked = Boolean(plan && plan.status==="Låst");

  const yearSelect = '<select class="select" id="budget-year">' + budgetYears().map(function(y) {
    return '<option value="' + y + '"' + (Number(y)===Number(selectedBudgetYear) ? " selected" : "") + ">" + y + "</option>";
  }).join("") + "</select>";

  const categoryCards = baseSummary.map(function(base){
    const forecast = forecastSummary.find(function(x){return x.category===base.category;}) || {amount:0};
    const actual = actualSummary.find(function(x){return x.category===base.category;}) || {amount:0};
    const target = targets[base.category] || 0;
    const adjustment = target - base.amount;
    const adjustmentControl = scoped
      ? '<strong class="budget-adjustment-value">–</strong>'
      : locked
        ? '<strong class="budget-adjustment-value">' + (adjustment>=0?"+":"") + money(adjustment) + '</strong>'
        : '<label class="budget-adjustment-edit"><span>Justering</span><input type="number" data-budget-adjustment="' + esc(base.category) + '" value="' + adjustment + '"></label>';
    return '<section class="budget-category-card"><div class="budget-category-head"><div><span>DETALJUNDERLAG</span><h3>' + esc(base.category) + '</h3></div><strong>' + money(target) + '</strong></div>' +
      '<div class="budget-equation"><div><span>Detaljer</span><strong>' + money(base.amount) + '</strong></div><div class="budget-plus">+</div><div><span>Justering</span>' +
      adjustmentControl + '</div><div class="budget-equals">=</div><div class="budget-target"><span>Årsbudget</span><strong>' + money(target) + '</strong></div></div>' +
      '<div class="budget-followup"><span>Prognos <strong>' + money(forecast.amount) + '</strong></span><span>Utfall <strong>' + money(actual.amount) + '</strong></span>' +
      '<span>Avvikelse <strong class="' + (forecast.amount-target>0?"negative":"positive") + '">' + (forecast.amount-target>=0?"+":"") + money(forecast.amount-target) + '</strong></span></div></section>';
  }).join("");

  const detailRows = baselineRows.map(function(r){
    return '<tr><td>' + esc(r.category) + '</td><td>' + esc(r.sub||"") + '</td><td>' + esc(r.source||"") + '</td><td>' +
      esc(budgetPropertyLabel(r)) + '</td><td>' + esc(budgetTimingLabel(r,selectedBudgetYear)) + '</td><td>' + money(r.amount) + '</td></tr>';
  });
  if (!scoped) baseSummary.forEach(function(base){
    const adjustment=budgetAdjustment(plan,base.category,base.amount);
    if (adjustment) detailRows.push('<tr class="budget-adjustment-row"><td>' + esc(base.category) + '</td><td>Budgetjustering</td><td>' +
      esc((plan && plan.notes && plan.notes[base.category]) || "Justeringspost") + '</td><td>–</td><td>Årsnivå</td><td>' +
      (adjustment>=0?"+":"") + money(adjustment) + '</td></tr>');
  });

  const status = plan ? '<span class="budget-status ' + (locked?"locked":"draft") + '">' + esc(plan.status||"Arbetsbudget") + '</span>' : '<span class="budget-status draft">Ej skapad</span>';
  const action = scoped
    ? '<span class="budget-lock-note">Urvalsvy · budgeten administreras på hela beståndet</span>'
    : !plan ? '<button class="button primary" id="budget-create">Skapa arbetsbudget från detaljer</button>' :
      locked ? '<span class="budget-lock-note">Låst ' + esc(plan.lockedAt||"") + ' · används som baslinje för uppföljning</span>' :
      '<button class="button primary" id="budget-lock">Lås årsbudget</button>';

  const scopeBridge = '<div class="cross-view-scope"><span>URVAL</span><strong>' + esc(portfolioScopeTitle()) + '</strong><small>' + scopedContracts.length + ' avtal följer med från Bestånd</small></div>';
  return '<div class="budget-page">' + scopeBridge + '<section class="budget-hero"><div><span class="portfolio-kicker">ÅRSBUDGET · BASLINJE · PROGNOS</span><h2>Budget ' +
    selectedBudgetYear + '</h2><p>' + (scoped ? 'Ekonomin är filtrerad med samma urval som resten av Lokalblick.' : 'Detaljerna bygger budgeten. Justeringsposter gör beslutad ram tydlig utan att skriva över underlaget.') + '</p></div>' +
    '<div class="budget-hero-actions">' + yearSelect + status + action + '</div></section><div class="budget-kpis">' +
    kpi("Beslutad budget",money(budgetTotal),locked?"låst årsbaslinje":"arbetsbudget") +
    kpi("Aktuell prognos",money(forecastTotal),"från dagens detaljposter") +
    kpi("Utfall registrerat",money(actualTotal),"bokfört/rapporterat i Lokalblick") +
    kpi("Prognosavvikelse",(variance>=0?"+":"") + money(variance),variance>0?"över budget":"inom budget") +
    '</div><div class="budget-category-grid">' + categoryCards + '</div>' +
    card("Budgetdetaljer","Låst budget består av importerade detaljposter plus explicita justeringsposter. Varje rad kan spåras till fastighet och källa.",
      table(["Kategori","Detalj","Källa","Fastighet","När","Belopp"],detailRows)) + '</div>';
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
    return '<tr><td><button type="button" class="table-link shared-scope-link" data-shared-unit="' + esc(u.id) + '"><strong>' + esc(u.name) + '</strong><small>Visa i Bestånd →</small></button></td><td>' + cs.length + '</td><td>' +
      num(cs.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0)) + " kvm</td><td>" +
      money(cs.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0)) + "</td><td>" + people.length + "</td></tr>";
  });
  const peopleRows = state.people.map(function(p) {
    const ass = state.assignments.filter(function(a) { return a.personId === p.id && !a.toDate; });
    const objects = ass.filter(function(a) { return a.targetType === "property" || a.targetType === "object"; }).map(function(a) { return targetName(a.targetType, a.targetId); });
    const projects = ass.filter(function(a) { return a.targetType === "project"; }).map(function(a) { return projectName(a.targetId); });
    const other = ass.filter(function(a) { return a.targetType !== "property" && a.targetType !== "object" && a.targetType !== "project"; }).map(function(a) { return targetName(a.targetType, a.targetId); });
    const load = personLoad(p.id);
    return '<tr><td><button type="button" class="table-link shared-scope-link" data-shared-person="' + esc(p.id) + '"><strong>' + esc(p.name) + '</strong><small>' + esc(p.role || "") + ' · Visa ansvar →</small></button></td><td>' + esc(orgType(p.organizationId)) +
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

function bindAddButtons() {
  document.querySelectorAll("[data-add]:not([data-add-bound])").forEach(function(button) {
    button.dataset.addBound = "1";
    button.addEventListener("click", function() { openEditor(button.dataset.add, ""); });
  });
}
function bindEditButtons() {
  document.querySelectorAll("[data-edit-type][data-edit-id]:not([data-edit-bound])").forEach(function(button) {
    button.dataset.editBound = "1";
    button.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      openEditor(button.dataset.editType, button.dataset.editId);
    });
  });
}
function bindMobileScopeFilterControls() {
  document.querySelectorAll(".mobile-filter-chip:not([data-mobile-chip-bound])").forEach(function(details) {
    details.dataset.mobileChipBound="1";
    details.addEventListener("toggle",function() {
      if (!details.open) return;
      document.querySelectorAll(".mobile-filter-chip[open]").forEach(function(other) {
        if (other !== details) other.removeAttribute("open");
      });
    });
  });
  document.querySelectorAll("[data-mobile-filter-id]:not([data-mobile-filter-bound])").forEach(function(button) {
    button.dataset.mobileFilterBound="1";
    button.addEventListener("click",function(event){
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.mobileFilterId === "filter-property") {
        portfolioExplorer.propertyId=button.dataset.mobileFilterValue||"";
        portfolioExplorer.contractId="";
        const propertyDetails=button.closest(".mobile-filter-chip");
        if(propertyDetails) propertyDetails.removeAttribute("open");
        if (currentView === "map") render(); else filterPropertyPortfolio();
        return;
      }

      const control=document.getElementById(button.dataset.mobileFilterId);
      if (!control) return;
      control.value=button.dataset.mobileFilterValue||"";
      syncPortfolioFiltersFromControls();
      portfolioExplorer.propertyId="";
      portfolioExplorer.contractId="";
      const details=button.closest(".mobile-filter-chip");
      if(details) details.removeAttribute("open");
      if (currentView === "map") render(); else filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-mobile-clear-scope]:not([data-mobile-filter-bound])").forEach(function(button) {
    button.dataset.mobileFilterBound="1";
    button.addEventListener("click",function(){
      ["filter-unit","filter-owner","filter-our-person"].forEach(function(id){
        const control=document.getElementById(id);
        if(control) control.value="";
      });
      portfolioFilters.unit="";
      portfolioFilters.owner="";
      portfolioFilters.ourPerson="";
      portfolioExplorer.propertyId="";
      portfolioExplorer.contractId="";
      if (currentView === "map") render(); else filterPropertyPortfolio();
    });
  });
}
function bindViewEvents() {
  applyPortfolioFiltersToControls();
  document.querySelectorAll("[data-shared-unit]:not([data-shared-bound])").forEach(function(button) {
    button.dataset.sharedBound="1";
    button.addEventListener("click",function(){
      clearPortfolioFilters();
      portfolioFilters.unit=button.dataset.sharedUnit||"";
      portfolioExplorer={propertyId:"",contractId:"",section:"overview"};
      currentView="properties";
      render();
    });
  });
  document.querySelectorAll("[data-shared-person]:not([data-shared-bound])").forEach(function(button) {
    button.dataset.sharedBound="1";
    button.addEventListener("click",function(){
      clearPortfolioFilters();
      portfolioFilters.ourPerson=button.dataset.sharedPerson||"";
      portfolioExplorer={propertyId:"",contractId:"",section:"overview"};
      currentView="properties";
      render();
    });
  });
  document.querySelectorAll("[data-goto]").forEach(function(button) {
    button.addEventListener("click", function() { currentView = button.dataset.goto; render(); });
  });
  bindAddButtons();
  bindEditButtons();
  ["portfolio-search", "filter-customer", "filter-unit", "filter-owner", "filter-our-person", "filter-tenant-person", "filter-owner-person"].forEach(function(id) {
    const control = document.getElementById(id);
    if (control && currentView !== "map") control.addEventListener(id === "portfolio-search" ? "input" : "change", filterPropertyPortfolio);
  });
  const reset = document.getElementById("portfolio-filter-reset");
  if (reset) reset.addEventListener("click", function() {
    ["portfolio-search", "filter-customer", "filter-unit", "filter-owner", "filter-our-person", "filter-tenant-person", "filter-owner-person"].forEach(function(id) {
      const control = document.getElementById(id);
      if (control) control.value = "";
    });
    clearPortfolioFilters();
    portfolioExplorer = { propertyId: "", contractId: "", section: "overview" };
    if (currentView === "map") render(); else filterPropertyPortfolio();
  });
  bindPortfolioSectionControls();
  bindPortfolioExplorerControls();
  bindMobileScopeFilterControls();
  applyPortfolioSectionVisibility();
  if (currentView === "properties") filterPropertyPortfolio();
  const by = document.getElementById("budget-year");
  if (by) by.addEventListener("change", function() { selectedBudgetYear = Number(by.value); render(); });

  const createBudget = document.getElementById("budget-create");
  if (createBudget) createBudget.addEventListener("click", async function() {
    if (hasPortfolioScope()) return;
    const rows = budgetRows(selectedBudgetYear).map(function(row){return Object.assign({},row);});
    const summary = summarizeBudgetRows(rows);
    const targets = {};
    summary.forEach(function(row){targets[row.category]=row.amount;});
    state.budgetPlans = state.budgetPlans || [];
    state.budgetPlans.push({year:selectedBudgetYear,status:"Arbetsbudget",createdAt:new Date().toISOString().slice(0,10),lockedAt:"",lines:rows,targets:targets,notes:{}});
    await saveState();
    render();
  });

  document.querySelectorAll("[data-budget-adjustment]").forEach(function(input) {
    input.addEventListener("change", async function() {
      const plan = budgetPlan(selectedBudgetYear);
      if (!plan || plan.status==="Låst") return;
      const category = input.dataset.budgetAdjustment;
      const base = summarizeBudgetRows(plan.lines || []).find(function(x){return x.category===category;});
      plan.targets = plan.targets || {};
      plan.targets[category] = (base ? base.amount : 0) + (Number(input.value)||0);
      await saveState();
      render();
    });
  });

  const lockBudget = document.getElementById("budget-lock");
  if (lockBudget) lockBudget.addEventListener("click", async function() {
    if (hasPortfolioScope()) return;
    const plan = budgetPlan(selectedBudgetYear);
    if (!plan || plan.status==="Låst") return;
    if (!confirm("Lås budget " + selectedBudgetYear + "? Budgeten blir baslinje för prognos och uppföljning.")) return;
    plan.status = "Låst";
    plan.lockedAt = new Date().toISOString().slice(0,10);
    await saveState();
    render();
  });
}
function syncPortfolioFiltersFromControls() {
  const ids = {
    q:"portfolio-search", customer:"filter-customer", unit:"filter-unit", owner:"filter-owner",
    ourPerson:"filter-our-person", tenantPerson:"filter-tenant-person", ownerPerson:"filter-owner-person"
  };
  Object.keys(ids).forEach(function(key) {
    const el=document.getElementById(ids[key]);
    if (!el) return;
    portfolioFilters[key] = key==="q" ? String(el.value||"").trim().toLowerCase() : (el.value||"");
  });
  return portfolioFilters;
}
function applyPortfolioFiltersToControls() {
  const ids = {
    q:"portfolio-search", customer:"filter-customer", unit:"filter-unit", owner:"filter-owner",
    ourPerson:"filter-our-person", tenantPerson:"filter-tenant-person", ownerPerson:"filter-owner-person"
  };
  Object.keys(ids).forEach(function(key) {
    const el=document.getElementById(ids[key]);
    if (el) el.value = portfolioFilters[key] || "";
  });
}
function clearPortfolioFilters() {
  portfolioFilters = { q:"", customer:"", unit:"", owner:"", ourPerson:"", tenantPerson:"", ownerPerson:"" };
}
function portfolioFilterValues() {
  syncPortfolioFiltersFromControls();
  return Object.assign({}, portfolioFilters);
}
function hasPortfolioScope() {
  return Boolean(portfolioExplorer.propertyId || portfolioExplorer.contractId || Object.keys(portfolioFilters).some(function(key){return Boolean(portfolioFilters[key]);}));
}
function portfolioScopeContracts() {
  const filters=Object.assign({},portfolioFilters);
  return state.contracts.filter(function(c){return contractMatchesPortfolio(c,filters);});
}
function budgetRowsForContracts(rows, contracts) {
  if (!Array.isArray(contracts)) return rows;
  const contractIds=new Set(contracts.map(function(c){return c.id;}));
  const propertyIds=new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean));
  return rows.filter(function(row){
    if (row.contractId) return contractIds.has(row.contractId);
    if (row.propertyId) return propertyIds.has(row.propertyId);
    return false;
  });
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
function activitySections() {
  return ["activities", "project", "maintenance", "drift", "wish", "investigation", "operations"];
}
function applyPortfolioSectionVisibility() {
  const section = portfolioExplorer.section || "overview";
  const overview = document.getElementById("overview-panel");
  const properties = document.getElementById("properties-panel");
  const contracts = document.getElementById("contracts-panel");
  const activity = document.getElementById("activity-panel");
  if (overview) overview.hidden = section !== "overview";
  if (properties) properties.hidden = section !== "properties";
  if (contracts) contracts.hidden = section !== "contracts";
  if (activity) activity.hidden = section === "activities" || !activitySections().includes(section);

  const mobileOverview = document.getElementById("mobile-overview-panel");
  const mobileProperties = document.getElementById("mobile-properties-panel");
  const mobileContracts = document.getElementById("mobile-contracts-panel");
  const mobileActivity = document.getElementById("mobile-activity-panel");
  if (mobileOverview) mobileOverview.hidden = section !== "overview";
  if (mobileProperties) mobileProperties.hidden = section !== "properties";
  if (mobileContracts) mobileContracts.hidden = section !== "contracts";
  if (mobileActivity) mobileActivity.hidden = !activitySections().includes(section);
}
function bindPortfolioSectionControls() {
  document.querySelectorAll("[data-portfolio-section]:not([data-section-bound])").forEach(function(button) {
    button.dataset.sectionBound = "1";
    button.addEventListener("click", function() {
      portfolioExplorer.section = button.dataset.portfolioSection || "overview";
      filterPropertyPortfolio();
      renderMobileDock();
    });
  });
}
function bindPortfolioExplorerControls() {
  document.querySelectorAll("[data-quick-unit]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function() {
      const control=document.getElementById("filter-unit");
      if(control) control.value=button.dataset.quickUnit || "";
      const keepSection = activitySections().includes(portfolioExplorer.section) ? portfolioExplorer.section : "overview";
      portfolioExplorer.propertyId="";
      portfolioExplorer.contractId="";
      portfolioExplorer.section=keepSection;
      const picker=button.closest(".mobile-scope-picker");
      if(picker) picker.removeAttribute("open");
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-set-filter]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function() {
      const control = document.getElementById(button.dataset.setFilter);
      if (!control) return;
      const keepSection = activitySections().includes(portfolioExplorer.section) ? portfolioExplorer.section : "overview";
      control.value = button.dataset.filterValue || "";
      portfolioExplorer.propertyId = "";
      portfolioExplorer.contractId = "";
      portfolioExplorer.section = keepSection;
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-explorer-property]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      const keepSection = activitySections().includes(portfolioExplorer.section) ? portfolioExplorer.section : "overview";
      portfolioExplorer.propertyId = button.dataset.explorerProperty || "";
      portfolioExplorer.contractId = "";
      portfolioExplorer.section = keepSection;
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-explorer-contract]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      const contract = state.contracts.find(function(x) { return x.id === button.dataset.explorerContract; });
      const keepSection = activitySections().includes(portfolioExplorer.section) ? portfolioExplorer.section : "overview";
      portfolioExplorer.contractId = button.dataset.explorerContract || "";
      portfolioExplorer.propertyId = contract ? contract.propertyId : portfolioExplorer.propertyId;
      portfolioExplorer.section = keepSection;
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-clear-explorer]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function() {
      if (button.dataset.clearExplorer === "property") {
        portfolioExplorer.propertyId = "";
        portfolioExplorer.contractId = "";
      }
      if (button.dataset.clearExplorer === "contract") portfolioExplorer.contractId = "";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-clear-filter]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function() {
      const control = document.getElementById(button.dataset.clearFilter);
      if (control) control.value = "";
      filterPropertyPortfolio();
    });
  });
}
function updatePortfolioSurfaces(contracts) {
  const overview = document.getElementById("portfolio-overview-content");
  if (overview) overview.innerHTML = portfolioExplorer.propertyId ? propertyWorkspaceHtml(contracts) : portfolioOverviewHtml(contracts);

  const propertyContext = document.getElementById("property-persistent-context");
  if (propertyContext) propertyContext.innerHTML = propertyPersistentContextHtml(contracts);
  const mobilePropertyContext = document.getElementById("mobile-property-persistent-context");
  if (mobilePropertyContext) mobilePropertyContext.innerHTML = portfolioExplorer.propertyId ? mobilePropertyHeroHtml(contracts) : "";

  const tabs = document.getElementById("portfolio-content-tabs");
  if (tabs) {
    tabs.innerHTML = portfolioContentTabsHtml(contracts);
    bindPortfolioSectionControls();
  }

  const activity = document.getElementById("portfolio-activity-content");
  if (activity) {
    activity.innerHTML = activitySections().includes(portfolioExplorer.section)
      ? portfolioActivityGroupedHtml(contracts, portfolioExplorer.section)
      : "";
  }

  const context = document.getElementById("portfolio-context");
  if (context) context.innerHTML = portfolioContextHtml();

  updatePortfolioScopeHeader(contracts);
  updateQuickScopeButtons();
  updateMobilePortfolioSurfaces(contracts);

  const mobileActivity = document.getElementById("mobile-activity-content");
  if (mobileActivity) {
    mobileActivity.innerHTML = portfolioExplorer.section === "activities"
      ? mobileActivitiesHubHtml(contracts)
      : activitySections().includes(portfolioExplorer.section)
        ? portfolioActivityGroupedHtml(contracts, portfolioExplorer.section)
        : "";
  }

  bindPortfolioExplorerControls();
  bindPortfolioSectionControls();
  bindAddButtons();
  bindEditButtons();
  bindMaintenancePlannerControls();
  bindAnnualPlannerControls();
  applyPortfolioSectionVisibility();
}
function filterPropertyPortfolio() {
  const filters = portfolioFilterValues();
  const matchedContracts = state.contracts.filter(function(c) { return contractMatchesPortfolio(c, filters); });
  const matchedIds = new Set(matchedContracts.map(function(c) { return c.id; }));
  const matchedPropertyIds = new Set(matchedContracts.map(function(c) { return c.propertyId; }));

  document.querySelectorAll(".property-group[data-property-id]").forEach(function(group) {
    const property = state.properties.find(function(p) { return p.id === group.dataset.propertyId; });
    const contracts = state.contracts.filter(function(c) { return c.propertyId === group.dataset.propertyId; });
    const matched = contracts.filter(function(c) { return matchedIds.has(c.id); });
    let show = matched.length > 0;
    if (!contracts.length && !filters.customer && !filters.unit && !filters.owner && !filters.ourPerson && !filters.tenantPerson && !filters.ownerPerson &&
        !portfolioExplorer.propertyId && !portfolioExplorer.contractId) {
      const text = [property && property.id, property && property.address, property && property.designation, property && property.owner]
        .filter(Boolean).join(" ").toLowerCase();
      show = !filters.q || text.includes(filters.q);
      if (show) matchedPropertyIds.add(group.dataset.propertyId);
    }
    group.hidden = !show;
    group.querySelectorAll("tbody tr[data-contract-id]").forEach(function(row) {
      row.hidden = !matchedIds.has(row.dataset.contractId);
    });
  });

  document.querySelectorAll("#contracts-panel tbody tr[data-contract-id]").forEach(function(row) {
    row.hidden = !matchedIds.has(row.dataset.contractId);
  });

  const result = document.getElementById("portfolio-filter-result");
  if (result) result.textContent = matchedPropertyIds.size + " fastigheter · " + matchedContracts.length + " avtal";

  updatePortfolioSurfaces(matchedContracts);
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
function editorCollection(type) {
  return {
    object: state.contracts,
    person: state.people,
    assignment: state.assignments,
    project: state.projects,
    maintenance: state.maintenance,
    operation: state.operations,
    investigation: state.investigations,
    maintenanceStatus: state.maintenanceStatus,
    driftIssue: state.driftIssues,
    wish: state.wishes
  }[type] || null;
}
function editorRecordById(type, id) {
  const collection = editorCollection(type);
  return collection ? collection.find(function(item) { return item.id === id; }) : null;
}
function activityEditorType(item) {
  return {
    "Projekt":"project",
    "Underhåll":"maintenance",
    "Underhållsstatus":"maintenanceStatus",
    "Driftärende":"driftIssue",
    "Driftkostnad":"operation",
    "Önskemål":"wish",
    "Utredning":"investigation"
  }[item && item.type] || "";
}
function editorContextContractId(record) {
  if (record && record.contractId) return record.contractId;
  if (portfolioExplorer.contractId) return portfolioExplorer.contractId;
  if (portfolioExplorer.propertyId) {
    const contract = state.contracts.find(function(c) { return c.propertyId === portfolioExplorer.propertyId; });
    return contract ? contract.id : "";
  }
  return "";
}
function openEditor(type, recordId) {
  editorType = type;
  const existing = recordId ? editorRecordById(type, recordId) : null;
  editorRecord = existing ? { type:type, id:existing.id, record:existing } : null;
  const editing = Boolean(existing);
  const titles = {
    object: "Komplettera objekt / avtal",
    person: editing ? "Redigera person" : "Lägg till person",
    assignment: editing ? "Redigera tilldelning" : "Lägg till tilldelning",
    project: editing ? "Redigera projekt" : "Lägg till projekt",
    maintenance: editing ? "Redigera UH-behov" : "Lägg till UH-behov",
    operation: editing ? "Redigera driftpost" : "Lägg till driftpost",
    investigation: editing ? "Redigera utredning" : "Lägg till utredning",
    maintenanceStatus: editing ? "Redigera underhållsstatus" : "Lägg till underhållsstatus",
    driftIssue: editing ? "Redigera driftärende" : "Lägg till driftärende",
    wish: editing ? "Redigera önskemål" : "Lägg till önskemål"
  };
  document.getElementById("dialog-title").textContent = titles[type] || (editing ? "Redigera" : "Lägg till");
  document.getElementById("dialog-eyebrow").textContent = editing ? "REDIGERA SAMMA POST" : "NY POST";

  function fieldValue(name, preset) {
    if (type === "object" && existing && name === "contractId") return existing.id;
    if (existing && Object.prototype.hasOwnProperty.call(existing, name)) return existing[name] == null ? "" : existing[name];
    if (name === "contractId") return editorContextContractId(existing);
    return preset == null ? "" : preset;
  }
  function optionHtml(value, label, selectedValue) {
    return '<option value="' + esc(value) + '"' + (String(value) === String(selectedValue) ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  document.getElementById("dialog-fields").innerHTML = fieldTemplates[type].map(function(field) {
    const name = field[0], label = field[1], kind = field[2], preset = field[3], required = field[4];
    const value = fieldValue(name, preset);
    let control = "";
    if (kind === "select") {
      control = '<select name="' + name + '"' + (required ? " required" : "") + ">" +
        String(preset).split("|").map(function(v) { return optionHtml(v, v, value); }).join("") + "</select>";
    } else if (kind === "contract") {
      control = '<select name="' + name + '"' + (required ? " required" : "") + '>' +
        optionHtml("", "–", value) +
        state.contracts.map(function(c) { return optionHtml(c.id, (c.number || c.id) + " · " + propertyName(c.propertyId), value); }).join("") + "</select>";
    } else if (kind === "person") {
      control = '<select name="' + name + '" required>' +
        state.people.map(function(p) { return optionHtml(p.id, p.name, value); }).join("") + "</select>";
    } else if (kind === "organization") {
      control = '<select name="' + name + '" required>' +
        state.organizations.map(function(o) { return optionHtml(o.id, orgType(o.id) + " · " + o.name, value); }).join("") + "</select>";
    } else if (kind === "unit") {
      control = '<select name="' + name + '"' + (required ? " required" : "") + '>' + optionHtml("", "–", value) +
        ORG_UNITS.map(function(u) { return optionHtml(u.id, u.name, value); }).join("") + "</select>";
    } else if (kind === "internalperson") {
      const internalPeople = state.people.filter(function(p) {
        const org = state.organizations.find(function(o) { return o.id === p.organizationId; });
        return org && org.type === "our";
      });
      control = '<select name="' + name + '">' + optionHtml("", "–", value) +
        internalPeople.map(function(p) { return optionHtml(p.id, p.name, value); }).join("") + "</select>";
    } else if (kind === "maintenanceCategory") {
      control = '<select name="' + name + '" required>' +
        MAINTENANCE_STATUS_CATEGORIES.map(function(v) { return optionHtml(v, v, value); }).join("") + "</select>";
    } else if (kind === "issueCategory") {
      control = '<select name="' + name + '" required>' +
        DRIFT_ISSUE_CATEGORIES.map(function(v) { return optionHtml(v, v, value); }).join("") + "</select>";
    } else if (kind === "wishCategory") {
      control = '<select name="' + name + '" required>' +
        WISH_CATEGORIES.map(function(v) { return optionHtml(v, v, value); }).join("") + "</select>";
    } else if (kind === "target") {
      control = '<input name="' + name + '" value="' + esc(value) + '" placeholder="Objekt-ID eller ProjektID" required>';
    } else if (kind === "textarea") {
      control = '<textarea name="' + name + '" rows="4">' + esc(value) + '</textarea>';
    } else {
      control = '<input name="' + name + '" type="' + kind + '" value="' + esc(value) + '"' + (required ? " required" : "") + ">";
    }
    return '<div class="field ' + (kind === "textarea" ? "full" : "") + '"><label>' + label + "</label>" + control + "</div>";
  }).join("");
  document.getElementById("editor-dialog").showModal();
}
function nextId(prefix, list) {
  const max = Math.max.apply(null, [0].concat(list.map(function(x) { return Number(String(x.id).replace(/\D/g, "")) || 0; })));
  return prefix + (max + 1);
}
function syncResponsibleAssignment(targetType, targetId, personId, fromDate) {
  const today = new Date().toISOString().slice(0,10);
  const active = state.assignments.filter(function(a) {
    return a.targetType === targetType && a.targetId === targetId && !a.toDate;
  });
  const same = active.find(function(a) { return a.personId === personId; });
  active.forEach(function(a) {
    if (!personId || a.personId !== personId) a.toDate = today;
  });
  if (personId && !same) {
    state.assignments.push({
      id: nextId("A", state.assignments),
      personId: personId,
      targetType: targetType,
      targetId: targetId,
      role: "Ansvarig",
      fromDate: fromDate || today,
      toDate: "",
      allocation: 0
    });
  }
}
async function saveEditor(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const existing = editorRecord && editorRecord.type === editorType ? editorRecord.record : null;

  if (editorType === "object") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    if (!c) return false;
    ["annualRent", "annualContractDrift", "employees", "users", "rooms", "commonArea", "apartmentArea"].forEach(function(k) { c[k] = Number(data[k]) || 0; });
    c.unitId = data.unitId || "";
  } else if (editorType === "person") {
    const target = existing || { id: nextId("P", state.people) };
    Object.assign(target, data);
    if (!existing) state.people.push(target);
  } else if (editorType === "assignment") {
    const target = existing || { id: nextId("A", state.assignments) };
    Object.assign(target, data);
    target.allocation = Number(data.allocation) || 0;
    if (!existing) state.assignments.push(target);
  } else if (editorType === "project") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("PR", state.projects), planningQuarter:null, planningMonth:null };
    const id = target.id, planningQuarter = target.planningQuarter, planningMonth = target.planningMonth;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    ["budgetYear", "budgetInvestigation", "budgetExecution", "budgetFurnishing", "preliminaryCost"].forEach(function(k) { target[k] = Number(target[k]) || 0; });
    target.planningQuarter = planningQuarter == null ? null : planningQuarter;
    target.planningMonth = planningMonth == null ? null : planningMonth;
    if (!existing) state.projects.push(target);
  } else if (editorType === "maintenance") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("UH", state.maintenance), planningQuarter:null, planningMonth:null };
    const id = target.id, planningQuarter = target.planningQuarter, planningMonth = target.planningMonth;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    target.year = Number(target.year) || null;
    target.cost = Number(target.cost) || 0;
    target.planningQuarter = planningQuarter == null ? null : planningQuarter;
    target.planningMonth = planningMonth == null ? null : planningMonth;
    if (!existing) state.maintenance.push(target);
  } else if (editorType === "operation") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("D", state.operations) };
    const id = target.id;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    target.period = Number(target.period) || null;
    target.budget = Number(target.budget) || 0;
    target.actual = Number(target.actual) || 0;
    if (!existing) state.operations.push(target);
  } else if (editorType === "investigation") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("U", state.investigations) };
    const id = target.id;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    target.year = Number(target.year) || null;
    target.cost = Number(target.cost) || 0;
    if (!existing) state.investigations.push(target);
  } else if (editorType === "maintenanceStatus") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("MS", state.maintenanceStatus) };
    const id = target.id;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    target.budgetYear = Number(target.budgetYear) || null;
    target.estimatedCost = Number(target.estimatedCost) || 0;
    if (!existing) state.maintenanceStatus.push(target);
    syncResponsibleAssignment("maintenanceStatus", target.id, target.responsiblePersonId || "", target.assessedDate || "");
  } else if (editorType === "driftIssue") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("DI", state.driftIssues), planningQuarter:null, planningMonth:null };
    const id = target.id, planningQuarter = target.planningQuarter, planningMonth = target.planningMonth;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    target.budgetYear = Number(target.budgetYear) || null;
    target.estimatedCost = Number(target.estimatedCost) || 0;
    target.finalCost = Number(target.finalCost) || 0;
    target.planningQuarter = planningQuarter == null ? null : planningQuarter;
    target.planningMonth = planningMonth == null ? null : planningMonth;
    if (!existing) state.driftIssues.push(target);
    syncResponsibleAssignment("driftIssue", target.id, target.responsiblePersonId || "", target.createdDate || "");
  } else if (editorType === "wish") {
    const contract = state.contracts.find(function(x) { return x.id === data.contractId; });
    const target = existing || { id: nextId("W", state.wishes) };
    const id = target.id;
    Object.assign(target, data);
    target.id = id;
    target.propertyId = contract ? contract.propertyId : (target.propertyId || portfolioExplorer.propertyId || "");
    target.budgetYear = Number(target.budgetYear) || null;
    target.estimatedCost = Number(target.estimatedCost) || 0;
    target.finalCost = Number(target.finalCost) || 0;
    if (!existing) state.wishes.push(target);
    syncResponsibleAssignment("wish", target.id, target.responsiblePersonId || "", target.createdDate || "");
  }

  editorRecord = null;
  await saveState();
  render();
  return true;
}

// Real LEB import belongs to the authenticated backend.
// The public GitHub Pages frontend contains no Excel/LEB import path.

document.getElementById("clear-data").addEventListener("click", async function() {
  if (confirm("Återställ publik demodata i denna webbläsare?")) {
    state = ensureShape(await window.LokalblickDataService.reset());
    currentView = "properties";
    render();
  }
});
document.getElementById("dialog-cancel").addEventListener("click", function() {
  editorRecord = null;
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
