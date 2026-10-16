import {contractBusinessControls} from './business-editor.js';
import {responsibilityHtml} from "./responsibility-editor.js";
import { esc, options, calc, propertyReference, units } from "./views.js";
import { fieldCaption } from "./field-labels.js";

const CATEGORIES = ["Kontor", "Förråd", "Äldreboende", "LSS-boende", "Bostad", "Daglig verksamhet", "Verksamhetslokal", "Övrigt"];
const money = n => new Intl.NumberFormat("sv-SE", {maximumFractionDigits:0}).format(Number(n)||0) + " kr";
const field = (caption, control, note="") => '<label class="contract-field"><span class="field-name">' + esc(fieldCaption('contracts',control,caption)) + '</span>' + control + (note ? '<small>'+esc(note)+'</small>' : '') + '</label>';
const display = value => '<span class="contract-readonly">' + esc(value || "–") + '</span>';
const input = (c, key, type="text", disabled=false, attrs="") =>
  '<input name="'+key+'" type="'+type+'" value="'+esc(c[key]??"")+'" '+attrs+(disabled?" disabled":"")+'>';
const percent = (c,key) => {
  const value = c[key] == null || c[key] === "" ? "" : Number(c[key]) > 1 ? Number(c[key]) : Number(c[key])*100;
  return '<input name="'+key+'" type="number" value="'+esc(value)+'" step="any" min="0" max="100" placeholder="0–100">';
};
const select = (name, records, c, value, title, blank, disabled=false) =>
  '<select name="'+name+'"'+(disabled?' disabled':'')+'>'+options(records, value, title, c[name], blank)+'</select>';

const METHODS=[
  {id:"kpi",name:"KPI enligt avtalet"},
  {id:"fixed",name:"Fast årlig procent"},
  {id:"kpi-limited",name:"KPI med min/max"},
  {id:"none",name:"Ingen uppräkning"}
];
function adjustmentControls(c,prefix) {
  const method=String(c[prefix+"AdjustmentMethod"]||"kpi");
  const pct=(key,placeholder)=>'<input name="'+prefix+key+'" type="number" step="any" min="-99.99" max="1000" value="'+
    esc(c[prefix+key]??"")+'" placeholder="'+placeholder+'">';
  const conditional=(kind,title,control,note="")=>{
    const visible=kind==="kpi"?["kpi","kpi-limited"].includes(method):
      kind==="fixed"?method==="fixed":kind==="limits"&&method==="kpi-limited";
    return '<div class="contract-rule-field" data-rule-for="'+prefix+'" data-rule-show="'+kind+'"'+(visible?"":" hidden")+'>'+
      field(title,control,note)+'</div>';
  };
  return field("Avtalad justering",
    '<select name="'+prefix+'AdjustmentMethod" data-contract-rule="'+prefix+'">'+
      options(METHODS,x=>x.id,x=>x.name,method)+'</select>')+
    conditional("kpi","Indexandel, %",percent(c,prefix+"IndexPercent"))+
    conditional("fixed","Fast ökning, %/år",pct("AnnualPercent","3"))+
    conditional("limits","Lägsta ökning, %/år",pct("MinPercent","Inte avtalad"))+
    conditional("limits","Högsta ökning, %/år",pct("MaxPercent","Inte avtalad"))+
    conditional("limits","Gränserna gäller",
      '<select name="'+prefix+'LimitBasis">'+options([
        {id:"rent",name:"Hyresökningen"},{id:"index",name:"KPI-förändringen"}
      ],x=>x.id,x=>x.name,c[prefix+"LimitBasis"]||"rent")+'</select>');
}

function chosenCategory(raw) {
  const current=String(raw||"").trim();
  if (/^(ÄBO\b|äldreboende)/i.test(current)) return "Äldreboende";
  if (/^(KP\s+kontor|kontor)/i.test(current)) return "Kontor";
  if (/^(DV\b|daglig verksamhet)/i.test(current)) return "Daglig verksamhet";
  if (/^(LSS\b|gruppbostad|servicebostad)/i.test(current)) return "LSS-boende";
  return current;
}

export function renderContractEditor(data, c, id, company=false) {
  const property=(data.properties||[]).find(p=>p.id===c.propertyId)||{};
  const owner=(data.organizations||[]).find(org=>org.id===property.ownerPartyId);
  const ownerName=owner?.name||property.owner||"Ej angiven på fastigheten";
  const masterLocked=Boolean(id&&!data.isDemo);
  const category=chosenCategory(c.category);
  const choices=CATEGORIES.includes(category)||!category?CATEGORIES:[...CATEGORIES,category];
  const categorySelect='<select name="category"'+(masterLocked?' disabled':'')+'>'+
    options(choices, x=>x, x=>x===category&&!CATEGORIES.includes(x)?x+' (tidigare kategori)':x,category,'Välj kategori')+'</select>';
  const people=data.people||[];
  const ownerContact=people.find(p=>p.id===property.ownerResponsiblePersonId)?.name||"Ej angiven";
  const ourContact=people.find(p=>p.id===property.responsiblePersonId)?.name||"Ej angiven";
  // The responsible person belongs to this contract/object, not to the tenant
  // organization. Preserve existing selections when organization changes.
  // All people remain selectable even if the contract's verksamhet changes.
  const activityPersonOptions=people;
  const verksamhetChoices=Object.entries(units);
  if (c.unitId && !Object.hasOwn(units,c.unitId))
    verksamhetChoices.push([c.unitId,c.unitId+" (tidigare värde – kontrollera)"]);
  const totals=calc().annualValues(c,new Date().getFullYear(),0,data.indexSeries);
  const annualTotal=totals.total;
  const term=calc().projectedContractTerm(c);
  const missing=[totals.rent,totals.addition].filter(x=>x.status==="Behöver kontroll").map(x=>x.reason||"Indexunderlag saknas");
  const doc=String(c.contractDocumentUrl||"").trim();
  const documentLink=/^https?:\/\//i.test(doc)?'<p class="contract-document"><a target="_blank" rel="noopener noreferrer" href="'+esc(doc)+'">Öppna avtalsdokument ↗</a></p>':'';
  const lastNotice=term.noticeBy
    ? 'Senaste dag för uppsägning: <strong>'+esc(term.noticeBy)+'</strong>'+
      (term.renewals?' · Gällande t.o.m. '+esc(term.end):'')+
      (term.nextEnd?' · T.o.m. vid nästa förlängning: '+esc(term.nextEnd):'')
    : 'Ange uppsägningstid för beräkning. Förlängning kräver även förlängningsperiod.';

  const tenantContact = field("Hyresgästens kontaktperson",select("tenantResponsiblePersonId",people,c,x=>x.id,x=>x.name,"Ej kopplad"));
  const contractContact = field("Vår ansvarige för avtalet",select("responsiblePersonId",people,c,x=>x.id,x=>x.name,"Ej kopplad"));
  const distinctTenantContact = c.tenantResponsiblePersonId && c.tenantResponsiblePersonId !== c.businessResponsiblePersonId;
  const distinctContractContact = c.responsiblePersonId && c.responsiblePersonId !== property.responsiblePersonId;
  const identity = '<section class="contract-section" data-contract-section="identity"><h3>Avtal</h3><div class="contract-grid">'+
    (!id&&!c.propertyId ? field("Fastighet",select("propertyId",data.properties||[],c,x=>x.id,propertyReference,"Välj fastighet")) : "")+
    field("Avtalsnummer",input(c,"number","text",masterLocked))+
    field("Hyresgäst",select("tenantPartyId",data.organizations||[],c,x=>x.id,x=>x.name,"Ej kopplad"))+
    field("Objekt",select("objectId",(data.objects||[]).filter(o=>!c.propertyId||o.propertyId===c.propertyId),c,x=>x.id,x=>x.number||x.name||x.id,"Välj objekt"))+
    field("Fastighetsägare",display(ownerName))+
    '</div>'+documentLink+'</section>';

  const rentTerms = '<details class="contract-secondary" data-contract-rent-terms'+(!id?' open':'')+'><summary>Hyresvillkor och beräkning</summary><div class="contract-grid">'+
    field("Bashyra, kr/år",input(c,"baseRent","number",false,'min="0" step="any"'))+
    field("Basår",input(c,"rentBaseYear","number",false,'min="1900" step="1"'))+
    adjustmentControls(c,"rent")+
    field("Bastal KPI",input(c,"rentBaseIndex","number",false,'min="0" step="any"'),"Lämna tomt för fastställt KPI för basåret")+
    '</div><details class="contract-additions"'+(Number(c.baseAdditions)>0?' open':'')+'><summary>Tillägg <span>'+money(totals.addition.amount)+'/år</span></summary><div class="contract-grid">'+
    field("Tillägg, kr/år",input(c,"baseAdditions","number",false,'min="0" step="any"'))+
    field("Tillägg basår",input(c,"additionBaseYear","number",false,'min="1900" step="1"'))+
    adjustmentControls(c,"addition")+
    field("Bastal KPI tillägg",input(c,"additionBaseIndex","number",false,'min="0" step="any"'),"Lämna tomt för KPI för tilläggets basår")+
    '</div></details><div class="contract-grid contract-tax-field">'+
    field("Fastighetsskatt, kr/år",input(c,"annualPropertyTax","number",false,'min="0" step="any"'))+
    '</div><p class="contract-help">Basår är KPI-basår; bashyran avser följande hyresår. Min/max tillämpas enligt avtal. Beräkningen använder senast sparade värden.</p></details>';
  const rentValue = totals.rent.status==="Behöver kontroll" && totals.rent.amount<=0 ? "Behöver kontroll" : money(totals.rent.amount);
  const economics = '<section class="contract-section" data-contract-section="economics"><h3>Hyra och yta</h3><div class="contract-grid">'+
    field("Hyra "+new Date().getFullYear()+", kr/år",display(rentValue))+
    field("Area, m²",input(c,"area","number",masterLocked,'min="0" step="any"'))+
    (totals.addition.amount || totals.tax ? field("Total årskostnad, kr",display(money(annualTotal))) : "")+
    '</div>'+(missing.length?'<p class="rent-needs-review">Behöver kontroll: '+esc(missing.join(' · '))+'</p>':'')+
    rentTerms+'</section>';

  const dates = '<section class="contract-section" data-contract-section="dates"><h3>Avtalstid</h3><div class="contract-grid">'+
    field("Giltigt fr.o.m.",input(c,"start","date"))+
    field("Giltigt t.o.m.",input(c,"end","date"))+
    field("Säg upp senast",display(term.noticeBy || "Ej beräknat"))+
    '</div><details class="contract-secondary" data-contract-notice-terms'+(!id?' open':'')+'><summary>Uppsägning och förlängning</summary><div class="contract-grid">'+
    field("Uppsägningstid, månader",input(c,"noticePeriodMonths","number",false,'min="0" step="1"'))+
    field("Förlängningstid, månader",input(c,"renewalPeriodMonths","number",false,'min="0" step="1"'))+
    '</div><p class="contract-note">'+lastNotice+'</p><small class="contract-help">Beräknat från senast sparade villkor. Faktisk uppsägning behöver registreras innan förlängning påverkar budget.</small></details></section>';

  // Supplementary source and relationship fields stay mounted for FormData,
  // but do not interrupt the agreement's identity, economics and dates.
  const additional = '<details class="contract-secondary" data-contract-context><summary>Fler avtalsuppgifter</summary><div class="contract-grid">'+
    field("Organisatorisk tillhörighet",select("unitId",verksamhetChoices,c,x=>x[0],x=>x[1],"Välj tillhörighet"))+
    field("Lokalkategori",categorySelect)+
    field("Hyresgäst enligt källa",input(c,"tenantName","text",true))+
    field("Verksamhetspart",select("businessPartyId",data.organizations||[],c,x=>x.id,x=>x.name,"Ej kopplad"))+
    '</div>'+contractBusinessControls(data,c)+
    (company?'<p class="computed">Källstyrda masteruppgifter ändras i källunderlaget. Övrigt sparas via backend.</p>':'')+'</details>';

  const extraContacts = (!distinctTenantContact ? tenantContact : "")+(!distinctContractContact ? contractContact : "");
  const contacts = '<section class="contract-section" data-contract-section="contacts"><h3>Kontaktpersoner</h3><div class="contract-grid">'+
    field("Vår kontaktperson för fastigheten",display(ourContact))+
    field("Verksamhetsansvarig",select("businessResponsiblePersonId",activityPersonOptions,c,x=>x.id,x=>x.name,"Ej kopplad"))+
    field("Fastighetsägarens kontaktperson",display(ownerContact))+
    (distinctTenantContact ? tenantContact : "")+
    (distinctContractContact ? contractContact : "")+
    '</div>'+(extraContacts?'<details class="contract-secondary" data-contract-contact-roles><summary>Fler kontaktroller</summary><div class="contract-grid">'+extraContacts+'</div></details>':'')+
    responsibilityHtml(data,'contract',c.id)+'</section>';

  const heading = property.designation || (property.address ? "Beteckning saknas" : "Nytt avtal");
  return '<div class="editor-backdrop"></div><aside class="editor contract-editor" aria-labelledby="editor-title">'+
    '<form id="edit-form" data-collection="contracts" data-record-id="'+esc(id||"")+'">'+
    '<div class="section-title"><div><h2 id="editor-title">'+esc(heading)+'</h2>'+
    (property.address?'<small>'+esc(property.address)+'</small>':'')+
    '</div><button type="button" data-editor-close>Stäng</button></div>'+
    identity+economics+dates+additional+contacts+
    '<div class="actions editor-actions"><button type="submit" class="primary">Spara ändring</button></div></form></aside>';
}
