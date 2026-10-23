import {issueNumberColumn} from '../services/import-matching.js';
// Source identities belong to the issue's existing provenance, not a second register.
// Row positions are evidence only. Matching survives reordered rows and columns.
const text=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
const digest=value=>{let a=2166136261,b=5381;for(const char of JSON.stringify(value)){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b,33)^char.charCodeAt(0);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');};
const homes=new Set(['properties.id','properties.sourceId','properties.designation','properties.address','objects.id','objects.number','objects.propertyId','activities.propertyId','activities.objectId','contracts.id']);
// Match only existing records. Keep house numbers, suffixes and address ranges;
// an address identifies a property, never an inferred object within it.
export const importAddressKey=value=>text(value).replace(/[‐‑‒–—]/g,'-').replace(/\b(?:v\.?|väg|vägen)\s+(?=\d)/g,'väg ').replace(/(\d)\s+([a-zåäö])(?=$|[\s,.])/g,'$1$2');
export function issueHomeMatcher(data){
 const index=(rows,values)=>{const map=new Map();for(const row of rows)for(const value of new Set(values(row).filter(Boolean))){if(!map.has(value))map.set(value,[]);map.get(value).push(row);}return map;};
 const ids=rows=>{
  const exact=new Map(rows.map(row=>[row.id,row])),normalized=index(rows,row=>[text(row.id)]),numeric=index(rows,row=>/^\d+$/.test(row.id)?[row.id.replace(/^0+(?=\d)/,'')]:[]);
  return value=>{const id=String(value??'').trim();return exact.has(id)?[exact.get(id)]:normalized.get(text(id))||(/^\d+$/.test(id)?numeric.get(id.replace(/^0+(?=\d)/,'')):null)||[];};
 };
 const objectIds=ids(data.objects),propertyIds=ids(data.properties),properties=new Map(data.properties.map(row=>[row.id,row]));
 const managementNumbers=index(data.properties,row=>[text(row.management_object_number)]);
 const names=index(data.properties,row=>[text(row.name),text(row.popular_name)]),addresses=index(data.properties,row=>[importAddressKey(row.address)]);
 const intersect=(left,right)=>left.filter(row=>right.some(other=>other.id===row.id));
 return raw=>{
  const p=raw.properties||{},o=raw.objects||{},a=raw.issues||{};
  const objectInputs=[a.object_id,o.id].filter(value=>value!=null&&String(value).trim()),propertyInputs=[a.property_id,p.id,o.property_id].filter(value=>value!=null&&String(value).trim());
  const propertyClues=[];
  for(const input of propertyInputs){const hits=propertyIds(input);if(!hits.length)return {reason:'FastighetsID finns inte i fastighetsregistret.'};propertyClues.push(hits);}
  if(p.management_object_number){const hits=managementNumbers.get(text(p.management_object_number))||[];if(!hits.length)return {reason:'Förvaltningsobjekt finns inte i fastighetsregistret.'};propertyClues.push(hits);}
  const named=p.name?names.get(text(p.name))||[]:[],atAddress=p.address?addresses.get(importAddressKey(p.address))||[]:[];
  if(named.length)propertyClues.push(named);if(atAddress.length)propertyClues.push(atAddress);
  const cityFits=property=>!p.city||!property?.city||text(property.city)===text(p.city);
  if(objectInputs.length){
   let objects=null;
   for(const input of objectInputs){const hits=objectIds(input);if(!hits.length)return {reason:'Objektsnumret finns inte som ObjektID. Kontrollera om numret i stället är ett FastighetsID/förvaltningsnummer.'};objects=objects?intersect(objects,hits):hits;}
   objects=objects.filter(object=>cityFits(properties.get(object.property_id))&&propertyClues.every(hits=>hits.some(property=>property.id===object.property_id)));
   if(objects.length!==1)return {reason:objects.length?'Objektsnumret ger flera möjliga träffar. Komplettera med adress eller FastighetsID.':'Objektsnummer och fastighetsuppgifter pekar inte på samma fastighet.'};
   const object=objects[0];return {object,property:properties.get(object.property_id),method:atAddress.length?'object-and-address':'object-id'};
  }
  let hits=propertyClues[0]||[];for(const clue of propertyClues.slice(1))hits=intersect(hits,clue);hits=hits.filter(cityFits);
  if(hits.length!==1)return {...(!propertyInputs.length&&hits.length?{candidates:hits}:{}),reason:hits.length?'Flera fastigheter matchar uppgifterna. Komplettera med FastighetsID, fastighetsnamn eller ort.':'Ingen entydig fastighet matchar adressen och övriga fastighetsuppgifter.'};
  return {property:hits[0],method:propertyInputs.length?'property-id':p.management_object_number?'management-object-number':atAddress.length?'property-address':'property-name'};
 };
}
export function issueImportPlan(workbook,profiles,issues,context,XLSX){
 const plans=new Map(),groups=new Map(),knownFingerprints=new Map();
 for(const issue of issues)for(const source of issue.sources||[])if(source.kind==='issue-import'&&source.fingerprint){
  if(!knownFingerprints.has(source.fingerprint))knownFingerprints.set(source.fingerprint,new Set());knownFingerprints.get(source.fingerprint).add(issue.id);
 }
 for(const profile of profiles){
  if(!profile.columns.some(column=>column.target.startsWith('activities.')))continue;
  const sheet=workbook.Sheets[profile.sheetKey||profile.name];if(!sheet?.['!ref'])continue;
  const source=profile.fileName||context.fileName||'Excel',groupKey=JSON.stringify([source,profile.name]);
  if(!groups.has(groupKey))groups.set(groupKey,[]);
  const rows=new Map(),selected=profile.columns.filter(column=>!column.target.startsWith('@')),end=XLSX.utils.decode_range(sheet['!ref']).e.r;plans.set(profile,rows);
  for(let r=profile.dataStartRow??profile.headerRow;r<=end;r++){
   const values=selected.map(column=>({target:column.target,value:sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v})).filter(cell=>cell.value!=null&&cell.value!=='');
   if(!values.some(cell=>cell.target.startsWith('activities.')))continue;
   if(rows.size>=20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');
   const title=text(values.find(cell=>cell.target==='activities.title')?.value);
   const location=values.filter(cell=>homes.has(cell.target)).map(cell=>[cell.target,text(cell.value)]).sort();
   const record={kind:'issue-import',source,sheet:profile.name,row:r+1,fingerprint:digest(values.map(cell=>[cell.target,text(cell.value)]).sort()),identity:title?digest([title,location]):null};
   // Correcting a misleading source caption from ObjectID to FastighetsID must
   // still recognize the same source row. Only exact prior source identities
   // qualify, never a title-only guess or a match across files.
   const corrected=selected.find(column=>issueNumberColumn(profile,column)&&column.target==='activities.propertyId');
   const alternatives=corrected?['activities.objectId','objects.id'].map(target=>{
    const changed=values.map(cell=>({...cell,target:cell.target===corrected.target?target:cell.target}));
    return {fingerprint:digest(changed.map(cell=>[cell.target,text(cell.value)]).sort()),identity:title?digest([title,changed.filter(cell=>homes.has(cell.target)).map(cell=>[cell.target,text(cell.value)]).sort()]):null};
   }):[];
   const row={record,alternatives,explicitId:values.find(cell=>cell.target==='activities.id')?.value?.toString().trim()};rows.set(r,row);groups.get(groupKey).push(row);
  }
 }
 for(const rows of groups.values()){
  if(!rows.length)continue;
  const {source,sheet}=rows[0].record;
  const prior=issues.flatMap(issue=>(issue.sources||[]).filter(record=>record.kind==='issue-import'&&record.source===source&&record.sheet===sheet).map(record=>({issue,record})));
  const matched=new Set(),incoming=new Map(),fingerprints=new Map(),identities=new Map();
  for(const row of rows)if(!row.explicitId)incoming.set(row.record.identity,(incoming.get(row.record.identity)||0)+1);
  for(const item of prior){
   for(const [index,value]of [[fingerprints,item.record.fingerprint],[identities,item.record.identity]]){
    if(!index.has(value))index.set(value,new Set());index.get(value).add(item.issue.id);
   }
  }
  for(const row of rows){
   const {record,explicitId}=row;
   if(explicitId){row.id=String(explicitId).trim();matched.add(row.id);continue;}
   const direct=fingerprints.get(record.fingerprint)||identities.get(record.identity);
   const ids=[...(direct||new Set(row.alternatives.flatMap(candidate=>[...(fingerprints.get(candidate.fingerprint)||identities.get(candidate.identity)||[])])))];
   if(!record.identity||incoming.get(record.identity)>1||ids.length>1){row.error='Ärendet kan inte identifieras entydigt. Ange ÄrendeID för dessa rader eller gör ärendenamnet och kopplingen unika.';continue;}
   if(ids.length===1){row.id=ids[0];matched.add(row.id);}
   else if(knownFingerprints.has(record.fingerprint))row.error='Raden liknar ett ärende från en annan fil eller flik ('+[...knownFingerprints.get(record.fingerprint)].join(', ')+'). Kontrollera och ange ÄrendeID för att återanvända rätt ärende.';
  }
  const missing=prior.some(item=>!matched.has(item.issue.id));
  for(const row of rows)if(!row.id&&!row.error&&missing)row.error='Ny eller ändrad ärenderad kan inte skiljas från tidigare importerade ärenden. Ange tidigare ÄrendeID för ändrade rader. Nya rader kan läsas in när tidigare rader är identifierade.';
 }
 return plans;
}
