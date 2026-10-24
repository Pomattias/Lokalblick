import {objectLabel} from './view-format.js';
// Property, object and agreement views of the shared portfolio.
import {esc,money,calc,row,propertyDesignation,propertyAddressCell,num,propertyById,badge,personLabel,edit,units,propertyAddress,propertyOwnerLabel,propertyLabel,table,propertyReference,indexFormat} from "./view-format.js";
import {tenantName,contractPhase,rentalTotals,recordContext,isOpenIssue} from "./portfolio-context.js";
import {portfolioDashboard} from "./portfolio-dashboard.js";
import {isoDate} from "./date-format.js";
import {issueNeedsLink} from "../lokaler/issue-identity.js";
import {responsible,scope} from "./model.js";
import {activityChoices} from "./activity-options.js";
function contractComponentLabel(v) {
  if (v.status === "Behöver kontroll")
    return `<span title="${esc(v.reason || "Kontrollera avtalsunderlaget")}" class="rent-needs-review">${v.amount > 0 ? money(v.amount) + " · " : ""}Kontrollera</span>`;
  return v.amount > 0
    ? `<span title="${esc(v.status + " · " + v.source)}">${money(v.amount)}</span>`
    : "–";
}
function contractRows(data, contracts, year, portfolio = false) {
  return contracts.map(c=>{
    const p=(data.properties||[]).find(p=>p.id===c.propertyId)||{};
    const v=calc().annualValues(c,year,0,data.indexSeries);
    const area=Number(c.area)||0;
    const total=v.total;
    const complete=v.rent.status!=="Behöver kontroll"&&v.addition.status!=="Behöver kontroll";
    return row([
      esc(propertyDesignation(p) || (p.id ? "Beteckning saknas" : "Ej kopplad")),
      propertyAddressCell(p),
      `<button class="text-button" data-open-contract="${esc(c.id)}"><strong>${esc(c.number||c.id)}</strong></button><small>${esc(tenantName(data,c))}</small>`,
      num(area),
      contractComponentLabel(v.rent),
      contractComponentLabel(v.addition),
      portfolio ? area&&v.rent.status!=="Behöver kontroll"?money(v.rent.amount/area):"–" : area&&total&&complete?money(total/area):"–",
      esc(c.end||"–"),
      esc(c.noticePeriodMonths==null||c.noticePeriodMonths===""?"–":c.noticePeriodMonths+" mån"),
      `<button class="table-pencil" data-edit="contracts" data-id="${esc(c.id)}" aria-label="Redigera avtal ${esc(c.number||c.id)}" title="Redigera">✎</button>`
    ],portfolio?{3:area,4:v.rent.amount,5:v.addition.amount,6:area?v.rent.amount/area:0,8:Number(c.noticePeriodMonths)||0}:{});
  });
}
export function dashboard(data, selection, year, mode = "") {
  return portfolioDashboard(data, selection, year, mode);
}
function activityRows(data, items, portfolio=false) {
  return items.map(x => {
    const property = propertyById(data, x.propertyId);
    const notes=(data.auditLog||[]).filter(h=>h.collection==="activities"&&String(h.recordId)===String(x.record.id)&&h.action==="Journalanteckning").sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
    const latest=notes[0];
    const date=latest?.at&&!Number.isNaN(Date.parse(latest.at))?isoDate(latest.at):null;
    return row([
      `<strong><button type="button" class="text-button" data-edit="activities" data-id="${esc(x.record.id)}">${esc(x.title)}</button></strong><small>${portfolio?esc(x.record.id)+" · ":""}${esc(x.label)} · <button type="button" class="activity-note-link" data-open-activity-journal="${esc(x.record.id)}">Noteringar (${notes.length})${date?" · "+date:""}</button></small>`,
      portfolio&&issueNeedsLink(x.record)?badge("Att koppla"):esc(propertyDesignation(property) || (property ? "Beteckning saknas" : "Ej kopplad")),
      propertyAddressCell(property),
      esc(personLabel(data, responsible(data, x.collection, x.record))),
      badge(x.record.status),
      money(x.cost),
      edit(x.collection, x.record.id),
    ],portfolio?{5:x.cost}:{});
  });
}
function contactNames(data, type, record, role, fallback) {
  const model = globalThis.LokalblickResponsibility;
  const links = model.current(data, type, record.id, role);
  const ids = links.length ? links.map(link => link.personId)
    : model.history(data, type, record.id, role).length ? [] : [fallback];
  return [...new Set(ids.filter(Boolean).map(id => personLabel(data, id)))].join(", ") || "Ej fördelat";
}
function propertyListGroup(data, p, contracts, year, portfolioView) {
  const title = propertyDesignation(p) || "Beteckning saknas";
  const detailId = "property-relations-" + encodeURIComponent(p.id);
  const totalContracts = data.contracts.filter(c => c.propertyId === p.id&&(!portfolioView||contractPhase(data,c)==='current')).length;
  const subset = contracts.length !== totalContracts;
  const area = contracts.reduce((sum, c) => sum + (Number(c.area) || 0), 0);
  const cost = portfolioView ? rentalTotals(data,contracts,year) : calc().propertyAnnualCost(data, p.id, year);
  const openCount=portfolioView ? recordContext(data,'properties',p.id,{},{},false,portfolioView).issues.filter(isOpenIssue).length : 0;
  const ourContact = contactNames(data, "property", p, "our", p.responsiblePersonId);
  const ownerContact = contactNames(data, "property", p, "owner", p.ownerResponsiblePersonId);
  const contractContact = c => globalThis.LokalblickResponsibility.history(data,"contract",c.id,"our").length || c.responsiblePersonId
    ? contactNames(data,"contract",c,"our",c.responsiblePersonId) : ourContact;
  const contacts = `<section class="property-list-contacts"><h3>Kontaktpersoner</h3><dl>${portfolioView?"":`<div><dt>Vår ansvarige</dt><dd>${esc(ourContact)}</dd></div>`}<div><dt>Fastighetsägarens kontaktperson</dt><dd>${esc(ownerContact)}</dd></div></dl></section>`;
  const agreements = `<section class="property-list-contracts"><h3>Avtal${subset ? ` · ${contracts.length} av ${totalContracts} i aktuellt urval` : ` · ${contracts.length}`}</h3>${contracts.length ? `<ul>${contracts.map(c => `<li><div><button type="button" class="text-button" data-edit="contracts" data-id="${esc(c.id)}">${esc(c.number || c.id)}</button><small>${esc(portfolioView?tenantName(data,c):units[c.unitId] || c.use || "Verksamhet saknas")}</small></div><dl>${portfolioView?"":`<div><dt>Vår ansvarige för avtalet</dt><dd>${esc(contractContact(c))}</dd></div>`}<div><dt>Hyresgästens kontaktperson</dt><dd>${esc(contactNames(data,"contract",c,"tenant",c.tenantResponsiblePersonId))}</dd></div></dl></li>`).join("")}</ul>` : `<p>${totalContracts ? "Inga avtal i aktuellt urval." : "Inga avtal kopplade till fastigheten."}</p>`}</section>`;
  return `<tbody data-row-group="${esc(p.id)}"><tr class="property-list-summary">
    <td class="primary-cell"><button type="button" class="text-button" data-edit="properties" data-id="${esc(p.id)}">${esc(title)}</button>${openCount?`<small><button type="button" class="text-button" data-context-record="properties" data-id="${esc(p.id)}" data-context-target-tab="issues">${openCount} öppna ärenden</button></small>`:""}</td>
    <td>${esc(propertyAddress(p) || "Adress saknas")}<small class="property-list-owner">${esc(propertyOwnerLabel(data,p))}</small></td>
    <td><span class="property-list-mobile-label">Vår ansvarige: </span>${esc(ourContact)}</td>
    <td data-sort-value="${contracts.length}">${num(contracts.length)} avtal${subset?`<small>av ${num(totalContracts)} totalt</small>`:""}</td>
    <td data-sort-value="${area}">${num(area)} m²</td>
    <td data-sort-value="${portfolioView?cost.rent:cost.annualCost}"><span title="${portfolioView?"Avtalshyra för avtalen i aktuellt urval":"Beräknat från avtalets hyra, tillägg, fastighetsskatt och aktuella avtalsperioder. Avser hela fastigheten."}">${money(portfolioView?cost.rent:cost.annualCost)}</span>${cost.needsReview?`<small class="rent-needs-review">${cost.needsReview} avtal behöver kontroll</small>`:""}${cost.preliminary?`<small>${cost.preliminary} preliminära index</small>`:""}</td>
    <td>${portfolioView?edit("properties",p.id):""}<button type="button" class="property-list-toggle" data-row-toggle aria-expanded="false" aria-controls="${esc(detailId)}" aria-label="Visa eller dölj avtal och ansvariga för ${esc(title)}"><svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m6 8 4 4 4-4"/></svg></button></td>
  </tr><tr data-group-detail hidden><td colspan="7"><div id="${esc(detailId)}" class="property-list-relations" role="region" aria-label="Avtal och ansvariga för ${esc(title)}">${contacts}${agreements}</div></td></tr></tbody>`;
}
export function overview(data, s, ui) {
  const v = ui.portfolioView || scope(data, s);
  const title = s.propertyId
    ? propertyLabel(data, s.propertyId)
    : "Aktuellt urval";
  const tabs = ["Fastigheter", "Avtal", "Ärenden"];
  const typeChoices = ["Alla",...new Set([
    ...activityChoices(data,"type").map(x=>x.value),
    ...(data.activities||[]).map(x=>x.type).filter(Boolean)
  ])];
  const selectedType = typeChoices.includes(ui.issueType) ? ui.issueType : "Alla";
  let body = "";
  if (ui.perspective === "Fastigheter") {
    body = table(
      ["Fastighet", "Adress", "Ansvarig hos oss", "Avtal", "Area", `${ui.portfolioView?"Årshyra":"Årskostnad"} ${ui.year}`, ""],
      v.properties.map(p => propertyListGroup(data, p, v.contracts.filter(c => c.propertyId === p.id), ui.year, ui.portfolioView)),
      true,
      "Fastigheter",
      true,
      ui.portfolioView?{key:"properties",noun:"fastigheter"}:{},
    );
  } else if (ui.perspective === "Avtal") {
    body = table(
      ["Fastighet", "Adress", "Avtal", "Kvm", `Hyra ${ui.year}`, `Tillägg ${ui.year}`, ui.portfolioView?"Årshyra/m²":"Kr/kvm", "Avtal t.o.m.", "Uppsägning", ""],
      contractRows(data, v.contracts, ui.year, Boolean(ui.portfolioView)),
      true,
      ui.portfolioView?"Gällande avtal":"Avtal",
      false,ui.portfolioView?{key:"contracts",noun:"avtal"}:{},
    );
    if(ui.portfolioView){
      const history=(v.allContracts||[]).filter(contract=>contractPhase(data,contract)!=='current');
      if(history.length)body+=`<details class="portfolio-contract-history"><summary>Tidigare och kommande avtal · ${history.length}</summary>${table(
        ["Fastighet","Objekt","Avtal","Hyresgäst","Registrerad avtalstid"],
        history.map(contract=>{
          const property=data.properties.find(row=>row.id===contract.propertyId),object=(data.objects||[]).find(row=>row.id===contract.objectId);
          return `<tr><td>${esc(propertyReference(property||{}))}</td><td>${esc(objectLabel(object))}</td><td><button type="button" class="text-button" data-edit="contracts" data-id="${esc(contract.id)}">${esc(contract.number||contract.id)}</button></td><td>${esc(tenantName(data,contract))}</td><td>${esc(contract.start||'Start saknas')} – ${esc(contract.end||'Tills vidare')}</td></tr>`;
        }),true,"Tidigare och kommande avtal",false,{key:"contracts-history",noun:"avtal"})}</details>`;
    }
  } else
    body = table(
      ["Ärende", "Fastighet", "Adress", "Ansvarig", "Status", "Kostnad", ""],
      activityRows(
        data,
        v.items.filter((x) => ui.perspective === "Ärenden" &&
          (selectedType === "Alla" || x.record.type === selectedType)),
        Boolean(ui.portfolioView),
      ),
      true,
      "Ärenden",false,ui.portfolioView?{key:"activities",noun:"ärenden"}:{},
    );
  const typeButtons = ui.perspective === "Ärenden"&&!ui.hideIssueTypeButtons ?
    `<div class="issue-type-filters" aria-label="Filtrera ärenden">${typeChoices.map(type=>`<button type="button" data-issue-type="${esc(type)}" class="${selectedType===type?"active":""}" aria-pressed="${selectedType===type}">${esc(type)}</button>`).join("")}</div>`:"";
  const header=ui.hidePerspectiveTabs && !s.propertyId ?
    ({Fastigheter:"Fastigheter",Avtal:"Avtal","Ärenden":"Ärenden"}[ui.perspective]||title) : title;
  const perspectiveTabs=ui.hidePerspectiveTabs ? "" :
    `<div class="tabs">${tabs.map((x) => `<button data-perspective="${x}" class="${ui.perspective === x ? "active" : ""}">${x}</button>`).join("")}</div>`;
  return `<div class="section-title"><h2>${esc(header)}</h2>${s.propertyId ? "<button data-clear-property>Visa hela urvalet</button>" : ""}</div>${perspectiveTabs}${typeButtons}${body}${ui.contractId ? contractDetail(data, ui.contractId, ui.year,{portfolio:Boolean(ui.portfolioView)}) : ""}`;
}
function contractIndexBreakdown(c, name, v, rawShare) {
  const amount = v.status === "Behöver kontroll" && v.amount <= 0
    ? "Kan inte beräknas" : money(v.amount);
  const ruleText=v.method==="none"?"Oförändrat":
    v.method==="fixed"?"Fast "+indexFormat(v.annualPercent)+" %/år":
    v.method==="kpi-limited"?"Min "+(v.minPercent??"–")+" % / max "+(v.maxPercent??"–")+" % ("+(v.limitBasis==="index"?"KPI":"hyra")+")":null;
  const indexText = ruleText?ruleText:v.calculated && v.share > 0
    ? `${v.indexYear}: ${indexFormat(v.usedIndex)}${v.preliminary ? " (preliminärt)" : ""}`
    : v.share === 0 && v.calculated ? "Ej tillämpligt (0 %)" : "Saknas";
  const basisText = v.calculated && v.share > 0
    ? `${v.baseYear}: ${indexFormat(v.bastal)}` :
      v.baseYear ? String(v.baseYear) : "–";
  const share = v.method==="none"||v.method==="fixed"?"–":rawShare === "" || rawShare == null ? "Saknas" :
    Number.isFinite(v.share) ? indexFormat(v.share * 100) + " %" : "Ogiltig";
  return `<tr><th scope="row">${esc(name)}</th><td>${money(v.base)}</td><td>${esc(basisText)}</td><td>${esc(share)}</td><td>${esc(indexText)}</td><td><strong>${esc(amount)}</strong></td><td>${badge(v.status)}</td></tr>`;
}
export function contractDetail(data, id, year, presentation={}) {
  const c=data.contracts.find((x)=>x.id===id);
  if(!c)return "";
  const p=data.properties.find((x)=>x.id===c.propertyId)||{};
  const v=calc().annualValues(c,year,0,data.indexSeries),notice=calc().noticeDate(c);
  const doc=globalThis.LokalblickDocuments.resolve(globalThis.LokalblickDocuments.fromContract(c),globalThis.LokalblickContractDocumentCache);
  const acts=(data.activities||[]).filter((a)=>a.contractId===c.id);
  const orders=(data.orders||[]).filter((o)=>acts.some((a)=>a.id===o.activityId));
  return `<section class="detail"><div class="section-title"><h2>Avtal ${esc(c.number||c.id)}</h2><button data-close-contract>Stäng detalj</button></div>
  <section class="rent-calculation">
    <h3>Årsberäkning ${year}</h3>
    <div class="table-wrap"><table><thead><tr><th>Del</th><th>Basbelopp / år</th><th>Basår / bastal</th><th>Indexandel</th><th>KPI oktober</th><th>Belopp ${year}</th><th>Kontroll</th></tr></thead><tbody>
    ${contractIndexBreakdown(c,"Hyra",v.rent,c.rentIndexPercent)}
    ${contractIndexBreakdown(c,"Tillägg",v.addition,c.additionIndexPercent)}
    </tbody></table></div>
    <p><strong>Fastighetsskatt:</strong> ${money(v.tax)} · <strong>Total årskostnad:</strong> ${money(v.total)}</p>
    <details class="rent-source"><summary>Beräkningsunderlag</summary><p><small>Indexkälla hyra: ${esc(v.rent.source)}${v.rent.reason ? " · "+esc(v.rent.reason) : ""}. Tillägg: ${esc(v.addition.source)}${v.addition.reason ? " · "+esc(v.addition.reason) : ""}.</small></p></details>
  </section>
  <div class="detail-grid">
    <div><small>Verksamhet</small><strong>${esc(units[c.unitId]||c.use||"–")}</strong></div>
    <div><small>Hyresgäst</small><strong>${esc(c.tenantName||"–")}</strong></div>
    <div><small>Hyresgästens kontaktperson · avtal</small><strong>${esc(personLabel(data,c.tenantResponsiblePersonId))}</strong></div>
    <div><small>Vår kontaktperson · fastighet</small><strong>${esc(personLabel(data,p.responsiblePersonId))}</strong></div>
    <div><small>Fastighetsägarens kontaktperson · fastighet</small><strong>${esc(personLabel(data,p.ownerResponsiblePersonId))}</strong></div>
    <div><small>Hyra ${year} · ${esc(v.rent.status)}</small><strong>${v.rent.status==="Behöver kontroll"&&v.rent.amount<=0?"Kontrollera":money(v.rent.amount)}</strong></div>
    <div><small>Tillägg · ${esc(v.addition.status)}</small><strong>${v.addition.status==="Behöver kontroll"&&v.addition.amount<=0?"Kontrollera":money(v.addition.amount)}</strong></div>
    <div><small>Fastighetsskatt</small><strong>${money(v.tax)}</strong></div>
    <div><small>Total årskostnad</small><strong>${money(v.total)}</strong></div>
    <div><small>Hyra kr/kvm · beräknat</small><strong>${c.area>0?num(v.rent.amount/c.area):"–"}</strong></div>
    <div><small>Säg upp senast · beräknat</small><strong>${esc(notice||"–")}</strong></div>
  </div>

  <p>${doc.status==="ready"?`<a href="${esc(doc.href)}" target="_blank" rel="noopener noreferrer">${esc(doc.label)}</a>`:esc(doc.label)} <small>${esc(doc.name)}</small></p>
  <h3>Beställningar</h3>
  ${table([presentation.portfolio?"Ärende":"Aktivitet","Leverantör","Beställt","Utfall","Status",""],orders.map((o)=>{const a=acts.find((x)=>x.id===o.activityId)||{};return row([esc(a.title||o.activityId),esc(o.supplier),money(o.orderedCost),money(o.finalCost),esc(o.paymentStatus||o.completedAt||""),edit("orders",o.id)]);}))}
  <details><summary>Värdenas ursprung</summary>${table(["Fält","Värde","Källa","Rad"],Object.entries(c.provenance||{}).map(([field,x])=>row([esc(field),esc(x.value),esc(x.source),esc(x.row)])))}</details>
  ${edit("contracts",c.id,"Ändra avtal")}</section>`;
}
export function objectList(data,s,ui={}){
  const view=ui.portfolioView||scope(data,s);
  const rows=objects=>objects.map(o=>row([
    `<button type="button" class="text-button" data-edit="objects" data-id="${esc(o.id)}">${esc([objectLabel(o),o.name].filter(Boolean).join(' · '))}</button>`+(String(o.id||"").startsWith("OBJ|")&&!o.number?'<small>Kontrollera objektnummer och koppling</small>':''),
    esc(propertyReference(data.properties.find(p=>p.id===o.propertyId))),num(o.area)+' m²',
    esc((o.start||'Ej angivet')+' – '+(o.end||'tills vidare')),
    view.contracts.filter(c=>c.objectId===o.id).map(c=>`<button type="button" class="text-button" data-object-contract="${esc(c.id)}">${esc(c.number||c.id)}</button>`).join(' ')||'Inget gällande avtal',
    edit('objects',o.id)
  ],ui.portfolioView?{2:Number(o.area)||0}:{}));
  const list=(objects,key,title)=>table(['Objekt','Fastighet','Objektarea','Giltighet','Avtal',''],rows(objects),true,title,false,ui.portfolioView?{key,noun:'objekt'}:{});
  const history=ui.portfolioView?(view.allObjects||[]).filter(o=>!view.objects.includes(o)):[];
  return `<div class="section-title"><h2>Objekt</h2><button data-new-object>Nytt objekt</button></div>${list(view.objects||[],'objects','Gällande objekt')}${history.length?`<details class="portfolio-record-history"><summary>Tidigare och kommande objekt · ${history.length}</summary>${list(history,'objects-history','Tidigare och kommande objekt')}</details>`:''}`;
}
