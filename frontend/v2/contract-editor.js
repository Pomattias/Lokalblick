import {agreementItemsPanel} from './finance-ui.js';
import {responsibilityHtml} from "./responsibility-editor.js";
import { esc, options, calc, propertyReference, units } from "./views.js";
import { fieldCaption } from "./field-labels.js";
import {partyNumberInput} from './party-fields.js';

// Existing Budget editor controls remain scoped to Budget.
function budgetBusinessControls(data,c){
 const at=globalThis.LokalblickResponsibility.today();
 const links=(data.contractBusinesses||[]).filter(l=>l.contractId===c.id&&!l.cancelled&&(!l.fromDate||l.fromDate<=at)&&(!l.toDate||l.toDate>=at));
 const ids=links.map(l=>l.businessId);
 const mainId=ids[0]||"";
 const businesses=data.businesses||[];
 const primary=`<label>Verksamhet<select name="businessIds" aria-label="Verksamhet"><option value="">Ingen verksamhet vald</option>${businesses.map(b=>`<option value="${esc(b.id)}" ${mainId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`;
 const extras=`<details><summary>Flera verksamheter delar avtalet${ids.length>1?' ('+ids.length+' kopplade)':''}</summary><p>Markera ytterligare verksamheter endast när flera nyttjar samma avtal.</p><div style="display:grid;gap:8px">${businesses.filter(b=>b.id!==mainId).map(b=>`<label><input type="checkbox" name="businessIds" value="${esc(b.id)}" ${ids.includes(b.id)?'checked':''}> ${esc(b.name)}</label>`).join('')}</div></details>`;
 const distribution=links.length>1?`<details><summary>Nyttjad area och kostnadsfördelning</summary><div class="mapping-table"><table><thead><tr><th>Verksamhet</th><th>Area, m²</th><th>Kostnadsandel, %</th></tr></thead><tbody>${links.map(l=>`<tr><td>${esc(businesses.find(b=>b.id===l.businessId)?.name||l.businessId)}</td><td><input name="businessArea|${esc(l.businessId)}" aria-label="Nyttjad area" type="number" min="0" step="any" value="${esc(l.usedArea??'')}"></td><td><input name="businessShare|${esc(l.businessId)}" aria-label="Kostnadsandel" type="number" min="0" max="100" step="any" value="${esc(l.costSharePercent??'')}"></td></tr>`).join('')}</tbody></table></div><small>Frivilligt. Ingen automatisk 100-procentsandel sätts vid 1:1.</small></details>`:"";
 return `<section class="contract-section"><h3>Verksamhet</h3>${primary}${extras}${distribution}<small>Normalt en verksamhet per avtal. Kopplingarnas giltighet och historik bevaras vid ändring.</small>${!businesses.length?'<p>Verksamheter kan kopplas här när de finns i underlaget.</p>':''}</section>`;
}

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

export function renderContractEditor(data, c, id, company=false, presentation={}) {
  const property=(data.properties||[]).find(p=>p.id===c.propertyId)||{};
  const owner=(data.organizations||[]).find(org=>org.id===property.ownerPartyId);
  const ownerName=owner?.name||property.owner||"Ej angiven på fastigheten";
  const masterLocked=Boolean(id&&!data.isDemo);
  const category=presentation.portfolio?String(c.category||'').trim():chosenCategory(c.category);
  const choices=CATEGORIES.includes(category)||!category?CATEGORIES:[...CATEGORIES,category];
  const categorySelect='<select name="category"'+(masterLocked?' disabled':'')+'>'+
    options(choices, x=>x, x=>!presentation.portfolio&&x===category&&!CATEGORIES.includes(x)?x+' (tidigare kategori)':x,category,'Välj kategori')+'</select>';
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
  const identity = '<section class="contract-section" data-contract-section="identity"><h3>Avtal</h3><div class="contract-grid">'+
    (!id&&!c.propertyId ? field("Fastighet",select("propertyId",data.properties||[],c,x=>x.id,propertyReference,"Välj fastighet")) : "")+
    (presentation.portfolio?field("AvtalsID",input({...c,id:c.number||c.id},"id","text",Boolean(id),'required maxlength="100"')):field("Avtalsnummer",input(c,"number","text",masterLocked)))+
    field("Hyresgäst",select("tenantPartyId",data.organizations||[],c,x=>x.id,x=>x.name,"Ej kopplad"))+
    (data.cleanModel&&presentation.portfolio?field('Orgnr hyresgäst',partyNumberInput(data,'contracts',c)):'')+
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
  const rentPerSqm=totals.rent.status==='Behöver kontroll'?'Behöver kontroll':Number(c.area)>0?money(totals.rent.amount/Number(c.area)):'Ej beräknat';
  const economics = '<section class="contract-section" data-contract-section="economics"><h3>Hyra och yta</h3><div class="contract-grid">'+
    field("Hyra "+new Date().getFullYear()+", kr/år",display(rentValue))+
    field("Area, m²",presentation.portfolio?'<span class="contract-readonly" data-object-area>'+esc((data.objects||[]).find(object=>object.id===c.objectId)?.area??c.area??'–')+'</span>':input(c,"area","number",masterLocked,'min="0" step="any"'),presentation.portfolio?'Hämtas från objektet. Ändra ytan på objektets sida.':'')+
    (presentation.portfolio?field('Årshyra, kr/m²','<span class="contract-readonly" data-contract-rent-per-sqm>'+esc(rentPerSqm)+'</span>'):"")+
    (totals.addition.amount || totals.tax ? field("Total årskostnad, kr",display(money(annualTotal))) : "")+
    '</div>'+(missing.length?'<p class="rent-needs-review">Behöver kontroll: '+esc(missing.join(' · '))+'</p>':'')+
    rentTerms+'</section>';

  const period=presentation.portfolio
    ? '<div class="contract-term" data-contract-term role="group" aria-label="Hyrestid"><span class="field-name contract-term-caption" aria-hidden="true">Hyrestid</span><div class="contract-term-values">'+
      field('Fr.o.m.',input(c,'start','date',false,'aria-label="Hyrestid fr.o.m." data-empty-label="Ej angivet"'))+
      '<span class="contract-term-separator" aria-hidden="true">–</span>'+
      field('T.o.m.',input(c,'end','date',false,'aria-label="Hyrestid t.o.m." data-empty-label="Tills vidare"'))+'</div></div>'
    : field("Giltigt fr.o.m.",input(c,"start","date"))+field("Giltigt t.o.m.",input(c,"end","date"));
  const dates = '<section class="contract-section" data-contract-section="dates"><h3>Avtalstid</h3><div class="contract-grid">'+period+
    field("Säg upp senast",display(term.noticeBy || "Ej beräknat"))+
    '</div><details class="contract-secondary" data-contract-notice-terms'+(!id?' open':'')+'><summary>Uppsägning och förlängning</summary><div class="contract-grid">'+
    field("Uppsägningstid, månader",input(c,"noticePeriodMonths","number",false,'min="0" step="1"'))+
    field("Förlängningstid, månader",input(c,"renewalPeriodMonths","number",false,'min="0" step="1"'))+
    (presentation.portfolio?field('Uppsagd den',input(c,'terminatedOn','date',company&&!!id))+field('Uppsägningsorsak',input(c,'terminationReason','text',company&&!!id)):"")+
    '</div><p class="contract-note">'+lastNotice+'</p><small class="contract-help">Beräknat från senast sparade villkor. Faktisk uppsägning behöver registreras innan förlängning påverkar budget.</small></details></section>';

  // Supplementary source and relationship fields stay mounted for FormData,
  // but do not interrupt the agreement's identity, economics and dates.
  const additional = presentation.portfolio?('<details class="contract-secondary" data-contract-context><summary>Fler avtalsuppgifter</summary><div class="contract-grid">'+
    field("Lokalkategori",categorySelect)+
    field('Användning',input(c,'use','text',company&&!!id))+
    field('Verksamhet','<textarea name="business" rows="2">'+esc(c.business||'')+'</textarea>')+
    field('Antal arbetsplatser',input(c,'workplaceCount','number',false,'min="0" step="1"'))+
    field('Antal hubbplatser',input(c,'hubCount','number',false,'min="0" step="1"'))+
    field('Länk till huvudkontrakt',input(c,'contractDocumentUrl'))+
    '</div>'+(company?'<p class="computed">Källstyrda masteruppgifter ändras i källunderlaget. Övrigt sparas via backend.</p>':'')+'</details>'):('<details class="contract-secondary" data-contract-context><summary>Fler avtalsuppgifter</summary><div class="contract-grid">'+
    field("Organisatorisk tillhörighet",select("unitId",verksamhetChoices,c,x=>x[0],x=>x[1],"Välj tillhörighet"))+
    field("Lokalkategori",categorySelect)+
    field("Hyresgäst enligt källa",input(c,"tenantName","text",true))+
    field("Verksamhetspart",select("businessPartyId",data.organizations||[],c,x=>x.id,x=>x.name,"Ej kopplad"))+
    (presentation.portfolio?
      field('Användning',input(c,'use','text',company&&!!id))+
      field('Antal medarbetare',input(c,'employees','number',false,'min="0" step="any"'))+
      field('Lägenhetsyta, m²',input(c,'apartmentArea','number',false,'min="0" step="any"'))+
      field('Kommentar verksamhet','<textarea name="businessComment" rows="2">'+esc(c.businessComment||'')+'</textarea>')+
      field('Länk till huvudkontrakt',input(c,'contractDocumentUrl')):"")+
    '</div>'+budgetBusinessControls(data,c)+
    (company?'<p class="computed">Källstyrda masteruppgifter ändras i källunderlaget. Övrigt sparas via backend.</p>':'')+'</details>');

  const distinctTenantContact = c.tenantResponsiblePersonId && c.tenantResponsiblePersonId !== c.businessResponsiblePersonId;
  const distinctContractContact = c.responsiblePersonId && c.responsiblePersonId !== property.responsiblePersonId;
  const extraContacts = (!distinctTenantContact ? tenantContact : "")+(!distinctContractContact ? contractContact : "");
  const contacts = presentation.portfolio?('<section class="contract-section" data-contract-section="contacts"><h3>Kontaktpersoner</h3><div class="contract-grid">'+
    tenantContact+contractContact+'</div>'+responsibilityHtml(data,'contract',c.id)+'</section>'):('<section class="contract-section" data-contract-section="contacts"><h3>Kontaktpersoner</h3><div class="contract-grid">'+
    field("Vår kontaktperson för fastigheten",display(ourContact))+
    field("Verksamhetsansvarig",select("businessResponsiblePersonId",activityPersonOptions,c,x=>x.id,x=>x.name,"Ej kopplad"))+
    field("Fastighetsägarens kontaktperson",display(ownerContact))+
    (distinctTenantContact ? tenantContact : "")+
    (distinctContractContact ? contractContact : "")+
    '</div>'+(extraContacts?'<details class="contract-secondary" data-contract-contact-roles><summary>Fler kontaktroller</summary><div class="contract-grid">'+extraContacts+'</div></details>':'')+
    responsibilityHtml(data,'contract',c.id)+'</section>');

  const heading = property.designation || (property.address ? "Beteckning saknas" : "Nytt avtal");
  return '<div class="editor-backdrop"></div><aside class="editor contract-editor" aria-labelledby="editor-title">'+
    '<form id="edit-form" data-collection="contracts" data-record-id="'+esc(id||"")+'">'+
    '<div class="section-title"><div><h2 id="editor-title">'+esc(heading)+'</h2>'+
    (property.address?'<small>'+esc(property.address)+'</small>':'')+
    '</div><button type="button" data-editor-close>Stäng</button></div>'+
    identity+(presentation.portfolio?agreementItemsPanel(data,c):economics)+dates+additional+contacts+
    '<div class="actions editor-actions"><button type="submit" class="primary">Spara ändring</button></div></form></aside>';
}
