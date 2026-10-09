import { esc, options, propertyReference, units } from "./views.js";

// Explicit property fields: the Excel/backend schema is not a form specification.
const own = (data, person) => !person.organizationId ||
  (data.organizations || []).some(org => org.id === person.organizationId && org.type === "our");

function control(label, html, description="") {
  return '<label class="property-field">'+esc(label)+html+
    (description ? '<small>'+esc(description)+'</small>' : '')+'</label>';
}
function textInput(p, key, locked=false) {
  return '<input type="text" name="'+key+'" value="'+esc(p[key] ?? "")+'"'+(locked?' disabled':'')+'>';
}
function personSelect(data, key, value, people, description) {
  return control(description,
    '<select name="'+key+'"'+(key==="ownerResponsiblePersonId"?' data-owner-contact':'')+'>'+
    options(people, p=>p.id, p=>p.name, value, "Ej kopplad")+
    '</select>');
}
function hasGeo(p) {
  return p.latitude != null && p.latitude !== "" && p.longitude != null &&
    p.longitude !== "" && Number.isFinite(Number(p.latitude)) &&
    Number.isFinite(Number(p.longitude)) && Math.abs(Number(p.latitude))<=90 &&
    Math.abs(Number(p.longitude))<=180;
}
const coordinates = p => Number(p.latitude).toFixed(6)+", "+Number(p.longitude).toFixed(6);

export function renderPropertyEditor(data, p, id, company=false) {
  const ownerList=(data.organizations||[]).filter(o=>
    o.type==="owner" || o.id===p.ownerPartyId);
  const allPeople=data.people||[];
  const ownerPeople=allPeople.filter(person=>
    (p.ownerPartyId && person.organizationId===p.ownerPartyId) ||
    person.id===p.ownerResponsiblePersonId);
  const ourPeople=allPeople.filter(person=>own(data, person) || person.id===p.responsiblePersonId);
  const contacts=(data.contracts||[]).filter(c=>c.propertyId===p.id).map(c=>{
    const person=allPeople.find(x=>x.id===c.businessResponsiblePersonId);
    return {
      number:c.number||"Avtal",
      unit:units[c.unitId]||c.unitId||"Ej fördelad verksamhet",
      person:person?.name||"Ej kopplad",
      id:c.id,
    };
  });
  const contactRows=contacts.length
    ? '<div class="property-contact-list">'+contacts.map(c=>
      '<div><span>'+esc(c.unit)+' · '+esc(c.number)+'</span><strong>'+esc(c.person)+'</strong></div>'
    ).join("")+'</div>'
    : '<p class="property-empty">Inga avtalsobjekt med kontaktperson finns ännu.</p>';
  const locked=Boolean(id && !data.isDemo && company);
  const geo=hasGeo(p);
  return '<div class="editor-backdrop"></div><aside class="editor property-editor" aria-labelledby="editor-title">'+
    '<form id="edit-form" data-collection="properties" data-record-id="'+esc(id||"")+'">'+
      '<div class="section-title"><div><small>'+(id?'ÄNDRA':'NY')+' FASTIGHET</small><h2 id="editor-title">Fastighet</h2>'+
      '<small>'+esc(propertyReference(p)||"Ny fastighet")+'</small></div><button type="button" data-editor-close>Stäng</button></div>'+
      '<section class="property-section"><h3>Fastighetsinfo</h3><div class="property-grid">'+
        control("Fastighetsbeteckning",textInput(p,"designation",locked))+
        control("Fastighetsägare",'<select name="ownerPartyId" data-owner-select>'+
          options(ownerList,x=>x.id,x=>x.name,p.ownerPartyId,"Välj fastighetsägare")+'</select>')+
        control("Adress",textInput(p,"address",locked))+
        control("Ort",textInput(p,"city"))+
      '</div></section>'+
      '<section class="property-section"><h3>Kontaktpersoner</h3><div class="property-grid">'+
        personSelect(data,"ownerResponsiblePersonId",p.ownerResponsiblePersonId,ownerPeople,"Fastighetsägarens kontaktperson")+
        personSelect(data,"responsiblePersonId",p.responsiblePersonId,ourPeople,"Vår kontaktperson")+
      '</div><h4>Verksamhetens kontaktpersoner</h4>'+
      contactRows+'<small class="property-help">Verksamhetsansvariga väljs på respektive avtalsobjekt.</small></section>'+
      '<section class="property-section"><h3>Placering på kartan</h3>'+
      '<p class="property-map-hint">'+(geo
        ? 'Fastighetens position visas på kartan. Klicka eller dra nålen för att rätta placeringen.'
        : 'Koordinater saknas. Klicka på rätt plats på kartan för att sätta en nål.')+'</p>'+
      '<div id="property-editor-map" class="property-map" role="application" aria-label="Karta för fastighetens placering"></div>'+
      '<div class="property-map-footer"><span data-property-coordinates aria-live="polite">'+
       (geo?esc(coordinates(p)):"Ingen position registrerad")+'</span>'+
      '<span data-property-coordinate-status>'+ (geo?"Koordinater finns":"Välj plats på kartan")+'</span></div>'+
      '<input type="hidden" data-property-lat'+(geo?' name="latitude" value="'+esc(p.latitude)+'"':'')+'>'+
      '<input type="hidden" data-property-lng'+(geo?' name="longitude" value="'+esc(p.longitude)+'"':'')+'>'+
      '</section>'+
      (company?'<p class="computed">Källstyrd fastighetsdata ändras i underlaget. Kompletteringar och valda koordinater sparas via backend.</p>':'')+
      '<div class="actions editor-actions"><span>Vald kartposition sparas med övriga ändringar.</span>'+
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
