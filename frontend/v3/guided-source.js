// Shared, read-only interpretation of selected workbook tabs for guided imports.
// Unknown columns and past issues/year summaries are not imported.
import {inferImportColumn} from './smart-import.js';
const txt=v=>String(v??'').trim();
export const key=v=>txt(v).toLocaleLowerCase('sv').replace(/\s+/g,' ');
export const heading=v=>key(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export const same=(a,b)=>key(a)===key(b);
export const present=v=>txt(v)!=='';
const alias={
 property_number:['forvaltningsobjekt','forvaltningsobjektnummer','forvaltningsnr','forvaltningsnummer','fastighetsnummer','fastighetsnr','fastighetsid','fastnr'],
 property_address:['adress','gatuadress','fastighetsadress'],
 property_city:['ort','stad','kommun'],
 object_number:['objektsnummer','objektnummer','objektnr','lokalnummer','lokalnr'],
 agreement_number:['avtalsnummer','avtalsnr','avtalsid','kontraktsnummer','kontraktsnr','avtal','kontrakt'],
 valid_from:['startdatum','avtalsstart','avtalfran','avtalfrom','hyrestidfran','hyresstart','fran','from','giltigfran','giltigfrom'],
 legal_end_on:['slutdatum','avtalsslut','avtaltill','hyrestidtill','hyresslut','tom','tillochmed'],
 usage:['anvandning','verksamhetstyp','andamal'],
 tenant_name:['hyresgast','hyresgastnamn','hyresgastforetag','verksamhet','hyresgastorganisation'],
 tenant_org:['hyresgastorgnr','hyresgastorganisationsnummer','hyresgastorgnummer','hyresgastorg'],
 owner_name:['fastighetsagare','fastighetsagarnamn','agare','fastighetsagarbolag'],
 owner_org:['fastighetsagareorgnr','fastighetsagareorganisationsnummer','agarorgnr'],
 manager_name:['forvaltare','forvaltarnamn','fastighetsforvaltare','ansvarigforvaltare'],
 manager_email:['forvaltareepost','forvaltareemail','forvaltarmail'],
 manager_party:['forvaltarbolag','forvaltarorganisation','forvaltarforetag'],
 coordinator_name:['lokalsamordnare','lokalsamordnarenamn'],
 coordinator_email:['lokalsamordnareepost','lokalsamordnareemail','lokalsamordnaremail'],
 coordinator_party:['lokalsamordnareorganisation','lokalsamordnarebolag'],
 tenant_contact:['hyresgastkontakt','kontaktpersonhyresgast','hyresgastkontaktperson'],
 tenant_contact_email:['hyresgastkontaktepost','hyresgastkontaktemail','kontaktpersonhyresgastepost'],
 owner_contact:['fastighetsagarkontakt','fastighetsagarekontaktperson','agarkontakt'],
 owner_contact_email:['fastighetsagarkontaktepost','fastighetsagarkontaktemail'],
 person_phone:['telefon','mobilnummer','kontakttelefon']
};
const aliases=Object.fromEntries(Object.entries(alias).flatMap(([k,names])=>names.map(name=>[name,k])));
export const multiValue=v=>/[;,\r\n]/.test(txt(v))&&txt(v).split(/[;,\r\n]/).filter(present).length>1;
export const isMaster=name=>heading(name)==='lokallista';
export function isoDate(value){
 const v=txt(value);if(!v)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(v))return validDate(v)?v:'';
 const s=v.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
 if(s){const out=s[3]+'-'+s[2].padStart(2,'0')+'-'+s[1].padStart(2,'0');return validDate(out)?out:'';}
 const o=v.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})$/);
 if(o){const out=o[1]+'-'+o[2].padStart(2,'0')+'-'+o[3].padStart(2,'0');return validDate(out)?out:'';}
 return '';
}
export function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&
 !Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
export const issue=(sheet,row,field,message,value='')=>({sheet,row,field,message,value:txt(value)});
export const propertyFor=(values,snapshot)=>{
 const number=values.property_number,properties=snapshot.properties||[];
 const byNumber=number?properties.filter(p=>same(p.management_object_number,number)):[];
 const addr=values.property_address,city=values.property_city;
 const byAddress=addr&&city?properties.filter(p=>same(p.address,addr)&&same(p.city,city)):[];
 if(multiValue(number)||byNumber.length>1)return {error:'Fastighetsnumret är inte entydigt.'};
 if(byNumber.length===1){
  if(byAddress.length&&(!byAddress.includes(byNumber[0])))return {error:'Fastighetsnummer och adress pekar på olika fastigheter.'};
  return {property:byNumber[0]};
 }
 if(!number&&byAddress.length===1)return {property:byAddress[0]};
 return {error:byAddress.length>1?'Flera fastigheter matchar samma adress.':
  'Fastigheten kunde inte identifieras. Importera fastigheten först eller rätta numret.'};
};
export function readGuidedRows(sheets){
 const rows=[];
 for(const sheet of sheets||[]){
  const table=sheet.rows||[],heads=(table[0]||[]).map(heading);
  const columns={};
  for(let j=0;j<heads.length;j++){
   const normalized=heads[j],field=aliases[normalized]||inferImportColumn((table[0]||[])[j]);
   if(field&&!Object.hasOwn(columns,field))columns[field]=j;
  }
  // FörvaltningsNr takes precedence over an external FastighetsNr on mixed
  // sheets; never confuse external IDs with canonical property IDs.
  const canonical=heads.findIndex(v=>['forvaltningsnr','forvaltningsnummer',
   'forvaltningsobjekt','forvaltningsobjektnummer'].includes(v));
  if(canonical>=0)columns.property_number=canonical;
  const sheetType=heading(sheet.name),generic=(names)=>heads.findIndex(h=>names.includes(h)),
   assign=(field,names)=>{const ix=generic(names);if(ix>=0&&!Object.hasOwn(columns,field))columns[field]=ix;};
  const organization=['organisationsnummer','orgnr','orgnummer','orgno','orgnummmer'];
  const email=['epost','email','mail','epostadress'];
  const genericName=['namn','foretagsnamn','organisationsnamn','partnamn'];
  const parent=['tillhorighet','part','organisation','bolag','foretag','arbetsgivare'];
  if(['hyresgaster','hyresgast','verksamheter','verksamhet'].includes(sheetType)){
   assign('tenant_name',genericName);assign('tenant_org',organization);
  }else if(['fastighetsagare','agare'].includes(sheetType)){
   assign('owner_name',genericName);assign('owner_org',organization);
  }else if(['forvaltare','fastighetsforvaltare'].includes(sheetType)){
   assign('manager_name',genericName);assign('manager_email',email);assign('manager_party',parent);
  }else if(['lokalsamordnare'].includes(sheetType)){
   assign('coordinator_name',genericName);assign('coordinator_email',email);assign('coordinator_party',parent);
  }else if(['parter','part','organisationer'].includes(sheetType)){
   assign('party_name',genericName);assign('party_org',organization);
   assign('party_kind',['typ','parttyp','tillhorighettyp']);
  }else if(['personer','person','kontaktpersoner','kontaktperson'].includes(sheetType)){
   assign('person_name',['namn','personnamn','kontaktperson']);
   assign('person_email',email);assign('person_party',parent);
   assign('person_phone',['telefon','mobil','telefonnummer','mobilnummer']);
  }
  // The reference sheet uses "Objekt. nr" for its *property* number.
  if(heading(sheet.name)==='fastighetslista'&&!Object.hasOwn(columns,'property_number')){
   const index=heads.findIndex(v=>v==='objektnr'||v==='objektnummer');
   if(index>=0){columns.property_number=index;if(columns.object_number===index)delete columns.object_number;}
  }
  if(isMaster(sheet.name)&&!Object.hasOwn(columns,'property_number')&&
   ['name','ref','value',''].includes(heads[0]))columns.property_number=0;
  if(!Object.hasOwn(columns,'agreement_number')&&!Object.hasOwn(columns,'object_number')&&
   !Object.hasOwn(columns,'tenant_name')&&!Object.hasOwn(columns,'owner_name')&&
   !Object.hasOwn(columns,'manager_name')&&!Object.hasOwn(columns,'coordinator_name')&&
   !Object.hasOwn(columns,'tenant_contact')&&!Object.hasOwn(columns,'party_name')&&
   !Object.hasOwn(columns,'person_name'))continue;
  for(let i=1;i<table.length;i++){
   const row=table[i];if(!Array.isArray(row)||!row.some(present))continue;
   const fields=Object.fromEntries(Object.entries(columns).map(([field,index])=>[field,txt(row[index])]));
   if(!Object.values(fields).some(present))continue;
   rows.push({sheet:sheet.name,row:i+1,master:isMaster(sheet.name),fields});
  }
 }
 return rows;
}
// Workbook base records take priority. Enrichment sheets may add only
// information tied to a unique property/agreement key.
export function groupedAgreementEvidence(sheets,snapshot){
 const evidence=readGuidedRows(sheets),issues=[],groups=new Map(),byProperty=new Map();
 const hasMaster=(sheets||[]).some(s=>isMaster(s.name));
 for(const row of evidence){
  const f=row.fields,agreement=f.agreement_number;
  if(!agreement)continue;
  if(multiValue(agreement)){
   issues.push(issue(row.sheet,row.row,'Avtalsnummer',
    'Raden innehåller flera avtalsnummer i samma cell. Dela upp dem i flera rader i Excel-filen så kan vi importera dem.',agreement));continue;
  }
  // A tenant/person sheet that only names a lease is meant for the final
  // relation stage, not for guessing a new agreement or a property here.
  if(!row.master&&!Object.entries(f).some(([field,value])=>present(value)&&
   (['object_number','valid_from','legal_end_on','usage'].includes(field)||
    field.startsWith('price.'))))continue;
  const resolved=propertyFor(f,snapshot);
  if(resolved.error){issues.push(issue(row.sheet,row.row,'Fastighet',resolved.error,f.property_number));continue;}
  const property=resolved.property,token=key(agreement);
  if(!byProperty.has(token))byProperty.set(token,new Set());
  byProperty.get(token).add(property.id);
  const k=property.id+'|'+token;
  if(!groups.has(k))groups.set(k,{property,agreementNumber:agreement,evidence:[]});
  groups.get(k).evidence.push(row);
 }
 const output=[];
 for(const group of groups.values()){
  if(byProperty.get(key(group.agreementNumber)).size>1){
   const row=group.evidence[0];
   issues.push(issue(row.sheet,row.row,'Avtalsnummer',
    'Samma avtalsnummer finns på flera fastigheter. Kopplingen måste kontrolleras.',group.agreementNumber));continue;
  }
  if(hasMaster&&group.evidence.some(r=>r.master)===false){
   // Existing agreements can be enriched from standalone sheets; new ones
   // must have a Lokallista base when that source was selected.
   group.masterMissing=true;
  }
  output.push(group);
 }
 return {groups:output,issues,evidence};
}
export function pickEvidence(group,field,issues){
 const sources=group.evidence||[],base=sources.filter(r=>r.master&&present(r.fields[field])),
  all=sources.filter(r=>present(r.fields[field])),chosen=base.length?base:all;
 const distinct=[...new Map(chosen.map(r=>[key(r.fields[field]),r.fields[field]])).values()];
 const origin=chosen[0]||sources[0]||{sheet:'',row:0};
 if(distinct.length>1){
  issues.push(issue(origin.sheet,origin.row,field,
   'Flera olika värden finns för '+field+'. Uppgiften lämnas utanför importen.',distinct.join(' / ')));return {value:'',conflict:true};
 }
 if(base.length&&all.some(r=>!same(r.fields[field],distinct[0]))){
  issues.push(issue(origin.sheet,origin.row,field,
   'Uppgiften skiljer sig från Lokallista. Lokallistas värde används.',all.map(r=>r.fields[field]).join(' / ')));
 }
 return {value:distinct[0]||'',conflict:false};
}
