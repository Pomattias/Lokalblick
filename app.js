const STORAGE_KEY = "lokalblick-v1";

const demo = {
  isDemo: true,
  sourceName: "Demodata",
  properties: [
    { id:"DEMO-101", type:"Intern", address:"Hamnvägen 12", designation:"Hamnen 4", owner:"Stadsfastigheter", manager:"A. Förvaltare" },
    { id:"DEMO-102", type:"Intern", address:"Parkgatan 8", designation:"Parken 2", owner:"Stadsfastigheter", manager:"B. Förvaltare" },
    { id:"DEMO-201", type:"Extern", address:"Storgatan 20", designation:"Centrum 5", owner:"Fastighetsbolaget AB", manager:"C. Handläggare" },
    { id:"DEMO-202", type:"Extern", address:"Kungsgatan 13", designation:"Karin 11", owner:"Externa Hus AB", manager:"C. Handläggare" },
    { id:"DEMO-301", type:"Intern", address:"Västanväg 119", designation:"Gräset 2", owner:"Stadsfastigheter", manager:"D. Förvaltare" },
    { id:"DEMO-302", type:"Extern", address:"Formgatan 15", designation:"Konstgjutaren 2", owner:"Externa Hus AB", manager:"E. Handläggare" }
  ],
  contracts: [
    { id:"SF|DEMO-101-1", propertyId:"DEMO-101", number:"SF-DEMO-101-1", source:"SF", area:1348, category:"ÄBO Äldreboende", use:"VÅRDBO", end:"2028-12-31", notice:"2027-12-31" },
    { id:"SF|DEMO-102-1", propertyId:"DEMO-102", number:"SF-DEMO-102-1", source:"SF", area:2281, category:"ÄBO Äldreboende", use:"VÅRDBO", end:"2027-12-31", notice:"2026-12-31" },
    { id:"EXT|DEMO-201-1", propertyId:"DEMO-201", number:"5307-10030", source:"EXT", area:8224, category:"KP Kontor", use:"ORDBO", end:"2030-11-30", notice:"2029-11-30" },
    { id:"EXT|DEMO-202-1", propertyId:"DEMO-202", number:"5280-10001-1", source:"EXT", area:5369, category:"KP Kontor", use:"ORDBO", end:"2027-11-30", notice:"2026-11-30" },
    { id:"SF|DEMO-301-1", propertyId:"DEMO-301", number:"SF-DEMO-301-1", source:"SF", area:1714, category:"DV Daglig verksamhet", use:"HoF", end:"2028-12-31", notice:"2027-12-31" },
    { id:"EXT|DEMO-302-1", propertyId:"DEMO-302", number:"1221-20001-02", source:"EXT", area:4882, category:"GH Gruppboende", use:"VÅRDBO", end:"2042-10-31", notice:"2041-10-31" }
  ],
  people: [
    { id:"P1", name:"Anna Lind", team:"Lokaler", role:"Projektledare" },
    { id:"P2", name:"Johan Ek", team:"Lokaler", role:"Fastighetsansvarig" },
    { id:"P3", name:"Maria Holm", team:"Utveckling", role:"Projektledare" },
    { id:"P4", name:"Peter Borg", team:"Drift", role:"Samordnare" }
  ],
  projects: [
    { id:"PR1", propertyId:"DEMO-101", name:"Ventilationsåtgärder", status:"Pågår", phase:"Genomförande", budget:3200000 },
    { id:"PR2", propertyId:"DEMO-202", name:"Ombyggnad arbetsplatser", status:"Planerad", phase:"Förstudie", budget:1800000 },
    { id:"PR3", propertyId:"DEMO-301", name:"Tillgänglighetsanpassning", status:"Pågår", phase:"Projektering", budget:950000 }
  ],
  maintenance: [
    { id:"UH1", propertyId:"DEMO-101", title:"Tak", year:2028, cost:4500000, priority:"Hög", status:"Planerad" },
    { id:"UH2", propertyId:"DEMO-301", title:"Ytskikt", year:2027, cost:650000, priority:"Medel", status:"Identifierad" },
    { id:"UH3", propertyId:"DEMO-202", title:"Fasad", year:2029, cost:1800000, priority:"Medel", status:"Identifierad" }
  ],
  operations: [
    { id:"D1", propertyId:"DEMO-101", period:"2026", category:"Energi", cost:610000 },
    { id:"D2", propertyId:"DEMO-202", period:"2026", category:"Energi", cost:420000 },
    { id:"D3", propertyId:"DEMO-301", period:"2026", category:"Service", cost:290000 }
  ],
  assignments: [
    { id:"A1", personId:"P1", targetType:"project", targetId:"PR1", role:"Projektledare", allocation:35 },
    { id:"A2", personId:"P1", targetType:"project", targetId:"PR2", role:"Projektledare", allocation:30 },
    { id:"A3", personId:"P2", targetType:"property", targetId:"DEMO-101", role:"Fastighetsansvarig", allocation:30 },
    { id:"A4", personId:"P2", targetType:"property", targetId:"DEMO-102", role:"Fastighetsansvarig", allocation:30 },
    { id:"A5", personId:"P2", targetType:"property", targetId:"DEMO-301", role:"Fastighetsansvarig", allocation:30 },
    { id:"A6", personId:"P3", targetType:"project", targetId:"PR3", role:"Projektledare", allocation:55 },
    { id:"A7", personId:"P3", targetType:"project", targetId:"PR1", role:"Deltagare", allocation:30 },
    { id:"A8", personId:"P4", targetType:"property", targetId:"DEMO-202", role:"Driftsamordnare", allocation:45 }
  ]
};

const views = [
  { id:"dashboard", label:"Översikt", icon:"◫", eyebrow:"PORTFÖLJ" },
  { id:"properties", label:"Fastigheter", icon:"▦", eyebrow:"LEB · FASTIGHET" },
  { id:"contracts", label:"Avtal", icon:"≣", eyebrow:"LEB · AVTAL" },
  { id:"portfolio", label:"Projekt & UH", icon:"◇", eyebrow:"PORTFÖLJ" },
  { id:"organisation", label:"Organisation", icon:"◎", eyebrow:"RESURSER" }
];

let state = loadState();
let currentView = "dashboard";

function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : clone(demo);
  } catch { return clone(demo); }
}
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function money(n){ return new Intl.NumberFormat("sv-SE", { maximumFractionDigits:0 }).format(Number(n)||0) + " kr"; }
function num(n){ return new Intl.NumberFormat("sv-SE", { maximumFractionDigits:0 }).format(Number(n)||0); }
function esc(value){ return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
function propertyName(id){ const p = state.properties.find(x=>x.id===id); return p ? `${p.id} · ${p.address || "Adress saknas"}` : id; }
function projectName(id){ return state.projects.find(x=>x.id===id)?.name || id; }
function personLoad(personId){ return state.assignments.filter(a=>a.personId===personId).reduce((s,a)=>s+(Number(a.allocation)||0),0); }
function statusBadge(status){
  const s = String(status||"");
  const cls = /pågår|aktiv|klar/i.test(s) ? "green" : /risk|sen|hög/i.test(s) ? "red" : /plan|förstudie|identifierad/i.test(s) ? "amber" : "";
  return `<span class="badge ${cls}">${esc(s || "–")}</span>`;
}
function table(headers, rows){
  if (!rows.length) return `<div class="empty">Ingen data ännu.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function kpi(label, value, foot=""){
  return `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-foot">${foot}</div></div>`;
}
function card(title, subtitle, body, action=""){
  return `<section class="card pad"><div class="card-head"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:""}</div>${action}</div>${body}</section>`;
}

function renderNav(){
  document.getElementById("main-nav").innerHTML = views.map(v=>`<button class="nav-button ${v.id===currentView?"active":""}" data-view="${v.id}"><span class="nav-icon">${v.icon}</span><span>${v.label}</span></button>`).join("");
  document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{currentView=btn.dataset.view; render();}));
}
function render(){
  renderNav();
  const meta = views.find(v=>v.id===currentView);
  document.getElementById("page-title").textContent = meta.label;
  document.getElementById("page-eyebrow").textContent = meta.eyebrow;
  const banner = document.getElementById("mode-banner");
  banner.className = `mode-banner ${state.isDemo ? "demo" : "live"}`;
  banner.innerHTML = state.isDemo
    ? `<strong>Demoläge</strong><span>Importera en LEB-fil med flikarna SF och EXT för att ersätta demoobjekten.</span>`
    : `<strong>LEB-data aktiv</strong><span>${esc(state.sourceName || "Importerad fil")} · ${state.properties.length} fastigheter · ${state.contracts.length} avtal. Kompletteringar sparas lokalt i webbläsaren.</span>`;
  const content = document.getElementById("content");
  content.innerHTML = currentView === "dashboard" ? renderDashboard()
    : currentView === "properties" ? renderProperties()
    : currentView === "contracts" ? renderContracts()
    : currentView === "portfolio" ? renderPortfolio()
    : renderOrganisation();
  bindViewEvents();
}

function renderDashboard(){
  const totalArea = state.contracts.reduce((s,c)=>s+(Number(c.area)||0),0);
  const projectBudget = state.projects.reduce((s,p)=>s+(Number(p.budget)||0),0);
  const maintenanceCost = state.maintenance.reduce((s,u)=>s+(Number(u.cost)||0),0);
  const people = state.people.map(p=>({ ...p, load: personLoad(p.id) })).sort((a,b)=>b.load-a.load);
  const topProperties = state.properties.map(p=>({ ...p, area: state.contracts.filter(c=>c.propertyId===p.id).reduce((s,c)=>s+(Number(c.area)||0),0) })).sort((a,b)=>b.area-a.area).slice(0,8);
  const maxArea = Math.max(1, ...topProperties.map(p=>p.area));
  const barPeople = people.length ? people.map(p=>`<div class="bar-row"><div class="bar-label" title="${esc(p.name)}">${esc(p.name)}</div><div class="bar-track"><div class="bar-fill ${p.load>100?"over":""}" style="width:${Math.min(p.load,130)/1.3}%"></div></div><div class="bar-value">${p.load}%</div></div>`).join("") : `<div class="empty">Lägg till personer och tilldelningar.</div>`;
  const areaCols = topProperties.length ? `<div class="column-chart">${topProperties.map(p=>`<div class="column" title="${esc(propertyName(p.id))}: ${num(p.area)} kvm"><div class="column-fill" style="height:${Math.max(3,p.area/maxArea*175)}px"></div><div class="column-label">${esc(p.id)}</div></div>`).join("")}</div>` : `<div class="empty">Ingen area att visa.</div>`;
  const alerts = [
    ...people.filter(p=>p.load>100).map(p=>`${p.name} har ${p.load}% planerad belastning.`),
    ...state.projects.filter(p=>!state.assignments.some(a=>a.targetType==="project"&&a.targetId===p.id)).map(p=>`${p.name} saknar tilldelad person.`),
    ...state.maintenance.filter(u=>u.priority==="Hög").map(u=>`Högt UH-behov: ${u.title} på ${propertyName(u.propertyId)}.`)
  ];
  return `
    <div class="grid kpi-grid">
      ${kpi("Fastigheter", num(state.properties.length), "unika LEB-objekt")}
      ${kpi("Avtal", num(state.contracts.length), `${num(totalArea)} kvm avtalsarea`)}
      ${kpi("Aktiva projekt", num(state.projects.length), `${money(projectBudget)} budget`)}
      ${kpi("UH-behov", num(state.maintenance.length), `${money(maintenanceCost)} identifierat`)}
    </div>
    <div class="grid two-col" style="margin-top:16px">
      ${card("Arbetsfördelning", "Summerad tilldelning per person", `<div class="bar-list">${barPeople}</div>`, `<button class="button secondary" data-goto="organisation">Öppna organisation</button>`)}
      ${card("Att uppmärksamma", "Automatiska kontroller i aktuell data", alerts.length ? `<div class="section-stack">${alerts.map(a=>`<div class="notice">${esc(a)}</div>`).join("")}</div>` : `<div class="notice">Inga tydliga varningar i aktuell data.</div>`)}
    </div>
    <div style="margin-top:16px">${card("Största objekt efter avtalsarea", "Summerad area för alla avtal på respektive fastighet", areaCols)}</div>`;
}

function renderProperties(){
  const rows = state.properties.map(p=>{
    const cs = state.contracts.filter(c=>c.propertyId===p.id);
    const area = cs.reduce((s,c)=>s+(Number(c.area)||0),0);
    const projects = state.projects.filter(x=>x.propertyId===p.id).length;
    const uh = state.maintenance.filter(x=>x.propertyId===p.id).reduce((s,x)=>s+(Number(x.cost)||0),0);
    const assigned = state.assignments.filter(a=>a.targetType==="property"&&a.targetId===p.id).map(a=>state.people.find(x=>x.id===a.personId)?.name).filter(Boolean);
    return `<tr><td class="mono">${esc(p.id)}</td><td><strong>${esc(p.address||"Adress saknas")}</strong><div class="muted">${esc(p.designation||"")}</div></td><td>${statusBadge(p.type)}</td><td>${esc(p.owner||"–")}</td><td>${cs.length}</td><td>${num(area)} kvm</td><td>${projects}</td><td>${money(uh)}</td><td>${esc(assigned.join(", ")||"–")}</td></tr>`;
  });
  return card("Fastigheter", "En rad per LEB-objekt. Flera avtal summeras på samma fastighet.", `
    <div class="toolbar"><input class="search" id="property-search" placeholder="Sök objektsnummer, adress, ägare…"><select class="select" id="property-type"><option value="">Alla</option><option>Intern</option><option>Extern</option></select></div>
    <div id="property-table">${table(["Objekt","Adress / fastighetsbeteckning","Typ","Fastighetsägare","Avtal","Area","Projekt","UH","Ansvarig"], rows)}</div>`);
}

function renderContracts(){
  const rows = state.contracts.map(c=>`<tr><td class="mono">${esc(c.number||c.id)}</td><td class="mono">${esc(c.propertyId)}</td><td>${esc(propertyName(c.propertyId).split(" · ").slice(1).join(" · "))}</td><td>${statusBadge(c.source)}</td><td>${num(c.area)} kvm</td><td>${esc(c.category||"–")}</td><td>${esc(c.use||"–")}</td><td>${esc(c.notice||"–")}</td><td>${esc(c.end||"–")}</td></tr>`);
  return card("Avtal", "Ekonomisk ryggrad från SF och EXT.", `<div class="toolbar"><input class="search" id="contract-search" placeholder="Sök avtal, objekt, kategori…"></div><div id="contract-table">${table(["Avtalsnummer","Objekt","Adress","Källa","Area","Lokalkategori","Användning","Säg upp senast","Tom"],rows)}</div>`);
}

function renderPortfolio(){
  const projectRows = state.projects.map(p=>{
    const people = state.assignments.filter(a=>a.targetType==="project"&&a.targetId===p.id).map(a=>{const person=state.people.find(x=>x.id===a.personId);return person?`${person.name} (${a.role})`:""}).filter(Boolean).join(", ");
    return `<tr><td><strong>${esc(p.name)}</strong><div class="muted mono">${esc(p.id)}</div></td><td>${esc(propertyName(p.propertyId))}</td><td>${statusBadge(p.status)}</td><td>${esc(p.phase||"–")}</td><td>${money(p.budget)}</td><td>${esc(people||"Ej tilldelad")}</td></tr>`;
  });
  const uhRows = state.maintenance.map(u=>`<tr><td><strong>${esc(u.title)}</strong><div class="muted mono">${esc(u.id)}</div></td><td>${esc(propertyName(u.propertyId))}</td><td>${u.year||"–"}</td><td>${statusBadge(u.priority)}</td><td>${statusBadge(u.status)}</td><td>${money(u.cost)}</td></tr>`);
  const driftRows = state.operations.map(o=>`<tr><td>${esc(propertyName(o.propertyId))}</td><td>${esc(o.period)}</td><td>${esc(o.category)}</td><td>${money(o.cost)}</td></tr>`);
  return `<div class="section-stack">
    ${card("Projekt", "En fastighet kan ha flera projekt och varje projekt kan ha flera personer.", table(["Projekt","Fastighet","Status","Skede","Budget","Personer"],projectRows), `<button class="button primary" data-add="project">+ Projekt</button>`)}
    ${card("Underhåll", "Identifierade UH-behov som egna poster – inte kolumner på fastigheten.", table(["Åtgärd","Fastighet","Planår","Prioritet","Status","Kostnad"],uhRows), `<button class="button primary" data-add="maintenance">+ UH-behov</button>`)}
    ${card("Drift", "Periodiserade driftposter; skiljs från driftstillägg i avtalet.", table(["Fastighet","Period","Kostnadsslag","Kostnad"],driftRows), `<button class="button primary" data-add="operation">+ Driftpost</button>`)}
  </div>`;
}

function renderOrganisation(){
  const peopleRows = state.people.map(p=>{
    const ass = state.assignments.filter(a=>a.personId===p.id);
    const props = ass.filter(a=>a.targetType==="property").map(a=>propertyName(a.targetId));
    const projs = ass.filter(a=>a.targetType==="project").map(a=>projectName(a.targetId));
    const load = personLoad(p.id);
    return `<tr><td><strong>${esc(p.name)}</strong><div class="muted">${esc(p.role||"")}</div></td><td>${esc(p.team||"–")}</td><td>${esc(props.join(", ")||"–")}</td><td>${esc(projs.join(", ")||"–")}</td><td><div class="bar-track" style="min-width:120px"><div class="bar-fill ${load>100?"over":""}" style="width:${Math.min(load,130)/1.3}%"></div></div><div class="muted" style="margin-top:4px">${load}%</div></td></tr>`;
  });
  const assignmentRows = state.assignments.map(a=>{
    const p = state.people.find(x=>x.id===a.personId);
    const target = a.targetType==="project" ? projectName(a.targetId) : propertyName(a.targetId);
    return `<tr><td>${esc(p?.name||a.personId)}</td><td>${statusBadge(a.targetType==="project"?"Projekt":"Fastighet")}</td><td>${esc(target)}</td><td>${esc(a.role)}</td><td>${a.allocation}%</td></tr>`;
  });
  const barPeople = state.people.map(p=>({name:p.name,load:personLoad(p.id)})).sort((a,b)=>b.load-a.load).map(p=>`<div class="bar-row"><div class="bar-label">${esc(p.name)}</div><div class="bar-track"><div class="bar-fill ${p.load>100?"over":""}" style="width:${Math.min(p.load,130)/1.3}%"></div></div><div class="bar-value">${p.load}%</div></div>`).join("");
  return `<div class="section-stack">
    <div class="grid two-col">
      ${card("Arbetsbelastning", "Tilldelad kapacitet. Över 100 % markeras som överbelastning.", `<div class="bar-list">${barPeople || '<div class="empty">Ingen persondata.</div>'}</div>`)}
      ${card("Resursbild", "Snabb kontroll av fördelningen", `<div class="split-stats"><div class="mini-stat"><strong>${state.people.length}</strong><span>personer</span></div><div class="mini-stat"><strong>${state.assignments.length}</strong><span>tilldelningar</span></div><div class="mini-stat"><strong>${state.people.filter(p=>personLoad(p.id)>100).length}</strong><span>över 100 %</span></div></div><div class="notice" style="margin-top:14px">Kapacitetsprocenten är planerad fördelning, inte tidrapportering.</div>`)}
    </div>
    ${card("Personer", "Samma person kan vara kopplad till flera fastigheter och projekt.", table(["Person","Team","Fastigheter","Projekt","Belastning"],peopleRows), `<button class="button primary" data-add="person">+ Person</button>`)}
    ${card("Tilldelningar", "Roll och omfattning kopplas till fastighet eller projekt.", table(["Person","Typ","Objekt / projekt","Roll","Omfattning"],assignmentRows), `<button class="button primary" data-add="assignment">+ Tilldelning</button>`)}
  </div>`;
}

function bindViewEvents(){
  document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>{currentView=b.dataset.goto;render();}));
  document.querySelectorAll("[data-add]").forEach(b=>b.addEventListener("click",()=>openEditor(b.dataset.add)));
  const pSearch = document.getElementById("property-search");
  const pType = document.getElementById("property-type");
  if (pSearch) [pSearch,pType].forEach(el=>el.addEventListener("input",filterProperties));
  const cSearch = document.getElementById("contract-search");
  if (cSearch) cSearch.addEventListener("input",filterContracts);
}
function filterProperties(){
  const q=(document.getElementById("property-search")?.value||"").toLowerCase();
  const type=document.getElementById("property-type")?.value||"";
  document.querySelectorAll("#property-table tbody tr").forEach(tr=>{
    const match=tr.textContent.toLowerCase().includes(q) && (!type||tr.textContent.includes(type));
    tr.style.display=match?"":"none";
  });
}
function filterContracts(){
  const q=(document.getElementById("contract-search")?.value||"").toLowerCase();
  document.querySelectorAll("#contract-table tbody tr").forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?"":"none");
}

const fieldTemplates = {
  person: [
    ["name","Namn","text","",true],["team","Team","text","Lokaler",true],["role","Grundroll","text","",true]
  ],
  project: [
    ["name","Projektnamn","text","",true],["propertyId","Fastighet","property","",true],["status","Status","select","Planerad|Pågår|Pausad|Klar",true],["phase","Skede","text","Förstudie",false],["budget","Budget","number","",false]
  ],
  maintenance: [
    ["title","Åtgärd","text","",true],["propertyId","Fastighet","property","",true],["year","Planår","number",new Date().getFullYear()+1,true],["priority","Prioritet","select","Låg|Medel|Hög",true],["status","Status","select","Identifierad|Planerad|Pågår|Klar",true],["cost","Bedömd kostnad","number","",false]
  ],
  operation: [
    ["propertyId","Fastighet","property","",true],["period","Period","text",String(new Date().getFullYear()),true],["category","Kostnadsslag","text","Energi",true],["cost","Kostnad","number","",true]
  ],
  assignment: [
    ["personId","Person","person","",true],["targetType","Typ","select","property|project",true],["targetId","Objekt / projekt-ID","target","",true],["role","Roll i uppdraget","text","",true],["allocation","Omfattning %","number","",true]
  ]
};
let editorType = null;
function options(items, valueKey, labelFn){ return items.map(x=>`<option value="${esc(x[valueKey])}">${esc(labelFn(x))}</option>`).join(""); }
function openEditor(type){
  editorType=type;
  const dialog=document.getElementById("editor-dialog");
  document.getElementById("dialog-title").textContent = ({person:"Lägg till person",project:"Lägg till projekt",maintenance:"Lägg till UH-behov",operation:"Lägg till driftpost",assignment:"Lägg till tilldelning"})[type];
  document.getElementById("dialog-eyebrow").textContent = "NY POST";
  document.getElementById("dialog-fields").innerHTML = fieldTemplates[type].map(([name,label,kind,preset,required])=>{
    let control;
    if(kind==="select") control=`<select name="${name}" ${required?"required":""}>${String(preset).split("|").map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")}</select>`;
    else if(kind==="property") control=`<select name="${name}" required>${options(state.properties,"id",p=>`${p.id} · ${p.address||"Adress saknas"}`)}</select>`;
    else if(kind==="person") control=`<select name="${name}" required>${options(state.people,"id",p=>p.name)}</select>`;
    else if(kind==="target") control=`<input name="${name}" placeholder="Objektsnummer eller ProjektID" required />`;
    else control=`<input name="${name}" type="${kind}" value="${esc(preset)}" ${required?"required":""} />`;
    return `<div class="field"><label>${label}</label>${control}</div>`;
  }).join("");
  dialog.showModal();
}
function nextId(prefix, list){ return prefix + (Math.max(0,...list.map(x=>Number(String(x.id).replace(/\D/g,""))||0))+1); }
function saveEditor(form){
  const data=Object.fromEntries(new FormData(form).entries());
  if(editorType==="person"){ data.id=nextId("P",state.people); state.people.push(data); }
  if(editorType==="project"){ data.id=nextId("PR",state.projects); data.budget=Number(data.budget)||0; state.projects.push(data); }
  if(editorType==="maintenance"){ data.id=nextId("UH",state.maintenance); data.year=Number(data.year)||null; data.cost=Number(data.cost)||0; state.maintenance.push(data); }
  if(editorType==="operation"){ data.id=nextId("D",state.operations); data.cost=Number(data.cost)||0; state.operations.push(data); }
  if(editorType==="assignment"){
    const targetExists = data.targetType==="project" ? state.projects.some(x=>x.id===data.targetId) : state.properties.some(x=>x.id===data.targetId);
    if(!targetExists){ alert("Kontrollera mål-ID. Det måste vara ett befintligt objektsnummer eller ProjektID."); return false; }
    data.id=nextId("A",state.assignments); data.allocation=Number(data.allocation)||0; state.assignments.push(data);
  }
  saveState(); render(); return true;
}

function excelDate(value){
  if(!value) return "";
  if(value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0,10);
  if(typeof value === "number" && window.XLSX?.SSF?.parse_date_code){ const d=XLSX.SSF.parse_date_code(value); if(d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`; }
  const d = new Date(value); return Number.isNaN(d.valueOf()) ? String(value) : d.toISOString().slice(0,10);
}
function normalizeWorkbook(workbook, fileName){
  const sfSheet=workbook.Sheets["SF"];
  const extSheet=workbook.Sheets["EXT"];
  if(!sfSheet || !extSheet) throw new Error("Filen måste innehålla flikarna SF och EXT.");
  const sf=XLSX.utils.sheet_to_json(sfSheet,{defval:null,raw:true});
  const ext=XLSX.utils.sheet_to_json(extSheet,{defval:null,raw:true});
  const properties=new Map(); const contracts=[];
  sf.forEach((r,i)=>{
    const id=String(r["Förvaltningsobjekt"]??"").trim(); if(!id) return;
    if(!properties.has(id)) properties.set(id,{id,type:"Intern",address:r["Gatuadress"]||"",designation:"",owner:"",manager:r["Fastighetsförvaltare"]||""});
    const number=String(r["Avtalsnummer"]??"").trim();
    contracts.push({id:`SF|${number||id+"-"+i}`,propertyId:id,number,source:"SF",area:Number(r["Area"])||0,category:r["Lokalkategori"]||"",use:r["Användning"]||"",end:excelDate(r["Aktuellt giltigt t.o.m."]),notice:excelDate(r["Säg upp senast"])});
  });
  ext.forEach((r,i)=>{
    const id=String(r["Förvaltningsobjekt"]??"").trim(); if(!id) return;
    if(!properties.has(id)) properties.set(id,{id,type:"Extern",address:r["Adress"]||"",designation:r["Fast.bet."]||"",owner:r["Lev.namn"]||"",manager:r["Handläggare (id)"]||""});
    const number=String(r["Avtalsnummer"]??"").trim();
    contracts.push({id:`EXT|${number||id+"-"+i}`,propertyId:id,number,source:"EXT",area:Number(r["Area"])||0,category:r["Lokalkategori"]||"",use:r["Användning"]||"",end:excelDate(r["Aktuellt giltigt t.o.m."]),notice:excelDate(r["Säg upp senast"])});
  });
  return {isDemo:false,sourceName:fileName,properties:[...properties.values()],contracts,people:[],projects:[],maintenance:[],operations:[],assignments:[]};
}

async function importLeb(file){
  if(!window.XLSX){ alert("Excelbiblioteket kunde inte laddas. Kontrollera internetanslutningen och försök igen."); return; }
  try{
    const data=await file.arrayBuffer();
    const workbook=XLSX.read(data,{type:"array",cellDates:true});
    state=normalizeWorkbook(workbook,file.name);
    saveState(); currentView="dashboard"; render();
  } catch(err){ alert(`Kunde inte importera LEB-filen: ${err.message}`); }
}

document.getElementById("leb-file").addEventListener("change",e=>{ const file=e.target.files?.[0]; if(file) importLeb(file); e.target.value=""; });
document.getElementById("clear-data").addEventListener("click",()=>{ if(confirm("Rensa importerad och kompletterande lokal data i denna webbläsare och återgå till demo?")){localStorage.removeItem(STORAGE_KEY);state=clone(demo);currentView="dashboard";render();} });
document.getElementById("dialog-cancel").addEventListener("click",()=>document.getElementById("editor-dialog").close());
document.getElementById("editor-form").addEventListener("submit",e=>{ e.preventDefault(); if(saveEditor(e.currentTarget)){document.getElementById("editor-dialog").close();e.currentTarget.reset();} });

render();
