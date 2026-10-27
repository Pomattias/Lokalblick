// Opt-in tiled map. No external map request is made until the user clicks "Visa kartbakgrund".
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coords=p=>p.latitude!=null&&p.longitude!=null&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&Math.abs(Number(p.latitude))<=90&&Math.abs(Number(p.longitude))<=180;
let leafletPromise;
function leaflet(){
 if(window.L)return Promise.resolve(window.L);
 if(leafletPromise)return leafletPromise;
 leafletPromise=new Promise((resolve,reject)=>{
  const style=document.createElement('link');style.rel='stylesheet';style.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.append(style);
  const script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  script.onload=()=>window.L?resolve(window.L):reject(Error('Kartan kunde inte laddas.'));
  script.onerror=()=>reject(Error('Kartbiblioteket är inte tillgängligt. Kontrollera internetanslutningen.'));
  document.head.append(script);
 }).catch(e=>{leafletPromise=null;throw e});
 return leafletPromise;
}
export function mountPropertyMap(node,s,{navigate,notify}){
 const properties=s.properties.filter(coords),missing=s.properties.length-properties.length;
 node.innerHTML='<div class="map-caption"><span class="map-number">'+properties.length+'</span><span>fastigheter med koordinater</span></div>'+
  '<p class="muted">Fastigheterna finns i din privata databas. Först när du väljer att visa kartbakgrunden hämtas kartbilder från OpenStreetMap. Kartleverantören får då information om kartutsnittet.</p>'+
  '<div class="map-opt-in"><button class="primary" type="button" data-load-map '+(!properties.length?'disabled':'')+'>Visa kartbakgrund</button><span class="muted">'+missing+' utan koordinater</span></div>'+
  '<div id="property-map" class="property-map" hidden role="region" aria-label="Fastighetskarta"></div>'+
  '<h3>Fastigheter med position</h3><div class="relations">'+
  properties.map(p=>'<button type="button" class="relation-link" data-map-property="'+esc(p.id)+'"><span class="relation-name">'+esc(p.name)+'</span><span class="relation-meta">'+esc([p.address,p.city].filter(Boolean).join(', '))+'</span><span class="relation-arrow">›</span></button>').join('')+
  '</div>';
 let map=null;
 const open=async()=>{
  const button=node.querySelector('[data-load-map]');if(!button)return;
  button.disabled=true;button.textContent='Laddar kartan…';
  try{
   const L=await leaflet();
   if(!node.isConnected)return;
   const target=node.querySelector('#property-map');target.hidden=false;
   map=L.map(target,{scrollWheelZoom:false,zoomControl:true});
   const background=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,attribution:'© OpenStreetMap contributors',crossOrigin:true
   }).addTo(map);
   const markers=properties.map(p=>{
    const m=L.marker([Number(p.latitude),Number(p.longitude)]).addTo(map);
    m.bindPopup('<strong>'+esc(p.name)+'</strong><p>'+esc(p.address||'')+'</p>');
    m.on('click',()=>{const action=node.querySelector('[data-selected-property]');if(action){action.dataset.selectedProperty=p.id;action.textContent='Öppna '+p.name;}});
    return m;
   });
   const bounds=L.latLngBounds(properties.map(p=>[Number(p.latitude),Number(p.longitude)]));
   map.fitBounds(bounds.pad(.18),{maxZoom:15});
   setTimeout(()=>{if(node.isConnected)map?.invalidateSize();},100);
   button.textContent='Kartbakgrund visas';
   button.hidden=true;
  }catch(error){button.disabled=false;button.textContent='Försök visa kartan igen';notify(error.message,true);}
 };
 node.addEventListener('click',event=>{
  if(event.target.closest('[data-load-map]'))return open();
  const id=event.target.closest('[data-map-property]')?.dataset.mapProperty||
   event.target.closest('[data-selected-property]')?.dataset.selectedProperty;
  if(id)navigate('properties',id);
 });
 const action=document.createElement('button');
 action.type='button';action.className='secondary';action.dataset.selectedProperty='';action.hidden=true;
 node.querySelector('.map-opt-in').append(action);
 const watch=new MutationObserver(()=>{
  if(action.dataset.selectedProperty){action.hidden=false;}
  if(!node.isConnected){map?.remove();watch.disconnect();}
 });
 watch.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['data-selected-property']});
 return ()=>{map?.remove();watch.disconnect()};
}
