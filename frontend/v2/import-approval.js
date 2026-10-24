import {creationChoice,creationAvailable} from '../lokaler/import-plan.js';
import {tables} from '../lokaler/model.js';
import {esc,propertyDesignation,propertyReference} from './view-format.js';

const origins=entry=>[...new Set(entry.origins.map(at=>[at.source,at.sheet,at.row?'rad '+at.row:''].filter(Boolean).join(' · ')))].join('; ');
const label=entry=>entry.table==='properties'
 ? [propertyDesignation({designation:entry.record.name,address:entry.record.address})||'Fastighetsbeteckning saknas',entry.record.management_object_number?'Förvaltningsobjekt '+entry.record.management_object_number:entry.record.id,entry.record.address].filter(Boolean).join(' · ')
 : entry.table==='objects'?'Objekt '+entry.record.id+' → Fastighet '+entry.record.property_id
 : 'Avtal '+entry.record.id+' → Objekt '+entry.record.object_id;

export const matchingCreations=(plan,{query='',filter=''}={})=>plan.filter(entry=>(!filter||entry.table===filter)&&[label(entry),origins(entry)].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));

export function importApprovalHtml(plan,choices,base,{limit=100,...selection}={}){
 const {query='',filter=''}=selection;
 if(!plan.length)return '';
 const matching=matchingCreations(plan,selection);
 return `<details data-new-records><summary>Nya poster att välja (${plan.length})</summary><p>Välj en gång vilka poster som får skapas. Befintliga poster återanvänds. Omarkerade poster och beroende uppgifter lämnas utanför.</p><div class="import-table-tools"><label>Register<select data-approval-filter><option value="">Alla register</option>${['properties','objects','agreements'].filter(table=>plan.some(entry=>entry.table===table)).map(table=>`<option value="${table}"${filter===table?' selected':''}>${tables[table].label}</option>`).join('')}</select></label><label>Sök nya poster<input type="search" data-approval-search value="${esc(query)}"></label></div><div class="actions"><button type="button" data-select-creations="all">Lägg till alla möjliga i urvalet</button><button type="button" data-select-creations="none">Välj bort alla i urvalet</button></div><div data-creation-list>${matching.slice(0,limit).map(entry=>{
  const selected=creationChoice(entry,choices),available=creationAvailable(entry,plan,choices,base);
  return `<article class="import-approval-row" data-creation-key="${esc(entry.key)}"><label><input type="checkbox" data-create-record="${esc(entry.key)}"${selected?.action==='create'?' checked':''}${!available||selected?.action==='map'?' disabled':''}><span><strong>${esc(label(entry))}</strong><small>${esc(tables[entry.table].singular)} · ${esc(origins(entry))}</small>${!available?'<small>Välj först dess fastighet eller objekt.</small>':''}${selected?.action==='map'?`<small>🔗 Kopplas till befintlig fastighet ${esc(selected.targetId)}</small>`:''}</span></label>${entry.table==='properties'&&base.properties.length?`<button type="button" data-map-property="${esc(entry.key)}">Koppla till befintlig</button>${selected?.action==='map'?`<button type="button" data-map-clear="${esc(entry.key)}">Ångra koppling</button>`:''}`:''}</article>`;
 }).join('')}</div><p>Visar ${Math.min(limit,matching.length)} av ${matching.length} poster i urvalet.</p>${limit<matching.length?'<button type="button" data-approval-more>Visa 100 till</button>':''}</details>`;
}

export function chooseExistingProperty(properties){
 const picker=document.createElement('dialog');picker.className='followup-dialog import-dialog import-approval-dialog';
 picker.innerHTML='<h2>Koppla till befintlig fastighet</h2><label>Sök beteckning, adress eller nummer<input type="search" data-existing-property-search></label><div data-existing-property-results></div><button type="button" data-existing-property-cancel>Avbryt</button>';
 document.body.append(picker);picker.showModal();
 return new Promise(resolve=>{
  const finish=value=>{picker.close();picker.remove();resolve(value);};
  const search=picker.querySelector('input'),results=picker.querySelector('[data-existing-property-results]');
  const render=()=>{
   const words=search.value.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean),matches=properties.filter(property=>words.every(word=>[property.id,property.name,property.address,property.management_object_number].join(' ').toLocaleLowerCase('sv').includes(word)));
   results.innerHTML=matches.slice(0,100).map(property=>`<p><button type="button" data-existing-property="${esc(property.id)}">${esc(propertyReference({designation:property.name,address:property.address}))} · ${esc(property.id)}</button></p>`).join('')+`<p>${matches.length>100?'Visar 100 av '+matches.length+'. Förfina sökningen.':matches.length+' matchande fastigheter.'}</p>`;
  };
  search.oninput=render;render();search.focus();
  picker.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  picker.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.hasAttribute('data-existing-property'))finish(button.dataset.existingProperty);if(button?.hasAttribute('data-existing-property-cancel'))finish(null);});
 });
}
