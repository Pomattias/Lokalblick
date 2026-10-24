// Business numbers are presentation and matching facts. Internal keys remain
// available for references, but must never become a user's property/object number.
const text=value=>String(value??'').trim();
const internalPattern=/(?:\b(?:FAS-[a-z\d]+|(?:PER|PAR|KOP|OBJ|ARE|BES|POST|KOS|UND)-[a-f\d-]{8,}|OB-[^\s,;<>"']+|OBJ\|[^\s,;<>"']+|(?:base|addition|heat|water|tax|electricity|waste|other)(?::\d+)?\|[^\s,;<>"']+|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})\b)/gi;
export const isInternalIdentifier=value=>{internalPattern.lastIndex=0;const match=text(value).match(internalPattern);return Boolean(match?.some(part=>part===text(value)));};
export const visibleNumber=(value,missing='Nummer saknas')=>text(value)&&!isInternalIdentifier(value)?text(value):missing;
export const managementPropertyNumber=value=>/^\d+$/.test(text(value))?'SF'+text(value):text(value);

export function agreementNumberParts(value){
 const id=text(value),parts=/^([A-Za-z]{0,8}-?\d+)-(\d+)(?:-(\d+))?$/.exec(id);
 if(!parts||id.length>100||/^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(id))return null;
 return {propertyId:parts[1],objectId:parts[3]?parts[1]+'-'+parts[2]:null,agreementId:id};
}

export function createBusinessLabels(data={}){
 data ||= {};
 const agreements=data.agreements||data.contracts||[],objects=data.objects||[],properties=data.properties||[];
 const objectParts=new Map();
 for(const agreement of agreements){
  const objectId=agreement.object_id||agreement.objectId,parts=agreementNumberParts(agreement.number||agreement.id);
  if(!objectId||!parts?.objectId)continue;
  if(!objectParts.has(objectId))objectParts.set(objectId,new Set());objectParts.get(objectId).add(parts.objectId);
 }
 const propertyNumbers=new Map(properties.map(row=>[row.id,visibleNumber(managementPropertyNumber(row.management_object_number||row.managementObjectNumber)||row.id,'Fastighetsnummer saknas')]));
 const objectNumbers=new Map(objects.map(row=>{
  const explicit=visibleNumber(row.number||row.id,''),parts=objectParts.get(row.id);
  return [row.id,explicit||(parts?.size===1?[...parts][0]:parts?.size>1?'Objektnummer behöver kontrolleras':'Objektnummer saknas')];
 }));
 const collections={properties,objects,agreements,people:data.people||[],parties:data.parties||data.organizations||[],contacts:data.contacts||data.assignments||[],issues:data.issues||data.activities||[],orders:data.orders||[],agreement_items:data.agreement_items||data.agreementItems||[]};
 const records=Object.fromEntries(Object.entries(collections).map(([table,rows])=>[table,new Map(rows.map(row=>[row.id,row]))]));
 const number=(table,id)=>table==='properties'?propertyNumbers.get(id)||visibleNumber(id,'Fastighetsnummer saknas'):table==='objects'?objectNumbers.get(id)||visibleNumber(id,'Objektnummer saknas'):visibleNumber(id,'Nummer saknas');
 const label=(table,id)=>{
  const row=records[table]?.get(id);
  if(table==='properties'||table==='objects')return number(table,id);
  if(table==='contacts'){const person=records.people.get(row?.person_id||row?.personId);return visibleNumber(person?.name,'Personkoppling');}
  if(table==='agreement_items')return visibleNumber(row?.name,'Pris på avtal');
  return visibleNumber(row?.name||row?.title||row?.number,number(table,id));
 };
 const replacements=new Map();
 for(const [table,index]of Object.entries(records))for(const [id]of index)if(isInternalIdentifier(id))replacements.set(id,label(table,id));
 const cleanText=value=>{internalPattern.lastIndex=0;return String(value??'').replace(internalPattern,id=>replacements.get(id)||'Nummer saknas');};
 return {number,label,text:cleanText,objectNumbers,propertyNumbers};
}
