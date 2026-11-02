// Reviewed import of lease rows without requiring a global parent selection.
// Exact property + lease business numbers are identity evidence; they do not
// imply that each lease represents a distinct physical rental object.
import {agreementNumberParts} from '../lokaler/business-identities.js';
import {nextObjectNumber} from './numbering.js';
const trim=value=>String(value??'').trim();
const key=value=>trim(value).toLocaleLowerCase('sv');
export function prepareAgreementLinks(rows,snapshot,choices={},makeId=()=>crypto.randomUUID()){
 const commands=[],records=[],errors=[];
 const properties=snapshot.properties||[],objects=snapshot.objects||[],agreements=snapshot.agreements||[];
 const seenAgreements=new Set(),createdObjects=new Map(),newObjects=[];
 const objectById=id=>objects.find(x=>x.id===id)||newObjects.find(x=>x.id===id);
 for(let i=0;i<rows.length;i++){
  const {fields:data,sourceRow=i+2}=rows[i], propertyNumber=trim(data.management_object_number),
   agreementNumber=trim(data.agreement_number),explicitObject=trim(data.object_number);
  const record={sourceRow,propertyNumber,agreementNumber,objectNumber:explicitObject||null,
   propertyId:null,objectId:null,action:'review',reason:'',candidates:[],suggestedObject:null};
  const fail=reason=>{record.reason=reason;errors.push('Rad '+sourceRow+': '+reason);records.push(record)};
  if(!propertyNumber||!agreementNumber){fail('Fastighetsnummer och avtalsnummer krävs.');continue;}
  if(seenAgreements.has(key(agreementNumber))){fail('Avtalsnumret förekommer flera gånger i importfilen.');continue;}
  seenAgreements.add(key(agreementNumber));
  const matches=properties.filter(p=>key(p.management_object_number)===key(propertyNumber));
  if(matches.length!==1){fail(matches.length?'Flera fastigheter har samma fastighetsnummer.':'Fastighetsnumret finns inte i registret. Importera eller skapa fastigheten först.');continue;}
  const property=matches[0];record.propertyId=property.id;
  const existingAgreement=agreements.filter(a=>key(a.agreement_number)===key(agreementNumber));
  if(existingAgreement.length){
   const existing=existingAgreement[0],object=objectById(existing.object_id);
   if(!object||object.property_id!==property.id){fail('Avtalsnumret är redan kopplat till en annan fastighet.');continue;}
   if(explicitObject&&key(object.object_number)!==key(explicitObject)){fail('Befintligt avtal har ett annat objektnummer än i importen.');continue;}
   record.objectId=object.id;record.objectNumber=object.object_number;
   record.action='existing';record.reason='Avtalet och dess befintliga objektkoppling återanvänds; ingen dubblett skapas.';
   records.push(record);continue;
  }
  if(!trim(data.valid_from)){fail('Startdatum krävs för nytt avtal.');continue;}
  const parts=agreementNumberParts(agreementNumber);
  const derived=parts&&key(parts.propertyId)===key(propertyNumber)?parts.objectId:null;
  record.suggestedObject=derived;
  const local=objects.filter(o=>o.property_id===property.id);
  record.candidates=local.map(o=>({id:o.id,number:o.object_number}));
  const direct=explicitObject?local.filter(o=>key(o.object_number)===key(explicitObject)):[];
  const inferred=!explicitObject&&derived?local.filter(o=>key(o.object_number)===key(derived)):[];
  let chosen=choices[i]||null;
  if(!chosen&&direct.length===1)chosen=direct[0].id;
  if(!chosen&&inferred.length===1)chosen=inferred[0].id;
  if(!chosen){
   record.reason='Välj ett befintligt objekt eller välj uttryckligen att skapa ett nytt.';
   errors.push('Rad '+sourceRow+': '+record.reason);
   records.push(record);continue;
  }
  let object;
  if(chosen==='@new'){
   const proposed=explicitObject||derived||nextObjectNumber(property,[...objects,...newObjects],properties);
   if(!proposed){fail('Objektnummer kunde inte föreslås. Kontrollera fastighetsnummer eller välj befintligt objekt.');continue;}
   if(local.some(o=>key(o.object_number)===key(proposed))){fail('Objektnumret finns redan på fastigheten. Välj det befintliga objektet.');continue;}
   const token=property.id+'|'+key(proposed);
   object=createdObjects.get(token);
   if(object&&data.valid_from<object.valid_from){fail('Ett tidigare avtalsdatum för samma nya objekt finns i filen. Sortera efter avtalsstart.');continue;}
   if(!object){
    object={id:makeId(),property_id:property.id,object_number:proposed,valid_from:data.valid_from};
    createdObjects.set(token,object);newObjects.push(object);
    commands.push({action:'createObject',id:object.id,sourceRow,fields:{
     property_id:property.id,object_number:proposed,valid_from:data.valid_from,
     ...(data.area!=null&&data.area!==''?{area:data.area}:{})
    }});
   }
   record.action='create-object-and-agreement';
  }else{
   object=objectById(chosen);
   if(!object||object.property_id!==property.id){fail('Valt objekt hör inte till fastigheten.');continue;}
   if(explicitObject&&key(object.object_number)!==key(explicitObject)){fail('Objektnumret i källfilen stämmer inte med valt objekt.');continue;}
   record.action='create-agreement';
  }
  record.objectId=object.id;record.objectNumber=object.object_number;
  commands.push({action:'createAgreement',sourceRow,fields:{
   object_id:object.id,agreement_number:agreementNumber,valid_from:data.valid_from,
   ...(trim(data.legal_end_on)?{legal_end_on:data.legal_end_on}:{}),
   ...(trim(data.usage)?{usage:data.usage}:{})
  }});
  record.reason=record.action==='create-agreement'?'Koppla nytt avtal till befintligt objekt.':
   'Skapa nytt objekt och koppla nytt avtal (objektets area är okänd om den inte anges).';
  records.push(record);
 }
 if(commands.length>200)errors.push('Fler än 200 ändringar i en import. Dela upp filen.');
 return {commands,records,errors};
}
