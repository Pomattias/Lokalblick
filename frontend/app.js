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
  { id: "properties", label: "Bestånd", icon: "▦", eyebrow: "HELHET · FASTIGHET · AVTAL · AKTUELLT" },
  { id: "map", label: "Karta", icon: "⌖", eyebrow: "GEOGRAFI" },
  { id: "budget", label: "Årsbudget", icon: "¤", eyebrow: "EKONOMI" },
  { id: "organisation", label: "Organisation", icon: "◎", eyebrow: "PERSONER & ANSVAR" },
  { id: "about", label: "Om", icon: "ⓘ", eyebrow: "SÄKERHET & ARKITEKTUR" }
];

let state = clone(demo);
let currentView = "properties";
let selectedBudgetYear = new Date().getFullYear() + 1;
let maintenancePlanning = { year: new Date().getFullYear() + 1, mode: "quarter" };
let editorType = null;
let portfolioExplorer = { propertyId: "", contractId: "", section: "overview" };

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
      filterPropertyPortfolio();
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
    if (investigation > 0) rows.push({ category: "Utredningar", sub: "Projektutredning", source: p.name, contractId: p.contractId, amount: investigation, timing: maintenanceTimingLabel(p) });
    if (project > 0) rows.push({ category: "Projekt", sub: "Genomförande + inredning", source: p.name, contractId: p.contractId, amount: project, timing: maintenanceTimingLabel(p) });
  });
  state.maintenance.filter(function(u) { return Number(u.year) === Number(year) && Number(u.cost) > 0; }).forEach(function(u) {
    rows.push({ category: "Underhåll", sub: u.title, source: u.title, contractId: u.contractId, amount: Number(u.cost), timing: maintenanceTimingLabel(u) });
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
    rows.push({ category: "Underhåll", sub: x.category, source: "Status: " + x.category, contractId: x.contractId, amount: Number(x.estimatedCost), timing: maintenanceTimingLabel(x) });
  });
  state.driftIssues.filter(function(x) {
    return x.includeInBudget === "Ja" && Number(x.budgetYear) === Number(year) && Number(x.estimatedCost) > 0 && x.status !== "Klar";
  }).forEach(function(x) {
    rows.push({ category: "Driftkostnader", sub: x.category, source: "Ärende: " + x.title, contractId: x.contractId, amount: Number(x.estimatedCost), timing: maintenanceTimingLabel(x) });
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
  if (currentView === "properties") html = renderProperties();
  else if (currentView === "map") html = renderMap();
  else if (currentView === "budget") html = renderBudget();
  else if (currentView === "organisation") html = renderOrganisation();
  else html = renderAbout();
  document.getElementById("content").innerHTML = html;
  bindViewEvents();
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
      detail:[["Skede",x.phase||"–"],["Start",x.start||"–"],["Slut",x.end||"–"],["Inflyttning",x.moveIn||"–"],
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
      detail:[["Kategori",x.category||"–"],["Prioritet",x.priority||"–"],["Upplagt",x.createdDate||"–"],["Tidplan",x.targetDate||"–"],
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
  const maintenance = items.filter(function(x){return x.group==="maintenance";});
  const projects = items.filter(function(x){return x.group==="project";});
  const drift = items.filter(function(x){return x.group==="drift" || x.group==="operations";});
  const wishes = items.filter(function(x){return x.group==="wish";});
  const sum = function(list){return list.reduce(function(total,item){return total+(Number(item.cost)||0);},0);};
  const propertyCount = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
  const modes = propertyMode ? [
    ["overview","Alla","◫","Allt som hör till fastigheten",""],
    ["maintenance","Underhåll","⌂","Planerade och identifierade behov",money(sum(maintenance))],
    ["project","Projekt","◇","Utredning och genomförande",money(sum(projects))],
    ["drift","Drift","⚙","Driftkostnader och driftärenden",money(sum(drift))],
    ["wish","Önskemål","＋","Behov från verksamheten",wishes.length],
    ["contracts","Avtal","≣","Avtal, area och årskostnad",contracts.length]
  ] : [
    ["overview","Helhet","◫","Överblick, signaler och kostnader",""],
    ["properties","Fastigheter","▦","Samlad bild per fastighet",propertyCount],
    ["maintenance","Underhåll","⌂","Behov och planerade åtgärder",maintenance.length],
    ["project","Projekt","◇","Projekt, tid och budget",projects.length],
    ["drift","Drift","⚙","Driftkostnader och driftärenden",drift.length],
    ["wish","Önskemål","＋","Behov från verksamheten",wishes.length],
    ["contracts","Avtal","≣","Avtal, area och ekonomi",contracts.length]
  ];
  return modes.map(function(mode) {
    const active = portfolioExplorer.section === mode[0];
    return '<button class="mode-card ' + (active ? "active" : "") + '" type="button" data-portfolio-section="' + mode[0] +
      '" role="tab" aria-selected="' + (active ? "true" : "false") + '">' +
      '<span class="mode-icon">' + mode[2] + '</span>' +
      '<span class="mode-copy"><strong>' + esc(mode[1]) + '</strong><small>' + esc(mode[3]) + '</small></span>' +
      (mode[4] === "" ? '<span class="mode-arrow">→</span>' : '<span class="mode-count">' + esc(mode[4]) + '</span>') +
      '</button>';
  }).join("");
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
        '</div></div></details>';
    }).join("");
    return '<section class="activity-property-group"><div class="activity-property-head"><div><button type="button" class="table-link" data-explorer-property="' +
      esc(propertyId) + '"><strong>' + esc(property ? (property.address || property.id) : propertyId) + '</strong></button>' +
      '<span class="muted mono">' + esc(propertyId) + '</span></div><div><strong>' + items.length + '</strong><span> poster</span></div>' +
      '<div><strong>' + money(total) + '</strong><span> kostnad</span></div></div>' + records + '</section>';
  }).join("");
  const planner = group === "maintenance" ? maintenancePlannerHtml(contracts) : "";
  return '<div class="activity-view-head"><div><h3>' + esc(activityGroupLabel(group)) + '</h3><p>Grupperat per fastighet. Öppna en post för detaljer eller klicka vidare till fastighet/avtal.</p></div>' +
    '<div class="activity-view-actions">' + action + '</div></div>' + planner + (groups || '<div class="empty">Ingen data i urvalet.</div>');
}
function portfolioContextHtml() {
  const parts = ['<span class="context-root">Helhet</span>'];
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
  const cards = [{ id:"", name:"Hela beståndet" }].concat(ORG_UNITS.map(function(unit) {
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
  if (unit && unit.value) return unit.options[unit.selectedIndex].text;
  const customer=document.getElementById("filter-customer");
  if (customer && customer.value) return customer.options[customer.selectedIndex].text;
  const owner=document.getElementById("filter-owner");
  if (owner && owner.value) return owner.options[owner.selectedIndex].text;
  return "Hela beståndet";
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

function mobileScopePickerHtml() {
  const cards = [{ id:"", name:"Hela beståndet" }].concat(ORG_UNITS.map(function(unit) {
    return { id:unit.id, name:unit.name };
  }));
  return '<details class="mobile-scope-picker" id="mobile-scope-picker">' +
    '<summary><span class="mobile-picker-kicker">Område</span><strong id="mobile-scope-label">Hela beståndet</strong><span class="mobile-picker-chevron">⌄</span></summary>' +
    '<div class="mobile-scope-options">' +
      cards.map(function(card) {
        const contracts = card.id ? state.contracts.filter(function(c){return c.unitId===card.id;}) : state.contracts;
        const properties = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
        return '<button type="button" data-quick-unit="' + esc(card.id) + '">' +
          '<span><strong>' + esc(card.name) + '</strong><small>' + properties + ' fastigheter · ' + contracts.length + ' avtal</small></span><span>→</span>' +
        '</button>';
      }).join("") +
    '</div></details>';
}
function mobileModeChooserHtml(contracts) {
  const items = portfolioActivityItems(contracts);
  const propertyMode = Boolean(portfolioExplorer.propertyId);
  const propertyCount = new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
  const counts = {
    overview:"",
    properties:propertyCount,
    contracts:contracts.length,
    project:items.filter(function(x){return x.group==="project";}).length,
    maintenance:items.filter(function(x){return x.group==="maintenance";}).length,
    drift:items.filter(function(x){return x.group==="drift" || x.group==="operations";}).length,
    wish:items.filter(function(x){return x.group==="wish";}).length
  };
  const primary = propertyMode ? [
    ["overview","Alla","◫"],
    ["maintenance","Underhåll","⌂"],
    ["project","Projekt","◇"],
    ["drift","Drift","⚙"]
  ] : [
    ["overview","Helhet","◫"],
    ["properties","Fastigheter","▦"],
    ["maintenance","Underhåll","⌂"],
    ["project","Projekt","◇"]
  ];
  const secondary = propertyMode ? [
    ["wish","Önskemål","＋"],
    ["contracts","Avtal","≣"]
  ] : [
    ["drift","Drift","⚙"],
    ["wish","Önskemål","＋"],
    ["contracts","Avtal","≣"]
  ];
  function button(mode, extraClass) {
    const active = portfolioExplorer.section === mode[0];
    return '<button type="button" class="mobile-mode-button ' + (extraClass || "") + (active ? ' active' : '') +
      '" data-portfolio-section="' + mode[0] + '">' +
      '<span class="mobile-mode-icon">' + mode[2] + '</span><span>' + esc(mode[1]) + '</span>' +
      (counts[mode[0]] === "" ? "" : '<strong>' + counts[mode[0]] + '</strong>') +
    '</button>';
  }
  const selectedSecondary = secondary.find(function(mode){return mode[0]===portfolioExplorer.section;});
  return '<div class="mobile-mode-primary">' + primary.map(function(mode){return button(mode,"");}).join("") + '</div>' +
    '<details class="mobile-more-modes"' + (selectedSecondary ? " open" : "") + '>' +
      '<summary><span>' + (selectedSecondary ? esc(selectedSecondary[1]) : "Mer") + '</span><span>⌄</span></summary>' +
      '<div class="mobile-more-grid">' + secondary.map(function(mode){return button(mode,"secondary");}).join("") + '</div>' +
    '</details>';
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
function mobileOverviewHtml(contracts) {
  const propertyCount=new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
  const totalArea=contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
  const totalCost=contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  const items=portfolioActivityItems(contracts);
  const maintenance=items.filter(function(x){return x.group==="maintenance";}).length;
  const projects=items.filter(function(x){return x.group==="project";}).length;
  const issues=items.filter(function(x){return x.group==="drift";}).length;
  const wishes=items.filter(function(x){return x.group==="wish";}).length;
  const due12=contracts.filter(function(c){
    const months=monthsUntil(c.notice||c.end);
    return months!=null && months>=0 && months<=12;
  }).length;
  const missingResponsible=contracts.filter(function(c){return !contractPartyPeople(c,"our").length;}).length;
  return '<div class="mobile-overview-summary">' +
    '<div><strong>' + propertyCount + '</strong><span>Fastigheter</span></div>' +
    '<div><strong>' + contracts.length + '</strong><span>Avtal</span></div>' +
    '<div><strong>' + num(totalArea) + '</strong><span>kvm</span></div>' +
    '<div><strong>' + money(totalCost) + '</strong><span>Hyra + drift</span></div>' +
  '</div>' +
  '<section class="mobile-attention"><div class="mobile-section-title"><span>ATT AGERA PÅ</span><h3>Det viktigaste just nu</h3></div>' +
    '<div class="mobile-attention-grid">' +
      '<button type="button" data-portfolio-section="contracts"><strong>' + due12 + '</strong><span>Avtal inom 12 mån</span><b>→</b></button>' +
      '<button type="button" data-portfolio-section="maintenance"><strong>' + maintenance + '</strong><span>Underhåll</span><b>→</b></button>' +
      '<button type="button" data-portfolio-section="drift"><strong>' + issues + '</strong><span>Driftärenden</span><b>→</b></button>' +
      '<button type="button" data-portfolio-section="contracts"><strong>' + missingResponsible + '</strong><span>Saknar ansvarig</span><b>→</b></button>' +
    '</div></section>' +
  '<section class="mobile-workload"><div class="mobile-section-title"><span>PLANERING</span><h3>Aktuellt i urvalet</h3></div>' +
    '<div class="mobile-workload-row">' +
      '<button type="button" data-portfolio-section="project"><strong>' + projects + '</strong><span>Projekt</span></button>' +
      '<button type="button" data-portfolio-section="wish"><strong>' + wishes + '</strong><span>Önskemål</span></button>' +
      '<button type="button" data-portfolio-section="properties"><strong>' + propertyCount + '</strong><span>Fastigheter</span></button>' +
    '</div></section>';
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
  const label=document.getElementById("mobile-scope-label");
  if(label) label.textContent=portfolioScopeTitle();

  const modes=document.getElementById("mobile-content-tabs");
  if(modes) {
    modes.innerHTML=mobileModeChooserHtml(contracts);
    bindPortfolioSectionControls();
  }

  const overview=document.getElementById("mobile-overview-content");
  if(overview) overview.innerHTML=portfolioExplorer.propertyId ? propertyWorkspaceHtml(contracts) : mobileOverviewHtml(contracts);

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
  const items = portfolioActivityItems(cs);
  const maintenance = items.filter(function(x){return x.group==="maintenance";});
  const projects = items.filter(function(x){return x.group==="project";});
  const drift = items.filter(function(x){return x.group==="drift" || x.group==="operations";});
  const wishes = items.filter(function(x){return x.group==="wish";});
  const sumCost = function(list){return list.reduce(function(sum,x){return sum+(Number(x.cost)||0);},0);};
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
    '<div class="property-cost-strip">' +
      '<button type="button" data-portfolio-section="maintenance"><span>Underhåll</span><strong>' + money(sumCost(maintenance)) + '</strong><small>' + maintenance.length + ' poster</small></button>' +
      '<button type="button" data-portfolio-section="project"><span>Projekt</span><strong>' + money(sumCost(projects)) + '</strong><small>' + projects.length + ' poster</small></button>' +
      '<button type="button" data-portfolio-section="drift"><span>Drift</span><strong>' + money(sumCost(drift)) + '</strong><small>' + drift.length + ' poster</small></button>' +
      '<button type="button" data-portfolio-section="wish"><span>Önskemål</span><strong>' + wishes.length + ' st</strong><small>' + money(sumCost(wishes)) + ' bedömt</small></button>' +
      '<button type="button" data-portfolio-section="contracts"><span>Avtal</span><strong>' + cs.length + ' st</strong><small>' + money(annual) + '/år</small></button>' +
    '</div>' +
  '</section>';
}
function propertyAllSectionHtml(contracts, group, title, subtitle, addType) {
  const groups = group === "drift" ? ["drift","operations"] : [group];
  const items = portfolioActivityItems(contracts).filter(function(x){return groups.includes(x.group);});
  const total = items.reduce(function(sum,x){return sum+(Number(x.cost)||0);},0);
  const rows = items.slice(0,6).map(function(item){
    return '<div class="property-work-row">' +
      '<div class="property-work-main"><strong>' + esc(item.title||"–") + '</strong><span>' + esc(item.type) + (item.responsible ? ' · ' + esc(item.responsible) : '') + '</span></div>' +
      '<div class="property-work-status">' + statusBadge(item.status) + '</div>' +
      '<div class="property-work-time">' + esc(item.when||"–") + '</div>' +
      '<div class="property-work-cost">' + money(item.cost) + '</div>' +
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
      esc(c.end||"–") + '</div><div class="property-work-cost">' + money(totalContractCost(c)) + '/år</div></div>';
  }).join("");
  return '<section class="property-work-section"><div class="property-work-head"><div><span>AVTAL & LOKALER</span><h3>Avtal</h3></div>' +
    '<div class="property-work-actions"><strong>' + money(total) + '/år</strong><button class="inline-link" type="button" data-portfolio-section="contracts">Visa allt →</button></div></div>' +
    (rows || '<div class="empty compact">Inga avtal ännu.</div>') + '</section>';
}
function propertyWorkspaceHtml(contracts) {
  const cs = propertyContractsForContext(contracts);
  return '<div class="property-all-workspace">' +
    '<div class="property-all-intro"><div><span class="portfolio-kicker">ALLT PÅ FASTIGHETEN</span><h3>Planera och agera från samma vy</h3>' +
      '<p>Varje post är samma objekt oavsett om du kommer hit via fastigheten eller via Underhåll, Projekt, Drift eller Önskemål.</p></div></div>' +
    annualPlanDashboardHtml(cs,"property") +
    propertyAllSectionHtml(cs,"maintenance","Underhåll","BEHOV · PLANÅR · KOSTNAD","maintenance") +
    propertyAllSectionHtml(cs,"project","Projekt","UTREDNING · GENOMFÖRANDE · TID","project") +
    propertyAllSectionHtml(cs,"drift","Drift","DRIFTKOSTNAD · ÄRENDE · UTFALL","driftIssue") +
    propertyAllSectionHtml(cs,"wish","Önskemål","VERKSAMHETENS BEHOV · BESLUT · KOSTNAD","wish") +
    propertyContractsSectionHtml(cs) +
  '</div>';
}

function portfolioOverviewHtml(contracts) {
  const propertyIds = new Set(contracts.map(function(c) { return c.propertyId; }).filter(Boolean));
  const totalArea = contracts.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0);
  const totalCost = contracts.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0);
  const costPerSqm = totalArea ? totalCost / totalArea : 0;
  const activityItems = portfolioActivityItems(contracts);
  const plannedCosts = [
    { key:"maintenance", label:"Underhåll", items:activityItems.filter(function(x){return x.group==="maintenance";}) },
    { key:"project", label:"Projekt", items:activityItems.filter(function(x){return x.group==="project";}) },
    { key:"drift", label:"Drift", items:activityItems.filter(function(x){return x.group==="drift" || x.group==="operations";}) },
    { key:"wish", label:"Önskemål", items:activityItems.filter(function(x){return x.group==="wish";}) }
  ].map(function(group){
    return {
      key:group.key,
      label:group.label,
      count:group.items.length,
      amount:group.items.reduce(function(sum,item){return sum+(Number(item.cost)||0);},0)
    };
  });

  const customerRows = portfolioPatternRows(
    contracts,
    contractCustomerKey,
    contractCustomer,
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
      const property = state.properties.find(function(x) { return x.id === c.propertyId; });
      return contractOwnerKey(c, property);
    },
    function(c) {
      const property = state.properties.find(function(x) { return x.id === c.propertyId; });
      return contractOwner(c, property);
    },
    totalContractCost
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
      const row = responsibility.get(person.id) || {
        key: person.id,
        label: person.name,
        count: 0,
        value: 0
      };
      row.count += 1;
      row.value += 1;
      responsibility.set(person.id, row);
    });
  });
  const responsibilityRows = Array.from(responsibility.values()).sort(function(a, b) {
    return b.count - a.count;
  });

  const watch = contracts.map(function(c) {
    const months = monthsUntil(c.notice || c.end);
    return {
      contract: c,
      months: months,
      date: c.notice || c.end || ""
    };
  }).filter(function(x) {
    return x.months != null && x.months >= 0;
  }).sort(function(a, b) {
    return a.months - b.months;
  });

  const within12 = watch.filter(function(x) { return x.months <= 12; }).length;
  const within24 = watch.filter(function(x) { return x.months > 12 && x.months <= 24; }).length;

  const watchRows = watch.slice(0, 6).map(function(item) {
    return '<tr><td><button type="button" class="table-link" data-explorer-contract="' + esc(item.contract.id) + '"><strong>' +
      esc(item.contract.number || item.contract.id) +
      '</strong></button></td><td><button type="button" class="table-link" data-explorer-property="' +
      esc(item.contract.propertyId) + '">' + esc(propertyName(item.contract.propertyId)) +
      '</button></td><td>' + esc(item.date) + '</td><td>' +
      (item.months <= 12 ? statusBadge("≤ 12 mån") : statusBadge(item.months <= 24 ? "13–24 mån" : "> 24 mån")) +
      '</td></tr>';
  });

  function concentration(rows, denominator, suffix) {
    return rows.length && denominator
      ? percent(rows[0].value / denominator * 100) + " hos " + rows[0].label + suffix
      : "–";
  }

  return '<div class="overview-kpis">' +
    kpi("Fastigheter", num(propertyIds.size), "i aktuellt urval") +
    kpi("Avtal", num(contracts.length), "i aktuellt urval") +
    kpi("Area", num(totalArea) + " kvm", propertyIds.size ? num(totalArea / propertyIds.size) + " kvm / fastighet" : "–") +
    kpi("Hyra + drift", money(totalCost), totalArea ? num(costPerSqm) + " kr/kvm" : "–") +
    '</div>' +
    annualPlanDashboardHtml(contracts,"portfolio") +
    '<section class="portfolio-cost-picture">' +
      '<div class="planning-section-head"><div><span>DETALJER SOM BYGGER HELHETEN</span><h3>Var ligger behoven och kostnaderna?</h3>' +
        '<p>Samma poster kan öppnas från denna helhet eller från respektive fastighet.</p></div></div>' +
      '<div class="portfolio-cost-grid">' + plannedCosts.map(function(group) {
        return '<button type="button" data-portfolio-section="' + group.key + '">' +
          '<span>' + esc(group.label) + '</span><strong>' + money(group.amount) + '</strong><small>' + group.count + ' poster · visa →</small>' +
        '</button>';
      }).join("") + '</div>' +
    '</section>' +

    '<section class="signals-section">' +
      '<div class="planning-section-head"><div><span>SIGNALER</span><h3>Det här bör du ha koll på</h3></div></div>' +
      '<div class="signal-grid">' +
        '<div class="signal-card"><span>Avtal inom 12 mån</span><strong>' + within12 + '</strong><small>' + within24 + ' ytterligare inom 24 mån</small></div>' +
        '<div class="signal-card"><span>Saknar ansvarig</span><strong>' + missingResponsible + '</strong><small>av ' + contracts.length + ' avtal</small></div>' +
        '<div class="signal-card"><span>Kundkoncentration</span><strong>' + esc(concentration(customerRows, totalArea, " av arean")) + '</strong></div>' +
        '<div class="signal-card"><span>Ägarkoncentration</span><strong>' + esc(concentration(ownerRows, totalCost, " av kostnaden")) + '</strong></div>' +
      '</div>' +
    '</section>' +

    '<section class="patterns-section">' +
      '<div class="planning-section-head"><div><span>MÖNSTER</span><h3>Fördelning i urvalet</h3>' +
      '<p>Klicka på en rad för att fördjupa hela Bestånd-vyn.</p></div></div>' +
      '<div class="pattern-grid">' +
        portfolioPatternHtml("Kunder", "Fördelning av area", customerRows, function(row) {
          return num(row.value) + " kvm · " + row.count + " avtal";
        }, "filter-customer") +
        portfolioPatternHtml("Organisation", "Välj verksamhetsområde", unitRows, function(row) {
          return num(row.value) + " kvm · " + row.count + " avtal";
        }, "filter-unit") +
        portfolioPatternHtml("Fastighetsägare", "Fördelning av hyra + drift", ownerRows, function(row) {
          return money(row.value) + " · " + row.count + " avtal";
        }, "filter-owner") +
        portfolioPatternHtml("Ansvar hos oss", "Antal avtal per ansvarig", responsibilityRows, function(row) {
          return row.count + " avtal";
        }, "filter-our-person") +
      '</div>' +
    '</section>' +

    '<div class="pattern-watch">' +
      '<div class="pattern-head"><h3>Kommande avtalsbevakning</h3><p>Närmaste uppsägningsdatum, annars avtalslut.</p></div>' +
      table(["Avtal", "Fastighet", "Bevakningsdatum", "Tid kvar"], watchRows) +
    '</div>';
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
        '<div class="portfolio-hero-copy"><span class="portfolio-kicker">BESTÅND</span><h2 id="portfolio-scope-title">Hela beståndet</h2>' +
          '<p id="portfolio-scope-meta">' + state.properties.length + ' fastigheter · ' + state.contracts.length + ' avtal</p></div>' +
        '<div class="scope-heading"><span>Välj verksamhetsområde</span><small>Ett klick uppdaterar hela planeringsytan</small></div>' +
        '<div class="scope-grid">' + portfolioScopeCardsHtml() + '</div>' +
      '</div>' +
      '<div class="mobile-only mobile-scope-wrap">' + mobileScopePickerHtml() + '<div id="mobile-context"></div></div>' +
      '<select id="filter-unit" hidden>' + selectOptions(filters.unit,"Alla organisationer") + '</select>' +
      '<div class="portfolio-search-row"><input class="search portfolio-search" id="portfolio-search" placeholder="Sök fastighet, avtal, kund eller person…">' +
        '<button class="button secondary" id="portfolio-filter-reset">Rensa</button></div>' +
      advancedFilters +
      '<div class="filter-result desktop-only" id="portfolio-filter-result">' + state.properties.length + ' fastigheter · ' + state.contracts.length + ' avtal</div>' +
      '<div class="portfolio-context desktop-only" id="portfolio-context"><span class="context-root">Helhet</span></div>' +
    '</section>' +

    '<section class="card pad bestands-shell desktop-only">' +
      '<div id="property-persistent-context"></div>' +
      '<div class="mode-heading"><div><span>VAD VILL DU SE?</span><h3>Välj arbetsyta</h3></div><small>Samma urval följer med mellan nivåerna</small></div>' +
      '<div class="mode-grid" id="portfolio-content-tabs" role="tablist">' + portfolioContentTabsHtml(state.contracts) + '</div>' +
      '<div class="bestands-content">' +
        '<div class="property-tab-panel" id="overview-panel"><div id="portfolio-overview-content">' + portfolioOverviewHtml(state.contracts) + '</div></div>' +
        '<div class="property-tab-panel" id="properties-panel" hidden>' + propertyGroups + '</div>' +
        '<div class="property-tab-panel" id="contracts-panel" hidden><div class="content-action"><button class="button primary" data-add="object">Komplettera avtal</button></div>' +
          table(["Avtal","Fastighet","Kund","Organisation","Fastighetsägare","Area","Avtalsperiod","Årshyra","Avtalsdrift","Summa","Anst./brukare/rum","Ytor","Ansvariga"],
            state.contracts.map(detailedContractRow)) + '</div>' +
        '<div class="property-tab-panel" id="activity-panel" hidden><div id="portfolio-activity-content"></div></div>' +
      '</div></section>' +

    '<section class="mobile-only mobile-workspace">' +
      '<div id="mobile-property-persistent-context"></div>' +
      '<div id="mobile-content-tabs" class="mobile-content-tabs">' + mobileModeChooserHtml(state.contracts) + '</div>' +
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
function budgetActualSummary(year) {
  const amounts = {"Hyra + drift":0,"Projekt":0,"Underhåll":0,"Driftkostnader":0,"Utredningar":0};
  state.operations.filter(function(x){return Number(x.period)===Number(year);}).forEach(function(x){amounts["Driftkostnader"] += Number(x.actual)||0;});
  state.driftIssues.filter(function(x){return Number(x.budgetYear)===Number(year);}).forEach(function(x){amounts["Driftkostnader"] += Number(x.finalCost)||0;});
  state.wishes.filter(function(x){return Number(x.budgetYear)===Number(year) && x.budgetCategory && x.budgetCategory!=="Ej budget";}).forEach(function(x){
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
  const liveRows = budgetRows(selectedBudgetYear);
  const plan = budgetPlan(selectedBudgetYear);
  const baselineRows = plan && Array.isArray(plan.lines) && plan.lines.length ? plan.lines : liveRows;
  const baseSummary = summarizeBudgetRows(baselineRows);
  const forecastSummary = summarizeBudgetRows(liveRows);
  const actualSummary = budgetActualSummary(selectedBudgetYear);
  const targets = {};
  baseSummary.forEach(function(row){
    targets[row.category] = plan && plan.targets && Number.isFinite(Number(plan.targets[row.category])) ? Number(plan.targets[row.category]) : row.amount;
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
    const adjustmentControl = locked
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
  baseSummary.forEach(function(base){
    const adjustment=budgetAdjustment(plan,base.category,base.amount);
    if (adjustment) detailRows.push('<tr class="budget-adjustment-row"><td>' + esc(base.category) + '</td><td>Budgetjustering</td><td>' +
      esc((plan && plan.notes && plan.notes[base.category]) || "Justeringspost") + '</td><td>–</td><td>Årsnivå</td><td>' +
      (adjustment>=0?"+":"") + money(adjustment) + '</td></tr>');
  });

  const status = plan ? '<span class="budget-status ' + (locked?"locked":"draft") + '">' + esc(plan.status||"Arbetsbudget") + '</span>' : '<span class="budget-status draft">Ej skapad</span>';
  const action = !plan ? '<button class="button primary" id="budget-create">Skapa arbetsbudget från detaljer</button>' :
    locked ? '<span class="budget-lock-note">Låst ' + esc(plan.lockedAt||"") + ' · används som baslinje för uppföljning</span>' :
    '<button class="button primary" id="budget-lock">Lås årsbudget</button>';

  return '<div class="budget-page"><section class="budget-hero"><div><span class="portfolio-kicker">ÅRSBUDGET · BASLINJE · PROGNOS</span><h2>Budget ' +
    selectedBudgetYear + '</h2><p>Detaljerna bygger budgeten. Justeringsposter gör beslutad ram tydlig utan att skriva över underlaget.</p></div>' +
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

function bindAddButtons() {
  document.querySelectorAll("[data-add]:not([data-add-bound])").forEach(function(button) {
    button.dataset.addBound = "1";
    button.addEventListener("click", function() { openEditor(button.dataset.add); });
  });
}
function bindViewEvents() {
  document.querySelectorAll("[data-goto]").forEach(function(button) {
    button.addEventListener("click", function() { currentView = button.dataset.goto; render(); });
  });
  bindAddButtons();
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
    portfolioExplorer = { propertyId: "", contractId: "", section: "overview" };
    filterPropertyPortfolio();
  });
  bindPortfolioSectionControls();
  bindPortfolioExplorerControls();
  applyPortfolioSectionVisibility();
  if (currentView === "properties") filterPropertyPortfolio();
  const by = document.getElementById("budget-year");
  if (by) by.addEventListener("change", function() { selectedBudgetYear = Number(by.value); render(); });

  const createBudget = document.getElementById("budget-create");
  if (createBudget) createBudget.addEventListener("click", async function() {
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
    const plan = budgetPlan(selectedBudgetYear);
    if (!plan || plan.status==="Låst") return;
    if (!confirm("Lås budget " + selectedBudgetYear + "? Budgeten blir baslinje för prognos och uppföljning.")) return;
    plan.status = "Låst";
    plan.lockedAt = new Date().toISOString().slice(0,10);
    await saveState();
    render();
  });
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
function activitySections() {
  return ["project", "maintenance", "drift", "wish", "investigation", "operations"];
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
  if (activity) activity.hidden = !activitySections().includes(section);

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
    });
  });
}
function bindPortfolioExplorerControls() {
  document.querySelectorAll("[data-quick-unit]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function() {
      const control=document.getElementById("filter-unit");
      if(control) control.value=button.dataset.quickUnit || "";
      portfolioExplorer.propertyId="";
      portfolioExplorer.contractId="";
      portfolioExplorer.section="overview";
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
      control.value = button.dataset.filterValue || "";
      portfolioExplorer.propertyId = "";
      portfolioExplorer.contractId = "";
      portfolioExplorer.section = "overview";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-explorer-property]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      portfolioExplorer.propertyId = button.dataset.explorerProperty || "";
      portfolioExplorer.contractId = "";
      portfolioExplorer.section = "overview";
      filterPropertyPortfolio();
    });
  });
  document.querySelectorAll("[data-explorer-contract]:not([data-explorer-bound])").forEach(function(button) {
    button.dataset.explorerBound = "1";
    button.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      const contract = state.contracts.find(function(x) { return x.id === button.dataset.explorerContract; });
      portfolioExplorer.contractId = button.dataset.explorerContract || "";
      portfolioExplorer.propertyId = contract ? contract.propertyId : portfolioExplorer.propertyId;
      portfolioExplorer.section = "overview";
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
  if (mobilePropertyContext) mobilePropertyContext.innerHTML = propertyPersistentContextHtml(contracts);

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
    mobileActivity.innerHTML = activitySections().includes(portfolioExplorer.section)
      ? portfolioActivityGroupedHtml(contracts, portfolioExplorer.section)
      : "";
  }

  bindPortfolioExplorerControls();
  bindPortfolioSectionControls();
  bindAddButtons();
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
    data.planningQuarter = null;
    data.planningMonth = null;
    state.projects.push(data);
  } else if (editorType === "maintenance") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    data.id = nextId("UH", state.maintenance);
    data.propertyId = c ? c.propertyId : "";
    data.year = Number(data.year) || null;
    data.cost = Number(data.cost) || 0;
    data.planningQuarter = null;
    data.planningMonth = null;
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
    data.planningQuarter = null;
    data.planningMonth = null;
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
    currentView = "properties";
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
