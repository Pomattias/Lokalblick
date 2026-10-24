import {createBusinessLabels} from '../lokaler/business-identities.js';
import {importValueChoices} from "./import-summary.js";
import {importApprovalHtml,chooseExistingProperty,matchingCreations} from './import-approval.js';
import {creationChoice,creationAvailable,approveImportPlan} from '../lokaler/import-plan.js';
import {reviewImportDraft} from '../lokaler/import-review.js';
import {explainImport} from '../lokaler/import-explanation.js';
import {emptyData} from '../lokaler/model.js';
import {chooseImportContact} from './import-contact.js';
import {collectWorkspace} from '../lokaler/view-adapter.js';
import {importTableHtml} from './import-table.js';
import {matchingImportRows,importColumnWarning} from './import-row-review.js';
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
 return `<small>Personen registreras en gång. Rollen gäller kopplingen till det valda målet och kan ändras. Fastighetsägare och ägarens kontaktperson är skilda uppgifter. Saknade kontaktdatum lämnas tomma.</small>
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
  const d=dialog('<h2>Välj fält för '+esc(column.header)+'</h2><p>Välj var just denna kolumn hör hemma. Övriga kolumner påverkas inte.</p><label>Register<select data-field-table></select></label><label>Sök bland alla fält<input type="search" data-field-search placeholder="Adress, kontaktperson, hyra…" autocomplete="off"></label><div class="import-field-results" data-field-results></div><div class="actions"><button type="button" data-picker-options>Inställningar för kolumnen</button><button type="button" data-picker-close>Avbryt</button></div>','import-field-picker');
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
    d.querySelector('[data-picker-options]').onclick=()=>finish('@settings');
    d.querySelector('[data-picker-close]').onclick=()=>finish(null);
    d.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
    search.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('button')?.focus();}});
  });
}
function skippedFinancialHtml(suggestions,schemas){
 if(!suggestions.length)return '';
 const fields=new Map(fieldCatalog(schemas,true).map(field=>[field.target,field]));
 return `<section class="import-financial-suggestions" data-skipped-financial><div class="section-title"><h3>Hyreskolumner att koppla på nytt</h3><button type="button" data-restore-financial="all">Använd ${suggestions.length} förslag</button></div><small>Sparade bortval eller äldre fältkopplingar hindrar dessa kolumner från att läsas in. Granska de nya förslagen till Avtalsposter och välj vilka du vill använda.</small><ul>${suggestions.map(({key,column})=>{const type=Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).find(([,type])=>type===column.itemType)?.[0];return `<li><div><strong>${esc(column.header)}</strong><small>${esc(fields.get(column.target)?.label)}${type?' · '+esc(type):''}</small></div><button type="button" data-restore-financial="${key}">Använd förslag</button></li>`;}).join('')}</ul></section>`;
}

function importProblemsHtml(reviews,prepared,mapping,schemas,data){
 const labels=createBusinessLabels(data),show=value=>esc(labels.text(value));
 const groups=importReviewGroups(reviews.filter(row=>!row.linkProposal)).filter(group=>group.category!=='values');if(!groups.length)return '';
 const blocked=groups.some(group=>group.category==='blocked');let remaining=100;
 return `<details class="import-row-errors" data-import-errors${blocked?' open':''}><summary>Att kontrollera (${groups.length} ${groups.length===1?'problemtyp':'problemtyper'})</summary><p>Återkommande problem visas tillsammans. Valfria fält kan kompletteras senare; osäkra identifierare och kopplingar måste rättas eller lämnas utanför importen.</p>${groups.map(group=>{
  const schema=schemas.find(schema=>schema.key===group.collection),label=schema?.columns.find(([field])=>field===group.field)?.[1]||group.field||'Identifierare/koppling';
  const shown=group.reviews.slice(0,remaining);remaining-=shown.length;
  return `<details data-review-problem="${esc(group.key)}" data-review-category="${group.category}"><summary>${group.category==='blocked'?'Kan inte läsas in':group.category==='contacts'?'Personkoppling att komplettera':'Fält att komplettera'} · ${esc(collectionCaption(schema||{sheet:group.collection||'Importerad rad'}))} → ${esc(label)} · ${group.rowCount} källrad${group.rowCount===1?'':'er'}</summary><p>${show(group.reason)}</p>${shown.map(review=>{
   const pi=mapping.profiles.findIndex(profile=>profile.name===review.sheet&&(!review.source||!profile.fileName||profile.fileName===review.source)),ci=mapping.profiles[pi]?.columns.findIndex(column=>column.index===review.columnIndex);
   return `<article data-import-row="${esc(review.id)}"><strong>${esc(review.source||prepared.fileName)} · ${esc(review.sheet)} · Rad ${esc(review.row)}${review.recordId?' · '+show(review.recordId):''}</strong><small>Kolumn: ${esc(review.column||'Identifierare/koppling')} · Källvärde: ${show(review.value??review.proposed??'–')}</small><small>${review.recordRejected?'Denna registerpost lämnas för komplettering. Övriga säkert identifierade uppgifter på raden läses in.':review.personLinkRejected?'Personkopplingen lämnas för granskning. Övriga giltiga uppgifter på raden läses in.':review.rowRejected?'Hela raden lämnas utanför importen.':'Övriga säkert kopplade uppgifter på raden läses in; detta fält ändras inte.'}</small>${pi>=0&&ci>=0?`<button type="button" data-locate-import-column="${pi}:${ci}">Visa kolumnval</button>`:''}</article>`;
  }).join('')}${shown.length<group.reviews.length?'<small>Alla källrader finns i granskningsunderlaget.</small>':''}</details>`;
 }).join('')}<button type="button" data-export-import-review>Exportera granskningsunderlag (JSON)</button></details>`;
}
export function importColumnSettingsHtml(prepared,mapping,result,schemas,preferences={},options={},pi=0,ci=0){
 const profile=mapping.profiles[pi],column=profile.columns[ci];
 const duplicates=mappingConflicts(mapping.profiles),duplicateKeys=new Set(duplicates.flatMap(group=>group.columns.map(column=>group.profileIndex+':'+column.columnIndex)));
 const reviews=(result.data.importReview||[]).filter(row=>row.status==='pending');
    const key=pi+':'+ci,[collection,field]=column.target.split('.');
    const changes=(result.report.changes||[]).filter(change=>change.collection===collection&&change.field===field&&(!change.provenance?.sheet||change.provenance.sheet===profile.name)&&(!profile.fileName||change.provenance?.source===profile.fileName));
    const conflicts=reviews.filter(review=>review.collection===collection&&review.field===field&&(!review.sheet||review.sheet===profile.name)&&(!review.source||review.source===(profile.fileName||prepared.fileName)));
    const preference=importPreference(preferences,collection,field,profile.fileName||prepared.fileName,profile,column);
    const canPrioritize=(!options.conflictMode||options.conflictMode==='review')&&selected(column)&&!personRole(column.target)&&!contactPart(column.target)&&!['id','sourceId','objectId','propertyId','contractId','activityId'].includes(field)&&(conflicts.length||preference);
    const examples=column.samples||column.examples||[],labels=createBusinessLabels(result.clean);
 return `<h2>${esc(column.header)}</h2>${importColumnWarning(column)?`<p class="import-column-warning" role="note">${esc(importColumnWarning(column))}</p>`:''}<small>${esc(column.filled??0)} ${column.sampled?'kontrollerade exempel':'ifyllda'} · ${formatHtml(column)}</small>${column.identity&&selected(column)?'<small>Används för att identifiera och koppla poster.</small>':''}<div class="import-column-examples"><span>${esc(labels.text(examples.find(value=>String(value??'').trim())??'–'))}</span>${examples.length?`<details data-example-key="${key}"><summary>Visa exempel</summary>${examples.map((value,index)=>`<small>Rad ${(profile.dataStartRow??profile.headerRow??1)+index+1}: ${esc(labels.text(value===''?'Tomt':value))}</small>`).join('')}</details>`:''}</div>
      <div class="import-column-choice">
      ${issueNumberColumn(profile,column)&&column.target!=='@ignore'?`<label>Numret avser<select data-issue-number="${key}" aria-label="Numret avser för ${esc(column.header)}"><option value="">Välj koppling</option><option value="activities.propertyId" ${column.target==='activities.propertyId'?'selected':''}>FastighetsID / förvaltningsnummer</option><option value="activities.objectId" ${column.target==='activities.objectId'?'selected':''}>ObjektID</option></select></label>`:''}
      ${column.warning?`<small role="alert">${esc(column.warning)}</small>`:''}<small>${esc({explicit:'Matchningsrad',saved:'Tidigare godkänt val',manual:'Manuellt valt',alias:'Automatiskt förslag – kontrollera'}[column.matchSource]||'')}</small><small${duplicateKeys.has(key)?' role="alert"':''}>${duplicateKeys.has(key)?'Dubbelkoppling: välj ett annat fält eller Importera inte':pending(column)?'Behöver kopplas eller väljas bort':selected(column)?changes.length+' fältändringar · '+conflicts.length+' avvikelser':'Importeras inte'}</small>
      ${selected(column)&&column.target.startsWith('agreementItems.')&&!['id','contractId','type'].includes(field)?`<label>${field==='baseAmount'?'Posttyp':'Gäller avtalspost'}<select data-item-type="${key}" aria-label="Avtalspost för ${esc(column.header)}"><option value="">${profile.primaryTable==='agreementItems'?'En post per datarad':'Välj posttyp'}</option>${Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).map(([label,value])=>`<option value="${value}" ${value===column.itemType?'selected':''}>${esc(label)}</option>`).join('')}</select></label>${field==='baseAmount'&&column.itemType?'<small>Denna beloppskolumn skapar en egen post på radens AvtalsID.</small>':''}${field!=='baseAmount'&&(column.itemAmbiguous||profile.columns.filter(c=>c.target==='agreementItems.baseAmount'&&c.itemType===column.itemType).length>1)?`<label>Beloppskolumn<select data-item-key="${key}" aria-label="Beloppskolumn för ${esc(column.header)}"><option value="">Välj post</option>${profile.columns.filter(c=>c.target==='agreementItems.baseAmount'&&c.itemType===column.itemType).map(c=>`<option value="${esc(c.itemKey)}" ${c.itemKey===column.itemKey?'selected':''}>${esc(c.header)}${c.itemKey.includes(':')?' ('+esc(c.itemKey.split(':')[1])+')':''}</option>`).join('')}</select></label>`:''}${column.itemAmbiguous?'<small role="alert">Välj vilken post kolumnen gäller. Villkor delas inte automatiskt mellan tillägg.</small>':''}`:''}
      ${selected(column)&&column.format?.type==='date'?`<label>Datumtolkning<select data-date-mode="${key}" aria-label="Datumtolkning för ${esc(column.header)}">${Object.entries({auto:'Automatisk · svenska datum / Excel',dmy:'Dag/månad/år (fyra siffror)',mdy:'Månad/dag/år (fyra siffror)','excel-1900':'Excel-tal · 1900-systemet','excel-1904':'Excel-tal · 1904-systemet'}).map(([value,label])=>`<option value="${value}" ${value===(column.dateMode||'auto')?'selected':''}>${label}</option>`).join('')}</select></label>`:''}
      ${personRole(column.target)?personIdentityHtml(column,key):''}
      ${canPrioritize?`<label>Vid avvikelse<select aria-label="Berikningsregel för ${esc(column.header)}" data-column-rule="${key}"><option value="">Komplettera tomma fält, granska konflikter</option><option value="accept">Använd denna källa vid avvikelse</option><option value="reject">Behåll befintliga värden vid avvikelse</option></select></label>${preference?'<small>Sparad kolumnregel</small>':''}`:''}</div>
`;
}
export function columnPreviewHtml(prepared,mapping,result,schemas,preferences={},options={}) {
  const fields=fieldCatalog(schemas,true);
  const duplicates=mappingConflicts(mapping.profiles),duplicateKeys=new Set(duplicates.flatMap(group=>group.columns.map(column=>group.profileIndex+':'+column.columnIndex)));
  const undecidedRow=mapping.profiles.some(p=>p.mappingRowSuggested&&!p.mappingRowDecision);
  const all=mapping.profiles.flatMap(profile=>profile.columns),unmapped=all.filter(pending).length,included=all.filter(c=>selected(c)&&!pending(c)).length;
  const reviews=(options.stale?[]:result.data.importReview||[]).filter(row=>row.status==='pending'&&mapping.profiles.some(profile=>profile.name===row.sheet&&(!row.source||row.source===(profile.fileName||prepared.fileName))));
  const reviewGroups=importReviewGroups(reviews);
  const importedIssues=(result.clean?.issues||[]).filter(issue=>Object.hasOwn(result.report.recordStates?.activities||{},issue.id)),unlinkedIssues=importedIssues.filter(issue=>!issue.property_id&&!issue.object_id);
  const completionTypes=reviewGroups.filter(group=>['fields','contacts'].includes(group.category)).length,valueChoices=importConflictGroups(result).length;
  const waitingLinks=(result.report.linkProposals||[]).filter(row=>!row.approved).length,blockedRows=Math.max(0,(result.report.blocking||0)-waitingLinks);
  const feedback=[waitingLinks?waitingLinks+' kopplingar att godkänna':'',unlinkedIssues.length?unlinkedIssues.length+' ärenden att koppla':'',completionTypes?completionTypes+(completionTypes===1?' typ av komplettering':' typer av kompletteringar'):'',valueChoices?valueChoices+(valueChoices===1?' uppgift med ett annat värde':' uppgifter med olika värden'):'',blockedRows?blockedRows+(blockedRows===1?' källrad kan inte läsas in':' källrader kan inte läsas in'):''].filter(Boolean).join(' · ');
  const rowHtml=(profile,pi,column,ci)=>{
    const names=new Map([...fields,...contactFields(profile)].map(field=>[field.target,fieldLabel(field)])),key=pi+':'+ci;
    const itemLabel=Object.entries(schemas.find(s=>s.key===column.target.split('.')[0])?.itemTypes||{}).find(([,type])=>type===column.itemType)?.[0];
    return `<div class="import-column-row" data-import-column="${key}" data-column-state="${duplicateKeys.has(key)?'conflict':pending(column)?'pending':selected(column)?'mapped':'ignored'}"><div class="import-column-name"><strong>${esc(column.header)}</strong></div><button type="button" class="import-target" data-preview-map="${key}" aria-label="Välj fält för ${esc(column.header)}">${esc(names.get(column.target)||'Välj fält…')}${itemLabel?' · '+esc(itemLabel):''}</button><button type="button" data-ignore-column="${key}" aria-pressed="${column.target==='@ignore'}">${column.target==='@ignore'?'Ångra bortval':'Importera inte'}</button></div>`;
  };
  const baseline=options.explanationBase||emptyData();
  const projected=options.projected||result;
  const summary=options.explanation?.records||importTableRows(projected.report.tables||[]);
  const impact=summary.filter(row=>row.created||row.updated).map(row=>`${row.label}: ${row.created} nya, ${row.completed??row.updated??0} kompletteras, ${row.changed||0} ändras`).join(' · ');
  return `<h2>Granska importen</h2><p>${esc(prepared.fileName)}. Ändra förslagen i kolumnrubrikerna. Öppna 🔗 för att se och ändra kopplingar. Dina val gäller direkt i utkastet. Inget är sparat ännu.</p>
    <div class="import-impact" data-import-impact role="status"><strong>Det här kommer att sparas</strong><p>${esc(options.stale?'Kontrollerar ändrade kolumnval…':impact||'Inga nya eller ändrade poster har valts.')}</p><small>${included} kolumner valda · ${all.length-included-unmapped} väljs bort${unmapped?' · '+unmapped+' behöver väljas':''}${options.pendingCreations?' · '+options.pendingCreations+' nya registerposter inväntar godkännande':''}</small></div>
    ${importTableHtml(prepared,mapping.profiles,result,baseline,{approved:options.projected,choices:options.creationChoices,explanation:options.explanation,...options.story,columnHtml:rowHtml,stale:options.stale,edits:options.edits})}
    ${options.approvalHtml||''}
    ${skippedFinancialHtml(options.financialSuggestions||[],schemas)}
    ${unmapped?'<button type="button" data-ignore-unmapped>Läs inte in kolumner som saknar fältval</button>':''}
    ${duplicates.length?`<div data-mapping-conflicts role="alert"><strong>Rätta dubbelkopplingarna före import</strong>${duplicates.map(group=>`<p>${esc(mapping.profiles[group.profileIndex].name)}: ${esc(group.columns.map(column=>column.header).join(' och '))} är kopplade till ${esc(fieldLabel(fields.find(field=>field.target===group.target)||{label:group.target}))}.</p>`).join('')}</div>`:''}
    <details data-sheet-settings><summary>Filens rubriker och matchningsrad</summary>${mapping.profiles.map((profile,pi)=>profile.canonical?`<section class="import-sheet-settings"><p>Kolumnerna kan fortfarande gå till olika register.</p><strong>${esc(profile.fileName||prepared.fileName)} · ${esc(profile.name)}</strong><label>Utgångspunkt för förslag<select data-import-table="${pi}" aria-label="Utgångspunkt för ${esc(profile.name)}">${schemas.map(s=>`<option value="${esc(s.key)}" ${s.key===profile.primaryTable?'selected':''}>${esc(s.sheet)}</option>`).join('')}</select></label><label>Rad ${profile.headerRow+1} efter rubrikerna<select data-mapping-row="${pi}" aria-label="Matchningsrad för ${esc(profile.name)}">${profile.mappingRowSuggested?'<option value="ask">En möjlig matchningsrad hittades – välj</option>':''}<option value="no" ${profile.mappingRowDecision==='no'||!profile.mappingRowSuggested&&!profile.mappingRow?'selected':''}>Vanlig datarad</option><option value="yes" ${profile.mappingRow?'selected':''}>Innehåller Lokalblick-fältnamn</option></select></label>${importIdentityWarnings(profile,schemas).map(warning=>`<small role="alert">${esc(warning)}</small>`).join('')}</section>`:'').join('')}</details>
    ${options.stale?'':importValueChoices(options.conflicts||importConflictGroups(result),{...options,data:result.clean,canonical:mapping.profiles.some(profile=>profile.canonical),reusedLinks:result.report.reusedLinks?.length||0})}
    ${options.stale?'':importProblemsHtml(reviews,prepared,mapping,schemas,result.clean)}
    ${!options.stale&&result.report.blocking?`<p role="alert">${result.report.blocking} källrader väntar på godkänd koppling eller behöver rättas.</p>${result.clean?`<label><input type="checkbox" data-import-safe-rows ${options.allowPartial?'checked':''} ${result.report.rows<=result.report.blocking?'disabled':''}> Läs bara in ${result.report.rows-result.report.blocking} godkända rader. Lämna ${result.report.blocking} väntande eller felaktiga rader utanför.</label>`:''}`:''}
    ${!options.stale?`<details data-final-impact><summary>Resultat per register</summary><div class="import-result-table"><table aria-label="Slutligt importbeslut"><thead><tr><th>Register</th><th>Nya</th><th>Kompletteras</th><th>Ändras</th><th>Oförändrade</th></tr></thead><tbody>${summary.map(row=>`<tr data-import-register="${esc(row.collection)}"><th>${esc(row.label)}</th><td>${row.created}</td><td>${row.completed??row.updated??0}</td><td>${row.changed||0}</td><td>${row.unchanged||0}</td></tr>`).join('')}</tbody></table></div>${feedback?`<p>${esc(feedback)}</p>`:''}${importedIssues.length?`<p data-issue-home-result>${importedIssues.filter(issue=>issue.property_id).length} kopplade till fastighet · ${importedIssues.filter(issue=>issue.object_id).length} till objekt · ${unlinkedIssues.length} att koppla. Ofullständiga ärenden kan kopplas senare under Ärenden → Att koppla.</p>`:''}${result.report.consolidation?`<small>${result.report.consolidation.files} filer · ${result.report.consolidation.sheets} flikar · ${result.report.consolidation.uniqueRecords} identifierade poster.</small>`:''}</details>`:''}
    <p data-import-error role="alert"></p><div class="actions import-review-actions">${mapping.profiles.some(p=>p.canonical)?`<button type="button" data-export-mapping ${unmapped||duplicates.length||undecidedRow?'disabled':''}>Hämta kolumnmall</button>`:''}<button type="button" data-cancel>Avbryt</button><button type="button" data-apply class="primary-action"${options.stale||undecidedRow||unmapped||!included||duplicates.length||result.report.blocking&&!options.allowPartial?' disabled':''}>Spara import</button></div>`;
}

export async function previewImport(prepared,base,schemas,actor,evaluator=null) {
  const mapping={profiles:reviewProfiles(prepared.profiles,schemas)},fields=fieldCatalog(schemas,true);
  const draft=structuredClone(base);draft.importFieldPreferences ||= {};
  const story={filter:'',query:'',limit:30,openRows:new Set()},approval={query:'',filter:'',limit:100},edits={properties:Object.create(null),contacts:Object.create(null)};
  const baseline=evaluator?.baseline||collectWorkspace(base);
  let plan=[],creationChoices={},projected,explanation;
  const financialSuggestions=mapping.profiles.flatMap((profile,pi)=>skippedFinancialSuggestions(prepared.workbook,profile,schemas,window.XLSX).map(column=>({key:pi+':'+profile.columns.findIndex(c=>c.index===column.index),column})));
  const pendingFinancialSuggestions=()=>financialSuggestions.filter(({key})=>{const [pi,ci]=key.split(':').map(Number),profile=mapping.profiles[pi],column=profile.columns[ci];return !profile.mappingRow&&!['recurringCosts','costEvidence'].includes(profile.primaryTable)&&column.matchSource==='saved'&&['@ignore','@unmapped'].includes(column.target);});
  suggestIssueNumberColumns(mapping.profiles,base);
  const context={fingerprint:prepared.fingerprint,fileName:prepared.fileName,schemas,actor,strictColumns:true,personLinks:true,objectAreas:true,allowMappingConflicts:true,identityCache:{}};
  let conflictMode='review';
  const evaluate=()=>{const working=conflictMode==='review'?draft:{...draft,importFieldPreferences:{}};const profiles=mapping.profiles.map(profile=>({...profile,columns:profile.columns.map(column=>pending(column)?{...column,target:'@ignore'}:column)}));return evaluator?evaluator(profiles,working):prepareMappedImport(prepared.workbook,profiles,working,{...context,rowMatches:draft.importRowMatches},window.XLSX);};
  const d=dialog('<p role="status">Kontrollerar valda kolumner…</p>','import-mapping-dialog');
  return new Promise((resolve,reject)=>{
    const disclosures=new Map();
    let result,rawResult,closed=false,generation=0,resultGeneration=0,allowPartial=false,stale=false,conflictChoices={};
    let settingsDialog=null,settingsKey=null;
    const closeSettings=()=>{settingsDialog?.close();settingsDialog?.remove();settingsDialog=null;if(!closed)d.querySelector(`[data-preview-map="${settingsKey}"]`)?.focus();};
    const renderSettings=()=>{
     if(!settingsDialog)return;
     const {profile,column}=locate(settingsKey),[pi,ci]=settingsKey.split(':').map(Number),focused=document.activeElement,attr=['data-person-format','data-person-shared','data-item-type','data-item-key','data-date-mode','data-column-rule','data-issue-number'].find(key=>focused?.hasAttribute(key)),opened=new Set([...settingsDialog.querySelectorAll('details[open]')].map(node=>node.dataset.exampleKey));
     settingsDialog.innerHTML=importColumnSettingsHtml(prepared,mapping,result||rawResult,schemas,draft.importFieldPreferences,{conflictMode},pi,ci)+'<div class="actions"><button type="button" data-settings-close>Klart</button></div>';
     settingsDialog.querySelector('[data-settings-close]').onclick=closeSettings;
     for(const node of settingsDialog.querySelectorAll('details'))node.open=opened.has(node.dataset.exampleKey);
     const rule=settingsDialog.querySelector('[data-column-rule]');if(rule)rule.value=importPreference(draft.importFieldPreferences,...column.target.split('.'),profile.fileName||prepared.fileName,profile,column)||'';
     if(attr)settingsDialog.querySelector('['+attr+']')?.focus();
    };
    const openSettings=key=>{settingsKey=key;settingsDialog=dialog('','import-column-settings-dialog');renderSettings();settingsDialog.addEventListener('change',onChange);settingsDialog.addEventListener('cancel',event=>{event.preventDefault();closeSettings();});};
    const close=()=>{closed=true;closeSettings();evaluator?.cancel?.();d.close();d.remove();};
    const abort=()=>{close();const error=Error('Importen avbröts');error.name='AbortError';reject(error);};
    const locate=key=>{const [pi,ci]=key.split(':').map(Number);return {profile:mapping.profiles[pi],column:mapping.profiles[pi].columns[ci]};};
    const sourceRowOf=node=>node?.closest('[data-import-source-row]')?.dataset.importSourceRow||node?.closest('[data-source-key]')?.dataset.sourceKey||null;
    const viewState=()=>{
      const focused=document.activeElement,focusAttr=['data-approve-link','data-link-property','data-create-record','data-open-row','data-select-creations','data-map-property','data-story-search','data-story-filter','data-approval-search','data-approval-filter','data-property-designation','data-column-rule','data-date-mode','data-preview-map','data-ignore-column','data-person-format','data-person-shared','data-import-conflict-mode','data-import-conflict-choice','data-item-type','data-item-key','data-import-table','data-mapping-row','data-issue-number'].find(attr=>focused?.hasAttribute(attr));
      for(const node of d.querySelectorAll('details'))if(disclosureKey(node))disclosures.set(disclosureKey(node),node.open);
      return {scroll:d.scrollTop,horizontal:[...d.querySelectorAll('.import-source-scroll')].map(node=>node.scrollLeft),open:new Map(disclosures),focusAttr,focusValue:focusAttr?focused.getAttribute(focusAttr):null,focusRow:sourceRowOf(focused),selection:focused?.selectionStart};
    };
    const disclosureKey=node=>{
     for(const attr of ['data-new-records','data-sheet-settings','data-final-impact','data-import-enrichment','data-import-errors','data-import-value-choices'])if(node.hasAttribute(attr))return attr;
     for(const attr of ['data-review-problem'])if(node.hasAttribute(attr))return attr+':'+node.getAttribute(attr);
     return null;
    };
    const render=(state,recalculate=true)=>{
      let error;if(recalculate)try{
       result=resolveImportChoices(rawResult,{mode:conflictMode,choices:conflictChoices},actor);
       if(result.clean){
        const reviewed=reviewImportDraft(result,baseline,edits,plan,creationChoices,actor);
        result=reviewed.edited;plan=reviewed.plan;creationChoices=reviewed.choices;
        projected=approveImportPlan(result,baseline,creationChoices,actor);
        explanation=explainImport(result,baseline,{approved:projected,choices:creationChoices,profiles:mapping.profiles});
       }
      }catch(failure){error=failure;result=null;}
      d.innerHTML=columnPreviewHtml(prepared,mapping,result||rawResult,schemas,draft.importFieldPreferences,{allowPartial,stale,conflicts:importConflictGroups(rawResult),conflictMode,conflictChoices,financialSuggestions:pendingFinancialSuggestions(),story,explanationBase:baseline,projected,explanation,creationChoices,deferred:projected?.report.creationReview?.deferred.length,approvalHtml:result?.clean?importApprovalHtml(plan,creationChoices,baseline,approval):'',edits,pendingCreations:plan.filter(entry=>!creationChoice(entry,creationChoices)).length});d.setAttribute('aria-busy',stale?'true':'false');
      for(const group of d.querySelectorAll('details'))if(state.open.has(disclosureKey(group)))group.open=state.open.get(disclosureKey(group));
      const focus=state.focusAttr?[...d.querySelectorAll(`[${state.focusAttr}]`)].find(node=>node.getAttribute(state.focusAttr)===state.focusValue&&(!state.focusRow||sourceRowOf(node)===state.focusRow)):null;
      focus?.focus({preventScroll:true});
      if(['data-story-search','data-approval-search','data-property-designation'].includes(state.focusAttr)&&state.selection!=null)focus?.setSelectionRange(state.selection,state.selection);
      [...d.querySelectorAll('.import-source-scroll')].forEach((node,index)=>{node.scrollLeft=state.horizontal?.[index]||0;});
      for(const node of d.querySelectorAll('[data-column-rule]')){const {profile,column}=locate(node.dataset.columnRule);node.value=importPreference(draft.importFieldPreferences,...column.target.split('.'),profile.fileName||prepared.fileName,profile,column)||'';}
      d.scrollTop=state.scroll;
      renderSettings();
      if(error){d.querySelector('[data-import-error]').textContent=createBusinessLabels(rawResult?.clean).text(error.message);d.querySelector('[data-apply]').disabled=true;}
    };
    const refresh=async()=>{
      if(closed)return;
      const blockedKey=value=>JSON.stringify([...(value?.report.sourceRows||[]).filter(row=>row.rejected).map(row=>JSON.stringify([row.source,row.sheet,row.row])),...(value?.report.linkProposals||[]).filter(row=>!row.approved).map(row=>row.matchingKey)].sort());
      const previousBlocked=blockedKey(rawResult);
      const state=viewState();const revision=++generation;d.setAttribute('aria-busy','true');d.querySelector('[data-apply]')?.setAttribute('disabled','');
      try{let next=await evaluate();if(closed||revision!==generation)return;
        // Registers from other sheets are now available too. At most one extra
        // evaluation, only when their evidence actually changes a column choice.
        if(next.clean&&suggestIssueNumberColumns(mapping.profiles,next.clean)){next=await evaluate();if(closed||revision!==generation)return;}
        // A run-wide keep/replace choice overrides earlier source rules for
        // this preview only. Retain those rules for later imports.
        if(next.clean)next.clean.workspace.importFieldPreferences=structuredClone(draft.importFieldPreferences);
        if(next.data)next.data.importFieldPreferences=structuredClone(draft.importFieldPreferences);
        if(blockedKey(next)!==previousBlocked)allowPartial=false;
        rawResult=next;stale=false;resultGeneration=revision;render(state);
      }catch(error){if(closed||revision!==generation||error.name==='AbortError')return;fail(error);}
    };
    const invalidate=()=>{
      for(const profile of mapping.profiles)assignAgreementItemKeys(profile);
      // The matching engine validates each relation signature. Unrelated
      // column edits keep valid choices instead of clearing the whole session.
      evaluator?.invalidate?.();stale=true;refresh();
    };
    const update=(profile,column,target)=>{
      column.valueType=schemas.find(s=>s.key===target.split('.')[0])?.fieldSpecs?.[target.split('.')[1]]?.type;retargetColumn(prepared.workbook,profile,column,target,window.XLSX);if(target.startsWith('agreementItems.')&&!column.itemType){const hint=resolveFieldName(column.header,schemas,'contracts');if(hint?.target===target)column.itemType=hint.itemType;}column.collection=target.split('.')[0];
      const allowed=new Set(contactFields(profile).map(field=>field.target));
      for(const other of profile.columns)if(contactPart(other.target)&&!allowed.has(other.target))retargetColumn(prepared.workbook,profile,other,'@unmapped',window.XLSX);
      invalidate();
    };
    const fail=error=>{d.setAttribute('aria-busy','false');result=null;const output=d.querySelector('[data-import-error]');if(output)output.textContent=createBusinessLabels(rawResult?.clean).text(error.message);else d.insertAdjacentHTML('beforeend','<p data-import-error role="alert">'+esc(error.message)+'</p><button type="button" data-cancel>Avbryt</button>');const apply=d.querySelector('[data-apply]');if(apply)apply.disabled=true;};
    d.addEventListener('cancel',event=>{event.preventDefault();abort();});
    const locateColumn=key=>{const row=d.querySelector(`[data-import-column="${key}"]`);if(row){row.scrollIntoView({block:'center'});row.querySelector('[data-preview-map]')?.focus();}};
    d.addEventListener('input',event=>{
     const node=event.target;
     if(node.hasAttribute('data-property-designation')){edits.properties[node.dataset.propertyDesignation]=node.value;return;}
     if(node.hasAttribute('data-story-search')||node.hasAttribute('data-approval-search')){
      const state=viewState(),search=node.hasAttribute('data-story-search')?story:approval;search.query=node.value;search.limit=node.hasAttribute('data-story-search')?30:100;render(state,false);
     }
    });
    d.addEventListener('click',async event=>{
      const button=event.target.closest('button');if(!button)return;

      try{
        if(button.hasAttribute('data-open-row')){const key=button.dataset.openRow;if(story.openRows.has(key))story.openRows.delete(key);else story.openRows.add(key);render(viewState(),false);return;}
        if(button.hasAttribute('data-filter-import-rows')){story.filter=button.dataset.filterImportRows;story.limit=30;render(viewState(),false);d.querySelector('[data-import-table-review]').scrollIntoView({block:'start'});return;}
        if(button.hasAttribute('data-story-more')){story.limit+=30;render(viewState(),false);return;}
        if(button.hasAttribute('data-show-creations')){const section=d.querySelector('[data-new-records]');if(section){section.open=true;section.scrollIntoView({block:'start'});}return;}
        if(button.hasAttribute('data-complete-property')){const input=[...button.closest('.import-row-detail').querySelectorAll('[data-property-designation]')].find(node=>node.dataset.propertyDesignation===button.dataset.completeProperty);input?.focus();return;}
        if(button.hasAttribute('data-select-creations')){
         const matches=matchingCreations(plan,approval);
         for(const entry of matches)if(creationChoice(entry,creationChoices)?.action!=='map'&&(button.dataset.selectCreations==='none'||creationAvailable(entry,plan,creationChoices,baseline)))creationChoices[entry.key]={signature:entry.signature,action:button.dataset.selectCreations==='all'?'create':'defer'};
         render(viewState());return;
        }
        if(button.hasAttribute('data-approval-more')){approval.limit+=100;render(viewState(),false);return;}
        if(button.hasAttribute('data-map-property')){const entry=plan.find(row=>row.key===button.dataset.mapProperty),targetId=await chooseExistingProperty(baseline.properties);if(targetId){creationChoices[entry.key]={signature:entry.signature,action:'map',targetId};render(viewState());}return;}
        if(button.hasAttribute('data-map-clear')){delete creationChoices[button.dataset.mapClear];render(viewState());return;}
        if(button.hasAttribute('data-edit-contact')||button.hasAttribute('data-add-contact')){
         const key=button.dataset.contactRow||button.dataset.addContact,row=explanation.rows.find(row=>row.key===key),original=button.dataset.editContact?result.clean.contacts.find(row=>row.id===button.dataset.editContact):null;
         const selected=await chooseImportContact(result,row,original);if(selected&&(!selected.existing||original)){const id=original?.id||selected.record.id,previous=edits.contacts[id];edits.contacts[id]={record:selected.record,replacementId:selected.existing?selected.record.id:undefined,rowKey:key,originalPersonId:previous?.originalPersonId||original?.person_id,imported:previous?.imported??Boolean(rawResult.clean.contacts.some(row=>row.id===id)),origin:{source:row.source,sheet:row.sheet,row:row.row}};render(viewState());}return;
        }
        if(button.hasAttribute('data-restore-financial')){
          const proposals=pendingFinancialSuggestions().filter(proposal=>button.dataset.restoreFinancial==='all'||proposal.key===button.dataset.restoreFinancial);
          for(const proposal of proposals){const {column}=locate(proposal.key);Object.assign(column,proposal.column,{approved:true,matchSource:'manual'});}
          invalidate();return;
        }
        if(button.hasAttribute('data-locate-import-column')){locateColumn(button.dataset.locateImportColumn);return;}
        if(button.hasAttribute('data-export-import-review')){const blob=new Blob([JSON.stringify(result.data.importReview||[],null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='lokalblick-importgranskning.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);return;}
        if(button.hasAttribute('data-cancel')){abort();return;}
        if(button.hasAttribute('data-approve-link-proposals')){
          if(stale||d.getAttribute('aria-busy')==='true'||resultGeneration!==generation)return;
          draft.importRowMatches ||= {};
          const rows=matchingImportRows(prepared,mapping.profiles,result,explanation.rows,story),keys=new Set(rows.map(row=>row.key));
          for(const proposal of rawResult.report.linkProposals||[])if(keys.has(proposal.matchingKey)&&!proposal.approved&&proposal.matches.length===1&&!proposal.requiresSelection&&!proposal.matches[0].disabled)draft.importRowMatches[proposal.matchingKey]={propertyId:proposal.matches[0].id,signature:proposal.signature};
          refresh();return;
        }
        if(button.hasAttribute('data-export-mapping')){const book=mappingTemplate(prepared.workbook,mapping.profiles,schemas,window.XLSX);window.XLSX.writeFile(book,'Lokalblick-importmall.xlsx');return;}
        if(button.hasAttribute('data-preview-map')){const key=button.dataset.previewMap,{profile,column}=locate(key),target=await chooseField([...fields,...contactFields(profile)],column.target,profile,schemas,column);if(closed)return;if(target==='@settings'){openSettings(key);return;}if(target)update(profile,column,target);d.querySelector(`[data-preview-map="${key}"]`)?.focus();}
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
          if(plan.length&&!plan.some(entry=>creationChoice(entry,creationChoices))){const section=d.querySelector('[data-new-records]');section.open=true;section.scrollIntoView({block:'start'});d.querySelector('[data-import-error]').textContent='Välj vilka nya poster som ska läggas till, eller välj bort alla i listan.';return;}
          // Include the current input even when Save is clicked without blur.
          render(viewState());if(!result)throw Error('Rätta uppgifterna före sparning.');
          if(result.clean)result=approveImportPlan(result,baseline,creationChoices,actor);
          if(result.report.blocking)result.report.partial=true;
          result.report.actor=actor;close();resolve(result);
        }
      }catch(error){fail(error);}
    });
    const onChange=event=>{

      if(event.target.hasAttribute('data-property-designation')){render(viewState());return;}
      if(event.target.hasAttribute('data-create-record')){const entry=plan.find(row=>row.key===event.target.dataset.createRecord);creationChoices[entry.key]={signature:entry.signature,action:event.target.checked?'create':'defer'};render(viewState());return;}
      if(event.target.hasAttribute('data-approval-filter')){approval.filter=event.target.value;approval.limit=100;render(viewState(),false);return;}
      if(event.target.hasAttribute('data-story-filter')){story.filter=event.target.value;story.limit=30;render(viewState(),false);return;}
      if(event.target.hasAttribute('data-link-property')){
        if(stale||d.getAttribute('aria-busy')==='true'||resultGeneration!==generation)return;
        const index=Number(event.target.dataset.linkProperty),proposal=rawResult.report.linkProposals[index];
        draft.importRowMatches ||= {};
        if(event.target.value)draft.importRowMatches[proposal.matchingKey]={propertyId:event.target.value,signature:proposal.signature};
        else delete draft.importRowMatches[proposal.matchingKey];
        refresh();
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
        const state=viewState();
        if(event.target.hasAttribute('data-import-conflict-mode')){conflictMode=event.target.value;refresh();return;}
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
    };
    d.addEventListener('change',onChange);
    // Allow the initial status to paint before the synchronous local conversion.
    setTimeout(()=>{if(closed)return;try{refresh();}catch(error){close();reject(error);}},0);
  });
}
