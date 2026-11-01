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
export function calculateAnnualRate(item,{year,index=null}={}){
 const nominal=Number(item?.base_amount),method=item?.adjustment_method||'none';
 if(!finite(item?.base_amount)||!Number.isFinite(nominal)||nominal<0)return unavailable(method,null,'Ogiltigt grundbelopp');
 if(!Number.isInteger(year)||year<1900||year>9999)return unavailable(method,nominal,'Ogiltigt beräkningsår');
 if(method==='none')return available(nominal,method,nominal);
 if(method==='fixed'){
  // A documented 0% adjustment does not depend on a base year.
  if(finite(item.annual_percent)&&Number(item.annual_percent)===0)return available(nominal,method,nominal);
  if(!Number.isInteger(Number(item.base_year))||!finite(item.base_year)||Number(item.base_year)<1900)
   return unavailable(method,nominal,'Basår saknas');
  const elapsed=year-Number(item.base_year);
  if(elapsed<0)return unavailable(method,nominal,'Beräkningsår före basåret');
  if(!finite(item.annual_percent)||Number(item.annual_percent)<=-100)
   return unavailable(method,nominal,'Giltig årlig procentsats saknas');
  const proposed=nominal*Math.pow(1+Number(item.annual_percent)/100,elapsed);
  if(!Number.isFinite(proposed))return unavailable(method,nominal,'Uppräkningen är utanför tillåtet talområde');
  return available(item.floor===0?proposed:Math.max(nominal,proposed),method,nominal);
 }
 if(method==='kpi'){
  // Zero index share is contractually unchanged, even without an SCB observation.
  if(finite(item.index_share)&&Number(item.index_share)===0)return available(nominal,method,nominal);
  if(!finite(item.base_index)||Number(item.base_index)<=0||!nonnegative(item.index_share)||Number(item.index_share)>1)
   return unavailable(method,nominal,'KPI-bastal eller indexandel saknas');
  if(!finite(index)||Number(index)<=0)return unavailable(method,nominal,'KPI-tal för beräkningsåret saknas');
  const proposed=nominal*(1+Number(item.index_share)*(Number(index)/Number(item.base_index)-1));
  if(!Number.isFinite(proposed)||proposed<0)return unavailable(method,nominal,'Ogiltigt beräknat KPI-belopp');
  return available(item.floor===0?proposed:Math.max(nominal,proposed),method,nominal);
 }
 if(method==='kpi-limited')return unavailable(method,nominal,'Min/max och begränsningsbas kräver avtalstolkning');
 return unavailable(method,nominal,'Okänd uppräkningsmetod');
}
// Expected callers supply items that belong to active objects and agreements.
// Do not add unresolved index amounts as though their nominal rate were calculated.
export function annualRateSummary(items,at,{index=null}={}){
 const year=Number(at.slice(0,4));
 let nominal=0,known=0,unresolved=0,count=0;
 const lines=[];
 for(const item of items){
  if(!activeOn(item,at))continue;
  const result=calculateAnnualRate(item,{year,index});
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
export function snapshotAnnualRate(snapshot,at,{index=null,propertyId=null}={}){
 const objects=new Map(snapshot.objects.map(o=>[o.id,o]));
 const activeAgreements=new Set(snapshot.agreements.filter(a=>{
  const object=objects.get(a.object_id);
  return object&&(!propertyId||object.property_id===propertyId)&&agreementActiveOn(a,object,at);
 }).map(a=>a.id));
 return annualRateSummary(snapshot.agreementItems.filter(i=>activeAgreements.has(i.agreement_id)),at,{index});
}
