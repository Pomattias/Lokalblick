// Guided stage 2: identify objects from the already approved workbook.
// A source row without a physical object number may create a provisional
// number only when it has a single, unambiguous agreement on a known property.
import {nextObjectNumber} from './numbering.js';

const text=v=>String(v??'').trim();
const low=v=>text(v).toLocaleLowerCase('sv').replace(/\s+/g,' ');
const header=v=>low(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const same=(a,b)=>low(a)===low(b);
const present=v=>text(v)!=='';
const pick=(headers,aliases)=>headers.findIndex(v=>aliases.includes(v));
const aliases={
 property:['forvaltningsobjekt','forvaltningsobjektnummer','forvaltningsnr','forvaltningsnummer','fastighetsnummer','fastighetsnr','fastighetsid','fastnr'],
 object:['objektsnummer','objektnummer','objektnr','lokalnummer','lokalnr'],
 agreement:['avtalsnummer','avtalsnr','avtal','avtalsid','kontraktsnummer','kontraktsnr','kontrakt'],
 area:['area','yta','kvm','ytakvm','ytam2','lokalyta'],
 start:['startdatum','avtalsstart','avtalfran','hyrestidfran','giltigfran','from','fromdatum'],
 address:['adress','gatuadress','fastighetsadress'],
 city:['ort','stad','kommun']
};
const isMaster=s=>header(s)==='lokallista';
const hasMany=v=>/[;,\r\n]/.test(text(v))&&text(v).split(/[;,\r\n]/).filter(present).length>1;
const at=(row,column)=>column<0?'':text(row[column]);
const addrKey=(a,c)=>present(a)&&present(c)?low(a)+'|'+low(c):'';
const safeDate=value=>{
 const t=text(value);if(!t)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;
 const match=t.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
 if(match)return match[3]+'-'+match[2].padStart(2,'0')+'-'+match[1].padStart(2,'0');
 return '';
};
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
function areaValue(value){
 const v=text(value);if(!v)return null;
 const normalized=v.replace(/[\s\u00a0]/g,'').replace(',','.');
 if(!/^\d+(\.\d+)?$/.test(normalized))return NaN;
 return Number(normalized);
}
function issue(sheet,row,field,message,value=''){return {sheet,row,field,message,value:text(value)};}
export const generatedObjectMessage='Vi kan inte utläsa objekten med objektsnummer. Vi skapar därför objektsnummer för att koppla ihop fastigheten med avtalen. Objektsnummer går att ändra i efterhand.';

export function prepareObjectStage(sheets,snapshot,{makeId=()=>crypto.randomUUID(),objectLinks={}}={}){
 const properties=snapshot.properties||[],objects=snapshot.objects||[],agreements=snapshot.agreements||[];
 const issues=[],entries=[],commands=[],raw=[],byAgreement=new Map(),planned=[];
 const found=new Map(),existingRefs={...objectLinks};
 const masterSelected=(sheets||[]).some(s=>isMaster(s.name));
 for(const sheet of sheets||[]){
  const rows=sheet.rows||[],heads=(rows[0]||[]).map(header);
  const indices=Object.fromEntries(Object.entries(aliases).map(([k,words])=>[k,pick(heads,words)]));
  if(isMaster(sheet.name)&&indices.property<0&&['name','ref','value',''].includes(heads[0]))indices.property=0;
  if(header(sheet.name)==='fastighetslista'&&indices.property<0)
   indices.property=pick(heads,['objektnr','objektnummer']); // this sheet uses "Objekt. nr" for property
  if(header(sheet.name)==='lokalbestand'&&indices.property<0)
   indices.property=pick(heads,['objektsnummerforvaltningsobjekt']);
  // A column named "Objekt. nr" is not an unambiguous physical object number.
  if(header(sheet.name)==='fastighetslista'&&indices.object===indices.property)indices.object=-1;
  if(header(sheet.name)==='lokalbestand'&&indices.object===indices.property)indices.object=-1;
  if(indices.object<0&&indices.agreement<0)continue;
  for(let i=1;i<rows.length;i++){
   const row=rows[i];if(!Array.isArray(row)||!row.some(present))continue;
   const sourceRow=i+1,rawObject=at(row,indices.object),rawAgreement=at(row,indices.agreement);
   if(!rawObject&&!rawAgreement)continue;
   const propertyNo=at(row,indices.property),address=at(row,indices.address),city=at(row,indices.city);
   if(hasMany(rawAgreement))issues.push(issue(sheet.name,sourceRow,'Avtalsnummer',
    'Raden innehåller flera avtalsnummer i samma cell. Dela upp dem i flera rader i Excel-filen så kan vi importera dem.',rawAgreement));
   if(hasMany(rawObject))issues.push(issue(sheet.name,sourceRow,'Objektsnummer',
    'Flera objektsnummer i samma cell. Dela upp raden i Excel-filen.',rawObject));
   const byNum=propertyNo?properties.filter(p=>same(p.management_object_number,propertyNo)):[];
   const byAddr=addrKey(address,city)?properties.filter(p=>addrKey(p.address,p.city)===addrKey(address,city)):[];
   let property=null;
   if(byNum.length===1)property=byNum[0];
   else if(!propertyNo&&byAddr.length===1)property=byAddr[0];
   if(property&&byAddr.length&&(!byAddr.includes(property))){
    issues.push(issue(sheet.name,sourceRow,'Fastighet',
     'Fastighetsnummer och adress pekar på olika fastigheter. Raden lämnas utanför.',propertyNo));
    property=null;
   }
   if(!property){
    const message=byNum.length>1||byAddr.length>1?'Fastigheten kan inte identifieras entydigt.':
     'Fastigheten finns inte i registret. Importera fastigheten först eller rätta numret.';
    issues.push(issue(sheet.name,sourceRow,'Fastighet',message,propertyNo));
    entries.push({status:'review',sourceRow,sheet:sheet.name,propertyNumber:propertyNo,
     agreementNumber:rawAgreement,objectNumber:rawObject,reason:message});continue;
   }
   if(propertyNo&&/[;,\r\n]/.test(propertyNo)){
    issues.push(issue(sheet.name,sourceRow,'Fastighet','Flera fastighetsnummer i samma cell.',propertyNo));
    continue;
   }
   raw.push({sourceRow,sheet:sheet.name,master:isMaster(sheet.name),property,
    propertyId:property.id,propertyNumber:property.management_object_number||propertyNo,
    objectNumber:hasMany(rawObject)?'':rawObject,
    agreementNumber:hasMany(rawAgreement)?'':rawAgreement,
    invalidAgreement:hasMany(rawAgreement),invalidObject:hasMany(rawObject),
    area:at(row,indices.area),start:at(row,indices.start)});
  }
 }
 const useMaster=masterSelected&&raw.some(r=>r.master&&(r.objectNumber||r.agreementNumber));
 const base=useMaster?raw.filter(r=>r.master):raw;
 const enrichment=useMaster?raw.filter(r=>!r.master):[];
 const supplement=new Map();
 for(const extra of enrichment){
  const target=extra.agreementNumber?base.filter(b=>b.propertyId===extra.propertyId&&
   b.agreementNumber&&same(b.agreementNumber,extra.agreementNumber)):[];
  if(target.length===0)continue; // enrich only: never create independent objects
  if(target.length!==1)continue;
  const row=target[0],ident=row.propertyId+'|'+low(row.agreementNumber);
  if(!supplement.has(ident))supplement.set(ident,[]);
  supplement.get(ident).push(extra);
 }
 const rows=[];
 for(const r of base){
  const extras=r.agreementNumber?supplement.get(r.propertyId+'|'+low(r.agreementNumber))||[]:[];
  const nums=[r.objectNumber,...extras.map(x=>x.objectNumber)].filter(present);
  const unique=[...new Map(nums.map(v=>[low(v),v])).values()];
  if(unique.length>1){
   issues.push(issue(r.sheet,r.sourceRow,'Objektsnummer',
    'Flera olika objektsnummer har hittats för samma avtal. Kontrollera i Excel.',unique.join(' / ')));
   entries.push({...r,status:'review',reason:'Motstridiga objektsnummer'});continue;
  }
  rows.push({...r,objectNumber:unique[0]||'',areaCandidates:[r,...extras].filter(x=>present(x.area)),
   dates:[r,...extras].filter(x=>present(x.start))});
 }
 const agreementToObjects=new Map(),agreementPropertyIds=new Map();
 for(const row of rows)if(row.agreementNumber){
  const key=low(row.agreementNumber);
  if(!agreementPropertyIds.has(key))agreementPropertyIds.set(key,new Set());
  agreementPropertyIds.get(key).add(row.propertyId);
 }
 for(const row of rows)if(row.agreementNumber&&row.objectNumber){
  const agKey=row.propertyId+'|'+low(row.agreementNumber);
  if(!agreementToObjects.has(agKey))agreementToObjects.set(agKey,new Set());
  agreementToObjects.get(agKey).add(low(row.objectNumber));
 }
 // When multiple selected sheets refer to the same agreement, a unique
 // explicit object number may enrich otherwise numberless rows.
 for(const row of rows)if(row.agreementNumber&&!row.objectNumber){
  const matches=rows.filter(r=>r.propertyId===row.propertyId&&
   r.agreementNumber&&same(r.agreementNumber,row.agreementNumber)&&r.objectNumber);
  const names=[...new Map(matches.map(r=>[low(r.objectNumber),r.objectNumber])).values()];
  if(names.length===1)row.objectNumber=names[0];
 }
 const groups=new Map();
 for(const row of rows){
  if(row.invalidAgreement&&!row.objectNumber)continue;
  if(row.agreementNumber&&agreementPropertyIds.get(low(row.agreementNumber))?.size>1){
   issues.push(issue(row.sheet,row.sourceRow,'Avtalsnummer',
    'Samma avtalsnummer förekommer på flera fastigheter. Kontrollera kopplingen.',row.agreementNumber));
   entries.push({...row,status:'review',reason:'Avtalet hör till flera fastigheter'});continue;
  }
  const agKey=row.agreementNumber?row.propertyId+'|'+low(row.agreementNumber):'';
  if(agKey&&agreementToObjects.get(agKey)?.size>1){
   issues.push(issue(row.sheet,row.sourceRow,'Avtalsnummer',
    'Samma avtalsnummer pekar på olika objekt. Kontrollera i Excel.',row.agreementNumber));
   entries.push({...row,status:'review',reason:'Otydlig koppling mellan avtal och objekt'});continue;
  }
  const currentAgreement=agreements.filter(a=>row.agreementNumber&&same(a.agreement_number,row.agreementNumber));
  if(currentAgreement.length>1){
   issues.push(issue(row.sheet,row.sourceRow,'Avtalsnummer','Avtalsnumret finns flera gånger i registret.'));
   entries.push({...row,status:'review',reason:'Avtalet är inte unikt'});continue;
  }
  const linked=currentAgreement[0]?objects.find(o=>o.id===currentAgreement[0].object_id):null;
  if(linked&&linked.property_id!==row.propertyId){
   issues.push(issue(row.sheet,row.sourceRow,'Fastighet','Avtalet är redan kopplat till en annan fastighet.'));
   entries.push({...row,status:'review',reason:'Avtalets fastighet stämmer inte'});continue;
  }
  if(linked&&row.objectNumber&&!same(linked.object_number,row.objectNumber)){
   issues.push(issue(row.sheet,row.sourceRow,'Objektsnummer','Avtalet är redan kopplat till ett annat objektsnummer.'));
   entries.push({...row,status:'review',reason:'Befintlig objektkoppling skiljer sig'});continue;
  }
  const referenced=agKey&&existingRefs[agKey]?objects.find(o=>o.id===existingRefs[agKey]):null;
  if(referenced&&referenced.property_id!==row.propertyId){
   issues.push(issue(row.sheet,row.sourceRow,'Fastighet','Tidigare importerad objektkoppling stämmer inte.'));
   entries.push({...row,status:'review',reason:'Importkopplingen är osäker'});continue;
  }
  if(referenced&&row.objectNumber&&!same(referenced.object_number,row.objectNumber)){
   issues.push(issue(row.sheet,row.sourceRow,'Objektsnummer','Tidigare objektkoppling har ett annat nummer.'));
   entries.push({...row,status:'review',reason:'Importkopplingen är osäker'});continue;
  }
  // An agreement without a known object becomes its own provisional link;
  // different agreement numbers are never collapsed into one unknown object.
  const number=row.objectNumber||linked?.object_number||referenced?.object_number||'';
  const groupKey=number?row.propertyId+'|obj|'+low(number):row.propertyId+'|agreement|'+low(row.agreementNumber);
  if(!groupKey||groupKey.endsWith('|agreement|'))continue;
  if(!groups.has(groupKey))groups.set(groupKey,{
   property:row.property,objectNumber:number,linked:linked||referenced,
   refs:[],agreementNumbers:new Set(),areaCandidates:[],dates:[]});
  const group=groups.get(groupKey);
  if(linked&&group.linked&&group.linked.id!==linked.id){
   issues.push(issue(row.sheet,row.sourceRow,'Objekt','Olika objekt är redan kopplade till samma nummer.'));
   group.invalid=true;
  }
  if(linked&&!group.linked)group.linked=linked;
  group.refs.push({sheet:row.sheet,row:row.sourceRow});
  if(row.agreementNumber)group.agreementNumbers.add(row.agreementNumber);
  group.areaCandidates.push(...row.areaCandidates);
  group.dates.push(...row.dates);
 }
 const reserved=[...objects];
 for(const group of groups.values()){
  const source=group.refs[0],reason=(field,msg,value='')=>issues.push(issue(source.sheet,source.row,field,msg,value));
  const ags=[...group.agreementNumbers],property=group.property;
  let obj=group.linked||null,number=group.objectNumber;
  if(group.invalid){
   entries.push({status:'review',sheet:source.sheet,sourceRow:source.row,propertyNumber:property.management_object_number,
    agreementNumber:ags.join(', '),objectNumber:number,reason:'Motstridiga kopplingar'});continue;
  }
  if(number){
   const candidates=reserved.filter(o=>o.property_id===property.id&&same(o.object_number,number));
   if(candidates.length>1||candidates.length===1&&obj&&candidates[0].id!==obj.id){
    reason('Objektsnummer','Objektsnumret är inte unikt på fastigheten.',number);
    entries.push({status:'review',sheet:source.sheet,sourceRow:source.row,propertyNumber:property.management_object_number,
     agreementNumber:ags.join(', '),objectNumber:number,reason:'Dubbelt objektsnummer'});continue;
   }
   if(!obj)obj=candidates[0]||null;
  }
  let generated=false;
  if(!number){
   // No durable agreement -> object link exists until the later agreement
   // stage. Do not invent more objects if there are already orphan objects.
   // In-session objectLinks above recognizes objects just imported.
   const unlinked=objects.filter(o=>o.property_id===property.id&&
    !agreements.some(a=>a.object_id===o.id)&&!Object.values(existingRefs).includes(o.id));
   if(unlinked.length){
    reason('Objektsnummer','Fastigheten har redan objekt utan avtalskoppling. För att undvika dubbletter behöver objektsnumret anges i Excel.');
    entries.push({status:'review',sheet:source.sheet,sourceRow:source.row,
     propertyNumber:property.management_object_number,agreementNumber:ags.join(', '),
     objectNumber:'',reason:'Befintliga objekt behöver matchas'});continue;
   }
   number=nextObjectNumber(property,reserved,properties);
   if(!number){
    reason('Objektsnummer','Kan inte föreslå ett unikt objektsnummer. Kontrollera fastighetsnumret.');
    entries.push({status:'review',sheet:source.sheet,sourceRow:source.row,propertyNumber:property.management_object_number,
     agreementNumber:ags.join(', '),objectNumber:'',reason:'Numrering saknas'});continue;
   }
   generated=true;
  }
  const parsedDates=group.dates.map(x=>({value:safeDate(x.start),raw:x.start,sheet:x.sheet,row:x.sourceRow}));
  const invalid=parsedDates.filter(x=>!validDate(x.value));
  if(invalid.length)for(const bad of invalid)reason('Startdatum',
   'Datumet kan inte tolkas. Ett säkert objekt kan inte importeras med detta datum.',bad.raw);
  const earliest=parsedDates.filter(x=>validDate(x.value)).map(x=>x.value).sort()[0];
  const validFrom=earliest||snapshot.asOf||'2026-01-01';
  if(!validDate(validFrom)){reason('Startdatum','Giltigt startdatum saknas.');continue;}
  const areas=group.areaCandidates.map(r=>({value:areaValue(r.area),raw:r.area}));
  const invalidAreas=areas.filter(x=>!Number.isFinite(x.value)||x.value<0);
  if(invalidAreas.length)reason('Area','Ogiltig area. Objektet kan importeras utan area.',invalidAreas[0].raw);
  const uniqueArea=[...new Set(areas.filter(x=>Number.isFinite(x.value)&&x.value>=0).map(x=>x.value))];
  if(uniqueArea.length>1)reason('Area','Olika areor i filen. Objektet importeras utan area.',uniqueArea.join(' / '));
  const area=invalidAreas.length||uniqueArea.length>1?null:uniqueArea[0]??null;
  if(obj){
   const currentArea=obj.currentVersion?.area??obj.versions?.[0]?.area;
   if(area!=null&&currentArea!=null&&Number(currentArea)!==area)
    reason('Area','Area skiljer sig från befintligt objekt. Det befintliga värdet behålls.',String(area));
  }else{
   if(invalid.length){
    entries.push({status:'review',sheet:source.sheet,sourceRow:source.row,propertyNumber:property.management_object_number,
     agreementNumber:ags.join(', '),objectNumber:number,reason:'Ogiltigt startdatum'});continue;
   }
   obj={id:makeId(),property_id:property.id,object_number:number};
   reserved.push(obj);
   commands.push({action:'createObject',id:obj.id,sourceRow:source.row,
    fields:{property_id:property.id,object_number:number,valid_from:validFrom,
     ...(area!=null?{area}:{})}});
  }
  const entry={status:commands.some(c=>c.id===obj.id)?'new':'existing',
   id:obj.id,propertyId:property.id,propertyNumber:property.management_object_number,
   propertyName:property.name,objectNumber:number,agreementNumber:ags.join(', '),agreementNumbers:ags,
   generated,area:area??null,validFrom,sheet:source.sheet,sourceRow:source.row,refs:group.refs};
  entries.push(entry);
  for(const contract of ags){
   const linkKey=property.id+'|'+low(contract);
   if(byAgreement.has(linkKey)&&byAgreement.get(linkKey)!==obj.id){
    reason('Avtalsnummer','Avtalet pekar på flera objekt och kan inte kopplas automatiskt.',contract);
    delete found[linkKey];
   }else{byAgreement.set(linkKey,obj.id);found[linkKey]=obj.id;}
  }
 }
 return {commands,entries,issues,objectLinks:found,stats:{
  found:entries.length,new:entries.filter(x=>x.status==='new').length,
  existing:entries.filter(x=>x.status==='existing').length,
  review:entries.filter(x=>x.status==='review').length,
  generated:entries.filter(x=>x.status==='new'&&x.generated).length,
  issues:issues.length}};
}
