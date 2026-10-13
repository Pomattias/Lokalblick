// Read-only schema diagram. Documented relationships reflect the V2 source schemas.
const tables=[
 {id:"properties",name:"Fastigheter",x:12,y:12,fields:["id","sourceId","address","designation","ownerPartyId","responsiblePersonId"]},
 {id:"objects",name:"Objekt",x:314,y:12,fields:["id","propertyId","number","name","area","unitId"]},
 {id:"contracts",name:"Avtal",x:616,y:12,fields:["id","propertyId","objectId","number","tenantPartyId","businessPartyId"]},
 {id:"contractBusinesses",name:"AvtalVerksamhet",x:918,y:12,fields:["id","contractId","businessId","fromDate","toDate","usedArea"]},
 {id:"activities",name:"Aktiviteter",x:12,y:320,fields:["id","propertyId","contractId","responsiblePersonId","title","estimatedCost"]},
 {id:"orders",name:"Beställningar",x:314,y:320,fields:["id","activityId","orderedByPersonId","orderedAt","orderedCost","finalCost"]},
 {id:"people",name:"Personer",x:616,y:320,fields:["id","organizationId","name","role","email","phone"]},
 {id:"businesses",name:"Verksamheter",x:918,y:320,fields:["id","organizationId","sourceId","name","type","unitId"]}
];
const links=[
 {a:"objects",af:"propertyId",b:"properties",bf:"id",rule:"Objektnummer och fastighet används för att hitta befintligt objekt; objektets propertyId pekar därefter på fastighetens interna id.",source:"source-service.js · mergePrimaryData"},
 {a:"contracts",af:"objectId",b:"objects",bf:"id",rule:"Importens objekt-ID översätts via objectMap. Objekt identifieras med intern nyckel eller objektnummer + fastighet.",source:"source-service.js · objectMap"},
 {a:"contracts",af:"propertyId",b:"properties",bf:"id",rule:"Avtalsnummer används vid matchning av avtal. Fastighets-ID kopplas via propertyMap.",source:"source-service.js · mergePrimaryData"},
 {a:"activities",af:"propertyId",b:"properties",bf:"id",rule:"Projekt 2027: entydig adressmatchning ger hemvist på befintlig fastighet; importen skapar inte fastigheter.",source:"project-2027-adapter.js"},
 {a:"activities",af:"contractId",b:"contracts",bf:"id",rule:"Projekt 2027: entydig kombination av fastighet och verksamhetsnamn kan ge avtalskoppling.",source:"project-2027-adapter.js"},
 {a:"orders",af:"activityId",b:"activities",bf:"id",rule:"Beställningar kopplas till aktivitetens interna ID.",source:"source-service.js · Beställningar"},
 {a:"activities",af:"responsiblePersonId",b:"people",bf:"id",rule:"Projekt 2027 matchar ansvarig mot en unik person. Oklara namn mappas inte automatiskt.",source:"project-2027-adapter.js"},
 {a:"contractBusinesses",af:"contractId",b:"contracts",bf:"id",rule:"AvtalVerksamhet binder ett avtal till en verksamhet via avtalets id.",source:"source-service.js · AvtalVerksamhet"},
 {a:"contractBusinesses",af:"businessId",b:"businesses",bf:"id",rule:"AvtalVerksamhet refererar verksamhetens interna id.",source:"source-service.js · AvtalVerksamhet"}
];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function point(t,field){return {x:t.x+120,y:t.y+49+t.fields.indexOf(field)*27};}
const showValue=v=>v==null?"":typeof v==="object"?JSON.stringify(v):String(v);
const allFields=(data,id)=>[...new Set([...(tables.find(t=>t.id===id)?.fields||[]),...(data[id]||[]).flatMap(row=>Object.keys(row||{}))])];
export function relationshipView(data){
 const lines=links.map((r,i)=>{const a=tables.find(t=>t.id===r.a),b=tables.find(t=>t.id===r.b),p=point(a,r.af),q=point(b,r.bf),bend=(p.x+q.x)/2;
 return `<path data-relationship-line="${i}" d="M ${p.x} ${p.y} H ${bend} V ${q.y} H ${q.x}" fill="none" stroke="#0f766e" stroke-width="2" opacity=".7" vector-effect="non-scaling-stroke"/><circle cx="${p.x}" cy="${p.y}" r="3" fill="#0f766e"/><circle cx="${q.x}" cy="${q.y}" r="3" fill="#0f766e"/>`;}).join("");
 const nodes=tables.map(t=>`<div data-relationship-table="${t.id}" role="button" tabindex="0" aria-label="Öppna tabellen ${esc(t.name)}" style="cursor:pointer;position:absolute;left:${t.x}px;top:${t.y}px;width:240px;background:white;border:1px solid #b8cbd0;border-radius:9px;box-shadow:0 2px 7px #0001;overflow:hidden">
 <div style="background:#176655;color:white;font-weight:700;padding:12px">${esc(t.name)} <span style="float:right;font-size:11px">${(data[t.id]||[]).length} poster</span></div>
 ${t.fields.map(f=>`<div style="height:27px;line-height:27px;padding:0 10px;border-top:1px solid #e5e7eb;font:12px/27px ui-monospace,monospace">${f==="id"?"🔑 ":links.some(r=>r.a===t.id&&r.af===f)?"↗ ":""}${esc(f)}</div>`).join("")}</div>`).join("");
 return `<section aria-label="Datamodell" style="display:grid;gap:14px"><h2>Relationer mellan tabeller</h2><p>En Access-liknande översikt över dokumenterade ID-kopplingar. Tabellerna visar ett urval centrala kolumner. Klicka på en koppling nedan för matchningsregeln. Allt är skrivskyddat.</p>
 <div style="overflow-x:auto;border:1px solid #dae3e1;border-radius:10px;background:#f5f8f7"><div style="position:relative;width:1176px;height:565px">
 <svg viewBox="0 0 1176 565" width="1176" height="565" style="position:absolute;inset:0;pointer-events:none">${lines}</svg>${nodes}</div></div>
 <div id="relationship-table-detail" aria-live="polite" style="border:1px solid #b8cbd0;border-radius:10px;padding:14px;background:white"><strong>Välj en tabell i diagrammet</strong><p>Klicka på exempelvis Objekt för att visa samtliga tillgängliga kolumner och verkliga poster ur den aktuella datakällan.</p></div><h3>Kopplingar och matchningsregler</h3><input id="relationship-filter" type="search" aria-label="Sök relation" placeholder="Sök tabell, objektnummer eller kolumn" style="width:100%;max-width:520px;padding:10px;border:1px solid #bcc9cb;border-radius:8px"/>
 <div id="relationship-list" style="display:grid;gap:8px">${links.map((r,i)=>`<details class="relationship-rule" data-search="${esc((r.a+" "+r.af+" "+r.b+" "+r.bf+" "+r.rule).toLocaleLowerCase("sv"))}" style="border:1px solid #cad7d5;border-radius:9px;padding:12px">
 <summary style="cursor:pointer"><strong>${esc(r.a)}.${esc(r.af)} → ${esc(r.b)}.${esc(r.bf)}</strong></summary>
 <p>${esc(r.rule)}</p><small>Verifierad i: ${esc(r.source)}</small></details>`).join("")}</div>
 <small>Diagrammet beskriver kända relationer i aktuell V2-kod, inte automatiskt upptäckta SQL-främmande nycklar. Fält utan verifierad relation visas inte som en koppling.</small></section>`;
}
export function bindRelationshipView(data){
 const detail=document.querySelector("#relationship-table-detail");
 function openTable(id){
   const t=tables.find(x=>x.id===id);if(!t||!detail)return;
   const rows=Array.isArray(data[id])?data[id]:[];
   const fields=allFields(data,id);
   const related=links.filter(x=>x.a===id||x.b===id);
   detail.innerHTML=`<h3 style="margin:0 0 8px">${esc(t.name)} · ${rows.length} poster</h3><p>Verkliga fält i ansluten data. Tabellen är skrivskyddad. ${rows.length>100?"Visar de första 100 posterna.":""}</p><div style="overflow:auto;max-height:430px;border:1px solid #ddd"><table style="border-collapse:collapse;white-space:nowrap;font-size:12px"><thead><tr>${fields.map(f=>`<th style="position:sticky;top:0;background:#e3efeb;text-align:left;padding:9px;border:1px solid #d5dedb">${esc(f)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0,100).map(row=>`<tr>${fields.map(f=>`<td style="padding:7px;border:1px solid #e5e7eb;max-width:250px;overflow:hidden;text-overflow:ellipsis" title="${esc(showValue(row[f]))}">${esc(showValue(row[f]))}</td>`).join("")}</tr>`).join("")}</tbody></table>${!rows.length?"<p style=\"padding:12px\">Inga poster i aktuell datakälla.</p>":""}</div><h4>Kopplade kolumner</h4>${related.map(x=>`<div style="padding:5px 0"><code>${esc(x.a+"."+x.af+" → "+x.b+"."+x.bf)}</code></div>`).join("")}`;
   document.querySelectorAll("[data-relationship-table]").forEach(el=>{el.style.outline=el.dataset.relationshipTable===id?"3px solid #0f766e":"none";});
   document.querySelectorAll("[data-relationship-line]").forEach((line,i)=>{const l=links[i],active=l.a===id||l.b===id;line.style.opacity=active?"1":".13";line.style.strokeWidth=active?"3":"2";});
   detail.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 document.querySelectorAll("[data-relationship-table]").forEach(el=>{el.addEventListener("click",()=>openTable(el.dataset.relationshipTable));el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openTable(el.dataset.relationshipTable);}});});
 const input=document.querySelector("#relationship-filter");
 input?.addEventListener("input",()=>{const q=input.value.toLocaleLowerCase("sv").trim();document.querySelectorAll(".relationship-rule").forEach(n=>n.hidden=!n.dataset.search.includes(q));});
 document.querySelectorAll(".relationship-rule").forEach((n,i)=>n.addEventListener("toggle",()=>{const line=document.querySelector('[data-relationship-line="'+i+'"]');if(line){line.style.opacity=n.open?"1":".5";line.style.strokeWidth=n.open?"4":"2";}}));
}
