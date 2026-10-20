import {relatedTables,resolveFieldName,refreshTableProfile,suggestTableColumns,importIdentityWarnings,setMappingRow,mappingTemplate} from '../services/import-matching.js';
import {importConflictGroups,resolveImportChoices} from '../lokaler/import-conflicts.js';
import {columnPreferenceKey,importPreference} from '../services/import-preferences.js';
import {issueCaption,collectionCaption} from './field-labels.js';
import {fieldCatalog,prepareMappedImport,retargetColumn,mappingConflicts,refreshColumnFormat} from '../services/import-engine.js';
import {personRole,contactPart,contactFields,personFormat,parsePersonIdentity} from '../services/import-person-links.js';
import {esc} from './views.js';

const selected=column=>!column.target.startsWith('@');
const pending=column=>!selected(column)&&column.target!=='@ignore';
const fieldLabel=field=>issueCaption(field.label);
function personIdentityHtml(column,key){
 let example;try{example=parsePersonIdentity((column.samples||column.examples||[]).find(value=>String(value??'').trim()),personFormat(column));}catch{}
 return `<small>Personen registreras en gång och kopplas till vald roll. Förvaltare hör till fastighetsägarens kontakt på fastigheten. Saknade kontaktdatum lämnas tomma.</small>
 <label>Personuppgift<select data-person-format="${key}" aria-label="Personformat för ${esc(column.header)}">${Object.entries({auto:'Automatisk · namn med eller utan källkod','code-name':'Källkod och namn i samma cell',name:'Endast namn'}).map(([value,label])=>`<option value="${value}" ${value===(column.personFormat||'auto')?'selected':''}>${label}</option>`).join('')}</select></label>
 ${example?.name?`<small data-person-parsed>Namn: ${esc(example.name)}${example.sourceCode?' · Källkod: '+esc(example.sourceCode):''}</small>`:''}
 <small>PersonID skapas vid behov. Befintliga personer återanvänds via PersonID, e-post eller entydigt namn och part. Källkoden behöver inte vara personens ID.</small><label><input type="checkbox" data-person-shared="${key}"${column.shared?' checked':''}> Delat ansvar i denna roll</label>`;
}
export const formatHtml=column=>`${esc(column.format?.label||'Text')}${column.format?.invalid?' · '+column.format.invalid+' värden behöver granskas':''}${column.transform==='monthly'||/månadshyra|kr\s*\/\s*mån/i.test(column.header)?' · räknas om till år':''}`;

export function reviewProfiles(profiles,schemas) {
  return structuredClone(profiles).map(profile=>{
    const targets=new Set([...fieldCatalog(schemas,true),...contactFields(profile)].map(field=>field.target));
    return {...profile,columns:profile.columns.map(column=>({...column,target:targets.has(column.target)||column.target==='@ignore'?column.target:'@unmapped'}))};
  });
}
function dialog(html,className='') {
  const d=document.createElement('dialog');d.className='followup-dialog import-dialog '+className;
  d.innerHTML=html;document.body.append(d);d.showModal();return d;
}
function chooseField(fields,current,profile,schemas) {
  const d=dialog('<h2>Välj fält</h2><label>Tabell<select data-field-table></select></label><label>Sök bland alla fält<input type="search" data-field-search placeholder="Adress, kontaktperson, hyra…" autocomplete="off"></label><div class="import-field-results" data-field-results></div><div class="actions"><button type="button" data-picker-close>Avbryt</button></div>','import-field-picker');
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;d.close();d.remove();resolve(value);};
    const search=d.querySelector('[data-field-search]'),results=d.querySelector('[data-field-results]'),table=d.querySelector('[data-field-table]'),near=relatedTables(schemas,profile.primaryTable),order=[profile.primaryTable,...near,...schemas.map(s=>s.key)];
    table.innerHTML=[...new Set(order)].filter(Boolean).map(key=>`<option value="${esc(key)}">${esc(schemas.find(s=>s.key===key)?.sheet||key)}${key===profile.primaryTable?' · huvudtabell':''}</option>`).join('')+'<option value="all">Alla tabeller</option>';table.value=profile.primaryTable||'all';
    const render=()=>{
      const words=search.value.trim().toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
      const matches=fields.filter(field=>(words.length||table.value==='all'||field.collection===table.value||field.target.startsWith('contact.'))&&words.every(word=>[fieldLabel(field),field.target,...(field.aliases||[]),...schemas.flatMap(s=>(s.shortcuts||[]).filter(alias=>alias.target===field.target).flatMap(alias=>alias.aliases))].join(' ').toLocaleLowerCase('sv').includes(word)));
      results.innerHTML=matches.length?matches.map(field=>`<button type="button" data-target="${esc(field.target)}" aria-pressed="${field.target===current}">${esc(fieldLabel(field))}</button>`).join(''):'<p>Inget fält hittades. Välj ett annat sökord eller välj Importera inte för kolumnen.</p>';
    };
    search.oninput=render;table.onchange=render;render();search.focus();
    d.addEventListener('click',event=>{const button=event.target.closest('[data-target]');if(button)finish(button.dataset.target);});
    d.querySelector('[data-picker-close]').onclick=()=>finish(null);
    d.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('button')?.focus();}});
  });
}
function importValueChoices(groups,options){
 if(!groups.length)return '';
 const mode=options.conflictMode||'review',choices=options.conflictChoices||{};
 return `<section class="import-enrichment" data-import-enrichment><h3>Berika befintliga poster</h3><p>Nya poster läggs till och tomma fält kompletteras automatiskt. ${groups.length} ${groups.length===1?'uppgift har ett annat värde':'uppgifter har andra värden'}. Det stoppar inte övriga uppgifter eller kopplingar.</p>
 <label>Vid olika värden<select data-import-conflict-mode aria-label="Hantera avvikande uppgifter">${Object.entries({review:'Välj post för post · behåll sparade tills jag väljer',keep:'Behåll alla sparade värden',replace:'Använd ny information där ett entydigt nytt värde finns'}).map(([value,label])=>`<option value="${value}" ${value===mode?'selected':''}>${label}</option>`).join('')}</select></label>
 <details data-import-value-choices><summary>Välj värde per post (${groups.length})</summary>${groups.map((group,index)=>{
  const choice=choices[group.key]||'';
  return `<article class="import-value-choice"><strong>${esc(group.recordLabel)}${group.recordLabel!==group.recordId?' · '+esc(group.recordId):''} · ${esc(group.label)}</strong><small>Sparat i utkastet: ${esc(group.current)}</small>
  ${group.candidates.map(candidate=>{const origins=candidate.reviews.flatMap(r=>r.occurrences||[r]);return `<small>Nytt: ${esc(candidate.value)} · ${esc([...new Set(origins.map(o=>(o.source||'')+' · '+o.sheet))].join(', '))} · ${origins.length} källrad${origins.length===1?'':'er'}</small>`;}).join('')}
  ${group.candidates.length>1?'<small>Flera nya värden för samma uppgift. Välj ett värde här; det övergripande valet skriver inte över automatiskt.</small>':''}
  <label>Värde för ${esc(group.label)}<select data-import-conflict-choice="${index}" aria-label="Värde för ${esc(group.recordId)} · ${esc(group.label)}"><option value="">Följ övergripande val</option><option value="keep" ${choice==='keep'?'selected':''}>Behåll: ${esc(group.current)}</option>${group.candidates.map((candidate,ci)=>`<option value="new:${ci}" ${choice===candidate.key?'selected':''}>Använd: ${esc(candidate.value)}</option>`).join('')}</select></label></article>`;
 }).join('')}</details><small>Olösta värdeskillnader sparas för senare granskning. Identifierare, osäkra kopplingar och ogiltiga värden godkänns inte av detta val.</small></section>`;
}
export function columnPreviewHtml(prepared,mapping,result,schemas,preferences={},options={}) {
  const fields=fieldCatalog(schemas,true);
  const duplicates=mappingConflicts(mapping.profiles),duplicateKeys=new Set(duplicates.flatMap(group=>group.columns.map(column=>group.profileIndex+':'+column.columnIndex)));
  const undecidedRow=mapping.profiles.some(p=>p.mappingRowSuggested&&!p.mappingRowDecision);
  const all=mapping.profiles.flatMap(profile=>profile.columns),unmapped=all.filter(pending).length,included=all.filter(selected).length;
  const reviews=(options.stale?[]:result.data.importReview||[]).filter(row=>row.status==='pending'&&mapping.profiles.some(profile=>profile.name===row.sheet&&(!row.source||row.source===(profile.fileName||prepared.fileName))));
  const problems=new Map(),uncertainRows=new Set();
  for(const row of options.stale?[]:result.report.decisions||[]){
    if(!['B','D'].includes(row.classification))continue;
    uncertainRows.add(JSON.stringify([row.source,row.sheet,row.row]));
    const key=JSON.stringify([row.source,row.sheet,row.collection,row.reason]);
    if(!problems.has(key))problems.set(key,{...row,count:0});problems.get(key).count++;
  }
  const rowHtml=(profile,pi,column,ci)=>{
    const names=new Map([...fields,...contactFields(profile)].map(field=>[field.target,fieldLabel(field)]));
    const key=pi+':'+ci,[collection,field]=column.target.split('.');
    const changes=(result.report.changes||[]).filter(change=>change.collection===collection&&change.field===field&&(!change.provenance?.sheet||change.provenance.sheet===profile.name)&&(!profile.fileName||change.provenance?.source===profile.fileName));
    const conflicts=reviews.filter(review=>review.collection===collection&&review.field===field&&(!review.sheet||review.sheet===profile.name)&&(!review.source||review.source===(profile.fileName||prepared.fileName)));
    const preference=importPreference(preferences,collection,field,profile.fileName||prepared.fileName,profile,column);
    const canPrioritize=selected(column)&&!personRole(column.target)&&!contactPart(column.target)&&!['id','sourceId','objectId','propertyId','contractId','activityId'].includes(field)&&(conflicts.length||preference);
    const examples=column.samples||column.examples||[];
    return `<div class="import-column-row" data-import-column="${key}" data-column-state="${duplicateKeys.has(key)?'conflict':pending(column)?'pending':selected(column)?'mapped':'ignored'}">
      <div class="import-column-name"><strong>${esc(column.header)}</strong><small>${esc(column.filled??0)} ${column.sampled?'kontrollerade exempel':'ifyllda'} · ${formatHtml(column)}</small>${column.identity&&selected(column)?'<small>Används för att identifiera och koppla poster.</small>':''}</div>
      <div class="import-column-examples"><span>${esc(examples.find(value=>String(value??'').trim())??'–')}</span>${examples.length?`<details data-example-key="${key}"><summary>Visa exempel</summary>${examples.map((value,index)=>`<small>Rad ${(profile.dataStartRow??profile.headerRow??1)+index+1}: ${esc(value===''?'Tomt':value)}</small>`).join('')}</details>`:''}</div>
      <div class="import-column-choice"><button type="button" class="import-target" data-preview-map="${key}" aria-label="Välj fält för ${esc(column.header)}">${esc(names.get(column.target)||'Välj fält…')}</button><button type="button" data-ignore-column="${key}" aria-pressed="${column.target==='@ignore'}">${column.target==='@ignore'?'Ångra bortval':'Importera inte'}</button>
      ${column.warning?`<small role="alert">${esc(column.warning)}</small>`:''}<small>${esc({explicit:'Matchningsrad',saved:'Tidigare godkänt val',manual:'Manuellt valt',alias:'Automatiskt förslag – kontrollera'}[column.matchSource]||'')}</small><small${duplicateKeys.has(key)?' role="alert"':''}>${duplicateKeys.has(key)?'Dubbelkoppling: välj ett annat fält eller Importera inte':pending(column)?'Behöver kopplas eller väljas bort':selected(column)?changes.length+' fältändringar · '+conflicts.length+' avvikelser':'Importeras inte'}</small>
      ${selected(column)&&column.target.startsWith('agreementItems.')&&!['id','contractId','type'].includes(field)?`<label>Gäller avtalspost<select data-item-type="${key}" aria-label="Avtalspost för ${esc(column.header)}"><option value="">En post per datarad</option>${Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).map(([label,value])=>`<option value="${value}" ${value===column.itemType?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`:''}
      ${selected(column)&&column.format?.type==='date'?`<label>Datumtolkning<select data-date-mode="${key}" aria-label="Datumtolkning för ${esc(column.header)}">${Object.entries({auto:'Automatisk · svenska datum / Excel',dmy:'Dag/månad/år (fyra siffror)',mdy:'Månad/dag/år (fyra siffror)','excel-1900':'Excel-tal · 1900-systemet','excel-1904':'Excel-tal · 1904-systemet'}).map(([value,label])=>`<option value="${value}" ${value===(column.dateMode||'auto')?'selected':''}>${label}</option>`).join('')}</select></label>`:''}
      ${selected(column)&&/DocumentUrl$|documentUrl$/.test(field)?`<label><input type="checkbox" data-invalid-link="${key}" ${column.invalidPolicy==='review-field'?'checked':''}> Läs övriga uppgifter; lämna ogiltiga länkar för granskning</label>`:''}
      ${personRole(column.target)?personIdentityHtml(column,key):''}
      ${canPrioritize?`<label>Vid avvikelse<select aria-label="Berikningsregel för ${esc(column.header)}" data-column-rule="${key}"><option value="">Komplettera tomma fält, granska konflikter</option><option value="accept">Använd denna källa vid avvikelse</option><option value="reject">Behåll befintliga värden vid avvikelse</option></select></label>${preference?'<small>Sparad kolumnregel</small>':''}`:''}</div>
    </div>`;
  };
  const groups=[['conflict','Dubbelkopplingar',(_column,key)=>duplicateKeys.has(key)],['pending','Behöver väljas',pending],['mapped','Föreslagna kopplingar',(column,key)=>selected(column)&&!duplicateKeys.has(key)],['ignored','Importeras inte',column=>column.target==='@ignore']];
  return `<h2>2. Välj tabell och fält</h2><p>${esc(prepared.fileName)}. Välj ett befintligt fält eller Importera inte. Valet gäller hela kolumnen, även i igenkända underlag.</p>
    <p class="import-selection-status" role="status">${included} kolumner läses in · ${all.length-included-unmapped} väljs bort${unmapped?' · '+unmapped+' behöver väljas':''}</p>
    ${duplicates.length?`<div data-mapping-conflicts role="alert"><strong>Rätta dubbelkopplingarna före import</strong>${duplicates.map(group=>`<p>${esc(mapping.profiles[group.profileIndex].name)}: ${esc(group.columns.map(column=>column.header).join(' och '))} är kopplade till ${esc(fieldLabel(fields.find(field=>field.target===group.target)||{label:group.target}))}. Välj vilket fält varje kolumn ska fylla.</p>`).join('')}</div>`:''}
    ${mapping.profiles.filter(p=>p.canonical).map((profile,pi)=>`<section class="import-sheet-settings"><strong>${esc(profile.fileName||prepared.fileName)} · ${esc(profile.name)}</strong><small>${profile.rowCount} datarader · ${profile.tableConfidence==='review'?'Huvudtabellen behöver kontrolleras':'Föreslagen huvudtabell'}</small><label>Huvudtabell<select data-import-table="${pi}" aria-label="Huvudtabell för ${esc(profile.name)}">${schemas.map(s=>`<option value="${esc(s.key)}" ${s.key===profile.primaryTable?'selected':''}>${esc(s.sheet)}</option>`).join('')}</select></label><label>Rad ${profile.headerRow+1} efter rubrikerna<select data-mapping-row="${pi}" aria-label="Matchningsrad för ${esc(profile.name)}">${profile.mappingRowSuggested?'<option value="ask">En möjlig matchningsrad hittades – välj</option>':''}<option value="no" ${profile.mappingRowDecision==='no'||!profile.mappingRowSuggested&&!profile.mappingRow?'selected':''}>Vanlig datarad</option><option value="yes" ${profile.mappingRow?'selected':''}>Innehåller Lokalblick-fältnamn</option></select></label>${importIdentityWarnings(profile,schemas).map(warning=>`<small role="alert">${esc(warning)}</small>`).join('')}</section>`).join('')}
    <div class="import-column-groups">${groups.map(([group,label,test])=>{
      const count=mapping.profiles.reduce((total,profile,pi)=>total+profile.columns.filter((column,ci)=>test(column,pi+':'+ci)).length,0);if(!count)return '';
      return `<details data-column-group="${group}"${group==='conflict'||group==='pending'?' open':''}><summary>${label} (${count})</summary>${group==='pending'?'<p>Vi hittade inget säkert fält för dessa kolumner. Välj var de hör hemma eller välj bort dem.</p><button type="button" data-ignore-unmapped>Importera inte dessa kolumner</button>':''}${mapping.profiles.map((profile,pi)=>{
        const columns=profile.columns.map((column,ci)=>({column,ci})).filter(({column,ci})=>test(column,pi+':'+ci));
        return columns.length?`<section class="import-column-sheet"><h3>${esc(profile.fileName||prepared.fileName)} · ${esc(profile.name)} <small>${profile.rowCount} rader</small></h3>${columns.map(({column,ci})=>rowHtml(profile,pi,column,ci)).join('')}</section>`:'';
      }).join('')}</details>`;
    }).join('')}</div>
    ${options.stale?'':importValueChoices(options.conflicts||importConflictGroups(result),options)}
    <section class="import-result" data-import-result><h3>3. Granska poster${unmapped?' för valda kolumner':''}</h3>${options.stale?'<p role="status">Kolumnvalen har ändrats. Kontrollera posterna innan du importerar.</p>':result.report.tables?.length?`<div class="import-result-table"><table aria-label="Resultat per tabell"><thead><tr><th>Register</th><th>Nya</th><th>Kompletteras</th><th>Oförändrade</th><th>Granskas</th></tr></thead><tbody>${result.report.tables.map(table=>`<tr><th>${esc(collectionCaption({key:table.collection,sheet:table.label}))}</th><td>${table.created}</td><td>${table.updated}</td><td>${table.unchanged??0}</td><td>${table.review}</td></tr>`).join('')}</tbody></table></div>`:'<p>Inga nya eller ändrade poster.</p>'}${result.report.consolidation?`<small>${result.report.consolidation.files} filer · ${result.report.consolidation.sheets} flikar · ${result.report.consolidation.uniqueRecords} identifierade poster · ${result.report.consolidation.mergedOccurrences} återkommande kopplingar sammanförda.</small>`:''}</section>
    ${problems.size?`<details class="import-problems" open><summary>Rader att granska (${uncertainRows.size})</summary><p>Personkopplingar och enskilda avvikelser granskas separat. Rader med felaktiga grundidentifierare eller relationer lämnas utanför importen.</p>${[...problems.values()].map(problem=>`<p>${esc(problem.source||prepared.fileName)} · ${esc(problem.sheet)} · ${esc(collectionCaption(schemas.find(schema=>schema.key===problem.collection)||{sheet:problem.collection}))}: ${esc(problem.reason)} (${problem.count})</p>`).join('')}</details>`:''}
    ${reviews.some(row=>row.column||row.rowRejected!==undefined)?`<details class="import-row-errors" data-import-errors open><summary>Visa fel per källrad (${reviews.length})</summary>${reviews.slice(0,100).map(review=>{const pi=mapping.profiles.findIndex(profile=>profile.name===review.sheet&&(!review.source||!profile.fileName||profile.fileName===review.source)),ci=mapping.profiles[pi]?.columns.findIndex(column=>column.index===review.columnIndex);return `<article data-import-row="${esc(review.id)}"><strong>${esc(review.source||prepared.fileName)} · ${esc(review.sheet)} · Rad ${esc(review.row)}${review.occurrences?.length>1?' · '+review.occurrences.length+' källrader':''}</strong><p>${esc(review.reason)}</p><small>Kolumn: ${esc(review.column||review.field||'Identifierare/koppling')} · Källvärde: ${esc(review.value??review.proposed??'–')}</small>${review.current!=null?`<small>Befintligt: ${esc(review.current)} · Föreslaget: ${esc(review.proposed)}</small>`:''}<small>${review.personLinkRejected?'Personkopplingen lämnas för granskning. Övriga giltiga uppgifter på raden läses in.':review.rowRejected?'Hela raden lämnas utanför importen.':'Övriga säkert kopplade uppgifter på raden läses in; detta fält ändras inte.'}</small>${review.matches?.length?`<label>Välj fastighet för källraden<select data-row-match="${esc(review.matchingKey)}"><option value="">Välj befintlig fastighet</option>${review.matches.map(row=>`<option value="${esc(row.id)}">${esc(row.label)} · ${esc(row.id)} · ${esc(row.detail)}</option>`).join('')}</select></label>`:''}${pi>=0&&ci>=0?`<button type="button" data-locate-import-column="${pi}:${ci}">Visa kolumnval</button>`:''}</article>`;}).join('')}${reviews.length>100?`<small>Visar de första 100 av ${reviews.length} granskningsposter.</small>`:''}<button type="button" data-export-import-review>Exportera granskningsunderlag (JSON)</button></details>`:''}
    ${!options.stale&&result.report.blocking?`<p role="alert">${result.report.blocking} rader har identifierare, format eller kopplingar som måste rättas före import. Öppna fel per källrad och kontrollera kolumnvalen.</p>${result.clean?`<label><input type="checkbox" data-import-safe-rows ${options.allowPartial?'checked':''} ${result.report.rows<=result.report.blocking?'disabled':''}> Importera endast ${result.report.rows-result.report.blocking} godkända rader. Lämna ${result.report.blocking} felaktiga rader utanför och spara dem för granskning.</label>`:''}`:''}
    <p>Tomma fält kompletteras. Manuellt verifierade värden skyddas och avvikelser kan granskas. Inget sparas innan du genomför importen.</p><p data-import-error role="alert"></p>
    <div class="actions import-review-actions">${mapping.profiles.some(p=>p.canonical)?`<button type="button" data-export-mapping ${unmapped||duplicates.length||undecidedRow?'disabled':''}>Godkänn fältval och hämta mall</button>`:''}${options.stale?'<button type="button" data-check-records class="primary-action">Kontrollera poster</button>':''}<button type="button" data-cancel>Avbryt</button><button type="button" data-apply class="primary-action"${options.stale||undecidedRow||unmapped||!included||duplicates.length||result.report.blocking&&!options.allowPartial?' disabled':''}>Genomför import</button></div>`;
}
export async function previewImport(prepared,base,schemas,actor,evaluator=null) {
  const mapping={profiles:reviewProfiles(prepared.profiles,schemas)},fields=fieldCatalog(schemas,true);
  const draft=structuredClone(base);draft.importFieldPreferences ||= {};
  const context={fingerprint:prepared.fingerprint,fileName:prepared.fileName,schemas,actor,strictColumns:true,personLinks:true,objectAreas:true,allowMappingConflicts:true};
  const evaluate=()=>{const profiles=mapping.profiles.map(profile=>({...profile,columns:profile.columns.map(column=>pending(column)?{...column,target:'@ignore'}:column)}));return evaluator?evaluator(profiles,draft):prepareMappedImport(prepared.workbook,profiles,draft,context,window.XLSX);};
  const d=dialog('<p role="status">Kontrollerar valda kolumner…</p>','import-mapping-dialog');
  return new Promise((resolve,reject)=>{
    const disclosures=new Map();
    let result,rawResult,closed=false,generation=0,resultGeneration=0,allowPartial=false,stale=false,conflictMode='review',conflictChoices={};
    const close=()=>{closed=true;evaluator?.cancel?.();d.close();d.remove();};
    const abort=()=>{close();const error=Error('Importen avbröts');error.name='AbortError';reject(error);};
    const locate=key=>{const [pi,ci]=key.split(':').map(Number);return {profile:mapping.profiles[pi],column:mapping.profiles[pi].columns[ci]};};
    const viewState=()=>{
      const focused=document.activeElement,focusAttr=['data-column-rule','data-date-mode','data-invalid-link','data-preview-map','data-ignore-column','data-person-format','data-person-shared','data-import-conflict-mode','data-import-conflict-choice','data-item-type','data-import-table','data-mapping-row'].find(attr=>focused?.hasAttribute(attr));
      for(const node of d.querySelectorAll('details'))if(disclosureKey(node))disclosures.set(disclosureKey(node),node.open);
      return {scroll:d.scrollTop,open:new Map(disclosures),focusAttr,focusValue:focusAttr?focused.getAttribute(focusAttr):null};
    };
    const disclosureKey=node=>node.dataset.columnGroup?'group:'+node.dataset.columnGroup:node.dataset.exampleKey?'example:'+node.dataset.exampleKey:node.hasAttribute('data-import-errors')?'errors':node.hasAttribute('data-import-value-choices')?'value-choices':node.classList.contains('import-problems')?'problems':null;
    const render=state=>{
      let error;try{result=resolveImportChoices(rawResult,{mode:conflictMode,choices:conflictChoices},actor);}catch(failure){error=failure;result=null;}
      d.innerHTML=columnPreviewHtml(prepared,mapping,result||rawResult,schemas,draft.importFieldPreferences,{allowPartial,stale,conflicts:importConflictGroups(rawResult),conflictMode,conflictChoices});d.setAttribute('aria-busy','false');
      for(const group of d.querySelectorAll('details'))if(state.open.has(disclosureKey(group)))group.open=state.open.get(disclosureKey(group));
      if(state.focusAttr)d.querySelector(`[${state.focusAttr}="${state.focusValue}"]`)?.focus({preventScroll:true});
      for(const node of d.querySelectorAll('[data-column-rule]')){const {profile,column}=locate(node.dataset.columnRule);node.value=importPreference(draft.importFieldPreferences,...column.target.split('.'),profile.fileName||prepared.fileName,profile,column)||'';}
      d.scrollTop=state.scroll;
      if(error){d.querySelector('[data-import-error]').textContent=error.message;d.querySelector('[data-apply]').disabled=true;}
    };
    const refresh=async()=>{
      if(closed)return;
      const state=viewState();allowPartial=false;conflictMode='review';conflictChoices={};const revision=++generation;d.setAttribute('aria-busy','true');d.querySelector('[data-apply]')?.setAttribute('disabled','');
      try{const next=await evaluate();if(closed||revision!==generation)return;rawResult=next;stale=false;resultGeneration=revision;render(state);}catch(error){if(closed||revision!==generation||error.name==='AbortError')return;fail(error);}
    };
    const invalidate=()=>{
      if(!rawResult){refresh();return;}
      const state=viewState();generation++;stale=true;allowPartial=false;conflictMode='review';conflictChoices={};evaluator?.invalidate?.();render(state);
    };
    const update=(profile,column,target)=>{
      column.valueType=schemas.find(s=>s.key===target.split('.')[0])?.fieldSpecs?.[target.split('.')[1]]?.type;retargetColumn(prepared.workbook,profile,column,target,window.XLSX);column.collection=target.split('.')[0];
      const allowed=new Set(contactFields(profile).map(field=>field.target));
      for(const other of profile.columns)if(contactPart(other.target)&&!allowed.has(other.target))retargetColumn(prepared.workbook,profile,other,'@unmapped',window.XLSX);
      invalidate();
    };
    const fail=error=>{d.setAttribute('aria-busy','false');result=null;const output=d.querySelector('[data-import-error]');if(output)output.textContent=error.message;else d.insertAdjacentHTML('beforeend','<p data-import-error role="alert">'+esc(error.message)+'</p><button type="button" data-cancel>Avbryt</button>');const apply=d.querySelector('[data-apply]');if(apply)apply.disabled=true;};
    d.addEventListener('cancel',event=>{event.preventDefault();abort();});
    d.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      try{
        if(button.hasAttribute('data-locate-import-column')){const row=d.querySelector(`[data-import-column="${button.dataset.locateImportColumn}"]`);if(row){row.closest('[data-column-group]').open=true;row.scrollIntoView({block:'center'});row.querySelector('[data-preview-map]')?.focus();}return;}
        if(button.hasAttribute('data-export-import-review')){const blob=new Blob([JSON.stringify(result.data.importReview||[],null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lokalblick-importgranskning.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);return;}
        if(button.hasAttribute('data-cancel')){abort();return;}
        if(button.hasAttribute('data-check-records')){refresh();return;}
        if(button.hasAttribute('data-export-mapping')){const book=mappingTemplate(prepared.workbook,mapping.profiles,schemas,window.XLSX);window.XLSX.writeFile(book,'Lokalblick-importmall.xlsx');return;}
        if(button.hasAttribute('data-preview-map')){const key=button.dataset.previewMap,{profile,column}=locate(key),target=await chooseField([...fields,...contactFields(profile)],column.target,profile,schemas);if(closed)return;if(target)update(profile,column,target);d.querySelector(`[data-preview-map="${key}"]`)?.focus();}
        if(button.hasAttribute('data-ignore-column')){const {profile,column}=locate(button.dataset.ignoreColumn);update(profile,column,column.target==='@ignore'?'@unmapped':'@ignore');}
        if(button.hasAttribute('data-ignore-unmapped')){for(const profile of mapping.profiles)for(const column of profile.columns)if(pending(column))retargetColumn(prepared.workbook,profile,column,'@ignore',window.XLSX);invalidate();}
        if(button.hasAttribute('data-apply')){
          if(d.getAttribute('aria-busy')==='true'||resultGeneration!==generation)throw Error('Vänta tills de senaste kolumnvalen har kontrollerats.');
          if(mapping.profiles.some(p=>p.mappingRowSuggested&&!p.mappingRowDecision))throw Error('Ange om raden efter rubrikerna är en matchningsrad eller vanlig data.');
          if(!result)throw Error('Kontrollera kolumnvalen innan importen genomförs.');
          if(result.report.blocking&&!allowPartial)throw Error('Rätta identifierare, format och kopplingar före import.');
          if(mapping.profiles.some(profile=>profile.columns.some(pending)))throw Error('Välj fält eller Importera inte för alla kolumner.');
          if(!mapping.profiles.some(profile=>profile.columns.some(selected)))throw Error('Välj minst ett fält att läsa in.');
          if(mappingConflicts(mapping.profiles).length)throw Error('Rätta dubbelkopplingarna innan importen genomförs.');
          if(result.report.blocking)result.report.partial=true;
          result.report.actor=actor;close();resolve(result);
        }
      }catch(error){fail(error);}
    });
    d.addEventListener('change',event=>{
      if(event.target.hasAttribute('data-person-format')){const {column}=locate(event.target.dataset.personFormat);column.personFormat=event.target.value;column.approved=true;invalidate();return;}
      if(event.target.hasAttribute('data-item-type')){const {column}=locate(event.target.dataset.itemType);column.itemType=event.target.value||undefined;column.approved=true;invalidate();return;}
      if(event.target.hasAttribute('data-row-match')){draft.importRowMatches ||= {};draft.importRowMatches[event.target.dataset.rowMatch]=event.target.value;invalidate();return;}
      if(event.target.hasAttribute('data-import-table')||event.target.hasAttribute('data-mapping-row')){
        const isTable=event.target.hasAttribute('data-import-table'),profile=mapping.profiles[Number(isTable?event.target.dataset.importTable:event.target.dataset.mappingRow)];
        if(isTable){profile.primaryTable=event.target.value;profile.tableConfidence='selected';for(const column of profile.columns)if(!column.approved){const suggestion=resolveFieldName(column.header,schemas,profile.primaryTable);column.target=suggestion?.target||'@unmapped';column.itemType=suggestion?.itemType;column.matchSource=suggestion?'alias':'unmatched';column.warning='';}refreshTableProfile(prepared.workbook,profile,schemas,window.XLSX);suggestTableColumns(profile,schemas);refreshTableProfile(prepared.workbook,profile,schemas,window.XLSX,{countRows:false});}
        else{const enabled=event.target.value==='yes';profile.mappingRowDecision=event.target.value==='ask'?null:event.target.value;if(enabled!==profile.mappingRow)setMappingRow(prepared.workbook,profile,enabled,schemas,window.XLSX);}
        invalidate();return;
      }
      if(event.target.hasAttribute('data-import-conflict-mode')||event.target.hasAttribute('data-import-conflict-choice')){
        if(d.getAttribute('aria-busy')==='true'||resultGeneration!==generation||!rawResult)return;
        const state=viewState();allowPartial=false;
        if(event.target.hasAttribute('data-import-conflict-mode')){conflictMode=event.target.value;conflictChoices={};}
        else{const group=importConflictGroups(rawResult)[Number(event.target.dataset.importConflictChoice)],value=event.target.value;if(!value)delete conflictChoices[group.key];else conflictChoices[group.key]=value==='keep'?'keep':group.candidates[Number(value.split(':')[1])].key;}
        render(state);return;
      }
      if(event.target.hasAttribute('data-import-safe-rows')){allowPartial=event.target.checked;const all=mapping.profiles.flatMap(p=>p.columns),valid=!stale&&result&&resultGeneration===generation&&d.getAttribute('aria-busy')!=='true'&&!all.some(pending)&&all.some(selected)&&!mappingConflicts(mapping.profiles).length;d.querySelector('[data-apply]').disabled=!(valid&&(!result.report.blocking||allowPartial));return;}
      if(event.target.hasAttribute('data-date-mode')||event.target.hasAttribute('data-invalid-link')){const field=event.target.hasAttribute('data-date-mode')?'dateMode':'invalidPolicy',{profile,column}=locate(event.target.dataset[field==='dateMode'?'dateMode':'invalidLink']);column[field]=field==='dateMode'?event.target.value:event.target.checked?'review-field':'reject-row';column.approved=true;refreshColumnFormat(prepared.workbook,profile,column,window.XLSX);invalidate();return;}
      if(event.target.hasAttribute('data-person-shared')){
        const {column}=locate(event.target.dataset.personShared);column.shared=event.target.checked;
        try{invalidate();}catch(error){fail(error);}return;
      }
      if(!event.target.hasAttribute('data-column-rule'))return;
      const {profile,column}=locate(event.target.dataset.columnRule),key=columnPreferenceKey(...column.target.split('.'),profile.fileName||prepared.fileName,profile,column);
      draft.importFieldPreferences[key]=event.target.value;
      try{invalidate();}catch(error){fail(error);}
    });
    // Allow the initial status to paint before the synchronous local conversion.
    setTimeout(()=>{if(closed)return;try{refresh();}catch(error){close();reject(error);}},0);
  });
}
