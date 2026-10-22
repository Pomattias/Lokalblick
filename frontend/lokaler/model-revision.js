import {upgradeFinance} from './finance-revision.js';
import {legacyFinanceFields} from './finance-model.js';
import {tables,normalize,validateData} from './model.js';

// Upgrade preceding local schemas at the storage boundary. Financial facts
// move to their registers; budget plans stay intact and removed facts remain auditable.
export const retiredFields={
 properties:{kind:'Typ',geo_source:'Geokälla',geo_confirmed_at:'Geobekräftad',geo_confirmed_by:'Geobekräftad av'},
 objects:{name:'Benämning',usage:'Verksamhetstyp',unit_id:'Organisatorisk tillhörighet'},
 agreements:{number:'Avtalsnummer',business_comment:'Kommentar verksamhet',staff_count:'Antal medarbetare (viss / heltid)',cost_center:'Kostnadsställe lokaler'},
 issues:{phase:'Fas'}
};
export function upgradeData(input){
 const data=structuredClone(input),retired=[],ids=new Map();
 for(const row of data.agreements||[]){
  const id=String(row.number||row.id||'').trim();
  if(ids.has(row.id)&&ids.get(row.id)!==id)throw Error('Avtalets tidigare ID är inte entydigt.');
  ids.set(row.id,id);
 }
 const used=new Set();for(const id of ids.values()){if(used.has(id))throw Error('AvtalsID finns flera gånger. Inga uppgifter har skrivits över.');used.add(id);}
 const changedIds=new Set([...ids].filter(([from,to])=>from!==to).map(([from])=>from));
 const budgetRef=value=>{
  if(!value||typeof value!=='object')return false;
  if(Array.isArray(value))return value.some(budgetRef);
  if(changedIds.has(value.contractId)||changedIds.has(value.sourceId)||changedIds.has(value.sourceSnapshot?.id))return true;
  if(Object.keys(value.rowAdjustments||{}).some(key=>[...changedIds].some(id=>key.startsWith('contract|'+id+'|'))))return true;
  return Object.values(value).some(budgetRef);
 };
 if(budgetRef(data.workspace?.budgetPlans))throw Error('Budgeten refererar till tidigare AvtalsID. Arbetsytan har inte ändrats. Använd en ny ren arbetsyta; budgetkopplingar skrivs inte om automatiskt.');
 for(const [table,fields] of Object.entries(retiredFields))for(const row of data[table]||[]){
  const removed=Object.fromEntries(Object.keys(fields).filter(k=>Object.hasOwn(row,k)&&row[k]!=null&&row[k]!=='').map(k=>[k,row[k]]));
  if(Object.keys(removed).length)retired.push({table,id:row.id,values:removed});
  if(table==='agreements'){
   row.id=ids.get(row.id);
   if(row.business!=null&&row.business_name==null)row.business_name=row.business;
   if(row.business_comment!=null&&row.business_description==null)row.business_description=row.business_comment;
   delete row.business;
  }
  for(const key of Object.keys(fields))delete row[key];
 }
 for(const row of data.contacts||[]){
  if(row.agreement_id)row.agreement_id=ids.get(row.agreement_id)||row.agreement_id;
  if(row.role==='business'){retired.push({table:'contacts',id:row.id,values:{role:row.role}});row.role='tenant';}
 }
 // Equal former business/tenant links become one temporal link. Keep the full
 // removed row in the audit event rather than silently discarding its history.
 const seen=new Map();data.contacts=(data.contacts||[]).filter(row=>{
  const signature=JSON.stringify([row.person_id,row.role,row.property_id||null,row.agreement_id||null,row.issue_id||null,row.order_id||null,row.valid_from||null,row.valid_to||null,Boolean(row.cancelled)]);
  if(!seen.has(signature)){seen.set(signature,row);return true;}
  retired.push({table:'contacts',id:row.id,values:row});return false;
 });
 for(const entry of data.workspace?.auditLog||[])if(entry.collection==='contracts'&&ids.has(entry.recordId)&&ids.get(entry.recordId)!==entry.recordId){entry.previousRecordId??=entry.recordId;entry.recordId=ids.get(entry.recordId);}
 for(const entry of data.workspace?.importReview||[])if(entry.collection==='contracts'&&entry.recordId)entry.recordId=ids.get(entry.recordId)||entry.recordId;
 for(const entry of data.workspace?.documents||[])if(entry.contractId)entry.contractId=ids.get(entry.contractId)||entry.contractId;
 for(const entry of data.workspace?.recurringCosts||[])if(entry.contractId)entry.contractId=ids.get(entry.contractId)||entry.contractId;
 if(retired.length){
  data.workspace ||= {};
  data.workspace.auditLog=[...(data.workspace.auditLog||[]),{id:crypto.randomUUID(),at:new Date().toISOString(),by:'Lokalblick',collection:'schema',action:'Datamodell förenklad',fields:retired.map(row=>({field:row.table+'.'+row.id,from:row.values,to:null})),agreementIds:[...ids].filter(([a,b])=>a!==b).map(([from,to])=>({from,to}))}];
 }
 // Preserve provenance and references in historical audit entries. Existing
 // log payloads and locked budget snapshots are deliberately left intact.
 upgradeFinance(data);
 for(const [table,spec]of Object.entries(tables))data[table]=(data[table]||[]).map(row=>normalize(table,row));
 validateData(data);return data;
}

export const previousFinanceFields=legacyFinanceFields;
