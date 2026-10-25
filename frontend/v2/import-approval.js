import {createBusinessLabels} from '../lokaler/business-identities.js';
import {creationChoice,creationAvailable} from '../lokaler/import-plan.js';
import {tables} from '../lokaler/model.js';
import {esc,propertyDesignation} from './view-format.js';

const origins=entry=>[...new Set(entry.origins.map(at=>[at.source,at.sheet,at.row?'rad '+at.row:''].filter(Boolean).join(' · ')))].join('; ');
const planLabels=(plan,base={})=>{const data={...base};for(const table of ['parties','people','properties','objects','agreements'])data[table]=[...(base[table]||[]),...plan.filter(entry=>entry.table===table).map(entry=>entry.record)];return createBusinessLabels(data);};
const label=(entry,labels)=>entry.table==='properties'
 ? [propertyDesignation({designation:entry.record.name,address:entry.record.address})||'Fastighetsbeteckning saknas','Fastighetsnummer '+labels.number('properties',entry.record.id),entry.record.address].filter(Boolean).join(' · ')
 : entry.table==='objects'?'Objekt '+labels.number('objects',entry.record.id)+' → Fastighet '+labels.number('properties',entry.record.property_id)
 : entry.table==='agreements'?'Avtal '+labels.number('agreements',entry.record.id)+' → Objekt '+labels.number('objects',entry.record.object_id)
 : entry.record.name;

export const matchingCreations=(plan,{query='',filter=''}={})=>{const labels=planLabels(plan);return plan.filter(entry=>(!filter||entry.table===filter)&&[label(entry,labels),origins(entry)].join(' ').toLocaleLowerCase('sv').includes(query.toLocaleLowerCase('sv')));};

export function importApprovalHtml(plan,choices,base,{limit=100,enrichment=false,allowNew=true,...selection}={}){
 const {query='',filter=''}=selection;
 if(!plan.length)return '';
 if(enrichment&&!allowNew)return `<p data-new-records-excluded>${plan.length} nya poster läses inte in. Välj Importera nya ovan om du vill lägga till dem.</p>`;
 const matching=matchingCreations(plan,selection),labels=planLabels(plan,base);
 return `<details data-new-records${enrichment?' open':''}><summary>Nya poster att välja (${plan.length})</summary><p>Markera alla eller enskilda poster. Valet sparas med importen.</p><div class="import-table-tools"><label>Register<select data-approval-filter><option value="">Alla register</option>${[...new Set(plan.map(entry=>entry.table))].map(table=>`<option value="${table}"${filter===table?' selected':''}>${table==='parties'?'Bolag / organisation':tables[table].label}</option>`).join('')}</select></label><label>Sök nya poster<input type="search" data-approval-search value="${esc(query)}"></label></div><div class="actions"><button type="button" data-select-creations="all">Markera alla i urvalet</button><button type="button" data-select-creations="none">Avmarkera alla i urvalet</button></div><div class="import-comparison-scroll" data-creation-list><table class="import-comparison-table" aria-label="Nya poster som får skapas"><thead><tr><th>Importera</th><th>Register</th><th>Nummer</th><th>Benämning / koppling</th><th>Val</th><th>Källrader</th></tr></thead><tbody>${matching.slice(0,limit).map(entry=>{
  const selected=creationChoice(entry,choices),available=creationAvailable(entry,plan,choices,base),number=['parties','people'].includes(entry.table)?entry.record.organization_number||'–':labels.number(entry.table,entry.record.id);
  const parent=entry.table==='objects'?'Fastighet '+labels.number('properties',entry.record.property_id):entry.table==='agreements'?'Objekt '+labels.number('objects',entry.record.object_id):entry.table==='properties'?propertyDesignation({designation:entry.record.name,address:entry.record.address})||'Fastighetsbeteckning saknas':entry.record.name;
  return `<tr data-creation-key="${esc(entry.key)}"><td><label><input type="checkbox" data-create-record="${esc(entry.key)}"${selected?.action==='create'?' checked':''}${!available||selected?.action==='map'?' disabled':''}><span class="visually-hidden">${esc(label(entry,labels))}</span></label></td><td>${esc(entry.table==='parties'?'Bolag / organisation':tables[entry.table].singular)}</td><td>${esc(number)}</td><td>${esc(parent)}${selected?.action==='map'?`<small>🔗 Kopplas till ${esc(labels.number('properties',selected.targetId))}</small>`:''}</td><td>${!available?'Välj först dess fastighet eller objekt.':selected?.action==='map'?'Befintlig fastighet används.':'Ny post.'}${entry.table==='properties'&&base.properties.length?`<button type="button" data-map-property="${esc(entry.key)}">Koppla till befintlig</button>${selected?.action==='map'?`<button type="button" data-map-clear="${esc(entry.key)}">Ångra koppling</button>`:''}`:''}</td><td>${esc(entry.origins.length+' '+(entry.origins.length===1?'källrad':'källrader'))}<details><summary>Visa källa</summary>${esc(origins(entry))}</details></td></tr>`;
 }).join('')}</tbody></table></div><p>Visar ${Math.min(limit,matching.length)} av ${matching.length} poster i urvalet.</p>${limit<matching.length?'<button type="button" data-approval-more>Visa 100 till</button>':''}</details>`;

}

export function chooseExistingProperty(properties,proposed={}){
 const labels=createBusinessLabels({properties});
 const picker=document.createElement('dialog');picker.className='followup-dialog import-dialog import-approval-dialog';
 picker.innerHTML='<h2>Koppla till befintlig fastighet</h2><label>Sök beteckning, adress eller nummer<input type="search" data-existing-property-search></label><div class="import-comparison-scroll" data-existing-property-results></div><button type="button" data-existing-property-cancel>Avbryt</button>';
 document.body.append(picker);picker.showModal();
 return new Promise(resolve=>{
  const finish=value=>{picker.close();picker.remove();resolve(value);};
  const search=picker.querySelector('input'),results=picker.querySelector('[data-existing-property-results]');
  const render=()=>{
   const words=search.value.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean),matches=properties.filter(property=>words.every(word=>[labels.number('properties',property.id),property.name,property.address,property.management_object_number].join(' ').toLocaleLowerCase('sv').includes(word)));
   results.innerHTML=`<table class="import-comparison-table" aria-label="Välj befintlig fastighet"><thead><tr><th>Nummer</th><th>Beteckning</th><th>Adress</th><th>Val</th></tr></thead><tbody>${matches.slice(0,25).map(property=>`<tr><td>${esc(labels.number('properties',property.id))}</td><td>${esc(propertyDesignation({designation:property.name,address:property.address})||'Fastighetsbeteckning saknas')}</td><td>${esc(property.address||'–')}</td><td><button type="button" data-existing-property="${esc(property.id)}">Använd</button></td></tr>`).join('')}</tbody></table><p>${matches.length>25?'Visar 25 av '+matches.length+'. Sök för att begränsa listan.':matches.length+' matchande fastigheter.'}</p>`;
  };
  search.value=propertyDesignation({designation:proposed.name,address:proposed.address})||'';search.oninput=render;render();search.focus();search.select();
  picker.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
  picker.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.hasAttribute('data-existing-property'))finish(button.dataset.existingProperty);if(button?.hasAttribute('data-existing-property-cancel'))finish(null);});
 });
}
