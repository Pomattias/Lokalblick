// Guided stage 3: import only agreements with verified property -> object links.
// Rent rows are distinct, independently approved units; uncertain values never
// block the agreement or another contract.
import {groupedAgreementEvidence,pickEvidence,issue,key,same,isoDate,validDate,present} from './guided-source.js';
import {priceTypes} from './smart-import.js';

const normalize=v=>String(v??'').trim();
const priceNumber=v=>{
 const raw=normalize(v).replace(/[\s\u00a0]/g,'').replace(/kr|sek/gi,'');
 if(!raw)return null;
 const str=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):
  /^\d{1,3}(?:\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw;
 const n=Number(str);return Number.isFinite(n)&&n>=0?n:null;
};
const roleDate=agreement=>agreement.original_start_on||agreement.versions?.at(-1)?.valid_from||'';
const dateLabel='Avtalets startdatum';
const realObject=(objects,objectId,propertyId)=>objects.find(o=>o.id===objectId&&o.property_id===propertyId);

export function prepareAgreementStage(sheets,snapshot,{objectLinks={},makeId=()=>crypto.randomUUID()}={}){
 const {groups,issues}=groupedAgreementEvidence(sheets,snapshot);
 const entries=[],units=[],objects=snapshot.objects||[],agreements=snapshot.agreements||[],
  rents=snapshot.agreementItems||[];
 const createdNumbers=new Set();
 for(const group of groups){
  const source=group.evidence.find(x=>x.master)||group.evidence[0];
  const warn=(field,message,value)=>issues.push(issue(source.sheet,source.row,field,message,value));
  const property=group.property,propertyNumber=property.management_object_number,
   number=group.agreementNumber,allMatches=agreements.filter(a=>same(a.agreement_number,number));
  const n=field=>pickEvidence(group,field,issues);
  const objectNo=n('object_number'),start=n('valid_from'),end=n('legal_end_on'),
   usage=n('usage');
  const record={sheet:source.sheet,sourceRow:source.row,propertyId:property.id,
   propertyNumber,agreementNumber:number,objectNumber:objectNo.value||'',validFrom:'',
   legalEndOn:'',status:'review',objectId:null,reason:''};
  const reject=reason=>{warn('Avtal',reason,number);record.reason=reason;entries.push(record);};
  if(allMatches.length>1){reject('Avtalsnumret är inte unikt i registret.');continue;}
  let agreement=allMatches[0]||null;
  if(group.masterMissing&&!agreement){reject('Avtalet finns bara i berikningsflikar och inte i den valda Lokallista.');continue;}
  if(objectNo.conflict||start.conflict){reject('Objektsnummer eller startdatum är motstridiga i källan.');continue;}
  const linkedId=objectLinks[property.id+'|'+key(number)];
  const byNumber=objectNo.value?objects.filter(o=>o.property_id===property.id&&same(o.object_number,objectNo.value)):[];
  if(byNumber.length>1){reject('Objektsnumret finns flera gånger på fastigheten.');continue;}
  const byLink=linkedId?realObject(objects,linkedId,property.id):null;
  const fromAgreement=agreement?realObject(objects,agreement.object_id,property.id):null;
  if(agreement&&!fromAgreement){reject('Avtalet är redan kopplat till en annan fastighet eller saknar objekt.');continue;}
  if(linkedId&&!byLink){reject('Den tidigare godkända objektkopplingen finns inte längre.');continue;}
  const candidates=[fromAgreement,byNumber[0],byLink].filter(Boolean);
  if(new Set(candidates.map(x=>x.id)).size>1){reject('Objektsnummer, avtal och objektimport pekar på olika objekt.');continue;}
  const object=candidates[0];
  if(!object){reject('Objektet kan inte identifieras säkert. Kontrollera objektsnummer eller importera objekt först.');continue;}
  record.objectId=object.id;record.objectNumber=object.object_number;
  const startDate=isoDate(start.value),endDate=isoDate(end.value);
  if(start.value&&!startDate){warn(dateLabel,'Avtalets startdatum kan inte tolkas.',start.value);}
  if(end.value&&!endDate){warn('Slutdatum','Slutdatum kan inte tolkas. Det importeras inte.',end.value);}
  const existingDate=agreement?roleDate(agreement):'';
  if(!agreement&&(!startDate||!validDate(startDate))){reject('Nytt avtal behöver ett giltigt startdatum.');continue;}
  if(startDate&&endDate&&endDate<startDate){
   warn('Slutdatum','Slutdatum ligger före avtalsstart. Slutdatum hoppas över.',end.value);
  }
  const objectStart=object.versions?.map(v=>v.valid_from).filter(validDate).sort()[0]||
   object.currentVersion?.valid_from;
  if(!agreement&&(objectStart&&startDate<objectStart||object.ended_on&&startDate>object.ended_on)){
   reject('Avtalsstart ligger utanför objektets giltighetstid.');continue;
  }
  const effective=agreement?existingDate:startDate;
  record.validFrom=effective;
  record.legalEndOn=endDate&&(!startDate||endDate>=startDate)?endDate:'';
  if(agreement&&startDate&&existingDate&&startDate!==existingDate)
   warn('Startdatum','Avtalsstart skiljer sig från befintligt avtal. Befintligt datum behålls.',start.value);
  if(agreement&&endDate&&agreement.currentVersion?.legal_end_on&&endDate!==agreement.currentVersion.legal_end_on)
   warn('Slutdatum','Slutdatum skiljer sig från befintligt avtal. Ändra avtalsversion manuellt.',end.value);
  const fields={object_id:object.id,agreement_number:number,valid_from:startDate,
   ...(record.legalEndOn?{legal_end_on:record.legalEndOn}:{}),
   ...(usage.value?{usage:usage.value}:{})};
  if(!agreement){
   if(createdNumbers.has(key(number))){reject('Dubblett av avtalsnummer i importen.');continue;}
   const newId=makeId();createdNumbers.add(key(number));
   agreement={id:newId,agreement_number:number,object_id:object.id,original_start_on:startDate};
   units.push({key:'agreement:'+newId,commands:[{action:'createAgreement',id:newId,sourceRow:source.row,fields}],
    sheet:source.sheet,row:source.row});
   record.status='new';record.id=newId;
  }else{record.status='existing';record.id=agreement.id;}
  entries.push(record);

  // Rent items only when explicitly present. No implicit zero, KPI or base year.
  for(const price of priceTypes){
   const prefix='price.'+price.id+'.';
   const amount=n(prefix+'amount'),year=n(prefix+'year'),method=n(prefix+'method'),
    index=n(prefix+'index'),share=n(prefix+'share'),min=n(prefix+'min'),max=n(prefix+'max');
   const hasDetails=[year,method,index,share,min,max].some(x=>present(x.value));
   if(!present(amount.value)){
    if(hasDetails)warn(price.label,'Hyresposten har index/basår men saknar belopp. Hyresposten hoppas över.');
    continue;
   }
   if([amount,year,method,index,share,min,max].some(x=>x.conflict)){
    warn(price.label,'Motsägelsefulla uppgifter om hyresposten. Hyresposten hoppas över.');continue;
   }
   const money=priceNumber(amount.value),baseYear=year.value?Number(year.value):null;
   if(money===null||year.value&&(!Number.isInteger(baseYear)||baseYear<1900||baseYear>9999)){
    warn(price.label,'Belopp eller basår är ogiltigt. Hyresposten hoppas över.',amount.value);continue;
   }
   const methodKey=key(method.value).replace(/[^a-z0-9]/g,'');
   const methodName=({kpi:'kpi',index:'kpi',kpiindex:'kpi',fastprocent:'fixed',
    fast:'fixed',fixed:'fixed',ingen:'none',none:'none',kpiminmax:'kpi-limited',kpilimited:'kpi-limited'})[methodKey];
   if(method.value&&!methodName){warn(price.label,'Okänd uppräkningsmetod. Hyresposten hoppas över.',method.value);continue;}
   const adjustment=methodName||'none';
   if(adjustment!=='none'&&!baseYear){warn(price.label,'Basår krävs för vald uppräkning.');continue;}
   const item={agreement_id:agreement.id,type:price.type,name:price.label,
    base_amount:money,valid_from:effective,adjustment_method:adjustment};
   if(baseYear)item.base_year=baseYear;
   let valid=true;
   for(const [sourceValue,target] of [[index,'base_index'],[share,'index_share'],[min,'min_percent'],[max,'max_percent']]){
    if(!present(sourceValue.value))continue;
    const n=priceNumber(sourceValue.value);
    if(n===null||target==='index_share'&&n>1){warn(price.label,'Ogiltigt värde för '+target+'. Hyresposten hoppas över.',sourceValue.value);valid=false;break;}
    item[target]=n;
   }
   if(!valid)continue;
   if(['kpi','kpi-limited'].includes(adjustment)&&(item.base_index==null||item.index_share==null)){
    warn(price.label,'KPI-bastal och indexandel krävs innan hyresposten kan importeras.');continue;
   }
   if(adjustment==='kpi-limited'&&item.min_percent==null&&item.max_percent==null){
    warn(price.label,'Minsta eller högsta KPI-gräns behöver anges.');continue;
   }
   const matches=rents.filter(r=>r.agreement_id===agreement.id&&r.type===price.type&&
    same(r.name,price.label));
   if(matches.length){
    const exact=matches.some(old=>['type','base_amount','valid_from','base_year','base_index','index_share',
     'adjustment_method','min_percent','max_percent'].every(k=>
      (old[k]??null)===(item[k]??null)));
    if(!exact)warn(price.label,'Hyrespost finns redan med andra värden eller giltighet. Befintlig hyra skrivs inte över.');
    continue;
   }
   units.push({key:'rent:'+agreement.id+':'+price.id,
    dependsOn:record.status==='new'?['agreement:'+agreement.id]:[],
    commands:[{action:'addAgreementItem',sourceRow:source.row,fields:item}],
    sheet:source.sheet,row:source.row});
   rents.push(item);
  }
 }
 return {entries,issues,units,commands:units.flatMap(x=>x.commands),stats:{
  found:entries.length,new:entries.filter(x=>x.status==='new').length,
  existing:entries.filter(x=>x.status==='existing').length,
  review:entries.filter(x=>x.status==='review').length,
  prices:units.filter(x=>x.key.startsWith('rent:')).length,
  issues:issues.length}};
}
