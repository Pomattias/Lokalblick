import {tables,normalize,validateData} from './model.js';
import {viewCollections,viewFields} from './view-fields.js';
import {projectWorkspace} from './view-adapter.js';
import {refreshImportReceipt} from './import-receipt.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const editable=review=>review.kind==='canonical-conflict'&&!review.blocking&&!review.rowRejected&&review.recordId&&Object.hasOwn(review,'proposed');
const tableFor=collection=>Object.keys(viewCollections).find(table=>viewCollections[table]===collection);
const fieldFor=(table,field)=>Object.keys(viewFields[table]||{}).find(key=>viewFields[table][key]===field);
export const conflictKey=review=>JSON.stringify([review.collection,review.recordId,review.field]);
// Presentation is derived from the existing reviews. Keep per-record provenance
// intact while showing one question for each recurring kind of problem.
export function importReviewGroups(reviews){
 const groups=new Map();
 for(const review of reviews.filter(row=>row.status==='pending')){
  const category=review.rowRejected||review.blocking?'blocked':review.personLinkRejected?'contacts':editable(review)?'values':'fields';
  const key=JSON.stringify([category,review.collection,review.field,review.reason]);
  if(!groups.has(key))groups.set(key,{key,category,collection:review.collection,field:review.field,reason:review.reason,reviews:[],rows:new Set(),records:new Set()});
  const group=groups.get(key);group.reviews.push(review);
  for(const at of review.occurrences||[review])group.rows.add(JSON.stringify([at.source,at.sheet,at.row]));
  if(review.recordId)group.records.add(review.recordId);
 }
 const order=['blocked','contacts','fields','values'];
 return [...groups.values()].map(({rows,records,...group})=>({...group,rowCount:rows.size,recordCount:records.size})).sort((a,b)=>order.indexOf(a.category)-order.indexOf(b.category));
}
export function importTableRows(counts){
 const roots=['properties','objects','contracts','activities'];
 return counts.filter(row=>row.created||row.updated||row.unchanged||row.review).sort((a,b)=>(roots.indexOf(a.collection)<0?roots.length:roots.indexOf(a.collection))-(roots.indexOf(b.collection)<0?roots.length:roots.indexOf(b.collection)));
}
// Repeated source rows are provenance for one value choice, never extra records.
export function consolidateImportReviews(reviews){
 const values=new Map(),out=[];
 for(const review of reviews){
  if(!editable(review)){out.push(review);continue;}
  const key=JSON.stringify([review.collection,review.recordId,review.field,review.proposed]);
  const origin={source:review.source,sheet:review.sheet,row:review.row,column:review.column,columnIndex:review.columnIndex};
  const previous=values.get(key);
  if(previous){for(const occurrence of review.occurrences||[origin]){const at=JSON.stringify(occurrence);if(!previous.origins.has(at)){previous.origins.add(at);previous.review.occurrences.push(occurrence);}}}
  else{const merged={...review,occurrences:[...(review.occurrences||[origin])]};values.set(key,{review:merged,origins:new Set(merged.occurrences.map(at=>JSON.stringify(at)))});out.push(merged);}
 }
 return out;
}
export function importConflictGroups(result){
 const groups=new Map(),reviewIds=new Set(result.report.reviewIds||[]),records=new Map(),candidates=new Map();
 for(const review of result.clean?.workspace?.importReview||[]){
  if(review.status!=='pending'||!editable(review)||!reviewIds.has(review.id))continue;
  const table=tableFor(review.collection),field=fieldFor(table,review.field),spec=tables[table]?.fields.find(f=>f.key===field);
  // IDs, links between registers and structured values need their own explicit workflows.
  if(!spec||['ref','json'].includes(spec.type))continue;
  if(!records.has(table))records.set(table,new Map(result.clean[table].map(row=>[row.id,row])));
  const key=conflictKey(review),record=records.get(table).get(review.recordId);if(!record)continue;
  if(!groups.has(key))groups.set(key,{key,collection:review.collection,recordId:review.recordId,field:review.field,label:spec.label,recordLabel:record?.name||record?.title||record?.id,current:record?.[field],candidates:[]});
  if(!candidates.has(key))candidates.set(key,new Map());
  const group=groups.get(key),valueKey=JSON.stringify(review.proposed),candidate=candidates.get(key).get(valueKey);
  if(candidate)candidate.reviews.push(review);else{const option={key:valueKey,value:review.proposed,reviews:[review]};group.candidates.push(option);candidates.get(key).set(valueKey,option);}
 }
 return [...groups.values()];
}
// Choices apply to the completed draft, so row order can never override a choice.
// The draft is cloned and validated as a whole before anything can be persisted.
export function resolveImportChoices(result,{mode='review',choices={}}={},actor='Excelimport'){
 const groups=importConflictGroups(result),resolved=groups.map(group=>{
  const choice=choices[group.key];
  const keep=choice==='keep'||!choice&&mode==='keep';
  const candidate=group.candidates.find(c=>c.key===choice)||(!choice&&mode==='replace'&&group.candidates.length===1?group.candidates[0]:null);
  return {group,keep,candidate};
 }).filter(row=>row.keep||row.candidate);
 if(!resolved.length)return result;
 const clean=structuredClone(result.clean),report=structuredClone(result.report),at=new Date().toISOString(),audit=[];
 const affected=new Set(),reviewIds=new Set(report.reviewIds||[]);
 for(const {group,keep,candidate} of resolved){
  const table=tableFor(group.collection),field=fieldFor(table,group.field),record=clean[table].find(row=>row.id===group.recordId);
  if(!same(record[field],group.current))throw Error('Värdet har ändrats sedan granskningen. Kontrollera importen igen.');
  const value=keep?record[field]:candidate.value,origins=group.candidates.flatMap(c=>c.reviews.flatMap(r=>r.occurrences||[r]));
  if(!same(value,record[field])){
   const before=record[field];record[field]=value;
   report.changes.push({collection:group.collection,recordId:record.id,field:group.field,from:before,to:value,provenance:{occurrences:candidate.reviews.flatMap(r=>r.occurrences||[r])}});affected.add(JSON.stringify([group.collection,record.id]));
  }
  for(const review of clean.workspace.importReview.filter(r=>reviewIds.has(r.id)&&conflictKey(r)===group.key&&editable(r)&&r.status==='pending')){
   review.status=!keep&&same(review.proposed,value)?'accepted':'rejected';review.resolvedBy=actor;review.resolvedAt=at;review.resolutionReason=keep?'Sparat värde behålls vid import.':'Värde valt vid import.';
  }
  audit.push({id:crypto.randomUUID(),collection:group.collection,recordId:record.id,action:keep?'Sparat värde behållet vid import':'Importvärde valt',at,by:actor,fields:[{field:group.field,from:group.current,to:value,provenance:{occurrences:origins}}]});
 }
 for(const [collection,id] of [...affected].map(key=>JSON.parse(key))){const table=tableFor(collection),record=clean[table].find(row=>row.id===id);Object.assign(record,normalize(table,record));}
 validateData(clean);clean.workspace.auditLog=[...(clean.workspace.auditLog||[]),...audit];
 for(const [collection,id] of [...affected].map(key=>JSON.parse(key))){
  const state=report.recordStates?.[collection]?.[id];
  if(state==='unchanged'){const counts=report.tables.find(row=>row.collection===collection);counts.updated++;counts.unchanged--;report.recordStates[collection][id]='updated';}
 }
 const pending=clean.workspace.importReview.filter(r=>reviewIds.has(r.id)&&r.status==='pending');
 const outstanding=new Set(pending.flatMap(r=>(r.occurrences||[r]).map(origin=>JSON.stringify([origin.source,origin.sheet,origin.row,r.collection,r.reason]))));
 report.decisions=report.decisions.filter(row=>row.classification!=='B'||outstanding.has(JSON.stringify([row.source,row.sheet,row.row,row.collection,row.reason])));
 report.review=pending.length;
 for(const counts of report.tables)counts.review=pending.filter(r=>r.collection===counts.collection).length;
 for(const source of clean.workspace.sourceRegistry||[])if(source.kind==='clean-import'&&source.name===report.sourceName){source.review=report.review;source.matched=report.tables.reduce((sum,row)=>sum+row.updated,0);}
 refreshImportReceipt({clean,report});
 return {...result,clean,data:projectWorkspace(clean),report};
}
