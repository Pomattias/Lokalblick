// Strict core-only import plan. No write occurs here; a single versioned API transaction commits the plan.
import {agreementNumberParts} from '../lokaler/business-identities.js';
import {nextObjectNumber} from './numbering.js';

export const coreImportFields=[
 'property_number','property_name','property_address','property_city',
 'object_number','area','agreement_number','valid_from','legal_end_on',
 'tenant_name','tenant_org','usage'
];
const allowed=new Set(coreImportFields);
const txt=x=>String(x??'').trim();
const norm=x=>txt(x).toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const eq=(a,b)=>norm(a)===norm(b);
const date=x=>{
 const raw=txt(x);
 if(!raw)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
 const sw=raw.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
 return sw?sw[3]+'-'+sw[2].padStart(2,'0')+'-'+sw[1].padStart(2,'0'):raw;
};
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const area=x=>{
 const raw=txt(x).replace(/[\s\u00a0]/g,'').replace(',','.');
 if(!raw)return null;
 const n=Number(raw);
 return Number.isFinite(n)&&n>=0?n:null;
};

// All rows are inspected; only the four approved registers can produce write commands.
// Re-importing the same input is read-only and existing versions/links are preserved.
export function prepareCoreImport({headers=[],rows=[]},snapshot={},{
 mapping=[],objectChoices={},makeId=()=>crypto.randomUUID()
}={}){
 const cols=mapping.map(k=>allowed.has(k)?k:'');
 const ignored=headers.flatMap((_,i)=>cols[i]?[]:[i]);
 const errors=[],commands=[],records=[];
 const properties=[...(snapshot.properties||[])],objects=[...(snapshot.objects||[])],
  agreements=[...(snapshot.agreements||[])],parties=[...(snapshot.parties||[])],
  assignments=[...(snapshot.stakeholderAssignments||[])];
 const initiallyKnown=new Set(agreements.map(a=>a.id));
 const seenAgreements=new Set(),earliestObjectDate=new Map();
 const id=()=>makeId();
 const get=(row,k)=>{const i=cols.indexOf(k);return i<0?'':txt(row[i]);};
 for(const row of rows){
  const propertyNumber=get(row,'property_number'),objectNumber=get(row,'object_number');
  const from=date(get(row,'valid_from'));
  if(!propertyNumber||!objectNumber||!validDate(from))continue;
  const token=norm(propertyNumber)+'|'+norm(objectNumber),previous=earliestObjectDate.get(token);
  if(!previous||from<previous)earliestObjectDate.set(token,from);
 }
 const write=(action,fields,sourceRow,extra={})=>commands.push({action,fields,sourceRow,...extra});
 if(rows.length>200)errors.push('Högst 200 datarader får ingå. Dela upp filen.');
 if(!cols.some(Boolean))errors.push('Ingen tillåten kolumn har identifierats.');
 if(cols.filter(Boolean).length!==new Set(cols.filter(Boolean)).size)errors.push('Samma fält har valts för flera kolumner.');
 for(let i=0;i<Math.min(rows.length,200);i++){
  const row=rows[i],sourceRow=i+2,begin=commands.length,failures=[],created=[];
  const fail=msg=>failures.push(msg);
  const propertyNumber=get(row,'property_number'),propertyName=get(row,'property_name'),
   objectNumber=get(row,'object_number'),agreementNumber=get(row,'agreement_number'),
   from=date(get(row,'valid_from')),until=date(get(row,'legal_end_on')),
   tenantName=get(row,'tenant_name'),tenantOrg=get(row,'tenant_org');
  const info={index:i,sourceRow,propertyNumber,propertyName,objectNumber,
   agreementNumber,propertyId:null,objectId:null,candidates:[],created,
   relationships:[],pricePreview:[],warnings:[],status:'matched',description:'',reason:''};
  const finish=()=>{
   if(failures.length){info.status='review';info.reason=failures.join(' · ');errors.push('Rad '+sourceRow+': '+info.reason);}
   else if(commands.length>begin){info.status='new';info.description=created.join(', ')||'Ny koppling';}
   else info.description='Oförändrad – befintliga poster återanvänds';
   records.push(info);
  };
  if(!propertyNumber){fail('FörvaltningsNr krävs för säker fastighetsmatchning.');finish();continue;}
  const matches=properties.filter(p=>eq(p.management_object_number,propertyNumber));
  if(matches.length>1){fail('FörvaltningsNr är inte unikt.');finish();continue;}
  let property=matches[0];
  if(!property){
   if(!propertyName){fail('En ny fastighet måste ha fastighetsnamn.');finish();continue;}
   if(properties.some(p=>eq(p.name,propertyName)&&!eq(p.management_object_number,propertyNumber)))
    fail('Fastighetsnamnet används redan med ett annat nummer. Kontrollera identiteten.');
   if(failures.length){finish();continue;}
   property={id:id(),name:propertyName,management_object_number:propertyNumber,
    address:get(row,'property_address')||null,city:get(row,'property_city')||null};
   properties.push(property);
   write('createProperty',{name:property.name,management_object_number:propertyNumber,
    ...(property.address?{address:property.address}:{}),...(property.city?{city:property.city}:{})},sourceRow,{id:property.id});
   created.push('fastighet');
  }else{
   for(const [key,val,label] of [
    ['name',propertyName,'namn'],['address',get(row,'property_address'),'adress'],
    ['city',get(row,'property_city'),'ort']
   ])if(val&&property[key]&&!eq(val,property[key]))
    fail('Fastighetens '+label+' skiljer sig från sparat värde. Ändra i registret.');
  }
  info.propertyId=property.id;
  if(from&&!validDate(from))fail('Ogiltigt startdatum.');
  if(until&&!validDate(until))fail('Ogiltigt slutdatum.');
  if(from&&until&&validDate(from)&&validDate(until)&&until<from)
   fail('Slutdatum ligger före startdatum.');
  if(agreementNumber){
   if(seenAgreements.has(norm(agreementNumber)))fail('Avtalsnumret förekommer flera gånger i filen.');
   seenAgreements.add(norm(agreementNumber));
  }
  const contractMatches=agreementNumber?agreements.filter(a=>eq(a.agreement_number,agreementNumber)):[];
  if(contractMatches.length>1)fail('Avtalsnumret är inte unikt i databasen.');
  let agreement=contractMatches[0]||null;
  let object=agreement?objects.find(o=>o.id===agreement.object_id):null;
  if(agreement&&(!object||object.property_id!==property.id))fail('Befintligt avtal tillhör en annan fastighet.');
  if(object&&objectNumber&&!eq(object.object_number,objectNumber))fail('Objektnumret skiljer sig från avtalets sparade koppling.');
  const local=objects.filter(o=>o.property_id===property.id);
  info.candidates=local.map(o=>({id:o.id,number:o.object_number}));
  if(!object&&objectNumber){
   const candidates=local.filter(o=>eq(o.object_number,objectNumber));
   if(candidates.length>1)fail('Objektnumret är inte entydigt.');
   else object=candidates[0]||null;
  }
  const parts=agreementNumber?agreementNumberParts(agreementNumber):null;
  const inferred=parts&&eq(parts.propertyId,propertyNumber)?parts.objectId:null;
  if(!object&&!objectNumber&&inferred){
   const candidates=local.filter(o=>eq(o.object_number,inferred));
   if(candidates.length===1)object=candidates[0];
   else if(candidates.length>1)fail('Härlett objektnummer är tvetydigt.');
  }
  if(!object&&objectChoices[i]&&objectChoices[i]!=='@new'){
   object=local.find(o=>o.id===objectChoices[i]);
   if(!object)fail('Valt objekt hör inte till fastigheten.');
   else if(objectNumber&&!eq(object.object_number,objectNumber))fail('Valt objekt har annat nummer.');
  }
  if(!object&&!failures.length&&(objectNumber||objectChoices[i]==='@new')){
   const proposed=objectNumber||inferred||nextObjectNumber(property,objects,properties);
   const objectFrom=earliestObjectDate.get(norm(propertyNumber)+'|'+norm(proposed))||from;
   if(!proposed||local.some(o=>eq(o.object_number,proposed)))fail('Nytt objektnummer är inte entydigt.');
   if(!objectFrom||!validDate(objectFrom))fail('Nytt objekt kräver ett giltigt startdatum.');
   if(!failures.length){
    const raw=get(row,'area'),parsed=area(raw);
    if(raw&&parsed===null)fail('Ogiltig area.');
    else{
     object={id:id(),property_id:property.id,object_number:proposed,
      currentVersion:{valid_from:objectFrom,area:parsed}};
     objects.push(object);
     write('createObject',{property_id:property.id,object_number:proposed,valid_from:objectFrom,
      ...(parsed!==null?{area:parsed}:{})},sourceRow,{id:object.id});
     created.push('objekt');
    }
   }
  }
  if(object){
   info.objectId=object.id;info.objectNumber=object.object_number;
   const raw=get(row,'area');
   if(raw&&!created.includes('objekt')){
    const parsed=area(raw),saved=object.currentVersion?.area??object.versions?.[0]?.area;
    if(parsed===null)fail('Ogiltig area.');
    else if(saved==null||Number(saved)!==parsed)
     fail('Objektets area avviker eller saknas. Ändra genom objektversion, inte import.');
   }
  }
  if(agreementNumber&&!object)fail('Objekt kan inte avgöras säkert. Välj befintligt objekt eller skapa nytt.');
  if(!agreement&&agreementNumber&&object){
   if(!from||!validDate(from))fail('Nytt avtal kräver startdatum.');
   if(!failures.length){
    agreement={id:id(),agreement_number:agreementNumber,object_id:object.id,original_start_on:from};
    agreements.push(agreement);
    write('createAgreement',{object_id:object.id,agreement_number:agreementNumber,valid_from:from,
     ...(until?{legal_end_on:until}:{}),...(get(row,'usage')?{usage:get(row,'usage')}:{})},
    sourceRow,{id:agreement.id});
    created.push('avtal');
   }
  }
  if(agreement&&initiallyKnown.has(agreement.id)){
   if(from&&agreement.original_start_on&&from!==agreement.original_start_on)
    fail('Avtalsstart avviker från befintligt avtal.');
   const v=agreement.currentVersion;
   if(until&&v?.legal_end_on&&until!==v.legal_end_on)fail('Avtalets slutdatum avviker från sparad version.');
  }
  if(tenantName||tenantOrg){
   if(!agreement)fail('Hyresgästen saknar avtal.');
   if(!tenantName&&!parties.some(p=>tenantOrg&&eq(p.organization_number,tenantOrg)))
    fail('Ny hyresgäst behöver ett namn.');
   const byOrg=tenantOrg?parties.filter(p=>eq(p.organization_number,tenantOrg)):[];
   const byName=tenantName?parties.filter(p=>eq(p.name,tenantName)):[];
   if(byOrg.length>1||byName.length>1)fail('Hyresgästen har tvetydig identitet.');
   if(byOrg.length===1&&tenantName&&!eq(byOrg[0].name,tenantName))
    fail('Organisationsnummer och hyresgästnamn pekar på olika parter.');
   if(byOrg.length&&byName.length&&byOrg[0].id!==byName[0].id)
    fail('Hyresgästnamn och organisationsnummer pekar på olika parter.');
   if(byName.length&&tenantOrg&&byName[0].organization_number&&!eq(byName[0].organization_number,tenantOrg))
    fail('Hyresgästen har ett annat organisationsnummer sparat.');
   let tenant=byOrg[0]||byName[0];
   if(tenant&&tenant.kind&&!['tenant','hyresgäst'].includes(tenant.kind)&&!assignments.some(a=>a.party_id===tenant.id&&a.role_code==='tenant'))
    fail('Parten finns men är inte verifierad som hyresgäst.');
   if(!tenant&&tenantName&&!failures.length){
    tenant={id:id(),name:tenantName,organization_number:tenantOrg||null,kind:'tenant'};
    parties.push(tenant);
    write('createParty',{name:tenantName,kind:'tenant',
     ...(tenantOrg?{organization_number:tenantOrg}:{})},sourceRow,{id:tenant.id});
    created.push('hyresgäst');
   }
   if(tenant&&tenantOrg&&!tenant.organization_number&&!failures.length){
    tenant.organization_number=tenantOrg;
    write('updateParty',{organization_number:tenantOrg},sourceRow,{id:tenant.id});
    created.push('organisationsnummer');
   }
   if(tenant&&agreement&&!failures.length){
    info.relationships.push({label:'Hyresgäst',name:tenant.name,target:'Avtal '+agreementNumber});
    const linked=assignments.filter(a=>a.agreement_id===agreement.id&&a.role_code==='tenant');
    if(linked.some(a=>a.party_id!==tenant.id||a.person_id))
     fail('Avtalet har en annan hyresgästkoppling. Ändra manuellt.');
    else if(!linked.length){
     const start=agreement.original_start_on||from;
     if(!validDate(start))fail('Hyresgästkopplingen saknar giltigt datum.');
     else{
      const fields={agreement_id:agreement.id,role_code:'tenant',party_id:tenant.id,valid_from:start};
      write('setRole',fields,sourceRow);
      assignments.push({...fields,id:id(),valid_to:null});
      created.push('avtal–hyresgäst');
     }
    }
   }
  }
  finish();
 }
 if(commands.length>200)errors.push('Fler än 200 databasändringar i en import. Dela upp filen.');
 return {commands,records,errors,mapping:cols,excludedColumns:ignored,
  stats:{matched:records.filter(x=>x.status==='matched').length,
   created:records.filter(x=>x.status==='new').length,
   review:records.filter(x=>x.status==='review').length,commands:commands.length}};
}
