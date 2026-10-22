import {consolidateImportReviews} from './import-conflicts.js';
import {refreshImportReceipt} from './import-receipt.js';
import {nextIssueId} from './issue-identity.js';
import {issueImportPlan,issueHomeMatcher,importAddressKey} from './issue-import.js';
import {importPreference} from '../services/import-preferences.js';
import {legacyFinanceFields,legacyFinanceMap,validateFinance} from './finance-model.js';
import {maintenanceTables} from './maintenance-model.js';
import {financialId,legacyAgreementItems} from './finance-revision.js';
import {tables,emptyData,normalize,validateData,idLabels,partyNumberFields,normalizeOrganizationNumber} from './model.js';
import {viewFields,viewCollections} from './view-fields.js';
import {projectWorkspace} from './view-adapter.js';
import {interpretCell} from '../services/import-formats.js';
import {personRole,contactPart,contactFields,personFormat,parsePersonIdentity} from '../services/import-person-links.js';
const clone=value=>structuredClone(value),present=value=>value!==null&&value!==undefined&&value!=='';
const text=value=>String(value??'').trim(),key=value=>text(value).replace(/\s+/g,' ').toLocaleLowerCase('sv');
const validLink=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!!url.hostname&&!/\s/.test(value);}catch{return false;}};
const hash=value=>{let h=2166136261;for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
const fieldAliases={
 organizations:{organizationNumber:['Orgnr','Org.nr','Organisationsnr']},
 properties:{designation:['Fastighet','Fastighetsbeteckning','Fast.bet','Fast.nr','Fastighetsnr'],popularName:['Benämning'],id:['Fastighets-ID','Förvaltningsobjekt','Objektsnummer / Förvaltningsobjekt','Förvaltningsnummer'],address:['Gatuadress','Postadress','Fastighetsadress'],city:['Postort','Stad'],ownerPartyId:['Fastighetsägare PartID','Fastighetsägare namn','Hyresvärd','Lev.namn']},
 objects:{id:['Objektnummer','Objektsnummer','Objektnr','Objekt. nr','Objekt nr','Objekt','Objekt-ID','Objekts-ID'],area:['Area','Lokalarea','Lokalyta kvm','Lokalyta (kvm)','BRA','kvm','m2'],apartmentCount:['Lägenheter'],apartmentArea:['Lägenheter (yta)']},
 contracts:{id:['Avtalsnummer','Avtalsnr','Avtals-ID'],start:['Fr.o.m.','Start','Startdatum','Kontraktsstart','Gäller från','Giltigt fr.o.m.'],end:['T.o.m.','Slut','Slutdatum','Kontraktsslut','Giltigt t.o.m.','Aktuellt giltigt t.o.m.'],business:['Namn på verksamheten','Verksamhetsnamn'],comment:['Kommentar verksamhet'],category:['Lokalkategori','Lokalkategori (LEB)','Lokalkategori (EB)'],notice:['Säg upp avtal senast','Sägs upp senast'],noticePeriodMonths:['Uppsägningstid'],renewalPeriodMonths:['Förlängningstid'],use:['Användning'],contractDocumentUrl:['Länk avtal (Huvudkontrakt)','Länk till huvudkontrakt']},
 activities:{title:['Ärendenamn','Aktivitet','Vad ska göras'],priority:['Prio'],notes:['Kommentar','Kommentarer'],startDate:['Fr.o.m.','Startdatum'],endDate:['T.o.m.','Slutdatum']},
 orders:{title:['Produktnamn/beskrivning'],orderedAt:['Beställningsdatum'],deliveryText:['Leveransdatum'],status:['Status (Enbart beställt eller klart)']},
 people:{id:['Person-ID'],email:['Email','Epost'],phone:['Telefonnummer']}
};
fieldAliases.activities.objectId=fieldAliases.objects.id;
fieldAliases.activities.propertyId=fieldAliases.properties.id;
export const importSchemas=Object.entries(viewCollections).map(([table,collection])=>{
 const spec=tables[table],fields=spec.fields.filter(f=>f.key!=='sources'),fieldSpecs=Object.fromEntries(fields.map(f=>[viewFields[table][f.key]||f.key,{...f,storageKey:f.key}]));
 const schema={key:collection,storage:table,canonical:true,sheet:spec.label,singular:spec.singular,fieldSpecs:{id:{type:'text',storageKey:'id'},...fieldSpecs},labelAliases:fieldAliases[collection]||{},columns:[['id',idLabels[table]],...fields.map(f=>[viewFields[table][f.key]||f.key,f.type==='ref'?idLabels[f.table]:f.label])],related:[],parents:[]};
 if(collection==='activities')schema.aliases=['Aktiviteter','Årshjul'];
 if(collection==='contracts')schema.aliases=['Hyresavtal','Lokallista','Lokalbestånd','Lokaldata'];
 if(table==='properties')schema.columns=schema.columns.map(c=>c[0]==='ownerPartyId'?[c[0],'Fastighetsägare']:c);
 const linked=partyNumberFields[table];
 if(linked){schema.columns.push([linked.key,linked.label]);schema.fieldSpecs[linked.key]={type:'text',storageTarget:'parties.organization_number'};schema.labelAliases={...schema.labelAliases,[linked.key]:[linked.label,'Organisationsnummer '+(linked.role==='owner'?'fastighetsägare':'hyresgäst'),'Orgnr ('+(linked.role==='owner'?'fastighetsägare':'hyresgäst')+')']};}
 if(['properties','contracts','activities','orders'].includes(collection)){
  const roles=collection==='properties'?[['ownerResponsiblePersonId','Fastighetsägarens kontaktperson'],['responsiblePersonId','Samordnare']]:collection==='contracts'?[['tenantResponsiblePersonId','Hyresgästens kontaktperson'],['responsiblePersonId','Samordnare']]:[['responsiblePersonId','Vår ansvarige']];
  schema.columns.push(...roles);for(const [key]of roles)schema.fieldSpecs[key]={type:'text'};
  schema.labelAliases={...schema.labelAliases,responsiblePersonId:['Ansvarig hos oss','Vår kontaktperson','Avtalsansvarig','Vår ansvarige','Ansvarig']};
  if(collection==='properties')schema.labelAliases.ownerResponsiblePersonId=['Fastighetsförvaltare','Förvaltare','Fastighetsägarens förvaltare'];
 }
 if(table==='agreements'){
  schema.columns=schema.columns.map(c=>c[0]==='tenantPartyId'?[c[0],'Hyresgäst']:c);
  schema.shortcuts=Object.entries(legacyFinanceMap).map(([field,target])=>({target:'agreementItems.'+({annual_rent:'baseAmount',annual_additions:'baseAmount',annual_property_tax:'baseAmount',base_index:'baseIndex'}[field]||field.replace(/^(rent|addition)_/,'').split('_').map((s,i)=>i?s[0].toUpperCase()+s.slice(1):s).join('')),itemType:field==='annual_property_tax'?'tax':field.startsWith('addition')||field==='annual_additions'?'addition':'base',aliases:[legacyFinanceFields[field],...(field==='annual_rent'?['Årshyra','Hyresbelopp','Bashyra','Grundhyra','Månadshyra']:field==='annual_additions'?['Tillägg','Bastillägg','Tilläggshyra']:field==='annual_property_tax'?['F-skatt per år','F-skatt','Fastighetsskatt']:[])]}));
  schema.shortcuts.push(...Object.entries(tables.agreement_items.fields.find(f=>f.key==='type').values).filter(([type])=>!['base','addition','tax'].includes(type)).map(([itemType,label])=>({target:'agreementItems.baseAmount',itemType,aliases:[label]})));
 }
 if(table==='agreement_items')schema.itemTypes=Object.fromEntries(Object.entries(tables.agreement_items.fields.find(f=>f.key==='type').values).map(([value,label])=>[label,value]));
 return schema;
});
for(const schema of importSchemas){const table=tables[schema.storage];for(const field of table.fields.filter(f=>f.type==='ref')){const parent=importSchemas.find(s=>s.storage===field.table);if(parent){schema.related.push(parent.key);schema.parents.push(parent.key);parent.related.push(schema.key);}}}
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
export function prepareCleanImport(workbook,profiles,base=emptyData(),context={},XLSX){
 const data=clone(base),changes=[],decisions=[],reviews=[],linkProposals=[];
 const touched=Object.fromEntries(Object.keys(tables).map(table=>[table,new Set()]));
 let rejectedRows=0;
 const columnStats=new Map(profiles.map(profile=>{
  const labels=new Map([...importSchemas.flatMap(schema=>schema.columns.map(([field,label])=>({target:schema.key+'.'+field,label:schema.sheet+' → '+label}))),...contactFields(profile)].map(field=>[field.target,field.label]));
  return [profile,new Map(profile.columns.map(column=>[column.index,{source:profile.fileName||context.fileName||'Excel',sheet:profile.name,index:column.index,header:column.header,target:column.target,label:labels.get(column.target)||column.target,...(column.itemType?{itemType:column.itemType,itemLabel:tables.agreement_items.fields.find(field=>field.key==='type').values[column.itemType]}:{}),read:0,skipped:0,review:0}]))];
 }));
 data.workspace ||= {};if(context.preferences)data.workspace.importFieldPreferences=clone(context.preferences);const prior=clone(data),priorPropertyIds=new Set(prior.properties.map(row=>row.id));let rowCount=0;
 let indexes,partyNames,partyNumbers,propertyIdentities,propertyAddresses,emails,personNames,matchIssueHome,homeIndexSize;
 const rebuild=()=>{
  matchIssueHome=null;
  indexes=Object.fromEntries(Object.keys(tables).map(table=>[table,new Map(data[table].map(row=>[row.id,row]))]));
  partyNames=new Map(data.parties.map(row=>[key(row.name),row]));
  partyNumbers=new Map(data.parties.filter(row=>row.organization_number).map(row=>[normalizeOrganizationNumber(row.organization_number),row]));
  propertyIdentities=new Map();for(const row of data.properties){if(!propertyIdentities.has(key(row.name)))propertyIdentities.set(key(row.name),[]);propertyIdentities.get(key(row.name)).push(row);}
  propertyAddresses=new Map();for(const row of data.properties)if(row.address){const address=importAddressKey(row.address);if(!propertyAddresses.has(address))propertyAddresses.set(address,[]);propertyAddresses.get(address).push(row);}
  emails=new Map(data.people.filter(row=>row.email).map(row=>[key(row.email),row]));
  personNames=new Map();for(const person of data.people){const k=key(person.name);if(!personNames.has(k))personNames.set(k,[]);personNames.get(k).push(person);}
 };rebuild();
 const issuePlans=issueImportPlan(workbook,profiles,data.issues,context,XLSX);
 const rank=profile=>{
  const mappings=profile.columns.map(column=>fieldMap[column.target]);
  // Property/object columns on a case sheet are lookup clues. Process their
  // actual registers first, independent of worksheet order and header aliases.
  if(mappings.some(mapping=>mapping?.table==='issues')&&!mappings.some(mapping=>mapping?.table==='agreements'))return 5;
  return Math.min(...profile.columns.map(c=>{const m=fieldMap[c.target];return m&&viewCollections[m.table]===c.target.split('.')[0]?['parties','properties','people','objects','agreements','issues','orders','agreement_items','recurring_costs','cost_evidence',...Object.keys(maintenanceTables)].indexOf(m.table):99;}));
 };
 const propertyProvider=profile=>profile.columns.some(c=>fieldMap[c.target]?.table==='properties'&&fieldMap[c.target]?.field==='id')?0:1;
 const priority=profile=>profile.columns.filter(column=>importPreference(data.workspace.importFieldPreferences,...column.target.split('.'),profile.fileName||context.fileName,profile,column)==='accept').length;
 for(const profile of [...profiles].sort((a,b)=>rank(a)-rank(b)||propertyProvider(a)-propertyProvider(b)||priority(b)-priority(a)||JSON.stringify([a.fileName||context.fileName,a.name]).localeCompare(JSON.stringify([b.fileName||context.fileName,b.name]),'sv'))){
  const sheet=workbook.Sheets[profile.sheetKey||profile.name];if(!sheet?.['!ref'])continue;
  const range=XLSX.utils.decode_range(sheet['!ref']);
  for(let r=profile.dataStartRow??profile.headerRow;r<=range.e.r;r++){
   const selected=profile.columns.filter(column=>!column.target.startsWith('@'));
   if(!selected.some(column=>present(sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v)))continue;
   if(++rowCount>20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');
   const lengths=Object.fromEntries(Object.keys(tables).map(table=>[table,data[table].length])),undo=[],startChanges=changes.length,startReviews=reviews.length,startDecisions=decisions.length;
   const rowTouched=new Map(),readColumns=new Set(),heldColumns=new Set();let rejected=false,safe=null,recordStage='properties',deferredError=null;
   const touch=(table,id)=>{if(!rowTouched.has(table))rowTouched.set(table,new Set());rowTouched.get(table).add(id);};
   const source=profile.fileName||context.fileName||'Excel',origin={source,sheet:profile.name,row:r+1};
   const raw={},itemRows=new Map(),contacts=new Map(),linkedNumbers=new Map(),sourceValues=selected.map(column=>{const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];return {column:column.header,index:column.index,target:column.target,raw:cell?.v??'',hyperlink:cell?.l?.Target};});let fieldInProgress='',columnInProgress=null,partyNumberColumn=null;const finance={};
   const columnFor=(table,field)=>table==='parties'&&field==='organization_number'&&partyNumberColumn||selected.find(c=>fieldMap[c.target]?.table===table&&fieldMap[c.target]?.field===field&&!fieldMap[c.target]?.partyRole);
   const originFor=(table,field)=>{const column=columnFor(table,field);return {column:column?.header,columnIndex:column?.index,collection:viewCollections[table]||table,field:viewFields[table]?.[field]||field};};
   const holdField=(table,field,error,existing)=>{
    const column=columnFor(table,field);if(!column||!canHoldField(table,field)||fieldMap[column.target]?.finance)return false;
    if(heldColumns.has(column.index))return false;
    const at=originFor(table,field),value=sourceValues.find(input=>input.index===column.index)?.raw;
    reviews.push({id:'CLEAN-FIELD-'+hash(JSON.stringify([source,profile.name,r+1,column.index])),kind:'canonical-conflict',status:'pending',...origin,...at,recordId:existing?.id,current:existing?.[field],value,reason:error.message,fieldRejected:true,blocking:false,rowRejected:false,sourceValues:sourceValues.filter(input=>input.index===column.index)});
    decisions.push({...origin,collection:at.collection,classification:'B',reason:error.message});
    heldColumns.add(column.index);readColumns.delete(column.index);return true;
   };
   const checkpoint=()=>{
    if(![...rowTouched.values()].some(ids=>ids.size))return;
    const read=new Set([...readColumns].filter(index=>{
     const column=selected.find(c=>c.index===index),mapping=fieldMap[column.target];
     return !heldColumns.has(index)&&(mapping?rowTouched.has(mapping.table)&&(!mapping.partyRole||!linkedNumbers.has(mapping.partyRole)):rowTouched.has('contacts'));
    }));
    if(!read.size)return;
    safe={undo:undo.length,lengths:Object.fromEntries(Object.keys(tables).map(table=>[table,data[table].length])),changes:changes.length,reviews:reviews.length,decisions:decisions.length,touched:new Map([...rowTouched].map(([table,ids])=>[table,new Set(ids)])),read};
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
     if(tables[table].fields.find(f=>f.key===field)?.type==='ref'){const error=Error('Olika värden för '+(tables[table].fields.find(f=>f.key===field)?.label||field)+'. Importen får inte flytta en befintlig koppling.');Object.assign(error,{collection,field:legacy,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value});throw error;}
     if(table==='properties'&&field==='address'&&importAddressKey(value)===importAddressKey(existing[field])){normalized[field]=existing[field];continue;}
     if(typeof value==='string'&&typeof existing[field]==='string'&&['properties','parties','people'].includes(table)&&['name','address','city','popular_name'].includes(field)&&key(value.normalize('NFKC'))===key(existing[field].normalize('NFKC'))){normalized[field]=existing[field];continue;}
     if(rule==='reject'){normalized[field]=existing[field];continue;}
     if(field==='name'&&existing.name===existing.id)continue;
     if(table==='properties'&&field==='name'&&existing.address&&importAddressKey(existing.name)===importAddressKey(existing.address)&&importAddressKey(value)!==importAddressKey(existing.address)&&(!priorPropertyIds.has(existing.id)||raw.properties?.id===existing.id&&raw.properties?.address&&importAddressKey(raw.properties.address)===importAddressKey(existing.address)))continue;
     if(rule!=='accept'){
      const reason='Olika värden för '+tables[table].fields.find(f=>f.key===field).label;
      const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,collection,field,value])),kind:'canonical-conflict',status:'pending',...origin,collection,field:legacy,recordId:existing.id,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value,reason,blocking:false,rowRejected:false};
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
    for(const [field] of Object.entries(record))if(field!=='id'&&JSON.stringify(previous?.[field])!==JSON.stringify(existing[field]))changes.push({collection:viewCollections[table]||table,recordId:existing.id,field:viewFields[table]?.[field]||field,from:previous?.[field]??null,to:existing[field],provenance:origin});
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
    const row=merge('parties',{id:existing?.id||'PAR-'+crypto.randomUUID(),name:existing?.name||text(value),kind:existing?.kind||kind,organization_number:number||existing?.organization_number},existing);
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
     readColumns.add(column.index);
     if(mapping&&tables[mapping.table].fields.find(f=>f.key===mapping.field)?.type==='text'&&typeof value!=='string')value=String(value);
     if(mapping?.partyRole)linkedNumbers.set(mapping.partyRole,{value,column});
     else if(role){if(!contacts.has(column.index))contacts.set(column.index,{column,values:{}});contacts.get(column.index).values.name=value;}
     else if(part){if(!contacts.has(part.index))contacts.set(part.index,{column:profile.columns.find(c=>c.index===part.index),values:{}});contacts.get(part.index).values[part.field]=value;}
     else if(mapping.finance){finance[mapping.field]=value;raw.agreements ||= {};}
     else if(mapping.table==='agreement_items'&&column.itemType){if(!itemRows.has(column.itemType))itemRows.set(column.itemType,{type:column.itemType});itemRows.get(column.itemType)[mapping.field]=value;}
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
    if(raw.parties){const p=raw.parties;let number;try{number=normalizeOrganizationNumber(p.organization_number);}catch(error){if(!holdField('parties','organization_number',error))throw error;delete p.organization_number;}const byName=p.id?indexes.parties.get(text(p.id)):partyNames.get(key(p.name)),byNumber=number&&partyNumbers.get(number);if(byName&&byNumber&&byName.id!==byNumber.id||p.id&&byNumber&&p.id!==byNumber.id)throw Error('PartID, namn och organisationsnummer pekar på olika parter.');const existing=byName||byNumber;const saved=merge('parties',{...p,id:existing?.id||text(p.id)||'PAR-'+crypto.randomUUID()},existing);partyNames.set(key(saved.name),saved);if(saved.organization_number)partyNumbers.set(saved.organization_number,saved);}
    // A source-row choice approves these exact inputs and candidates, never an
    // address as a permanent foreign key. Re-evaluation still starts from base.
    const approveProperty=(candidates,evidence)=>{
     const matchingKey=JSON.stringify([source,profile.name,r+1]);
     const matches=candidates.map(row=>({id:row.id,label:row.name,detail:[row.address,row.city].filter(Boolean).join(' · ')}));
     const signature=JSON.stringify([sourceValues.map(value=>[value.target,value.raw]),matches]);
     const choice=context.rowMatches?.[matchingKey];
     const approved=choice?.signature===signature&&matches.some(row=>row.id===choice.propertyId);
     linkProposals.push({matchingKey,signature,matches,evidence,source,sheet:profile.name,row:r+1,approved:Boolean(approved),propertyId:approved?choice.propertyId:null,
      records:[raw.objects?.id||raw.agreements?.object_id?{label:'Objekt',value:text(raw.objects?.id||raw.agreements?.object_id)}:null,raw.agreements?.id?{label:'Avtal',value:text(raw.agreements.id)}:null,raw.issues?{label:'Ärende',value:text(raw.issues.title||raw.issues.id)}:null].filter(Boolean)});
     if(!approved)throw Object.assign(Error('Godkänn föreslagen fastighetskoppling i listan före import.'),{collection:'properties',field:'id',matchingKey,matches,linkProposal:true});
     return candidates.find(row=>row.id===choice.propertyId);
    };
    const anchorAgreement=raw.agreements?.id&&indexes.agreements.get(text(raw.agreements.id));
    const anchorObject=indexes.objects.get(text(raw.objects?.id||raw.agreements?.object_id||raw.issues?.object_id||anchorAgreement?.object_id));
    const anchorProperty=anchorObject&&indexes.properties.get(anchorObject.property_id);
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
     const propertyIds=[p.id,raw.objects?.property_id,raw.issues?.property_id].filter(present).map(text);
     if(new Set(propertyIds).size>1)throw Error('FastighetsID och radens fastighetskoppling pekar på olika fastigheter.');
     p.id ||= propertyIds[0];
     const matchingKey=JSON.stringify([source,profile.name,r+1]),cityFits=row=>!p.city||!row.city||key(p.city)===key(row.city);
     const named=(p.name?propertyIdentities.get(key(p.name))||[]:[]).filter(cityFits),atAddress=(p.address?propertyAddresses.get(importAddressKey(p.address))||[]:[]).filter(cityFits);
     const namedAtAddress=atAddress.filter(row=>named.some(other=>other.id===row.id)),candidates=namedAtAddress.length?namedAtAddress:atAddress.length?atAddress:named;
     const byId=p.id?indexes.properties.get(text(p.id)):null;
     const reviewIdentity=message=>Object.assign(Error(message),{collection:'properties',field:p.id?'id':'designation',matchingKey,matches:p.id?[]:candidates.map(row=>({id:row.id,label:row.name,detail:[row.address,row.city].filter(Boolean).join(' · ')}))});
     // An ID identifies the property, but an address pointing to another known
     // property must never silently create or move its objects and agreements.
     if(p.id&&anchorProperty&&p.id!==anchorProperty.id)throw reviewIdentity('FastighetsID och objektets fastighet pekar på olika fastigheter. Importen får inte flytta en befintlig koppling.');
     const identified=byId||anchorProperty;
     if(identified&&atAddress.length&&!atAddress.some(row=>row.id===identified.id))throw reviewIdentity('FastighetsID och adress pekar på olika fastigheter. Kontrollera identifieraren eller adressen.');
     if(p.id&&!byId&&atAddress.length)throw reviewIdentity('Adressen finns redan med ett annat FastighetsID. Kontrollera identifieraren så att fastigheten inte skapas dubbelt.');
     const chosen=!p.id&&!anchorProperty&&candidates.length?approveProperty(candidates,p.address?'Adress':'Fastighetsnamn'):null;
     const existing=byId||anchorProperty||chosen;
     origin.matchingDecision={propertyId:existing?.id||text(p.id),method:chosen?'explicit-row-choice':p.id?'property-id':p.address?'property-address':'property-name',addressChecked:Boolean(p.address)};
     if(p.owner_party_id||linkedNumbers.has('owner'))p.owner_party_id=party(p.owner_party_id||existing?.owner_party_id,'owner');
     const incomingName=p.name&&(!existing||!p.address||importAddressKey(p.name)!==importAddressKey(p.address)||importAddressKey(existing.name)===importAddressKey(existing.address))?p.name:null;
     property=merge('properties',{...p,id:existing?.id||text(p.id)||'FAS-'+crypto.randomUUID(),name:incomingName||existing?.name||p.address||p.id},existing);
     origin.matchingDecision.propertyId=property.id;
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
     object=merge('objects',{...obj,id:object?.id||text(explicitObjectId)||'OBJ-'+hash(propertyId+'|'+raw.agreements.id),property_id:propertyId},object);
    }
    if(explicitObjectId||knownObject)checkpoint();recordStage='contracts';
    if(deferredError)throw deferredError;
    if(raw.agreements){
     const a=raw.agreements;if(!a.id)throw Error('Avtalet behöver AvtalsID (avtalsnumret) för säker återimport.');const existing=indexes.agreements.get(text(a.id));
     if(!object)throw Error('Avtalet saknar ObjektID.');
     if(a.tenant_party_id||linkedNumbers.has('tenant'))a.tenant_party_id=party(a.tenant_party_id||existing?.tenant_party_id,'tenant');
     const candidate={...existing,...a,id:existing?.id||text(a.id),object_id:object.id};
     agreement=merge('agreements',candidate,existing);
     for(const item of legacyAgreementItems({...finance,id:agreement.id,valid_from:agreement.valid_from,valid_to:agreement.valid_to},agreement.id,[origin],data.agreement_items))merge('agreement_items',item,indexes.agreement_items.get(item.id));
     validateFinance({agreement_items:data.agreement_items.filter(item=>item.agreement_id===agreement.id),recurring_costs:[],cost_evidence:[]});
    }
    checkpoint();recordStage='people';
    if(raw.people){
     const p=raw.people;if(p.party_id)p.party_id=party(p.party_id);const existing=p.id?indexes.people.get(text(p.id)):p.email?emails.get(key(p.email)):null;
     if(!existing&&!p.id&&!p.email)throw Error('Personregistret behöver PersonID eller e-post. Använd personroll för kontaktkolumner.');
     const saved=merge('people',{...p,id:existing?.id||text(p.id)||'PER-'+crypto.randomUUID()},existing);if(saved.email)emails.set(key(saved.email),saved);if(!personNames.has(key(saved.name)))personNames.set(key(saved.name),[]);if(!personNames.get(key(saved.name)).some(row=>row.id===saved.id))personNames.get(key(saved.name)).push(saved);
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
    for(const [type,row]of itemRows){
     const shared=raw.agreement_items||{},agreementId=shared.agreement_id||agreement?.id,labels=tables.agreement_items.fields.find(f=>f.key==='type').values;
     if(!agreementId||!indexes.agreements.has(agreementId))throw Error('Avtalsposten behöver ett befintligt AvtalsID.');
     const providedType=Object.keys(labels).find(key=>key===shared.type||labels[key]===shared.type);if(providedType&&providedType!==type)throw Error('Kolumnens avtalsposttyp skiljer sig från radens Typ. Välj En post per datarad eller rätt posttyp.');row.agreement_id=agreementId;
     const id=shared.id?(itemRows.size===1?shared.id:financialId(type,shared.id)):financialId(type,agreementId),existing=indexes.agreement_items.get(id);
     const candidate={...shared,...row,id,agreement_id:agreementId,name:row.name||shared.name||labels[type],adjustment_method:row.adjustment_method||shared.adjustment_method||existing?.adjustment_method||(profile.primaryTable==='agreementItems'?'none':['base','addition'].includes(type)?'kpi':'none'),sources:[origin]};
     if(!existing){candidate.valid_from ||= agreement?.valid_from||null;candidate.valid_to ||= agreement?.valid_to||null;}
     merge('agreement_items',candidate,existing);
    }
    if(itemRows.size)delete raw.agreement_items;
    for(const table of ['agreement_items','recurring_costs','cost_evidence'])if(raw[table]){recordStage=viewCollections[table];const row=raw[table];if(!row.id)throw Error(tables[table].label+' behöver ett beständigt ID för säker återimport.');for(const f of tables[table].fields)if(f.values&&row[f.key]!=null)row[f.key]=Object.entries(f.values).find(([,label])=>label===row[f.key])?.[0]||row[f.key];if(table==='agreement_items')row.agreement_id ||= agreement?.id;if(table==='recurring_costs')row.property_id ||= property?.id;merge(table,row,indexes[table].get(row.id));}
    for(const table of Object.keys(maintenanceTables))if(raw[table]){
     recordStage=viewCollections[table];const row=raw[table];if(!row.id)throw Error(tables[table].label+' behöver ett beständigt ID för säker återimport.');
     for(const f of tables[table].fields)if(f.values&&row[f.key]!=null)row[f.key]=Object.entries(f.values).find(([,label])=>label===row[f.key])?.[0]||row[f.key];
     merge(table,row,indexes[table].get(row.id));
    }
    for(const {column,values,errors=[]} of contacts.values()){
     if(!column)continue;
     const contactUndo=undo.length,contactChanges=changes.length,contactReviews=reviews.length,contactDecisions=decisions.length,peopleLength=data.people.length,contactsLength=data.contacts.length,contactTouched=new Map([...rowTouched].map(([table,ids])=>[table,new Set(ids)]));
     try{
     if(errors.length)throw Error(errors.join(' · '));
     if(!values.name)throw Error('Personuppgifter saknar namn. Koppla en namnkolumn för personrollen.');
     const originalPersonName=values.name,parsed=parsePersonIdentity(values.name,personFormat(column),indexes.people);
     values.name=parsed.name;
     if(!values.sourceId&&indexes.people.has(text(values.name))){values.sourceId=text(values.name);values.name=indexes.people.get(values.sourceId).name;}
     const descriptor=personRole(column.target),role=roles[descriptor.role],target=({property:property||indexes.properties.get(object?.property_id)||anchorProperty,contract:agreement,activity:issue,order})[descriptor.type];
     if(!target)throw Error('Kontaktkolumnen saknar identifierad fastighet, avtal eller ärende.');
     if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw Error('Ogiltig e-postadress i kontaktkolumnen.');
     const contactParty=role==='owner'?target.owner_party_id:role==='tenant'?target.tenant_party_id:data.parties.filter(p=>p.kind==='our').length===1?data.parties.find(p=>p.kind==='our').id:null;
     let person=values.sourceId?indexes.people.get(text(values.sourceId)):values.email?emails.get(key(values.email)):null;
     if(!values.sourceId&&!person){const matches=[...new Map([...(personNames.get(key(values.name))||[]),...(personNames.get(key(originalPersonName))||[])].filter(p=>!contactParty||!p.party_id||p.party_id===contactParty).map(p=>[p.id,p])).values()];if(matches.length>1)throw Error('Namnet tillhör flera personer. Koppla PersonID eller e-post.');person=matches[0];}
     if(values.sourceId&&values.email&&emails.has(key(values.email))&&emails.get(key(values.email)).id!==(person?.id||text(values.sourceId)))throw Error('PersonID och e-post pekar på olika personer.');
     if(!person&&values.sourceId&&[...(personNames.get(key(values.name))||[]),...(personNames.get(key(originalPersonName))||[])].some(p=>!contactParty||!p.party_id||p.party_id===contactParty))throw Error('Namnet finns redan med ett annat PersonID. Kontrollera personens identitet före koppling.');
     person=merge('people',{party_id:contactParty||person?.party_id,id:person?.id||text(values.sourceId)||'PER-'+crypto.randomUUID(),name:values.name,email:values.email,phone:values.phone},person);
     if(person.email)emails.set(key(person.email),person);if(!personNames.has(key(person.name)))personNames.set(key(person.name),[]);if(!personNames.get(key(person.name)).some(p=>p.id===person.id))personNames.get(key(person.name)).push(person);
     const f=targetField[descriptor.type],candidate={person_id:person.id,role,[f]:target.id,valid_from:values.fromDate||null,valid_to:values.toDate||null};
     const existing=data.contacts.find(row=>row.person_id===person.id&&row.role===role&&row[f]===target.id&&row.valid_from===candidate.valid_from&&row.valid_to===candidate.valid_to&&!row.cancelled);
     if(existing)touch('contacts',existing.id);
     if(!existing){if(data.contacts.some(row=>!row.cancelled&&row.role===role&&row[f]===target.id&&(role==='coordinator'||row.person_id===person.id)&&(!row.valid_to||!candidate.valid_from||row.valid_to>=candidate.valid_from)&&(!candidate.valid_to||!row.valid_from||candidate.valid_to>=row.valid_from)))throw Error('Personkopplingen överlappar en befintlig period.');merge('contacts',{...candidate,id:'KOP-'+crypto.randomUUID()},null);}
     }catch(error){
      for(const revert of undo.splice(contactUndo).reverse())revert();data.people.length=peopleLength;data.contacts.length=contactsLength;changes.length=contactChanges;reviews.length=contactReviews;decisions.length=contactDecisions;rebuild();
      rowTouched.clear();for(const [table,ids]of contactTouched)rowTouched.set(table,ids);
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
    rejected=!safe;if(rejected)rejectedRows++;
    for(const revert of undo.slice(safe?.undo||0).reverse())revert();for(const table of Object.keys(tables))data[table].length=(safe?.lengths||lengths)[table];changes.length=safe?.changes??startChanges;reviews.length=safe?.reviews??startReviews;decisions.length=safe?.decisions??startDecisions;rebuild();
    if(safe){rowTouched.clear();for(const [table,ids]of safe.touched)rowTouched.set(table,ids);readColumns.clear();for(const index of safe.read)readColumns.add(index);for(const column of selected)if(!readColumns.has(column.index))heldColumns.add(column.index);}
    const [collection,field]=fieldInProgress.split('.');
    const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,error.message,error.proposed])),kind:'canonical-conflict',status:'pending',...origin,collection:error.collection||collection||recordStage,field:error.field||field,recordId:error.recordId,current:error.current,proposed:error.proposed,reason:error.message,matches:error.matches,matchingKey:error.matchingKey,...(error.linkProposal?{linkProposal:true}:{}),column:error.column||columnInProgress?.header,columnIndex:error.columnIndex??columnInProgress?.index,value:error.value??sourceValues.find(v=>v.index===(error.columnIndex??columnInProgress?.index))?.raw,blocking:rejected,rowRejected:rejected,...(safe?{recordRejected:true}:{}),sourceValues};
    if(!review.recordId&&!review.linkProposal)review.reason+=' Rätta kolumnval eller identifierare före import.';
    reviews.push(review);decisions.push({...origin,collection:review.collection,classification:'D',reason:error.message});
   }
   if(!rejected)for(const review of reviews.slice(startReviews))if(!review.recordId&&!review.blocking&&!review.recordRejected){
    const table=Object.keys(viewCollections).find(table=>viewCollections[table]===review.collection);review.recordId=rowTouched.get(table)?.values().next().value;
    if(review.fieldRejected&&review.recordId){const field=fieldMap[review.collection+'.'+review.field]?.field;review.current=indexes[table].get(review.recordId)?.[field];}
   }
   if(!rejected)for(const [table,ids]of rowTouched)for(const id of ids)touched[table].add(id);
   for(const value of sourceValues){const stat=columnStats.get(profile).get(value.index);if(rejected||heldColumns.has(value.index)){if(present(value.raw))stat.skipped++;}else if(readColumns.has(value.index))stat.read++;}
  }
 }
 validateData(data);
 const consolidated=consolidateImportReviews(reviews);reviews.length=0;for(const review of consolidated)reviews.push(review);
 const affected=new Set(profiles.map(profile=>JSON.stringify([profile.fileName||context.fileName||'Excel',profile.name])));
 data.workspace.importReview=[...(data.workspace.importReview||[]).filter(row=>!affected.has(JSON.stringify([row.source,row.sheet]))),...reviews];
 data.workspace.importFieldPreferences=clone(context.preferences||data.workspace.importFieldPreferences||{});
 const recordStates={};
 const counts=Object.entries(viewCollections).map(([table,collection])=>{
  const old=new Map(prior[table].map(row=>[row.id,row]));recordStates[collection]=Object.create(null);let created=0,updated=0,unchanged=0;
  for(const record of data[table]){if(!touched[table].has(record.id))continue;const before=old.get(record.id);recordStates[collection][record.id]=!before?'created':JSON.stringify(before)!==JSON.stringify(record)?'updated':'unchanged';if(!before)created++;else if(JSON.stringify(before)!==JSON.stringify(record))updated++;else unchanged++;}
  return {collection,label:tables[table].label,created,updated,unchanged,review:reviews.filter(row=>row.collection===collection).length};
 });
 data.workspace.importMappings=[...(data.workspace.importMappings||[]).filter(saved=>!profiles.some(p=>saved.sheet===p.name&&saved.fileName===(p.fileName||context.fileName))),...profiles.map(p=>({sheet:p.name,fileName:p.fileName||context.fileName,signature:p.signature,layoutSignature:p.layoutSignature,primaryTable:p.primaryTable,columns:p.columns.map(c=>({...c,contactHeader:contactPart(c.target)?p.columns.find(other=>other.index===contactPart(c.target).index)?.header:undefined,samples:undefined,examples:undefined}))}))];
 const sourceName=context.fileName||'Excel';
 const recordChanges=new Map();for(const change of changes){const k=JSON.stringify([change.collection,change.recordId]);if(!recordChanges.has(k))recordChanges.set(k,[]);recordChanges.get(k).push(change);}
 const importedHistory=[...recordChanges.values()].map(entries=>({id:crypto.randomUUID(),collection:entries[0].collection,recordId:entries[0].recordId,action:'Exceluppgifter inlästa',at:new Date().toISOString(),by:context.actor||'Excelimport',fields:entries.map(({field,from,to,provenance})=>({field,from,to,provenance}))}));
 if(importedHistory.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),...importedHistory];
 data.workspace.sourceRegistry=[...(data.workspace.sourceRegistry||[]).filter(row=>row.name!==sourceName),{id:'SRC-'+hash(sourceName),name:sourceName,kind:'clean-import',sheets:profiles.map(p=>p.name).join(', '),rows:rowCount,created:counts.reduce((sum,row)=>sum+row.created,0),matched:counts.reduce((sum,row)=>sum+row.updated,0),review:reviews.length,importedAt:new Date().toISOString()}];
 if(changes.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),{id:crypto.randomUUID(),collection:'imports',recordId:'SRC-'+hash(sourceName),action:'Excelunderlag inläst',at:new Date().toISOString(),by:context.actor||'Excelimport',fields:[{field:'källa',to:sourceName},{field:'nya poster',to:counts.reduce((sum,row)=>sum+row.created,0)},{field:'kompletterade poster',to:counts.reduce((sum,row)=>sum+row.updated,0)}]}];
 data.workspace.sourceRegistry.find(row=>row.kind==='clean-import'&&row.name===sourceName).receipt={rows:rowCount,readRows:rowCount-rejectedRows,rejectedRows,partialRows:new Set(reviews.filter(row=>row.recordRejected).map(row=>JSON.stringify([row.source,row.sheet,row.row]))).size,columns:[...columnStats.values()].flatMap(columns=>[...columns.values()])};
 const result={clean:data,report:{tables:counts,recordStates,linkProposals,reviewIds:reviews.map(r=>r.id),sourceName,changes,decisions,review:reviews.length,blocking:new Set(reviews.filter(row=>row.blocking).map(row=>JSON.stringify([row.source,row.sheet,row.row]))).size,rows:rowCount}};
 refreshImportReceipt(result);return {...result,data:projectWorkspace(data)};
}
