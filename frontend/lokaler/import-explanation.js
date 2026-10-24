import {tables} from './model.js';
import {viewCollections,viewFields} from './view-fields.js';
import {creationChoice,importCreationPlan} from './import-plan.js';
import {legacyFinanceFields,legacyFinanceMap} from './finance-model.js';
import {personRole} from '../services/import-person-links.js';
import {createBusinessLabels} from './business-identities.js';

export const importStatuses={created:'Skapas',completed:'Kompletteras',changed:'Ändras',unchanged:'Oförändrat',skipped:'Läses inte in',pending:'Väntar'};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),key=(table,id)=>JSON.stringify([table,id]);
const present=value=>value!==null&&value!==undefined&&value!=='';
const indexes=data=>Object.fromEntries(Object.keys(tables).map(table=>[table,new Map((data?.[table]||[]).map(row=>[row.id,row]))]));
const rowKey=row=>JSON.stringify([row.source,row.sheet,row.row]);
const owners={properties:'fastigheten',objects:'objektet',agreements:'avtalet',agreement_items:'avtalet',people:'personen',parties:'parten',issues:'ärendet',orders:'beställningen'};
export function importColumnMeaning(column){
 if(column.target==='@ignore')return 'Kolumnen är bortvald och läses inte in.';
 if(column.itemAmbiguous)return 'Välj vilken avtalspost kolumnen ska höra till.';
 if(!column.target||column.target.startsWith('@'))return 'Välj vilket fält kolumnen ska läsas som.';
 const person=personRole(column.target);
 if(person)return `Kolumnen ${column.header} läses som ${{our:'vår kontaktperson',owner:'fastighetsägarens kontaktperson',tenant:'hyresgästens kontaktperson'}[person.role]||'kontaktperson'} på ${{property:'fastigheten',contract:'avtalet',activity:'ärendet',order:'beställningen'}[person.type]||'den valda posten'}.`;
 const [collection,field]=column.target.split('.'),table=Object.keys(viewCollections).find(table=>viewCollections[table]===collection);
 const stored=Object.entries(viewFields[table]||{}).find(([,target])=>target===field)?.[0]||field;
 const spec=tables[table]?.fields.find(spec=>spec.key===stored);
 const legacy=table==='agreements'?Object.keys(legacyFinanceMap).find(key=>legacyFinanceMap[key]===field):null;
 const caption=field==='id'?'Identifierare':spec?.label||legacyFinanceFields[legacy]||column.label||column.header;
 const item=column.itemType&&tables.agreement_items.fields.find(field=>field.key==='type')?.values?.[column.itemType];
 return `Kolumnen ${column.header} läses som ${item&&field==='baseAmount'?item:caption} på ${owners[table]||'den valda posten'}.`;
}

// Derive row outcomes from the importer's actual touches, matching decisions
// and approved snapshot. Never infer a relation from a displayed number prefix.
// The trace stays in the review report; no duplicate source cells are persisted.
export function explainImport(candidate,base,{approved=null,choices={},profiles=[]}={}){
 if(!candidate.clean)return {rows:[],counts:{},records:[]};
 const old=indexes(base),proposed=indexes(candidate.clean),saved=approved?indexes(approved.clean):null,labels=createBusinessLabels(candidate.clean);
 const plan=importCreationPlan(candidate,base),entries=new Map(plan.map(entry=>[entry.key,entry]));
 const mapped=new Map((approved?.report.creationReview?.mapped||[]).map(row=>[row.from,row.to]));
 // Withholding a new parent must not hide the source row's actual field
 // problems. Prefer the current resolution, retaining draft-only explanations.
 const current=approved||candidate,reviewIds=new Set([...(candidate.report.reviewIds||[]),...(current.report.reviewIds||[])]),rowReviews=new Map();
 const explainedReviews=new Map([...(candidate.clean.workspace.importReview||[]),...(current.clean.workspace.importReview||[])].map(review=>[review.id,review]));
 for(const review of explainedReviews.values())if(reviewIds.has(review.id)&&!review.creationDeferred)for(const at of review.occurrences||[review]){
  const id=rowKey(at);if(!rowReviews.has(id))rowReviews.set(id,[]);rowReviews.get(id).push(review);
 }
 const status=(table,id)=>{
  const actualId=table==='properties'?mapped.get(id)||id:id,record=(saved||proposed)[table].get(actualId),before=old[table].get(actualId);
  if(!record){const entry=entries.get(key(table,id)),decision=entry&&creationChoice(entry,choices);return decision?.action==='defer'?'skipped':'pending';}
  if(!before){if(!approved&&entries.has(key(table,id)))return 'pending';return 'created';}
  const differences=tables[table].fields.filter(field=>field.key!=='sources'&&!same(record[field.key],before[field.key]));
  return !differences.length?'unchanged':differences.some(field=>present(before[field.key]))?'changed':'completed';
 };
 const dependency=(table,id,seen=new Set())=>{
  const token=key(table,id);if(seen.has(token))return null;seen.add(token);
  const entry=entries.get(token),decision=entry&&creationChoice(entry,choices);
  const record=proposed[table].get(id),contactHome=table==='contacts'&&tables.contacts.fields.find(field=>field.type==='ref'&&field.key!=='person_id'&&record?.[field.key]),parent=table==='objects'?['properties',record?.property_id]:table==='agreements'?['objects',record?.object_id]:table==='agreement_items'?['agreements',record?.agreement_id]:contactHome?[contactHome.table,record[contactHome.key]]:null;
  if(parent?.[1]){const blocked=dependency(...parent,seen);if(blocked)return blocked;}
  if(decision?.action==='defer')return {table,id,status:'skipped',reason:`${tables[table].singular} ${id} är bortvald.`};
  if(entry&&(!decision||!['create','map'].includes(decision.action)))return {table,id,status:'pending',reason:`${tables[table].singular} ${id} har ännu inte godkänts.`};
  return null;
 };
 const sourceRows=(candidate.report.sourceRows||[]).map(trace=>{
  const id=rowKey(trace),allReviews=rowReviews.get(id)||[],reviews=allReviews.filter(review=>review.status==='pending'),refs=new Map();
  const add=(table,recordId)=>{if(!recordId)return;const token=key(table,recordId);if(refs.has(token))return;refs.set(token,{table,id:recordId});
   const record=proposed[table]?.get(recordId);if(table==='agreement_items')add('agreements',record?.agreement_id);if(table==='agreements')add('objects',record?.object_id);if(table==='objects')add('properties',record?.property_id);
  };
  for(const [table,ids]of Object.entries(trace.records||{}))for(const recordId of ids)add(table,recordId);
  const nodes=[...refs.values()].map(node=>{
   const actualId=node.table==='properties'?mapped.get(node.id)||node.id:node.id,record=(saved||proposed)[node.table]?.get(actualId)||proposed[node.table]?.get(node.id),block=!old[node.table]?.has(actualId)&&(!saved||!saved[node.table]?.has(actualId))?dependency(node.table,node.id):null;
   return {...node,actualId,record,before:old[node.table].get(actualId),existing:old[node.table].has(actualId),status:block?.status||status(node.table,node.id),reason:block?`${node.table==='agreement_items'?'Priset':tables[node.table].singular+' '+node.id} ${block.status==='pending'?'väntar':'läses inte in'}: ${block.reason}`:null};
  }).sort((a,b)=>['properties','objects','agreements','agreement_items'].indexOf(a.table)-['properties','objects','agreements','agreement_items'].indexOf(b.table));
  if(reviews.length)for(const [table,hint]of [['properties',trace.hints?.propertyId],['objects',trace.hints?.objectId],['agreements',trace.hints?.agreementId]])if(hint&&!nodes.some(node=>node.table===table&&node.id===hint))nodes.push({table,id:hint,actualId:hint,record:old[table].get(hint),before:old[table].get(hint),existing:old[table].has(hint),identified:false,status:'pending',reason:`${tables[table].singular} ${hint} kan inte kopplas: ${reviews[0].reason}`});
  const order=['properties','objects','agreements','agreement_items'];nodes.sort((a,b)=>order.indexOf(a.table)-order.indexOf(b.table));
  const property=nodes.find(node=>node.table==='properties'&&node.identified!==false),object=nodes.find(node=>node.table==='objects'&&node.identified!==false),agreement=nodes.find(node=>node.table==='agreements'&&node.identified!==false);
  const method=trace.matchingDecision?.method;
  let explanation='';
  if(agreement&&old.agreements.has(agreement.id))explanation=`Avtalsnummer ${agreement.id} finns redan. Dess sparade objekt ${object?.actualId||old.agreements.get(agreement.id).object_id}${property?' och fastighet '+property.actualId:''} används.`;
  else if(mapped.has(property?.id))explanation=`Du kopplar fastighetsförslaget ${property.id} till befintlig fastighet ${property.actualId}.`;
  else if(method==='existing-object-link')explanation=`Objekt ${object?.id||trace.hints?.objectId} finns redan. Dess sparade fastighetskoppling används.`;
  else if(method==='management-object-number')explanation=`Förvaltningsobjekt ${trace.hints?.managementNumber||property?.record?.management_object_number} matchar fastighet ${property?.actualId}.`;
  else if(method==='management-object-number-new')explanation=`Förvaltningsobjekt ${trace.hints?.managementNumber||property?.record?.management_object_number} används för den nya fastigheten ${property?.actualId}.`;
  else if(method==='explicit-row-choice')explanation=`Du har godkänt förslaget att koppla källraden till fastighet ${property?.actualId||trace.matchingDecision.propertyId}.`;
  else if(method==='agreement-number-approved')explanation='Du har godkänt de föreslagna identifierarna från avtalsnumret.';
  else if(property&&!property.existing&&method==='property-address')explanation=property.status==='created'?`Du har godkänt en ny fastighet från adressen ${property.record?.address}.`:`En ny fastighet föreslås från adressen ${property.record?.address}. Förslaget behöver godkännas.`;
  else if(property)explanation=`${old.properties.has(property.actualId)?'FastighetsID':'Fastighetsförslaget'} ${property.actualId} används. Objekt och avtal kopplas med underlagets identifierare.`;
  else if(trace.rejected)explanation='Ingen säker koppling kunde godkännas för källraden.';
  if(nodes.some(node=>node.identified===false)&&nodes.some(node=>node.identified!==false))explanation='Raden är bara delvis identifierad. Kopplingar märkta Ej kopplad måste rättas innan deras uppgifter kan läsas in.';
  if(trace.matchingDecision?.objectNumberSource==='agreement-number')explanation+=` Objektnumret ${trace.matchingDecision.objectId} hämtas ur avtalsnumret ${trace.hints?.agreementId}.`;
  const profile=profiles.find(profile=>profile.name===trace.sheet&&(!profile.fileName||profile.fileName===trace.source));
  const columns=(profile?.columns||[]).map(column=>{
   const related=reviews.filter(review=>review.columnIndex===column.index||column.target===review.collection+'.'+review.field),ignored=column.target==='@ignore',pending=!ignored&&(column.itemAmbiguous||!column.target||column.target.startsWith('@'));
   const valueRejected=allReviews.some(review=>review.status==='rejected'&&(review.columnIndex===column.index||column.target===review.collection+'.'+review.field));
   const table=Object.keys(viewCollections).find(table=>viewCollections[table]===column.target?.split('.')[0]),blockedNode=nodes.find(node=>node.table===table&&['skipped','pending'].includes(node.status));
   const targetField=column.target?.split('.')[1],stored=Object.entries(viewFields[table]||{}).find(([,target])=>target===targetField)?.[0]||targetField;
   const owners=nodes.filter(node=>node.table===table&&(table!=='agreement_items'||!column.itemType||node.record?.type===column.itemType)),owner=owners.length===1?owners[0]:null;
   const valueKnown=Boolean(owner?.record&&Object.hasOwn(owner.record,stored));
   return {index:column.index,header:column.header,target:column.target,needsMapping:Boolean(pending),meaning:importColumnMeaning(column),status:ignored||valueRejected?'skipped':pending?'pending':related.length?'pending':trace.held?.includes(column.index)?'skipped':blockedNode?.status||'read',reason:ignored?'Kolumnen är bortvald.':pending?importColumnMeaning(column):valueRejected?'Filens avvikande värde används inte. Det sparade eller ett annat godkänt värde behålls.':related.map(review=>review.reason).join(' ')||blockedNode?.reason||null,...(valueKnown?{before:owner.before?.[stored]??null,after:owner.record[stored]}:{})};
  });
  const reasons=[...new Set([...nodes.map(node=>node.reason),...reviews.map(review=>review.reason),...columns.filter(column=>column.status==='skipped'||column.needsMapping).map(column=>column.header+': '+(column.reason||'Värdet kunde inte läsas in.'))].filter(Boolean))];
  const writing=nodes.filter(node=>['created','completed','changed'].includes(node.status));
  const withheld=nodes.some(node=>['pending','skipped'].includes(node.status))||trace.rejected||Boolean(trace.held?.length)||reviews.some(review=>review.recordRejected||review.fieldRejected||review.personLinkRejected);
  const rowStatus=reviews.length||nodes.some(node=>node.status==='pending')||columns.some(column=>column.status==='pending')?'pending':writing.some(node=>node.status==='created')?'created':writing.some(node=>node.status==='changed')?'changed':writing.length?'completed':nodes.some(node=>node.status==='unchanged')?'unchanged':'skipped';
  return {...trace,key:id,nodes:nodes.map(node=>({...node,reason:node.reason?labels.text(node.reason):null})),columns,reviews:reviews.map(review=>({...review,reason:labels.text(review.reason)})),reasons:reasons.map(labels.text),explanation:labels.text(explanation),status:rowStatus,partial:Boolean(writing.length&&withheld),hints:trace.hints||{}};
 });
 const counts=Object.fromEntries(Object.keys(importStatuses).map(status=>[status,sourceRows.filter(row=>row.status===status).length]));
 const records=(current.report.tables||[]).map(row=>{
  const table=Object.keys(viewCollections).find(table=>viewCollections[table]===row.collection)||(tables[row.collection]?row.collection:null),states=current.report.recordStates?.[row.collection];if(!table||!states)return row;
  const statuses=Object.keys(states).map(id=>status(table,id));
  const completed=statuses.filter(value=>value==='completed').length,changed=statuses.filter(value=>value==='changed').length;
  return {...row,created:statuses.filter(value=>value==='created').length,updated:completed+changed,completed,changed,unchanged:statuses.filter(value=>value==='unchanged').length};
 }).filter(row=>row.created||row.updated||row.unchanged);
 return {rows:sourceRows,counts,records};
}
