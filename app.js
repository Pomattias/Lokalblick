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
  document