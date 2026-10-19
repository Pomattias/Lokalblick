import {tables as cleanTables,roles as cleanRoles} from '../lokaler/model.js';
import {collectWorkspace} from '../lokaler/view-adapter.js';
import {activityPropertyId} from "./model.js";
// Read-only schema diagram. Documented relationships reflect the V2 source schemas.
const tables=[
 {id:"properties",name:"Fastigheter",x:12,y:12,fields:["id","address","ownerPartyId","responsiblePersonId","ownerResponsiblePersonId","designation"]},
 {id:"objects",name:"Objekt",x:314,y:12,fields:["id","propertyId","area","start","end"]},
 {id:"contracts",name:"Avtal",x:616,y:12,fields:["id","propertyId","objectId","responsiblePersonId","tenantResponsiblePersonId"]},
 {id:"activities",name:"Ärenden",x:12,y:320,fields:["id","propertyId","contractId","responsiblePersonId","title","estimatedCost"]},
 {id:"orders",name:"Beställningar",x:314,y:320,fields:["id","activityId","orderedByPersonId","orderedAt","orderedCost","finalCost"]},
 {id:"people",name:"Personer",x:616,y:320,fields:["id","organizationId","name","role","email","phone"]},
 {id:"assignments",name:"Ansvarshistorik",x:314,y:625,fields:["id","personId","targetType","targetId","roleKey","fromDate"]}
];
const links=[
 {a:"objects",af:"propertyId",b:"properties",bf:"id",rule:"Objektnummer och fastighet används för att hitta befintligt objekt; objektets propertyId pekar därefter på fastighetens interna id.",source:"source-service.js · mergePrimaryData"},
 {a:"contracts",af:"objectId",b:"objects",bf:"id",rule:"Importens objekt-ID översätts via objectMap. Objekt identifieras med intern nyckel eller objektnummer + fastighet.",source:"source-service.js · objectMap"},
 {a:"contracts",af:"propertyId",b:"properties",bf:"id",rule:"Avtalsnummer används vid matchning av avtal. Fastighets-ID kopplas via propertyMap.",source:"source-service.js · mergePrimaryData"},
 {a:"activities",af:"propertyId",b:"properties",bf:"id",rule:"Projekt 2027: entydig adressmatchning ger hemvist på befintlig fastighet; importen skapar inte fastigheter.",source:"project-2027-adapter.js"},
 {a:"activities",af:"contractId",b:"contracts",bf:"id",rule:"Projekt 2027: entydig kombination av fastighet och verksamhetsnamn kan ge avtalskoppling.",source:"project-2027-adapter.js"},
 {a:"orders",af:"activityId",b:"activities",bf:"id",rule:"Beställningar kopplas till ärendets interna ID.",source:"source-service.js · Beställningar"},
 {a:"activities",af:"responsiblePersonId",b:"people",bf:"id",rule:"Projekt 2027 matchar ansvarig mot en unik person. Oklara namn mappas inte automatiskt.",source:"project-2027-adapter.js"},
 {a:"properties",af:"responsiblePersonId",b:"people",bf:"id",rule:"Vår ansvarige för fastigheten. Aktuellt person-ID speglas från giltig ansvarshistorik.",source:"responsibility-model.js · normalize"},
 {a:"properties",af:"ownerResponsiblePersonId",b:"people",bf:"id",rule:"Fastighetsägarens kontaktperson. Ansvarsroll owner i historiken.",source:"responsibility-model.js · normalize"},
 {a:"contracts",af:"responsiblePersonId",b:"people",bf:"id",rule:"Vår ansvarige kopplad till avtalet. Fältet härleds från ansvarshistoriken när rollen är entydig.",source:"responsibility-model.js · normalize"},
 {a:"contracts",af:"tenantResponsiblePersonId",b:"people",bf:"id",rule:"Hyresgästens kontaktperson för avtalet, hämtad från rollen tenant.",source:"responsibility-model.js · normalize"},
 {a:"assignments",af:"personId",b:"people",bf:"id",rule:"Historiska och aktuella ansvarskopplingar pekar på Personer.id. Roll och giltighetsdatum avgör vilket ansvar som gäller.",source:"responsibility-model.js · history/current"},
 {a:"assignments",af:"targetId",b:"properties",bf:"id",rule:"Endast när assignments.targetType = property. targetId är en polymorf referens, inte en generell främmande nyckel.",source:"responsibility-model.js · types"},
 {a:"assignments",af:"targetId",b:"contracts",bf:"id",rule:"Endast när assignments.targetType = contract. targetId pekar då på Avtal.id.",source:"responsibility-model.js · types"},
 {a:"assignments",af:"targetId",b:"activities",bf:"id",rule:"Endast när assignments.targetType = activity. targetId pekar då på Ärenden.id.",source:"responsibility-model.js · types"},

];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function point(t,field){return {x:t.x+120,y:t.y+49+t.fields.indexOf(field)*27};}
const showValue=v=>v==null?"":typeof v==="object"?JSON.stringify(v):String(v);
const allFields=(data,id,tables)=>[...new Set([...(tables.find(t=>t.id===id)?.fields||[]),...(data[id]||[]).flatMap(row=>Object.keys(row||{}))])];
function graph(input){
 if(!input.cleanModel)return {data:input,tables,links};
 const data=collectWorkspace(input),nodes=Object.entries(cleanTables).map(([id,spec],index)=>({id,name:spec.label,x:12+(index%3)*314,y:12+Math.floor(index/3)*360,fields:['id',...spec.fields.filter((f,i)=>i<5||f.type==='ref').map(f=>f.key)]}));
 const edges=Object.entries(cleanTables).flatMap(([id,spec])=>spec.fields.filter(f=>f.type==='ref').map(f=>({a:id,af:f.key,b:f.table,bf:'id',rule:'ID-koppling till '+cleanTables[f.table].label+'. Uppgiften lagras på ett ställe och hämtas via denna referens.',source:'lokaler/model.js · SQLite / Excel'})));
 return {data,tables:nodes,links:edges};
}
export function relationshipView(input){
 const {data,tables,links}=graph(input);
 const lines=links.map((r,i)=>{const a=tables.find(t=>t.id===r.a),b=tables.find(t=>t.id===r.b),p=point(a,r.af),q=point(b,r.bf),bend=(p.x+q.x)/2;
 return `<path data-relationship-line="${i}" d="M ${p.x} ${p.y} H ${bend} V ${q.y} H ${q.x}" fill="none" stroke="#0f766e" stroke-width="2" opacity=".7" vector-effect="non-scaling-stroke"/><circle cx="${p.x}" cy="${p.y}" r="3" fill="#0f766e"/><circle cx="${q.x}" cy="${q.y}" r="3" fill="#0f766e"/>`;}).join("");
 const nodes=tables.map(t=>`<div data-relationship-table="${t.id}" role="button" tabindex="0" aria-label="Öppna tabellen ${esc(t.name)}" style="cursor:pointer;position:absolute;left:${t.x}px;top:${t.y}px;width:240px;background:white;border:1px solid #b8cbd0;border-radius:9px;box-shadow:0 2px 7px #0001;overflow:hidden">
 <div style="background:#176655;color:white;font-weight:700;padding:12px">${esc(t.name)} <span style="float:right;font-size:11px">${(data[t.id]||[]).length} poster</span></div>
 ${t.fields.map(f=>`<div style="height:27px;line-height:27px;padding:0 10px;border-top:1px solid #e5e7eb;font:12px/27px ui-monospace,monospace">${f==="id"?"🔑 ":links.some(r=>r.a===t.id&&r.af===f)?"↗ ":""}${esc(f)}</div>`).join("")}</div>`).join("");
 return `<section aria-label="Datamodell" style="display:grid;gap:14px"><h2>Relationer mellan tabeller</h2><p>En Access-liknande översikt över dokumenterade ID-kopplingar. Tabellerna visar ett urval centrala kolumner inklusive personkopplingar och ansvarshistorik. Den rena arbetsytan visar databasens faktiska tabeller och referenser. Klicka på en koppling nedan för matchningsregeln. Allt är skrivskyddat.</p>
 <div style="overflow-x:auto;border:1px solid #dae3e1;border-radius:10px;background:#f5f8f7"><div style="position:relative;width:1176px;height:1120px">
 <svg viewBox="0 0 1176 1120" width="1176" height="1120" style="position:absolute;inset:0;pointer-events:none">${lines}</svg>${nodes}</div></div>
 <div id="relationship-table-detail" aria-live="polite" style="border:1px solid #b8cbd0;border-radius:10px;padding:14px;background:white"><strong>Välj en tabell i diagrammet</strong><p>Klicka på exempelvis Objekt för att visa samtliga tillgängliga kolumner och verkliga poster ur den aktuella datakällan.</p></div><h3>Kopplingar och matchningsregler</h3><input id="relationship-filter" type="search" aria-label="Sök relation" placeholder="Sök tabell, objektnummer eller kolumn" style="width:100%;max-width:520px;padding:10px;border:1px solid #bcc9cb;border-radius:8px"/>
 <div id="relationship-list" style="display:grid;gap:8px">${links.map((r,i)=>`<details class="relationship-rule" data-search="${esc((r.a+" "+r.af+" "+r.b+" "+r.bf+" "+r.rule).toLocaleLowerCase("sv"))}" style="border:1px solid #cad7d5;border-radius:9px;padding:12px">
 <summary style="cursor:pointer"><strong>${esc(r.a)}.${esc(r.af)} → ${esc(r.b)}.${esc(r.bf)}</strong></summary>
 <p>${esc(r.rule)}</p><small>Verifierad i: ${esc(r.source)}</small></details>`).join("")}</div>
 <small>Diagrammet beskriver kända relationer i aktuell V2-kod, inte automatiskt upptäckta SQL-främmande nycklar. Fält utan verifierad relation visas inte som en koppling.</small></section>`;
}

function personRelations(data,personId){
 if(data.contacts)return data.contacts.filter(c=>c.person_id===personId).map(c=>{
  const [collection,key]=[['properties','property_id'],['agreements','agreement_id'],['issues','issue_id'],['orders','order_id']].find(([,key])=>c[key])||[];
  const row=(data[collection]||[]).find(r=>r.id===c[key]);
  return {collection,id:c[key],label:row?.name||row?.title||row?.id,role:cleanRoles[c.role],from:c.valid_from,to:c.valid_to,source:'Personkoppling',cancelled:c.cancelled};
 });
 const types={property:"properties",contract:"contracts",activity:"activities",object:"objects",order:"orders"};
 const roleFields={properties:["responsiblePersonId","ownerResponsiblePersonId"],contracts:["responsiblePersonId","tenantResponsiblePersonId"],activities:["responsiblePersonId"],objects:["responsiblePersonId"]};
 const matches=[];
 for(const a of data.assignments||[]){
  if(String(a.personId)!==String(personId))continue;
  const collection=types[a.targetType]||a.targetType;
  const row=(data[collection]||[]).find(x=>String(x.id)===String(a.targetId));
  matches.push({collection,id:a.targetId,label:row?.title||row?.address||row?.number||row?.name||a.targetId,role:a.role||a.roleKey||"Ansvar",from:a.fromDate||"",to:a.toDate||"",source:"Ansvarshistorik",cancelled:a.cancelled===true});
 }
 return matches;
}
function personDetailHtml(data,personId){
 const person=(data.people||[]).find(p=>String(p.id)===String(personId));
 if(!person)return "<p>Personen finns inte längre i registret.</p>";
 const rel=personRelations(data,personId);
 return `<div style="border:1px solid #a3bdb5;border-radius:10px;padding:12px;margin-top:12px">
 <h4 style="margin:0 0 8px">${esc(person.name||person.id)} – kopplingar och historik</h4>
 <p>${rel.length} registrerade kopplingar inklusive historiska poster. Varje registrerad koppling visas en gång.</p>
 <div style="overflow:auto"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr>${["Tabell","Post","Roll/fält","Från","Till","Källa"].map(f=>`<th style="padding:8px;border:1px solid #ddd;text-align:left">${f}</th>`).join("")}</tr></thead><tbody>
 ${rel.map(x=>`<tr>${[x.collection,x.label,x.role,x.from,x.to,x.source].map(v=>`<td style="padding:8px;border:1px solid #ddd">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
 ${!rel.length?"<p>Inga direkta personrelationer finns registrerade.</p>":""}</div>`;
}

export function bindRelationshipView(sourceData){
 const {data,tables,links}=graph(sourceData);
 const detail=document.querySelector("#relationship-table-detail");
 function openTable(id){
   const t=tables.find(x=>x.id===id);if(!t||!detail)return;
   const rows=Array.isArray(data[id])?data[id]:[];
   const fields=id==="activities"?[...allFields(data,id,tables),"resolvedPropertyId (beräknad)","Journalnoteringar (beräknat)","Senaste journaldatum (beräknat)","Senaste kommentar (beräknad)"]:allFields(data,id,tables);
   const journal=new Map();
   if(id==="activities")for(const h of data.auditLog||[]){
     if(h.collection!=="activities"||h.action!=="Journalanteckning")continue;
     const k=String(h.recordId),list=journal.get(k)||[];
     list.push(h);journal.set(k,list);
   }
   for(const entries of journal.values())entries.sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
   function displayField(row,field){
     if(field==="resolvedPropertyId (beräknad)")return activityPropertyId(data,row);
     const entries=journal.get(String(row.id))||[];
     if(field==="Journalnoteringar (beräknat)")return entries.length;
     if(field==="Senaste journaldatum (beräknat)")return entries[0]?.at||"";
     if(field==="Senaste kommentar (beräknad)")return (entries[0]?.fields||[]).find(x=>x.field==="comment")?.to||"";
     return row[field];
   }
   const related=links.filter(x=>x.a===id||x.b===id);
   detail.innerHTML=`<h3 style="margin:0 0 8px">${esc(t.name)} · ${rows.length} poster</h3><p>Verkliga fält i ansluten data. Tabellen är skrivskyddad. ${rows.length>100?"Visar de första 100 posterna.":""}</p><div style="overflow:auto;max-height:430px;border:1px solid #ddd"><table style="border-collapse:collapse;white-space:nowrap;font-size:12px"><thead><tr>${id==="people"?"<th>Relationer</th>":""}${fields.map(f=>`<th style="position:sticky;top:0;background:#e3efeb;text-align:left;padding:9px;border:1px solid #d5dedb">${esc(f)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0,100).map(row=>`<tr>${id==="people"?`<td style="padding:6px;border:1px solid #ddd"><button type="button" data-person-detail="${esc(row.id)}">Visa kopplingar</button></td>`:""}${fields.map(f=>`<td style="padding:7px;border:1px solid #e5e7eb;max-width:250px;overflow:hidden;text-overflow:ellipsis" title="${esc(showValue(displayField(row,f)))}">${esc(showValue(displayField(row,f)))}</td>`).join("")}</tr>`).join("")}</tbody></table>${!rows.length?"<p style=\"padding:12px\">Inga poster i aktuell datakälla.</p>":""}</div><h4>Kopplade kolumner</h4>${related.map(x=>`<div style="padding:5px 0"><code>${esc(x.a+"."+x.af+" → "+x.b+"."+x.bf)}</code></div>`).join("")}`;
   detail.querySelectorAll("[data-person-detail]").forEach(btn=>btn.addEventListener("click",()=>{let box=detail.querySelector("#person-relations");if(!box){box=document.createElement("div");box.id="person-relations";detail.appendChild(box);}box.innerHTML=personDetailHtml(data,btn.dataset.personDetail);box.scrollIntoView({behavior:"smooth",block:"nearest"});}));
   document.querySelectorAll("[data-relationship-table]").forEach(el=>{el.style.outline=el.dataset.relationshipTable===id?"3px solid #0f766e":"none";});
   document.querySelectorAll("[data-relationship-line]").forEach((line,i)=>{const l=links[i],active=l.a===id||l.b===id;line.style.opacity=active?"1":".13";line.style.strokeWidth=active?"3":"2";});
   detail.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
 document.querySelectorAll("[data-relationship-table]").forEach(el=>{el.addEventListener("click",()=>openTable(el.dataset.relationshipTable));el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openTable(el.dataset.relationshipTable);}});});
 const input=document.querySelector("#relationship-filter");
 input?.addEventListener("input",()=>{const q=input.value.toLocaleLowerCase("sv").trim();document.querySelectorAll(".relationship-rule").forEach(n=>n.hidden=!n.dataset.search.includes(q));});
 document.querySelectorAll(".relationship-rule").forEach((n,i)=>n.addEventListener("toggle",()=>{const line=document.querySelector('[data-relationship-line="'+i+'"]');if(line){line.style.opacity=n.open?"1":".5";line.style.strokeWidth=n.open?"4":"2";}}));
}
