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
  { id: "properties", label: "Översikt", icon: "⌂", eyebrow: "BESTÅND" },
  { id: "map", label: "Karta", icon: "⌖", eyebrow: "GEOGRAFI" },
  { id: "budget", label: "Budget", icon: "¤", eyebrow: "EKONOMI" },
  { id: "organisation", label: "Organisation", icon: "◎", eyebrow: "PERSONER & ANSVAR" },
  { id: "api", label: "Datakällor", icon: "⌁", eyebrow: "DATA & KOPPLINGAR" },
  { id: "about", label: "Om", icon: "ⓘ", eyebrow: "SÄKERHET & ARKITEKTUR" }
];

let state = clone(demo);
let switchingView = false;
let currentView = "properties";
let selectedBudgetYear = new Date().getFullYear() + 1;
let maintenancePlanning = { year: new Date().getFullYear() + 1, mode: "quarter" };
let mobileMapMetric = "cost";
let mobilePlanAssignee = "";
let editorType = null;
let editorRecord = null;
let portfolioExplorer = { propertyId: "", contractId: "", section: "overview" };
let portfolioFilters = {
  q: "", customer: "", unit: "", owner: "", ourPerson: "", tenantPerson: "", ownerPerson: ""
};

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

let auditBaseline = null;
let accessMode = "read";
const AUDIT_COLLECTIONS = [["properties","Fastighet"],["contracts","Avtal"],["organizations","Organisation"],["people","Person"],["assignments","Tilldelning"],["projects","Projekt"],["maintenance","Underhåll"],["operations","Driftkostnad"],["investigations","Utredning"],["maintenanceStatus","Underhållsstatus"],["driftIssues","Driftärende"],["wishes","Önskemål"],["budgetPlans","Budget"]];
const AUDIT_FIELD_LABELS={revisionReason:"Anledning",revisedBy:"Budget ändrad av",revisedAt:"Budget ändrad",finalCosts:"Slutkostnader per år och kategori",targets:"Budgetmål",lines:"Budgetposter",lockedBy:"Budget låst av",lockedAt:"Budget låst",name:"Namn",title:"Rubrik",status:"Status",priority:"Prioritet",responsiblePersonId:"Ansvarig",contractId:"Avtal",propertyId:"Fastighet",unitId:"Verksamhetsområde",createdDate:"Upplagt",createdAt:"Tillagd",updatedAt:"Senast ändrad",year:"År",budgetYear:"Budgetår",cost:"Kostnad",estimatedCost:"Bedömd kostnad",finalCost:"Slutkostnad",includeInBudget:"Till budget",budgetIncluded:"Ingår i budget",budgetCategory:"Budgetkategori",start:"Start",end:"Slut",decisionDate:"Beslutat",completedDate:"Klart",targetDate:"Tidplan",description:"Beskrivning",phase:"Skede",annualRent:"Årshyra",annualAdditions:"Årligt tillägg",annualContractDrift:"Media per år",annualPropertyTax:"F-skatt per år",baseRent:"Grundhyra",baseAdditions:"Grundtillägg",rentBaseYear:"Hyra basår",rentBaseIndex:"Hyra bastal",rentIndexPercent:"Hyra indexandel",additionBaseYear:"Tillägg basår",additionBaseIndex:"Tillägg bastal",additionIndexPercent:"Tillägg indexandel",noticePeriodMonths:"Uppsägningstid månader",renewalPeriodMonths:"Förlängningstid månader",actual:"Utfall",budget:"Budget",period:"Period",category:"Kategori",customer:"Kund",number:"Avtalsnummer",area:"Area"};
function auditCollectionForType(type){const m={contract:"contracts",object:"contracts",person:"people",assignment:"assignments",project:"projects",maintenance:"maintenance",operation:"operations",investigation:"investigations",maintenanceStatus:"maintenanceStatus",driftIssue:"driftIssues",wish:"wishes"};return m[type]||type;}
function auditTypeLabel(collection){const h=AUDIT_COLLECTIONS.find(x=>x[0]===collection);return h?h[1]:collection;}
function auditComparable(record){const c=clone(record||{});delete c.createdAt;delete c.createdBy;delete c.updatedAt;delete c.updatedBy;delete c.versions;return c;}
function auditDiff(a,b){const keys=new Set(Object.keys(a||{}).concat(Object.keys(b||{})));return Array.from(keys).filter(k=>JSON.stringify((a||{})[k])!==JSON.stringify((b||{})[k])).map(k=>({field:k,label:AUDIT_FIELD_LABELS[k]||k,from:a[k]==null?"":a[k],to:b[k]==null?"":b[k]}));}
function ensureAuditMetadata(data){data.auditLog=Array.isArray(data.auditLog)?data.auditLog:[];return data;}
function auditRecordKey(col,r){return String(col==="budgetPlans"?r.year:r.id||"");}
function recordAuditChanges(){if(!auditBaseline){auditBaseline=clone(state);return;}ensureAuditMetadata(state);const now=new Date().toISOString(),actor=currentActorLabel();state.auditLog=Array.isArray(state.auditLog)?state.auditLog:[];AUDIT_COLLECTIONS.forEach(function(p){const col=p[0],before=Array.isArray(auditBaseline[col])?auditBaseline[col]:[],after=Array.isArray(state[col])?state[col]:[],bm=new Map(before.map(r=>[auditRecordKey(col,r),r])),am=new Map(after.map(r=>[auditRecordKey(col,r),r]));after.forEach(function(r){const id=auditRecordKey(col,r),old=bm.get(id);if(!old){if(!r.createdAt)r.createdAt=now;if(!r.createdBy)r.createdBy=actor;state.auditLog.push({id:nextId("H",state.auditLog),at:now,by:actor,action:"Skapad",collection:col,type:p[1],recordId:id,fields:auditDiff({},auditComparable(r))});return;}const fields=auditDiff(auditComparable(old),auditComparable(r));if(!fields.length)return;r.updatedAt=now;r.updatedBy=actor;state.auditLog.push({id:nextId("H",state.auditLog),at:now,by:actor,action:"Ändrad",collection:col,type:p[1],recordId:id,fields});});before.forEach(function(r){const id=auditRecordKey(col,r);if(!am.has(id))state.auditLog.push({id:nextId("H",state.auditLog),at:now,by:actor,action:"Raderad",collection:col,type:p[1],recordId:id,fields:auditDiff(auditComparable(r),{})});});});}
function resetAuditBaseline(){ensureAuditMetadata(state);auditBaseline=clone(state);}
function isAdminAvailable(){if(state&&state.isDemo)return true;const u=state&&state.currentUser?state.currentUser:{},r=String(u.role||u.permission||"");return Boolean(u.isAdmin||u.canAdmin||(u.permissions&&u.permissions.admin)||/admin|administratör/i.test(r));}
function isEditAvailable(){
  if(state&&state.isDemo)return true;
  if(window.LokalblickSourceService){
    try{
      const source=window.LokalblickSourceService.status();
      if(source&&source.connected&&source.sourceKind!=="migration")return true;
    }catch(_){}
  }
  const u=state&&state.currentUser?state.currentUser:{},r=String(u.role||u.permission||"");
  return Boolean(u.canEdit||(u.permissions&&u.permissions.edit)||/admin|administratör|arbeta|edit/i.test(r));
}
function canEdit(){return accessMode==="edit"||accessMode==="admin";} function canAdmin(){return accessMode==="admin"&&isAdminAvailable();}
function accessModeBarHtml(){const e=isEditAvailable(),a=isAdminAvailable();return '<div class="access-mode-bar" aria-label="Arbetsläge"><div class="access-mode-copy"><span>ARBETSLÄGE</span><strong>'+(accessMode==="admin"?"Administration":accessMode==="edit"?"Redigera data":"Läs")+'</strong><small>'+(accessMode==="admin"?"Behörigheter, datakällor och systeminställningar":accessMode==="edit"?"Ändringar sparas och dokumenteras i historiken":"Säkert läsläge – inget kan ändras")+'</small></div><div class="access-mode-actions"><button type="button" class="access-mode-button '+(accessMode==="read"?"active":"")+'" data-access-mode="read">Läs</button>'+(e?'<button type="button" class="access-mode-button '+(accessMode==="edit"?"active":"")+'" data-access-mode="edit">Redigera</button>':"")+(a?'<button type="button" class="access-mode-button admin '+(accessMode==="admin"?"active":"")+'" data-access-mode="admin">Admin</button>':"")+'<button type="button" class="access-history-button" data-open-history>Historik</button></div></div>';}
function setAccessMode(m){if(m==="admin"&&!isAdminAvailable())m="read";if(m==="edit"&&!isEditAvailable())m="read";accessMode=m;if(m!=="admin"&&["organisation","api","about"].includes(currentView))currentView="properties";}
function applyAccessModeToUi(){const e='[data-add],[data-edit-type],[data-plan-responsible],[data-plan-year],[data-plan-quarter],[data-plan-date],[data-plan-wish-move],[data-annual-slot],[data-annual-clear],[data-budget-adjustment],[data-budget-preliminary-index],[data-budget-toggle],[id="budget-create"],[id="mobile-budget-create"],[id="budget-lock"],[id="mobile-budget-lock"]';document.querySelectorAll(e).forEach(x=>{const ok=canEdit();x.disabled=!ok;x.classList.toggle("access-disabled",!ok);});const a='[data-api-connect],[data-api-create],[data-api-mode],[data-api-write],[data-api-disconnect],[data-api-reconnect],[data-api-refresh]';document.querySelectorAll(a).forEach(x=>{const ok=canAdmin();x.disabled=!ok;x.classList.toggle("access-disabled",!ok);});}
function bindAccessModeControls(){document.querySelectorAll("[data-access-mode]:not([data-access-bound])").forEach(b=>{b.dataset.accessBound="1";b.addEventListener("click",()=>{setAccessMode(b.dataset.accessMode||"read");render();});});document.querySelectorAll("[data-open-history]:not([data-access-bound])").forEach(b=>{b.dataset.accessBound="1";b.addEventListener("click",()=>showHistory("",""));});applyAccessModeToUi();}
function formatAuditValue(v){if(v==null||v==="")return "–";if(typeof v==="object"){try{return JSON.stringify(v);}catch(_){return "–";}}return String(v);}
function showHistory(type,id){const col=type?auditCollectionForType(type):"",all=(state.auditLog||[]).slice().reverse(),rows=col&&id?all.filter(h=>h.collection===col&&String(h.recordId)===String(id)):all.slice(0,120);let d=document.getElementById("history-dialog");if(!d){d=document.createElement("dialog");d.id="history-dialog";d.className="history-dialog";document.body.appendChild(d);}const title=col&&id?auditTypeLabel(col)+" · "+id:"Ändringshistorik";d.innerHTML='<form method="dialog"><div class="history-head"><div><span>HISTORIK</span><h2>'+esc(title)+'</h2><p>'+(col&&id?"Alla registrerade ändringar för posten.":"Senaste ändringar i Lokalblick.")+'</p></div><button class="icon-button" value="cancel" aria-label="Stäng">×</button></div><div class="history-list">'+(rows.length?rows.map(h=>'<article class="history-entry"><div class="history-entry-top"><strong>'+esc(h.action)+'</strong><span>'+esc(new Date(h.at).toLocaleString("sv-SE"))+'</span></div><div class="history-entry-meta">'+esc(h.by||"Okänd")+' · '+esc(h.type||h.collection)+' · '+esc(h.recordId||"")+'</div>'+((h.fields||[]).length?'<ul>'+h.fields.map(f=>'<li><strong>'+esc(f.label||f.field)+'</strong><span>'+esc(formatAuditValue(f.from))+' → '+esc(formatAuditValue(f.to))+'</span></li>').join("")+'</ul>':"")+'</article>').join(""):'<div class="empty">Ingen historik registrerad ännu.</div>')+'</div><div class="dialog-actions"><button class="button secondary" value="cancel">Stäng</button></div></form>';d.showModal();}
function ensureShape(data) {
  const base = clone(demo);
  const source = data || {};
  function list(name) {
    return Array.isArray(source[name]) ? source[name] : (source.isDemo === false ? [] : clone(base[name] || []));
  }
  return Object.assign(base, source, {
    properties: list("properties"),
    contracts: list("contracts"),
    organizations: list("organizations"),
    people: list("people"),
    assignments: list("assignments"),
    activities: list("activities"),
    projects: list("projects"),
    maintenance: list("maintenance"),
    operations: list("operations"),
    investigations: list("investigations"),
    maintenanceStatus: list("maintenanceStatus"),
    driftIssues: list("driftIssues"),
    wishes: list("wishes"),
    budgetPlans: list("budgetPlans"),
    assignmentChanges: list("assignmentChanges"),
    auditLog: list("auditLog")
  });
}
async function enrichConnectedData(data) {
  if (!data || data.isDemo || !window.LokalblickGeocodingService) return data;
  try {
    return await window.LokalblickGeocodingService.enrichData(data);
  } catch (_) {
    return data;
  }
}
async function loadState() {
  state = ensureShape(await enrichConnectedData(await window.LokalblickDataService.load()));
  resetAuditBaseline();
  return state;
}
function requireActorIdentity() {
  if(!state.isDemo && !(state.currentUser && (state.currentUser.name || state.currentUser.email))) {
    const name=prompt("Ange ditt namn för ändringshistoriken (själv angivet namn):");
    if(!name || !name.trim()) throw new Error("Namn krävs för att spara ändringar.");
    state.currentUser=Object.assign({},state.currentUser,{name:name.trim(),identitySource:"self-declared"});
  }
}
async function saveState() {
  try { requireActorIdentity(); } catch(error) { if(auditBaseline)state=clone(auditBaseline);throw error; }
  ensureAuditMetadata(state);
  recordAuditChanges();
  state = ensureShape(await window.LokalblickDataService.save(state));
  resetAuditBaseline();
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
async function openContractDocument(raw) {
  raw=String(raw||"").trim();
  if(!raw) return;
  if(/^embedded:\/\//i.test(raw)){
    const key=raw.replace(/^embedded:\/\//i,"");
    const cached=window.LokalblickContractDocumentCache&&window.LokalblickContractDocumentCache[key];
    if(cached){
      window.open(cached,"_blank","noopener");
      return;
    }
    alert("PDF-filen är inbäddad i käll-Excel. Läs in avtalsfilen via Berika avtal från Excel igen för att öppna dokumentet.");
    return;
  }
  const isWeb=/^https?:\/\//i.test(raw);
  let target=raw;
  if(/^\\\\/.test(target)) target="file://"+target.replace(/^\\\\/,"").replace(/\\/g,"/");
  try{
    const opened=window.open(target,"_blank","noopener");
    if(opened || isWeb) return;
  }catch(_){}
  try{
    await navigator.clipboard.writeText(raw);
    alert("Dokumentsökvägen kunde inte öppnas direkt i webbläsaren och har kopierats till Urklipp.");
  }catch(_){
    alert("Dokumentet finns kopplat till avtalet men webbläsaren blockerar den interna sökvägen.");
  }
}
window.LokalblickOpenContractDocument=openContractDocument;
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
  if (type === "maintenance") {
    const x = state.maintenance.find(function(r) { return r.id === id; });
    return x ? x.title : id;
  }
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
function indexSeriesValue(year) { return Number(window.LokalblickCalculations.october(state.indexSeries,year)?.value)||0; }
function calculateIndexedAmount(baseAmount,baseIndex,indexShare,currentIndex) { return window.LokalblickCalculations.indexedAmount(baseAmount,baseIndex,indexShare,currentIndex); }
function contractIndexedComponent(c,kind,targetYear,preliminaryIndex) { return window.LokalblickCalculations.component(c,kind,targetYear,preliminaryIndex,state.indexSeries); }
function contractAnnualValues(c,targetYear,preliminaryIndex) { return window.LokalblickCalculations.annualValues(c,targetYear,preliminaryIndex,state.indexSeries); }
function totalContractCost(c) { return contractAnnualValues(c,new Date().getFullYear(),0).total; }
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
function contractYearFactor(c,year) { return window.LokalblickCalculations.yearFactor(c,year); }
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
      if (currentView === "properties") filterPropertyPortfolio(); else render();
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
function budgetIncluded(item){if(!item)return true;if(item.budgetIncluded===false)return false;if(item.includeInBudget==="Nej")return false;return true;}
function budgetRows(year,contracts) { return window.LokalblickCalculations.budgetRows(state,year,contracts); }
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
  const groups = [
    {
      label:"",
      items:[
        { id:"overview", label:"Översikt", icon:"⌂" },
        { id:"plan", label:"Planera", icon:"◫" },
        { id:"map", label:"Karta", icon:"⌖" },
        { id:"budget", label:"Budget", icon:"¤" }
      ]
    },
    {
      label:"ADMINISTRATION",
      items:[
        { id:"organisation", label:"Organisation", icon:"◎" },
        { id:"api", label:"Datakällor", icon:"⌁" },
        { id:"about", label:"Om", icon:"ⓘ" }
      ]
    }
  ];
  const active = currentView==="properties" && portfolioExplorer.section==="activities"
    ? "plan"
    : currentView==="properties" ? "overview" : currentView;
  document.getElementById("main-nav").innerHTML = groups.map(function(group) {
    if (group.label === "ADMINISTRATION" && !canAdmin()) return "";
    const label = group.label ? '<div class="nav-section-label">' + esc(group.label) + '</div>' : "";
    return label + group.items.map(function(v) {
      return '<button class="nav-button ' + (v.id === active ? "active" : "") + '" data-desktop-nav="' + v.id + '">' +
        '<span class="nav-icon">' + v.icon + "</span><span>" + v.label + "</span></button>";
    }).join("");
  }).join("");
  document.querySelectorAll("[data-desktop-nav]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      const target=btn.dataset.desktopNav;
      if(target==="overview" || target==="plan") {
        currentView="properties";
        portfolioExplorer.section=target==="plan" ? "activities" : "overview";
      } else {
        currentView=target;
      }
      render();
    });
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
      title.textContent = active==="overview" ? portfolioScopeTitle() :
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
      portfolioExplorer.section = target === "plan" ? "activities" : "overview";
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

  const headerEdit = document.getElementById("header-edit");
  if (headerEdit) {
    const editAvailable = isEditAvailable();
    headerEdit.hidden = !editAvailable;
    headerEdit.textContent = canEdit() ? "Klar" : "Redigera";
    headerEdit.classList.toggle("active", canEdit());
    headerEdit.setAttribute("aria-pressed", canEdit() ? "true" : "false");
    if (!headerEdit.dataset.bound) {
      headerEdit.dataset.bound = "1";
      headerEdit.addEventListener("click", function() {
        if (canEdit()) setAccessMode("read");
        else setAccessMode(isAdminAvailable() ? "admin" : "edit");
        render();
      });
    }
  }

  const meta = views.find(function(v) { return v.id === currentView; });
  const isPlanningView = currentView==="properties" && portfolioExplorer.section==="activities";
  const isPortfolioView = currentView==="properties" && !isPlanningView;
  document.getElementById("page-title").textContent = isPlanningView ? "Planera" : (isPortfolioView ? portfolioScopeTitle() : meta.label);
  document.getElementById("page-eyebrow").textContent = isPlanningView ? "ANSVAR · PLANERING · ÅTGÄRD" : (isPortfolioView ? "AKTUELLT URVAL" : meta.eyebrow);
  const banner = document.getElementById("mode-banner");
  banner.className = "mode-banner " + (state.isDemo ? "demo" : "live");
  const sourceInfo = window.LokalblickSourceService ? window.LokalblickSourceService.status() : null;
  const pendingCount = sourceInfo && sourceInfo.pendingChanges ? sourceInfo.pendingChanges.length : 0;
  const migrationSource = sourceInfo && sourceInfo.sourceKind === "migration";
  banner.innerHTML = state.isDemo
    ? "<strong>Demo</strong><span>Endast syntetisk data. Företagsdata ansluts säkert via Datakällor i en autentiserad miljö.</span>"
    : migrationSource
      ? "<strong>Migreringskälla</strong><span>" + esc(state.sourceName || "Befintlig Excel") + " · " + state.properties.length + " fastigheter · " + state.contracts.length + " avtal. Originalfilen skrivs inte om.</span>" +
        '<div class="source-save-cluster"><button type="button" class="source-review-link" data-goto="api">Granska migrering</button><button type="button" class="source-save-button" data-goto="api">Skapa Lokalblick-fil →</button></div>'
      : "<strong>Datakälla aktiv</strong><span>" + esc(state.sourceName || "Importerad fil") + " · " + state.properties.length + " fastigheter · " + state.contracts.length + " objekt/avtal.</span>" +
        (pendingCount
          ? '<div class="source-save-cluster"><button type="button" class="source-review-link" data-goto="api">' + pendingCount + ' ändring' + (pendingCount===1?'':'ar') + '</button><button type="button" class="source-save-button" data-source-save>' + (sourceInfo && sourceInfo.writeRecoveryNeeded ? '↻ Välj fil och spara' : '💾 Spara till Excel') + '</button></div>'
          : '<span class="source-synced">✓ Sparat till Excel</span>');
  let html = "";
  if (currentView === "properties") html = renderProperties();
  else if (currentView === "map") html = renderMap();
  else if (currentView === "budget") html = renderBudget();
  else if (currentView === "organisation") html = renderOrganisation();
  else if (currentView === "api") html = renderApi();
  else html = renderAbout();
  document.getElementById("content").innerHTML = accessModeBarHtml() + html;
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
      status:x.status, when:x.end || x.start || "", addedAt:x.createdAt||"", updatedAt:x.updatedAt||"", cost:Number(x.preliminaryCost)||projectBudgetTotal(x),
      responsible:responsibleFromAssignments("project", x.id),
      detail:[["Skede",x.phase||"–"],["Planering",maintenanceTimingLabel(x)],["Start",x.start||"–"],["Slut",x.end||"–"],["Inflyttning",x.moveIn||"–"],
        ["Beskrivning",x.description||""],["Budget utredning",money(x.budgetInvestigation)],["Budget genomförande",money(x.budgetExecution)],
        ["Budget inredning",money(x.budgetFurnishing)]] });
  });
  state.maintenance.filter(inScope).forEach(function(x) {
    items.push({ group:"maintenance", type:"Underhåll", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status || x.priority, when:x.year ? String(x.year) : "", addedAt:x.createdAt||"", updatedAt:x.updatedAt||"", cost:Number(x.cost)||0, responsible:"",
      detail:[["Planår",x.year||"–"],["Planering",maintenanceTimingLabel(x)],["Prioritet",x.priority||"–"],["Status",x.status||"–"],["Kostnad",money(x.cost)]] });
  });
  state.maintenanceStatus.filter(inScope).forEach(function(x) {
    items.push({ group:"maintenance", type:"Underhållsstatus", id:x.id, title:x.category + (x.actionNeed ? " · " + x.actionNeed : ""),
      propertyId:x.propertyId, contractId:x.contractId, status:x.status, when:x.assessedDate || "", addedAt:x.createdAt||"", updatedAt:x.updatedAt||"", cost:Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId),
      detail:[["Bedömd",x.assessedDate||"–"],["Planering",maintenanceTimingLabel(x)],["Prioritet",x.priority||"–"],["Åtgärdsbehov",x.actionNeed||""],
        ["Kommentar",x.comment||""],["Budgetår",x.budgetYear||"–"],["Till årsbudget",x.includeInBudget||"–"]] });
  });
  state.driftIssues.filter(inScope).forEach(function(x) {
    items.push({ group:"drift", type:"Driftärende", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.targetDate || x.createdDate || "", addedAt:x.createdAt||x.createdDate||"", updatedAt:x.updatedAt||"", cost:Number(x.finalCost)||Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId),
      detail:[["Kategori",x.category||"–"],["Planering",maintenanceTimingLabel(x)],["Prioritet",x.priority||"–"],["Upplagt",x.createdDate||"–"],["Tidplan",x.targetDate||"–"],
        ["Beskrivning",x.description||""],["Bedömd kostnad",money(x.estimatedCost)],["Slutkostnad",money(x.finalCost)]] });
  });
  state.wishes.filter(inScope).forEach(function(x) {
    items.push({ group:"wish", type:"Önskemål", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.targetDate || x.createdDate || "", addedAt:x.createdAt||x.createdDate||"", updatedAt:x.updatedAt||"", cost:Number(x.finalCost)||Number(x.estimatedCost)||0,
      responsible:personName(x.responsiblePersonId),
      detail:[["Kategori",x.category||"–"],["Upplagt",x.createdDate||"–"],["Tidplan",x.targetDate||"–"],["Beslutat",x.decisionDate||"–"],
        ["Klart",x.completedDate||"–"],["Beskrivning",x.description||""],["Budgetkategori",x.budgetCategory||"–"],
        ["Bedömd kostnad",money(x.estimatedCost)],["Slutkostnad",money(x.finalCost)]] });
  });
  state.investigations.filter(inScope).forEach(function(x) {
    items.push({ group:"investigation", type:"Utredning", id:x.id, title:x.title, propertyId:x.propertyId, contractId:x.contractId,
      status:x.status, when:x.year ? String(x.year) : "", addedAt:x.createdAt||"", updatedAt:x.updatedAt||"", cost:Number(x.cost)||0, responsible:"",
      detail:[["År",x.year||"–"],["Status",x.status||"–"],["Kostnad",money(x.cost)]] });
  });
  state.operations.filter(inScope).forEach(function(x) {
    items.push({ group:"operations", type:"Driftkostnad", id:x.id, title:x.category, propertyId:x.propertyId, contractId:x.contractId,
      status:"Budget / utfall", when:x.period ? String(x.period) : "", addedAt:x.createdAt||"", updatedAt:x.updatedAt||"", cost:Number(x.actual)||Number(x.budget)||0, responsible:"",
      detail:[["År",x.period||"–"],["Kostnadsslag",x.category||"–"],["Budget",money(x.budget)],["Utfall",money(x.actual)]] });
  });
  return items.sort(function(a, b) {
    return String(a.when || "9999").localeCompare(String(b.when || "9999")) || a.type.localeCompare(b.type, "sv");
  });
}
function portfolioContentTabsHtml(contracts) {
  const items = portfolioActivityItems(contracts);
  const counts = {
    contracts: contracts.length,
    project: items.filter(function(x){return x.group==="project";}).length,
    maintenance: items.filter(function(x){return x.group==="maintenance";}).length,
    drift: items.filter(function(x){return x.group==="drift" || x.group==="operations";}).length,
    wish: items.filter(function(x){return x.group==="wish";}).length
  };
  const modes = [
    ["overview","Översikt"],
    ["contracts","Avtal"],
    ["project","Projekt"],
    ["maintenance","Underhåll"],
    ["drift","Drift"],
    ["wish","Övrigt"]
  ];
  return '<div class="view-choice-bar quick-table-filters" role="group" aria-label="Snabbfilter för tabeller">' +
    modes.map(function(mode) {
      const active = portfolioExplorer.section === mode[0];
      const count = counts[mode[0]];
      return '<button class="view-choice quick-table-filter ' + (active ? "active" : "") + '" type="button" data-portfolio-section="' + mode[0] +
        '" aria-pressed="' + (active ? "true" : "false") + '">' +
        '<span>' + esc(mode[1]) + '</span>' +
        (count == null ? "" : '<strong>' + count + '</strong>') +
      '</button>';
    }).join("") +
  '</div>';
}

function scopeFilteredSectionsHtml(contracts, section) {
  if (section === "contracts") return '<div class="scope-all-sections">' + scopeContractsSectionHtml(contracts) + '</div>';
  if (section === "project") return '<div class="scope-all-sections">' + scopeActivitySectionHtml(contracts,"project","Projekt","project") + '</div>';
  if (section === "maintenance") return '<div class="scope-all-sections">' + scopeActivitySectionHtml(contracts,"maintenance","Underhåll","maintenance") + '</div>';
  if (section === "drift") return '<div class="scope-all-sections">' + scopeActivitySectionHtml(contracts,"drift","Drift","driftIssue") + '</div>';
  if (section === "wish") return '<div class="scope-all-sections">' + scopeActivitySectionHtml(contracts,"wish","Övrigt","wish") + '</div>';
  return "";
}

function portfolioTableViewHtml(contracts) {
  const section = portfolioExplorer.section || "overview";
  if (section === "overview") {
    return portfolioExplorer.propertyId ? propertyWorkspaceHtml(contracts) : portfolioOverviewHtml(contracts);
  }
  if (["contracts","project","maintenance","drift","wish"].includes(section)) {
    return scopeFilteredSectionsHtml(propertyContractsForContext(contracts), section);
  }
  return portfolioExplorer.propertyId ? propertyWorkspaceHtml(contracts) : portfolioOverviewHtml(contracts);
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
  const scopeTitle = portfolioScopeTitle();
  const title=document.getElementById("portfolio-scope-title");
  const meta=document.getElementById("portfolio-scope-meta");
  if(title) title.textContent=scopeTitle;
  if(meta) {
    const properties=new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean)).size;
    const area=contracts.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    meta.textContent=properties+" fastigheter · "+contracts.length+" avtal · "+num(area)+" kvm";
  }
  if(currentView==="properties" && portfolioExplorer.section!=="activities") {
    const pageTitle=document.getElementById("page-title");
    const pageEyebrow=document.getElementById("page-eyebrow");
    if(pageTitle) pageTitle.textContent=scopeTitle;
    if(pageEyebrow) pageEyebrow.textContent="AKTUELLT URVAL";
  }
  const mobileLabel=document.getElementById("mobile-scope-label");
  if(mobileLabel) mobileLabel.textContent=scopeTitle;
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

  function propertyFor(id) {
    return state.properties.find(function(p){return p.id===id;});
  }
  function propertyLabel(id) {
    const p=propertyFor(id);
    return p ? (p.address||p.designation||p.id) : (id||"Fastighetsnivå");
  }
  function propertyMeta(id) {
    const p=propertyFor(id);
    return p ? (p.designation||p.type||"Fastighet") : "";
  }
  function total(rows) {
    return rows.reduce(function(sum,row){return sum+(Number(row.amount)||Number(row.cost)||0);},0);
  }
  function groupedActivityBody(rows) {
    const byProperty=new Map();
    rows.forEach(function(row){
      const key=row.propertyId||"NO_PROPERTY";
      if(!byProperty.has(key)) byProperty.set(key,[]);
      byProperty.get(key).push(row);
    });
    if(!byProperty.size) return '<div class="mobile-inline-empty">Inga poster i urvalet</div>';
    return Array.from(byProperty.entries()).map(function(entry){
      const propertyId=entry[0], propertyRows=entry[1];
      const amount=total(propertyRows);
      return '<details class="mobile-inline-property">' +
        '<summary><span><strong>' + esc(propertyLabel(propertyId)) + '</strong><small>' +
          propertyRows.length + (propertyRows.length===1?' post':' poster') + (propertyMeta(propertyId)?' · '+esc(propertyMeta(propertyId)):'') +
        '</small></span><b>' + money(amount) + '</b><i>⌄</i></summary>' +
        '<div class="mobile-inline-property-body">' +
          propertyRows.map(function(item){
            const editType=activityEditorType(item);
            return '<div class="mobile-inline-post"><span><strong>' + esc(item.title||item.type||"Post") + '</strong><small>' +
              esc(item.status||item.when||item.type||"") + '</small></span><b>' + money(item.cost) + '</b>' +
              (editType?'<button type="button" data-edit-type="' + editType + '" data-edit-id="' + esc(item.id) + '" aria-label="Redigera">⋮</button>':'') +
            '</div>';
          }).join("") +
          (propertyId!=="NO_PROPERTY" ? '<button type="button" class="mobile-inline-open" data-explorer-property="' + esc(propertyId) + '">Öppna fastigheten <b>→</b></button>' : '') +
        '</div></details>';
    }).join("");
  }
  function rentBody() {
    const grouped=new Map();
    contracts.forEach(function(c){
      const key=c.propertyId||"NO_PROPERTY";
      const row=grouped.get(key)||{amount:0,count:0,area:0};
      row.amount += Number(c.annualRent)||0;
      row.count += 1;
      row.area += Number(c.area)||0;
      grouped.set(key,row);
    });
    return Array.from(grouped.entries()).map(function(entry){
      const propertyId=entry[0], row=entry[1];
      return '<details class="mobile-inline-property">' +
        '<summary><span><strong>' + esc(propertyLabel(propertyId)) + '</strong><small>' +
          row.count + (row.count===1?' avtal':' avtal') + ' · ' + num(row.area) + ' kvm</small></span><b>' + money(row.amount) + '</b><i>⌄</i></summary>' +
        '<div class="mobile-inline-property-body">' +
          contracts.filter(function(c){return (c.propertyId||"NO_PROPERTY")===propertyId;}).map(function(c){
            return '<div class="mobile-inline-post"><span><strong>' + esc(c.number||c.id) + '</strong><small>' + esc(contractCustomer(c)) +
              '</small></span><b>' + money(c.annualRent) + '</b></div>';
          }).join("") +
          (propertyId!=="NO_PROPERTY" ? '<button type="button" class="mobile-inline-open" data-explorer-property="' + esc(propertyId) + '">Öppna fastigheten <b>→</b></button>' : '') +
        '</div></details>';
    }).join("") || '<div class="mobile-inline-empty">Inga avtal i urvalet</div>';
  }
  function section(title, rows, body, extraClass) {
    const amount=title==="Hyra"
      ? contracts.reduce(function(sum,c){return sum+(Number(c.annualRent)||0);},0)
      : total(rows);
    const count=title==="Hyra" ? contracts.length : rows.length;
    return '<details class="mobile-compact-section inline-hierarchy ' + (extraClass||"") + '">' +
      '<summary><span class="mobile-compact-section-title">' + esc(title) + '</span>' +
        '<span class="mobile-compact-section-total"><strong>' + money(amount) + '</strong><small>' +
          count + (count===1?' post':' poster') + '</small></span><b>⌄</b></summary>' +
      '<div class="mobile-compact-section-body">' + body + '</div></details>';
  }

  const projects=items.filter(function(x){return x.group==="project";});
  const maintenance=items.filter(function(x){return x.group==="maintenance";});
  const drift=items.filter(function(x){return x.group==="drift" || x.group==="operations";});
  const wishes=items.filter(function(x){return x.group==="wish";});

  if (portfolioExplorer.section === "activities") return "";

  return '<div class="mobile-compact-accordion inline-overview" aria-label="Ekonomi och aktiviteter i urvalet">' +
    section("Hyra",[],rentBody(),"rent") +
    section("Projekt",projects,groupedActivityBody(projects),"project") +
    section("Underhåll",maintenance,groupedActivityBody(maintenance),"maintenance") +
    section("Drift",drift,groupedActivityBody(drift),"drift") +
    section("Önskemål",wishes,groupedActivityBody(wishes),"wish") +
  '</div>';
}
function mobileFilterChoiceLabel(filterId, value) {
  if (!value) return "";
  if (filterId === "filter-our-person" && value === "__unassigned") return "Ej fördelat";
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
  const rows=[{value:"",label:allLabel}]
    .concat(filterId==="filter-our-person" ? [{value:"__unassigned",label:"Ej fördelat"}] : [])
    .concat(options||[]);
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

  const rows = Array.from(grouped.entries()).map(function(entry) {
    const propertyId=entry[0], cs=entry[1];
    const property=state.properties.find(function(p){return p.id===propertyId;});
    const address=property ? (property.address||property.designation||property.id) : propertyId;
    const designation=property && property.designation ? property.designation : "";
    const owner=property && property.owner ? property.owner : "–";
    const manager=property && property.manager ? property.manager : "–";
    const area=cs.reduce(function(sum,c){return sum+(Number(c.area)||0);},0);
    const cost=cs.reduce(function(sum,c){return sum+totalContractCost(c);},0);
    const activities=portfolioActivityItems(cs);
    const maintenance=activities.filter(function(x){return x.group==="maintenance";}).length;
    const projects=activities.filter(function(x){return x.group==="project";}).length;
    const issues=activities.filter(function(x){return x.group==="drift" || x.group==="operations";}).length;
    const wishes=activities.filter(function(x){return x.group==="wish";}).length;

    return '<details class="property-compact-row">' +
      '<summary>' +
        '<span class="property-compact-title"><strong>' + esc(address) + '</strong>' +
          '<small>' + esc(designation || (cs.length + (cs.length===1?" avtal":" avtal"))) + '</small></span>' +
        '<span class="property-compact-kpis"><b>' + cs.length + '</b><small>avtal</small><b>' + num(area) + '</b><small>kvm</small></span>' +
        '<span class="property-compact-cost"><strong>' + money(cost) + '</strong><small>/år</small></span>' +
        '<span class="property-compact-chevron">⌄</span>' +
      '</summary>' +
      '<div class="property-compact-body">' +
        '<div class="property-info-grid">' +
          '<div><span>Fastighetsbeteckning</span><strong>' + esc(designation || "–") + '</strong></div>' +
          '<div><span>Fastighetsägare</span><strong>' + esc(owner) + '</strong></div>' +
          '<div><span>Förvaltare</span><strong>' + esc(manager) + '</strong></div>' +
          '<div><span>Årskostnad</span><strong>' + money(cost) + '</strong></div>' +
        '</div>' +
        '<div class="property-activity-strip">' +
          '<span><strong>' + maintenance + '</strong><small>UH</small></span>' +
          '<span><strong>' + projects + '</strong><small>Projekt</small></span>' +
          '<span><strong>' + issues + '</strong><small>Drift</small></span>' +
          '<span><strong>' + wishes + '</strong><small>Önskemål</small></span>' +
        '</div>' +
        '<button type="button" class="property-open-button" data-explorer-property="' + esc(propertyId) + '">Öppna fastigheten <b>→</b></button>' +
      '</div>' +
    '</details>';
  }).join("");

  return '<section class="property-compact-list"><div class="property-list-head"><div><span>FASTIGHETER</span><h3>Fastigheter i urvalet</h3></div><strong>' + grouped.size + '</strong></div>' +
    (rows || '<div class="empty">Inga fastigheter i urvalet.</div>') + '</section>';
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
      '</strong><small>Hyra + media</small></div>' +
  '</section>';
}

function mobileOverviewHtml(contracts) {
  const items=portfolioActivityItems(contracts);
  const openItems=items.filter(function(item){return !/klar|klart|avslaget|utfört/i.test(String(item.status||""));});
  const plannedCost=openItems.reduce(function(sum,x){return sum+(Number(x.cost)||0);},0);
  return '<section class="mobile-overview-action">' +
    '<button type="button" class="mobile-active-action" data-portfolio-section="activities">' +
      '<span><small>PLANERA & AGERA</small><strong>' + openItems.length + ' aktiva poster</strong><em>' + money(plannedCost) + ' planerat</em></span>' +
      '<b>→</b>' +
    '</button>' +
  '</section>';
}
function internalPeopleForPlanning() {
  return state.people.filter(function(p) {
    const org=state.organizations.find(function(o){return o.id===p.organizationId;});
    return org && org.type==="our";
  }).sort(function(a,b){return String(a.name).localeCompare(String(b.name),"sv");});
}
function activeResponsibleId(targetType,targetId,fallbackId) {
  const active=state.assignments.find(function(a){
    return a.targetType===targetType && a.targetId===targetId && !a.toDate && a.role==="Ansvarig";
  }) || state.assignments.find(function(a){
    return a.targetType===targetType && a.targetId===targetId && !a.toDate;
  });
  return active ? active.personId : (fallbackId||"");
}
function planningPropertyAddress(propertyId) {
  const p=state.properties.find(function(x){return x.id===propertyId;});
  return p ? (p.address||p.designation||p.id) : (propertyId||"Fastighetsnivå");
}
function planningAssigneeSelect(targetType,targetId,selectedId,compact) {
  const people=internalPeopleForPlanning();
  return '<select class="' + (compact?"plan-assignee compact":"plan-assignee") + '" data-plan-responsible="' + esc(targetType) +
    '" data-plan-id="' + esc(targetId) + '">' +
    '<option value="">Ej fördelat</option>' +
    people.map(function(p){return '<option value="' + esc(p.id) + '"' + (p.id===selectedId?' selected':'') + '>' + esc(p.name) + '</option>';}).join("") +
  '</select>';
}
function mobilePlanningBoardHtml(contracts) {
  const contractIds=new Set(contracts.map(function(c){return c.id;}));
  const propertyIds=new Set(contracts.map(function(c){return c.propertyId;}).filter(Boolean));
  function inScope(item) {
    return (item.contractId && contractIds.has(item.contractId)) || (!item.contractId && item.propertyId && propertyIds.has(item.propertyId));
  }
  const rows=[];

  propertyIds.forEach(function(propertyId){
    const p=state.properties.find(function(x){return x.id===propertyId;});
    if(!p) return;
    rows.push({
      kind:"property", group:"property", id:p.id, propertyId:p.id,
      title:p.address||p.designation||p.id, subtitle:p.designation||"Fastighet",
      responsibleId:activeResponsibleId("property",p.id,"")
    });
  });
  state.projects.filter(function(x){return inScope(x) && x.status!=="Klar";}).forEach(function(x){
    rows.push({
      kind:"project", group:"project", id:x.id, propertyId:x.propertyId, source:x,
      title:x.name||"Projekt", subtitle:x.phase||x.status||"Projekt",
      responsibleId:activeResponsibleId("project",x.id,"")
    });
  });
  state.maintenance.filter(function(x){return inScope(x) && x.status!=="Klar";}).forEach(function(x){
    rows.push({
      kind:"maintenance", group:"maintenance", id:x.id, propertyId:x.propertyId, source:x,
      title:x.title||"Underhåll", subtitle:(x.year?String(x.year)+" · ":"")+(x.priority||x.status||""),
      responsibleId:activeResponsibleId("maintenance",x.id,"")
    });
  });
  state.maintenanceStatus.filter(function(x){return inScope(x) && !/Bra/i.test(String(x.status||""));}).forEach(function(x){
    rows.push({
      kind:"maintenanceStatus", group:"maintenance", id:x.id, propertyId:x.propertyId, source:x,
      title:x.category+(x.actionNeed?" · "+x.actionNeed:""), subtitle:x.status||x.priority||"Underhåll",
      responsibleId:activeResponsibleId("maintenanceStatus",x.id,x.responsiblePersonId||"")
    });
  });
  state.driftIssues.filter(function(x){return inScope(x) && x.status!=="Klar";}).forEach(function(x){
    rows.push({
      kind:"driftIssue", group:"drift", id:x.id, propertyId:x.propertyId, source:x,
      title:x.title||"Driftärende", subtitle:x.targetDate||x.status||"Drift",
      responsibleId:activeResponsibleId("driftIssue",x.id,x.responsiblePersonId||"")
    });
  });
  state.wishes.filter(function(x){return inScope(x) && x.status!=="Klart" && x.status!=="Avslaget";}).forEach(function(x){
    rows.push({
      kind:"wish", group:"wish", id:x.id, propertyId:x.propertyId, source:x,
      title:x.title||"Önskemål", subtitle:x.category||x.status||"Önskemål",
      responsibleId:activeResponsibleId("wish",x.id,x.responsiblePersonId||"")
    });
  });

  function matchesPerson(row) {
    const responsibleFilter=portfolioFilters.ourPerson||"";
    if(!responsibleFilter) return true;
    if(responsibleFilter==="__unassigned") return !row.responsibleId;
    return row.responsibleId===responsibleFilter;
  }
  const visibleRows=rows.filter(matchesPerson);
  const unassigned=rows.filter(function(row){return !row.responsibleId;});
  const people=internalPeopleForPlanning();

  function planningControls(row) {
    if(row.kind==="maintenance" || row.kind==="maintenanceStatus") {
      const source=row.source||{};
      const year=row.kind==="maintenanceStatus" ? source.budgetYear : source.year;
      const quarter=Number(source.planningQuarter)||0;
      const years=maintenancePlanningYears();
      return '<div class="plan-schedule"><label><span>Planår</span><select data-plan-year="' + esc(row.kind) + '" data-plan-id="' + esc(row.id) + '">' +
        '<option value="">Ej planerat</option>' + years.map(function(y){return '<option value="' + y + '"' + (Number(year)===Number(y)?' selected':'') + '>' + y + '</option>';}).join("") +
        '</select></label><label><span>Kvartal</span><select data-plan-quarter="' + esc(row.kind) + '" data-plan-id="' + esc(row.id) + '">' +
        '<option value="">Ej placerad</option>' + [1,2,3,4].map(function(q){return '<option value="' + q + '"' + (quarter===q?' selected':'') + '>Q' + q + '</option>';}).join("") +
        '</select></label></div>';
    }
    if(row.kind==="driftIssue") {
      return '<label class="plan-date"><span>Tidplan</span><input type="date" data-plan-date="driftIssue" data-plan-id="' + esc(row.id) +
        '" value="' + esc((row.source&&row.source.targetDate)||"") + '"></label>';
    }
    if(row.kind==="project") {
      return '<div class="plan-project-dates"><span>' + esc((row.source&&row.source.start)||"Start ej satt") + '</span><b>→</b><span>' +
        esc((row.source&&row.source.end)||"Slut ej satt") + '</span></div>';
    }
    return "";
  }

  function rowHtml(row) {
    const address=planningPropertyAddress(row.propertyId);
    const person=row.responsibleId ? personName(row.responsibleId) : "Ej fördelat";
    return '<details class="plan-task ' + (!row.responsibleId?"unassigned":"") + '">' +
      '<summary><span class="plan-task-main"><small>' + esc(address) + '</small><strong>' + esc(row.title) + '</strong></span>' +
        '<span class="plan-task-owner ' + (!row.responsibleId?"warn":"") + '">' + esc(person) + '</span><b>⌄</b></summary>' +
      '<div class="plan-task-body"><label class="plan-owner-field"><span>Ansvarig</span>' +
        planningAssigneeSelect(row.kind,row.id,row.responsibleId,false) + '</label>' +
        planningControls(row) +
        (function(){
          const history=(state.assignmentChanges||[]).filter(function(h){return h.targetType===row.kind && h.targetId===row.id;}).slice(-3).reverse();
          return history.length ? '<div class="plan-history"><span>Senaste ansvarbyten</span>' +
            history.map(function(h){return '<small>' + esc(new Date(h.changedAt).toLocaleString("sv-SE")) + ' · ' +
              esc(h.fromPersonId?personName(h.fromPersonId):"Ej fördelat") + ' → ' +
              esc(h.toPersonId?personName(h.toPersonId):"Ej fördelat") + ' · ' + esc(h.changedBy) + '</small>';}).join("") + '</div>' : '';
        })() +
        (row.kind==="wish" ? '<div class="plan-wish-actions"><span>Flytta till planering</span><div><button type="button" data-plan-wish-move="maintenance" data-plan-id="' +
          esc(row.id) + '">→ Underhåll</button><button type="button" data-plan-wish-move="drift" data-plan-id="' + esc(row.id) + '">→ Drift</button></div></div>' : '') +
      '</div></details>';
  }

  function groupHtml(group,title,description) {
    const groupRows=visibleRows.filter(function(row){return row.group===group;});
    const unassignedCount=groupRows.filter(function(row){return !row.responsibleId;}).length;
    return '<details class="plan-group">' +
      '<summary><span><strong>' + esc(title) + '</strong><small>' + esc(description) + '</small></span>' +
        '<span class="plan-group-count"><strong>' + groupRows.length + '</strong>' + (unassignedCount?'<b>' + unassignedCount + ' ej fördelade</b>':'') + '</span><i>⌄</i></summary>' +
      '<div class="plan-group-body">' + (groupRows.length?groupRows.map(rowHtml).join(""):'<div class="plan-empty">Inga poster i urvalet</div>') + '</div>' +
    '</details>';
  }

  const unassignedList=unassigned.slice(0,12).map(function(row){
    return '<div class="plan-unassigned-row"><span><small>' + esc(planningPropertyAddress(row.propertyId)) + '</small><strong>' + esc(row.title) + '</strong></span>' +
      planningAssigneeSelect(row.kind,row.id,"",true) + '</div>';
  }).join("");

  return '<div class="mobile-plan-board">' +
    '<section class="plan-alert ' + (unassigned.length?"active":"clear") + '">' +
      '<details' + (unassigned.length?' open':'') + '><summary data-plan-show-unassigned><span><small>EJ FÖRDELAT</small><strong>' +
        (unassigned.length ? unassigned.length + ' uppgifter behöver ansvarig' : 'Allt är fördelat') + '</strong></span><b>⌄</b></summary>' +
        '<div class="plan-unassigned-list">' + (unassigned.length?unassignedList:'<div class="plan-empty">Inga ofördelade uppgifter i urvalet.</div>') + '</div></details>' +
    '</section>' +

    '<div class="plan-groups">' +
      groupHtml("property","Fastigheter","Grundansvar för fastigheten") +
      groupHtml("project","Projekt","Projektansvar och genomförande") +
      groupHtml("maintenance","Underhåll","Längre planering · år och kvartal") +
      groupHtml("drift","Drift","Kortare planering · datum och åtgärd") +
      groupHtml("wish","Önskemål","Bedöm, fördela eller flytta till planering") +
    '</div>' +
  '</div>';
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
    document.querySelectorAll("[data-contract-document-open]:not([data-document-bound])").forEach(function(button){
    button.dataset.documentBound="1";
    button.addEventListener("click",async function(event){
      event.preventDefault();
      event.stopPropagation();
      await openContractDocument(button.dataset.contractDocumentOpen||"");
    });
  });
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
      '<div><span>Hyra + media</span><strong>' + money(annual) + '/år</strong></div>' +
    '</div>' +
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
      '<div class="scope-list-added">' + esc((item.addedAt||"").slice(0,10) || "–") + '</div>' +
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
    '<div class="scope-list-columns"><span>Post</span><span>Typ</span><span>Fastighet</span><span>Ansvarig</span><span>Status</span><span>Tid</span><span>Tillagd</span><span>Kostnad</span><span></span></div>' +    (rows || '<div class="empty compact">Inga poster i urvalet.</div>') +
  '</section>';
}

function scopeContractsSectionHtml(contracts) {
  const total = contracts.reduce(function(sum,c){return sum+totalContractCost(c);},0);
  const rows = contracts.map(function(c) {
    const property = state.properties.find(function(p){return p.id===c.propertyId;});
    const designation = property ? (property.designation || property.sourceId || "–") : "–";
    const address = property ? (property.address || "–") : "–";
    const currentValues=contractAnnualValues(c,new Date().getFullYear(),0);
    const currentRent=currentValues.rent.amount;
    const currentAdditions=currentValues.addition.amount;
    const currentRentPerSqm=(Number(c.area)||0) ? currentRent / Number(c.area) : (Number(c.rentPerSqm)||0);
    return '<div class="scope-list-row contract-scope-row"' +
      ' data-contract-designation="' + esc(designation) + '"' +
      ' data-contract-address="' + esc(address) + '"' +
      ' data-contract-number="' + esc(c.number||"") + '"' +
      ' data-contract-area="' + esc(Number(c.area)||0) + '"' +
      ' data-contract-rent="' + esc(currentRent) + '"' +
      ' data-contract-rent-calculated="' + (currentValues.rent.calculated ? "1" : "0") + '"' +
      ' data-contract-additions="' + esc(currentAdditions) + '"' +
      ' data-contract-additions-calculated="' + (currentValues.addition.calculated ? "1" : "0") + '"' +
      ' data-contract-rent-sqm="' + esc(currentRentPerSqm) + '"' +
      ' data-contract-end="' + esc(c.end||"") + '"' +
      ' data-contract-notice="' + esc(c.notice||"") + '"' +
      ' data-contract-document-url="' + esc(c.contractDocumentUrl||"") + '"' +
      ' data-contract-document-name="' + esc(c.contractDocumentName||"") + '">' +
      '<div class="scope-list-main"><strong>' + esc(c.number||c.id) + '</strong><span>' + esc(contractCustomer(c)) +
        (property ? ' · <button type="button" class="scope-inline-link" data-explorer-property="' + esc(property.id) + '">' +
          esc(address) + '</button>' : '') + ' · ' + num(c.area) + ' kvm</span></div>' +
      '<div class="scope-list-status">' + statusBadge(activeInYear(c,new Date().getFullYear()) ? "Aktivt" : "Bevaka") + '</div>' +
      '<div class="scope-list-time">' + esc(c.end||"–") + '</div>' +
      '<div class="scope-list-added">' + esc((c.createdAt||"").slice(0,10) || "–") + '</div>' +
      '<div class="scope-list-value"><strong>' + money(totalContractCost(c)) + '/år</strong>' +
        '<button type="button" class="inline-link compact-link" data-edit-type="object" data-edit-id="' + esc(c.id) + '">Redigera</button></div>' +
    '</div>';
  }).join("");
  return '<section class="scope-list-section contract-scope-section">' +
    '<div class="scope-list-head"><button type="button" class="scope-list-title" data-portfolio-section="contracts">' +
      '<span>Avtal</span><strong>' + money(total) + '/år</strong><small>' + contracts.length + ' avtal</small></button></div>' +
    '<div class="scope-list-columns contract-columns"></div>' +
    (rows || '<div class="empty compact">Inga avtal i urvalet.</div>') +
  '</section>';
}
function scopeAllSectionsHtml(contracts) {
  return '<div class="scope-all-sections">' +
    scopeContractsSectionHtml(contracts) +
    scopeActivitySectionHtml(contracts,"project","Projekt","project") +
    scopeActivitySectionHtml(contracts,"maintenance","Underhåll","maintenance") +
    scopeActivitySectionHtml(contracts,"drift","Drift","driftIssue") +
    scopeActivitySectionHtml(contracts,"wish","Övrigt","wish") +
  '</div>';
}

function portfolioOverviewHtml(contracts) {
  const propertyIds = new Set(contracts.map(function(c) { return c.propertyId; }).filter(Boolean));
  const totalArea = contracts.reduce(function(sum, c) { return sum + (Number(c.area) || 0); }, 0);
  const totalCost = contracts.reduce(function(sum, c) { return sum + totalContractCost(c); }, 0);
  const costPerSqm = totalArea ? totalCost / totalArea : 0;
  const activity = portfolioActivityItems(contracts);
  const maintenanceItems = activity.filter(function(item){ return item.group==="maintenance"; });
  const driftItems = activity.filter(function(item){ return item.group==="drift" || item.group==="operations"; });
  const otherItems = activity.filter(function(item){ return item.group==="wish"; });
  const maintenanceCost = maintenanceItems.reduce(function(sum,item){ return sum + (Number(item.cost)||0); },0);
  const driftCost = driftItems.reduce(function(sum,item){ return sum + (Number(item.cost)||0); },0);
  const otherCost = otherItems.reduce(function(sum,item){ return sum + (Number(item.cost)||0); },0);

  return '<section class="summary-block">' +
    '<div class="overview-kpis compact portfolio-kpi-chips">' +
      kpi("Fastigheter", num(propertyIds.size), "i aktuellt urval") +
      kpi("Avtal", num(contracts.length), "i aktuellt urval") +
      kpi("Area", num(totalArea) + " kvm", propertyIds.size ? num(totalArea / propertyIds.size) + " kvm / fastighet" : "–") +
      kpi("Hyra + media", money(totalCost), totalArea ? num(costPerSqm) + " kr/kvm" : "–") +
      kpi("Underhåll", money(maintenanceCost), maintenanceItems.length + (maintenanceItems.length===1 ? " post" : " poster")) +
      kpi("Drift", money(driftCost), driftItems.length + (driftItems.length===1 ? " post" : " poster")) +
      kpi("Övrigt", money(otherCost), otherItems.length + (otherItems.length===1 ? " post" : " poster")) +
    '</div></section>' +
    '<div class="scope-details-intro"><div><span class="portfolio-kicker">UNDERLAG</span><h3>Ekonomi och aktiviteter</h3></div></div>' +
    scopeAllSectionsHtml(contracts);
}
function renderProperties() {
  const filters=portfolioFilterOptions();
  const initialContracts=portfolioScopeContracts();
  const advancedFilterCount = ["customer","owner","tenantPerson","ownerPerson"].filter(function(key){return Boolean(portfolioFilters[key]);}).length;
  const advancedFilters =
    '<details class="advanced-filters unified-advanced-filters advanced-filter-chip ' + (advancedFilterCount ? "active" : "") + '">' +
      '<summary><span>Övrigt</span><strong>' + (advancedFilterCount ? advancedFilterCount + " valda" : "Alla") + '</strong><b>⌄</b></summary>' +
      '<div class="advanced-filter-grid">' +
        '<select class="select" id="filter-customer">' + selectOptions(filters.customer,"Alla kunder") + '</select>' +
        '<select class="select" id="filter-owner">' + selectOptions(filters.owner,"Alla fastighetsägare") + '</select>' +
        '<select class="select" id="filter-tenant-person">' + selectOptions(filters.tenantPeople,"Kundansvarig") + '</select>' +
        '<select class="select" id="filter-owner-person">' + selectOptions(filters.ownerPeople,"Ägaransvarig") + '</select>' +
      '</div></details>';

  return '<div class="bestands-page unified-portfolio">' +
    '<section class="portfolio-hero unified-portfolio-hero">' +
      '<div id="mobile-quick-summary">' + mobileQuickSummaryHtml(initialContracts) + '</div>' +
      '<div class="portfolio-filter-top-row"><div id="mobile-scope-filters">' + mobileScopeFiltersHtml(filters) + '</div>' + advancedFilters + '</div>' +
      '<div class="portfolio-search-row"><input class="search portfolio-search" id="portfolio-search" value="' + esc(portfolioFilters.q||"") + '" placeholder="Sök fastighet, avtal, kund eller person…">' +
        '<button class="button secondary" id="portfolio-filter-reset">Rensa</button></div>' +
      '<div id="mobile-content-tabs" class="mobile-content-tabs unified-content-tabs desktop-hide-summary">' + mobileModeChooserHtml(initialContracts) + '</div>' +
      '<div id="mobile-context"></div>' +
      '<select id="filter-unit" hidden>' + selectOptions(filters.unit,"Alla organisationer") + '</select>' +
      '<select id="filter-our-person" hidden>' + selectOptions(filters.ourPeople,"Alla ansvariga") + '</select>' +
    '</section>' +

    '<section class="portfolio-desktop-workspace" aria-label="Arbetsyta för aktuellt urval">' +
      '<div id="portfolio-context" class="portfolio-context portfolio-context-only"></div>' +
      '<div id="property-persistent-context">' + propertyPersistentContextHtml(initialContracts) + '</div>' +
      '<div id="portfolio-content-tabs" class="desktop-perspective-nav"' + (portfolioExplorer.section==="activities" ? ' hidden' : '') + '>' + portfolioContentTabsHtml(initialContracts) + '</div>' +
      '<div class="desktop-detail-panels">' +
        '<div id="overview-panel"><div id="portfolio-overview-content">' +
          portfolioTableViewHtml(initialContracts) +
        '</div></div>' +
        '<div id="properties-panel" hidden><div id="portfolio-properties-content">' + mobilePropertyCardsHtml(initialContracts) + '</div></div>' +
        '<div id="contracts-panel" hidden><div id="portfolio-contracts-content">' + scopeContractsSectionHtml(initialContracts) + '</div></div>' +
        '<div id="activity-panel" hidden><div id="portfolio-activity-content"></div></div>' +
      '</div>' +
    '</section>' +

    '<section class="portfolio-mobile-workspace ' + (portfolioExplorer.section==="activities" ? "plan-visible" : "") + '">' +
      '<div id="mobile-property-persistent-context"></div>' +
      '<div class="mobile-panels unified-panels">' +
        '<div class="mobile-panel" id="mobile-overview-panel"><div id="mobile-overview-content">' + mobileOverviewHtml(initialContracts) + '</div></div>' +
        '<div class="mobile-panel" id="mobile-properties-panel" hidden><div id="mobile-properties-content">' + mobilePropertyCardsHtml(initialContracts) + '</div></div>' +
        '<div class="mobile-panel" id="mobile-contracts-panel" hidden><div id="mobile-contracts-content">' + mobileContractCardsHtml(initialContracts) + '</div></div>' +
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

  const controls =
    '<section class="unified-map-controls">' +
      '<div id="mobile-scope-filters">' + mobileScopeFiltersHtml(filters) + '</div>' +
      '<div class="portfolio-search-row"><input class="search portfolio-search" id="portfolio-search" value="' + esc(portfolioFilters.q||"") +
        '" placeholder="Sök fastighet, avtal, kund eller person…">' +
        '<button class="button secondary" id="portfolio-filter-reset">Rensa</button></div>' +
      '<select id="filter-unit" hidden>' + selectOptions(filters.unit,"Alla områden") + '</select>' +
      '<select id="filter-our-person" hidden>' + selectOptions(filters.ourPeople,"Alla ansvariga") + '</select>' +
      '<div class="mobile-map-metrics unified-map-metrics" role="tablist" aria-label="Nyckeltal på karta">' +
        [["cost","kr"],["sqm","kr/kvm"],["users","kr/brukare"],["employees","kr/anställd"]].map(function(metric){
          return '<button type="button" data-map-metric="' + metric[0] + '" class="' + (mobileMapMetric===metric[0]?"active":"") +
            '" role="tab" aria-selected="' + (mobileMapMetric===metric[0]?"true":"false") + '">' + metric[1] + '</button>';
        }).join("") +
      '</div>' +
      '<div class="unified-map-count">' + mapped.length + ' kartlagda' + (missing ? ' · ' + missing + ' saknar koordinat' : '') + '</div>' +
    '</section>';

  return '<div class="map-page unified-map-page">' + controls +
    '<section class="card map-card unified-map-card">' +
      '<div id="property-map" class="property-map" role="region" aria-label="Karta över fastigheter"></div>' +
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
      '<span>Hyra + media</span><strong>' + money(x.cost) + '</strong>' +
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
  const filters = portfolioFilterOptions();
  const scopedContracts = portfolioScopeContracts();
  const scoped = hasPortfolioScope();
  const liveRows = budgetRows(selectedBudgetYear, scoped ? scopedContracts : undefined);
  const plan = budgetPlan(selectedBudgetYear);
  const rawBaselineRows = plan && Array.isArray(plan.lines) ? plan.lines : budgetRows(selectedBudgetYear);
  const baselineRows = (scoped ? budgetRowsForContracts(rawBaselineRows, scopedContracts) : rawBaselineRows).filter(function(r){return r.included!==false;});
  const baseSummary = summarizeBudgetRows(baselineRows);
  const comparison = LokalblickBudgetFollowup.compare(state,baselineRows,liveRows,selectedBudgetYear);
  const forecastSummary = summarizeBudgetRows(comparison.map(r=>Object.assign({},r,{amount:r.forecast})));
  const actualSummary = summarizeBudgetRows(comparison.map(r=>Object.assign({},r,{amount:r.finalCost==null?0:r.finalCost})));
  const targets = {};
  baseSummary.forEach(function(row){
    targets[row.category] = !scoped && plan && plan.targets && Number.isFinite(Number(plan.targets[row.category])) ? Number(plan.targets[row.category]) : row.amount;
  });
  const budgetTotal = budgetCategories().reduce(function(sum,category){return sum+(Number(targets[category])||0);},0);
  const forecastTotal = forecastSummary.reduce(function(sum,row){return sum+row.amount;},0);
  const actualTotal = actualSummary.reduce(function(sum,row){return sum+row.amount;},0);
  const variance = forecastTotal - budgetTotal;
  const locked = Boolean(plan && plan.status==="Låst");

  const yearOptions = budgetYears().map(function(y) {
    return '<option value="' + y + '"' + (Number(y)===Number(selectedBudgetYear) ? " selected" : "") + ">" + y + "</option>";
  }).join("");
  const yearSelect = '<select class="select" id="budget-year">' + yearOptions + "</select>";
  const budgetIndexYear=Number(selectedBudgetYear)-1;
  const knownBudgetIndex=indexSeriesValue(budgetIndexYear);
  const preliminaryBudgetIndex=plan ? Number(plan.preliminaryIndex)||0 : 0;
  const budgetIndexHtml =
    '<div class="budget-index-assumption">' +
      '<div><span>HYRESINDEX</span><strong>Oktober '+budgetIndexYear+'</strong><small>Används för '+selectedBudgetYear+' års hyra</small></div>' +
      (knownBudgetIndex
        ? '<div class="budget-index-value"><span class="badge green">Känd KPI</span><strong>'+esc(new Intl.NumberFormat("sv-SE",{maximumFractionDigits:2}).format(knownBudgetIndex))+'</strong></div>'
        : plan && !locked
          ? '<label><span>Preliminärt index</span><input type="number" step="0.01" data-budget-preliminary-index value="'+esc(preliminaryBudgetIndex||"")+'" placeholder="Ange indextal"><small>Samma indexserie som avtalens bastal</small></label>'
          : plan
            ? '<div class="budget-index-value"><span class="badge amber">Preliminärt</span><strong>'+(preliminaryBudgetIndex?esc(new Intl.NumberFormat("sv-SE",{maximumFractionDigits:2}).format(preliminaryBudgetIndex)):"Saknas")+'</strong></div>'
            : '<div class="budget-index-value"><span class="badge amber">Saknas</span><small>Skapa arbetsbudget för att ange preliminärt index</small></div>') +
    '</div>';

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
      '<div class="budget-followup"><span>Prognos <strong>' + money(forecast.amount) + '</strong></span><span>Slutkostnad <strong>' + money(actual.amount) + '</strong></span>' +
      '<span>Avvikelse <strong class="' + (forecast.amount-target>0?"negative":"positive") + '">' + (forecast.amount-target>=0?"+":"") + money(forecast.amount-target) + '</strong></span></div></section>';
  }).join("");

  const detailRows = baselineRows.map(function(r){
    const removable=r.sourceType&&r.sourceType!=="contract";
    const action=removable?'<button type="button" class="budget-row-action" data-budget-toggle="exclude" data-budget-source-type="'+esc(r.sourceType)+'" data-budget-source-id="'+esc(r.sourceId||"")+'">Ta bort</button>':'<span class="budget-row-fixed">Fast</span>';
    return '<tr><td>'+esc(r.category)+'</td><td>'+esc(r.sub||"")+'</td><td>'+esc(r.source||"")+'</td><td>'+esc(budgetPropertyLabel(r))+'</td><td>'+esc(budgetTimingLabel(r,selectedBudgetYear))+'</td><td>'+money(r.amount)+'</td><td>'+action+'</td></tr>';
  });
  if (!scoped) baseSummary.forEach(function(base){
    const adjustment=budgetAdjustment(plan,base.category,base.amount);
    if (adjustment) detailRows.push('<tr class="budget-adjustment-row"><td>' + esc(base.category) + '</td><td>Budgetjustering</td><td>' +
      esc((plan && plan.notes && plan.notes[base.category]) || "Justeringspost") + '</td><td>–</td><td>Årsnivå</td><td>' +
      (adjustment>=0?"+":"") + money(adjustment) + '</td></tr>');
  });

  const excludedBudgetItems=[];function pushExcluded(collection,type){(state[collection]||[]).forEach(function(x){if(budgetIncluded(x))return;const y=Number(x.budgetYear||x.year||x.period);if(y&&y!==Number(selectedBudgetYear))return;excludedBudgetItems.push({sourceType:type,sourceId:x.id,label:x.name||x.title||x.category||x.id,amount:Number(x.estimatedCost)||Number(x.cost)||Number(x.budget)||0});});}pushExcluded("projects","project");pushExcluded("maintenance","maintenance");pushExcluded("operations","operation");pushExcluded("investigations","investigation");pushExcluded("maintenanceStatus","maintenanceStatus");pushExcluded("driftIssues","driftIssue");pushExcluded("wishes","wish");const excludedHtml=excludedBudgetItems.length?'<details class="budget-excluded"><summary><span>Ej med i budgetunderlaget</span><strong>'+excludedBudgetItems.length+'</strong></summary><div>'+excludedBudgetItems.map(function(x){return '<div class="budget-excluded-row"><span><strong>'+esc(x.label)+'</strong><small>'+esc(auditTypeLabel(auditCollectionForType(x.sourceType)))+'</small></span><button type="button" class="budget-row-action" data-budget-toggle="include" data-budget-source-type="'+esc(x.sourceType)+'" data-budget-source-id="'+esc(x.sourceId)+'">Ta med</button></div>';}).join("")+'</div></details>':"";
  const status = plan ? '<span class="budget-status ' + (locked?"locked":"draft") + '">' + esc(plan.status||"Arbetsbudget") + '</span>' : '<span class="budget-status draft">Ej skapad</span>';
  const action = scoped
    ? '<span class="budget-lock-note">Urvalsvy · budgeten administreras på hela beståndet</span>'
    : !plan ? '<button class="button primary" id="budget-create">Skapa arbetsbudget från detaljer</button>' :
      locked ? '<span class="budget-lock-note">Låst ' + esc(plan.lockedAt||"") + ' · används som baslinje för uppföljning</span>' :
      '<button class="button primary" id="budget-lock">Lås årsbudget</button>';

  function mobileCategory(category) {
    const base=baseSummary.find(function(x){return x.category===category;}) || {amount:0};
    const forecast=forecastSummary.find(function(x){return x.category===category;}) || {amount:0};
    const actual=actualSummary.find(function(x){return x.category===category;}) || {amount:0};
    const target=Number(targets[category])||0;
    const adjustment=target-base.amount;
    const rows=baselineRows.filter(function(r){return r.category===category;});
    const rowHtml=rows.length ? rows.map(function(r){
      const address=budgetPropertyLabel(r);
      const detail=r.source || r.sub || category;
      const label=(address && address!=="–" ? address + " · " : "") + detail;
      const removable=r.sourceType&&r.sourceType!=="contract";
      return '<div class="mobile-budget-detail-row"><span>'+esc(label)+'</span><strong>'+money(r.amount)+'</strong>'+(removable?'<button type="button" class="budget-row-action" data-budget-toggle="exclude" data-budget-source-type="'+esc(r.sourceType)+'" data-budget-source-id="'+esc(r.sourceId||"")+'">Ta bort</button>':"")+'</div>';
    }).join("") : '<div class="mobile-budget-empty">Inga budgetrader i urvalet</div>';

    const adjustmentHtml = !scoped && !locked
      ? '<label class="mobile-budget-adjustment"><span>Justering</span><input type="number" data-budget-adjustment="' + esc(category) +
        '" value="' + adjustment + '"></label>'
      : '<span class="mobile-budget-adjustment-readonly">Justering <strong>' + (adjustment>=0?"+":"") + money(adjustment) + '</strong></span>';

    return '<details class="mobile-budget-category">' +
      '<summary><span>' + esc(category) + '</span><strong>' + money(target) + '</strong><b>⌄</b></summary>' +
      '<div class="mobile-budget-category-body">' +
        '<div class="mobile-budget-category-stats">' +
          '<span>Budget <strong>' + money(target) + '</strong></span>' +
          '<span>Prognos <strong>' + money(forecast.amount) + '</strong></span>' +
          '<span>Slutkostnad <strong>' + money(actual.amount) + '</strong></span>' +
        '</div>' +
        '<div class="mobile-budget-category-underlay"><span>Underlag <strong>' + money(base.amount) + '</strong></span>' + adjustmentHtml + '</div>' +
        '<div class="mobile-budget-detail-list">' + rowHtml + '</div>' +
      '</div>' +
    '</details>';
  }

  const mobileAction = scoped
    ? '<span class="mobile-budget-status-note">Urvalsvy</span>'
    : !plan ? '<button class="mobile-budget-action" id="mobile-budget-create">Skapa arbetsbudget</button>'
    : locked ? '<span class="mobile-budget-status-note">Låst ' + esc(plan.lockedAt||"") + '</span>'
    : '<button class="mobile-budget-action" id="mobile-budget-lock">Lås budget</button>';

  const mobileBudget =
    '<section class="mobile-budget-page unified-budget-page">' +
      '<div class="mobile-budget-filters">' +
        '<div id="mobile-scope-filters">' + mobileScopeFiltersHtml(filters) + '</div>' +
        '<div class="portfolio-search-row"><input class="search portfolio-search" id="portfolio-search" value="' + esc(portfolioFilters.q||"") +
          '" placeholder="Sök fastighet, avtal, kund eller person…">' +
          '<button class="button secondary" id="portfolio-filter-reset">Rensa</button></div>' +
        '<select id="filter-unit" hidden>' + selectOptions(filters.unit,"Alla områden") + '</select>' +
        '<select id="filter-our-person" hidden>' + selectOptions(filters.ourPeople,"Alla ansvariga") + '</select>' +
      '</div>' +
      '<section class="mobile-budget-summary">' +
        '<div class="mobile-budget-summary-head"><div><span>BUDGET</span><select class="mobile-budget-year" id="mobile-budget-year">' +
          yearOptions + '</select></div><strong>' + money(budgetTotal) + '</strong></div>' +
        budgetIndexHtml +
        '<div class="mobile-budget-summary-kpis">' +
          '<div><span>Prognos</span><strong>' + money(forecastTotal) + '</strong></div>' +
          '<div><span>Slutkostnad</span><strong>' + money(actualTotal) + '</strong></div>' +
          '<div class="' + (variance>0?"negative":"positive") + '"><span>Avvikelse</span><strong>' +
            (variance>=0?"+":"") + money(variance) + '</strong></div>' +
        '</div>' +
        '<div class="mobile-budget-summary-status">' + status + mobileAction + '</div>' +
      '</section>' +
      '<div class="mobile-budget-categories">' +
        budgetCategories().map(mobileCategory).join("") +
      '</div>' +
    '</section>';

  return '<div class="budget-page unified-budget-shell">' + mobileBudget + budgetFollowupHtml(plan,comparison,scoped) + excludedHtml + '</div>';
}

function sourceStatus() {
  return window.LokalblickSourceService ? window.LokalblickSourceService.status() : {connected:false,remembered:false,mode:"read",dirty:false,discovered:[]};
}
function apiSheetRows(discovered) {
  if (!discovered || !discovered.length) return '<div class="empty">Ingen Excel-källa är ansluten ännu.</div>';
  return '<div class="api-sheet-list">' + discovered.map(function(sheet) {
    const fields=(sheet.fields||[]).slice(0,6).join(", ");
    return '<div class="api-sheet-row"><div><strong>' + esc(sheet.name) + '</strong><small>' + esc(fields || "Tom tabell") + '</small></div><span>' + num(sheet.rows) + ' rader</span></div>';
  }).join("") + '</div>';
}
function renderApi() {
  const st=sourceStatus();
  const connected=st.connected;
  const pending=st.pendingChanges || [];
  const remembered=st.remembered && !connected;
  const modeLabel=st.mode==="readwrite" ? "Läs + skriv" : "Endast läs";
  const statusLabel=connected ? "Ansluten" : remembered ? "Koppling sparad" : "Ej ansluten";
  const statusClass=connected ? "green" : remembered ? "amber" : "";
  const sourceName=st.fileName || "Ingen källa vald";
  const migration=st.sourceKind==="migration";
  const migrationReport=st.migrationReport || null;
  const enrichmentReport=st.enrichmentReport || null;
  const indexReport=st.indexReport || null;
  const compact=Boolean(window.matchMedia && window.matchMedia("(max-width: 700px)").matches);
  const desktopOpen=compact ? "" : " open";
  const touch=Boolean(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  const canOpen=Boolean(window.showOpenFilePicker);
  const canSave=Boolean(window.showSaveFilePicker);
  const localFileReady=canOpen && canSave;
  const deviceLabel=localFileReady ? (touch ? "Stöds på denna enhet" : "Full lokal filåtkomst") : "Begränsad på denna enhet";
  const deviceClass=localFileReady ? "green" : "amber";

  const primarySave = migration
    ? (canSave ? '<button type="button" class="button primary api-device-save" data-api-create="current">Skapa Lokalblick-fil →</button>' : '')
    : connected && st.mode==="readwrite" && pending.length
      ? '<button type="button" class="button primary api-device-save" data-api-write>' + (st.writeRecoveryNeeded ? '↻ Välj fil och spara' : '💾 Spara ' + pending.length + ' till Excel') + '</button>'
      : connected && pending.length
        ? '<button type="button" class="button primary api-device-save" data-api-mode="readwrite">Tillåt skrivning</button>'
        : '';

  const connectionActions = localFileReady
    ? '<div class="api-button-stack"><button type="button" class="button primary" data-api-connect="read">Koppla · läs</button><button type="button" class="button secondary" data-api-connect="readwrite">Koppla · läs + skriv</button>' +
      (remembered ? '<button type="button" class="button secondary" data-api-reconnect>Återanslut sparad fil</button>' : '') + '</div>'
    : '<div class="notice api-device-note"><strong>Lokal filkoppling är begränsad i denna webbläsare.</strong><br>För beständig läs/skriv-koppling använder du Edge eller Chrome med stöd för filåtkomst. OneDrive/SharePoint blir nästa fleranvändarväg.</div>';

  const createActions = canSave
    ? '<div class="api-button-stack"><button type="button" class="button primary" data-api-create="current">' + (migration?'Skapa Lokalblick-fil av migrerad data':'Skapa med aktuell data') + '</button><button type="button" class="button secondary" data-api-create="blank">Skapa tom struktur</button></div>'
    : '<div class="notice api-device-note">Den här enheten kan inte välja en beständig lokal sparplats från webbläsaren.</div>';

  const migrationHtml = migration && migrationReport
    ? '<section class="card pad api-migration-card"><div class="card-head"><div><span class="eyebrow">MIGRERING</span><h2>Befintlig Excel → Lokalblick</h2><p>Källfilen läses som underlag men skrivs inte om. När kontrollen är klar skapar du en ny ren Lokalblick-fil.</p></div><span class="badge amber">Skrivskyddad källa</span></div>' +
      '<div class="api-migration-stats">' +
        '<div><span>Fastigheter</span><strong>' + num((migrationReport.counts||{}).properties||0) + '</strong></div>' +
        '<div><span>Avtal</span><strong>' + num((migrationReport.counts||{}).contracts||0) + '</strong></div>' +
        '<div><span>Aktiviteter</span><strong>' + num((migrationReport.counts||{}).activities||0) + '</strong></div>' +
        '<div><span>Behöver kontroll</span><strong>' + num(((migrationReport.counts||{}).unmatchedOrders||0)+((migrationReport.counts||{}).provisionalProperties||0)) + '</strong></div>' +
      '</div>' +
      ((migrationReport.warnings||[]).length ? '<div class="api-migration-warnings">' + migrationReport.warnings.map(function(w){return '<span>⚠ ' + esc(w) + '</span>';}).join('') + '</div>' : '<div class="notice"><strong>✓ Migreringen ser komplett ut.</strong></div>') +
      (canSave ? '<button type="button" class="button primary api-migration-create" data-api-create="current">Skapa ny Lokalblick-fil av denna data</button>' : '') +
    '</section>'
    : '';

  const changesHtml = pending.length ? '<div class="api-change-list">' + pending.slice(0,20).map(function(change) {
    const changedFields=(change.fields||[]).slice(0,4).join(", ");
    return '<div class="api-change-row"><div><strong>' + esc(change.action + " · " + change.sheet) + '</strong><small>' + esc(change.id + (changedFields ? " · " + changedFields : "")) + '</small></div><span class="badge ' + (change.action==="Borttagen"?"red":change.action==="Skapad"?"green":"amber") + '">' + esc(change.action) + '</span></div>';
  }).join("") + (pending.length>20?'<div class="muted">+'+(pending.length-20)+' fler ändringar</div>':'') + '</div>' :
    '<div class="empty">Ändringar du gör i Lokalblick visas här innan de skrivs till källan.</div>';

  const enrichmentHtml =
    '<section class="card pad api-enrichment-card">' +
      '<div class="card-head"><div><span class="eyebrow">KOMPLETTERANDE KÄLLOR</span><h2>Berika befintliga avtal</h2>' +
        '<p>INT/EXT eller Lokalblick-filen behåller avtalsidentiteten. Kompletteringsfiler får bara fylla på eller uppdatera avtalsekonomi och villkor.</p></div>' +
        '<span class="badge ' + (connected ? "green" : "amber") + '">' + (connected ? "Basdata aktiv" : "Koppla basdata först") + '</span></div>' +
      '<div class="api-enrichment-actions">' +
        '<div><strong>Avtalsregister</strong><span>Matchar först på avtalsnummer, därefter säkert på fastighet, adress, start, verksamhet, typ och area.</span>' +
          (canOpen ? '<button type="button" class="button secondary" data-api-contract-enrich ' + (!connected || !state.contracts.length ? 'disabled' : '') + '>Berika avtal från Excel</button>' : '<small>Edge/Chrome krävs för filval.</small>') + '</div>' +
        '<div><strong>KPI / indexserie</strong><span>Läser År + Oktober/KPI/Indextal och räknar hyra och tillägg separat från respektive bastal och indexandel.</span>' +
          (canOpen ? '<button type="button" class="button secondary" data-api-index-import ' + (!connected || !state.contracts.length ? 'disabled' : '') + '>Läs in KPI-serie</button>' : '<small>Edge/Chrome krävs för filval.</small>') + '</div>' +
      '</div>' +
      (enrichmentReport ? '<div class="api-enrichment-report"><div><span>Matchade</span><strong>' + num((enrichmentReport.counts||{}).matched||0) + '</strong></div><div><span>PDF-dokument</span><strong>' + num((enrichmentReport.counts||{}).documents||0) + '</strong><small>' +
          num((enrichmentReport.counts||{}).linkedDocuments||0) + ' länkade · ' +
          num((enrichmentReport.counts||{}).embeddedDocuments||0) + ' inbäddade</small></div><div><span>Kontroll</span><strong>' + num((enrichmentReport.counts||{}).needsReview||0) + '</strong></div><div><span>Ej matchade</span><strong>' + num((enrichmentReport.counts||{}).unmatched||0) + '</strong></div><div><span>Avvikelser</span><strong>' + num((enrichmentReport.counts||{}).discrepancies||0) + '</strong></div></div>' : '') +
      (enrichmentReport && (((enrichmentReport.needsReview||[]).length)||((enrichmentReport.unmatched||[]).length)||((enrichmentReport.discrepancies||[]).length)) ?
        '<details class="api-enrichment-review"><summary>Visa poster som behöver kontrolleras</summary><div>' +
          (enrichmentReport.needsReview||[]).slice(0,8).map(function(x){return '<p><strong>Osäker match</strong> · rad ' + esc(x.sourceRow) + ' · ' + esc(x.number||x.designation||x.address||"–") + '</p>';}).join('') +
          (enrichmentReport.unmatched||[]).slice(0,8).map(function(x){return '<p><strong>Ingen match</strong> · rad ' + esc(x.sourceRow) + ' · ' + esc(x.number||x.designation||x.address||"–") + '</p>';}).join('') +
          (enrichmentReport.discrepancies||[]).slice(0,12).map(function(x){
            const moneyFields=/hyresberäkning|tilläggsberäkning/.test(x.field||"");
            const left=moneyFields ? money(x.primary) : esc(x.primary);
            const right=moneyFields ? money(x.enrichment) : esc(x.enrichment);
            return '<p><strong>Avvikelse · ' + esc(x.field) + '</strong> · ' + esc(x.contractId) + ': faktisk ' + left + ' · beräknad ' + right +
              (x.detail ? '<br><span>' + esc(x.detail) + '</span>' : '') + '</p>';
          }).join('') +
        '</div></details>' : '') +
      (indexReport ? '<div class="notice api-index-report"><strong>KPI-serie inläst</strong><br>' + num(indexReport.rows||0) + ' indexvärden · ' + num(indexReport.recalculated||0) + ' indexberäkningar uppdaterade.</div>' : '') +
    '</section>';

  const sourceActions =
    '<div class="section-stack"><div class="notice"><strong>Säker princip</strong><br>Stabila ID:n följer med varje rad. Skrivning sker först när du aktivt väljer att spara.</div>' +
    '<div class="api-access-row"><span>Läge</span><strong>' + esc(modeLabel) + '</strong></div>' +
    '<div class="api-access-row"><span>Råfil uppladdad</span><strong>Nej</strong></div>' +
    '<div class="api-button-stack">' +
      (connected ? '<button type="button" class="button secondary" data-api-refresh>Hämta senaste</button>' : '') +
      (connected && st.mode==="read" && !migration ? '<button type="button" class="button secondary" data-api-mode="readwrite">Tillåt skrivning</button>' : '') +
      (connected && st.mode==="readwrite" ? '<button type="button" class="button primary" data-api-write ' + (st.dirty ? '' : 'disabled') + '>' + (st.writeRecoveryNeeded ? '↻ Välj fil och spara' : 'Skriv ' + pending.length + ' ändring' + (pending.length===1?'':'ar') + ' till Excel') + '</button>' : '') +
      (st.remembered ? '<button type="button" class="button secondary" data-api-disconnect>Koppla bort</button>' : '') +
    '</div></div>';

  return '<div class="section-stack api-page ' + (compact?'api-compact':'api-wide') + '">' +
    '<section class="card pad api-hero"><div class="api-hero-head"><div><span class="eyebrow">DATA & KOPPLINGAR</span><h2>Datakällor</h2><p>Välj var Lokalblick ska läsa data. Samma urval och arbetsflöden fungerar oavsett källa.</p></div><span class="badge ' + statusClass + '">' + esc(statusLabel) + '</span></div>' +
      '<div class="api-source-summary"><div><span>Källa</span><strong>' + esc(sourceName) + '</strong></div><div><span>Åtkomst</span><strong>' + esc(modeLabel) + '</strong></div><div class="api-summary-secondary"><span>Senast läst</span><strong>' + (st.lastRead ? esc(new Date(st.lastRead).toLocaleString("sv-SE")) : "–") + '</strong></div><div><span>Ändringar</span><strong>' + (st.dirty ? pending.length + " väntar" : "Synkron") + '</strong></div></div>' +
      '<div class="api-device-bar"><span class="badge ' + deviceClass + '">' + esc(deviceLabel) + '</span>' + primarySave + '</div>' +
    '</section>' +

    migrationHtml +
    enrichmentHtml +
    '<section class="api-connect-workspace">' +
      '<div class="api-connect-main">' +
        '<section class="card pad api-source-card api-source-primary"><div class="api-card-top"><div class="api-connector-icon">XL</div><span class="mobile-only badge ' + deviceClass + '">' + (localFileReady?'Tillgänglig':'Begränsad') + '</span></div><h3>Excel på dator / nätverk</h3><p class="muted">Öppna en befintlig Lokalblick-fil och välj läs eller läs + skriv.</p>' + connectionActions + '</section>' +
        '<section class="card pad api-source-card"><div class="api-connector-icon">＋</div><h3>Skapa Excel-källa</h3><p class="muted">Skapa rätt tabeller och fält. Du väljer själv filnamn och plats.</p>' + createActions + '</section>' +
      '</div>' +
      '<div class="api-production-sources">' +
        '<section class="card pad api-source-card api-source-future"><div class="api-future-row"><div class="api-connector-icon">365</div><div><h3>Microsoft 365</h3><p class="muted">SharePoint, Lists eller Dataverse via Lokalblicks autentiserade backend.</p><span class="api-source-state">Företagsmiljö · backendanslutning</span></div></div></section>' +
        '<section class="card pad api-source-card api-source-future"><div class="api-future-row"><div class="api-connector-icon">↔</div><div><h3>Externt system / API</h3><p class="muted">Fastighets-, ekonomi- eller verksamhetssystem kopplas via en adapter. Nycklar och hemligheter stannar på serversidan.</p><span class="api-source-state">Adapterklar arkitektur</span></div></div></section>' +
      '</div>' +
    '</section>' +

    '<section class="api-detail-workspace">' +
      '<details class="card api-flow-detail api-changes-detail"' + desktopOpen + '><summary><span><small>1</small>Väntande ändringar</span><strong>' + pending.length + '</strong></summary><div class="api-detail-body">' + changesHtml + '</div></details>' +
      '<details class="card api-flow-detail api-tables-detail"' + desktopOpen + '><summary><span><small>2</small>Tabeller och fält</span><strong>' + (st.discovered||[]).length + '</strong></summary><div class="api-detail-body">' + apiSheetRows(st.discovered) + '</div></details>' +
      '<details class="card api-flow-detail api-access-detail"' + desktopOpen + '><summary><span><small>3</small>Åtkomst & synk</span><strong>›</strong></summary><div class="api-detail-body">' + sourceActions + '</div></details>' +
    '</section>' +
  '</div>';
}
async function reloadFromActiveSource() {
  state = ensureShape(await enrichConnectedData(await window.LokalblickDataService.load()));
  render();
}
function bindApiControls() {
  document.querySelectorAll("[data-api-connect]:not([data-api-bound])").forEach(function(button) {
    button.dataset.apiBound="1";
    button.addEventListener("click", async function() {
      try {
        const data=await window.LokalblickSourceService.connect(button.dataset.apiConnect);
        state=ensureShape(await enrichConnectedData(data));
        render();
      } catch (error) {
        if (error && error.name==="AbortError") return;
        alert(error.message || String(error));
      }
    });
  });
  document.querySelectorAll("[data-api-create]:not([data-api-bound])").forEach(function(button) {
    button.dataset.apiBound="1";
    button.addEventListener("click", async function() {
      try {
        const blank=button.dataset.apiCreate==="blank";
        const data=await window.LokalblickSourceService.createFile(state,"readwrite",blank);
        state=ensureShape(await enrichConnectedData(data));
        render();
      } catch (error) {
        if (error && error.name==="AbortError") return;
        alert(error.message || String(error));
      }
    });
  });
  const enrichButton=document.querySelector("[data-api-contract-enrich]");
  if(enrichButton && !enrichButton.dataset.apiBound){
    enrichButton.dataset.apiBound="1";
    enrichButton.addEventListener("click",async function(){
      const original=enrichButton.textContent;
      enrichButton.disabled=true; enrichButton.textContent="Matchar…";
      try{
        const result=await window.LokalblickSourceService.enrichContracts(state);
        state=ensureShape(result.data);
        await saveState();
        render();
      }catch(error){
        if(error && error.name==="AbortError"){enrichButton.disabled=false;enrichButton.textContent=original;return;}
        enrichButton.disabled=false;enrichButton.textContent=original;
        alert(error.message||String(error));
      }
    });
  }
  const indexButton=document.querySelector("[data-api-index-import]");
  if(indexButton && !indexButton.dataset.apiBound){
    indexButton.dataset.apiBound="1";
    indexButton.addEventListener("click",async function(){
      const original=indexButton.textContent;
      indexButton.disabled=true; indexButton.textContent="Läser KPI…";
      try{
        const result=await window.LokalblickSourceService.importIndexSeries(state);
        state=ensureShape(result.data);
        await saveState();
        render();
      }catch(error){
        if(error && error.name==="AbortError"){indexButton.disabled=false;indexButton.textContent=original;return;}
        indexButton.disabled=false;indexButton.textContent=original;
        alert(error.message||String(error));
      }
    });
  }

  const reconnect=document.querySelector("[data-api-reconnect]");
  if (reconnect && !reconnect.dataset.apiBound) {
    reconnect.dataset.apiBound="1";
    reconnect.addEventListener("click",async function(){
      try {
        const data=await window.LokalblickSourceService.reconnect();
        state=ensureShape(await enrichConnectedData(data));
        render();
      }
      catch(error){ alert(error.message || String(error)); }
    });
  }
  const refresh=document.querySelector("[data-api-refresh]");
  if (refresh && !refresh.dataset.apiBound) {
    refresh.dataset.apiBound="1";
    refresh.addEventListener("click",async function(){
      try {
        const data=await window.LokalblickSourceService.reconnect();
        state=ensureShape(await enrichConnectedData(data));
        render();
      }
      catch(error){ alert(error.message || String(error)); }
    });
  }
  const mode=document.querySelector("[data-api-mode]");
  if (mode && !mode.dataset.apiBound) {
    mode.dataset.apiBound="1";
    mode.addEventListener("click",async function(){
      try { await window.LokalblickSourceService.setMode(mode.dataset.apiMode); render(); }
      catch(error){ alert(error.message || String(error)); }
    });
  }
  const write=document.querySelector("[data-api-write]");
  if (write && !write.dataset.apiBound) {
    write.dataset.apiBound="1";
    write.addEventListener("click",async function(){
      try { await window.LokalblickSourceService.write(); render(); }
      catch(error){
        if (error && error.name==="AbortError") return;
        if (error && (error.code==="LOKALBLICK_RESELECT_WRITE" || error.code==="LOKALBLICK_FILE_LOCKED")) {
          render();
          alert(error.message);
          return;
        }
        alert(error.message || String(error));
      }
    });
  }
  const disconnect=document.querySelector("[data-api-disconnect]");
  if (disconnect && !disconnect.dataset.apiBound) {
    disconnect.dataset.apiBound="1";
    disconnect.addEventListener("click",async function(){
      try {
        state=ensureShape(await window.LokalblickSourceService.disconnect());
        currentView="api";
        render();
      } catch(error){ alert(error.message || String(error)); }
    });
  }
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
  return '<div class="section-stack unified-organisation">' +
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
    button.addEventListener("click", function() { if (!canEdit()) { alert("Slå på Redigera för att ändra data."); return; } openEditor(button.dataset.add, ""); });
  });
}
function bindEditButtons() {
  document.querySelectorAll("[data-edit-type][data-edit-id]:not([data-edit-bound])").forEach(function(button) {
    button.dataset.editBound = "1";
    button.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      if (!canEdit()) { alert("Slå på Redigera för att ändra data."); return; }
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
        if (currentView === "properties") filterPropertyPortfolio(); else render();
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
      if (currentView === "properties") filterPropertyPortfolio(); else render();
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
      if (currentView === "properties") filterPropertyPortfolio(); else render();
    });
  });
}

function bindMobilePlanningControls() {
  document.querySelectorAll("[data-plan-show-unassigned]:not([data-plan-bound])").forEach(function(summary){
    summary.dataset.planBound="1";
    summary.addEventListener("click",function(event){
      if (event.target.closest(".plan-unassigned-list")) return;
      portfolioFilters.ourPerson="__unassigned";
      const control=document.getElementById("filter-our-person");
      if(control) control.value="__unassigned";
      filterPropertyPortfolio();
    });
  });


  document.querySelectorAll("[data-plan-responsible]:not([data-plan-bound])").forEach(function(select){
    select.dataset.planBound="1";
    select.addEventListener("change",async function(){
      const type=select.dataset.planResponsible;
      const id=select.dataset.planId;
      const personId=select.value||"";
      syncResponsibleAssignment(type,id,personId,"");
      if(type==="maintenanceStatus") {
        const x=state.maintenanceStatus.find(function(r){return r.id===id;});
        if(x) x.responsiblePersonId=personId;
      } else if(type==="driftIssue") {
        const x=state.driftIssues.find(function(r){return r.id===id;});
        if(x) x.responsiblePersonId=personId;
      } else if(type==="wish") {
        const x=state.wishes.find(function(r){return r.id===id;});
        if(x) x.responsiblePersonId=personId;
      }
      await saveState();
      filterPropertyPortfolio();
    });
  });

  document.querySelectorAll("[data-plan-year]:not([data-plan-bound])").forEach(function(select){
    select.dataset.planBound="1";
    select.addEventListener("change",async function(){
      const type=select.dataset.planYear, id=select.dataset.planId;
      const item=planningSource(type,id);
      if(!item) return;
      const value=Number(select.value)||null;
      if(type==="maintenanceStatus") item.budgetYear=value;
      else item.year=value;
      await saveState();
      filterPropertyPortfolio();
    });
  });

  document.querySelectorAll("[data-plan-quarter]:not([data-plan-bound])").forEach(function(select){
    select.dataset.planBound="1";
    select.addEventListener("change",async function(){
      const type=select.dataset.planQuarter, id=select.dataset.planId;
      const item=planningSource(type,id);
      if(!item) return;
      item.planningQuarter=Number(select.value)||null;
      item.planningMonth=null;
      await saveState();
      filterPropertyPortfolio();
    });
  });

  document.querySelectorAll("[data-plan-date]:not([data-plan-bound])").forEach(function(input){
    input.dataset.planBound="1";
    input.addEventListener("change",async function(){
      const item=state.driftIssues.find(function(x){return x.id===input.dataset.planId;});
      if(!item) return;
      item.targetDate=input.value||"";
      if(input.value && !item.budgetYear) item.budgetYear=Number(input.value.slice(0,4))||null;
      await saveState();
      filterPropertyPortfolio();
    });
  });

  document.querySelectorAll("[data-plan-wish-move]:not([data-plan-bound])").forEach(function(button){
    button.dataset.planBound="1";
    button.addEventListener("click",async function(){
      const wish=state.wishes.find(function(x){return x.id===button.dataset.planId;});
      if(!wish) return;
      const today=new Date().toISOString().slice(0,10);
      const personId=activeResponsibleId("wish",wish.id,wish.responsiblePersonId||"");
      if(button.dataset.planWishMove==="maintenance") {
        const target={
          id:nextId("UH",state.maintenance),
          title:wish.title||wish.category||"Önskemål",
          contractId:wish.contractId||"",
          propertyId:wish.propertyId||"",
          year:Number(wish.budgetYear)||new Date().getFullYear()+1,
          priority:"Medel",
          status:"Identifierad",
          cost:Number(wish.estimatedCost)||0,
          planningQuarter:null,
          planningMonth:null
        };
        state.maintenance.push(target);
        if(personId) syncResponsibleAssignment("maintenance",target.id,personId,today);
      } else {
        const target={
          id:nextId("DI",state.driftIssues),
          contractId:wish.contractId||"",
          propertyId:wish.propertyId||"",
          category:DRIFT_ISSUE_CATEGORIES.includes(wish.category)?wish.category:"Övrigt",
          title:wish.title||wish.category||"Önskemål",
          description:wish.description||"",
          createdDate:today,
          targetDate:wish.targetDate||"",
          decisionDate:"",
          completedDate:"",
          status:"Nytt",
          priority:"Medel",
          responsiblePersonId:personId,
          budgetYear:Number(wish.budgetYear)||null,
          estimatedCost:Number(wish.estimatedCost)||0,
          finalCost:0,
          includeInBudget:wish.includeInBudget||"Nej",
          planningQuarter:null,
          planningMonth:null
        };
        state.driftIssues.push(target);
        if(personId) syncResponsibleAssignment("driftIssue",target.id,personId,today);
      }
      wish.status="Klart";
      wish.completedDate=today;
      await saveState();
      filterPropertyPortfolio();
    });
  });
}
function bindViewEvents() {
  bindBudgetFollowup();
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
  document.querySelectorAll("[data-source-save]:not([data-source-save-bound])").forEach(function(button) {
    button.dataset.sourceSaveBound="1";
    button.addEventListener("click", async function() {
      if (!window.LokalblickSourceService) return;
      const original=button.textContent;
      button.disabled=true;
      button.textContent="Sparar…";
      try {
        let status=window.LokalblickSourceService.status();
        if (status.mode !== "readwrite") {
          await window.LokalblickSourceService.setMode("readwrite");
        }
        await window.LokalblickSourceService.write();
        render();
      } catch (error) {
        if (error && error.name==="AbortError") {
          button.disabled=false;
          button.textContent=original;
          return;
        }
        if (error && (error.code==="LOKALBLICK_RESELECT_WRITE" || error.code==="LOKALBLICK_FILE_LOCKED")) {
          render();
          alert(error.message);
          return;
        }
        button.disabled=false;
        button.textContent=original;
        alert(error && error.message ? error.message : String(error));
      }
    });
  });
  bindAddButtons();
  bindEditButtons();
  bindAccessModeControls();
  document.querySelectorAll("[data-history-type][data-history-id]:not([data-history-bound])").forEach(function(button){
    button.dataset.historyBound="1";
    button.addEventListener("click",function(event){event.preventDefault();event.stopPropagation();showHistory(button.dataset.historyType,button.dataset.historyId);});
  });
  if (currentView === "api") bindApiControls();
  ["portfolio-search", "filter-customer", "filter-unit", "filter-owner", "filter-our-person", "filter-tenant-person", "filter-owner-person"].forEach(function(id) {
    const control = document.getElementById(id);
    if (!control) return;
    control.addEventListener(id === "portfolio-search" ? "input" : "change", function(){
      if (currentView === "properties") {
        filterPropertyPortfolio();
      } else if (currentView === "map" && id === "portfolio-search") {
        portfolioFilters.q=String(control.value||"").trim().toLowerCase();
        if (window.LokalblickMapService) initPropertyMap();
      } else if (currentView === "budget" && id === "portfolio-search") {
        portfolioFilters.q=String(control.value||"").trim().toLowerCase();
        clearTimeout(window.__lokalblickBudgetSearchTimer);
        window.__lokalblickBudgetSearchTimer=setTimeout(function(){ render(); },220);
      } else {
        syncPortfolioFiltersFromControls();
        render();
      }
    });
  });
  const reset = document.getElementById("portfolio-filter-reset");
  if (reset) reset.addEventListener("click", function() {
    ["portfolio-search", "filter-customer", "filter-unit", "filter-owner", "filter-our-person", "filter-tenant-person", "filter-owner-person"].forEach(function(id) {
      const control = document.getElementById(id);
      if (control) control.value = "";
    });
    clearPortfolioFilters();
    portfolioExplorer = { propertyId: "", contractId: "", section: "overview" };
    if (currentView === "properties") filterPropertyPortfolio(); else render();
  });
  bindPortfolioSectionControls();
  bindPortfolioExplorerControls();
  bindMobileScopeFilterControls();
  applyPortfolioSectionVisibility();
  if (currentView === "properties") filterPropertyPortfolio();
  document.querySelectorAll("[data-budget-toggle]:not([data-budget-bound])").forEach(function(button){button.dataset.budgetBound="1";button.addEventListener("click",async function(){if(!canEdit()){alert("Slå på Redigera för att ändra budgetunderlaget.");return;}const type=button.dataset.budgetSourceType,id=button.dataset.budgetSourceId,collection=auditCollectionForType(type),item=(state[collection]||[]).find(function(x){return String(x.id)===String(id);});if(!item)return;const include=button.dataset.budgetToggle==="include";item.budgetIncluded=include;if(Object.prototype.hasOwnProperty.call(item,"includeInBudget"))item.includeInBudget=include?"Ja":"Nej";const plan=budgetPlan(selectedBudgetYear);if(plan&&plan.status!=="Låst"&&Array.isArray(plan.lines))plan.lines.forEach(function(line){if(line.sourceType===type&&String(line.sourceId)===String(id))line.included=include;});await saveState();render();});});
  ["budget-year","mobile-budget-year"].forEach(function(id){
    const by = document.getElementById(id);
    if (by) by.addEventListener("change", function() { selectedBudgetYear = Number(by.value); render(); });
  });

  ["budget-create","mobile-budget-create"].forEach(function(id){
    const createBudget = document.getElementById(id);
    if (!createBudget) return;
    createBudget.addEventListener("click", async function() {
    if (!canEdit() || hasPortfolioScope() || budgetPlan(selectedBudgetYear)) return;
    const rows = budgetRows(selectedBudgetYear).map(function(row){return Object.assign({},row);});
    const summary = summarizeBudgetRows(rows);
    const targets = {};
    summary.forEach(function(row){targets[row.category]=row.amount;});
    state.budgetPlans = state.budgetPlans || [];
    state.budgetPlans.push({year:selectedBudgetYear,status:"Arbetsbudget",createdAt:new Date().toISOString().slice(0,10),lockedAt:"",preliminaryIndex:0,lines:rows,targets:targets,notes:{}});
    await saveState();
    render();
    });
  });

  document.querySelectorAll("[data-budget-preliminary-index]").forEach(function(input) {
    input.addEventListener("change", async function() {
      const plan=budgetPlan(selectedBudgetYear);
      if(!canEdit() || !plan || plan.status==="Låst") return;
      plan.preliminaryIndex=Number(input.value)||0;
      await saveState();
      render();
    });
  });

  document.querySelectorAll("[data-budget-adjustment]").forEach(function(input) {
    input.addEventListener("change", async function() {
      const plan = budgetPlan(selectedBudgetYear);
      if (!canEdit() || !plan || plan.status==="Låst") return;
      const category = input.dataset.budgetAdjustment;
      const base = summarizeBudgetRows(plan.lines || []).find(function(x){return x.category===category;});
      plan.targets = plan.targets || {};
      plan.targets[category] = (base ? base.amount : 0) + (Number(input.value)||0);
      await saveState();
      render();
    });
  });

  ["budget-lock","mobile-budget-lock"].forEach(function(id){
    const lockBudget = document.getElementById(id);
    if (!lockBudget) return;
    lockBudget.addEventListener("click", async function() {
      if (hasPortfolioScope()) return;
      const plan = budgetPlan(selectedBudgetYear);
      if (!canEdit() || !plan || plan.status==="Låst") return;
      if (!confirm("Lås budget " + selectedBudgetYear + "? Budgeten blir baslinje för prognos och uppföljning.")) return;
      plan.status = "Låst";
      plan.lockedAt = new Date().toISOString();
      plan.lockedBy = currentActorLabel();
      await saveState();
      render();
    });
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
  if (filters.ourPerson && filters.ourPerson !== "__unassigned" && !contractPartyPeople(c, "our").some(function(p) { return p.id === filters.ourPerson; })) return false;
  if (filters.ourPerson === "__unassigned" && contractPartyPeople(c, "our").length) return false;
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
  const tableFilterSections = ["overview","contracts","project","maintenance","drift","wish"];
  const overview = document.getElementById("overview-panel");
  const properties = document.getElementById("properties-panel");
  const contracts = document.getElementById("contracts-panel");
  const activity = document.getElementById("activity-panel");

  if (overview) overview.hidden = !tableFilterSections.includes(section);
  if (properties) properties.hidden = section !== "properties";
  if (contracts) contracts.hidden = true;
  if (activity) activity.hidden = !["activities","investigation","operations"].includes(section);

  const mobileOverview = document.getElementById("mobile-overview-panel");
  const mobileProperties = document.getElementById("mobile-properties-panel");
  const mobileContracts = document.getElementById("mobile-contracts-panel");
  const mobileActivity = document.getElementById("mobile-activity-panel");
  if (mobileOverview) mobileOverview.hidden = section !== "overview";
  if (mobileProperties) mobileProperties.hidden = section !== "properties";
  if (mobileContracts) mobileContracts.hidden = section !== "contracts";
  if (mobileActivity) mobileActivity.hidden = !(section === "activities" || activitySections().includes(section));
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
  if (overview) overview.innerHTML = portfolioTableViewHtml(contracts);

  const propertyContext = document.getElementById("property-persistent-context");
  if (propertyContext) propertyContext.innerHTML = propertyPersistentContextHtml(contracts);
  const mobilePropertyContext = document.getElementById("mobile-property-persistent-context");
  if (mobilePropertyContext) mobilePropertyContext.innerHTML = portfolioExplorer.propertyId ? mobilePropertyHeroHtml(contracts) : "";

  const tabs = document.getElementById("portfolio-content-tabs");
  if (tabs) {
    tabs.innerHTML = portfolioContentTabsHtml(contracts);
    bindPortfolioSectionControls();
  }

  const properties = document.getElementById("portfolio-properties-content");
  if (properties) properties.innerHTML = mobilePropertyCardsHtml(contracts);

  const agreements = document.getElementById("portfolio-contracts-content");
  if (agreements) agreements.innerHTML = scopeContractsSectionHtml(contracts);

  const activity = document.getElementById("portfolio-activity-content");
  if (activity) {
    activity.innerHTML = portfolioExplorer.section === "activities"
      ? mobilePlanningBoardHtml(contracts)
      : activitySections().includes(portfolioExplorer.section)
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
      ? mobilePlanningBoardHtml(contracts)
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
  bindMobilePlanningControls();
  applyPortfolioSectionVisibility();
}
function filterPropertyPortfolio() {
  const filters = portfolioFilterValues();
  const contractFilters = Object.assign({},filters);
  if (portfolioExplorer.section === "activities") contractFilters.ourPerson = "";
  const matchedContracts = state.contracts.filter(function(c) { return contractMatchesPortfolio(c, contractFilters); });
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
    ["annualAdditions", "Tillägg per år", "number", "0", false],
    ["annualContractDrift", "Media per år", "number", "0", false],
    ["annualPropertyTax", "F-skatt per år", "number", "0", false],
    ["baseRent", "Grundhyra", "number", "0", false],
    ["rentBaseYear", "Hyra basår", "number", "0", false],
    ["rentBaseIndex", "Hyra bastal", "number", "0", false],
    ["rentIndexPercent", "Hyra indexandel (0–1)", "number", "0", false],
    ["baseAdditions", "Grundtillägg", "number", "0", false],
    ["additionBaseYear", "Tillägg basår", "number", "0", false],
    ["additionBaseIndex", "Tillägg bastal", "number", "0", false],
    ["additionIndexPercent", "Tillägg indexandel (0–1)", "number", "0", false],
    ["noticePeriodMonths", "Uppsägningstid månader", "number", "0", false],
    ["renewalPeriodMonths", "Förlängningstid månader", "number", "0", false],
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
    ["targetType", "Typ", "select", "property|object|project|maintenance|driftIssue|wish|maintenanceStatus", true],
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
  if (!canEdit()) return;
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

  if (type === "object" && existing) {
    const currentYear=new Date().getFullYear();
    const indexYear=currentYear-1;
    const knownIndex=indexSeriesValue(indexYear);
    const rentPct=(Number(existing.rentIndexPercent)||0)*100;
    const additionPct=(Number(existing.additionIndexPercent)||0)*100;
    const unitValue=existing.unitId||"";
    const contractLabel=(existing.number||existing.id)+" · "+propertyName(existing.propertyId);
    const yn=function(name,label){
      const value=String(existing[name]||"");
      return '<label><span>'+label+'</span><select name="'+name+'"><option value="">–</option><option value="Ja"'+(value==="Ja"?' selected':'')+'>Ja</option><option value="Nej"'+(value==="Nej"?' selected':'')+'>Nej</option></select></label>';
    };
    document.getElementById("dialog-fields").innerHTML =
      '<div class="object-editor-shell object-editor-compact">' +
        '<div class="object-editor-top">' +
          '<input type="hidden" name="contractId" value="' + esc(existing.id) + '">' +
          '<div class="field"><label>Objekt / avtal</label><div class="object-editor-readonly object-editor-contract-id"><span>' + esc(contractLabel) + '</span>' +
            (existing.contractDocumentUrl ? '<button type="button" class="contract-document-button" data-contract-document-open="' + esc(existing.contractDocumentUrl) + '" title="' + esc(existing.contractDocumentName||"Öppna hyresavtal") + '">PDF ↗</button>' : '') +
          '</div></div>' +
          '<div class="field"><label>Verksamhetsområde</label><select name="unitId">' +
            '<option value="">–</option>' + ORG_UNITS.map(function(u){return '<option value="'+esc(u.id)+'"'+(u.id===unitValue?' selected':'')+'>'+esc(u.name)+'</option>';}).join('') +
          '</select></div>' +
          '<div class="field"><label>Verksamhet</label><input name="use" value="'+esc(existing.use||"")+'"></div>' +
          '<div class="field"><label>Avtalstyp</label><input name="category" value="'+esc(existing.category||"")+'"></div>' +
        '</div>' +

        '<div class="object-editor-main-grid">' +
          '<section class="index-editor-card" data-index-section="rent">' +
            '<div class="index-editor-head"><div><span>HYRA</span><h3>Årshyra</h3></div><span class="badge green">Beräknad</span></div>' +
            '<div class="index-input-grid compact">' +
              '<label><span>Grundhyra</span><input data-index-input name="baseRent" type="number" step="0.01" value="'+esc(existing.baseRent||0)+'"></label>' +
              '<label><span>Basår</span><input data-index-input name="rentBaseYear" type="number" step="1" value="'+esc(existing.rentBaseYear||"")+'"></label>' +
              '<label><span>Bastal</span><input data-index-input name="rentBaseIndex" type="number" step="0.01" value="'+esc(existing.rentBaseIndex||"")+'"></label>' +
              '<label><span>Index %</span><input data-index-input name="rentIndexPercentPct" type="number" step="0.01" value="'+esc(rentPct||"")+'"></label>' +
            '</div>' +
            '<div class="index-result-line">' +
              '<span>KPI okt '+indexYear+' <strong>'+(knownIndex?esc(new Intl.NumberFormat("sv-SE",{maximumFractionDigits:2}).format(knownIndex)):"saknas")+'</strong></span>' +
              '<span class="index-result-primary">Årshyra '+currentYear+' <strong data-index-result="rent">–</strong><small>Beräknad</small></span>' +
              '<span>Källa <strong>'+money(existing.annualRent||0)+'</strong></span>' +
            '</div>' +
          '</section>' +

          '<section class="index-editor-card" data-index-section="addition">' +
            '<div class="index-editor-head"><div><span>TILLÄGG</span><h3>Årligt tillägg</h3></div><span class="badge green">Beräknad</span></div>' +
            '<div class="index-input-grid compact">' +
              '<label><span>Grundtillägg</span><input data-index-input name="baseAdditions" type="number" step="0.01" value="'+esc(existing.baseAdditions||0)+'"></label>' +
              '<label><span>Basår</span><input data-index-input name="additionBaseYear" type="number" step="1" value="'+esc(existing.additionBaseYear||"")+'"></label>' +
              '<label><span>Bastal</span><input data-index-input name="additionBaseIndex" type="number" step="0.01" value="'+esc(existing.additionBaseIndex||"")+'"></label>' +
              '<label><span>Index %</span><input data-index-input name="additionIndexPercentPct" type="number" step="0.01" value="'+esc(additionPct||"")+'"></label>' +
            '</div>' +
            '<div class="index-result-line">' +
              '<span>KPI okt '+indexYear+' <strong>'+(knownIndex?esc(new Intl.NumberFormat("sv-SE",{maximumFractionDigits:2}).format(knownIndex)):"saknas")+'</strong></span>' +
              '<span class="index-result-primary">Tillägg '+currentYear+' <strong data-index-result="addition">–</strong><small>Beräknat</small></span>' +
              '<span>Källa <strong>'+money(existing.annualAdditions||0)+'</strong></span>' +
            '</div>' +
          '</section>' +

          '<section class="object-editor-secondary contract-terms-card">' +
            '<div class="object-editor-section-head"><span>AVTAL</span></div>' +
            '<div class="object-editor-fields compact-five">' +
              '<label><span>Area kvm</span><input name="area" type="number" step="0.01" value="'+esc(existing.area||0)+'"></label>' +
              '<label><span>Fr.o.m.</span><input name="start" type="date" value="'+esc(existing.start||"")+'"></label>' +
              '<label><span>T.o.m.</span><input name="end" type="date" value="'+esc(existing.end||"")+'"></label>' +
              '<label><span>Sägs upp senast</span><input name="notice" type="date" value="'+esc(existing.notice||"")+'"></label>' +
              '<label><span>Uppsägning mån</span><input name="noticePeriodMonths" type="number" step="1" value="'+esc(existing.noticePeriodMonths||0)+'"></label>' +
              '<label><span>Förlängning mån</span><input name="renewalPeriodMonths" type="number" step="1" value="'+esc(existing.renewalPeriodMonths||0)+'"></label>' +
              '<label><span>Ursprunglig avtalstid</span><input name="originalTerm" value="'+esc(existing.originalTerm||"")+'"></label>' +
              '<label><span>Media/år</span><input name="annualContractDrift" type="number" step="1" value="'+esc(existing.annualContractDrift||0)+'"></label>' +
              '<label><span>F-skatt/år</span><input name="annualPropertyTax" type="number" step="1" value="'+esc(existing.annualPropertyTax||0)+'"></label>' +
              '<label><span>kr/kvm</span><div class="calculated-field">'+num((Number(existing.area)||0)?contractAnnualValues(existing,currentYear,0).rent.amount/Number(existing.area):0)+' <small>Beräknad</small></div></label>' +
            '</div>' +
          '</section>' +

          '<section class="object-editor-secondary source-fields-card">' +
            '<div class="object-editor-section-head"><span>KÄLLA & EKONOMI</span></div>' +
            '<div class="object-editor-fields compact-five">' +
              '<label><span>Kstl drift</span><input name="costCenterOperations" value="'+esc(existing.costCenterOperations||"")+'"></label>' +
              '<label><span>Kstl lokaler</span><input name="costCenterPremises" value="'+esc(existing.costCenterPremises||"")+'"></label>' +
              '<label><span>Objekt i Ekot</span><input name="ekotObject" value="'+esc(existing.ekotObject||"")+'"></label>' +
              '<label><span>Anställda</span><input name="employees" type="number" step="1" value="'+esc(existing.employees||0)+'"></label>' +
              '<label><span>Brukare</span><input name="users" type="number" step="1" value="'+esc(existing.users||0)+'"></label>' +
              '<label><span>Rum</span><input name="rooms" type="number" step="1" value="'+esc(existing.rooms||0)+'"></label>' +
              '<label><span>Allmän yta</span><input name="commonArea" type="number" step="0.01" value="'+esc(existing.commonArea||0)+'"></label>' +
              '<label><span>Lägenhetsyta</span><input name="apartmentArea" type="number" step="0.01" value="'+esc(existing.apartmentArea||0)+'"></label>' +
              '<label class="field-span-2"><span>Kommentar</span><input name="comment" value="'+esc(existing.comment||"")+'"></label>' +
            '</div>' +
          '</section>' +

          '<section class="object-editor-secondary media-card">' +
            '<div class="object-editor-section-head"><span>MEDIA INGÅR</span></div>' +
            '<div class="object-editor-fields compact-eight">' +
              yn("mediaWaste","Sopor") + yn("mediaElectricity","El") + yn("mediaWater","VA") + yn("mediaHeating","Värme") +
              yn("mediaHotWater","VV") + yn("mediaVentilation","Vent") + yn("mediaOutdoor","Utem.") + yn("mediaPropertyTax","F-skatt") +
            '</div>' +
          '</section>' +
        '</div>' +
      '</div>';

    function refreshIndexPreview(){
      const root=document.getElementById("dialog-fields");
      function n(name){const el=root.querySelector('[name="'+name+'"]');return Number(el&&el.value)||0;}
      const rent=calculateIndexedAmount(n("baseRent"),n("rentBaseIndex"),n("rentIndexPercentPct")/100,knownIndex);
      const addition=calculateIndexedAmount(n("baseAdditions"),n("additionBaseIndex"),n("additionIndexPercentPct")/100,knownIndex);
      const rentOut=root.querySelector('[data-index-result="rent"]');
      const additionOut=root.querySelector('[data-index-result="addition"]');
      if(rentOut) rentOut.textContent=rent?money(rent):"Kan inte beräknas";
      if(additionOut) additionOut.textContent=addition?money(addition):(n("baseAdditions")?"Kan inte beräknas":"–");
    }
    document.querySelectorAll("#dialog-fields [data-index-input]").forEach(function(input){input.addEventListener("input",refreshIndexPreview);});
    refreshIndexPreview();
  } else {
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
  
  }
  const editorDialog=document.getElementById("editor-dialog");
  editorDialog.classList.toggle("contract-editor",type==="object"&&Boolean(existing));
  editorDialog.showModal();
}
function nextId(prefix, list) {
  const max = Math.max.apply(null, [0].concat(list.map(function(x) { return Number(String(x.id).replace(/\D/g, "")) || 0; })));
  return prefix + (max + 1);
}
function currentActorLabel() {
  if (state.currentUser && state.currentUser.name) return state.currentUser.name;
  if (state.currentUser && state.currentUser.email) return state.currentUser.email;
  return state.isDemo ? "Demoanvändare" : "Okänd användare";
}
function logAssignmentChange(targetType,targetId,fromPersonId,toPersonId) {
  if ((fromPersonId||"") === (toPersonId||"")) return;
  state.assignmentChanges = state.assignmentChanges || [];
  state.assignmentChanges.push({
    id: nextId("AL", state.assignmentChanges),
    targetType: targetType,
    targetId: targetId,
    fromPersonId: fromPersonId || "",
    toPersonId: toPersonId || "",
    changedAt: new Date().toISOString(),
    changedBy: currentActorLabel()
  });
}
function syncResponsibleAssignment(targetType, targetId, personId, fromDate) {
  const today = new Date().toISOString().slice(0,10);
  const active = state.assignments.filter(function(a) {
    return a.targetType === targetType && a.targetId === targetId && !a.toDate;
  });
  const current = active.find(function(a){return a.role==="Ansvarig";}) || active[0] || null;
  const previousPersonId = current ? current.personId : "";
  const same = active.find(function(a) { return a.personId === personId; });

  if ((previousPersonId||"") === (personId||"")) return;

  active.forEach(function(a) {
    a.toDate = today;
  });

  if (personId) {
    const existingClosed = same && same.toDate;
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
  logAssignmentChange(targetType,targetId,previousPersonId,personId||"");
}
async function saveEditor(form) {
  if (!canEdit()) return false;
  const data = Object.fromEntries(new FormData(form).entries());
  const existing = editorRecord && editorRecord.type === editorType ? editorRecord.record : null;

  if (editorType === "object") {
    const c = state.contracts.find(function(x) { return x.id === data.contractId; });
    if (!c) return false;
    ["annualContractDrift","annualPropertyTax","baseRent","rentBaseYear","rentBaseIndex","baseAdditions","additionBaseYear","additionBaseIndex","area","noticePeriodMonths","renewalPeriodMonths","employees","users","rooms","commonArea","apartmentArea"].forEach(function(k) {
      if(Object.prototype.hasOwnProperty.call(data,k)) c[k] = Number(data[k]) || 0;
    });
    if(Object.prototype.hasOwnProperty.call(data,"rentIndexPercentPct")) c.rentIndexPercent=(Number(data.rentIndexPercentPct)||0)/100;
    else if(Object.prototype.hasOwnProperty.call(data,"rentIndexPercent")) c.rentIndexPercent=Number(data.rentIndexPercent)||0;
    if(Object.prototype.hasOwnProperty.call(data,"additionIndexPercentPct")) c.additionIndexPercent=(Number(data.additionIndexPercentPct)||0)/100;
    else if(Object.prototype.hasOwnProperty.call(data,"additionIndexPercent")) c.additionIndexPercent=Number(data.additionIndexPercent)||0;
    const live=contractAnnualValues(c,new Date().getFullYear(),0);
    if(live.rent.calculated){
      c.calculatedAnnualRent=Math.round(live.rent.amount);
      c.rentIndexCurrent=live.rent.usedIndex;
      c.rentIndexYear=live.rent.indexYear;
      c.rentCalculationYear=new Date().getFullYear();
    }
    if(live.addition.calculated){
      c.calculatedAnnualAdditions=Math.round(live.addition.amount);
      c.additionIndexCurrent=live.addition.usedIndex;
      c.additionIndexYear=live.addition.indexYear;
      c.additionCalculationYear=new Date().getFullYear();
    }
    ["use","category","start","end","notice","originalTerm","costCenterOperations","costCenterPremises","ekotObject","comment","mediaWaste","mediaElectricity","mediaWater","mediaHeating","mediaHotWater","mediaVentilation","mediaOutdoor","mediaPropertyTax"].forEach(function(k){
      if(Object.prototype.hasOwnProperty.call(data,k)) c[k]=data[k]||"";
    });
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
    await window.LokalblickViewBridge?.clear();
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

async function restoreSharedViewState() {
  const bridge = window.LokalblickViewBridge;
  if (!bridge) return false;
  const saved = await bridge.load();
  if (!saved || !saved.data) return false;
  const source = window.LokalblickSourceService;
  if (source && source.status().connected && source.adoptViewState) {
    source.adoptViewState(saved.data);
    return true;
  }
  const mode = window.LokalblickDataService && window.LokalblickDataService.mode || "";
  if (!["company-api", "m365-api", "local-excel"].includes(mode)) {
    bridge.activate();
    return true;
  }
  return false;
}

document.addEventListener("click", function(event) {
  const link = event.target.closest("a[data-ui-version]");
  if (!link || !state) return;
  event.preventDefault();
  (async function() {
    switchingView = true;
    await window.LokalblickViewBridge?.save(state, {
      from: "v1",
      sourceMode: window.LokalblickDataService?.mode || "",
    });
    location.href = link.href;
  })();
});

async function init() {
  const mode = window.LokalblickDataService && window.LokalblickDataService.mode || "";
  const external = ["company-api", "m365-api"].includes(mode);
  if (window.LokalblickSourceService && !external) {
    if (window.LokalblickSourceService.resumeRemembered)
      await window.LokalblickSourceService.resumeRemembered();
    else
      await window.LokalblickSourceService.restoreRemembered();
  }
  await restoreSharedViewState();
  await loadState();
  render();
}

init();