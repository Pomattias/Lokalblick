import {importStoryHtml,fillImportSourceDetail} from './import-story.js';
import {explainImport} from '../lokaler/import-explanation.js';
import {importCreationPlan,creationChoice,creationAvailable,approveImportPlan} from '../lokaler/import-plan.js';
import {tables} from '../lokaler/model.js';
import {viewCollections,viewFields} from '../lokaler/view-fields.js';
import {esc,propertyDesignation,propertyReference,money} from './view-format.js';

const titles={properties:'Fastigheter',objects:'Objekt',agreements:'Avtal',prices:'Priser',summary:'Slutkontroll'};
const choice=(entry,action,extra={})=>({signature:entry.signature,action,...extra});
const origins=entry=>[...new Set(entry.origins.map(at=>[at.source,at.sheet,at.row?'rad '+at.row:''].filter(Boolean).join(' · ')))].join('; ');
const changeCaption=change=>{
 const table=Object.keys(viewCollections).find(table=>viewCollections[table]===change.collection),key=Object.entries(viewFields[table]||{}).find(([,name])=>name===change.field)?.[0]||change.field;
 return (tables[table]?.label||'Koppling')+' · '+(tables[table]?.fields.find(field=>field.key===key)?.label||(key==='id'?'Identifierare':change.field));
};
const label=(entry,properties)=>entry.table==='properties'
 ? [propertyDesignation({designation:entry.record.name,address:entry.record.address})||'Beteckning saknas',entry.record.management_object_number?'Förvaltningsobjekt '+entry.record.management_object_number:'',entry.record.address].filter(Boolean).join(' · ')
 : entry.table==='objects'?'Objekt '+entry.record.id+' · '+(properties.get(entry.record.property_id)?.name||entry.record.property_id)
 : 'Avtal '+entry.record.id+' · Objekt '+entry.record.object_id;

function chooseExistingProperty(properties){
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

export function reviewImportApproval(result,base,actor,options={}){
 const plan=importCreationPlan(result,base),choices={},propertyLookup=new Map(result.clean.properties.map(row=>[row.id,row]));
 const stages=[...['properties','objects','agreements'].filter(table=>plan.some(entry=>entry.table===table)),'prices','summary'];
 let step=0,projected,rowExplanation,search='',limit=100,lastStage=null;const story={filter:'',query:'',limit:30};
 const d=options.dialog||document.createElement('dialog'),originalClass=d.className;
 if(!options.dialog){d.className='followup-dialog import-dialog';document.body.append(d);d.showModal();}
 d.classList.add('import-approval-dialog');
 return new Promise(resolve=>{
  const finish=value=>{d.removeEventListener('cancel',onCancel);d.removeEventListener('click',onClick);d.removeEventListener('input',onInput);d.removeEventListener('change',onChange);d.removeEventListener('toggle',onToggle,true);if(options.dialog)d.className=originalClass;else{d.close();d.remove();}resolve(value);};
  const stageRows=()=>plan.filter(entry=>entry.table===stages[step]);
  const rowsHtml=()=>{
   const matching=stageRows().filter(entry=>[label(entry,propertyLookup),entry.record.id,origins(entry)].join(' ').toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv')));
   return matching.slice(0,limit).map(entry=>{
   const selected=creationChoice(entry,choices),available=creationAvailable(entry,plan,choices,base);
   return `<article class="import-approval-row"><label><input type="checkbox" data-create-record="${esc(entry.key)}"${selected?.action==='create'?' checked':''}${!available||selected?.action==='map'?' disabled':''}><span><strong>${esc(label(entry,propertyLookup))}</strong><small>${esc(origins(entry))}</small>${!available?'<small>Väntar på att överordnad fastighet eller objekt godkänns.</small>':''}${selected?.action==='map'?`<small>Kopplas till: ${esc(propertyReference({designation:base.properties.find(row=>row.id===selected.targetId)?.name,address:base.properties.find(row=>row.id===selected.targetId)?.address}))}</small>`:''}</span></label>${entry.table==='properties'&&base.properties.length?`<button type="button" data-map-property="${esc(entry.key)}">Koppla till befintlig fastighet</button>${selected?.action==='map'?`<button type="button" data-map-clear="${esc(entry.key)}">Ångra vald koppling</button>`:''}`:''}</article>`;
   }).join('')+`<p>Visar ${Math.min(limit,matching.length)} av ${matching.length} matchande poster. Totalt ${stageRows().length} nya i registret.</p>${limit<matching.length?'<button type="button" data-approval-more>Visa 100 till</button>':''}`;
  };
  const pricesHtml=()=>{
   const items=projected.clean.agreement_items.filter(item=>Object.hasOwn(projected.report.recordStates.agreementItems||{},item.id)&&[item.agreement_id,item.name].join(' ').toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv')));
   return `<p>Priser visas för de avtal som ingår efter dina val. Inget sparas ännu.</p>${items.length?`<div class="import-result-table"><table aria-label="Priser efter godkännande"><thead><tr><th>Avtal</th><th>Post</th><th>Tidigare kr/år</th><th>Nytt kr/år</th><th>Villkor</th></tr></thead><tbody>${items.slice(0,limit).map(item=>{
    const old=base.agreement_items.find(row=>row.id===item.id);
    const changes=tables.agreement_items.fields.filter(field=>!['agreement_id','sources','name','base_amount'].includes(field.key)&&item[field.key]!=null&&JSON.stringify(item[field.key])!==JSON.stringify(old?.[field.key]));
    const value=(field,raw)=>raw==null?'Saknas':field.values?.[raw]??String(raw);
    return `<tr><td>${esc(item.agreement_id)}</td><td>${esc(item.name)}</td><td>${old?money(old.base_amount):'Ny post'}</td><td>${money(item.base_amount)}</td><td>${esc([item.valid_from||'Start saknas',item.valid_to||'Tills vidare',tables.agreement_items.fields.find(field=>field.key==='adjustment_method')?.values?.[item.adjustment_method]||item.adjustment_method].join(' · '))}${changes.length?`<details><summary>Visa ändrade villkor</summary>${changes.map(field=>`<p>${esc(field.label)}: ${esc(value(field,old?.[field.key]))} → ${esc(value(field,item[field.key]))}</p>`).join('')}</details>`:''}</td></tr>`;
   }).join('')}</tbody></table></div>`:'<p>Inga avtalspriser i denna import.</p>'}<p>Visar ${Math.min(limit,items.length)} av ${items.length} matchande priser.</p>${limit<items.length?'<button type="button" data-approval-more>Visa 100 till</button>':''}<p>${projected.report.creationReview.deferred.length} poster lämnas till senare, inklusive beroende uppgifter.</p>`;
  };
  const summaryHtml=()=>`<p>Kontrollera vad som faktiskt kommer att sparas. Tidigare steg har bara ändrat utkastet.</p><div class="import-result-table"><table aria-label="Slutligt importbeslut"><thead><tr><th>Register</th><th>Nya</th><th>Kompletteras</th><th>Ändras</th><th>Oförändrade</th></tr></thead><tbody>${rowExplanation.records.filter(row=>row.created||row.updated||row.unchanged).map(row=>`<tr><th>${esc(row.label)}</th><td>${row.created}</td><td>${row.completed||0}</td><td>${row.changed||0}</td><td>${row.unchanged}</td></tr>`).join('')}</tbody></table></div><p>${projected.report.creationReview.mapped.length} fastighetsförslag kopplas till befintliga fastigheter. <strong>${projected.report.creationReview.deferred.length} poster lämnas till senare.</strong></p><p>${projected.report.review} uppgifter finns i granskningsunderlaget. Olösta värdeskillnader skriver inte över sparade värden.</p><details><summary>Visa nya poster och ändrade uppgifter</summary>${projected.report.changes.filter(change=>change.field!=='sources').slice(0,200).map(change=>`<p><strong>${esc(change.recordId)} · ${esc(changeCaption(change))}</strong><br>${esc(change.from??'Saknas')} → ${esc(change.to??'Saknas')}</p>`).join('')}<small>Visar upp till 200 ändringar. Hela granskningsunderlaget kan hämtas nedan.</small></details><button type="button" data-export-approved>Hämta slutlig granskning (JSON)</button>`;
  const render=()=>{
   const scroll=d.scrollTop,opened=new Set([...d.querySelectorAll('details[open][data-source-detail]')].map(node=>node.dataset.sourceDetail));
   projected=approveImportPlan(result,base,choices,actor);
   const stage=stages[step],isRecords=['properties','objects','agreements'].includes(stage);
   rowExplanation=explainImport(result,base,{approved:projected,choices,profiles:options.profiles||[]});
   const impact=rowExplanation.records.filter(row=>row.created||row.updated).map(row=>`${row.label}: ${row.created} nya, ${row.completed||0} kompletteras, ${row.changed||0} ändras`).join(' · ');
   const explanation=rowExplanation;
   d.innerHTML=`<h2>Granska och godkänn import</h2><div class="import-impact" data-import-impact role="status"><strong>Det här kommer att sparas:</strong><p>${esc(impact||'Inga nya eller ändrade registerposter har godkänts.')}</p><small>${explanation.rows.length} källrader granskade · ${explanation.counts.pending||0} behöver ditt val · ${explanation.counts.skipped||0} läses inte in. Inget sparas förrän du godkänner slutkontrollen.</small></div><ol class="import-approval-steps" aria-label="Importsteg">${stages.map((key,i)=>`<li${i===step?' aria-current="step"':''}>${esc(titles[key])}</li>`).join('')}</ol><h3 data-approval-stage>${esc(titles[stage])}</h3>${isRecords?`<p>Markera de nya poster som får skapas. Omarkerade poster och deras beroenden lämnas till senare. Befintliga poster återanvänds.</p><label>Sök bland nya poster<input type="search" data-approval-search value="${esc(search)}" placeholder="Beteckning, adress eller nummer"></label><div class="actions"><button type="button" data-select-creations="all">Markera alla möjliga i registret</button><button type="button" data-select-creations="none">Avmarkera alla</button></div><div data-creation-list>${rowsHtml()}</div>`:stage==='prices'?`<label>Sök bland priser<input type="search" data-approval-search value="${esc(search)}" placeholder="Avtalsnummer eller prispost"></label><div data-price-list>${pricesHtml()}</div>`:summaryHtml()}${importStoryHtml(result,base,{approved:projected,choices,profiles:options.profiles||[],...story,explanation:rowExplanation})}<p data-approval-error role="alert"></p><div class="actions import-review-actions"><button type="button" data-approval-cancel>Tillbaka till kolumnval</button>${step?'<button type="button" data-approval-back>Föregående steg</button>':''}${stage==='summary'?'<button type="button" class="primary-action" data-confirm-import>Godkänn och spara import</button>':`<button type="button" class="primary-action" data-approval-next>${isRecords?'Godkänn markerade och fortsätt':'Godkänn prisgranskning och fortsätt'}</button>`}</div>`;
   for(const detail of d.querySelectorAll('details[data-source-detail]'))if(opened.has(detail.dataset.sourceDetail))detail.open=true;
   d.scrollTop=lastStage===stage?scroll:0;lastStage=stage;
  };
  const fail=error=>{d.querySelector('[data-approval-error]').textContent=error.message;d.querySelector('[data-confirm-import]')?.setAttribute('disabled','');};
  const onCancel=event=>{event.preventDefault();finish(null);};
  const onClick=async event=>{
   const button=event.target.closest('button');if(!button)return;
   try{
    if(button.hasAttribute('data-story-link')){options.onLocate?.('link:'+button.dataset.storyLink);finish(null);return;}
    if(button.hasAttribute('data-story-column')){options.onLocate?.(button.dataset.storyColumn);finish(null);return;}
    if(button.hasAttribute('data-story-register')){const index=stages.indexOf(button.dataset.storyRegister);if(index>=0){step=index;search='';limit=100;render();d.querySelector('[data-creation-list]')?.scrollIntoView({block:'start'});}return;}
    if(button.hasAttribute('data-story-more')){const scroll=d.scrollTop;story.limit+=30;render();d.scrollTop=scroll;return;}
    if(button.hasAttribute('data-export-approved')){const url=URL.createObjectURL(new Blob([JSON.stringify(projected.report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='lokalblick-godkand-importgranskning.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);return;}
    if(button.hasAttribute('data-approval-cancel')){finish(null);return;}
    if(button.hasAttribute('data-map-property')){const entry=plan.find(row=>row.key===button.dataset.mapProperty),targetId=await chooseExistingProperty(base.properties);if(targetId){choices[entry.key]=choice(entry,'map',{targetId});render();}return;}
    if(button.hasAttribute('data-map-clear')){delete choices[button.dataset.mapClear];render();return;}
    if(button.hasAttribute('data-approval-more')){limit+=100;if(stages[step]==='prices')d.querySelector('[data-price-list]').innerHTML=pricesHtml();else d.querySelector('[data-creation-list]').innerHTML=rowsHtml();return;}
    if(button.hasAttribute('data-select-creations')){for(const entry of stageRows())if(creationAvailable(entry,plan,choices,base)&&creationChoice(entry,choices)?.action!=='map')choices[entry.key]=choice(entry,button.dataset.selectCreations==='all'?'create':'defer');render();}
    if(button.hasAttribute('data-approval-next')){for(const entry of stageRows())if(!creationChoice(entry,choices))choices[entry.key]=choice(entry,'defer');step++;search='';limit=100;render();}
    if(button.hasAttribute('data-approval-back')){step--;search='';limit=100;render();}
    if(button.hasAttribute('data-confirm-import')){if(stages[step]!=='summary')throw Error('Granska samtliga steg före sparning.');finish(approveImportPlan(result,base,choices,actor));}
   }catch(error){fail(error);}
  };
  const onInput=event=>{if(event.target.hasAttribute('data-story-search')){const cursor=event.target.selectionStart,scroll=d.scrollTop;story.query=event.target.value;story.limit=30;render();d.scrollTop=scroll;const input=d.querySelector('[data-story-search]');input?.focus({preventScroll:true});input?.setSelectionRange(cursor,cursor);return;}if(event.target.hasAttribute('data-approval-search')){search=event.target.value;limit=100;if(stages[step]==='prices')d.querySelector('[data-price-list]').innerHTML=pricesHtml();else d.querySelector('[data-creation-list]').innerHTML=rowsHtml();}};
  const onChange=event=>{
   try{
    if(event.target.hasAttribute('data-story-filter')){story.filter=event.target.value;story.limit=30;const scroll=d.scrollTop;render();d.scrollTop=scroll;return;}
    if(event.target.hasAttribute('data-create-record')){const entry=plan.find(row=>row.key===event.target.dataset.createRecord);choices[entry.key]=choice(entry,event.target.checked?'create':'defer');render();}
   }catch(error){fail(error);}
  };
  const onToggle=event=>{if(event.target.matches('details[data-source-detail]'))fillImportSourceDetail(event.target,options.prepared,options.profiles||[],window.XLSX,{candidate:result,base,approved:projected,choices});};
  d.addEventListener('cancel',onCancel);d.addEventListener('click',onClick);d.addEventListener('input',onInput);d.addEventListener('change',onChange);d.addEventListener('toggle',onToggle,true);
  render();
 });
}
