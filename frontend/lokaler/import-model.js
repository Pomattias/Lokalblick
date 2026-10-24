import {createImportRow} from './import-row-transaction.js';
import {importSchemas} from './import-schema.js';
export {importSchemas} from './import-schema.js';
import {agreementNumberParts,generatedPropertyId,hashImportIdentity as hash} from './import-identities.js';
import {managementPropertyNumber,createBusinessLabels,isInternalIdentifier} from './business-identities.js';
import {completeCleanImport} from './import-result.js';
import {propertyAliases,resolvePropertyId,propertyIdInBudget} from './property-identity.js';
import {nextIssueId} from './issue-identity.js';
import {issueImportPlan,issueHomeMatcher,importAddressKey} from './issue-import.js';
import {importPreference} from '../services/import-preferences.js';
import {legacyFinanceMap,validateFinance} from './finance-model.js';
import {maintenanceTables} from './maintenance-model.js';
import {financialId,legacyAgreementItems} from './finance-revision.js';
import {tables,emptyData,normalize,partyNumberFields,normalizeOrganizationNumber} from './model.js';
import {viewFields,viewCollections} from './view-fields.js';
import {interpretCell} from '../services/import-formats.js';
import {assignAgreementItemKeys} from '../services/import-matching.js';
import {personRole,contactPart,contactFields,personFormat,parsePersonIdentity} from '../services/import-person-links.js';
const clone=value=>structuredClone(value),present=value=>value!==null&&value!==undefined&&value!=='';
const text=value=>String(value??'').trim(),key=value=>text(value).replace(/\s+/g,' ').toLocaleLowerCase('sv');
// Matching evidence belongs to audit history. Source-row identity stays stable
// when the same file later reuses an already saved agreement link.
const financialSource=origin=>{const {matchingDecision,...source}=origin;return source;};
const validLink=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!!url.hostname&&!/\s/.test(value);}catch{return false;}};
const fieldMap=Object.fromEntries(Object.entries(viewCollections).flatMap(([table,collection])=>tables[table].fields.map(({key:field})=>[collection+'.'+(viewFields[table][field]||field),{table,field}])));
for(const table of Object.keys(viewCollections)){fieldMap[viewCollections[table]+'.id']={table,field:'id'};}
for(const [table,linked]of Object.entries(partyNumberFields))fieldMap[viewCollections[table]+'.'+linked.key]={table:'parties',field:'organization_number',partyRole:linked.role};
fieldMap['properties.sourceId']={table:'properties',field:'id'};fieldMap['objects.number']={table:'objects',field:'id'};fieldMap['people.sourceId']={table:'people',field:'id'};
// Older saved mappings may name the same input number; it resolves to the sole AvtalsID.
fieldMap['contracts.number']={table:'agreements',field:'id'};
fieldMap['contracts.propertyId']={table:'properties',field:'id'};
fieldMap['contracts.tenantName']={table:'agreements',field:'tenant_party_id'};
for(const [field,target]of Object.entries(legacyFinanceMap))fieldMap['contracts.'+target]={table:'agreements',field,finance:true};
const targetField={property:'property_id',contract:'agreement_id',activity:'issue_id',order:'order_id'};
const roles={our:'coordinator',owner:'owner',tenant:'tenant'};
// Optional descriptive values can be completed later. Identity, relationships,
// financial terms and inspection outcomes must still validate together.
const canHoldField=(table,field)=>{
 const spec=tables[table]?.fields.find(item=>item.key===field);
 return !['agreement_items','recurring_costs','cost_evidence',...Object.keys(maintenanceTables)].includes(table)&&
  !['maintenance_completed_on','maintenance_result','rent_surcharge_start'].includes(field)&&
  spec&&!spec.required&&['date','number','integer','coordinate','url','text','textarea','email','tel','select'].includes(spec.type);
};
/**
 * Prepare an import for review; the caller decides whether to persist it.
 * workbook is a parsed SheetJS workbook; profiles contain approved sheet/column
 * mappings. base and profiles are cloned, so this does not alter the open data.
 * context carries source identity, actor, preferences and explicit matching choices.
 * XLSX is the caller's SheetJS API (also supplied in the import worker).
 * Returns {clean, data, report}: canonical storage, a derived V2 view, and review
 * results. Row errors become review entries; invalid final data throws.
 */
export function prepareCleanImport(workbook,profiles,base=emptyData(),context={},XLSX){
 profiles=clone(profiles);
 for(const profile of profiles)assignAgreementItemKeys(profile);
 const data=clone(base),changes=[],decisions=[],reviews=[],linkProposals=[],reusedLinks=new Map(),sourceRows=[];
 // Session-local IDs keep editable person/link suggestions stable while the
 // user changes other columns. The cache is never part of stored business data.
 const newId=(prefix,identity)=>context.identityCache?(context.identityCache[JSON.stringify([prefix,identity])] ||= prefix+'-'+crypto.randomUUID()):prefix+'-'+crypto.randomUUID();
 const touched=Object.fromEntries(Object.keys(tables).map(table=>[table,new Set()]));
 let rejectedRows=0;
 const traceRow=row=>{if(sourceRows.length>=20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');sourceRows.push(row);};
 const columnStats=new Map(profiles.map(profile=>{
  const labels=new Map([...importSchemas.flatMap(schema=>schema.columns.map(([field,label])=>({target:schema.key+'.'+field,label:schema.sheet+' → '+label}))),...contactFields(profile)].map(field=>[field.target,field.label]));
  return [profile,new Map(profile.columns.map(column=>[column.index,{source:profile.fileName||context.fileName||'Excel',sheet:profile.name,index:column.index,header:column.header,target:column.target,label:labels.get(column.target)||column.target,...(column.itemType?{itemType:column.itemType,itemLabel:tables.agreement_items.fields.find(field=>field.key==='type').values[column.itemType]}:{}),read:0,skipped:0,review:0}]))];
 }));
 data.workspace ||= {};if(context.preferences)data.workspace.importFieldPreferences=clone(context.preferences);const prior=clone(data),priorAgreementIds=new Set(prior.agreements.map(row=>row.id)),priorPropertyIds=new Set(prior.properties.map(row=>row.id)),priorObjects=new Map(prior.objects.map(row=>[row.id,row]));const aliases=propertyAliases(data.workspace.auditLog),numberChoices=new Map(),identitySelections=new Map();
 const contactChoices=new Map();
 const priorLabels=createBusinessLabels(prior),objectNumbers=new Map();
 for(const row of prior.objects)if(isInternalIdentifier(row.id)){
  const number=priorLabels.number('objects',row.id);
  if(!agreementNumberParts(number+'-1')?.objectId)continue;
  if(!objectNumbers.has(number))objectNumbers.set(number,[]);objectNumbers.get(number).push(row.id);
 }
 for(const entry of prior.workspace.auditLog||[])for(const field of entry.fields||[]){const decision=field.provenance?.contactDecision;if(decision?.key&&decision.recordId)contactChoices.set(decision.key,decision.recordId);}
 for(const entry of prior.workspace.auditLog||[])for(const field of entry.fields||[]){const d=field.provenance?.matchingDecision;if(d?.method==='agreement-number-property-choice')numberChoices.set(JSON.stringify([d.agreementId,d.numberPropertyId]),d.propertyId);}
 let rowCount=0;
 let indexes,partyNames,partyNumbers,propertyIdentities,propertyAddresses,propertyManagementNumbers,emails,personNames,matchIssueHome,homeIndexSize;
 const rebuild=()=>{
  matchIssueHome=null;
  indexes=Object.fromEntries(Object.keys(tables).map(table=>[table,new Map(data[table].map(row=>[row.id,row]))]));
  partyNames=new Map(data.parties.map(row=>[key(row.name),row]));
  partyNumbers=new Map(data.parties.filter(row=>row.organization_number).map(row=>[normalizeOrganizationNumber(row.organization_number),row]));
  propertyIdentities=new Map();for(const row of data.properties){if(!propertyIdentities.has(key(row.name)))propertyIdentities.set(key(row.name),[]);propertyIdentities.get(key(row.name)).push(row);}
  propertyAddresses=new Map();for(const row of data.properties)if(row.address){const address=importAddressKey(row.address);if(!propertyAddresses.has(address))propertyAddresses.set(address,[]);propertyAddresses.get(address).push(row);}
  propertyManagementNumbers=new Map();for(const row of data.properties)if(present(row.management_object_number)){const number=key(row.management_object_number);if(!propertyManagementNumbers.has(number))propertyManagementNumbers.set(number,[]);propertyManagementNumbers.get(number).push(row);}
  emails=new Map(data.people.filter(row=>row.email).map(row=>[key(row.email),row]));
  personNames=new Map();for(const person of data.people){const k=key(person.name);if(!personNames.has(k))personNames.set(k,[]);personNames.get(k).push(person);}
 };rebuild();
 const issuePlans=issueImportPlan(workbook,profiles,data.issues,context,XLSX);
 const rank=profile=>{
  const mappings=profile.columns.map(column=>fieldMap[column.target]);
  // Property/object columns on a case sheet are lookup clues. Process their
  // actual registers first, independent of worksheet order and header aliases.
  if(mappings.some(mapping=>mapping?.table==='issues')&&!mappings.some(mapping=>mapping?.table==='agreements'))return 5;
  if(mappings.some(mapping=>mapping?.table==='agreements')&&!mappings.some(mapping=>mapping?.table==='properties'&&['id','management_object_number'].includes(mapping.field)))return 4;
  return Math.min(...profile.columns.map(c=>{const m=fieldMap[c.target];return m&&viewCollections[m.table]===c.target.split('.')[0]?['parties','properties','people','objects','agreements','issues','orders','agreement_items','recurring_costs','cost_evidence',...Object.keys(maintenanceTables)].indexOf(m.table):99;}));
 };
 const propertyProvider=profile=>profile.columns.some(c=>fieldMap[c.target]?.table==='properties'&&['id','management_object_number'].includes(fieldMap[c.target]?.field))?0:1;
 const priority=profile=>profile.columns.filter(column=>importPreference(data.workspace.importFieldPreferences,...column.target.split('.'),profile.fileName||context.fileName,profile,column)==='accept').length;
 for(const profile of [...profiles].sort((a,b)=>rank(a)-rank(b)||propertyProvider(a)-propertyProvider(b)||priority(b)-priority(a)||JSON.stringify([a.fileName||context.fileName,a.name]).localeCompare(JSON.stringify([b.fileName||context.fileName,b.name]),'sv'))){
  const sheet=workbook.Sheets[profile.sheetKey||profile.name];if(!sheet?.['!ref'])continue;
  const range=XLSX.utils.decode_range(sheet['!ref']);
  for(let r=profile.dataStartRow??profile.headerRow;r<=range.e.r;r++){
   const selected=profile.columns.filter(column=>!column.target.startsWith('@'));
   if(!selected.some(column=>present(sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v))){
    if(profile.columns.some(column=>present(sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v)))traceRow({source:profile.fileName||context.fileName||'Excel',sheet:profile.name,row:r+1,records:{},read:[],held:[],ignored:true});
    continue;
   }
   if(++rowCount>20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');
   const transaction=createImportRow({data,tableNames:Object.keys(tables),changes,reviews,decisions,selected,fieldMap});
   const {undo,touched:rowTouched,read:readColumns,held:heldColumns,startReviews,touch}=transaction;
   let rejected=false,reusedLink=null,recordStage='properties',deferredError=null;
   const source=profile.fileName||context.fileName||'Excel',origin={source,sheet:profile.name,row:r+1};
   const raw={},itemRows=new Map(),contacts=new Map(),linkedNumbers=new Map(),sourceValues=selected.map(column=>{const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];return {column:column.header,index:column.index,target:column.target,raw:cell?.v??'',hyperlink:cell?.l?.Target};});let fieldInProgress='',columnInProgress=null,partyNumberColumn=null;const finance={};
   let itemInProgress=null;const contactKeys={};
   const columnFor=(table,field)=>table==='parties'&&field==='organization_number'&&partyNumberColumn||selected.find(c=>fieldMap[c.target]?.table===table&&fieldMap[c.target]?.field===field&&!fieldMap[c.target]?.partyRole&&(table!=='agreement_items'||!itemInProgress||!c.itemType||(c.itemKey||c.itemType)===itemInProgress));
   const originFor=(table,field)=>{const column=columnFor(table,field);return {column:column?.header,columnIndex:column?.index,collection:viewCollections[table]||table,field:viewFields[table]?.[field]||field};};
   const holdField=(table,field,error,existing)=>{
    const column=columnFor(table,field);if(!column||!canHoldField(table,field)||fieldMap[column.target]?.finance)return false;
    if(heldColumns.has(column.index))return false;
    const at=originFor(table,field),value=sourceValues.find(input=>input.index===column.index)?.raw;
    reviews.push({id:'CLEAN-FIELD-'+hash(JSON.stringify([source,profile.name,r+1,column.index])),kind:'canonical-conflict',status:'pending',...origin,...at,recordId:existing?.id,current:existing?.[field],value,reason:error.message,fieldRejected:true,blocking:false,rowRejected:false,sourceValues:sourceValues.filter(input=>input.index===column.index)});
    decisions.push({...origin,collection:at.collection,classification:'B',reason:error.message});
    heldColumns.add(column.index);readColumns.delete(column.index);return true;
   };
   const checkpoint=()=>transaction.checkpoint(linkedNumbers);
   const correctPropertyId=(record,id)=>{
    const previous=record.id;if(previous===id)return record;
    if(indexes.properties.has(id))throw Error('FastighetsID finns redan. Välj den befintliga fastigheten.');
    if(propertyIdInBudget(data.workspace.budgetPlans,previous))throw Error('FastighetsID används i Budget. Behåll sparat ID för att bevara budgetkopplingarna.');
    normalize('properties',{...record,id});
    const set=(row,field,value)=>{const before=row[field];undo.push(()=>{row[field]=before;});row[field]=value;};
    set(record,'id',id);
    if(record.name===previous){set(record,'name',id);changes.push({collection:'properties',recordId:id,field:'designation',from:previous,to:id,provenance:origin});}
    const oldAlias=aliases.get(previous);undo.push(()=>oldAlias===undefined?aliases.delete(previous):aliases.set(previous,oldAlias));aliases.set(previous,id);
    changes.push({collection:'properties',recordId:id,field:'id',from:previous,to:id,provenance:origin});touch('properties',id);
    for(const [table,spec]of Object.entries(tables))for(const field of spec.fields.filter(f=>f.type==='ref'&&f.table==='properties'))for(const row of data[table])if(row[field.key]===previous){
     set(row,field.key,id);touch(table,row.id);changes.push({collection:viewCollections[table],recordId:row.id,field:viewFields[table]?.[field.key]||field.key,from:previous,to:id,provenance:origin});
    }
    for(const review of [...(data.workspace.importReview||[]),...reviews])if(review.collection==='properties'&&review.recordId===previous)set(review,'recordId',id);
    for(const doc of data.workspace.documents||[]){if(doc.propertyId===previous)set(doc,'propertyId',id);if(doc.targetType==='property'&&doc.targetId===previous)set(doc,'targetId',id);}
    for(const [table,row]of Object.entries(raw))for(const field of tables[table]?.fields||[])if(field.type==='ref'&&field.table==='properties'&&row[field.key]===previous)row[field.key]=id;
    rebuild();return record;
   };
   const merge=(table,record,existing)=>{
    const previous=existing?{...existing}:null;
    const values={...existing,...Object.fromEntries(Object.entries(record).filter(([,value])=>present(value)))};
    let normalized;
    while(!normalized)try{normalized=normalize(table,values);}catch(error){
     const period=error.message==='Ogiltiga koordinater.'?['latitude','longitude']:error.message.startsWith('Slutdatum')?['valid_from','valid_to']:error.message.startsWith('Tidplanens')?['planned_from','planned_to']:null;
     const field=error.message.startsWith('ID ')?'id':tables[table].fields.find(f=>error.message.startsWith(f.label)||error.message.startsWith('Ogiltigt värde för '+f.label))?.key;
     const fields=(period||[field]).filter(key=>columnFor(table,key)&&present(record[key]));
     if(fields.length&&fields.every(key=>canHoldField(table,key)&&!heldColumns.has(columnFor(table,key).index))){
      for(const key of fields){holdField(table,key,error,existing);delete record[key];values[key]=existing?.[key]??null;}
      continue;
     }
     const at=originFor(table,period?fields[0]||period[1]:field);Object.assign(error,{...at,value:field?record[field]:null});throw error;
    }
    if(table!=='issues'&&normalized.sources&&existing?.sources)normalized.sources=[...new Map([...existing.sources,...normalized.sources].map(source=>[JSON.stringify(source),source])).values()];
    if(existing)for(const field of Object.keys(record)){const value=normalized[field];if(field!=='id'&&field!=='sources'&&present(record[field])&&present(existing[field])&&JSON.stringify(existing[field])!==JSON.stringify(value)){
     const legacy=viewFields[table]?.[field]||field,collection=viewCollections[table]||table;
     const selectedTarget=columnFor(table,field)?.target.split('.')[1]||legacy;
     const inputColumn=columnFor(table,field);
     const rule=importPreference(data.workspace.importFieldPreferences,fieldMap[inputColumn?.target]?.partyRole?inputColumn.target.split('.')[0]:collection,selectedTarget,source,profile,inputColumn);
     if(field==='management_object_number')throw Object.assign(Error('Förvaltningsobjekt skiljer sig från den sparade fastigheten. Kontrollera kopplingen.'),{collection,field:legacy,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value});
     if(tables[table].fields.find(f=>f.key===field)?.type==='ref'){const error=Error('Olika värden för '+(tables[table].fields.find(f=>f.key===field)?.label||field)+'. Importen får inte flytta en befintlig koppling.');Object.assign(error,{collection,field:legacy,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value});throw error;}
     if(table==='properties'&&field==='address'&&importAddressKey(value)===importAddressKey(existing[field])){normalized[field]=existing[field];continue;}
     if(typeof value==='string'&&typeof existing[field]==='string'&&['properties','parties','people'].includes(table)&&['name','address','city','popular_name'].includes(field)&&key(value.normalize('NFKC'))===key(existing[field].normalize('NFKC'))){normalized[field]=existing[field];continue;}
     if(rule==='reject'){normalized[field]=existing[field];continue;}
     if(field==='name'&&existing.name===existing.id)continue;
     if(table==='properties'&&field==='name'&&existing.address&&importAddressKey(existing.name)===importAddressKey(existing.address)&&importAddressKey(value)!==importAddressKey(existing.address)&&(!priorPropertyIds.has(existing.id)||(raw.properties?.id===existing.id||present(raw.properties?.management_object_number)&&(text(raw.properties.management_object_number)===existing.id||key(raw.properties.management_object_number)===key(existing.management_object_number)))&&raw.properties?.address&&importAddressKey(raw.properties.address)===importAddressKey(existing.address)))continue;
     if(rule!=='accept'){
      const reason='Olika värden för '+tables[table].fields.find(f=>f.key===field).label;
      const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,collection,existing.id,field,value])),kind:'canonical-conflict',status:'pending',...origin,collection,field:legacy,recordId:existing.id,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value,reason,blocking:false,rowRejected:false};
      reviews.push(review);decisions.push({...origin,collection,classification:'B',reason});normalized[field]=existing[field];continue;
     }
    }
    }
    if(table==='agreements'&&data.agreements.some(row=>row.id!==normalized.id&&row.object_id===normalized.object_id&&(!row.valid_to||!normalized.valid_from||row.valid_to>=normalized.valid_from)&&(!normalized.valid_to||!row.valid_from||normalized.valid_to>=row.valid_from)))throw Error('Objektet har redan ett avtal under perioden.');
    if(table==='parties'&&data.parties.some(p=>p.id!==normalized.id&&key(p.name)===key(normalized.name)))throw Error('PartID och partens namn pekar på olika parter.');
    const fits=(agreement,object)=>(!object.valid_from||agreement.valid_from&&agreement.valid_from>=object.valid_from)&&(!object.valid_to||agreement.valid_to&&agreement.valid_to<=object.valid_to);
    if(table==='agreements'&&indexes.objects.has(normalized.object_id)&&!fits(normalized,indexes.objects.get(normalized.object_id)))throw Object.assign(Error('Avtalets period måste rymmas inom objektets giltighetstid.'),originFor(table,'valid_to'));
    if(table==='objects'&&data.agreements.some(a=>a.object_id===normalized.id&&!fits(a,normalized)))throw Object.assign(Error('Objektets period skulle lämna ett befintligt avtal utan giltigt objekt.'),originFor(table,'valid_to'));
    if(table==='people'&&normalized.email&&data.people.some(p=>p.id!==normalized.id&&key(p.email)===key(normalized.email)))throw Error('E-post och PersonID pekar på olika personer.');
    if(table==='parties'&&normalized.organization_number&&data.parties.some(p=>p.id!==normalized.id&&normalizeOrganizationNumber(p.organization_number)===normalized.organization_number))throw Object.assign(Error('Organisationsnumret tillhör redan en annan part. Kontrollera namn och koppling.'),originFor(table,'organization_number'));
    for(const f of tables[table].fields)if(f.type==='ref'&&normalized[f.key]&&!indexes[f.table].has(normalized[f.key]))throw Object.assign(Error(f.label+' hänvisar till ett ID som saknas.'),originFor(table,f.key));
    if(existing){const before=clone(existing);undo.push(()=>{for(const k of Object.keys(existing))delete existing[k];Object.assign(existing,before);});Object.assign(existing,normalized);}
    else{data[table].push(normalized);indexes[table].set(normalized.id,normalized);existing=normalized;}
    if(table==='properties'){
     if(previous?.name)propertyIdentities.set(key(previous.name),(propertyIdentities.get(key(previous.name))||[]).filter(row=>row.id!==existing.id));
     if(!propertyIdentities.has(key(existing.name)))propertyIdentities.set(key(existing.name),[]);propertyIdentities.get(key(existing.name)).push(existing);
     if(previous?.address){const address=importAddressKey(previous.address);propertyAddresses.set(address,(propertyAddresses.get(address)||[]).filter(row=>row.id!==existing.id));}
     if(existing.address){const address=importAddressKey(existing.address);if(!propertyAddresses.has(address))propertyAddresses.set(address,[]);propertyAddresses.get(address).push(existing);}
     matchIssueHome=null;
    }
    for(const [field] of Object.entries(record))if(field!=='id'&&JSON.stringify(previous?.[field])!==JSON.stringify(existing[field]))changes.push({collection:viewCollections[table]||table,recordId:existing.id,field:viewFields[table]?.[field]||field,from:previous?.[field]??null,to:existing[field],provenance:itemInProgress?{...origin,...originFor(table,field)}:origin});
    touch(table,existing.id);
    return existing;
   };
   const party=(value,kind)=>{
    const linked=linkedNumbers.get(kind);partyNumberColumn=linked?.column||null;
    let number;try{number=normalizeOrganizationNumber(linked?.value);}catch(error){if(!holdField('parties','organization_number',error))throw Object.assign(error,originFor('parties','organization_number'),{value:linked?.value});}
    const byName=indexes.parties.get(text(value))||partyNames.get(key(value)),byNumber=number&&partyNumbers.get(number);
    if(byName&&byNumber&&byName.id!==byNumber.id)throw Error('Namn och organisationsnummer pekar på olika parter. Kontrollera kopplingen.');
    const existing=byName||byNumber;
    if(!present(value)&&!linked)return null;
    if(!existing&&!present(value)){
     if(!number||holdField('parties','organization_number',Error('Ange fastighetsägarens eller hyresgästens namn för det nya organisationsnumret.'))){linkedNumbers.delete(kind);partyNumberColumn=null;return null;}
     throw Error('Ange fastighetsägarens eller hyresgästens namn för det nya organisationsnumret.');
    }
    if(existing&&!number){touch('parties',existing.id);linkedNumbers.delete(kind);partyNumberColumn=null;return existing.id;}
    const row=merge('parties',{id:existing?.id||newId('PAR',[source,key(value),number]),name:existing?.name||text(value),kind:existing?.kind||kind,organization_number:number||existing?.organization_number},existing);
    partyNames.set(key(row.name),row);if(row.organization_number)partyNumbers.set(row.organization_number,row);linkedNumbers.delete(kind);partyNumberColumn=null;return row.id;
   };
   try{
    for(const column of selected){
     fieldInProgress=column.target;columnInProgress=column;
     const role=personRole(column.target),part=contactPart(column.target),mapping=fieldMap[column.target];
     try{
     const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];if(cell?.f&&!present(cell?.v))throw Error('Formeln saknar beräknat värde.');if(!present(cell?.v)&&!cell?.l?.Target)continue;
     let value;
     if(role||part&&['email','phone','sourceId'].includes(part.field))value=text(interpretCell(cell,{...column,target:'people.'+(part?.field||'name')},XLSX));
     else if(part)value=interpretCell(cell,{...column,target:'assignments.'+part.field,emptyMarkers:true},XLSX);
     else if(mapping){
      const spec=mapping.finance?{type:/method|basis/.test(mapping.field)?'text':'number'}:tables[mapping.table].fields.find(f=>f.key===mapping.field);
      const target=column.target;
      value=interpretCell(cell,{...column,target,valueType:spec?.type,emptyMarkers:true},XLSX);
     }else continue;
     const spec=mapping&&tables[mapping.table].fields.find(f=>f.key===mapping.field);
     if(spec?.values&&present(value))value=Object.entries(spec.values).find(([id,label])=>key(id)===key(value)||key(label)===key(value))?.[0]||value;
     if(spec?.type==='url'&&present(value)&&!validLink(value)){
      throw Error(spec.label+' måste vara en fullständig länk som börjar med https:// eller http://.');
     }
     if(mapping?.field==='index_share'&&value>1&&value<=100)value/=100;
     if(!present(value))continue;
     if(column.itemAmbiguous)throw Error('Välj vilken avtalspost kolumnen '+column.header+' gäller.');
     readColumns.add(column.index);
     if(mapping&&tables[mapping.table].fields.find(f=>f.key===mapping.field)?.type==='text'&&typeof value!=='string')value=String(value);
     if(mapping?.partyRole)linkedNumbers.set(mapping.partyRole,{value,column});
     else if(role){if(!contacts.has(column.index))contacts.set(column.index,{column,values:{}});contacts.get(column.index).values.name=value;}
     else if(part){if(!contacts.has(part.index))contacts.set(part.index,{column:profile.columns.find(c=>c.index===part.index),values:{}});contacts.get(part.index).values[part.field]=value;}
     else if(mapping.finance){finance[mapping.field]=value;raw.agreements ||= {};}
     else if(mapping.table==='agreement_items'&&column.itemType){const slot=column.itemKey||column.itemType;if(!itemRows.has(slot))itemRows.set(slot,{type:column.itemType});const item=itemRows.get(slot);if(present(item[mapping.field])&&item[mapping.field]!==value)throw Error('Två kolumner ger olika värden för samma avtalspost. Välj separata poster.');item[mapping.field]=value;}
     else{raw[mapping.table] ||= {};if(present(raw[mapping.table][mapping.field])&&raw[mapping.table][mapping.field]!==value)throw Object.assign(Error('Två kolumner ger olika identifierare eller värden.'),{blocking:true});raw[mapping.table][mapping.field]=value;}
     }catch(error){
      if(!error.blocking&&!role&&!part&&mapping&&!mapping.finance&&!mapping.partyRole&&holdField(mapping.table,mapping.field,error)){
       raw[mapping.table] ||= {};continue;
      }
      if(mapping?.finance&&!error.blocking){deferredError ||= Object.assign(error,{collection:column.target.split('.')[0],field:column.target.split('.')[1],column:column.header,columnIndex:column.index,value:sourceValues.find(value=>value.index===column.index)?.raw});raw.agreements ||= {};continue;}
      if(!role&&!part)throw Object.assign(error,{collection:column.target.split('.')[0],field:column.target.split('.')[1],column:column.header,columnIndex:column.index,value:sourceValues.find(value=>value.index===column.index)?.raw});
      const index=role?column.index:part.index;if(!contacts.has(index))contacts.set(index,{column:profile.columns.find(c=>c.index===index),values:{}});
      const contact=contacts.get(index);contact.errors ||= [];contact.errors.push(column.header+': '+error.message);
     }
    }
    // Parsing errors have a column. Record/relationship errors must never point
    // at whichever column happened to be read last.
    fieldInProgress='';columnInProgress=null;
    let property=null,object=null,agreement=null,issue=null,order=null;
    const issueContext=raw.issues&&!raw.agreements;
    const issuePlan=issuePlans.get(profile)?.get(r);
    if(raw.issues&&issuePlan?.error)throw Object.assign(Error(issuePlan.error),{collection:'activities',field:'id'});
    if(raw.parties){const p=raw.parties;let number;try{number=normalizeOrganizationNumber(p.organization_number);}catch(error){if(!holdField('parties','organization_number',error))throw error;delete p.organization_number;}const byName=p.id?indexes.parties.get(text(p.id)):partyNames.get(key(p.name)),byNumber=number&&partyNumbers.get(number);if(byName&&byNumber&&byName.id!==byNumber.id||p.id&&byNumber&&p.id!==byNumber.id)throw Error('PartID, namn och organisationsnummer pekar på olika parter.');const existing=byName||byNumber;const saved=merge('parties',{...p,id:existing?.id||text(p.id)||newId('PAR',[source,key(p.name),p.organization_number])},existing);partyNames.set(key(saved.name),saved);if(saved.organization_number)partyNumbers.set(saved.organization_number,saved);}
    // A source-row choice approves these exact inputs and candidates, never an
    // address as a permanent foreign key. Re-evaluation still starts from base.
    const approveProperty=(candidates,evidence,inferred=null)=>{
     const matchingKey=JSON.stringify([source,profile.name,r+1]);
     const matches=candidates.map(row=>({id:row.id,label:row.name,number:managementPropertyNumber(row.management_object_number)||(!isInternalIdentifier(row.id)?row.id:null),detail:[row.identityDetail,row.management_object_number?'Förvaltningsobjekt '+row.management_object_number:null,inferred&&!inferred.identityChoice&&!priorPropertyIds.has(row.id)?'Ny fastighet':null,row.address,row.city].filter(Boolean).join(' · '),...(row.disabled?{disabled:true}: {})}));
     const matchingInputs=sourceValues.filter(value=>{
      const mapping=fieldMap[value.target];
      return mapping&&(mapping.table==='properties'||mapping.field==='id'&&['objects','agreements','issues'].includes(mapping.table)||['property_id','object_id','agreement_id'].includes(mapping.field));
     });
     const signature=JSON.stringify([matchingInputs.map(value=>[value.target,value.raw]),matches,...(inferred?[inferred]:[])]);
     const choice=context.rowMatches?.[matchingKey];
     const approved=choice?.signature===signature&&matches.some(row=>row.id===choice.propertyId&&!row.disabled);
     linkProposals.push({matchingKey,signature,matches,evidence,source,sheet:profile.name,row:r+1,approved:Boolean(approved),propertyId:approved?choice.propertyId:null,
      ...(inferred?{inferredIds:inferred}:{}),...(inferred?.identityChoice?{requiresSelection:true}:{}),records:[inferred?.objectId||raw.objects?.id||raw.agreements?.object_id?{label:'Objekt',value:text(inferred?.objectId||raw.objects?.id||raw.agreements?.object_id)}:null,raw.agreements?.id?{label:'Avtal',value:text(raw.agreements.id)}:null,raw.issues?{label:'Ärende',value:text(raw.issues.title||raw.issues.id)}:null].filter(Boolean)});
     if(!approved)throw Object.assign(Error('Godkänn föreslagen fastighetskoppling i listan före import.'),{collection:'properties',field:'id',matchingKey,matches,linkProposal:true});
     return candidates.find(row=>row.id===choice.propertyId);
    };
    for(const [table,row]of Object.entries(raw))for(const field of tables[table]?.fields||[])if(field.type==='ref'&&field.table==='properties'&&row[field.key])row[field.key]=resolvePropertyId(aliases,text(row[field.key]));
    if(raw.properties?.id)raw.properties.id=resolvePropertyId(aliases,text(raw.properties.id));
    const anchorAgreement=raw.agreements?.id&&indexes.agreements.get(text(raw.agreements.id));
    const agreementParts=agreementNumberParts(raw.agreements?.id);
    // An earlier internal object key can still represent this source number.
    // Reuse its saved home; never merge ambiguous objects or move agreements.
    for(const [table,field]of [['objects','id'],['agreements','object_id'],['issues','object_id']])if(raw[table]?.[field]&&!indexes.objects.has(text(raw[table][field]))){
     const matches=objectNumbers.get(text(raw[table][field]))||[];
     if(matches.length>1&&!matches.includes(anchorAgreement?.object_id))throw Error('Flera sparade objekt har samma objektnummer. Ange avtalsnummer för att välja rätt koppling.');
     if(matches.length)raw[table][field]=matches.includes(anchorAgreement?.object_id)?anchorAgreement.object_id:matches[0];
    }
    if(!issueContext&&!anchorAgreement&&!raw.objects?.id&&!raw.agreements?.object_id&&agreementParts?.objectId){
     const matches=objectNumbers.get(agreementParts.objectId)||[];
     if(matches.length>1)throw Error('Flera sparade objekt har samma objektnummer. Kontrollera kopplingarna innan ett nytt avtal läses in.');
     if(matches.length){raw.objects ||= {};raw.objects.id=matches[0];}
    }
    const anchorObject=indexes.objects.get(text(raw.objects?.id||raw.agreements?.object_id||raw.issues?.object_id||anchorAgreement?.object_id));
    const anchorProperty=anchorObject&&indexes.properties.get(anchorObject.property_id);
    // Exact saved agreement/object links outrank guesses from number layouts.
    // Saved identities stay fixed. New properties use the source business number.
    if(raw.objects?.id&&raw.agreements?.object_id&&text(raw.objects.id)!==text(raw.agreements.object_id))throw Error('ObjektID och avtalets objektkoppling pekar på olika objekt.');
    if(anchorAgreement&&(raw.objects?.id||raw.agreements?.object_id)&&text(raw.objects?.id||raw.agreements?.object_id)!==anchorAgreement.object_id)throw Error('ObjektID och det befintliga avtalet pekar på olika objekt. Importen får inte flytta en befintlig koppling.');
    const numberParts=!issueContext&&!anchorAgreement&&!anchorObject&&!raw.properties?.management_object_number&&!raw.properties?.id&&!raw.objects?.property_id&&agreementParts;
    if(numberParts)raw.properties ||= {};
    if(issueContext){
     const size=data.properties.length+'|'+data.objects.length;
     if(!matchIssueHome||homeIndexSize!==size){matchIssueHome=issueHomeMatcher(data);homeIndexSize=size;}
     const matched=matchIssueHome(raw),savedIssue=indexes.issues.get(text(raw.issues.id||issuePlan?.id));
     property=matched.property||null;object=matched.object||null;
     if(['property-address','property-name'].includes(matched.method)||matched.candidates?.length){
      const savedObject=savedIssue?.object_id&&indexes.objects.get(savedIssue.object_id);
      const savedProperty=indexes.properties.get(savedObject?.property_id||savedIssue?.property_id);
      if(savedProperty){property=savedProperty;object=savedObject||null;matched.method='existing-issue-link';}
      else{property=approveProperty(matched.candidates||[property],raw.properties?.address?'Adress':'Fastighetsnamn');matched.method='explicit-row-choice';}
     }
     origin.matchingDecision=matched.method?{method:matched.method,propertyId:property?.id,...(object?{objectId:object.id}:{})}:{method:'unresolved',reason:matched.reason};
     if(property)touch('properties',property.id);if(object)touch('objects',object.id);
    }
    if(linkedNumbers.has('owner'))raw.properties ||= {};
    if(issueContext&&property&&(raw.properties?.owner_party_id||linkedNumbers.has('owner'))){
     const owner=party(raw.properties?.owner_party_id||property.owner_party_id,'owner');
     property=merge('properties',{id:property.id,owner_party_id:owner},property);
    }
    if(raw.properties&&!issueContext){
     const p=raw.properties;
     const previousGeneratedId=generatedPropertyId(source,profile.name,p);
     if(!p.id&&!raw.objects?.property_id&&!anchorProperty&&aliases.has(previousGeneratedId))p.id=resolvePropertyId(aliases,previousGeneratedId);
     const propertyIds=[p.id,raw.objects?.property_id,raw.issues?.property_id].filter(present).map(text);
     if(new Set(propertyIds).size>1)throw Error('FastighetsID och radens fastighetskoppling pekar på olika fastigheter.');
     p.id ||= propertyIds[0];
     const matchingKey=JSON.stringify([source,profile.name,r+1]),cityFits=row=>!p.city||!row.city||key(p.city)===key(row.city);
     const named=(p.name?propertyIdentities.get(key(p.name))||[]:[]).filter(cityFits),atAddress=(p.address?propertyAddresses.get(importAddressKey(p.address))||[]:[]).filter(cityFits);
     const namedAtAddress=atAddress.filter(row=>named.some(other=>other.id===row.id)),candidates=namedAtAddress.length?namedAtAddress:atAddress.length?atAddress:named;
     let byId=p.id?indexes.properties.get(text(p.id)):null,numberChoice=null;
     const managementError=message=>Object.assign(Error(message),{...originFor('properties','management_object_number'),value:p.management_object_number});
     const managementMatches=present(p.management_object_number)?propertyManagementNumbers.get(key(p.management_object_number))||[]:[];
     // Earlier imports may already use the source number as their canonical ID.
     if(!managementMatches.length&&present(p.management_object_number))for(const id of new Set([text(p.management_object_number),managementPropertyNumber(p.management_object_number)]))if(indexes.properties.has(id))managementMatches.push(indexes.properties.get(id));
     const byManagement=managementMatches.length===1?managementMatches[0]:!anchorProperty&&!byId&&managementMatches.length>1?approveProperty(managementMatches,'Förvaltningsobjekt'):null;
     if(managementMatches.length&&(anchorProperty||byId)&&!managementMatches.some(row=>row.id===(anchorProperty||byId).id))throw managementError('Förvaltningsobjekt och den sparade fastighetskopplingen pekar på olika fastigheter. Kontrollera källuppgiften.');
     if(anchorProperty&&present(anchorProperty.management_object_number)&&present(p.management_object_number)&&key(anchorProperty.management_object_number)!==key(p.management_object_number))throw managementError('Förvaltningsobjekt skiljer sig från avtalets sparade fastighet. Kontrollera kopplingen.');
     if(byId&&byManagement&&byId.id!==byManagement.id)throw managementError('FastighetsID och Förvaltningsobjekt pekar på olika fastigheter.');
     const byNumber=!p.id&&!anchorProperty&&numberParts?indexes.properties.get(numberParts.propertyId):null;
     const reviewIdentity=message=>Object.assign(Error(message),{collection:'properties',field:p.id?'id':p.management_object_number?'managementObjectNumber':'designation',matchingKey,matches:p.id?[]:candidates.map(row=>({id:row.id,label:row.name,number:managementPropertyNumber(row.management_object_number)||(!isInternalIdentifier(row.id)?row.id:null),detail:[row.address,row.city].filter(Boolean).join(' · ')}))});
     // An ID identifies the property, but an address pointing to another known
     // property must never silently create or move its objects and agreements.
     if(p.id&&anchorProperty&&p.id!==anchorProperty.id)throw reviewIdentity('FastighetsID och objektets fastighet pekar på olika fastigheter. Importen får inte flytta en befintlig koppling.');
     const identified=byId||anchorProperty||byManagement||byNumber;
     if(identified&&atAddress.length&&!atAddress.some(row=>row.id===identified.id))throw reviewIdentity((p.management_object_number?'Förvaltningsobjekt':'FastighetsID')+' och adress pekar på olika fastigheter. Kontrollera identifieraren eller adressen.');
     if(p.id&&!byId&&atAddress.length)throw reviewIdentity('Adressen finns redan med ett annat FastighetsID. Kontrollera identifieraren så att fastigheten inte skapas dubbelt.');
     const addressMatch=!byId&&!anchorProperty&&candidates.length===1?candidates[0]:null;
     let identityChoice=null;
     const matchedProperty=byId||anchorProperty||byManagement||addressMatch;
     const savedNumberChoice=resolvePropertyId(aliases,numberChoices.get(JSON.stringify([text(raw.agreements?.id),numberParts?.propertyId])))===matchedProperty?.id&&Boolean(matchedProperty);
     const requested=context.rowMatches?.[matchingKey];
     if(requested&&matchedProperty&&requested.propertyId!==matchedProperty.id&&aliases.has(requested.propertyId)&&resolvePropertyId(aliases,requested.propertyId)===matchedProperty.id)throw reviewIdentity('Olika FastighetsID har valts för samma fastighet. Välj samma nummer för de berörda avtalen.');
     if(numberParts&&matchedProperty&&!priorPropertyIds.has(matchedProperty.id)&&!savedNumberChoice&&resolvePropertyId(aliases,numberParts.propertyId)!==matchedProperty.id){
      const previous=matchedProperty.id,target=numberParts.propertyId,occupied=indexes.properties.has(target),budget=propertyIdInBudget(data.workspace.budgetPlans,previous);
      const inferred={...numberParts,objectId:raw.objects?.id||raw.agreements?.object_id||anchorObject?.id||null,proposedObjectId:numberParts.objectId,identityChoice:true,previousPropertyId:previous};
      const options=[{...matchedProperty,id:target,identityDetail:occupied?'ID används redan av en annan fastighet':budget?'Sparat ID används i Budget':'Från avtalsnumret · ändrar '+previous,disabled:occupied||budget},{...matchedProperty,identityDetail:'Behåll sparat FastighetsID'}];
      numberChoice=approveProperty(options,'Olika FastighetsID',inferred);
      const selectionKey=[...identitySelections.keys()].find(id=>resolvePropertyId(aliases,id)===matchedProperty.id)||matchedProperty.id;
      const earlier=identitySelections.get(selectionKey);
      if(earlier&&earlier!==numberChoice.id)throw reviewIdentity('Olika FastighetsID har valts för samma fastighet. Välj samma nummer för de berörda avtalen.');
      undo.push(()=>earlier===undefined?identitySelections.delete(selectionKey):identitySelections.set(selectionKey,earlier));identitySelections.set(selectionKey,numberChoice.id);
      origin.matchingDecision={method:'agreement-number-property-choice',propertyId:numberChoice.id,previousPropertyId:previous,numberPropertyId:numberParts.propertyId,agreementId:numberParts.agreementId};
      const record=numberChoice.id===previous?matchedProperty:correctPropertyId(matchedProperty,numberChoice.id);
      if(numberChoice.id===previous)changes.push({collection:'properties',recordId:previous,field:'id',from:previous,to:previous,provenance:origin});
      identityChoice={...origin.matchingDecision};p.id=record.id;byId=record;
      if(!anchorAgreement&&!raw.objects?.id&&!raw.agreements?.object_id&&numberParts.objectId&&record.id===numberParts.propertyId){
       const existingObject=indexes.objects.get(numberParts.objectId);
       if(existingObject&&existingObject.property_id!==record.id)throw reviewIdentity('Det föreslagna ObjektID tillhör en annan fastighet. Ange rätt ObjektID.');
       raw.objects ||= {};raw.objects.id=numberParts.objectId;
      }
     }
     if(numberParts&&!identityChoice){
      const missingProperty=!p.id&&!anchorProperty&&(byNumber||!candidates.length);
      const targetProperty=p.id||anchorProperty?.id||byNumber?.id||(missingProperty?numberParts.propertyId:null);
      const missingObject=Boolean(numberParts.objectId)&&!anchorAgreement&&!raw.objects?.id&&!raw.agreements?.object_id&&targetProperty===numberParts.propertyId;
      if(missingProperty||missingObject){
       const proposedObject=missingObject?numberParts.objectId:raw.objects?.id||raw.agreements?.object_id;
       const existingObject=proposedObject&&indexes.objects.get(text(proposedObject));
       if(existingObject&&existingObject.property_id!==targetProperty)throw reviewIdentity('Det föreslagna ObjektID tillhör en annan fastighet. Ange rätt ObjektID.');
       const inferred={...numberParts,propertyId:targetProperty,objectId:proposedObject||null,existingObject:priorObjects.get(text(proposedObject))||null};
       const candidate=byId||anchorProperty||byNumber||{id:targetProperty,name:p.name||targetProperty,address:p.address,city:p.city};
       numberChoice=approveProperty([candidate],'Uppdelat avtalsnummer',inferred);
       p.id ||= numberChoice.id;byId=indexes.properties.get(text(p.id));
       if(missingObject){raw.objects ||= {};raw.objects.id=numberParts.objectId;}
      }
     }
     const chosen=!p.id&&!anchorProperty&&!byManagement&&candidates.length?approveProperty(candidates,p.address?'Adress':'Fastighetsnamn'):null;
     const existing=byId||anchorProperty||byManagement||chosen;
     origin.matchingDecision={propertyId:existing?.id||text(p.id),method:numberChoice?'agreement-number-approved':anchorAgreement?'existing-agreement-link':anchorObject?'existing-object-link':byManagement?'management-object-number':chosen?'explicit-row-choice':p.id?'property-id':p.address?'property-address':'property-name',...(numberChoice?{agreementId:numberParts.agreementId,objectId:raw.objects?.id||raw.agreements?.object_id}:{}),...(identityChoice||{}),addressChecked:Boolean(p.address)};
     if(p.owner_party_id||linkedNumbers.has('owner'))p.owner_party_id=party(p.owner_party_id||existing?.owner_party_id,'owner');
     const incomingName=p.name&&(!existing||!p.address||importAddressKey(p.name)!==importAddressKey(p.address)||importAddressKey(existing.name)===importAddressKey(existing.address))?p.name:null;
     const preferredNumber=managementPropertyNumber(p.management_object_number);
     const generatedId=preferredNumber||generatedPropertyId(source,profile.name,p);
     if(!existing&&!p.id&&indexes.properties.has(generatedId))throw reviewIdentity('Den skapade fastighetsidentifieraren finns redan. Ange FastighetsID.');
     property=merge('properties',{...p,id:existing?.id||text(p.id)||generatedId,name:incomingName||existing?.name||p.address||p.id||preferredNumber},existing);
     origin.matchingDecision.propertyId=property.id;
     if(!existing&&!p.id&&preferredNumber)origin.matchingDecision.method='management-object-number-new';
     if(present(property.management_object_number)){const number=key(property.management_object_number);if(!propertyManagementNumbers.has(number))propertyManagementNumbers.set(number,[]);if(!propertyManagementNumbers.get(number).some(row=>row.id===property.id))propertyManagementNumbers.get(number).push(property);}
     if(anchorAgreement&&anchorObject&&priorAgreementIds.has(anchorAgreement.id))reusedLink={agreementId:anchorAgreement.id,objectId:anchorObject.id,propertyId:property.id};
     origin.matchingDecision.addressMatch=property.address&&p.address?importAddressKey(property.address)===importAddressKey(p.address):null;
    }
    checkpoint();recordStage='objects';
    const obj=raw.objects||{};
    const explicitObjectId=obj.id||raw.agreements?.object_id||raw.issues?.object_id;
    if(!issueContext)object=explicitObjectId?indexes.objects.get(text(explicitObjectId)):null;
    if(!issueContext&&!object&&raw.agreements?.id)object=indexes.objects.get(indexes.agreements.get(text(raw.agreements.id))?.object_id);
    const knownObject=Boolean(object);
    if((raw.objects||raw.agreements)&&(!issueContext||object)){
     const propertyId=issueContext?object.property_id:obj.property_id||property?.id||object?.property_id;
     if(!propertyId||!indexes.properties.has(propertyId))throw Error('Objektet saknar ett befintligt FastighetsID.');
     if(!object&&!explicitObjectId&&!raw.agreements?.id)throw Error('Välj ObjektID eller AvtalsID för att identifiera objektet.');
     const managementNumber=managementPropertyNumber(indexes.properties.get(propertyId)?.management_object_number);
     if(!object&&!explicitObjectId&&/^SF\d+$/i.test(managementNumber)&&/^SF-?\d+$/i.test(agreementParts?.propertyId||'')&&managementNumber.toUpperCase()!==agreementParts.propertyId.replace('-','').toUpperCase())throw Error('Förvaltningsobjekt och fastighetsdelen i avtalsnumret pekar på olika fastigheter. Kontrollera numren.');
     const objectId=object?.id||text(explicitObjectId)||agreementParts?.objectId||'OB-'+text(raw.agreements.id);
     if(!object&&!explicitObjectId&&agreementParts?.objectId){origin.matchingDecision ||= {};Object.assign(origin.matchingDecision,{objectId,objectNumberSource:'agreement-number'});}
     if(!object&&!explicitObjectId){
      try{normalize('agreements',{id:text(raw.agreements.id),object_id:objectId});}catch(error){throw Object.assign(error,originFor('agreements','id'),{value:raw.agreements.id});}
      if(objectId.length>100)throw Error('Avtalsnumret är för långt för att identifiera objektet. Ange ett objektnummer, högst 100 tecken.');
      object=indexes.objects.get(objectId);
      if(object&&object.property_id!==propertyId)throw Error('Det skapade ObjektID '+objectId+' finns redan på en annan fastighet. Ange rätt ObjektID.');
     }
     object=merge('objects',{...obj,id:objectId,property_id:propertyId},object);
    }
    if(explicitObjectId||knownObject)checkpoint();recordStage='contracts';
    if(deferredError)throw deferredError;
    if(raw.agreements){
     const a=raw.agreements;if(!a.id)throw Error('Avtalet behöver AvtalsID (avtalsnumret) för säker återimport.');const existing=indexes.agreements.get(text(a.id));
     if(!object)throw Error('Avtalet saknar ObjektID.');
     if(a.tenant_party_id||linkedNumbers.has('tenant'))a.tenant_party_id=party(a.tenant_party_id||existing?.tenant_party_id,'tenant');
     const candidate={...existing,...a,id:existing?.id||text(a.id),object_id:object.id};
     agreement=merge('agreements',candidate,existing);
     for(const item of legacyAgreementItems({...finance,id:agreement.id,valid_from:agreement.valid_from,valid_to:agreement.valid_to},agreement.id,[financialSource(origin)],data.agreement_items))merge('agreement_items',item,indexes.agreement_items.get(item.id));
     validateFinance({agreement_items:data.agreement_items.filter(item=>item.agreement_id===agreement.id),recurring_costs:[],cost_evidence:[]});
    }
    checkpoint();recordStage='people';
    if(raw.people){
     const p=raw.people;if(p.party_id)p.party_id=party(p.party_id);const existing=p.id?indexes.people.get(text(p.id)):p.email?emails.get(key(p.email)):null;
     if(!existing&&!p.id&&!p.email)throw Error('Personregistret behöver PersonID eller e-post. Använd personroll för kontaktkolumner.');
     const saved=merge('people',{...p,id:existing?.id||text(p.id)||newId('PER',[source,key(p.name),key(p.email),p.party_id])},existing);if(saved.email)emails.set(key(saved.email),saved);if(!personNames.has(key(saved.name)))personNames.set(key(saved.name),[]);if(!personNames.get(key(saved.name)).some(row=>row.id===saved.id))personNames.get(key(saved.name)).push(saved);
    }
    checkpoint();recordStage='activities';
    if(raw.issues){
     const a=raw.issues,existing=indexes.issues.get(text(a.id||issuePlan?.id));
     a.status=({Nytt:'open',Öppet:'open',Pågår:'ongoing',Klar:'done',Klart:'done',Avslutad:'done'})[a.status]||a.status;
     a.priority=({Låg:'low',Medel:'normal',Normal:'normal',Hög:'high'})[a.priority]||a.priority;
     const requestedObject=a.object_id||explicitObjectId,requestedProperty=a.property_id||raw.properties?.id;
     const objectId=issueContext?object?.id:requestedObject?(indexes.objects.has(text(requestedObject))?text(requestedObject):null):object?.id;
     const propertyId=issueContext?property?.id:requestedProperty?(indexes.properties.has(text(requestedProperty))?text(requestedProperty):null):property?.id;
     // An unknown object must not silently turn into a property-level issue.
     const home=objectId?{object_id:objectId,property_id:null}:!requestedObject&&propertyId?{object_id:null,property_id:propertyId}:existing?{object_id:existing.object_id,property_id:existing.property_id}:{object_id:null,property_id:null};
     const homeHint=sourceValues.filter(value=>['properties','objects'].includes(value.target.split('.')[0])||['activities.propertyId','activities.objectId'].includes(value.target)).filter(value=>present(value.raw)).map(value=>value.column+': '+text(value.raw)).join(' · ');
     const receipt={...issuePlan?.record,...origin,kind:'issue-import',...(homeHint?{homeHint}:{})};
     // A mixed row has a separate property audit. Its new/existing lookup state
     // must not make an unchanged issue look updated on every repeat import.
     if(!issueContext)delete receipt.matchingDecision;
     const sources=[...(existing?.sources||[]).filter(item=>item.kind!=='issue-import'||item.source!==source||item.sheet!==profile.name),receipt];
     const defaults=!existing&&!home.object_id&&!home.property_id?{include_in_budget:'Nej',budget_category:'Ej budget'}:{};
     issue=merge('issues',{...defaults,...a,id:existing?.id||text(a.id)||nextIssueId(data.issues,data.workspace.settings ||= {}),...home,sources},existing);
    }
    checkpoint();recordStage='orders';
    if(raw.orders){const o=raw.orders;if(!o.id)throw Error('Beställningen behöver ett ID.');o.issue_id ||= issue?.id;if(!indexes.issues.has(o.issue_id))throw Error('Beställningen behöver ett befintligt ÄrendeID.');o.status=({Planerad:'draft',Beställd:'ordered',Beställt:'ordered',Klar:'done'})[o.status]||o.status;order=merge('orders',o,indexes.orders.get(o.id));}
    checkpoint();recordStage='agreementItems';
    for(const [slot,row]of itemRows){
     itemInProgress=slot;const type=row.type;
     const amountColumn=selected.find(c=>c.target==='agreementItems.baseAmount'&&(c.itemKey||c.itemType)===slot);
     // A blank amount in a wide sheet is no new item. Conditions may still
     // enrich an existing item, but cannot create a phantom zero amount.
     const shared=raw.agreement_items||{},agreementId=shared.agreement_id||agreement?.id,labels=tables.agreement_items.fields.find(f=>f.key==='type').values;
     if(!agreementId||!indexes.agreements.has(agreementId))throw Error('Avtalsposten behöver ett befintligt AvtalsID.');
     const providedType=Object.keys(labels).find(key=>key===shared.type||labels[key]===shared.type);if(providedType&&providedType!==type)throw Error('Kolumnens avtalsposttyp skiljer sig från radens Typ. Välj En post per datarad eller rätt posttyp.');row.agreement_id=agreementId;
     const id=shared.id?(profile.columns.filter(c=>c.target==='agreementItems.baseAmount'&&c.itemType).length<=1&&itemRows.size===1?shared.id:financialId(slot,shared.id)):financialId(slot,agreementId),existing=indexes.agreement_items.get(id);
     if(amountColumn&&!present(row.base_amount)&&!existing)continue;
     const suffix=slot.includes(':')?' ('+slot.split(':')[1]+')':'';
     const candidate={...shared,...row,id,agreement_id:agreementId,name:row.name||shared.name||existing?.name||(amountColumn?.header||labels[type])+suffix,adjustment_method:row.adjustment_method||shared.adjustment_method||existing?.adjustment_method||(profile.primaryTable==='agreementItems'?'none':['base','addition'].includes(type)?'kpi':'none'),sources:[{...financialSource(origin),...(amountColumn?{column:amountColumn.header,columnIndex:amountColumn.index,itemKey:slot}:{})}]};
     if(!existing){candidate.valid_from ||= agreement?.valid_from||null;candidate.valid_to ||= agreement?.valid_to||null;}
     merge('agreement_items',candidate,existing);
    }
    itemInProgress=null;
    if(itemRows.size)delete raw.agreement_items;
    for(const table of ['agreement_items','recurring_costs','cost_evidence'])if(raw[table]){recordStage=viewCollections[table];const row=raw[table];if(!row.id)throw Error(tables[table].label+' behöver ett beständigt ID för säker återimport.');for(const f of tables[table].fields)if(f.values&&row[f.key]!=null)row[f.key]=Object.entries(f.values).find(([,label])=>label===row[f.key])?.[0]||row[f.key];if(table==='agreement_items')row.agreement_id ||= agreement?.id;if(table==='recurring_costs')row.property_id ||= property?.id;merge(table,row,indexes[table].get(row.id));}
    for(const table of Object.keys(maintenanceTables))if(raw[table]){
     recordStage=viewCollections[table];const row=raw[table];if(!row.id)throw Error(tables[table].label+' behöver ett beständigt ID för säker återimport.');
     for(const f of tables[table].fields)if(f.values&&row[f.key]!=null)row[f.key]=Object.entries(f.values).find(([,label])=>label===row[f.key])?.[0]||row[f.key];
     merge(table,row,indexes[table].get(row.id));
    }
    for(const {column,values,errors=[]} of contacts.values()){
     if(!column)continue;
     const contactSavepoint=transaction.savepoint();
     try{
     if(errors.length)throw Error(errors.join(' · '));
     if(!values.name)throw Error('Personuppgifter saknar namn. Koppla en namnkolumn för personrollen.');
     const originalPersonName=values.name,parsed=parsePersonIdentity(values.name,personFormat(column),indexes.people);
     values.name=parsed.name;
     if(!values.sourceId&&indexes.people.has(text(values.name))){values.sourceId=text(values.name);values.name=indexes.people.get(values.sourceId).name;}
     const descriptor=personRole(column.target),role=roles[descriptor.role],target=({property:property||indexes.properties.get(object?.property_id)||anchorProperty,contract:agreement,activity:issue,order})[descriptor.type];
     if(!target)throw Error('Kontaktkolumnen saknar identifierad fastighet, avtal eller ärende.');
     if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw Error('Ogiltig e-postadress i kontaktkolumnen.');
     const contactKey=JSON.stringify([source,profile.name,key(values.name),key(values.email),text(values.sourceId),role,target.id,values.fromDate||null,values.toDate||null]);
     const chosen=indexes.contacts.get(contactChoices.get(contactKey));
     if(chosen&&!chosen.cancelled&&indexes.people.has(chosen.person_id)){
      touch('contacts',chosen.id);touch('people',chosen.person_id);contactKeys[chosen.id]=contactKey;continue;
     }
     const contactParty=role==='owner'?target.owner_party_id:role==='tenant'?target.tenant_party_id:data.parties.filter(p=>p.kind==='our').length===1?data.parties.find(p=>p.kind==='our').id:null;
     let person=values.sourceId?indexes.people.get(text(values.sourceId)):values.email?emails.get(key(values.email)):null;
     if(!values.sourceId&&!person){const matches=[...new Map([...(personNames.get(key(values.name))||[]),...(personNames.get(key(originalPersonName))||[])].filter(p=>!contactParty||!p.party_id||p.party_id===contactParty).map(p=>[p.id,p])).values()];if(matches.length>1)throw Error('Namnet tillhör flera personer. Koppla PersonID eller e-post.');person=matches[0];}
     if(values.sourceId&&values.email&&emails.has(key(values.email))&&emails.get(key(values.email)).id!==(person?.id||text(values.sourceId)))throw Error('PersonID och e-post pekar på olika personer.');
     if(!person&&values.sourceId&&[...(personNames.get(key(values.name))||[]),...(personNames.get(key(originalPersonName))||[])].some(p=>!contactParty||!p.party_id||p.party_id===contactParty))throw Error('Namnet finns redan med ett annat PersonID. Kontrollera personens identitet före koppling.');
     person=merge('people',{party_id:contactParty||person?.party_id,id:person?.id||text(values.sourceId)||newId('PER',[source,key(values.name),key(values.email),contactParty]),name:values.name,email:values.email,phone:values.phone},person);
     if(person.email)emails.set(key(person.email),person);if(!personNames.has(key(person.name)))personNames.set(key(person.name),[]);if(!personNames.get(key(person.name)).some(p=>p.id===person.id))personNames.get(key(person.name)).push(person);
     const f=targetField[descriptor.type],candidate={person_id:person.id,role,[f]:target.id,valid_from:values.fromDate||null,valid_to:values.toDate||null};
     const existing=data.contacts.find(row=>row.person_id===person.id&&row.role===role&&row[f]===target.id&&row.valid_from===candidate.valid_from&&row.valid_to===candidate.valid_to&&!row.cancelled);
     if(existing){touch('contacts',existing.id);contactKeys[existing.id]=contactKey;}
     if(!existing){if(data.contacts.some(row=>!row.cancelled&&row.role===role&&row[f]===target.id&&(role==='coordinator'||row.person_id===person.id)&&(!row.valid_to||!candidate.valid_from||row.valid_to>=candidate.valid_from)&&(!candidate.valid_to||!row.valid_from||candidate.valid_to>=row.valid_from)))throw Error('Personkopplingen överlappar en befintlig period.');const saved=merge('contacts',{...candidate,id:newId('KOP',[source,person.id,role,target.id,candidate.valid_from,candidate.valid_to])},null);contactKeys[saved.id]=contactKey;}
     }catch(error){
      transaction.restore(contactSavepoint);rebuild();
      const inputs=selected.filter(input=>input.index===column.index||contactPart(input.target)?.index===column.index);for(const input of inputs)readColumns.delete(input.index);
      const [collection,field]=column.target.split('.'),review={id:'CLEAN-PERSON-'+hash(JSON.stringify([source,profile.name,r+1,column.index,error.message])),kind:'canonical-conflict',status:'pending',...origin,collection,field,column:column.header,columnIndex:column.index,value:sourceValues.find(value=>value.index===column.index)?.raw,reason:error.message,blocking:false,rowRejected:false,personLinkRejected:true,sourceValues:sourceValues.filter(value=>inputs.some(input=>input.index===value.index))};
      reviews.push(review);decisions.push({...origin,collection,classification:'B',reason:error.message});
     }
    }
    if(linkedNumbers.size)throw Error('Organisationsnumret saknar identifierad fastighet eller avtal. Välj rätt ID och partkoppling.');
    if(itemRows.size||Object.keys(finance).length||raw.agreement_items||raw.recurring_costs||raw.cost_evidence){
     const agreementId=agreement?.id||raw.agreement_items?.agreement_id||itemRows.values().next().value?.agreement_id,costId=raw.cost_evidence?.cost_id||raw.recurring_costs?.id;
     validateFinance({agreement_items:agreementId?data.agreement_items.filter(x=>x.agreement_id===agreementId):[],recurring_costs:costId?data.recurring_costs.filter(x=>x.id===costId):[],cost_evidence:costId?data.cost_evidence.filter(x=>x.cost_id===costId):[]});
    }
   }catch(error){
    const partial=transaction.rollback();rejected=!partial;if(rejected)rejectedRows++;rebuild();
    const [collection,field]=fieldInProgress.split('.');
    const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,error.message,error.proposed])),kind:'canonical-conflict',status:'pending',...origin,collection:error.collection||collection||recordStage,field:error.field||field,recordId:error.recordId,current:error.current,proposed:error.proposed,reason:error.message,matches:error.matches,matchingKey:error.matchingKey,...(error.linkProposal?{linkProposal:true}:{}),column:error.column||columnInProgress?.header,columnIndex:error.columnIndex??columnInProgress?.index,value:error.value??sourceValues.find(v=>v.index===(error.columnIndex??columnInProgress?.index))?.raw,blocking:rejected,rowRejected:rejected,...(partial?{recordRejected:true}:{}),sourceValues};
    if(!review.recordId&&!review.linkProposal)review.reason+=' Rätta kolumnval eller identifierare före import.';
    reviews.push(review);decisions.push({...origin,collection:review.collection,classification:'D',reason:error.message});
   }
   if(!rejected)for(const review of reviews.slice(startReviews))if(!review.recordId&&!review.blocking&&!review.recordRejected){
    const table=Object.keys(viewCollections).find(table=>viewCollections[table]===review.collection);review.recordId=rowTouched.get(table)?.values().next().value;
    if(review.fieldRejected&&review.recordId){const field=fieldMap[review.collection+'.'+review.field]?.field;review.current=indexes[table].get(review.recordId)?.[field];}
   }
   if(!rejected)for(const [table,ids]of rowTouched)for(const id of ids)touched[table].add(id);
   if(!rejected&&reusedLink&&rowTouched.get('agreements')?.has(reusedLink.agreementId))reusedLinks.set(reusedLink.agreementId,reusedLink);
   traceRow({...origin,records:Object.fromEntries([...rowTouched].map(([table,ids])=>[table,[...ids]])),...(Object.keys(contactKeys).length?{contactKeys}:{}),read:[...readColumns],held:[...heldColumns],rejected,hints:{propertyId:raw.properties?.id,managementNumber:raw.properties?.management_object_number,address:raw.properties?.address,objectId:raw.objects?.id||raw.agreements?.object_id,agreementId:raw.agreements?.id||raw.agreement_items?.agreement_id}});
   for(const value of sourceValues){const stat=columnStats.get(profile).get(value.index);if(rejected||heldColumns.has(value.index)){if(present(value.raw))stat.skipped++;}else if(readColumns.has(value.index))stat.read++;}
  }
 }
 return completeCleanImport({data,prior,profiles,context,changes,decisions,
  reviews,linkProposals,reusedLinks:[...reusedLinks.values()],sourceRows,touched,aliases,rowCount,rejectedRows,columnStats});
}
