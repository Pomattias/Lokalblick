// One pure annualised rental-rate calculation shared by the private v3 API and UI.
// A rate at a date is NOT the amount invoiced across a financial year.
// Index observations are supplied explicitly; there is no implicit SCB lookup.
const available = (amount, method, nominal) => ({amount:Math.round(amount*100)/100,method,nominal,reason:null});
const unavailable = (method, nominal, reason) => ({amount:null,method,nominal,reason});
const finite = value => value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const nonnegative = value => finite(value)&&Number(value)>=0;

export function activeOn(row,date){
 return (!row.valid_from||row.valid_from<=date)&&(!row.valid_to||row.valid_to>=date);
}
// Caps apply to EACH annual change in the rent, against last year's rent.
// base_year is the first rent-rate year at base_amount. base_index is the CPI
// October observation used for that rate (normally October base_year-1).
// indexHistory is keyed by the RENT YEAR the October CPI is used for; values
// must be supplied explicitly, never inferred from the end-point index.
function bounds(item,method,base){
 const hasMin=item.min_percent!==null&&item.min_percent!==undefined&&item.min_percent!=='';
 const hasMax=item.max_percent!==null&&item.max_percent!==undefined&&item.max_percent!=='';
 if(method==='kpi-limited'&&!hasMin&&!hasMax)
  return {error:unavailable(method,base,'Minsta eller högsta årliga höjning saknas')};
 const low=hasMin?Number(item.min_percent):null,high=hasMax?Number(item.max_percent):null;
 if(hasMin&&(!finite(item.min_percent)||low<0)||hasMax&&(!finite(item.max_percent)||high<0))
  return {error:unavailable(method,base,'Årlig min/max måste vara giltiga icke-negativa procenttal')};
 if(hasMin&&hasMax&&low>high)
  return {error:unavailable(method,base,'Minsta årliga höjning överstiger högsta')};
 return {low,high,limited:hasMin||hasMax};
}
function stepRent(previous,rawPercent,bound,item){
 let percent=rawPercent;
 if(bound.low!==null)percent=Math.max(percent,bound.low);
 if(bound.high!==null)percent=Math.min(percent,bound.high);
 if(item.floor!==0)percent=Math.max(0,percent);
 const amount=previous*(1+percent/100);
 return Number.isFinite(amount)&&amount>=0?amount:null;
}
export function calculateAnnualRate(item,{year,index=null,indexHistory=null}={}){
 const base=Number(item?.base_amount),method=item?.adjustment_method||'none';
 if(!finite(item?.base_amount)||!Number.isFinite(base)||base<0)return unavailable(method,null,'Ogiltigt grundbelopp');
 if(!Number.isInteger(year)||year<1900||year>9999)return unavailable(method,base,'Ogiltigt beräkningsår');
 if(method==='none')return available(base,method,base);
 const bound=bounds(item,method,base);
 if(bound.error)return bound.error;
 if(method==='fixed'){
  if(!finite(item.annual_percent)||Number(item.annual_percent)<=-100)
   return unavailable(method,base,'Giltig årlig procentsats saknas');
  if(Number(item.annual_percent)===0&&!bound.limited)return available(base,method,base);
  if(!finite(item.base_year)||!Number.isInteger(Number(item.base_year))||Number(item.base_year)<1900)
   return unavailable(method,base,'Basår saknas');
  const elapsed=year-Number(item.base_year);
  if(elapsed<0)return unavailable(method,base,'Beräkningsår före basåret');
  const annual=Number(item.annual_percent);
  const adjusted=bound.limited||item.floor!==0
   ?Math.min(bound.high??Infinity,Math.max(bound.low??-Infinity,item.floor!==0?Math.max(0,annual):annual))
   :annual;
  const amount=base*Math.pow(1+adjusted/100,elapsed);
  if(!Number.isFinite(amount)||amount<0)
   return unavailable(method,base,'Årlig uppräkning är utanför tillåtet talområde');
  return available(amount,method,base);
 }
 if(method==='kpi'||method==='kpi-limited'){
  if(!nonnegative(item.index_share)||Number(item.index_share)>1)
   return unavailable(method,base,'Indexandel saknas eller är ogiltig');
  const share=Number(item.index_share);
  // Unrestricted KPI can use an end-point comparison. A bounded annual CPI
  // increase cannot: missing intervening October observations remain unknown.
  if(!bound.limited){
   if(share===0)return available(base,method,base);
   if(!finite(item.base_index)||Number(item.base_index)<=0)
    return unavailable(method,base,'KPI-bastal saknas');
   if(!finite(index)||Number(index)<=0)
    return unavailable(method,base,'KPI-tal för beräkningsåret saknas');
   const amount=base*(1+share*(Number(index)/Number(item.base_index)-1));
   if(!Number.isFinite(amount)||amount<0)
    return unavailable(method,base,'Ogiltigt beräknat KPI-belopp');
   return available(item.floor===0?amount:Math.max(base,amount),method,base);
  }
  if(!finite(item.base_year)||!Number.isInteger(Number(item.base_year))||Number(item.base_year)<1900)
   return unavailable(method,base,'Basår behövs för årlig min/max-reglering');
  const from=Number(item.base_year);
  if(year<from)return unavailable(method,base,'Beräkningsår före basåret');
  if(year===from)return available(base,method,base);
  if(share>0&&(!finite(item.base_index)||Number(item.base_index)<=0))
   return unavailable(method,base,'KPI-bastal saknas');
  let previousIndex=Number(item.base_index),rent=base;
  for(let y=from+1;y<=year;y++){
   const value=y===year&&finite(index)?index:indexHistory?.[y];
   if(share>0&&(!finite(value)||Number(value)<=0))
    return unavailable(method,base,'KPI-oktober för hyresår '+y+' saknas – årlig höjning kan inte beräknas');
   const raw=share===0?0:share*(Number(value)/previousIndex-1)*100;
   const next=stepRent(rent,raw,bound,item);
   if(next===null)return unavailable(method,base,'Ogiltig årlig KPI-uppräkning');
   rent=next;
   if(share>0)previousIndex=Number(value);
  }
  return available(rent,method,base);
 }
 return unavailable(method,base,'Okänd uppräkningsmetod');
}
// Expected callers supply items that belong to active objects and agreements.
// Do not add unresolved index amounts as though their nominal rate were calculated.
export function annualRateSummary(items,at,{index=null,indexHistory=null}={}){
 const year=Number(at.slice(0,4));
 let nominal=0,known=0,unresolved=0,count=0;
 const lines=[];
 for(const item of items){
  if(!activeOn(item,at))continue;
  const result=calculateAnnualRate(item,{year,index,indexHistory});
  count++;nominal+=result.nominal??0;
  if(result.amount===null)unresolved++;
  else known+=result.amount;
  lines.push({id:item.id,agreement_id:item.agreement_id,nominal:result.nominal,...result});
 }
 return {date:at,nominal:Math.round(nominal*100)/100,known:Math.round(known*100)/100,
  calculated:unresolved===0?Math.round(known*100)/100:null,unresolved,count,lines};
}
// Select a single date-effective lease and object version; no annual interval overlap
// that would double-count old and new rent levels in the same year.
export function agreementActiveOn(agreement,object,at){
 if(!agreement||!object||(object.ended_on&&object.ended_on<at))return false;
 if(!(object.versions||[]).some(v=>v.valid_from<=at))return false;
 const current=(agreement.versions||[]).filter(v=>v.valid_from<=at)
  .sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0];
 return !!current&&(!current.legal_end_on||current.legal_end_on>=at);
}
export function snapshotAnnualRate(snapshot,at,{index=null,indexHistory=null,propertyId=null}={}){
 const objects=new Map(snapshot.objects.map(o=>[o.id,o]));
 const activeAgreements=new Set(snapshot.agreements.filter(a=>{
  const object=objects.get(a.object_id);
  return object&&(!propertyId||object.property_id===propertyId)&&agreementActiveOn(a,object,at);
 }).map(a=>a.id));
 return annualRateSummary(snapshot.agreementItems.filter(i=>activeAgreements.has(i.agreement_id)),at,{index,indexHistory});
}
