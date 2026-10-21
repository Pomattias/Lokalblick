import {assessments,maintenanceResponsibilities} from '../lokaler/maintenance-model.js';
import {startInspection,addSpace,assessSpace,addPart,updatePoint,finishInspection,linkMaintenanceIssue,homeInspections,inspectionPoints,maintenanceHome,sameMaintenanceHome} from '../lokaler/maintenance.js';
import {profileMaintenanceWorkbook,applyMaintenanceImport} from '../lokaler/maintenance-import.js';
import {esc,money} from './views.js';
import {isoDate} from './date-format.js';

const options=(items,selected,blank='Välj')=>`<option value="">${esc(blank)}</option>`+items.map(([value,label])=>`<option value="${esc(value)}"${value===selected?' selected':''}>${esc(label)}</option>`).join('');
const propertyLabel=property=>[property.designation,property.address].filter((value,i,all)=>value&&all.indexOf(value)===i).join(' · ')||property.id;
const objectLabel=(data,object)=>{const property=data.properties.find(row=>row.id===object.propertyId);return [object.id,property?.designation,property?.address].filter((value,i,all)=>value&&all.indexOf(value)===i).join(' · ');};
const safeReference=reference=>globalThis.LokalblickDocuments?.resolve({reference})||{label:'Dokumentreferens'};
const sourcePlan=point=>(point.sourcePlans||[]).map(row=>row.interval||`${row.year}: ${money(row.amount)}`).join(' · ');
const observationFields=(point={})=>`<label>Bedömning<select name="assessment">${Object.entries(assessments).map(([value,label])=>`<option value="${value}"${(point.assessment||'unchecked')===value?' selected':''}>${esc(label)}</option>`).join('')}</select></label><label>Fritext<textarea name="comment" rows="3">${esc(point.comment||'')}</textarea></label><details${point.photoReference?' open':''}><summary>Bild (förberett)</summary><label>Bild- eller dokumentreferens<input name="photo" value="${esc(point.photoReference||'')}" placeholder="Länk eller lokal sökväg"></label><small>En referens till en bild i företagets dokumentlagring. Bilden laddas inte upp.</small></details>`;
const readObservation=values=>({assessment:values.assessment,comment:values.comment,photoReference:values.photo});

function formDialog(title,body,onSave,{submit='Spara',className=''}={}){
 const dialog=document.createElement('dialog');dialog.className='followup-dialog maintenance-dialog '+className;
 dialog.innerHTML=`<form><h2>${esc(title)}</h2>${body}<p role="alert" data-maint-error></p><div class="actions"><button type="button" data-maint-cancel>${onSave?'Avbryt':'Stäng'}</button>${onSave?`<button type="submit" class="primary-action">${esc(submit)}</button>`:''}</div></form>`;
 dialog.querySelector('[data-maint-cancel]').onclick=()=>dialog.close();
 dialog.onclose=()=>dialog.remove();
 dialog.querySelector('form').onsubmit=async event=>{
  event.preventDefault();if(!onSave)return;
  const button=dialog.querySelector('[type=submit]');button.disabled=true;
  try{await onSave(Object.fromEntries(new FormData(event.currentTarget)),dialog);dialog.close();}
  catch(error){dialog.querySelector('[data-maint-error]').textContent=error.message;}
  finally{button.disabled=false;}
 };
 document.body.append(dialog);dialog.showModal();return dialog;
}

export function maintenancePage(data,state,editable){
 const object=data.objects.find(row=>row.id===state.objectId),property=data.properties.find(row=>row.id===(object?.propertyId||state.propertyId));
 const home=maintenanceHome(object?{objectId:object.id}:property?{propertyId:property.id}:{}),owner=object||property,inspections=owner?homeInspections(data,home):[];
 const objects=data.objects.filter(row=>!property||row.propertyId===property.id);
 if(!inspections.some(row=>row.id===state.inspectionId))state.inspectionId=inspections[0]?.id||'';
 const inspection=inspections.find(row=>row.id===state.inspectionId),draft=inspection?.status==='draft';
 const points=inspection?inspectionPoints(data,inspection.id):[],pointMap=new Map(points.filter(row=>row.partId).map(row=>[row.partId,row])),roomPoints=new Map(points.filter(row=>row.spaceId).map(row=>[row.spaceId,row]));
 const spaces=owner?data.spaces.filter(row=>sameMaintenanceHome(row,home)):[];
 const inspector=data.people.find(row=>row.id===inspection?.inspectorId);
 const counts={defect:0,ok:0,unchecked:0};for(const point of points)counts[point.assessment]++;
 const header=`<div class="section-title"><div class="actions"><button type="button" data-maint-import${editable?'':' disabled'}>Läs in besiktningar</button>${owner&&editable?`${!inspection||draft?'<button type="button" data-maint-space>Lägg till utrymme</button>':''}${draft?'':`<button type="button" data-maint-start class="primary">Ny besiktning</button>`}`:''}</div></div>`;
 const selector=`${!data.cleanModel?'<p>Underhåll används med Lokalblick-data. <button type="button" data-view="sources">Öppna Datakällor</button></p>':''}<div class="maintenance-toolbar"><label>Fastighet<select data-maint-property>${options(data.properties.map(row=>[row.id,propertyLabel(row)]),property?.id,'Alla fastigheter')}</select></label><label>Objekt<select data-maint-object>${options(objects.map(object=>[object.id,property?'Objekt '+object.id:objectLabel(data,object)]),state.objectId,property?'Fastighetens gemensamma delar':'Alla objekt')}</select></label><label>Sök utrymme eller del<input type="search" data-maint-search value="${esc(state.q||'')}" placeholder="Kök, tak, golv…"></label>${owner?`<label>Visa<select data-maint-filter>${options([['all','Alla delar'],['defect','Brister'],['unchecked','Ej kontrollerade']],state.filter||'all')}</select></label>`:''}</div>`;
 if(!owner){
  const objects=data.objects.filter(object=>!state.q||objectLabel(data,object).toLocaleLowerCase('sv').includes(state.q.toLocaleLowerCase('sv')));
  return `<section class="maintenance-page">${header}${selector}<div class="maintenance-objects">${data.properties.filter(row=>!state.q||propertyLabel(row).toLocaleLowerCase('sv').includes(state.q.toLocaleLowerCase('sv'))).map(row=>`<button type="button" data-maint-open-property="${esc(row.id)}"><strong>${esc(propertyLabel(row))}</strong><small>Fastighetens gemensamma delar</small></button>`).join('')}${objects.map(object=>{
   const latest=homeInspections(data,{objectId:object.id})[0],points=latest?inspectionPoints(data,latest.id):[],defects=points.filter(point=>point.assessment==='defect').length;
   return `<button type="button" data-maint-open="${esc(object.id)}"><strong>${esc(objectLabel(data,object))}</strong><small>${latest?`${latest.status==='draft'?'Pågående besiktning':isoDate(latest.inspectedOn)||'Datum saknas'} · ${defects} brister`:'Ingen besiktning'}</small></button>`;
  }).join('')||'<p>Inga objekt i arbetsytan. Läs in eller lägg till objekt först.</p>'}</div></section>`;
 }
 const status=inspection?`<section class="maintenance-inspection"><div><strong>${draft?'Pågående besiktning':`Besiktning ${esc(inspection.inspectedOn?isoDate(inspection.inspectedOn):'utan datum')}`}</strong><small>${[draft&&inspection.inspectedOn?isoDate(inspection.inspectedOn):'',inspector?.name||inspection.sources?.[0]?.inspector].filter(Boolean).map(esc).join(' · ')}</small></div><div class="actions">${draft&&editable?'<button type="button" data-maint-inspection-info>Datum och utförare</button><button type="button" data-maint-finish>Avsluta besiktning</button>':''}</div><p>${counts.defect} brister · ${counts.ok} OK · ${counts.unchecked} ej kontrollerade</p>${inspection.notes?`<details><summary>Noteringar</summary><p class="maintenance-note">${esc(inspection.notes)}</p></details>`:''}</section>`:'<p>Utrymmen och delar återanvänds när du startar en besiktning.</p>';
 const query=(state.q||'').toLocaleLowerCase('sv');
 const pointRow=(space,part,point)=>{
  const issue=data.activities.find(row=>row.id===point?.issueId),responsibility=maintenanceResponsibilities[part?.responsibility||owner.maintenanceResponsibility||property?.maintenanceResponsibility];
  return `<div class="maintenance-part"><div><strong>${esc(part?.name||'Bedömning')}</strong>${responsibility?`<small>${esc(responsibility)}</small>`:''}${point?.comment?`<small class="maintenance-comment">${esc(point.comment)}</small>`:''}</div>${point?draft&&editable?`<select aria-label="Bedömning ${esc([space.name,part?.name].filter(Boolean).join(' '))}" data-maint-assessment="${esc(point.id)}">${Object.entries(assessments).map(([value,label])=>`<option value="${value}"${point.assessment===value?' selected':''}>${esc(label)}</option>`).join('')}</select>`:`<span class="maintenance-status" data-status="${esc(point.assessment)}">${esc(assessments[point.assessment])}</span>`:'<small>Ingen bedömning</small>'}<div class="maintenance-part-actions">${issue?`<button type="button" class="text-button" data-edit="activities" data-id="${esc(issue.id)}">${esc(issue.status||'Öppet')} ärende</button>`:point?.assessment==='defect'&&editable?`<button type="button" data-maint-issue="${esc(point.id)}">Hantera brist</button>`:''}${point?`<button type="button" data-maint-point="${esc(point.id)}">${draft&&editable?'Notera':'Detaljer'}</button>`:''}</div></div>`;
 };
 const roomRows=spaces.map(space=>{
  const matchesRoom=!query||[space.name,space.floor].some(value=>String(value||'').toLocaleLowerCase('sv').includes(query));
  const matchesFilter=point=>!state.filter||state.filter==='all'||point?.assessment===state.filter;
  const roomPoint=roomPoints.get(space.id),showRoom=roomPoint&&matchesRoom&&matchesFilter(roomPoint);
  const parts=data.buildingParts.filter(part=>part.spaceId===space.id&&(!inspection||draft||pointMap.has(part.id))).filter(part=>matchesRoom||part.name.toLocaleLowerCase('sv').includes(query)).filter(part=>matchesFilter(pointMap.get(part.id)));
  if(!parts.length&&!showRoom&&(inspection&&!draft||query||state.filter&&state.filter!=='all'))return '';
  const defects=parts.filter(part=>pointMap.get(part.id)?.assessment==='defect').length+(showRoom&&roomPoint.assessment==='defect'?1:0);
  return `<details class="maintenance-space" data-maint-room="${esc(space.id)}"${state.open?.includes(space.id)?' open':''}><summary><strong>${esc(space.name)}</strong><span>${[space.floor,parts.length?parts.length+' delar':'',showRoom?assessments[roomPoint.assessment]:'',defects?defects+' brister':''].filter(Boolean).map(esc).join(' · ')}</span></summary><div class="maintenance-parts">${showRoom?pointRow(space,null,roomPoint):''}${parts.map(part=>pointRow(space,part,pointMap.get(part.id))).join('')}${!showRoom&&!parts.length?'<p>Inga bedömningar ännu.</p>':''}${editable&&(!inspection||draft)?`${!roomPoint?`<button type="button" data-maint-assess-space="${esc(space.id)}">Bedöm utrymme</button>`:''}<button type="button" data-maint-add-part="${esc(space.id)}">Lägg till del</button>`:''}${editable&&parts.length?`<details class="maintenance-settings"><summary>Underhållsansvar för delarna</summary>${parts.map(part=>`<label>${esc(part.name)}<select data-maint-part-responsibility="${esc(part.id)}">${options(Object.entries(maintenanceResponsibilities),part.responsibility,object?'Ärv från objektet':'Ärv från fastigheten')}</select></label>`).join('')}</details>`:''}</div></details>`;
 }).join('');
 const history=inspections.length?`<details class="maintenance-history"><summary>Besiktningshistorik (${inspections.length})</summary>${inspections.map(row=>`<button type="button" data-maint-history="${esc(row.id)}"${row.id===inspection?.id?' aria-current="true"':''}>${esc(row.inspectedOn?isoDate(row.inspectedOn):'Datum saknas')} · ${row.status==='draft'?'Pågående':'Avslutad'} · ${inspectionPoints(data,row.id).length} punkter</button>`).join('')}</details>`:'';
 const sources=inspection?.sources?.length?`<details class="maintenance-source"><summary>Importerat underlag</summary>${inspection.sources.map(source=>`<p>${esc(source.source)} · ${esc(source.sheet)} · ${esc(source.header)}</p>${source.extra?.length?`<details><summary>Övriga källuppgifter (${source.extra.length})</summary><dl>${source.extra.map(item=>`<dt>${esc(item.cell)}</dt><dd>${esc(item.value)}</dd>`).join('')}</dl></details>`:''}`).join('')}</details>`:'';
 return `<section class="maintenance-page">${header}${selector}${status}${roomRows||'<p>Inga delar i urvalet.</p>'}${history}${sources}${editable?'<details class="maintenance-settings"><summary>'+ (object?'Objektets':'Fastighetens')+' underhållsansvar</summary><label>För delar utan eget ansvar<select data-maint-responsibility>'+options(Object.entries(maintenanceResponsibilities),owner.maintenanceResponsibility,object?'Ärv från fastigheten':'Inte angivet')+'</select></label></details>':''}</section>`;
}

export function mountMaintenance(root,{data,state,editable,mutate,notify,openRecord}){
 const current=()=>data();
 const save=async (change,{refresh=true}={})=>{
  const controls=[...root.querySelectorAll('button,input,select,textarea')].filter(node=>!node.disabled);
  controls.forEach(node=>node.disabled=true);
  try{return await mutate(change,{refresh});}finally{controls.forEach(node=>{if(node.isConnected)node.disabled=false;});}
 };
 const perform=async action=>{try{await action();}catch(error){if(error.name!=='AbortError'){notify(error.message,true);repaint();}}};
 root.querySelectorAll('[data-maint-room]').forEach(detail=>{detail.ontoggle=()=>{state.open=[...root.querySelectorAll('[data-maint-room][open]')].map(node=>node.dataset.maintRoom);};});
 const repaint=()=>{root.innerHTML=maintenancePage(current(),state,editable);mountMaintenance(root,{data,state,editable,mutate,notify,openRecord});};
 const refreshAssessment=pointId=>{
  // Preserve the actual select nodes while saving quick successive choices.
  // Replacing the page would discard a native selection already in flight.
  const template=document.createElement('template');template.innerHTML=maintenancePage(current(),state,editable);
  const oldSelect=[...root.querySelectorAll('[data-maint-assessment]')].find(node=>node.dataset.maintAssessment===pointId),nextSelect=[...template.content.querySelectorAll('[data-maint-assessment]')].find(node=>node.dataset.maintAssessment===pointId);
  if(oldSelect&&nextSelect)oldSelect.closest('.maintenance-part').querySelector('.maintenance-part-actions').innerHTML=nextSelect.closest('.maintenance-part').querySelector('.maintenance-part-actions').innerHTML;
  const oldCounts=root.querySelector('.maintenance-inspection > p'),nextCounts=template.content.querySelector('.maintenance-inspection > p');if(oldCounts&&nextCounts)oldCounts.textContent=nextCounts.textContent;
  for(const space of root.querySelectorAll('[data-maint-room]')){const next=[...template.content.querySelectorAll('[data-maint-room]')].find(row=>row.dataset.maintRoom===space.dataset.maintRoom);if(next)space.querySelector(':scope > summary').innerHTML=next.querySelector(':scope > summary').innerHTML;}
 };
 const search=root.querySelector('[data-maint-search]');if(search)search.oninput=()=>{const position=search.selectionStart;state.q=search.value;repaint();const field=root.querySelector('[data-maint-search]');field.focus();field.setSelectionRange(position,position);};
 root.onchange=event=>perform(async()=>{
  const field=event.target;
  if(field.matches('[data-maint-property]')){state.propertyId=field.value;state.objectId='';state.inspectionId='';state.q='';state.filter='all';state.open=[];repaint();}
  if(field.matches('[data-maint-object]')){state.objectId=field.value;state.propertyId=current().objects.find(row=>row.id===field.value)?.propertyId||state.propertyId||'';state.filter='all';state.inspectionId='';state.q='';state.open=[];repaint();}
  if(field.matches('[data-maint-filter]')){state.filter=field.value;repaint();}
  if(field.dataset.maintAssessment){const id=field.dataset.maintAssessment,value=field.value;await save(data=>updatePoint(data,id,{assessment:value}),{refresh:false});refreshAssessment(id);}
  if(field.dataset.maintPartResponsibility)await save(data=>{data.buildingParts.find(row=>row.id===field.dataset.maintPartResponsibility).responsibility=field.value||null;});
  if(field.matches('[data-maint-responsibility]'))await save(data=>{const owner=state.objectId?data.objects.find(row=>row.id===state.objectId):data.properties.find(row=>row.id===state.propertyId);owner.maintenanceResponsibility=field.value||null;});
 });
 root.onclick=event=>perform(async()=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.maintOpen){state.objectId=button.dataset.maintOpen;state.propertyId=current().objects.find(row=>row.id===state.objectId)?.propertyId||'';state.q='';state.inspectionId='';state.filter='all';state.open=[];repaint();}
  if(button.dataset.maintOpenProperty){state.propertyId=button.dataset.maintOpenProperty;state.objectId='';state.q='';state.inspectionId='';state.filter='all';state.open=[];repaint();}
  if(button.dataset.maintHistory){state.inspectionId=button.dataset.maintHistory;repaint();}
  if(button.hasAttribute('data-maint-import'))return openMaintenanceImport(current(),save,notify);
  if(button.hasAttribute('data-maint-start')||button.hasAttribute('data-maint-inspection-info')){
   const existing=button.hasAttribute('data-maint-inspection-info')?current().inspections.find(row=>row.id===state.inspectionId):null;
   const dialog=formDialog(existing?'Datum och utförare':'Ny besiktning',`<label>Datum<input name="date" type="date" required value="${esc(existing?.inspectedOn||new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'}))}"></label><label>Besiktningsperson<select name="person" required>${options([...current().people.map(row=>[row.id,row.name]),['@new','Lägg till person…']],existing?.inspectorId)}</select></label><label data-maint-new-person hidden>Namn<input name="personName"></label>`,async values=>save(data=>{
    let personId=values.person;
    if(personId==='@new'){const name=values.personName.trim();if(!name)throw Error('Ange personens namn.');const matches=data.people.filter(row=>row.name.toLocaleLowerCase('sv')===name.toLocaleLowerCase('sv'));if(matches.length>1)throw Error('Välj rätt befintlig person i listan.');personId=matches[0]?.id||'PER-'+crypto.randomUUID();if(!matches.length)data.people.push({id:personId,name});}
    if(existing){const row=data.inspections.find(row=>row.id===existing.id);if(row.status!=='draft')throw Error('Besiktningen är avslutad.');Object.assign(row,{inspectedOn:values.date,inspectorId:personId});}
    else state.inspectionId=startInspection(data,maintenanceHome(state),values.date,personId);
   }),{submit:existing?'Spara':'Starta'});
   dialog.querySelector('[name=person]').onchange=event=>{dialog.querySelector('[data-maint-new-person]').hidden=event.target.value!=='@new';};
  }
  if(button.hasAttribute('data-maint-finish'))formDialog('Avsluta besiktningen','<p>Bedömningarna bevaras. Du kan fortfarande koppla brister till ärenden.</p>',async()=>save(data=>finishInspection(data,state.inspectionId)),{submit:'Avsluta'});
  if(button.hasAttribute('data-maint-space'))formDialog('Nytt utrymme','<label>Rum eller utrymme<input name="name" required placeholder="Kök, hall, toalett…"></label><label>Våning eller placering<input name="floor" placeholder="Exempelvis våning 2"></label>'+observationFields()+'<details><summary>Delar (valfritt)</summary><label>En del per rad<textarea name="parts" rows="3" placeholder="Tak, golv, el…"></textarea></label></details>',async values=>save(data=>{
   const names=values.parts.split('\n').map(name=>name.trim()).filter(Boolean),spaceId=addSpace(data,maintenanceHome(state),values.name,values.floor,names);
   state.open=[...(state.open||[]),spaceId];
   if(!names.length||values.assessment!=='unchecked'||values.comment.trim()||values.photo.trim())state.inspectionId=assessSpace(data,spaceId,readObservation(values));
  }));
  if(button.dataset.maintAssessSpace)formDialog('Bedöm utrymme',observationFields(),async values=>save(data=>{state.inspectionId=assessSpace(data,button.dataset.maintAssessSpace,readObservation(values));}));
  if(button.dataset.maintAddPart)formDialog('Ny del','<label>Del<input name="name" required placeholder="Tak, golv, ventilation…"></label>'+observationFields(),async values=>save(data=>{
   const space=data.spaces.find(row=>row.id===button.dataset.maintAddPart),home=maintenanceHome(space);
   const draft=homeInspections(data,home).find(row=>row.status==='draft');
   state.inspectionId=draft?.id||startInspection(data,home,new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm'}),null);
   const partId=addPart(data,space.id,values.name),point=data.inspectionPoints.find(row=>row.partId===partId&&row.inspectionId===state.inspectionId);
   updatePoint(data,point.id,readObservation(values));
  }));
  if(button.dataset.maintPoint){
   const point=current().inspectionPoints.find(row=>row.id===button.dataset.maintPoint),inspection=current().inspections.find(row=>row.id===point.inspectionId),draft=inspection.status==='draft'&&editable;
   const part=current().buildingParts.find(row=>row.id===point.partId),space=current().spaces.find(row=>row.id===(point.spaceId||part?.spaceId)),reference=safeReference(point.photoReference),history=current().inspectionPoints.filter(row=>(point.partId?row.partId===point.partId:row.spaceId===point.spaceId)&&row.id!==point.id);
   formDialog(part?.name||space.name,`${draft?observationFields(point):`<p>${esc(assessments[point.assessment])}</p><p class="maintenance-note">${esc(point.comment||'Ingen kommentar.')}</p>`}${point.photoReference?`<p>${reference.href?`<a href="${esc(reference.href)}" target="_blank" rel="noopener noreferrer">Öppna foto/dokument</a>`:esc(point.photoReference)+' · '+esc(reference.label)}</p>`:''}${point.lastAction?`<small>Senast åtgärdad enligt källa: ${esc(point.lastAction)}</small>`:''}${point.sourcePlans?.length?`<details><summary>Importerad planering</summary><p>${esc(sourcePlan(point))}</p><small>Källuppgift. Ingår inte automatiskt i budget eller faktiska kostnader.</small></details>`:''}${point.sources?.length?`<details><summary>Källa</summary>${point.sources.map(source=>`<p>${esc([source.source,source.sheet,source.cell].filter(Boolean).join(' · '))}</p><small>${esc(source.condition?.join(' · '))}</small>`).join('')}</details>`:''}${history.length?`<details><summary>Tidigare bedömningar (${history.length})</summary>${history.map(row=>{const inspection=current().inspections.find(item=>item.id===row.inspectionId);return `<p>${esc(inspection?.inspectedOn?isoDate(inspection.inspectedOn):'Datum saknas')} · ${esc(assessments[row.assessment])}<br>${esc(row.comment||'')}</p>`;}).join('')}</details>`:''}`,draft?async values=>save(data=>updatePoint(data,point.id,readObservation(values))):null);
  }
  if(button.dataset.maintIssue){
   const point=current().inspectionPoints.find(row=>row.id===button.dataset.maintIssue),inspection=current().inspections.find(row=>row.id===point.inspectionId),propertyId=inspection.propertyId||current().objects.find(row=>row.id===inspection.objectId)?.propertyId;
   const issues=current().activities.filter(row=>row.objectId?row.objectId===inspection.objectId:row.propertyId===propertyId);
   formDialog('Hantera brist',`<label>Ärende<select name="issue"><option value="">Skapa nytt ärende</option>${issues.map(row=>`<option value="${esc(row.id)}">${esc(row.title)} · ${esc(row.status)}</option>`).join('')}</select></label><small>Ärendet hanterar åtgärd, ansvarig, tidplan och kostnad.</small>`,async values=>{let issueId;await save(data=>{issueId=linkMaintenanceIssue(data,point.id,values.issue);});openRecord('activities',issueId);},{submit:'Öppna ärende'});
  }
 });
}

async function openMaintenanceImport(data,save,notify){
 const picker=document.createElement('input');picker.type='file';picker.accept='.xlsx';
 picker.onchange=async()=>{
  const file=picker.files[0];if(!file)return;
  const progress=formDialog('Läser besiktningar','<p role="status">Läser flikar och besiktningspunkter…</p>',null);
  try{
   if(file.size>15*1024*1024)throw Error('Underlaget är för stort. Högst 15 MB.');
   await new Promise(resolve=>setTimeout(resolve,0));
   const XLSX=globalThis.XLSX,book=XLSX.read(await file.arrayBuffer(),{type:'array',cellNF:true}),result=await profileMaintenanceWorkbook(book,XLSX,file.name);
   if(!result.profiles.length)throw Error('Inga besiktningsmatriser hittades. Underlaget behöver kolumner för skick och kommentar.');
   progress.close();
   formDialog('Koppla flikar till objekt',`<p>Välj ObjektID för varje flik som ska läsas in. Granska utrymmen och delar. Ingen fastighet, hyra eller budget ändras.</p>${result.profiles.map((profile,index)=>{
    const suggested=data.objects.find(row=>row.id===profile.name)?.id||'';
    return `<section class="maintenance-import-sheet"><label>${esc(profile.name)}<select name="sheet-${index}">${options(data.objects.map(object=>[object.id,objectLabel(data,object)]),suggested,'Läs inte in denna flik')}</select></label><small>${profile.blocks.length} besiktningar · ${profile.blocks.reduce((sum,block)=>sum+block.spaces.reduce((sum,space)=>sum+space.points.length,0),0)} punkter</small>${profile.warnings.length?`<details><summary>Kontrollera (${profile.warnings.length})</summary><ul>${[...new Set(profile.warnings)].map(warning=>`<li>${esc(warning)}</li>`).join('')}</ul></details>`:''}<details><summary>Granska struktur</summary>${profile.blocks.map(block=>`<p>${esc(block.date?isoDate(block.date):'Datum saknas')} · ${esc(block.inspector||'Utförare saknas')}</p>${block.spaces.map(space=>`<details><summary>${esc([space.floor,space.name].filter(Boolean).join(' · '))} · ${space.points.length} delar</summary><ul>${space.points.map(point=>`<li>${esc(point.name)} · ${esc(assessments[point.assessment])}${point.comment?' · '+esc(point.comment):''}${sourcePlan(point)?' · '+esc(sourcePlan(point)):''}</li>`).join('')}</ul></details>`).join('')}`).join('')}</details></section>`;
   }).join('')}${result.ignored.length?`<small>${result.ignored.length} flik(ar) utan besiktningsmatris läses inte in, exempelvis sammanställningar.</small>`:''}<p>Årsbelopp och tidsintervall bevaras som underlag. Samma besiktning läses inte in två gånger.</p>`,async values=>{
    let report;await save(data=>{report=applyMaintenanceImport(data,result.profiles,Object.fromEntries(result.profiles.map((profile,index)=>[profile.name,values['sheet-'+index]])));});
    notify(`${report.imported} besiktningar och ${report.points} punkter inlästa. ${report.unchanged} redan inlästa.`);
   },{submit:'Läs in valda',className:'maintenance-import-dialog'});
  }catch(error){progress.close();notify(error.message,true);}
 };
 picker.click();
}
