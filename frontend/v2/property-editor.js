import {propertyCostsPanel} from './finance-ui.js';
import {responsibilityHtml} from "./responsibility-editor.js";
import { esc, options, propertyReference, units } from "./views.js";
import { fieldCaption } from "./field-labels.js";
import {partyNumberInput} from './party-fields.js';
import {propertyDesignation} from './view-format.js';

// Explicit property fields: the Excel/backend schema is not a form specification.
const own = (data, person) => !person.organizationId ||
  (data.organizations || []).some(org => org.id === person.organizationId && org.type === "our");

function control(label, html, description="") {
  return '<label class="property-field"><span class="field-name">'+esc(fieldCaption('properties',html,label))+'</span>'+html+
    (description ? '<small>'+esc(description)+'</small>' : '')+'</label>';
}
function textInput(p, key, locked=false) {
  return '<input type="text" name="'+key+'" value="'+esc(p[key] ?? "")+'"'+(locked?' disabled':'')+'>';
}
// All contacts use the same two-column field. Contract contacts have their
// own persistence path, so their select deliberately has no form name.
function personSelect(data, key, value, people, description, kind, contractId="", context="") {
  const contract=kind==="contract";
  const contextAttr=contract?' data-contract-id="'+esc(contractId)+'"':"";
  const label='<span class="field-name">'+esc(description)+
    (context?'<small class="property-contact-context">'+esc(context)+'</small>':"")+'</span>';
  return '<div class="property-person-field"><label>'+label+
    '<select'+(contract
      ? ' data-property-contract-contact="'+esc(contractId)+'" aria-label="'+esc(description+' · '+context)+'"'
      : ' name="'+key+'"')+
    ' data-property-person-select="'+kind+'"'+
    (kind==="owner"?' data-owner-contact':'')+'>'+
    options(people,p=>p.id,p=>p.name,value,"Ej kopplad")+'</select></label>'+
    '<div class="property-person-actions">'+
      '<button type="button" data-person-new="'+kind+'"'+contextAttr+'>+ Ny</button>'+
      '<button type="button" data-person-edit="'+kind+'"'+contextAttr+(!value?' disabled':'')+'>Ändra</button>'+
    '</div></div>';
}
function hasGeo(p) {
  return p.latitude != null && p.latitude !== "" && p.longitude != null &&
    p.longitude !== "" && Number.isFinite(Number(p.latitude)) &&
    Number.isFinite(Number(p.longitude)) && Math.abs(Number(p.latitude))<=90 &&
    Math.abs(Number(p.longitude))<=180;
}
const coordinates = p => Number(p.latitude).toFixed(6)+", "+Number(p.longitude).toFixed(6);

export function renderPropertyEditor(data, p, id, company=false, presentation={portfolio:true}) {
  const ownerList=(data.organizations||[]).filter(o=>
    data.cleanModel || o.type==="owner" || o.id===p.ownerPartyId);
  const allPeople=data.people||[];
  const ownerPeople=allPeople.filter(person=>
    (p.ownerPartyId && person.organizationId===p.ownerPartyId) ||
    person.id===p.ownerResponsiblePersonId);
  const ourPeople=allPeople.filter(person=>own(data, person) || person.id===p.responsiblePersonId);
  const contacts=(data.contracts||[]).filter(c=>c.propertyId===p.id).map(c=>{
    const person=allPeople.find(x=>x.id===c.tenantResponsiblePersonId);
    return {
      number:c.number||c.id,
      unit:c.business||"",
      personId:person?.id||"",
      id:c.id,
    };
  });
  // Contract contacts live on each contract, but their presentation is the
  // same property-person-field as owner and our contacts. Never a separate card.
  const contactRows=contacts.map(c=>
    personSelect(data,"",c.personId,allPeople,"Hyresgästens kontaktperson",
      "contract",c.id,c.unit+" · "+c.number)
  ).join("");
  const locked=Boolean(id && !data.isDemo && company && !data.cleanModel);
  const designation=propertyDesignation(p);
  const geo=hasGeo(p);
  return '<div class="editor-backdrop"></div><aside class="editor property-editor" aria-labelledby="editor-title">'+
    '<form id="edit-form" data-collection="properties" data-record-id="'+esc(id||"")+'">'+
      '<div class="section-title property-heading"><div class="property-heading-text" data-editor-mode-exclude>'+
      '<h2 id="editor-title">'+esc(designation||(id?'Fastighetsbeteckning saknas':"Ny fastighet"))+'</h2>'+
      '<label class="property-heading-edit property-heading-edit-title">'+
        '<span class="visually-hidden">Fastighetsbeteckning</span>'+textInput({...p,designation},"designation",locked)+'</label>'+
      (!designation?'<small>Komplettera fastighetsbeteckningen här. Adressen visas separat.</small>':'')+
      '<small class="property-heading-address">'+esc(p.address||"")+'</small>'+
      '<label class="property-heading-edit property-heading-edit-address">'+
        '<span class="visually-hidden">Adress</span>'+textInput(p,"address",locked)+'</label></div>'+
      '<button type="button" data-editor-close>Stäng</button></div>'+
      '<section class="property-section"><h3>Fastighetsinfo</h3><div class="property-grid">'+
        control("Fastighetsägare",'<select name="ownerPartyId" data-owner-select>'+
          options(ownerList,x=>x.id,x=>x.name,p.ownerPartyId,"Välj fastighetsägare")+'</select>')+
        (data.cleanModel&&presentation.portfolio?control('Orgnr fastighetsägare',partyNumberInput(data,'properties',p)):'')+
        control("Ort",textInput(p,"city"))+
        (data.cleanModel?control("Förvaltningsobjekt",textInput(p,"managementObjectNumber"))+control("Populärnamn",textInput(p,"popularName"))+control("Antal lägenheter",'<span>'+esc(p.apartmentCount??0)+'</span>'):"")+
      '</div></section>'+
      '<section class="property-section"><h3>Kontaktpersoner</h3><div class="property-grid">'+
        personSelect(data,"ownerResponsiblePersonId",p.ownerResponsiblePersonId,ownerPeople,"Fastighetsägarens kontaktperson","owner")+
        personSelect(data,"responsiblePersonId",p.responsiblePersonId,ourPeople,"Vår kontaktperson","our")+
        contactRows+
      '</div><details class="property-help"><summary>Om kontaktkopplingar</summary><p>Kontakter sparas på respektive avtal. Välj Ej kopplad för att koppla bort utan att radera personen.</p></details></section>'+
      responsibilityHtml(data,'property',p.id)+
      (data.cleanModel&&id&&presentation.portfolio?propertyCostsPanel(data,p.id):'')+
      '<section class="property-section"><h3>Placering på kartan</h3>'+
      '<p class="property-map-hint">'+(geo
        ? 'Klicka eller dra nålen för att ändra position.'
        : 'Klicka på kartan för att placera nålen.')+'</p>'+
      '<div id="property-editor-map" class="property-map" role="application" aria-label="Karta för fastighetens placering"></div>'+
      '<div class="property-map-footer"><span data-property-coordinates aria-live="polite">'+
       (geo?esc(coordinates(p)):"Ingen position registrerad")+'</span>'+
      '<span data-property-coordinate-status>'+ (geo?"Koordinater finns":"Välj plats på kartan")+'</span></div>'+
      '<input type="hidden" data-property-lat'+(geo?' name="latitude" value="'+esc(p.latitude)+'"':'')+'>'+
      '<input type="hidden" data-property-lng'+(geo?' name="longitude" value="'+esc(p.longitude)+'"':'')+'>'+
      '</section>'+
      (company?'<p class="computed">Källstyrd fastighetsdata ändras i underlaget. Kompletteringar och valda koordinater sparas via backend.</p>':'')+
      '<div class="actions editor-actions">'+
      '<button type="submit" class="primary">Spara ändring</button></div>'+
    '</form></aside>';
}

// Map is opened through the same provider adapter as the portfolio map.
// This auxiliary handle must not replace the active portfolio map.
export function attachPropertyMap(root, data, p, mapService) {
  const element=root.querySelector("#property-editor-map");
  if (!element) return () => {};
  const text=root.querySelector("[data-property-coordinates]");
  const status=root.querySelector("[data-property-coordinate-status]");
  const latitude=root.querySelector("[data-property-lat]");
  const longitude=root.querySelector("[data-property-lng]");
  const valid=(v,min,max)=>v!=="" && v!=null && Number.isFinite(Number(v)) && Number(v)>=min && Number(v)<=max;
  const points=(data.properties||[]).filter(x=>
    valid(x.latitude,-90,90)&&valid(x.longitude,-180,180));
  const sameCity=points.filter(x=>p.city && x.city &&
    String(x.city).trim().toLocaleLowerCase("sv")===String(p.city).trim().toLocaleLowerCase("sv"));
  const vicinity=sameCity.length?sameCity:points;
  const center=hasGeo(p)?{latitude:Number(p.latitude),longitude:Number(p.longitude),zoom:17}:
    vicinity.length?{
      latitude:vicinity.reduce((a,x)=>a+Number(x.latitude),0)/vicinity.length,
      longitude:vicinity.reduce((a,x)=>a+Number(x.longitude),0)/vicinity.length,
      zoom:sameCity.length?13:7,
    }:{latitude:62,longitude:15,zoom:4}; // Neutral Sweden viewport, never stored as coordinates.
  if (!mapService || typeof mapService.createAuxiliary!=="function") {
    element.textContent="Kartan är inte tillgänglig just nu. Försök igen senare.";
    return () => {};
  }
  try {
    const controller=mapService.createAuxiliary({
      elementId:"property-editor-map",
      fallbackCenter:center,
      points:[],
      selectedPosition:hasGeo(p)?{latitude:Number(p.latitude),longitude:Number(p.longitude)}:null,
      onSelectPosition:pos=>{
        root.querySelector("#edit-form").dataset.manualGeoSelected="1";
        latitude.name="latitude"; latitude.value=String(pos.latitude);
        longitude.name="longitude";longitude.value=String(pos.longitude);
        text.textContent=pos.latitude.toFixed(6)+", "+pos.longitude.toFixed(6);
        status.textContent="Ändrad position – spara ändring";
      },
    });
    return () => controller.destroy();
  } catch (_) {
    element.textContent="Kartan kunde inte laddas. Kontrollera kartanslutningen.";
    return () => {};
  }
}

export function updatePropertyOwnerContacts(root,data) {
  const owner=root.querySelector("[data-owner-select]");
  const contacts=root.querySelector("[data-owner-contact]");
  if (!owner || !contacts) return;
  const original=contacts.value;
  const items=(data.people||[]).filter(p=>p.organizationId===owner.value);
  contacts.innerHTML=options(items,x=>x.id,x=>x.name,original,"Ej kopplad");
  if (!items.some(p=>p.id===original)) contacts.value="";
}
