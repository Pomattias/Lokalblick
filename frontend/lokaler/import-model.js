import {tables,emptyData,normalize,validateData,idLabels} from './model.js';
import {viewFields,viewCollections} from './view-fields.js';
import {projectWorkspace} from './view-adapter.js';
import {interpretCell} from '../services/import-formats.js';
import {personRole,contactPart} from '../services/import-person-links.js';
const clone=value=>structuredClone(value),present=value=>value!==null&&value!==undefined&&value!=='';
const text=value=>String(value??'').trim(),key=value=>text(value).replace(/\s+/g,' ').toLocaleLowerCase('sv');
const hash=value=>{let h=2166136261;for(const char of value){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
export const importSchemas=Object.entries(viewCollections).map(([table,collection])=>({key:collection,sheet:tables[table].label,labelAliases:{...(table==='agreements'?{id:['Avtalsnummer','Avtals-ID','Avtal ID']}:{}),responsiblePersonId:['Ansvarig hos oss','Vår kontaktperson','Avtalsansvarig','Samordnare']},columns:[
 ['id',idLabels[table]],
 ...Object.entries(viewFields[table]).map(([field,legacy])=>[legacy,tables[table].fields.find(f=>f.key===field).label]),
 ...(table==='properties'?[['ownerResponsiblePersonId','Fastighetsägarens kontaktperson'],['responsiblePersonId','Samordnare']]:[]),
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
const targetField={property:'property_id',contract:'agreement_id',activity:'issue_id',order:'order_id'};
const roles={our:'coordinator',owner:'owner',tenant:'tenant'};
export function cleanProfiles(prepared){
 const allowed=new Set(importSchemas.flatMap(s=>s.columns.map(([field])=>s.key+'.'+field)));
 return prepared.profiles.map(profile=>({...profile,columns:profile.columns.map(column=>{
  let target=column.target;
  const normalized=key(column.header).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  const aliases={samordnare:'properties.responsiblePersonId',avtalsansvarig:'contracts.responsiblePersonId',hyresgastenskontaktperson:'contracts.tenantResponsiblePersonId',fastighetsagarenskontaktperson:'properties.ownerResponsiblePersonId',verksamhetenskontaktperson:'contracts.tenantResponsiblePersonId',fastighetsid:'properties.id',objektid:'objects.id',arendeid:'activities.id',bestallningsid:'orders.id',partid:'organizations.id',avtalsid:'contracts.id',avtalsnummer:'contracts.id',verksamhet:'contracts.business',verksamhetsnamn:'contracts.business',namnpaverksamheten:'contracts.business',varansvarige:'properties.responsiblePersonId',kommentarverksamhet:'contracts.business',arbetsplatser:'contracts.workplaceCount',antalarbetsplatser:'contracts.workplaceCount',hubbplatser:'contracts.hubCount',antalhubbplatser:'contracts.hubCount',personid:'people.id',popularnamn:'properties.popularName',antallagenheter:'objects.apartmentCount',lagenheter:'objects.apartmentCount',lagenheteryta:'objects.apartmentArea',lokalkategorieb:'contracts.category',lokalkategorileb:'contracts.category',anvandning:'contracts.use',lankavtalhuvudkontrakt:'contracts.contractDocumentUrl'};
  target=aliases[normalized]||target;
  target=({'contracts.number':'contracts.id','properties.sourceId':'properties.id','objects.number':'objects.id','people.sourceId':'people.id'})[target]||target;
  if(['contracts.businessName','contracts.businessComment'].includes(target))target='contracts.business';
  if(target==='contracts.area')target='objects.area';
  if(target==='properties.responsiblePersonId'){const type=/beställ|order/i.test(profile.name)?'orders':/ärende|aktivitet/i.test(profile.name)?'activities':/avtal/i.test(profile.name)?'contracts':'properties';if(['contracts','activities','orders'].includes(type))target=type+'.responsiblePersonId';}
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
 const rank=profile=>Math.min(...profile.columns.map(c=>{const m=fieldMap[c.target];return m&&viewCollections[m.table]===c.target.split('.')[0]?['parties','properties','people','objects','agreements','issues','orders'].indexOf(m.table):99;}));
 for(const profile of [...profiles].sort((a,b)=>rank(a)-rank(b))){
  const sheet=workbook.Sheets[profile.sheetKey||profile.name];if(!sheet?.['!ref'])continue;
  const range=XLSX.utils.decode_range(sheet['!ref']);
  for(let r=profile.headerRow;r<=range.e.r;r++){
   const selected=profile.columns.filter(column=>!column.target.startsWith('@'));
   if(!selected.some(column=>present(sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v)))continue;
   if(++rowCount>20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');
   const lengths=Object.fromEntries(Object.keys(tables).map(table=>[table,data[table].length])),undo=[],startChanges=changes.length;
   const source=profile.fileName||context.fileName||'Excel',origin={source,sheet:profile.name,row:r+1};
   const raw={},contacts=new Map();let fieldInProgress='';
   const merge=(table,record,existing)=>{
    const previous=existing?{...existing}:null;
    const values={...existing,...Object.fromEntries(Object.entries(record).filter(([,value])=>present(value)))};
    if(existing)for(const [field,value] of Object.entries(record))if(field!=='id'&&present(value)&&present(existing[field])&&JSON.stringify(existing[field])!==JSON.stringify(value)){
     const legacy=viewFields[table]?.[field]||field,collection=viewCollections[table]||table;
     const selectedTarget=selected.find(c=>fieldMap[c.target]?.table===table&&fieldMap[c.target]?.field===field)?.target.split('.')[1]||legacy;
     const rule=data.workspace.importFieldPreferences?.[[collection,selectedTarget,source].map(key).join('|')];
     if(rule==='reject'){values[field]=existing[field];continue;}
     if(field==='name'&&existing.name===existing.id)continue;
     if(rule!=='accept'){const error=Error('Olika värden för '+(tables[table].fields.find(f=>f.key===field)?.label||field));Object.assign(error,{collection,field:legacy,recordId:existing.id,current:existing[field],proposed:value});throw error;}
    }
    const normalized=normalize(table,values);
    if(table==='people'&&normalized.email&&data.people.some(p=>p.id!==normalized.id&&key(p.email)===key(normalized.email)))throw Error('E-post och PersonID pekar på olika personer.');
    for(const f of tables[table].fields)if(f.type==='ref'&&normalized[f.key]&&!indexes[f.table].has(normalized[f.key]))throw Error(f.label+' hänvisar till ett ID som saknas.');
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
     fieldInProgress=column.target;
     const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];if(!present(cell?.v))continue;
     const role=personRole(column.target),part=contactPart(column.target),mapping=fieldMap[column.target];
     let value;
     if(role||part&&['email','phone','sourceId'].includes(part.field))value=text(interpretCell(cell,{...column,target:'people.'+(part?.field||'name')},XLSX));
     else if(part)value=interpretCell(cell,{...column,target:'assignments.'+part.field,emptyMarkers:true},XLSX);
     else if(mapping){
      const spec=tables[mapping.table].fields.find(f=>f.key===mapping.field);
      const target=spec?.type==='date'?'dates.'+(/to$|end$/.test(mapping.field)?'end':'start'):['number','integer','coordinate'].includes(spec?.type)?(['annual_rent','annual_additions','annual_property_tax'].includes(mapping.field)?column.target:'objects.area'):column.target;
      value=interpretCell(cell,{...column,target,emptyMarkers:true},XLSX);
     }else continue;
     if(!present(value))continue;
     if(mapping&&tables[mapping.table].fields.find(f=>f.key===mapping.field)?.type==='text'&&typeof value!=='string')value=String(value);
     if(role){if(!contacts.has(column.index))contacts.set(column.index,{column,values:{}});contacts.get(column.index).values.name=value;}
     else if(part){if(!contacts.has(part.index))contacts.set(part.index,{column:profile.columns.find(c=>c.index===part.index),values:{}});contacts.get(part.index).values[part.field]=value;}
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
     if(!existing){if(role==='coordinator'&&data.contacts.some(row=>!row.cancelled&&row.role===role&&row[f]===target.id&&(!row.valid_to||!candidate.valid_from||row.valid_to>=candidate.valid_from)&&(!candidate.valid_to||!row.valid_from||candidate.valid_to>=row.valid_from)))throw Error('Samordnarkopplingen överlappar en befintlig period.');merge('contacts',{...candidate,id:'KOP-'+crypto.randomUUID()},null);}
    }
   }catch(error){
    for(const revert of undo.reverse())revert();for(const table of Object.keys(tables))data[table].length=lengths[table];changes.length=startChanges;rebuild();
    const [collection,field]=fieldInProgress.split('.');
    const review={id:'CLEAN-'+hash(JSON.stringify([source,profile.name,r+1,error.message,error.proposed])),kind:'canonical-conflict',status:'pending',...origin,collection:error.collection||collection,field:error.field||field,recordId:error.recordId,current:error.current,proposed:error.proposed,reason:error.message};
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
 data.workspace.importMappings=[...(data.workspace.importMappings||[]).filter(saved=>!profiles.some(p=>saved.sheet===p.name&&saved.fileName===(p.fileName||context.fileName))),...profiles.map(p=>({sheet:p.name,fileName:p.fileName||context.fileName,signature:p.signature,columns:p.columns.map(c=>({...c,contactHeader:contactPart(c.target)?p.columns.find(other=>other.index===contactPart(c.target).index)?.header:undefined,samples:undefined,examples:undefined}))}))];
 const sourceName=context.fileName||'Excel';
 const recordChanges=new Map();for(const change of changes){const k=JSON.stringify([change.collection,change.recordId]);if(!recordChanges.has(k))recordChanges.set(k,[]);recordChanges.get(k).push(change);}
 const importedHistory=[...recordChanges.values()].map(entries=>({id:crypto.randomUUID(),collection:entries[0].collection,recordId:entries[0].recordId,action:'Exceluppgifter inlästa',at:new Date().toISOString(),by:context.actor||'Excelimport',fields:entries.map(({field,from,to,provenance})=>({field,from,to,provenance}))}));
 if(importedHistory.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),...importedHistory];
 data.workspace.sourceRegistry=[...(data.workspace.sourceRegistry||[]).filter(row=>row.name!==sourceName),{id:'SRC-'+hash(sourceName),name:sourceName,kind:'clean-import',sheets:profiles.map(p=>p.name).join(', '),rows:rowCount,created:counts.reduce((sum,row)=>sum+row.created,0),matched:counts.reduce((sum,row)=>sum+row.updated,0),review:reviews.length,importedAt:new Date().toISOString()}];
 if(changes.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),{id:crypto.randomUUID(),collection:'imports',recordId:'SRC-'+hash(sourceName),action:'Excelunderlag inläst',at:new Date().toISOString(),by:context.actor||'Excelimport',fields:[{field:'källa',to:sourceName},{field:'nya poster',to:counts.reduce((sum,row)=>sum+row.created,0)},{field:'kompletterade poster',to:counts.reduce((sum,row)=>sum+row.updated,0)}]}];
 return {clean:data,data:projectWorkspace(data),report:{tables:counts,changes,decisions,review:reviews.length,blocking:reviews.filter(row=>!row.recordId).length,rows:rowCount}};
}
