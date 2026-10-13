// Read-only relationship explorer. Definitions track verified import paths; no data mutations.
const rules=[
 {name:"Fastigheter → Objekt",key:"propertyId",from:"objects.propertyId",to:"properties.id",match:"Importerad fastighet identifieras först via käll-ID, adress eller fastighetsbeteckning. Därefter översätts propertyId till intern fastighetsnyckel.",source:"source-service.js · mergePrimaryData · propertyMap",kind:"Relation + matchning"},
 {name:"Objekt → Avtal",key:"objectId",from:"contracts.objectId",to:"objects.id",match:"Objekt matchas på internt ID eller kombinationen objektnummer och fastighets-ID. Importerat objectId översätts via objectMap innan avtal sammanförs.",source:"source-service.js · mergePrimaryData · objectMap",kind:"Relation + matchning"},
 {name:"Avtal → Fastigheter",key:"propertyId",from:"contracts.propertyId",to:"properties.id",match:"Avtal identifieras i första hand genom avtalsnummer; vid flera träffar begränsas matchningen med fastighet. Kopplingens fastighets-ID hämtas via propertyMap.",source:"source-service.js · mergePrimaryData",kind:"Relation + matchning"},
 {name:"Aktiviteter → Fastigheter",key:"propertyId",from:"activities.propertyId",to:"properties.id",match:"Projekt 2027 matchar adress mot befintlig fastighet. Endast entydig träff ger automatisk hemvist. Importen skapar aktivitet, aldrig fastighet.",source:"project-2027-adapter.js · enrich",kind:"Relation + matchning"},
 {name:"Aktiviteter → Avtal",key:"contractId",from:"activities.contractId",to:"contracts.id",match:"Projekt 2027 kan kopplas till avtal när fastigheten är entydigt identifierad och verksamhetsnamnet ger exakt en avtalsträff.",source:"project-2027-adapter.js · enrich",kind:"Relation + matchning"},
 {name:"Beställningar → Aktiviteter",key:"activityId",from:"orders.activityId",to:"activities.id",match:"Beställningar refererar till aktiviteters interna ID. Det är en sparad relation, inte en matchning med projektnamn.",source:"source-service.js · Beställningar-schema",kind:"Relation"},
 {name:"Aktiviteter → Personer",key:"responsiblePersonId",from:"activities.responsiblePersonId",to:"people.id",match:"Projekt 2027 föreslår ansvarig endast om namnet matchar exakt en person. Oklara namn lämnas omappade.",source:"project-2027-adapter.js · enrich",kind:"Relation + matchning"},
 {name:"Avtal → Verksamheter",key:"contractId",from:"contractBusinesses.contractId",to:"contracts.id",match:"Kopplingstabellen AvtalVerksamhet refererar till avtalets interna ID och verksamhetens ID.",source:"source-service.js · AvtalVerksamhet-schema",kind:"Relation"}
];
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function relationshipView(data){
 const counts=Object.fromEntries(["properties","objects","contracts","activities","orders","people","contractBusinesses"].map(k=>[k,(data[k]||[]).length]));
 return `<section class="relationship-explorer" style="display:grid;gap:14px">
 <div class="section-title"><h2>Datamodell · Kopplingar och matchningsregler</h2></div>
 <p>Den befintliga Excelmappningen finns under Datakällor. Här visas dokumenterade matchningsregler från importkoden och hur sparade ID-relationer hänger ihop. Skrivskyddat – inga data ändras här.</p>
 <div style="display:flex;gap:8px;flex-wrap:wrap">${Object.entries(counts).map(([k,n])=>`<span class="badge">${escape(k)} · ${n} poster</span>`).join("")}</div>
 <label for="relationship-filter">Sök tabell, kolumn eller regel</label>
 <input id="relationship-filter" type="search" placeholder="Exempel: objektnummer, contractId, Projekt 2027" style="width:100%;max-width:560px;padding:12px;border:1px solid #94a3b8;border-radius:8px"/>
 <div id="relationship-list" style="display:grid;gap:10px">
 ${rules.map((r,i)=>`<details class="relationship-rule" data-search="${escape(Object.values(r).join(" ").toLowerCase())}" style="border:1px solid #cbd5e1;border-radius:10px;padding:12px">
 <summary style="cursor:pointer"><strong>${escape(r.name)}</strong> <small>· ${escape(r.kind)}</small></summary>
 <div style="display:grid;gap:10px;padding-top:12px"><div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px">
 <code>${escape(r.from)}</code><span>→</span><code>${escape(r.to)}</code></div>
 <div><strong>Så görs matchningen</strong><p>${escape(r.match)}</p></div>
 <div><small>Regelkälla: ${escape(r.source)}</small></div></div></details>`).join("")}</div>
 <small>Reglerna är dokumenterade från granskad kod, inte dynamiskt uppmätta databasnycklar. Exakta träffar och avvikelser per import kräver en separat importlogg.</small></section>`;
}
export function bindRelationshipView(){
 const input=document.querySelector("#relationship-filter");
 input?.addEventListener("input",()=>{const q=input.value.toLocaleLowerCase("sv").trim();document.querySelectorAll(".relationship-rule").forEach(n=>{n.hidden=!n.dataset.search.includes(q);});});
}
