import {normalize, validateData, tables} from './model.js';
import {viewCollections, viewFields} from './view-fields.js';
import {projectWorkspace} from './view-adapter.js';
import {importCreationPlan, creationChoice} from './import-plan.js';

// A decision survives recalculation when its identity and parent are unchanged.
// Descriptive enrichment must not make the user approve the same post again.
export function retainCreationChoices(previous, next, choices) {
 const old=new Map(previous.map(entry=>[entry.key,entry]));
 const retained={};
 for(const entry of next){
  const before=old.get(entry.key),choice=before&&creationChoice(before,choices);
  if(choice&&before.record.property_id===entry.record.property_id&&before.record.object_id===entry.record.object_id)
   retained[entry.key]={...choice,signature:entry.signature};
 }
 return retained;
}

// Edits belong to this import draft. The ordinary plan still gates creation,
// validates dependencies and performs the single final, atomic save.
export function editImportDraft(result, base, edits={}, actor='Excelimport') {
 if(!Object.keys(edits.properties||{}).length&&!Object.keys(edits.contacts||{}).length)return result;
 const clean=structuredClone(result.clean),report=structuredClone(result.report),at=new Date().toISOString();
 const put=(table,record,origin)=>{
  const collection=viewCollections[table]||table,rows=clean[table],old=rows.find(row=>row.id===record.id);
  const normalized=normalize(table,record,record.id);
  for(const field of ['id',...tables[table].fields.map(field=>field.key)])if(JSON.stringify(old?.[field])!==JSON.stringify(normalized[field])){
   report.changes=report.changes.filter(change=>!(change.collection===collection&&change.recordId===record.id&&change.field===(viewFields[table]?.[field]||field)));
   report.changes.push({collection,recordId:record.id,field:viewFields[table]?.[field]||field,from:base[table].find(row=>row.id===record.id)?.[field]??null,to:normalized[field],provenance:{...origin,source:'manual',at,confirmedBy:actor}});
  }
  if(old)Object.assign(old,normalized);else rows.push(normalized);
 };
 for(const [id,name] of Object.entries(edits.properties||{})){
  const record=clean.properties.find(row=>row.id===id);
  if(record&&String(name).trim())put('properties',{...record,name:String(name).trim()},{});
 }
 for(const [id,edit] of Object.entries(edits.contacts||{})){
  const original=result.clean.contacts.find(row=>row.id===id);
  if(edit.imported&&!original)continue;
  if(base.contacts.some(row=>row.id===id))throw Error('En sparad personkoppling ändras i registret. Lägg till en ny koppling i importen.');
  if(original&&edit.originalPersonId&&original.person_id!==edit.originalPersonId)continue;
  const record={...edit.record,id:edit.replacementId||id};
  if(!clean.people.some(row=>row.id===record.person_id))continue;
  const home=tables.contacts.fields.find(field=>field.type==='ref'&&field.key!=='person_id'&&record[field.key]);
  if(!home||!clean[home.table].some(row=>row.id===record[home.key]))continue;
  const originalKey=(report.sourceRows||[]).find(row=>row.contactKeys?.[id])?.contactKeys[id];
  const provenance={...edit.origin,...(originalKey?{contactDecision:{key:originalKey,recordId:record.id}}:{})};
  put('contacts',record,provenance);
  if(edit.replacementId){
   clean.contacts=clean.contacts.filter(row=>row.id!==id);
   report.recordStates.contacts ||= {};report.recordStates.contacts[record.id]=base.contacts.some(row=>row.id===record.id)?'unchanged':'created';
   clean.workspace.auditLog.push({id:crypto.randomUUID(),collection:'contacts',recordId:record.id,action:'Importkoppling vald',at,by:actor,fields:[{field:'person_id',from:record.person_id,to:record.person_id,provenance:{...provenance,source:'manual',at,confirmedBy:actor}}]});
  }
  for(const trace of report.sourceRows||[])if(trace.records.contacts?.includes(id)||JSON.stringify([trace.source,trace.sheet,trace.row])===edit.rowKey){
   trace.records.contacts=[...new Set([...(trace.records.contacts||[]).filter(contactId=>!edit.replacementId||contactId!==id),record.id])];trace.records.people=[...new Set([...(trace.records.people||[]),record.person_id])];
  }
 }
 // Replacing an inferred person with an existing one must not leave a second,
 // unused person behind. Explicit standalone person rows are retained.
 for(const edit of Object.values(edits.contacts||{})){
  const id=edit.originalPersonId;
  if(!id||id===edit.record.person_id||base.people.some(row=>row.id===id))continue;
  const referenced=Object.entries(tables).some(([table,spec])=>spec.fields.some(field=>field.type==='ref'&&field.table==='people'&&clean[table].some(row=>row[field.key]===id)));
  const standalone=result.report.sourceRows?.some(row=>row.records.people?.includes(id)&&!row.records.contacts?.some(contactId=>Object.hasOwn(edits.contacts,contactId)));
  if(referenced||standalone)continue;
  clean.people=clean.people.filter(row=>row.id!==id);
  report.changes=report.changes.filter(change=>!(change.collection==='people'&&change.recordId===id));
  for(const row of report.sourceRows||[])if(row.records.people)row.records.people=row.records.people.filter(personId=>personId!==id);
 }
 validateData(clean);
 return {...result,clean,report,data:projectWorkspace(clean)};
}

export function reviewImportDraft(result, base, edits, previousPlan, choices, actor) {
 const edited=editImportDraft(result,base,edits,actor),plan=importCreationPlan(edited,base);
 return {edited,plan,choices:retainCreationChoices(previousPlan,plan,choices)};
}
