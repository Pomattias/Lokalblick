import {tables,validateData} from './model.js';
import {viewCollections,viewFields} from './view-fields.js';
import {projectWorkspace} from './view-adapter.js';
import {refreshImportReceipt} from './import-receipt.js';

export const creationTables=['properties','objects','agreements'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const token=(table,id)=>JSON.stringify([table,id]);
const collection=table=>viewCollections[table]||table;
const index=data=>Object.fromEntries(Object.keys(tables).map(table=>[table,new Map((data[table]||[]).map(row=>[row.id,row]))]));
const planIndexes=new WeakMap();
const planOrigins=new WeakMap();
export function importCreationPlan(result,base){
 const before=index(base),out=[],recordOrigins=new Map();
 for(const change of result.report.changes||[]){const key=token(change.collection,change.recordId);if(!recordOrigins.has(key))recordOrigins.set(key,[]);recordOrigins.get(key).push(...(change.provenance?.occurrences||[change.provenance]).filter(Boolean));}
 for(const table of creationTables)for(const record of result.clean[table])if(!before[table].has(record.id)){
  const origins=recordOrigins.get(token(collection(table),record.id))||[];
  out.push({key:token(table,record.id),table,record,signature:JSON.stringify(record),origins:[...new Map(origins.map(origin=>[JSON.stringify([origin.source,origin.sheet,origin.row]),origin])).values()]});
 }
 const lookup=new Map(out.map(entry=>[entry.key,entry]));
 for(const table of creationTables)for(const row of base[table])lookup.set(token(table,row.id),{existing:true});
 planIndexes.set(out,lookup);planOrigins.set(out,recordOrigins);return out;
}
export function creationChoice(entry,choices){
 const choice=choices[entry.key];return choice?.signature===entry.signature?choice:null;
}
export function creationAvailable(entry,plan,choices,base){
 const parent=entry.table==='objects'?['properties',entry.record.property_id]:entry.table==='agreements'?['objects',entry.record.object_id]:null;
 if(!parent)return true;
 const proposed=planIndexes.get(plan)?.get(token(...parent));
 if(proposed?.existing)return true;
 const choice=proposed&&creationChoice(proposed,choices);
 return Boolean(choice&&['create','map'].includes(choice.action)&&creationAvailable(proposed,plan,choices,base));
}

// Apply explicit decisions to the completed draft. No importer is rerun here:
// unapproved parents cannot be recreated under a different inferred identity.
// Both inputs stay unchanged; the transport still performs the only write.
export function approveImportPlan(result,base,choices={},actor='Excelimport'){
 const clean=structuredClone(result.clean),report=structuredClone(result.report),before=index(base),candidate=index(result.clean),plan=importCreationPlan(result,base),mapped=new Map(),excluded=new Set();
 const addedReviews=[],at=new Date().toISOString();
 for(const entry of plan){
  const choice=creationChoice(entry,choices);
  if(choice?.action==='map'){
   if(entry.table!=='properties'||!before.properties.has(choice.targetId))throw Error('Välj en befintlig fastighet att koppla till.');
   mapped.set(entry.record.id,choice.targetId);
  }
  if(!choice||choice.action!=='create'||!creationAvailable(entry,plan,choices,base))excluded.add(entry.key);
 }
 // Mapping is a deliberate relation choice, never an implicit overwrite of
 // existing names, management numbers or other saved property facts.
 for(const [from,to]of mapped){
  const proposed=clean.properties.find(row=>row.id===from),target=clean.properties.find(row=>row.id===to);
  for(const field of tables.properties.fields){
   const value=proposed[field.key];if(value==null||value==='')continue;
   if(target[field.key]==null||target[field.key]==='')target[field.key]=structuredClone(value);
   else if(!same(target[field.key],value))addedReviews.push({id:'PLAN-MAP-'+token(from,field.key),kind:'canonical-conflict',status:'pending',source:report.sourceName,collection:'properties',recordId:to,field:viewFields.properties[field.key]||field.key,current:target[field.key],proposed:value,reason:'Olika uppgifter vid vald koppling till befintlig fastighet.',blocking:false,rowRejected:false});
  }
 }
 for(const [table,spec]of Object.entries(tables))for(const record of clean[table]){
  for(const field of spec.fields.filter(field=>field.type==='ref'&&field.table==='properties'))if(mapped.has(record[field.key])){
   const previous=before[table].get(record.id),target=mapped.get(record[field.key]);
   if(previous?.[field.key]&&previous[field.key]!==target)throw Error('En befintlig koppling får inte flyttas vid godkännande av nya poster.');
   record[field.key]=target;
  }
 }
 for(const table of creationTables)clean[table]=clean[table].filter(row=>!excluded.has(token(table,row.id)));
 // Remove dependent new rows, including prices, contacts and inspections.
 // Restore an existing record in full if a proposed dependency is withheld.
 let changed=true;
 while(changed){
  changed=false;const present=index(clean);
  for(const [table,spec]of Object.entries(tables))clean[table]=clean[table].flatMap(record=>{
   const missing=spec.fields.some(field=>field.type==='ref'&&record[field.key]&&!present[field.table].has(record[field.key]));
   if(!missing)return [record];changed=true;
   const old=before[table].get(record.id);if(old)return [structuredClone(old)];
   excluded.add(token(table,record.id));return [];
  });
 }
 // Do not leave inferred people/parties from withheld source rows behind.
 // Standalone register rows and anything still referenced remain in the draft.
 const withheldOrigins=new Set(plan.filter(entry=>excluded.has(entry.key)&&!(entry.table==='properties'&&mapped.has(entry.record.id))).flatMap(entry=>entry.origins).map(origin=>JSON.stringify([origin.source,origin.sheet,origin.row])));
 for(const table of ['people','parties']){
 const referenced=new Set();for(const [other,spec]of Object.entries(tables))for(const field of spec.fields.filter(field=>field.type==='ref'&&field.table===table))for(const row of clean[other])if(row[field.key])referenced.add(row[field.key]);
 clean[table]=clean[table].filter(record=>{
  if(before[table].has(record.id))return true;
  const origins=planOrigins.get(plan).get(token(collection(table),record.id))||[];
  const allWithheld=origins.length&&origins.every(origin=>withheldOrigins.has(JSON.stringify([origin.source,origin.sheet,origin.row])));
  if(!allWithheld||referenced.has(record.id))return true;excluded.add(token(table,record.id));return false;
 });
 }
 const present=index(clean);
 const storedField=change=>{
  const table=Object.keys(tables).find(table=>collection(table)===change.collection);
  return {table,field:Object.entries(viewFields[table]||{}).find(([,name])=>name===change.field)?.[0]||change.field};
 };
 const retained=change=>{
  const table=Object.keys(tables).find(table=>collection(table)===change.collection),field=Object.entries(viewFields[table]||{}).find(([,name])=>name===change.field)?.[0]||change.field;
  const record=present[table]?.get(change.recordId);return Boolean(record)&&!same(record[field],before[table].get(record.id)?.[field]);
 };
 report.changes=report.changes.filter(retained).map(change=>{const {table,field}=storedField(change);return field==='id'?change:{...change,from:before[table].get(change.recordId)?.[field]??null,to:present[table].get(change.recordId)[field]};});
 for(const [from,to]of mapped){
  const target=present.properties.get(to);
  for(const field of tables.properties.fields)if(!same(target[field.key],before.properties.get(to)[field.key]))report.changes.push({collection:'properties',recordId:to,field:viewFields.properties[field.key]||field.key,from:before.properties.get(to)[field.key],to:target[field.key],provenance:{source:report.sourceName,method:'explicit-property-mapping',proposedPropertyId:from}});
 }
 const deferred=[...excluded].filter(key=>{const [table,id]=JSON.parse(key);return table!=='properties'||!mapped.has(id);}).map(key=>{
  const [table,id]=JSON.parse(key),record=candidate[table].get(id),entry=planIndexes.get(plan).get(key),origin=entry?.origins[0]||planOrigins.get(plan).get(token(collection(table),id))?.[0]||{};
  return {id:'PLAN-DEFER-'+key,kind:'canonical-conflict',status:'pending',...origin,source:origin.source||report.sourceName,collection:collection(table),field:'id',recordId:id,value:record?.name||record?.title||id,reason:'Ny post eller dess överordnade koppling har inte godkänts. Läs in underlaget igen för att godkänna den.',blocking:false,rowRejected:false,recordRejected:true,creationDeferred:true};
 });
 const currentReviewIds=new Set(report.reviewIds||[]);
 clean.workspace.importReview=[...(clean.workspace.importReview||[]).flatMap(review=>{
  if(!review.recordId)return [review];
  const table=Object.keys(tables).find(table=>collection(table)===review.collection);
  if(review.creationDeferred&&table&&(present[table].has(review.recordId)||table==='properties'&&mapped.has(review.recordId)))return [{...review,status:'resolved',resolvedAt:at,resolvedBy:actor,resolutionReason:'Posten godkändes eller kopplades vid import.'}];
  if(!currentReviewIds.has(review.id))return [review];
  return !table||present[table].has(review.recordId)?[review]:[];
 }),...addedReviews,...deferred];
 const reviewIds=new Set([...(report.reviewIds||[]),...addedReviews.map(row=>row.id),...deferred.map(row=>row.id)]);
 const pending=clean.workspace.importReview.filter(row=>reviewIds.has(row.id)&&row.status==='pending');
 report.reviewIds=clean.workspace.importReview.filter(row=>reviewIds.has(row.id)).map(row=>row.id);report.review=pending.length;
 report.creationReview={mapped:[...mapped].map(([from,to])=>({from,to})),deferred:deferred.map(row=>({collection:row.collection,id:row.recordId}))};
 report.tables=Object.entries(viewCollections).map(([table,name])=>{
  const ids=new Set([...Object.keys(report.recordStates?.[name]||{}),...report.changes.filter(change=>change.collection===name).map(change=>change.recordId),...(table==='properties'?mapped.values():[])]),states=Object.create(null);
  for(const id of ids){const record=present[table].get(id);if(record)states[id]=!before[table].has(id)?'created':same(record,before[table].get(id))?'unchanged':'updated';}
  report.recordStates[name]=states;
  return {collection:name,label:tables[table].label,created:Object.values(states).filter(state=>state==='created').length,updated:Object.values(states).filter(state=>state==='updated').length,unchanged:Object.values(states).filter(state=>state==='unchanged').length,review:pending.filter(row=>row.collection===name).length};
 });
 const oldAuditIds=new Set((base.workspace.auditLog||[]).map(entry=>entry.id)),changeIndex=new Map(report.changes.map(change=>[JSON.stringify([change.collection,change.recordId,change.field]),change])),covered=new Set();
 const histories=(clean.workspace.auditLog||[]).filter(entry=>!oldAuditIds.has(entry.id)).flatMap(entry=>{
  const table=Object.keys(tables).find(table=>collection(table)===entry.collection),record=present[table]?.get(entry.recordId);if(!record)return [];
  const fields=(entry.fields||[]).flatMap(field=>{
   const key=JSON.stringify([entry.collection,entry.recordId,field.field]),change=changeIndex.get(key),stored=storedField({collection:entry.collection,field:field.field}).field;
   if(!change&&!same(field.to,record[stored]))return [];
   covered.add(key);return [{...field,...(change?{from:change.from,to:change.to}:{})}];
  });return fields.length?[{...entry,fields}]:[];
 });
 const extra=new Map();for(const change of report.changes){const key=JSON.stringify([change.collection,change.recordId,change.field]);if(covered.has(key))continue;const owner=token(change.collection,change.recordId);if(!extra.has(owner))extra.set(owner,[]);extra.get(owner).push(change);}
 clean.workspace.auditLog=[...(base.workspace.auditLog||[]),...histories,...[...extra.values()].map(changes=>({id:crypto.randomUUID(),collection:changes[0].collection,recordId:changes[0].recordId,action:'Exceluppgifter inlästa',at,by:actor,fields:changes.map(({field,from,to,provenance})=>({field,from,to,provenance}))}))];
 const source=clean.workspace.sourceRegistry.find(row=>row.name===report.sourceName&&row.kind==='clean-import');
 if(source){source.created=report.tables.reduce((n,row)=>n+row.created,0);source.matched=report.tables.reduce((n,row)=>n+row.updated,0);source.review=report.review;if(source.receipt)source.receipt.deferredRecords=deferred.length;}
 validateData(clean);refreshImportReceipt({clean,report});
 return {...result,clean,data:projectWorkspace(clean),report};
}
