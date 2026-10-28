export const partyAffiliation = type => {
 const value=String(type||"").trim().toLocaleLowerCase("sv");
 if(["owner","fastighetsägare","landlord"].includes(value))return "Fastighetsägare";
 if(["our","vi","lokalsamordnare","manager","management"].includes(value))return "Lokalsamordnare";
 if(["tenant","hyresgäst","business"].includes(value))return "Hyresgäst";
 return "Ej klassificerad";
};
import {createBusinessLabels} from '../lokaler/business-identities.js';
// Import review, source priorities and receipts. Saving remains in the transport.
import {propertyLabel,organizationLabel,personLabel,num,esc,money,propertyDesignation,propertyAddress,table,row,edit} from "./view-format.js";
import {fieldCaption} from "./field-labels.js";
import {bulkEligible} from "./model.js";
import {importReviewGroups,importTableRows} from "../lokaler/import-conflicts.js";
const importFieldLabels = {
  sourceId: "Objekts-ID",
  address: "Adress",
  designation: "Fastighetsbeteckning",
  propertyId: "Fastighet",
  number: "Avtalsnummer",
  area: "Area",
  category: "Kategori",
  use: "Verksamhet / användning",
  businessName: "Tidigare verksamhetsnamn",
  ownerPartyId: "Fastighetsägare",
  businessPartyId: "Äldre partskoppling",
  tenantName: "Hyresgäst",
  responsiblePersonId: "Ansvarig hos oss",
  ownerResponsiblePersonId: "Ansvarig hos fastighetsägaren",
  tenantResponsiblePersonId: "Hyresgästens kontaktperson",
  start: "Giltigt fr.o.m.",
  end: "Giltigt t.o.m.",
  noticePeriodMonths: "Uppsägningstid",
  renewalPeriodMonths: "Förlängningstid",
  originalTerm: "Ursprunglig avtalstid",
  baseRent: "Bashyra",
  baseAdditions: "Tillägg",
  rentBaseYear: "Basår hyra",
  rentAdjustmentMethod:"Avtalad hyresjustering",rentAnnualPercent:"Hyra fast %, per år",
  rentMinPercent:"Hyra min %, per år",rentMaxPercent:"Hyra max %, per år",rentLimitBasis:"Hyra gränser gäller",
  additionAdjustmentMethod:"Tilläggsjustering",additionAnnualPercent:"Tillägg fast %, per år",
  additionMinPercent:"Tillägg min %, per år",additionMaxPercent:"Tillägg max %, per år",additionLimitBasis:"Tillägg gränser gäller",
  rentIndexPercent: "Indexandel hyra",
  additionBaseYear: "Basår tillägg",
  additionIndexPercent: "Indexandel tillägg",
  annualPropertyTax: "Fastighetsskatt",
  unitId: "Verksamhet / område",
  employees: "Antal anställda",
  users: "Antal brukare",
  rooms: "Antal rum",
  commonArea: "Allmän yta",
  apartmentArea: "Lägenhetsyta",
};
const importFieldLabel = (field,collection) => globalThis.LokalblickSourceService?.fieldLabel?.(collection,field,importFieldLabels[field]) || importFieldLabels[field] || field || "Uppgift";
const sourceKindLabel = (kind) =>
  ({
    "core-import": "Grunddata",
    "operational-enrichment": "Fastigheter & ärenden",
    "contract-enrichment": "Avtalsberikning",
    "external-import": "Extern Excelkälla",
  })[kind] || kind || "";
function reviewCollection(item) {
  if (item.collection) return item.collection;
  if (item.entity === "Fastighet") return "properties";
  if (item.entity === "Avtal" || item.contractId) return "contracts";
  return "";
}
function reviewRecord(data, item) {
  const collection = reviewCollection(item);
  const records = Array.isArray(data[collection]) ? data[collection] : [];
  let record = records.find((x) => x.id === item.recordId);
  if (!record && item.field) {
    const matches = records.filter(
      (x) => JSON.stringify(x[item.field] ?? "") === JSON.stringify(item.current ?? ""),
    );
    if (matches.length === 1) record = matches[0];
  }
  return { collection, record };
}
function reviewRecordLabel(data, item) {
  if (item.recordLabel) return createBusinessLabels(data).text(item.recordLabel);
  const { collection, record } = reviewRecord(data, item);
  if (!record) return item.entity || "";
  if (collection === "properties")
    return [record.address, record.designation, createBusinessLabels(data).number('properties',record.id)].filter(Boolean).join(" · ");
  if(collection==='objects')return [record.number,record.name,propertyLabel(data,record.propertyId)].filter(Boolean).join(' · ');
  if (collection === "contracts")
    return [
      record.number,
      propertyLabel(data, record.propertyId),
      record.tenantName || record.businessName || record.use,
    ].filter(Boolean).join(" · ");
  if (collection === "activities") return record.title || record.id;
  return record.name || record.id || "";
}
function reviewCurrentSource(data, item) {
  if (item.currentSource)
    return [item.currentSource, item.currentSheet, item.currentRow ? "rad " + item.currentRow : ""]
      .filter(Boolean)
      .join(" · ");
  const { record } = reviewRecord(data, item);
  const provenance = record?.provenance?.[item.field] || {};
  return [
    provenance.source || record?.sourceSheet || "Lokalblick-data",
    provenance.sheet || record?.sourceSheet || "",
    provenance.row || record?.sourceRow ? "rad " + (provenance.row || record?.sourceRow) : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function reviewIncomingSource(item) {
  return [
    item.source || "Importerad fil",
    item.sheet ? "flik " + item.sheet : "",
    item.row ? "rad " + item.row : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
function reviewValue(data, item, value) {
  if (value == null || value === "") return "Tomt";
  if (["ownerPartyId", "businessPartyId"].includes(item.field))
    return organizationLabel(data, value) || value;
  if (
    ["responsiblePersonId", "ownerResponsiblePersonId", "tenantResponsiblePersonId"].includes(
      item.field,
    )
  )
    return personLabel(data, value) || value;
  if (item.field === "propertyId") return propertyLabel(data, value);
  if (typeof value === "number")
    return ["area", "commonArea", "apartmentArea"].includes(item.field)
      ? num(value) + " m²"
      : num(value);
  return createBusinessLabels(data).text(value);
}
function reviewSuggestion(data,x) {
  const normalizeAddress=s=>String(s??"").toLocaleLowerCase("sv")
    .replace(/\s+/g," ").replace(/(\d)\s+([a-zåäö])(?=$|[\s,.])/gi,"$1$2").trim();
  if(x.field==="address" && normalizeAddress(x.current)===normalizeAddress(x.proposed))
    return {side:"current",title:"Samma adress – olika skrivsätt",detail:"Behåll tidigare registrerad stavning."};
  if(x.field==="designation" && /står för lokalen/i.test(String(x.proposed||"")))
    return {side:"current",title:"Inte en fastighetsbeteckning",detail:"Texten från filen ser ut att vara en kommentar."};
  if(x.field==="ownerPartyId") return {side:"",title:"Kontrollera juridiskt bolag",detail:"Liknande företagsnamn innebär inte att fastighetsägaren är samma juridiska part."};
  if(x.collection==="activities" && ["title","estimatedCost","name"].includes(x.field))
    return {side:"",title:"Kan vara två skilda ärenden",detail:"Jämför källrad och arbetsbeskrivning innan du väljer."};
  return null;
}
function reviewConflictCard(data,x) {
  const label=reviewRecordLabel(data,x),hint=reviewSuggestion(data,x);
  const notice=hint?`<p class="review-recommendation"><strong>${esc(hint.title)}</strong> · ${esc(hint.detail)}</p>`:"";
  return `<section class="review review-conflict"><div class="review-main"><div class="review-heading"><div><strong>${esc(x.entity||(x.contractId?"Avtal":"Datakonflikt"))} · ${esc(importFieldLabel(x.field,reviewCollection(x)))}</strong>${label?`<small class="review-context">${esc(label)}</small>`:""}</div></div>${notice}
  <div class="review-compare">
    <div class="review-value current"><span>1 · Registrerat tidigare</span><strong>${esc(reviewValue(data,x,x.current))}</strong><small>${esc(reviewCurrentSource(data,x))}</small><button type="button" data-review="${esc(x.id)}" data-decision="reject" class="${hint?.side==="current"?"primary-action":""}">Välj detta värde</button></div>
    <div class="review-value proposed"><span>2 · Från nya importfilen</span><strong>${esc(reviewValue(data,x,x.proposed))}</strong><small>${esc(reviewIncomingSource(x))}</small><button type="button" data-review="${esc(x.id)}" data-decision="accept">Välj detta värde</button></div>
  </div></div></section>`;
}
function importRecordPreview(record,labels=createBusinessLabels()) {
  if(!record)return "<p><small>Källdetaljer saknas. Sök på adress eller nummer.</small></p>";
  const fields=[["Adress",record.address],["Fastighetsbeteckning",record.designation],
    ["Ort",record.city],["Objekt",record.objectNo],
    ["Avtalsnummer",record.number],["Verksamhet",record.use||record.business],
    ["Area",record.area?num(record.area)+" m²":""],["Giltigt fr.o.m.",record.start],["Giltigt t.o.m.",record.end],
    ["Bashyra",record.baseRent?money(record.baseRent):""],
    ["Bastillägg",record.baseAdditions?money(record.baseAdditions):""],
    ["Ägare",record.ownerName],["Benämning",record.name||record.title]]
    .filter(([,value])=>value!==""&&value!=null);
  return `<dl class="review-record-preview">${fields.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(labels.text(v))}</dd></div>`).join("")}</dl>`;
}
export function reviewCandidateChoices(data,item,searchValue="") {
  const labels=createBusinessLabels(data);
  const matcher=globalThis.LokalblickAddressMatch;
  if(!matcher)return "<p>Adressmatchningen är inte tillgänglig. Ladda om sidan.</p>";
  const isContract=item.kind==="match",r=item.record||{address:item.address||""};
  const search=String(searchValue||"").trim();
  let choices=isContract?matcher.rankContracts(data,r,5):matcher.rankProperties(data.properties||[],r,5);
  if(search.length>=2){
    const q=matcher.norm(search);
    choices=isContract?(data.contracts||[]).filter(c=>{
      const p=(data.properties||[]).find(p=>p.id===c.propertyId);
      return matcher.norm([c.number,p?.address,p?.designation,p?.city,c.area,c.tenantName,c.businessName].join(" ")).includes(q);
    }).slice(0,8).map(c=>({id:c.id,contract:c,property:(data.properties||[]).find(p=>p.id===c.propertyId),reason:"Sökresultat"}))
    :(data.properties||[]).filter(p=>matcher.norm([p.address,p.designation,p.city,p.sourceId,p.name].join(" ")).includes(q))
      .slice(0,8).map(p=>({id:p.id,property:p,reason:"Sökresultat"}));
  }
  if(!choices.length)return '<p class="review-no-candidates">Ingen entydig kandidat. Kontrollera adress och objektsnummer; sök vid behov nedan.</p>';
  const name="match-"+String(item.id).replace(/[^a-z0-9-]/gi,"-");
  return `<div class="review-match-options">${choices.map(c=>{
    const p=c.property||{},contract=c.contract;
    const title=contract?"Avtal "+(contract.number||"utan nummer"):propertyDesignation(p)||"Fastighetsbeteckning saknas";
    const details=contract?[
      propertyAddress(p),propertyDesignation(p),contract.area?num(contract.area)+" m²":"",
      [contract.start,contract.end].filter(Boolean).join(" – "),contract.tenantName||contract.businessName||contract.use
    ]:[
      propertyAddress(p),p.city,'Fastighetsnummer '+labels.number('properties',p.id),
      organizationLabel(data,p.ownerPartyId)||p.sourceOwner,p.name
    ];
    return `<label class="review-match-option"><input type="radio" name="${esc(name)}" data-review-target="${esc(item.id)}" value="${esc(c.id)}">
      <span><strong>${esc(title)}</strong><small>${esc(labels.text(details.filter(Boolean).join(" · ")))}</small><small class="review-match-reason">${esc(c.reason||"")}</small></span></label>`;
  }).join("")}</div>`;
}
function reviewStandardCard(data,x) {
  const labels=createBusinessLabels(data);
  x={...x,reason:labels.text(x.reason)};for(const field of ['value','proposed'])if(x[field]!=null)x[field]=labels.text(x[field]);
  if(x.kind==='canonical-conflict'){
    if(!x.rowRejected&&!x.recordRejected&&x.recordId&&Object.hasOwn(x,'proposed'))return reviewConflictCard(data,x);
    return `<article class="review review-card"><h3>${x.recordRejected?'En del av raden lästes inte in':x.personLinkRejected?'Personkopplingen behöver granskas':x.rowRejected?'Raden lästes inte in':'Fältet lämnades oförändrat'}</h3><p>${esc(x.source)} · ${esc(x.sheet)} · Rad ${esc(x.row)}</p><p>${esc(x.column||fieldCaption(x.collection,x.field))}: ${esc(x.value??x.proposed??'–')} · ${esc(x.reason)}</p><p>${x.recordRejected?'Övriga säkert identifierade uppgifter på raden har lästs in. Rätta denna registerpost eller kolumnvalet och läs in på nytt.':x.personLinkRejected?'Övriga giltiga uppgifter på raden har lästs in. Rätta personformat, PersonID eller koppling och läs in på nytt.':x.rowRejected?'Rätta underlaget eller kolumnvalet och läs in på nytt. Att avvisa granskningen läser inte in raden.':'Övriga giltiga uppgifter har lästs in. Komplettera posten i appen eller rätta underlaget och läs in på nytt.'}</p><button data-review="${esc(x.id)}" data-decision="reject">${x.fieldRejected?"Markera hanterad":"Avvisa granskning"}</button></article>`;
  }
  if(x.kind==='multi-contract-value')return `<article class="review review-card"><h3>Flera avtalsreferenser</h3><p>${esc(x.source)} · ${esc(x.sheet)} · ${esc(x.provenance?.cell)} · ${esc(x.reason)}</p><p>${esc(x.field)}: ${esc(x.proposed)}. Ange uppgiften separat per avtal i underlaget eller avtalsformuläret.</p><button data-review="${esc(x.id)}" data-decision="reject">Lämna värdet oförändrat</button></article>`;
  if(x.kind==='tenant-identity'){const rows=data.organizations;return `<article class="review review-card"><h3>Bekräfta ${x.collection==='contracts'?'hyresgäst':'verksamhet'}</h3><p>${esc(x.reason)} · ${esc(x.values?.name||x.values?.tenantName)}</p><label>Välj befintlig post<select data-review-target="${esc(x.id)}"><option value="">Välj post</option>${(rows||[]).map(r=>`<option value="${esc(r.id)}">${esc(labels.label('parties',r.id))}</option>`).join('')}</select></label><div class="actions"><button data-review="${esc(x.id)}" data-decision="accept">Bekräfta koppling</button><button data-review="${esc(x.id)}" data-decision="reject">Ignorera</button></div></article>`;}
  if(x.kind==='invalid-import-field')return `<article class="review review-card"><h3>Värdet behöver rättas</h3><p>${esc(x.source)} · ${esc(x.provenance?.sheet||'')} · ${esc(x.provenance?.cell||'')}</p><p>${esc(fieldCaption(x.collection,x.field))}: ${esc(x.provenance?.originalValue??'')} · ${esc(x.reason)}</p><p>Rätta värdet i underlaget och läs in på nytt.</p><button data-review="${esc(x.id)}" data-decision="reject">Ignorera detta värde</button></article>`;
  if(x.kind==='mapped-identity')return `<article class="review review-card"><h3>Identifiera importerad post</h3><p>${esc(x.source)} · ${esc(x.sheet)} rad ${esc(x.row)} · ${esc(x.reason)}</p>${importRecordPreview(x.values,labels)}<label>Koppla till befintlig post<select data-review-target="${esc(x.id)}"><option value="">Välj post</option>${(data[x.collection]||[]).map(r=>`<option value="${esc(r.id)}">${esc([r.address,r.designation,r.city,r.number,r.tenantName,r.name,r.title,r.area?num(r.area)+' m²':''].filter(Boolean).join(' · '))}</option>`).join('')}</select></label><div class="actions"><button data-review="${esc(x.id)}" data-decision="accept">Koppla och berika</button><button data-review="${esc(x.id)}" data-decision="reject">Ignorera</button></div></article>`;
  const titles={match:"Matcha importerat avtal",record:"Koppla importerad post",
    "activity-property":"Koppla ärende till fastighet","property-match":"Matcha fastighet via adress",person:"Komplettera person"};
  const isMatch=["record","activity-property","property-match","match"].includes(x.kind);
  const preview=isMatch?`<section class="review-source-record"><strong>Inläst post – ${esc(reviewIncomingSource(x))}</strong>${importRecordPreview(x.record)}</section>`:
    `<p>${esc([x.personName,x.message].filter(Boolean).join(" · "))}</p>`;
  const picker=isMatch?`<div class="review-candidates">
    <h4>${x.kind==="match"?"Möjliga avtal":"Möjliga fastigheter"}</h4>
    <small>Endast relevanta förslag visas. Kontrollera innehållet innan du kopplar.</small>
    ${reviewCandidateChoices(data,x)}
    <details class="review-search"><summary>Sök annan ${x.kind==="match"?"avtalspost":"fastighet"}</summary>
      <label>Adress, beteckning eller nummer
        <input type="search" autocomplete="off" placeholder="Skriv minst två tecken" data-review-search="${esc(x.id)}">
      </label><div data-review-search-results="${esc(x.id)}"></div></details></div>`:"";
  const actions=isMatch?`<div class="review-match-actions">
    <button data-review="${esc(x.id)}" data-decision="accept" class="primary-action">${x.kind==="match"?"Koppla valt avtal och berika":"Koppla vald fastighet"}</button>
    <button data-review="${esc(x.id)}" data-decision="reject">Avvisa matchningen</button></div>`:
    `<div class="actions"><button data-review="${esc(x.id)}" data-decision="accept">${x.kind==="person"?"Behåll preliminär person":"Godkänn"}</button>
      <button data-review="${esc(x.id)}" data-decision="reject">${x.kind==="person"?"Ta bort preliminär person":"Avvisa"}</button></div>`;
  return `<section class="review review-match"><div class="review-main">
    <div class="review-heading"><strong>${esc(titles[x.kind]||x.kind)}</strong></div>
    ${preview}${picker}${actions}</div></section>`;
}
function priorityPanel(data,reviews){
  const groups=new Map();
  reviews.filter(bulkEligible).forEach(x=>{
    const key=JSON.stringify([reviewCollection(x),x.field,x.source]);
    const row=groups.get(key)||{collection:reviewCollection(x),field:x.field,source:x.source,count:0,previous:new Set()};
    row.count++;row.previous.add(x.currentSource||"Tidigare registrerat");groups.set(key,row);
  });
  const rules=Object.entries(data.importFieldPreferences||{});
  if(!groups.size&&!rules.length)return "";
  const controls=[...groups.values()].sort((a,b)=>b.count-a.count).map(row=>{
    const key=encodeURIComponent(JSON.stringify([row.collection,row.field,row.source]));
    const prev=[...row.previous].join(" / ");
    return `<div class="source-priority-row">
      <div><strong>${esc(importFieldLabel(row.field,row.collection))}</strong><small>${row.count} konflikter · ${esc(row.collection==="properties"?"Fastighet":row.collection==="contracts"?"Avtal":row.collection==="objects"?"Objekt":"Ärende")}</small></div>
      <label>Prioriterad källa
        <select data-priority-choice="${esc(key)}"><option value="">Välj källa</option>
          <option value="reject">Behåll tidigare (${esc(prev.length>80?"Registrerat i Lokalblick":prev)})</option>
          <option value="accept">Använd ${esc(row.source)}</option>
        </select>
      </label>
      <button type="button" data-priority-apply="${esc(key)}">Välj för alla ${row.count}</button>
    </div>`;
  }).join("");
  const saved=rules.length?`<details><summary>Sparad källprioritet (${rules.length})</summary>
    ${rules.map(([key,choice])=>`<div class="source-priority-row"><small>${esc((key.startsWith('[')?JSON.parse(key):key.split('|')).filter(Boolean).join(' · '))}</small><strong>${choice==="accept"?"Importerad fil":choice==="reject"?"Tidigare data":"Granska konflikter"}</strong><button type="button" data-priority-remove="${esc(encodeURIComponent(key))}">Ta bort regel</button></div>`).join("")}
    <small>Att ta bort en regel ändrar inte redan godkända data.</small></details>`:"";
  return `<section class="detail source-priority">
    <h3>Välj källa för alla konflikter av samma typ</h3>
    <p>Exempel: välj Lokallista eller berikningsfilen för alla fastighetsägare. Endast detta fält påverkas. Beslutet sparas även för nästa import från samma fil.</p>
    ${controls||"<p>Inga kvarvarande fältkonflikter.</p>"}${saved}
    <small>Avtalsmatchningar och preliminära personer kräver separat kontroll.</small>
  </section>`;
}
export function importReceiptHtml(source,data) {
  const receipt=source.receipt;if(!receipt)return '';
  const ids=new Set(receipt.reviewIds||[]),pending=(data.importReview||[]).filter(row=>ids.has(row.id)&&row.status==='pending');
  const groups=importReviewGroups(pending);
 const columns=receipt.columns||[],used=columns.filter(column=>column.read>0),ignored=columns.filter(column=>column.target==='@ignore'),empty=columns.filter(column=>column.target!=='@ignore'&&!column.read);
  const columnRows=items=>{
    const sheets=new Map();for(const column of items){const key=JSON.stringify([column.source,column.sheet]);if(!sheets.has(key))sheets.set(key,[]);sheets.get(key).push(column);}
    return [...sheets.values()].map(columns=>`<section><small>${columns[0].source!==source.name?esc(columns[0].source)+' · ':''}${esc(columns[0].sheet)}</small>${columns.map(column=>`<div class="import-receipt-column"><strong>${esc(column.header)}</strong><span>${column.target==='@ignore'?'Importeras inte':esc(column.label)+(column.itemLabel?' · '+esc(column.itemLabel):'')}<small>${column.target==='@ignore'?'':num(column.read)+(column.read===1?' läst värde':' lästa värden')+(column.skipped?' · '+num(column.skipped)+' utanför importen':'')+(column.review?' · '+num(column.review)+' avvikelser vid importen':'')}</small></span></div>`).join('')}</section>`).join('');
  };
  const totals=(receipt.tables||[]).reduce((sum,row)=>({created:sum.created+row.created,updated:sum.updated+row.updated,unchanged:sum.unchanged+(row.unchanged||0)}),{created:0,updated:0,unchanged:0});
  return `<section class="detail import-receipt" data-import-receipt><h3>Importresultat · ${esc(source.name)}</h3><small>${esc(new Date(source.importedAt).toLocaleString('sv-SE'))}</small>
    <p>${num(totals.created)} nya · ${num(totals.updated)} kompletterade · ${num(totals.unchanged)} oförändrade poster · ${ignored.length} ${ignored.length===1?'bortvald kolumn':'bortvalda kolumner'}</p>
    <small>${num(receipt.scannedRows??(receipt.deferredRecords?receipt.rows:receipt.readRows))} ${receipt.scannedRows!=null?'granskade källrader':receipt.deferredRecords?'kontrollerade källrader':receipt.readRows===1?'inläst källrad':'inlästa källrader'}${receipt.partialRows?' · '+num(receipt.partialRows)+' delvis inlästa':''}${receipt.ignoredRows?' · '+num(receipt.ignoredRows)+' källrader med bara bortvalda eller tomma fält':''}${receipt.deferredRecords?' · '+num(receipt.deferredRecords)+' poster inväntar godkännande':''}${receipt.rejectedRows?' · '+num(receipt.rejectedRows)+(receipt.rejectedRows===1?' rad lämnades utanför':' rader lämnades utanför'):''}. Resultatet gäller denna import.</small>
    ${pending.length?`<div data-receipt-review><h4>Att kontrollera (${groups.length} ${groups.length===1?'problemtyp':'problemtyper'})</h4>${groups.map(group=>`<p>${group.category==='blocked'?'Kan inte läsas in':group.category==='values'?'Välj värde':'Komplettera senare'} · ${esc(createBusinessLabels(data).text(group.reason))} · ${group.rowCount} källrad${group.rowCount===1?'':'er'}</p>`).join('')}<small>Öppna granskningsärendena nedan för att se berörda poster och källrader.</small></div>`:''}
    ${used.length?`<details data-receipt-columns="used"><summary>Använda kolumnkopplingar (${used.length})</summary><small>Lästa värden kan vara nya, oförändrade eller avvikande. Olösta avvikelser ändrar inte sparade värden.</small>${columnRows(used)}</details>`:''}
    ${empty.length?`<details data-receipt-columns="empty"><summary>Kolumner utan inlästa värden (${empty.length})</summary>${columnRows(empty)}</details>`:''}
    ${ignored.length?`<details data-receipt-columns="ignored"><summary>Bortvalda kolumner (${ignored.length})</summary>${columnRows(ignored)}</details>`:''}
    <details data-receipt-tables open><summary>Resultat per register</summary>${table(['Register','Inlästa','Nya','Kompletterade','Oförändrade'],importTableRows(receipt.tables||[]).map(item=>row([esc(item.label),num(item.created+item.updated+(item.unchanged||0)),num(item.created),num(item.updated),num(item.unchanged)])))}</details>
    <small>Kolumnvalen återanvänds vid nästa liknande import. Ändra dem före importen; bortval raderar inte redan sparade uppgifter.</small>
  </section>`;
}
export function sources(data, transport) {
  const st = transport.status(),
    company = transport.company();
  const reviews = data.importReview.filter((x) => x.status === "pending");
  const receipts=(data.sourceRegistry||[]).filter(source=>source.receipt).sort((a,b)=>String(b.importedAt).localeCompare(String(a.importedAt)));
  const latestReceipt=receipts[0];
  const activities = data.activities || [];
  const missingHome = activities.filter(a =>
    !a.contractId && !a.propertyId &&
    !(a.scopeType==="unit" && a.unitId) && a.scopeType!=="general"
  ).length;
  const missingResponsible = activities.filter(a=>!a.responsiblePersonId).length;
  const simplifiedQuality = '<section class="detail"><div class="section-title"><h3>Att komplettera</h3><button type="button" data-view="plan">Öppna Planera</button></div><p><strong>' +
    missingHome + '</strong> ärenden utan hemvist · <strong>' +
    missingResponsible + '</strong> utan ansvarig · <strong>' +
    reviews.length + '</strong> importärenden att granska.</p><small>Komplettera ärende och ansvar på ett ställe. Övriga vyer hämtar samma uppgifter.</small></section>';

  const allProperties = data.properties || [];
  const hasGeo = p => p.latitude != null && p.longitude != null && p.latitude !== "" && p.longitude !== "" &&
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
  const missingGeo = allProperties.filter(p => !hasGeo(p));
  const manualCount = allProperties.filter(p => hasGeo(p) && p.geoSource === "manual").length;
  const geoPanel = '<section class="detail geo-quality"><div class="section-title"><h3>Geodata och kartplacering</h3>' +
    '<button type="button" data-geo-retry>Försök geokoda igen</button></div>' +
    '<p><strong>' + (allProperties.length - missingGeo.length) + ' av ' + allProperties.length +
    '</strong> fastigheter har en position · ' + manualCount + ' manuellt placerade · ' +
    missingGeo.length + ' saknar koordinater.</p>' +
    (missingGeo.length
      ? '<p>Placera återstående fastigheter direkt på kartan. Klicka på adressen och välj byggnadens läge.</p>' +
        '<details class="geo-details"><summary>Visa fastigheter som saknar position (' + missingGeo.length + ')</summary><div class="geo-missing-list">' + missingGeo.slice().sort((a,b) =>
          new Intl.Collator("sv-SE",{numeric:true,sensitivity:"base"}).compare(a.address || a.designation || "",b.address || b.designation || "")
        ).map(p => '<div class="geo-missing-row"><span><strong>' +
          esc(p.address || p.designation || "Fastighet utan adress") + '</strong><small>' +
          esc(p.city || "Ort saknas") + '</small></span><button type="button" data-geo-place="' +
          esc(p.id) + '">Placera på karta</button></div>').join("") + '</div></details>'
      : '<p>Alla fastigheter har koordinater.</p>') + '</section>';

  const workingState = st.staged
    ? '<section class="detail"><strong>Osparad Lokalblick-arbetsyta</strong><p>Importerna och berikningarna ligger samlade i den här webbläsaren. Du kan läsa in fler filer utan mellansparning. Välj Spara som Lokalblick-data för att skapa din permanenta Excel-fil.</p><button type="button" data-source="create">Spara som Lokalblick-data</button></section>'
    : '';
  // Source registry may have several processing stages for one physical file.
  const sourceGroups=new Map();
  (data.sourceRegistry||[]).forEach(src=>{
    const name=String(src.name||"").trim(),key=name.toLocaleLowerCase("sv");
    const sheets=String(src.sheets||"").split(",").map(x=>x.trim()).filter(Boolean);
    const existing=sourceGroups.get(key);
    if(!existing)sourceGroups.set(key,{
      name,sheets:new Set(sheets),kinds:new Set([sourceKindLabel(src.kind)]),
      rows:Number(src.rows)||0,matched:Number(src.matched)||0,created:Number(src.created)||0,
      review:Number(src.review)||0,importedAt:src.importedAt||""
    });
    else {
      sheets.forEach(x=>existing.sheets.add(x));existing.kinds.add(sourceKindLabel(src.kind));
      existing.rows+=Number(src.rows)||0;existing.matched+=Number(src.matched)||0;
      existing.created+=Number(src.created)||0;
      existing.review=Math.max(existing.review,Number(src.review)||0);
      if(String(src.importedAt||"")>String(existing.importedAt))existing.importedAt=src.importedAt;
    }
  });
  return (latestReceipt?importReceiptHtml(latestReceipt,data):'') + workingState + simplifiedQuality + priorityPanel(data,reviews) + geoPanel + `<div class="section-title"><h2>Datakällor och kvalitet</h2><button data-view="people">Personer och parter</button>${st.connected ? `<button data-source="refresh">Läs om</button>` : ""}</div><section class="detail"><strong>${esc(st.fileName || "Ingen arbetsfil ansluten")}</strong><p>${company ? "Läsning och sparande sker genom företagets lokala API. Källadaptrar konfigureras i backend." : st.sourceKind === "migration" ? "Källfilen är skrivskyddad. Läs in fler Excel-filer och skapa sedan Lokalblick-data." : "Excel är källunderlag. Lokalblick matchar och berikar sin egen datamodell utan att skapa parallella tabeller."}</p>${company ? `<div class="actions"><button data-source="import">Läs in underlag</button></div><p><small>Underlagen läses och granskas lokalt. Godkända uppgifter och historik sparas tillsammans i företagets backend.</small></p>` : `<div class="actions"><button data-source="import">Läs in underlag</button>${st.mode==='database'?'<a href="/api/lokaler/workbook" download>Hämta Excel-kopia</a>':'<button data-source="connect">Anslut Lokalblick-data</button><button data-source="create">Skapa Lokalblick-data</button>'}${!data.cleanModel?'<button data-source="new-clean">Ny ren arbetsyta</button>':''}</div><details><summary>Avancerade filåtgärder</summary><button data-source="blank">Ny tom Lokalblick-data</button><p><small>En tom arbetsfil innehåller ingen tidigare data.</small></p></details><p><small>Välj ett befintligt fält eller Importera inte för varje kolumn. Granska nya, kompletterade och oförändrade poster innan du genomför importen. Samma val gäller även för igenkända underlag.</small></p>`}</section>${table(
    ["Källa", "Flik(ar)", "Typ", "Rader", "Matchat", "Skapat", "Granska", "Importerad"],
    [...sourceGroups.values()].map(x =>
      row([
        esc(x.name) + receipts.filter(source=>source!==latestReceipt&&source.name===x.name).map(source=>'<details><summary>Visa importresultat</summary>'+importReceiptHtml(source,data)+'</details>').join(''),
        esc([...x.sheets].join(", ") || "–"),
        esc([...x.kinds].join(" + ")),
        num(x.rows),
        num(x.matched),
        num(x.created),
        num(x.review),
        esc(x.importedAt),
      ]),
    ),
  )}<div class="section-title review-title"><h3>Att kontrollera (${importReviewGroups(reviews.filter(row=>row.kind==='canonical-conflict')).length+reviews.filter(row=>row.kind!=='canonical-conflict').length} grupper)</h3><div class="actions"><small>Välj vilket värde som ska gälla. Valet loggas i ändringshistoriken.</small><button type="button" data-export-reviews ${reviews.length ? "" : "disabled"}>Exportera granskningsfel (JSON)</button></div></div><details class="review-details"${reviews.some(row=>row.kind!=='canonical-conflict')?' open':''}><summary>Visa kompletteringar och värdeval</summary>${
    (importReviewGroups(reviews.filter(x=>x.kind==='canonical-conflict')).map(group=>`<details data-source-review-group><summary>${group.category==='blocked'?'Kan inte läsas in':group.category==='values'?'Välj värde':'Komplettera senare'} · ${esc(createBusinessLabels(data).text(group.reason))} · ${group.rowCount} källrad${group.rowCount===1?'':'er'}</summary>${group.reviews.map(review=>reviewStandardCard(data,review)).join('')}</details>`).join('')+
    reviews.filter(x=>x.kind!=='canonical-conflict').map(x=>x.kind==='conflict'||x.kind==='operational-conflict'?reviewConflictCard(data,x):reviewStandardCard(data,x)).join('')) || "<p>Inga öppna matchningar eller konflikter.</p>"
  }</details><details><summary>Ändringar som väntar på Excel (${st.pendingChanges?.length || 0})</summary>${table(
    ["Flik", "Post", "Ändring"],
    (st.pendingChanges || []).map((x) =>
      row([esc(x.sheet), esc(createBusinessLabels(data).text(x.id)), esc(x.action)]),
    ),
  )}</details>`;
}
export function organization(data,{partyId="",query="",mode="people",affiliation=""}={}) {
  const parties=data.organizations||[],people=data.people||[];
  const selected=parties.some(p=>p.id===partyId)?partyId:"";
  const search=String(query||"").trim().toLocaleLowerCase("sv");
  const matchingParty=p=>!affiliation||partyAffiliation(p?.type)===affiliation;
  const visible=people.filter(p=>(!selected||p.organizationId===selected)&&matchingParty(parties.find(o=>o.id===p.organizationId))&&
    (!search||[p.name,p.role,p.phone,p.email,parties.find(o=>o.id===p.organizationId)?.name].join(" ").toLocaleLowerCase("sv").includes(search)));
  const partyName=id=>parties.find(p=>p.id===id)?.name||"Ingen part kopplad";
  const partyMatches=p=>!search||[p.name,p.organizationNumber,p.type].join(" ").toLocaleLowerCase("sv").includes(search);
  const visibleParties=parties.filter(p=>(!selected||p.id===selected)&&matchingParty(p)&&partyMatches(p));
  return `<div class="section-title people-title"><h2>Personer och parter</h2><div class="people-actions">${edit("people","","Lägg till person")}${edit("organizations","","Lägg till part")}${edit("assignments","","Tilldela ansvar")}</div></div>
  <div class="people-register-modes" role="group" aria-label="Visa register"><button type="button" data-people-mode="people" class="${mode==="people"?"active":""}" aria-pressed="${mode==="people"}">Personer (${people.length})</button><button type="button" data-people-mode="parties" class="${mode==="parties"?"active":""}" aria-pressed="${mode==="parties"}">Parter / företag (${parties.length})</button></div>
  <div class="people-affiliation-filters" role="group" aria-label="Filtrera på tillhörighet">${["Alla","Hyresgäst","Lokalsamordnare","Fastighetsägare"].map(t=>`<button type="button" data-people-affiliation="${t==="Alla"?"":esc(t)}" class="${(affiliation||"")===(t==="Alla"?"":t)?"active":""}" aria-pressed="${(affiliation||"")===(t==="Alla"?"":t)}">${t}</button>`).join("")}</div>
  <div class="people-register-tools"><label>Part<select data-people-party-filter><option value="">Alla parter</option>${[...parties].filter(matchingParty).sort((a,b)=>a.name.localeCompare(b.name,"sv")).map(p=>`<option value="${esc(p.id)}"${selected===p.id?" selected":""}>${esc(p.name)}</option>`).join("")}</select></label>
  <label>Sök person eller part<input type="search" data-people-query value="${esc(query)}" placeholder="Namn, befattning, telefon…"></label></div>
  <div class="people-register-count">${mode==="parties"?`${visibleParties.length} av ${parties.length} parter`:`${visible.length} av ${people.length} personer`}${selected?` · ${esc(partyName(selected))}`:""}</div>
  <div class="people-register-list">${mode==="parties"?visibleParties.map(p=>`<article class="people-register-item"><div class="people-register-primary"><strong>${esc(p.name)}</strong><small>${esc(partyAffiliation(p.type))} · ${esc(p.organizationNumber||"Organisationsnummer saknas")}</small><small>${people.filter(person=>person.organizationId===p.id).length} kopplade personer</small></div><div class="people-register-secondary"><div class="people-register-edit">${edit("organizations",p.id)}</div></div></article>`).join("")||'<p class="muted">Inga parter matchar urvalet.</p>':visible.map(p=>`<article class="people-register-item">
    <div class="people-register-primary"><div class="people-register-person-line"><strong>${esc(p.name)}</strong><span class="people-register-affiliation">${esc(partyAffiliation(parties.find(o=>o.id===p.organizationId)?.type))}</span></div><small>${esc(p.role||"Ingen befattning")}</small><small>${esc(partyName(p.organizationId))}</small></div>
    <div class="people-register-secondary"><small>${esc(p.phone||"")}</small><div class="people-register-edit">${edit("people",p.id)}</div></div>
  </article>`).join("")||'<p class="muted">Inga personer matchar urvalet.</p>'}</div>
  <details class="people-register-extra"><summary>Ansvar och kontaktpersoner (${(data.assignments||[]).length})</summary>${table(['Person','Roll','Från','Till',''],(data.assignments||[]).map(a=>row([esc(people.find(p=>p.id===a.personId)?.name||a.personId),esc(a.role),esc(a.fromDate||'Okänt'),esc(a.toDate||'Ej angivet'),edit('assignments',a.id)])))}</details>
  <details class="people-register-extra"><summary>Visa parter (${parties.length})</summary>${table(["Part",...(data.cleanModel?['Organisationsnummer']:[]),"Typ",""],parties.map(p=>row([esc(p.name),...(data.cleanModel?[esc(p.organizationNumber||'–')]:[]),esc(p.type),edit("organizations",p.id)])))}</details>`;
}
