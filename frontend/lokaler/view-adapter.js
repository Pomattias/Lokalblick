import {projectFinance} from './finance-view.js';
import { normalize as normalizeView } from '../v2/model.js';
import { tables, emptyData, normalize, validateData, coordinator, active } from './model.js';
import { viewCollections, viewFields, workspaceKeys } from './view-fields.js';
const clone = value => structuredClone(value);
const issueStatus = {open:'Nytt',ongoing:'Pågår',done:'Klar'};
const orderStatus = {draft:'Planerad',ordered:'Beställd',done:'Klar'};
const priority = {low:'Låg',normal:'Medel',high:'Hög'};
const roleKeys = {owner:'owner',coordinator:'our',tenant:'tenant'};
const targetTypes = {properties:'property',agreements:'contract',issues:'activity',orders:'order'};
const targetFields = {properties:'property_id',agreements:'agreement_id',issues:'issue_id',orders:'order_id'};
export function projectWorkspace(clean) {
 const out = {...clone(clean.workspace || {}),isDemo:false,cleanModel:true,sourceName:'Lokal datamodell',assignments:[]};
 for(const [table,collection] of Object.entries(viewCollections)) out[collection]=(clean[table]||[]).map(record=>{
  const row={id:record.id};
  for(const [field,target] of Object.entries(viewFields[table])) if(record[field]!=null)row[target]=clone(record[field]);
  return row;
 });
 const objects=new Map(out.objects.map(row=>[row.id,row]));
 for(const property of out.properties){property.sourceId=property.id;property.apartmentCount=clean.objects.filter(o=>o.property_id===property.id&&active(o)).reduce((sum,o)=>sum+(o.apartment_count||0),0);}
 for(const object of out.objects){object.number=object.id;object.sourceId=object.id;object.predecessorIds=clean.object_links.filter(link=>link.successor_id===object.id).map(link=>link.predecessor_id);}
 for(const contract of out.contracts){const object=objects.get(contract.objectId);contract.propertyId=object?.propertyId||'';contract.area=object?.area;contract.objectAreaManaged=true;contract.apartmentArea=object?.apartmentArea;contract.tenantName=out.organizations.find(row=>row.id===contract.tenantPartyId)?.name||'';}
 for(const party of out.organizations)party.type ||= clean.properties.some(row=>row.owner_party_id===party.id)?'owner':'tenant';
 for(const issue of out.activities){issue.status=issueStatus[issue.status]||issue.status;issue.priority=priority[issue.priority]||issue.priority;issue.scopeType=issue.objectId?'object':issue.propertyId?'property':'';}
 for(const order of out.orders)order.status=orderStatus[order.status]||order.status;
 for(const contact of clean.contacts){
  const [table,field]=Object.entries(targetFields).find(([,field])=>contact[field])||[];
  if(!table)continue;
  out.assignments.push({id:contact.id,personId:contact.person_id,targetType:targetTypes[table],targetId:contact[field],roleKey:roleKeys[contact.role],role:contact.role,organizationId:'',fromDate:contact.valid_from||'',toDate:contact.valid_to||'',shared:contact.role!=='coordinator',cancelled:Boolean(contact.cancelled)});
 }
 // Inherited names are view values. These temporary links are never written to storage.
 for(const [table,collection] of Object.entries(viewCollections)) {
  if(!targetTypes[table])continue;
  for(const row of out[collection]){
   const record=clean[table].find(item=>item.id===row.id),resolved=coordinator(clean,table,record);
   if(!resolved?.inherited)continue;
   row.responsiblePersonId=resolved.person.id;
   if(table!=='orders'&&table!=='objects')out.assignments.push({id:'INHERITED|'+table+'|'+row.id,personId:resolved.person.id,targetType:targetTypes[table],targetId:row.id,roleKey:'our',role:'Samordnare',organizationId:'',fromDate:'',toDate:'',shared:false,provenance:{derived:'clean-inherited'}});
  }
 }
 return normalizeView(projectFinance(out));
}
export function collectWorkspace(view, baseline=emptyData()) {
 const clean=emptyData();
 clean.contacts=[];
 clean.workspace=Object.fromEntries(workspaceKeys.filter(key=>view[key]!==undefined).map(key=>[key,clone(view[key])]));
 for(const [table,collection] of Object.entries(viewCollections)) clean[table]=(view[collection]||[]).map(row=>{
  const old=(baseline[table]||[]).find(item=>item.id===row.id),record={...old,id:row.id};
  for(const [field,target] of Object.entries(viewFields[table])) record[field]=row[target]??null;
  for(const f of tables[table].fields)if(['text','textarea','email','tel','url','date','select','ref'].includes(f.type)&&record[f.key]!=null&&typeof record[f.key]!=='string')record[f.key]=String(record[f.key]);
  if(table==='properties')record.name ||= row.name||row.id;
  if(table==='issues'){
   const contract=(view.contracts||[]).find(c=>c.id===row.contractId);
   record.object_id=row.objectId||contract?.objectId||null;
   record.property_id=record.object_id?null:row.propertyId||null;
   record.status=Object.entries(issueStatus).find(([,label])=>label===row.status)?.[0]||(['Avslutad','Klar','Klart','Utförd','Utfört','Slutförd'].includes(row.status)?'done':row.status||'open');
   record.priority=Object.entries(priority).find(([,label])=>label===row.priority)?.[0]||row.priority||'normal';
  }
  if(table==='orders')record.status=Object.entries(orderStatus).find(([,label])=>label===row.status)?.[0]||row.status||'draft';
  return normalize(table,record);
 });
 for(const assignment of view.assignments||[]){
  if(assignment.provenance?.derived==='clean-inherited')continue;
  const role=Object.entries(roleKeys).find(([,key])=>key===assignment.roleKey)?.[0];
  const table=Object.entries(targetTypes).find(([,type])=>type===assignment.targetType)?.[0];
  if(!role||!table)throw Error('Personkopplingen stöds inte i den rena modellen. Koppla personen till fastighet, avtal, ärende eller beställning.');
  clean.contacts.push(normalize('contacts',{id:assignment.id,person_id:assignment.personId,role,[targetFields[table]]:assignment.targetId,valid_from:assignment.fromDate||null,valid_to:assignment.toDate||null,cancelled:Boolean(assignment.cancelled)}));
 }
 for(const object of view.objects||[])for(const previous of object.predecessorIds||[])clean.object_links.push(normalize('object_links',{id:'LINK-'+object.id+'-'+previous,predecessor_id:previous,successor_id:object.id}));
 validateData(clean,baseline);return clean;
}
