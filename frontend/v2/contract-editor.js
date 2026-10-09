import { esc, options, calc, propertyReference } from "./views.js";

const CATEGORIES = ["Kontor", "Förråd", "Äldreboende", "LSS-boende", "Bostad", "Daglig verksamhet", "Verksamhetslokal", "Övrigt"];
const money = n => new Intl.NumberFormat("sv-SE", {maximumFractionDigits:0}).format(Number(n)||0) + " kr";
const field = (caption, control, note="") => '<label class="contract-field">' + esc(caption) + control + (note ? '<small>'+esc(note)+'</small>' : '') + '</label>';
const display = value => '<span class="contract-readonly">' + esc(value || "–") + '</span>';
const input = (c, key, type="text", disabled=false, attrs="") =>
  '<input name="'+key+'" type="'+type+'" value="'+esc(c[key]??"")+'" '+attrs+(disabled?" disabled":"")+'>';
const percent = (c,key) => {
  const value = c[key] == null || c[key] === "" ? "" : Number(c[key]) > 1 ? Number(c[key]) : Number(c[key])*100;
  return '<input name="'+key+'" type="number" value="'+esc(value)+'" step="any" min="0" max="100" placeholder="0–100">';
};
const select = (name, records, c, value, title, blank, disabled=false) =>
  '<select name="'+name+'"'+(disabled?' disabled':'')+'>'+options(records, value, title, c[name], blank)+'</select>';

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
  const people=(data.people||[]).filter(p=>!c.businessPartyId||p.organizationId===c.businessPartyId);
  const totals=calc().annualValues(c,new Date().getFullYear(),0,data.indexSeries);
  // Media was the legacy name for Tillägg, not an additional cost. Existing
  // source values can be edited as Tillägg without showing a second field.
  const legacyAddition=Number(c.annualContractDrift)||0;
  const needsLegacyAddition=!(Number(c.baseAdditions)>0)&&legacyAddition>0;
  const additionForm=needsLegacyAddition
    ? {...c,baseAdditions:legacyAddition,additionIndexPercent:c.additionIndexPercent==null || c.additionIndexPercent==="" ? 0 : c.additionIndexPercent}
    : c;
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

  return '<div class="editor-backdrop"></div><aside class="editor contract-editor" aria-labelledby="editor-title">'+
    '<form id="edit-form" data-collection="contracts" data-record-id="'+esc(id||"")+'">'+
      '<div class="section-title"><div><small>'+(id?'ÄNDRA':'NYTT')+' AVTAL</small>'+
        '<h2 id="editor-title">'+esc(propertyReference(property)||"Avtal")+'</h2>'+
        '<small>'+esc(c.number||"Nytt avtal")+'</small></div><button type="button" data-editor-close>Stäng</button></div>'+
      '<section class="contract-section"><h3>Avtalsuppgifter</h3><div class="contract-grid">'+
        field("Fastighet", select("propertyId",data.properties||[],c,x=>x.id,propertyReference,"Välj fastighet",masterLocked))+
        field("Fastighetsägare",display(ownerName))+
        field("Hyresgäst",select("businessPartyId",data.organizations||[],c,x=>x.id,x=>x.name,"Ej kopplad"))+
        field("Kontaktperson",select("businessResponsiblePersonId",people,c,x=>x.id,x=>x.name,"Ej kopplad"))+
        field("Avtalsnummer",input(c,"number","text",masterLocked))+
        field("Lokalkategori",categorySelect)+
        field("Area, m²",input(c,"area","number",masterLocked,'min="0" step="any"'))+
      '</div></section>'+
      '<section class="contract-section"><h3>Avtalstid</h3><div class="contract-grid">'+
        field("Fr.o.m.",input(c,"start","date"))+
        field("T.o.m.",input(c,"end","date"))+
        field("Uppsägningstid, månader",input(c,"noticePeriodMonths","number",false,'min="0" step="1"'))+
        field("Automatisk förlängning, månader",input(c,"renewalPeriodMonths","number",false,'min="0" step="1"'))+
      '</div><p class="contract-note">'+lastNotice+'</p>'+
      '<small class="contract-help">Beräknat från senast sparade villkor. Faktisk uppsägning behöver registreras innan förlängning påverkar budget.</small></section>'+
      '<section class="contract-section"><h3>Hyra och index</h3><div class="contract-grid">'+
        field("Bashyra, kr/år",input(c,"baseRent","number",false,'min="0" step="any"'))+
        field("Basår",input(c,"rentBaseYear","number",false,'min="1900" step="1"'))+
        field("Indexuppräkning, %",percent(c,"rentIndexPercent"))+
        field("Bastal KPI",display(totals.rent.bastal||"Saknas"),"Från KPI eller avtalat bastal")+
      '</div>'+
      '<details class="contract-additions"'+((Number(c.baseAdditions)>0||needsLegacyAddition)?' open':'')+'>'+
        '<summary>Tillägg <span>'+money(totals.addition.amount)+'/år</span></summary><div class="contract-grid">'+
          field("Tillägg, kr/år",input(additionForm,"baseAdditions","number",false,'min="0" step="any"'))+
          field("Tillägg basår",input(c,"additionBaseYear","number",false,'min="1900" step="1"'))+
          field("Indexuppräkning tillägg, %",percent(additionForm,"additionIndexPercent"))+
          field("Bastal KPI tillägg",display(totals.addition.bastal||"Saknas"),"Från KPI eller avtalat bastal")+
        '</div></details>'+
      '<div class="contract-grid contract-tax-field">'+
        field("Fastighetsskatt, kr/år",input(c,"annualPropertyTax","number",false,'min="0" step="any"'))+
      '</div>'+
      '<div class="contract-rent-total"><span>Beräknad årskostnad '+new Date().getFullYear()+'</span>'+
        '<strong>'+money(annualTotal)+'</strong>'+
        '<small>Hyra '+money(totals.rent.amount)+' · Tillägg '+money(totals.addition.amount)+' · Fastighetsskatt '+money(totals.tax)+'</small>'+
        '<small>'+(missing.length?'Behöver kontroll: '+esc(missing.join(' · ')):'Utifrån senast sparade värden')+'</small></div>'+
        documentLink+
      '</section>'+
      (company?'<p class="computed">Källstyrda masteruppgifter ändras i källunderlaget. Övrigt sparas via backend.</p>':'')+
      '<div class="actions editor-actions"><span>Ändringar sparas via aktiv datakoppling.</span>'+
      '<button type="submit" class="primary">Spara ändring</button></div></form></aside>';
}
