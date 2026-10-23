import {importValueChoices,importLinkProposalsHtml} from "./import-summary.js";
import {reviewImportApproval} from './import-approval.js';
import {collectWorkspace} from '../lokaler/view-adapter.js';
import {relatedTables,setPrimaryTable,importIdentityWarnings,setMappingRow,mappingTemplate,issueNumberColumn,suggestIssueNumberColumns,resolveFieldName,skippedFinancialSuggestions,assignAgreementItemKeys} from '../services/import-matching.js';
import {importConflictGroups,resolveImportChoices,importReviewGroups,importTableRows} from '../lokaler/import-conflicts.js';
import {columnPreferenceKey,importPreference} from '../services/import-preferences.js';
import {issueCaption,collectionCaption} from './field-labels.js';
import {fieldCatalog,prepareMappedImport,retargetColumn,mappingConflicts,refreshColumnFormat} from '../services/import-engine.js';
import {personRole,contactPart,contactFields,personFormat,parsePersonIdentity} from '../services/import-person-links.js';
import {esc} from './views.js';

const selected=column=>!column.target.startsWith('@');
const pending=column=>column.itemAmbiguous||!selected(column)&&column.target!=='@ignore';
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
    const next={...profile,columns:profile.columns.map(column=>({...column,target:targets.has(column.target)||column.target==='@ignore'?column.target:'@unmapped'}))};assignAgreementItemKeys(next);return next;
  });
}
function dialog(html,className='') {
  const d=document.createElement('dialog');d.className='followup-dialog import-dialog '+className;
  d.innerHTML=html;document.body.append(d);d.showModal();return d;
}
function chooseField(fields,current,profile,schemas,column) {
  const d=dialog('<h2>Välj fält för '+esc(column.header)+'</h2><p>Välj var just denna kolumn hör hemma. Övriga kolumner påverkas inte.</p><label>Register<select data-field-table></select></label><label>Sök bland alla fält<input type="search" data-field-search placeholder="Adress, kontaktperson, hyra…" autocomplete="off"></label><div class="import-field-results" data-field-results></div><div class="actions"><button type="button" data-picker-close>Avbryt</button></div>','import-field-picker');
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;d.close();d.remove();resolve(value);};
    const search=d.querySelector('[data-field-search]'),results=d.querySelector('[data-field-results]'),table=d.querySelector('[data-field-table]'),near=relatedTables(schemas,profile.primaryTable),order=[profile.primaryTable,...near,...schemas.map(s=>s.key)];
    table.innerHTML=[...new Set(order)].filter(Boolean).map(key=>`<option value="${esc(key)}">${esc(schemas.find(s=>s.key===key)?.sheet||key)}${key===profile.primaryTable?' · utgångspunkt':''}</option>`).join('')+'<option value="all">Alla tabeller</option>';table.value=fields.find(field=>field.target===current)?.collection||resolveFieldName(column.header,schemas,profile.primaryTable)?.target?.split('.')[0]||profile.primaryTable||'all';
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
// This is a view of approved/suggested column targets, not a second schema.
function destinationSummary(profile,schemas,profileIndex){
 const groups=new Map(),fields=new Map(fieldCatalog(schemas,true).map(field=>[field.target,field]));
 for(const column of profile.columns.filter(selected)){
  const field=fields.get(column.target),schema=schemas.find(s=>s.key===field?.collection);if(!schema)continue;
  if(!groups.has(schema.key))groups.set(schema.key,{schema,columns:[]});groups.get(schema.key).columns.push(column);
 }
 if(!groups.size)return '';
 return `<div class="import-destinations" data-import-destinations><strong>Kolumner till ${groups.size} register</strong><ul>${[...groups.values()].map(({schema,columns})=>{
  const categories=[...new Set(columns.map(column=>column.itemType).filter(Boolean))];
  const summary=categories.length?categories.map(type=>esc(Object.entries(schema.itemTypes||{}).find(([,value])=>value===type)?.[0]||type)+' ('+columns.filter(column=>column.itemType===type).length+')').join(' · '):columns.map(column=>esc(column.header)).join(' · ');
  return `<li data-import-destination="${esc(schema.key)}"><div><button type="button" data-open-import-destination="${profileIndex}:${esc(schema.key)}">${esc(collectionCaption(schema))}</button> <small>(${columns.length} ${columns.length===1?'kolumn':'kolumner'})</small></div><span>${summary}</span></li>`;
 }).join('')}</ul>${groups.has('agreementItems')?'<small>Varje beloppskolumn blir en egen avtalspost, kopplad via AvtalsID. Öppna ett register ovan för att granska kolumnerna.</small>':''}</div>`;
}
function skippedFinancialHtml(suggestions,schemas){
 if(!suggestions.length)return '';
 const fields=new Map(fieldCatalog(schemas,true).map(field=>[field.target,field]));
 return `<section class="import-financial-suggestions" data-skipped-financial><div class="section-title"><h3>Hyreskolumner att koppla på nytt</h3><button type="button" data-restore-financial="all">Använd ${suggestions.length} förslag</button></div><small>Sparade bortval eller äldre fältkopplingar hindrar dessa kolumner från att läsas in. Granska de nya förslagen till Avtalsposter och välj vilka du vill använda.</small><ul>${suggestions.map(({key,column})=>{const type=Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).find(([,type])=>type===column.itemType)?.[0];return `<li><div><strong>${esc(column.header)}</strong><small>${esc(fields.get(column.target)?.label)}${type?' · '+esc(type):''}</small></div><button type="button" data-restore-financial="${key}">Använd förslag</button></li>`;}).join('')}</ul></section>`;
}

function importProblemsHtml(reviews,prepared,mapping,schemas){
 const groups=importReviewGroups(reviews.filter(row=>!row.linkProposal)).filter(group=>group.category!=='values');if(!groups.length)return '';
 const blocked=groups.some(group=>group.category==='blocked');let remaining=100;
 return `<details class="import-row-errors" data-import-errors${blocked?' open':''}><summary>Att kontrollera (${groups.length} ${groups.length===1?'problemtyp':'problemtyper'})</summary><p>Återkommande problem visas tillsammans. Valfria fält kan kompletteras senare; osäkra identifierare och kopplingar måste rättas eller lämnas utanför importen.</p>${groups.map(group=>{
  const schema=schemas.find(schema=>schema.key===group.collection),label=schema?.columns.find(([field])=>field===group.field)?.[1]||group.field||'Identifierare/koppling';
  const shown=group.reviews.slice(0,remaining);remaining-=shown.length;
  return `<details data-review-problem="${esc(group.key)}" data-review-category="${group.category}"><summary>${group.category==='blocked'?'Kan inte läsas in':group.category==='contacts'?'Personkoppling att komplettera':'Fält att komplettera'} · ${esc(collectionCaption(schema||{sheet:group.collection||'Importerad rad'}))} → ${esc(label)} · ${group.rowCount} källrad${group.rowCount===1?'':'er'}</summary><p>${esc(group.reason)}</p>${shown.map(review=>{
   const pi=mapping.profiles.findIndex(profile=>profile.name===review.sheet&&(!review.source||!profile.fileName||profile.fileName===review.source)),ci=mapping.profiles[pi]?.columns.findIndex(column=>column.index===review.columnIndex);
   return `<article data-import-row="${esc(review.id)}"><strong>${esc(review.source||prepared.fileName)} · ${esc(review.sheet)} · Rad ${esc(review.row)}${review.recordId?' · '+esc(review.recordId):''}</strong><small>Kolumn: ${esc(review.column||'Identifierare/koppling')} · Källvärde: ${esc(review.value??review.proposed??'–')}</small><small>${review.recordRejected?'Denna registerpost lämnas för komplettering. Övriga säkert identifierade uppgifter på raden läses in.':review.personLinkRejected?'Personkopplingen lämnas för granskning. Övriga giltiga uppgifter på raden läses in.':review.rowRejected?'Hela raden lämnas utanför importen.':'Övriga säkert kopplade uppgifter på raden läses in; detta fält ändras inte.'}</small>${pi>=0&&ci>=0?`<button type="button" data-locate-import-column="${pi}:${ci}">Visa kolumnval</button>`:''}</article>`;
  }).join('')}${shown.length<group.reviews.length?'<small>Alla källrader finns i granskningsunderlaget.</small>':''}</details>`;
 }).join('')}<button type="button" data-export-import-review>Exportera granskningsunderlag (JSON)</button></details>`;
}
function agreementItemsPreview(result,schemas){
 const items=(result.clean?.agreement_items||[]).filter(item=>Object.hasOwn(result.report.recordStates?.agreementItems||{},item.id));
 if(!items.length)return '';
 const labels=schemas.find(s=>s.key==='agreementItems')?.itemTypes||{};
 const label=type=>Object.entries(labels).find(([,key])=>key===type)?.[0]||type;
 return `<details class="import-result" data-import-item-records><summary>Avtalsposter (${items.length})</summary><small>En rad per avtalspost. Grundbelopp visas före uppräkning.</small><div class="import-result-table"><table aria-label="Avtalsposter att läsa in"><thead><tr><th>Avtal</th><th>Post</th><th>Typ</th><th>Kr/år</th></tr></thead><tbody>${items.slice(0,100).map(item=>`<tr data-import-item-id="${esc(item.id)}"><td>${esc(item.agreement_id)}</td><td>${esc(item.name)}</td><td>${esc(label(item.type))}</td><td>${Number(item.base_amount).toLocaleString('sv-SE')}</td></tr>`).join('')}</tbody></table></div>${items.length>100?`<small>Visar 100 av ${items.length} poster.</small>`:''}</details>`;
}
export function columnPreviewHtml(prepared,mapping,result,schemas,preferences={},options={}) {
  const fields=fieldCatalog(schemas,true);
  const duplicates=mappingConflicts(mapping.profiles),duplicateKeys=new Set(duplicates.flatMap(group=>group.columns.map(column=>group.profileIndex+':'+column.columnIndex)));
  const undecidedRow=mapping.profiles.some(p=>p.mappingRowSuggested&&!p.mappingRowDecision);
  const all=mapping.profiles.flatMap(profile=>profile.columns),unmapped=all.filter(pending).length,included=all.filter(c=>selected(c)&&!pending(c)).length;
  const reviews=(options.stale?[]:result.data.importReview||[]).filter(row=>row.status==='pending'&&mapping.profiles.some(profile=>profile.name===row.sheet&&(!row.source||row.source===(profile.fileName||prepared.fileName))));
  const tableRows=importTableRows(result.report.tables||[]),reviewGroups=importReviewGroups(reviews);
  const importedIssues=(result.clean?.issues||[]).filter(issue=>Object.hasOwn(result.report.recordStates?.activities||{},issue.id)),unlinkedIssues=importedIssues.filter(issue=>!issue.property_id&&!issue.object_id);
  const completionTypes=reviewGroups.filter(group=>['fields','contacts'].includes(group.category)).length,valueChoices=importConflictGroups(result).length;
  const waitingLinks=(result.report.linkProposals||[]).filter(row=>!row.approved).length,blockedRows=Math.max(0,(result.report.blocking||0)-waitingLinks);
  const feedback=[waitingLinks?waitingLinks+' kopplingar att godkänna':'',unlinkedIssues.length?unlinkedIssues.length+' ärenden att koppla':'',completionTypes?completionTypes+(completionTypes===1?' typ av komplettering':' typer av kompletteringar'):'',valueChoices?valueChoices+(valueChoices===1?' uppgift med ett annat värde':' uppgifter med olika värden'):'',blockedRows?blockedRows+(blockedRows===1?' källrad kan inte läsas in':' källrader kan inte läsas in'):''].filter(Boolean).join(' · ');
  const rowHtml=(profile,pi,column,ci)=>{
    const names=new Map([...fields,...contactFields(profile)].map(field=>[field.target,fieldLabel(field)]));
    const key=pi+':'+ci,[collection,field]=column.target.split('.');
    const changes=(result.report.changes||[]).filter(change=>change.collection===collection&&change.field===field&&(!change.provenance?.sheet||change.provenance.sheet===profile.name)&&(!profile.fileName||change.provenance?.source===profile.fileName));
    const conflicts=reviews.filter(review=>review.collection===collection&&review.field===field&&(!review.sheet||review.sheet===profile.name)&&(!review.source||review.source===(profile.fileName||prepared.fileName)));
    const preference=importPreference(preferences,collection,field,profile.fileName||prepared.fileName,profile,column);
    const canPrioritize=(!options.conflictMode||options.conflictMode==='review')&&selected(column)&&!personRole(column.target)&&!contactPart(column.target)&&!['id','sourceId','objectId','propertyId','contractId','activityId'].includes(field)&&(conflicts.length||preference);
    const examples=column.samples||column.examples||[],itemLabel=Object.entries(schemas.find(s=>s.key===collection)?.itemTypes||{}).find(([,type])=>type===column.itemType)?.[0];
    return `<div class="import-column-row" data-import-column="${key}" data-column-state="${duplicateKeys.has(key)?'conflict':pending(column)?'pending':selected(column)?'mapped':'ignored'}">
      <div class="import-column-name"><strong>${esc(column.header)}</strong><small>${esc(column.filled??0)} ${column.sampled?'kontrollerade exempel':'ifyllda'} · ${formatHtml(column)}</small>${column.identity&&selected(column)?'<small>Används för att identifiera och koppla poster.</small>':''}</div>
      <div class="import-column-examples"><span>${esc(examples.find(value=>String(value??'').trim())??'–')}</span>${examples.length?`<details data-example-key="${key}"><summary>Visa exempel</summary>${examples.map((value,index)=>`<small>Rad ${(profile.dataStartRow??profile.headerRow??1)+index+1}: ${esc(value===''?'Tomt':value)}</small>`).join('')}</details>`:''}</div>
      <div class="import-column-choice"><button type="button" class="import-target" data-preview-map="${key}" aria-label="Välj fält för ${esc(column.header)}">${esc(names.get(column.target)||'Välj fält…')}${itemLabel?' · '+esc(itemLabel):''}</button><button type="button" data-ignore-column="${key}" aria-pressed="${column.target==='@ignore'}">${column.target==='@ignore'?'Ångra bortval':'Importera inte'}</button>
      ${issueNumberColumn(profile,column)&&column.target!=='@ignore'?`<label>Numret avser<select data-issue-number="${key}" aria-label="Numret avser för ${esc(column.header)}"><option value="">Välj koppling</option><option value="activities.propertyId" ${column.target==='activities.propertyId'?'selected':''}>FastighetsID / förvaltningsnummer</option><option value="activities.objectId" ${column.target==='activities.objectId'?'selected':''}>ObjektID</option></select></label>`:''}
      ${column.warning?`<small role="alert">${esc(column.warning)}</small>`:''}<small>${esc({explicit:'Matchningsrad',saved:'Tidigare godkänt val',manual:'Manuellt valt',alias:'Automatiskt förslag – kontrollera'}[column.matchSource]||'')}</small><small${duplicateKeys.has(key)?' role="alert"':''}>${duplicateKeys.has(key)?'Dubbelkoppling: välj ett annat fält eller Importera inte':pending(column)?'Behöver kopplas eller väljas bort':selected(column)?changes.length+' fältändringar · '+conflicts.length+' avvikelser':'Importeras inte'}</small>
      ${selected(column)&&column.target.startsWith('agreementItems.')&&!['id','contractId','type'].includes(field)?`<label>${field==='baseAmount'?'Posttyp':'Gäller avtalspost'}<select data-item-type="${key}" aria-label="Avtalspost för ${esc(column.header)}"><option value="">${profile.primaryTable==='agreementItems'?'En post per datarad':'Välj posttyp'}</option>${Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).map(([label,value])=>`<option value="${value}" ${value===column.itemType?'selected':''}>${esc(label)}</option>`).join('')}</select></label>${field==='baseAmount'&&column.itemType?'<small>Denna beloppskolumn skapar en egen post på radens AvtalsID.</small>':''}${field!=='baseAmount'&&(column.itemAmbiguous||profile.columns.filter(c=>c.target==='agreementItems.baseAmount'&&c.itemType===column.itemType).length>1)?`<label>Beloppskolumn<select data-item-key="${key}" aria-label="Beloppskolumn för ${esc(column.header)}"><option value="">Välj post</option>${profile.columns.filter(c=>c.target==='agreementItems.baseAmount'&&c.itemType===column.itemType).map(c=>`<option value="${esc(c.itemKey)}" ${c.itemKey===column.itemKey?'selected':''}>${esc(c.header)}${c.itemKey.includes(':')?' ('+esc(c.itemKey.split(':')[1])+')':''}</option>`).join('')}</select></label>`:''}${column.itemAmbiguous?'<small role="alert">Välj vilken post kolumnen gäller. Villkor delas inte automatiskt mellan tillägg.</small>':''}`:''}
      ${selected(column)&&column.format?.type==='date'?`<label>Datumtolkning<select data-date-mode="${key}" aria-label="Datumtolkning för ${esc(column.header)}">${Object.entries({auto:'Automatisk · svenska datum / Excel',dmy:'Dag/månad/år (fyra siffror)',mdy:'Månad/dag/år (fyra siffror)','excel-1900':'Excel-tal · 1900-systemet','excel-1904':'Excel-tal · 1904-systemet'}).map(([value,label])=>`<option value="${value}" ${value===(column.dateMode||'auto')?'selected':''}>${label}</option>`).join('')}</select></label>`:''}
      ${personRole(column.target)?personIdentityHtml(column,key):''}
      ${canPrioritize?`<label>Vid avvikelse<select aria-label="Berikningsregel för ${esc(column.header)}" data-column-rule="${key}"><option value="">Komplettera tomma fält, granska konflikter</option><option value="accept">Använd denna källa vid avvikelse</option><option value="reject">Behåll befintliga värden vid avvikelse</option></select></label>${preference?'<small>Sparad kolumnregel</small>':''}`:''}</div>
    </div>`;
  };
  const groups=[['conflict','Dubbelkopplingar',(_column,key)=>duplicateKeys.has(key)],['pending','Behöver väljas',pending],['mapped','Föreslagna kopplingar',(column,key)=>selected(column)&&!pending(column)&&!duplicateKeys.has(key)],['ignored','Importeras inte',column=>column.target==='@ignore']];
  return `<h2>2. Granska kolumnernas fördelning</h2><p>${esc(prepared.fileName)}. En Excel-flik kan berika flera register. Varje kolumn matchas separat mot ett befintligt fält. Granska förslagen eller välj Importera inte.</p>
    <p class="import-selection-status" role="status">${included} kolumner läses in · ${all.length-included-unmapped} väljs bort${unmapped?' · '+unmapped+' behöver väljas':''}</p>
    ${options.stale?'':importValueChoices(options.conflicts||importConflictGroups(result),{...options,canonical:mapping.profiles.some(profile=>profile.canonical),reusedLinks:result.report.reusedLinks?.length||0})}
    ${skippedFinancialHtml(options.financialSuggestions||[],schemas)}
    ${duplicates.length?`<div data-mapping-conflicts role="alert"><strong>Rätta dubbelkopplingarna före import</strong>${duplicates.map(group=>`<p>${esc(mapping.profiles[group.profileIndex].name)}: ${esc(group.columns.map(column=>column.header).join(' och '))} är kopplade till ${esc(fieldLabel(fields.find(field=>field.target===group.target)||{label:group.target}))}. Välj vilket fält varje kolumn ska fylla.</p>`).join('')}</div>`:''}
    ${mapping.profiles.filter(p=>p.canonical).map((profile,pi)=>`<section class="import-sheet-settings"><strong>${esc(profile.fileName||prepared.fileName)} · ${esc(profile.name)}</strong><small>${profile.rowCount} datarader · ${profile.tableConfidence==='review'?'Kontrollera förslagens utgångspunkt':'Automatisk utgångspunkt för förslag'}</small><label>Utgångspunkt för förslag<select data-import-table="${pi}" aria-label="Utgångspunkt för ${esc(profile.name)}">${schemas.map(s=>`<option value="${esc(s.key)}" ${s.key===profile.primaryTable?'selected':''}>${esc(s.sheet)}</option>`).join('')}</select></label><label>Rad ${profile.headerRow+1} efter rubrikerna<select data-mapping-row="${pi}" aria-label="Matchningsrad för ${esc(profile.name)}">${profile.mappingRowSuggested?'<option value="ask">En möjlig matchningsrad hittades – välj</option>':''}<option value="no" ${profile.mappingRowDecision==='no'||!profile.mappingRowSuggested&&!profile.mappingRow?'selected':''}>Vanlig datarad</option><option value="yes" ${profile.mappingRow?'selected':''}>Innehåller Lokalblick-fältnamn</option></select></label><small>Valet hjälper Lokalblick att tolka rubriker. Kolumnerna kan fortfarande gå till olika register.</small>${destinationSummary(profile,schemas,pi)}${importIdentityWarnings(profile,schemas).map(warning=>`<small role="alert">${esc(warning)}</small>`).join('')}</section>`).join('')}
    <div class="import-column-groups">${groups.map(([group,label,test])=>{
      const count=mapping.profiles.reduce((total,profile,pi)=>total+profile.columns.filter((column,ci)=>test(column,pi+':'+ci)).length,0);if(!count)return '';
      return `<details data-column-group="${group}"${group==='conflict'||group==='pending'?' open':''}><summary>${label} (${count})</summary>${group==='pending'?'<p>Vi hittade inget säkert fält för dessa kolumner. Välj var de hör hemma eller välj bort dem.</p><button type="button" data-ignore-unmapped>Importera inte dessa kolumner</button>':''}${mapping.profiles.map((profile,pi)=>{
        const columns=profile.columns.map((column,ci)=>({column,ci})).filter(({column,ci})=>test(column,pi+':'+ci));
        return columns.length?`<section class="import-column-sheet"><h3>${esc(profile.fileName||prepared.fileName)} · ${esc(profile.name)} <small>${profile.rowCount} rader</small></h3>${group==='mapped'?[...new Set(columns.map(({column})=>column.target.split('.')[0]))].map(collection=>`<section class="import-destination-fields" data-import-destination-fields="${pi}:${esc(collection)}"><h4>${esc(collectionCaption(schemas.find(s=>s.key===collection)||{sheet:'Kontaktuppgifter'}))}</h4>${columns.filter(({column})=>column.target.split('.')[0]===collection).map(({column,ci})=>rowHtml(profile,pi,column,ci)).join('')}</section>`).join(''):columns.map(({column,ci})=>rowHtml(profile,pi,column,ci)).join('')}</section>`:'';
      }).join('')}</details>`;
    }).join('')}</div>
    <section class="import-result" data-import-result><h3>3. Granska hela importen</h3>${options.stale?'<p role="status">Kolumnvalen har ändrats. Kontrollera posterna innan du importerar.</p>':`<p>Alla valda register kontrolleras tillsammans. Inget är sparat ännu.</p>${tableRows.length?`<div class="import-result-table"><table aria-label="Resultat per tabell"><thead><tr><th>Register</th><th>Klara</th><th>Nya</th><th>Kompletteras</th><th>Oförändrade</th></tr></thead><tbody>${tableRows.map(table=>`<tr data-import-register="${esc(table.collection)}"><th>${esc(collectionCaption({key:table.collection,sheet:table.label}))}</th><td>${table.created+table.updated+(table.unchanged||0)}</td><td>${table.created}</td><td>${table.updated}</td><td>${table.unchanged??0}</td></tr>`).join('')}</tbody></table></div>`:'<p>Inga poster klara att läsa in.</p>'}${feedback?`<small>${esc(feedback)}. Öppna bara det du vill kontrollera nedan.</small>`:'<small>Inga kvarstående kompletteringar eller osäkra kopplingar.</small>'}${importedIssues.length?`<p data-issue-home-result>${importedIssues.filter(issue=>issue.property_id).length} kopplade till fastighet · ${importedIssues.filter(issue=>issue.object_id).length} till objekt · <strong>${unlinkedIssues.length} att koppla</strong>.</p>`:''}${unlinkedIssues.length?'<p>Ofullständiga eller motstridiga kopplingar sparas som <strong>Att koppla</strong>. Kontrollera kolumnvalet ovan eller koppla dem senare under Ärenden → Att koppla.</p>':''}`}</section>
    ${!options.stale&&result.report.consolidation?`<small>${result.report.consolidation.files} filer · ${result.report.consolidation.sheets} flikar · ${result.report.consolidation.uniqueRecords} identifierade poster.</small>`:''}
    ${options.stale?'':agreementItemsPreview(result,schemas)}
    ${options.stale?'':importLinkProposalsHtml(result.report.linkProposals)}
    ${options.stale?'':importProblemsHtml(reviews,prepared,mapping,schemas)}
    ${!options.stale&&result.report.blocking?`<p role="alert">${result.report.blocking} källrader väntar på godkänd koppling eller behöver rättas. Godkänn förslagen, rätta uppgifterna eller läs in övriga godkända rader.</p>${result.clean?`<label><input type="checkbox" data-import-safe-rows ${options.allowPartial?'checked':''} ${result.report.rows<=result.report.blocking?'disabled':''}> Importera endast ${result.report.rows-result.report.blocking} godkända rader. Lämna ${result.report.blocking} väntande eller felaktiga rader utanför och spara dem för granskning.</label>`:''}`:''}
    <p>Tomma fält kompletteras. Manuellt verifierade värden skyddas och avvikelser kan granskas. Inget sparas innan du genomför importen.</p><p data-import-error role="alert"></p>
    <div class="actions import-review-actions">${mapping.profiles.some(p=>p.canonical)?`<button type="button" data-export-mapping ${unmapped||duplicates.length||undecidedRow?'disabled':''}>Godkänn fältval och hämta mall</button>`:''}${options.stale?'<button type="button" data-check-records class="primary-action">Kontrollera poster</button>':''}<button type="button" data-cancel>Avbryt</button><button type="button" data-apply class="primary-action"${options.stale||undecidedRow||unmapped||!included||duplicates.length||result.report.blocking&&!options.allowPartial?' disabled':''}>${result.clean?'Fortsätt till godkännande':'Genomför import'}</button></div>`;
}
export async function previewImport(prepared,base,schemas,actor,evaluator=null) {
  const mapping={profiles:reviewProfiles(prepared.profiles,schemas)},fields=fieldCatalog(schemas,true);
  const draft=structuredClone(base);draft.importFieldPreferences ||= {};
  const financialSuggestions=mapping.profiles.flatMap((profile,pi)=>skippedFinancialSuggestions(prepared.workbook,profile,schemas,window.XLSX).map(column=>({key:pi+':'+profile.columns.findIndex(c=>c.index===column.index),column})));
  const pendingFinancialSuggestions=()=>financialSuggestions.filter(({key})=>{const [pi,ci]=key.split(':').map(Number),profile=mapping.profiles[pi],column=profile.columns[ci];return !profile.mappingRow&&!['recurringCosts','costEvidence'].includes(profile.primaryTable)&&column.matchSource==='saved'&&['@ignore','@unmapped'].includes(column.target);});
  suggestIssueNumberColumns(mapping.profiles,base);
  const context={fingerprint:prepared.fingerprint,fileName:prepared.fileName,schemas,actor,strictColumns:true,personLinks:true,objectAreas:true,allowMappingConflicts:true};
  let conflictMode='review';
  const evaluate=()=>{const working=conflictMode==='review'?draft:{...draft,importFieldPreferences:{}};const profiles=mapping.profiles.map(profile=>({...profile,columns:profile.columns.map(column=>pending(column)?{...column,target:'@ignore'}:column)}));return evaluator?evaluator(profiles,working):prepareMappedImport(prepared.workbook,profiles,working,{...context,rowMatches:draft.importRowMatches},window.XLSX);};
  const d=dialog('<p role="status">Kontrollerar valda kolumner…</p>','import-mapping-dialog');
  return new Promise((resolve,reject)=>{
    const disclosures=new Map();
    let result,rawResult,closed=false,generation=0,resultGeneration=0,allowPartial=false,stale=false,conflictChoices={};
    const close=()=>{closed=true;evaluator?.cancel?.();d.close();d.remove();};
    const abort=()=>{close();const error=Error('Importen avbröts');error.name='AbortError';reject(error);};
    const locate=key=>{const [pi,ci]=key.split(':').map(Number);return {profile:mapping.profiles[pi],column:mapping.profiles[pi].columns[ci]};};
    const viewState=()=>{
      const focused=document.activeElement,focusAttr=['data-column-rule','data-date-mode','data-preview-map','data-ignore-column','data-person-format','data-person-shared','data-import-conflict-mode','data-import-conflict-choice','data-item-type','data-item-key','data-import-table','data-mapping-row','data-issue-number'].find(attr=>focused?.hasAttribute(attr));
      for(const node of d.querySelectorAll('details'))if(disclosureKey(node))disclosures.set(disclosureKey(node),node.open);
      return {scroll:d.scrollTop,open:new Map(disclosures),focusAttr,focusValue:focusAttr?focused.getAttribute(focusAttr):null};
    };
    const disclosureKey=node=>node.dataset.columnGroup?'group:'+node.dataset.columnGroup:node.dataset.exampleKey?'example:'+node.dataset.exampleKey:node.dataset.reviewProblem?'review:'+node.dataset.reviewProblem:node.hasAttribute('data-import-errors')?'errors':node.hasAttribute('data-import-value-choices')?'value-choices':node.hasAttribute('data-import-item-records')?'item-records':node.hasAttribute('data-import-link-exceptions')?'link-exceptions':node.hasAttribute('data-import-link-suggestions')?'link-suggestions':node.hasAttribute('data-import-link-approved')?'link-approved':null;
    const render=state=>{
      let error;try{result=resolveImportChoices(rawResult,{mode:conflictMode,choices:conflictChoices},actor);}catch(failure){error=failure;result=null;}
      d.innerHTML=columnPreviewHtml(prepared,mapping,result||rawResult,schemas,draft.importFieldPreferences,{allowPartial,stale,conflicts:importConflictGroups(rawResult),conflictMode,conflictChoices,financialSuggestions:pendingFinancialSuggestions()});d.setAttribute('aria-busy','false');
      for(const group of d.querySelectorAll('details'))if(state.open.has(disclosureKey(group)))group.open=state.open.get(disclosureKey(group));
      if(state.focusAttr)d.querySelector(`[${state.focusAttr}="${state.focusValue}"]`)?.focus({preventScroll:true});
      for(const node of d.querySelectorAll('[data-column-rule]')){const {profile,column}=locate(node.dataset.columnRule);node.value=importPreference(draft.importFieldPreferences,...column.target.split('.'),profile.fileName||prepared.fileName,profile,column)||'';}
      d.scrollTop=state.scroll;
      if(error){d.querySelector('[data-import-error]').textContent=error.message;d.querySelector('[data-apply]').disabled=true;}
    };
    const refresh=async()=>{
      if(closed)return;
      const state=viewState();allowPartial=false;conflictChoices={};const revision=++generation;d.setAttribute('aria-busy','true');d.querySelector('[data-apply]')?.setAttribute('disabled','');
      try{let next=await evaluate();if(closed||revision!==generation)return;
        // Registers from other sheets are now available too. At most one extra
        // evaluation, only when their evidence actually changes a column choice.
        if(next.clean&&suggestIssueNumberColumns(mapping.profiles,next.clean)){next=await evaluate();if(closed||revision!==generation)return;}
        // A run-wide keep/replace choice overrides earlier source rules for
        // this preview only. Retain those rules for later imports.
        if(next.clean)next.clean.workspace.importFieldPreferences=structuredClone(draft.importFieldPreferences);
        if(next.data)next.data.importFieldPreferences=structuredClone(draft.importFieldPreferences);
        rawResult=next;stale=false;resultGeneration=revision;render(state);
      }catch(error){if(closed||revision!==generation||error.name==='AbortError')return;fail(error);}
    };
    const invalidate=()=>{
      for(const profile of mapping.profiles)assignAgreementItemKeys(profile);
      // Column changes invalidate earlier approval of the source-row relation.
      draft.importRowMatches={};
      if(!rawResult){refresh();return;}
      const state=viewState();generation++;stale=true;allowPartial=false;conflictChoices={};evaluator?.invalidate?.();render(state);
    };
    const update=(profile,column,target)=>{
      column.valueType=schemas.find(s=>s.key===target.split('.')[0])?.fieldSpecs?.[target.split('.')[1]]?.type;retargetColumn(prepared.workbook,profile,column,target,window.XLSX);if(target.startsWith('agreementItems.')&&!column.itemType){const hint=resolveFieldName(column.header,schemas,'contracts');if(hint?.target===target)column.itemType=hint.itemType;}column.collection=target.split('.')[0];
      const allowed=new Set(contactFields(profile).map(field=>field.target));
      for(const other of profile.columns)if(contactPart(other.target)&&!allowed.has(other.target))retargetColumn(prepared.workbook,profile,other,'@unmapped',window.XLSX);
      invalidate();
    };
    const fail=error=>{d.setAttribute('aria-busy','false');result=null;const output=d.querySelector('[data-import-error]');if(output)output.textContent=error.message;else d.insertAdjacentHTML('beforeend','<p data-import-error role="alert">'+esc(error.message)+'</p><button type="button" data-cancel>Avbryt</button>');const apply=d.querySelector('[data-apply]');if(apply)apply.disabled=true;};
    d.addEventListener('cancel',event=>{event.preventDefault();abort();});
    d.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;
      try{
        if(button.hasAttribute('data-restore-financial')){
          const proposals=pendingFinancialSuggestions().filter(proposal=>button.dataset.restoreFinancial==='all'||proposal.key===button.dataset.restoreFinancial);
          for(const proposal of proposals){const {column}=locate(proposal.key);Object.assign(column,proposal.column,{approved:true,matchSource:'manual'});}
          invalidate();return;
        }
        if(button.hasAttribute('data-open-import-destination')){
          const [pi,collection]=button.dataset.openImportDestination.split(':'),profile=mapping.profiles[pi];
          const ci=profile.columns.findIndex(column=>column.target.startsWith(collection+'.'));
          const section=d.querySelector(`[data-import-destination-fields="${pi}:${collection}"]`)||d.querySelector(`[data-import-column="${pi}:${ci}"]`);
          const group=section?.closest('[data-column-group]');if(group){group.open=true;section.scrollIntoView({block:'start'});section.querySelector('[data-preview-map]')?.focus({preventScroll:true});}return;
        }
        if(button.hasAttribute('data-locate-import-column')){const row=d.querySelector(`[data-import-column="${button.dataset.locateImportColumn}"]`);if(row){row.closest('[data-column-group]').open=true;row.scrollIntoView({block:'center'});row.querySelector('[data-preview-map]')?.focus();}return;}
        if(button.hasAttribute('data-export-import-review')){const blob=new Blob([JSON.stringify(result.data.importReview||[],null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lokalblick-importgranskning.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);return;}
        if(button.hasAttribute('data-cancel')){abort();return;}
        if(button.hasAttribute('data-check-records')){refresh();return;}
        if(button.hasAttribute('data-approve-link-proposals')){
          if(stale||d.getAttribute('aria-busy')==='true'||resultGeneration!==generation)return;
          draft.importRowMatches ||= {};
          for(const proposal of rawResult.report.linkProposals||[])if(!proposal.approved&&proposal.matches.length===1&&!proposal.requiresSelection&&!proposal.matches[0].disabled)draft.importRowMatches[proposal.matchingKey]={propertyId:proposal.matches[0].id,signature:proposal.signature};
          refresh();return;
        }
        if(button.hasAttribute('data-export-mapping')){const book=mappingTemplate(prepared.workbook,mapping.profiles,schemas,window.XLSX);window.XLSX.writeFile(book,'Lokalblick-importmall.xlsx');return;}
        if(button.hasAttribute('data-preview-map')){const key=button.dataset.previewMap,{profile,column}=locate(key),target=await chooseField([...fields,...contactFields(profile)],column.target,profile,schemas,column);if(closed)return;if(target)update(profile,column,target);d.querySelector(`[data-preview-map="${key}"]`)?.focus();}
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
          if(result.clean){
            const approved=await reviewImportApproval(result,evaluator?.baseline||collectWorkspace(base),actor);
            if(!approved)return;
            result=approved;
          }
          result.report.actor=actor;close();resolve(result);
        }
      }catch(error){fail(error);}
    });
    d.addEventListener('change',event=>{
      if(event.target.hasAttribute('data-link-property')){
        if(stale||d.getAttribute('aria-busy')==='true'||resultGeneration!==generation)return;
        const index=Number(event.target.dataset.linkProperty),proposal=rawResult.report.linkProposals[index];
        if(proposal.approved){delete draft.importRowMatches[proposal.matchingKey];refresh();}
        else d.querySelector(`[data-approve-link="${index}"]`).disabled=!event.target.value;
        return;
      }
      if(event.target.hasAttribute('data-approve-link')){
        if(stale||d.getAttribute('aria-busy')==='true'||resultGeneration!==generation)return;
        const index=Number(event.target.dataset.approveLink),proposal=rawResult.report.linkProposals[index];
        const propertyId=proposal.matches.length===1?proposal.matches[0].id:d.querySelector(`[data-link-property="${index}"]`).value;
        draft.importRowMatches ||= {};
        if(event.target.checked&&propertyId)draft.importRowMatches[proposal.matchingKey]={propertyId,signature:proposal.signature};
        else delete draft.importRowMatches[proposal.matchingKey];
        refresh();return;
      }
      if(event.target.hasAttribute('data-issue-number')){const {profile,column}=locate(event.target.dataset.issueNumber);update(profile,column,event.target.value||'@unmapped');return;}
      if(event.target.hasAttribute('data-person-format')){const {column}=locate(event.target.dataset.personFormat);column.personFormat=event.target.value;column.approved=true;invalidate();return;}
      if(event.target.hasAttribute('data-item-key')){const {column}=locate(event.target.dataset.itemKey);column.itemKey=event.target.value||undefined;column.approved=true;invalidate();return;}
      if(event.target.hasAttribute('data-item-type')){const {column}=locate(event.target.dataset.itemType);column.itemType=event.target.value||undefined;delete column.itemKey;column.approved=true;invalidate();return;}

      if(event.target.hasAttribute('data-import-table')||event.target.hasAttribute('data-mapping-row')){
        const isTable=event.target.hasAttribute('data-import-table'),profile=mapping.profiles[Number(isTable?event.target.dataset.importTable:event.target.dataset.mappingRow)];
        if(isTable)setPrimaryTable(prepared.workbook,profile,event.target.value,schemas,window.XLSX);
        else{const enabled=event.target.value==='yes';profile.mappingRowDecision=event.target.value==='ask'?null:event.target.value;if(enabled!==profile.mappingRow)setMappingRow(prepared.workbook,profile,enabled,schemas,window.XLSX);}
        invalidate();return;
      }
      if(event.target.hasAttribute('data-import-conflict-mode')||event.target.hasAttribute('data-import-conflict-choice')){
        if(d.getAttribute('aria-busy')==='true'||resultGeneration!==generation||!rawResult)return;
        const state=viewState();allowPartial=false;
        if(event.target.hasAttribute('data-import-conflict-mode')){conflictMode=event.target.value;conflictChoices={};refresh();return;}
        else{const group=importConflictGroups(rawResult)[Number(event.target.dataset.importConflictChoice)],value=event.target.value;if(!value)delete conflictChoices[group.key];else conflictChoices[group.key]=value==='keep'?'keep':group.candidates[Number(value.split(':')[1])].key;}
        render(state);return;
      }
      if(event.target.hasAttribute('data-import-safe-rows')){allowPartial=event.target.checked;const all=mapping.profiles.flatMap(p=>p.columns),valid=!stale&&result&&resultGeneration===generation&&d.getAttribute('aria-busy')!=='true'&&!all.some(pending)&&all.some(selected)&&!mappingConflicts(mapping.profiles).length;d.querySelector('[data-apply]').disabled=!(valid&&(!result.report.blocking||allowPartial));return;}
      if(event.target.hasAttribute('data-date-mode')){const {profile,column}=locate(event.target.dataset.dateMode);column.dateMode=event.target.value;column.approved=true;refreshColumnFormat(prepared.workbook,profile,column,window.XLSX);invalidate();return;}
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
