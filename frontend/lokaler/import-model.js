import {importPreference} from '../services/import-preferences.js';
import {legacyFinanceFields,legacyFinanceMap,validateFinance} from './finance-model.js';
import {legacyAgreementItems} from './finance-revision.js';
import {tables,emptyData,normalize,validateData,idLabels} from './model.js';
import {viewFields,viewCollections} from './view-fields.js';
import {projectWorkspace} from './view-adapter.js';
import {interpretCell} from '../services/import-formats.js';
import {personRole,contactPart} from '../services/import-person-links.js';
const clone=value=>structuredClone(value),present=value=>value!==null&&value!==undefined&&value!=='';
const text=value=>String(value??'').trim(),key=value=>text(value).replace(/\s+/g,' ').toLocaleLowerCase('sv');
const validLink=value=>{try{const url=new URL(value);return /^https?:$/.test(url.protocol)&&!!url.hostname&&!/\s/.test(value);}catch{return false;}};
const hash=value=>{let h=2166136261;for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
export const importSchemas=Object.entries(viewCollections).map(([table,collection])=>({key:collection,sheet:tables[table].label,labelAliases:{...(table==='agreements'?{id:['Avtalsnummer','Avtals-ID','Avtal ID']}:{}),responsiblePersonId:['Ansvarig hos oss','Vår kontaktperson','Avtalsansvarig','Samordnare']},columns:[
 ['id',idLabels[table]],
 ...Object.entries(viewFields[table]).map(([field,legacy])=>[legacy,tables[table].fields.find(f=>f.key===field).label]),
 ...(table==='properties'?[['ownerResponsiblePersonId','Fastighetsägarens kontaktperson'],['responsiblePersonId','Samordnare']]:[]),
 ...(table==='agreements'?Object.entries(legacyFinanceMap).map(([field,target])=>[target,legacyFinanceFields[field]+' (avtalspost)']):[]),
 ...(table==='agreements'?[['propertyId','Fastighet'],['tenantName','Hyresgäst'],['responsiblePersonId','Samordnare'],['tenantResponsiblePersonId','Hyresgästens kontaktperson']]:[]),
 ...(['issues','orders'].includes(table)?[['responsiblePersonId','Vår ansvarige']]:[])
]}));
const fieldMap=Object.fromEntries(Object.entries(viewFields).flatMap(([table,fields])=>Object.entries(fields).map(([field,legacy])=>[viewCollections[table]+'.'+legacy,{table,field}])));
for(const table of Object.keys(viewCollections)){fieldMap[viewCollections[table]+'.id']={table,field:'id'};}
fieldMap['properties.sourceId']={table:'properties',field:'id'};fieldMap['objects.number']={table:'objects',field:'id'};fieldMap['people.sourceId']={table:'people',field:'id'};
// Older saved mappings may name the same input number; it resolves to the sole AvtalsID.
fieldMap['contracts.number']={table:'agreements',field:'id'};
fieldMap['contracts.propertyId']={table:'properties',field:'id'};
fieldMap['contracts.tenantName']={table:'agreements',field:'tenant_party_id'};
for(const [field,target]of Object.entries(legacyFinanceMap))fieldMap['contracts.'+target]={table:'agreements',field,finance:true};
const targetField={property:'property_id',contract:'agreement_id',activity:'issue_id',order:'order_id'};
const roles={our:'coordinator',owner:'owner',tenant:'tenant'};
export function cleanProfiles(prepared){
 const allowed=new Set(importSchemas.flatMap(s=>s.columns.map(([field])=>s.key+'.'+field)));
 return prepared.profiles.map(profile=>({...profile,columns:profile.columns.map(column=>{
  const ownTable=Object.keys(tables).find(table=>['agreement_items','recurring_costs','cost_evidence'].includes(table)&&key(tables[table].label)===key(profile.name));
  const ownSpec=ownTable&&tables[ownTable];
  const ownField=ownSpec?.fields.find(f=>key(f.type==='ref'?idLabels[f.table]:f.label)===key(column.header));
  const directTarget=ownTable&&(key(column.header)===key(idLabels[ownTable])?viewCollections[ownTable]+'.id':ownField?viewCollections[ownTable]+'.'+viewFields[ownTable][ownField.key]:null);
  let target=column.approved?column.target:directTarget||column.target;
  const normalized=key(column.header).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const aliases={samordnare:'properties.responsiblePersonId',avtalsansvarig:'contracts.responsiblePersonId',hyresgastenskontaktperson:'contracts.tenantResponsiblePersonId',fastighetsagarenskontaktperson:'properties.ownerResponsiblePersonId',verksamhetenskontaktperson:'contracts.tenantResponsiblePersonId',fastighetsid:'properties.id',objektid:'objects.id',arendeid:'activities.id',bestallningsid:'orders.id',partid:'organizations.id',avtalsid:'contracts.id',avtalsnummer:'contracts.id',verksamhet:'contracts.business',verksamhetsnamn:'contracts.business',namnpaverksamheten:'contracts.business',varansvarige:'properties.responsiblePersonId',kommentarverksamhet:'contracts.business',arbetsplatser:'contracts.workplaceCount',antalarbetsplatser:'contracts.workplaceCount',hubbplatser:'contracts.hubCount',antalhubbplatser:'contracts.hubCount',personid:'people.id',popularnamn:'properties.popularName',antallagenheter:'objects.apartmentCount',lagenheter:'objects.apartmentCount',lagenheteryta:'objects.apartmentArea',lokalkategorieb:'contracts.category',lokalkategorileb:'contracts.category',anvandning:'contracts.use',lankavtalhuvudkontrakt:'contracts.contractDocumentUrl'};
  if(!column.approved&&!['agreementItems','recurringCosts','costEvidence'].includes(target?.split('.')[0]))target=aliases[normalized]||target;
  if(!column.approved&&normalized==='objektsnummerforvaltningsobjekt')target='@unmapped';
  target=({'contracts.number':'contracts.id','properties.sourceId':'properties.id','objects.number':'objects.id','people.sourceId':'people.id'})[target]||target;
  if(['contracts.businessName','contracts.businessComment'].includes(target))target='contracts.business';
  if(target==='contracts.area')target='objects.area';
  if(!column.approved&&target==='properties.responsiblePersonId'){const type=/beställ|order/i.test(profile.name)?'orders':/ärende|aktivitet/i.test(profile.name)?'activities':/avtal/i.test(profile.name)?'contracts':'properties';if(['contracts','activities','orders'].includes(type))target=type+'.responsiblePersonId';}
  return {...column,target:allowed.has(target)||personRole(target)||contactPart(target)||target==='@ignore'?target:'@unmapped'};
 })}));
}
export function prepareCleanImport(workbook,profiles,base=emptyData(),context={},XLSX){
 const data=clone(base),changes=[],decisions=[],reviews=[];
 data.workspace ||= {};if(context.preferences)data.workspace.importFieldPreferences=clone(context.preferences);const prior=clone(data);let rowCount=0;
 let indexes,partyNames,propertyNames,emails,personNames;
 const rebuild=()=>{
  indexes=Object.fromEntries(Object.keys(tables).map(table=>[table,new Map(data[table].map(row=>[row.id,row]))]));
  partyNames=new Map(data.parties.map(row=>[key(row.name),row]));
  propertyNames=new Map(data.properties.map(row=>[key(row.name)+'|'+key(row.address),row]));
  emails=new Map(data.people.filter(row=>row.email).map(row=>[key(row.email),row]));
  personNames=new Map();for(const person of data.people){const k=key(person.name);if(!personNames.has(k))personNames.set(k,[]);personNames.get(k).push(person);}
 };rebuild();
 const rank=profile=>Math.min(...profile.columns.map(c=>{const m=fieldMap[c.target];return m&&viewCollections[m.table]===c.target.split('.')[0]?['parties','properties','people','objects','agreements','issues','orders','agreement_items','recurring_costs','cost_evidence'].indexOf(m.table):99;}));
 const priority=profile=>profile.columns.filter(column=>importPreference(data.workspace.importFieldPreferences,...column.target.split('.'),profile.fileName||context.fileName,profile,column)==='accept').length;
 for(const profile of [...profiles].sort((a,b)=>rank(a)-rank(b)||priority(b)-priority(a)||JSON.stringify([a.fileName||context.fileName,a.name]).localeCompare(JSON.stringify([b.fileName||context.fileName,b.name]),'sv'))){
  const sheet=workbook.Sheets[profile.sheetKey||profile.name];if(!sheet?.['!ref'])continue;
  const range=XLSX.utils.decode_range(sheet['!ref']);
  for(let r=profile.headerRow;r<=range.e.r;r++){
   const selected=profile.columns.filter(column=>!column.target.startsWith('@'));
   if(!selected.some(column=>present(sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v)))continue;
   if(++rowCount>20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');
   const lengths=Object.fromEntries(Object.keys(tables).map(table=>[table,data[table].length])),undo=[],startChanges=changes.length,startReviews=reviews.length,startDecisions=decisions.length;
   const source=profile.fileName||context.fileName||'Excel',origin={source,sheet:profile.name,row:r+1};
   const raw={},contacts=new Map(),sourceValues=selected.map(column=>{const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];return {column:column.header,index:column.index,target:column.target,raw:cell?.v??'',hyperlink:cell?.l?.Target};});let fieldInProgress='',columnInProgress=null;const finance={};
   const originFor=(table,field)=>{const column=selected.find(c=>fieldMap[c.target]?.table===table&&fieldMap[c.target]?.field===field);return {column:column?.header,columnIndex:column?.index,collection:viewCollections[table]||table,field:viewFields[table]?.[field]||field};};
   const merge=(table,record,existing)=>{
    const previous=existing?{...existing}:null;
    const values={...existing,...Object.fromEntries(Object.entries(record).filter(([,value])=>present(value)))};
    let normalized;try{normalized=normalize(table,values);}catch(error){const field=error.message.startsWith('ID ')?'id':error.message.startsWith('Slutdatum')?'valid_to':error.message.startsWith('Tidplanens')?'planned_to':tables[table].fields.find(f=>error.message.startsWith(f.label))?.key;const at=originFor(table,field);Object.assign(error,{...at,value:field?record[field]:null});throw error;}
    if(normalized.sources&&existing?.sources)normalized.sources=[...new Map([...existing.sources,...normalized.sources].map(source=>[JSON.stringify(source),source])).values()];
    if(existing)for(const field of Object.keys(record)){const value=normalized[field];if(field!=='id'&&field!=='sources'&&present(record[field])&&present(existing[field])&&JSON.stringify(existing[field])!==JSON.stringify(value)){
     const legacy=viewFields[table]?.[field]||field,collection=viewCollections[table]||table;
     const selectedTarget=selected.find(c=>fieldMap[c.target]?.table===table&&fieldMap[c.target]?.field===field)?.target.split('.')[1]||legacy;
     const inputColumn=selected.find(c=>fieldMap[c.target]?.table===table&&fieldMap[c.target]?.field===field);
     const rule=importPreference(data.workspace.importFieldPreferences,collection,selectedTarget,source,profile,inputColumn);
     if(tables[table].fields.find(f=>f.key===field)?.type==='ref'){const error=Error('Olika värden för '+(tables[table].fields.find(f=>f.key===field)?.label||field)+'. Importen får inte flytta en befintlig koppling.');Object.assign(error,{collection,field:legacy,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value});throw error;}
     if(typeof value==='string'&&typeof existing[field]==='string'&&['properties','parties','people'].includes(table)&&['name','address','city','popular_name'].includes(field)&&key(value.normalize('NFKC'))===key(existing[field].normalize('NFKC'))){normalized[field]=existing[field];continue;}
     if(rule==='reject'){normalized[field]=existing[field];continue;}
     if(field==='name'&&existing.name===existing.id)continue;
     if(rule!=='accept'&&table==='properties'&&raw.properties?.id&&['name','address','city','popular_name'].includes(field)){
      const reason='Olika värden för '+tables[table].fields.find(f=>f.key===field).label;
      const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,collection,field,value])),kind:'canonical-conflict',status:'pending',...origin,collection,field:legacy,recordId:existing.id,column:inputColumn?.header,columnIndex:inputColumn?.index,current:existing[field],proposed:value,reason,blocking:false,rowRejected:false};
      reviews.push(review);decisions.push({...origin,collection,classification:'B',reason});normalized[field]=existing[field];continue;
     }
     if(rule!=='accept'){const error=Error('Olika värden för '+(tables[table].fields.find(f=>f.key===field)?.label||field));Object.assign(error,{collection,field:legacy,recordId:existing.id,current:existing[field],proposed:value,column:inputColumn?.header,columnIndex:inputColumn?.index});throw error;}
    }
    }
    if(table==='parties'&&data.parties.some(p=>p.id!==normalized.id&&key(p.name)===key(normalized.name)))throw Error('PartID och partens namn pekar på olika parter.');
    const fits=(agreement,object)=>(!object.valid_from||agreement.valid_from&&agreement.valid_from>=object.valid_from)&&(!object.valid_to||agreement.valid_to&&agreement.valid_to<=object.valid_to);
    if(table==='agreements'&&indexes.objects.has(normalized.object_id)&&!fits(normalized,indexes.objects.get(normalized.object_id)))throw Object.assign(Error('Avtalets period måste rymmas inom objektets giltighetstid.'),originFor(table,'valid_to'));
    if(table==='objects'&&data.agreements.some(a=>a.object_id===normalized.id&&!fits(a,normalized)))throw Object.assign(Error('Objektets period skulle lämna ett befintligt avtal utan giltigt objekt.'),originFor(table,'valid_to'));
    if(table==='people'&&normalized.email&&data.people.some(p=>p.id!==normalized.id&&key(p.email)===key(normalized.email)))throw Error('E-post och PersonID pekar på olika personer.');
    for(const f of tables[table].fields)if(f.type==='ref'&&normalized[f.key]&&!indexes[f.table].has(normalized[f.key]))throw Object.assign(Error(f.label+' hänvisar till ett ID som saknas.'),originFor(table,f.key));
    if(existing){const before=clone(existing);undo.push(()=>{for(const k of Object.keys(existing))delete existing[k];Object.assign(existing,before);});Object.assign(existing,normalized);}
    else{data[table].push(normalized);indexes[table].set(normalized.id,normalized);existing=normalized;}
    for(const [field] of Object.entries(record))if(field!=='id'&&JSON.stringify(previous?.[field])!==JSON.stringify(existing[field]))changes.push({collection:viewCollections[table]||table,recordId:existing.id,field:viewFields[table]?.[field]||field,from:previous?.[field]??null,to:existing[field],provenance:origin});
    return existing;
   };
   const party=(value,kind)=>{
    if(!present(value))return null;
    const existing=indexes.parties.get(text(value))||partyNames.get(key(value));
    if(existing)return existing.id;
    const row=merge('parties',{id:'PAR-'+crypto.randomUUID(),name:text(value),kind},null);partyNames.set(key(value),row);return row.id;
   };
   try{
    for(const column of selected){
     fieldInProgress=column.target;columnInProgress=column;
     const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];if(cell?.f&&!present(cell?.v))throw Error('Formeln saknar beräknat värde.');if(!present(cell?.v)&&!cell?.l?.Target)continue;
     const role=personRole(column.target),part=contactPart(column.target),mapping=fieldMap[column.target];
     let value;
     if(role||part&&['email','phone','sourceId'].includes(part.field))value=text(interpretCell(cell,{...column,target:'people.'+(part?.field||'name')},XLSX));
     else if(part)value=interpretCell(cell,{...column,target:'assignments.'+part.field,emptyMarkers:true},XLSX);
     else if(mapping){
      const spec=mapping.finance?{type:/method|basis/.test(mapping.field)?'text':'number'}:tables[mapping.table].fields.find(f=>f.key===mapping.field);
      const target=spec?.type==='date'?'dates.'+(/to$|end$/.test(mapping.field)?'end':'start'):['number','integer','coordinate','signed'].includes(spec?.type)?(['annual_rent','annual_additions','annual_property_tax'].includes(mapping.field)?column.target:'objects.area'):column.target;
      value=interpretCell(cell,{...column,target,emptyMarkers:true},XLSX);
     }else continue;
     const spec=mapping&&tables[mapping.table].fields.find(f=>f.key===mapping.field);
     if(spec?.type==='url'&&present(value)&&!validLink(value)){
      if(column.invalidPolicy!=='review-field')throw Error(spec.label+' måste vara en fullständig länk som börjar med https:// eller http://.');
      const at=originFor(mapping.table,mapping.field),reason=spec.label+' är inte en fullständig webblänk';
      reviews.push({id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,column.index,value])),kind:'canonical-conflict',status:'pending',...origin,...at,column:column.header,columnIndex:column.index,value,reason,blocking:false,rowRejected:false});decisions.push({...origin,collection:at.collection,classification:'B',reason});continue;
     }
     if(mapping?.field==='index_share'&&value>1&&value<=100)value/=100;
     if(!present(value))continue;
     if(mapping&&tables[mapping.table].fields.find(f=>f.key===mapping.field)?.type==='text'&&typeof value!=='string')value=String(value);
     if(role){if(!contacts.has(column.index))contacts.set(column.index,{column,values:{}});contacts.get(column.index).values.name=value;}
     else if(part){if(!contacts.has(part.index))contacts.set(part.index,{column:profile.columns.find(c=>c.index===part.index),values:{}});contacts.get(part.index).values[part.field]=value;}
     else if(mapping.finance){finance[mapping.field]=value;raw.agreements ||= {};}
     else{raw[mapping.table] ||= {};if(present(raw[mapping.table][mapping.field])&&raw[mapping.table][mapping.field]!==value)throw Error('Två kolumner ger olika identifierare eller värden.');raw[mapping.table][mapping.field]=value;}
    }
    let property=null,object=null,agreement=null,issue=null,order=null;
    if(raw.parties){const p=raw.parties,existing=p.id?indexes.parties.get(text(p.id)):partyNames.get(key(p.name));const saved=merge('parties',{...p,id:existing?.id||text(p.id)||'PAR-'+crypto.randomUUID()},existing);partyNames.set(key(saved.name),saved);}
    if(raw.properties){
     const p=raw.properties;if(p.owner_party_id)p.owner_party_id=party(p.owner_party_id,'owner');
     const existing=p.id?indexes.properties.get(text(p.id)):propertyNames.get(key(p.name||p.address)+'|'+key(p.address));
     property=merge('properties',{...p,id:existing?.id||text(p.id)||'FAS-'+crypto.randomUUID(),name:p.name||existing?.name||p.address||p.id},existing);
     propertyNames.set(key(property.name)+'|'+key(property.address),property);
    }
    const obj=raw.objects||{};
    const explicitObjectId=obj.id||raw.agreements?.object_id||raw.issues?.object_id;
    object=explicitObjectId?indexes.objects.get(text(explicitObjectId)):null;
    if(!object&&raw.agreements?.id)object=indexes.objects.get(indexes.agreements.get(text(raw.agreements.id))?.object_id);
    if(raw.objects||raw.agreements){
     const propertyId=obj.property_id||property?.id||object?.property_id;
     if(!propertyId||!indexes.properties.has(propertyId))throw Error('Objektet saknar ett befintligt FastighetsID.');
     if(!object&&!explicitObjectId&&!raw.agreements?.id)throw Error('Välj ObjektID eller AvtalsID för att identifiera objektet.');
     object=merge('objects',{...obj,id:object?.id||text(explicitObjectId)||'OBJ-'+hash(propertyId+'|'+raw.agreements.id),property_id:propertyId},object);
    }
    if(raw.agreements){
     const a=raw.agreements;if(!a.id)throw Error('Avtalet behöver AvtalsID (avtalsnumret) för säker återimport.');const existing=indexes.agreements.get(text(a.id));
     if(!object)throw Error('Avtalet saknar ObjektID.');
     if(a.tenant_party_id)a.tenant_party_id=party(a.tenant_party_id,'tenant');
     const candidate={...existing,...a,id:existing?.id||text(a.id),object_id:object.id};
     if(data.agreements.some(row=>row.id!==candidate.id&&row.object_id===object.id&&(!row.valid_to||!candidate.valid_from||row.valid_to>=candidate.valid_from)&&(!candidate.valid_to||!row.valid_from||candidate.valid_to>=row.valid_from)))throw Error('Objektet har redan ett avtal under perioden.');
     agreement=merge('agreements',candidate,existing);
     for(const item of legacyAgreementItems({...finance,id:agreement.id,valid_from:agreement.valid_from,valid_to:agreement.valid_to},agreement.id,[origin],data.agreement_items))merge('agreement_items',item,indexes.agreement_items.get(item.id));
    }
    if(raw.people){
     const p=raw.people;if(p.party_id)p.party_id=party(p.party_id);const existing=p.id?indexes.people.get(text(p.id)):p.email?emails.get(key(p.email)):null;
     if(!existing&&!p.id&&!p.email)throw Error('Personregistret behöver PersonID eller e-post. Använd personroll för kontaktkolumner.');
     const saved=merge('people',{...p,id:existing?.id||text(p.id)||'PER-'+crypto.randomUUID()},existing);if(saved.email)emails.set(key(saved.email),saved);if(!personNames.has(key(saved.name)))personNames.set(key(saved.name),[]);if(!personNames.get(key(saved.name)).some(row=>row.id===saved.id))personNames.get(key(saved.name)).push(saved);
    }
    if(raw.issues){
     const a=raw.issues;if(!a.id)throw Error('Ärendet behöver ÄrendeID för säker återimport.');
     const existing=indexes.issues.get(text(a.id));
     a.status=({Nytt:'open',Öppet:'open',Pågår:'ongoing',Klar:'done',Klart:'done',Avslutad:'done'})[a.status]||a.status;
     a.priority=({Låg:'low',Medel:'normal',Normal:'normal',Hög:'high'})[a.priority]||a.priority;
     const objectId=a.object_id||object?.id;
     issue=merge('issues',{...a,id:text(a.id),object_id:objectId||null,property_id:objectId?null:a.property_id||property?.id||existing?.property_id},existing);
    }
    if(raw.orders){const o=raw.orders;if(!o.id)throw Error('Beställningen behöver ett ID.');o.issue_id ||= issue?.id;if(!indexes.issues.has(o.issue_id))throw Error('Beställningen behöver ett befintligt ÄrendeID.');o.status=({Planerad:'draft',Beställd:'ordered',Klar:'done'})[o.status]||o.status;order=merge('orders',o,indexes.orders.get(o.id));}
    for(const table of ['agreement_items','recurring_costs','cost_evidence'])if(raw[table]){const row=raw[table];if(!row.id)throw Error(tables[table].label+' behöver ett beständigt ID för säker återimport.');for(const f of tables[table].fields)if(f.values&&row[f.key]!=null)row[f.key]=Object.entries(f.values).find(([,label])=>label===row[f.key])?.[0]||row[f.key];if(table==='agreement_items')row.agreement_id ||= agreement?.id;if(table==='recurring_costs')row.property_id ||= property?.id;merge(table,row,indexes[table].get(row.id));}
    for(const {column,values} of contacts.values()){
     if(!column||!values.name)continue;
     const descriptor=personRole(column.target),role=roles[descriptor.role],target=({property,contract:agreement,activity:issue,order})[descriptor.type];
     if(!target)throw Error('Kontaktkolumnen saknar identifierad fastighet, avtal eller ärende.');
     if(values.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email))throw Error('Ogiltig e-postadress i kontaktkolumnen.');
     const contactParty=role==='owner'?target.owner_party_id:role==='tenant'?target.tenant_party_id:data.parties.filter(p=>p.kind==='our').length===1?data.parties.find(p=>p.kind==='our').id:null;
     let person=values.sourceId?indexes.people.get(text(values.sourceId)):values.email?emails.get(key(values.email)):null;
     if(!values.sourceId&&!values.email){if(column.personIdentity!=='name')throw Error('Bekräfta att namnkolumnen identifierar unika personer, eller koppla PersonID/e-post.');const matches=(personNames.get(key(values.name))||[]).filter(p=>!contactParty||!p.party_id||p.party_id===contactParty);if(matches.length>1)throw Error('Namnet tillhör flera personer. Koppla PersonID eller e-post.');person=matches[0];}
     if(values.sourceId&&values.email&&emails.has(key(values.email))&&emails.get(key(values.email)).id!==(person?.id||text(values.sourceId)))throw Error('PersonID och e-post pekar på olika personer.');
     person=merge('people',{party_id:contactParty||person?.party_id,id:person?.id||text(values.sourceId)||'PER-'+crypto.randomUUID(),name:values.name,email:values.email,phone:values.phone},person);
     if(person.email)emails.set(key(person.email),person);if(!personNames.has(key(person.name)))personNames.set(key(person.name),[]);if(!personNames.get(key(person.name)).some(p=>p.id===person.id))personNames.get(key(person.name)).push(person);
     const f=targetField[descriptor.type],candidate={person_id:person.id,role,[f]:target.id,valid_from:values.fromDate||null,valid_to:values.toDate||null};
     const existing=data.contacts.find(row=>row.person_id===person.id&&row.role===role&&row[f]===target.id&&row.valid_from===candidate.valid_from&&row.valid_to===candidate.valid_to&&!row.cancelled);
     if(!existing){if(data.contacts.some(row=>!row.cancelled&&row.role===role&&row[f]===target.id&&(role==='coordinator'||row.person_id===person.id)&&(!row.valid_to||!candidate.valid_from||row.valid_to>=candidate.valid_from)&&(!candidate.valid_to||!row.valid_from||candidate.valid_to>=row.valid_from)))throw Error('Personkopplingen överlappar en befintlig period.');merge('contacts',{...candidate,id:'KOP-'+crypto.randomUUID()},null);}
    }
    for(const review of reviews.slice(startReviews))if(!review.recordId&&!review.blocking)review.recordId=({properties:property,contracts:agreement,objects:object,activities:issue,orders:order})[review.collection]?.id;
    if(Object.keys(finance).length||raw.agreement_items||raw.recurring_costs||raw.cost_evidence){
     const agreementId=agreement?.id||raw.agreement_items?.agreement_id,costId=raw.cost_evidence?.cost_id||raw.recurring_costs?.id;
     validateFinance({agreement_items:agreementId?data.agreement_items.filter(x=>x.agreement_id===agreementId):[],recurring_costs:costId?data.recurring_costs.filter(x=>x.id===costId):[],cost_evidence:costId?data.cost_evidence.filter(x=>x.cost_id===costId):[]});
    }
   }catch(error){
    for(const revert of undo.reverse())revert();for(const table of Object.keys(tables))data[table].length=lengths[table];changes.length=startChanges;reviews.length=startReviews;decisions.length=startDecisions;rebuild();
    const [collection,field]=fieldInProgress.split('.');
    const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,error.message,error.proposed])),kind:'canonical-conflict',status:'pending',...origin,collection:error.collection||collection,field:error.field||field,recordId:error.recordId,current:error.current,proposed:error.proposed,reason:error.message,column:error.column||columnInProgress?.header,columnIndex:error.columnIndex??columnInProgress?.index,value:error.value??sourceValues.find(v=>v.index===(error.columnIndex??columnInProgress?.index))?.raw,blocking:true,rowRejected:true,sourceValues};
    if(!review.recordId)review.reason+=' Rätta kolumnval eller identifierare före import.';
    reviews.push(review);decisions.push({...origin,collection:review.collection,classification:'D',reason:error.message});
   }
  }
 }
 validateData(data);
 const affected=new Set(profiles.map(profile=>profile.fileName||context.fileName));
 data.workspace.importReview=[...(data.workspace.importReview||[]).filter(row=>!affected.has(row.source)),...reviews];
 data.workspace.importFieldPreferences=clone(context.preferences||data.workspace.importFieldPreferences||{});
 const counts=Object.entries(viewCollections).map(([table,collection])=>{
  const old=new Map(prior[table].map(row=>[row.id,row]));let created=0,updated=0,unchanged=0;
  for(const record of data[table]){const before=old.get(record.id);if(!before)created++;else if(JSON.stringify(before)!==JSON.stringify(record))updated++;else unchanged++;}
  return {collection,label:tables[table].label,created,updated,unchanged,review:reviews.filter(row=>row.collection===collection).length};
 });
 data.workspace.importMappings=[...(data.workspace.importMappings||[]).filter(saved=>!profiles.some(p=>saved.sheet===p.name&&saved.fileName===(p.fileName||context.fileName))),...profiles.map(p=>({sheet:p.name,fileName:p.fileName||context.fileName,signature:p.signature,layoutSignature:p.layoutSignature,columns:p.columns.map(c=>({...c,contactHeader:contactPart(c.target)?p.columns.find(other=>other.index===contactPart(c.target).index)?.header:undefined,samples:undefined,examples:undefined}))}))];
 const sourceName=context.fileName||'Excel';
 const recordChanges=new Map();for(const change of changes){const k=JSON.stringify([change.collection,change.recordId]);if(!recordChanges.has(k))recordChanges.set(k,[]);recordChanges.get(k).push(change);}
 const importedHistory=[...recordChanges.values()].map(entries=>({id:crypto.randomUUID(),collection:entries[0].collection,recordId:entries[0].recordId,action:'Exceluppgifter inlästa',at:new Date().toISOString(),by:context.actor||'Excelimport',fields:entries.map(({field,from,to,provenance})=>({field,from,to,provenance}))}));
 if(importedHistory.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),...importedHistory];
 data.workspace.sourceRegistry=[...(data.workspace.sourceRegistry||[]).filter(row=>row.name!==sourceName),{id:'SRC-'+hash(sourceName),name:sourceName,kind:'clean-import',sheets:profiles.map(p=>p.name).join(', '),rows:rowCount,created:counts.reduce((sum,row)=>sum+row.created,0),matched:counts.reduce((sum,row)=>sum+row.updated,0),review:reviews.length,importedAt:new Date().toISOString()}];
 if(changes.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),{id:crypto.randomUUID(),collection:'imports',recordId:'SRC-'+hash(sourceName),action:'Excelunderlag inläst',at:new Date().toISOString(),by:context.actor||'Excelimport',fields:[{field:'källa',to:sourceName},{field:'nya poster',to:counts.reduce((sum,row)=>sum+row.created,0)},{field:'kompletterade poster',to:counts.reduce((sum,row)=>sum+row.updated,0)}]}];
 return {clean:data,data:projectWorkspace(data),report:{tables:counts,changes,decisions,review:reviews.length,blocking:new Set(reviews.filter(row=>row.blocking).map(row=>JSON.stringify([row.source,row.sheet,row.row]))).size,rows:rowCount}};
}
