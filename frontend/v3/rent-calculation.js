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
// Min and max always bound the change in the RENT ITEM, never the CPI itself.
// A dated new rent item represents a new baseline without rewriting history.
function cappedAmount(item,amount,method,base){
 const hasMin=item.min_percent!==null&&item.min_percent!==undefined&&item.min_percent!=='';
 const hasMax=item.max_percent!==null&&item.max_percent!==undefined&&item.max_percent!=='';
 if(method==='kpi-limited'&&!hasMin&&!hasMax)
  return unavailable(method,base,'Minsta eller högsta höjning saknas');
 const min=hasMin?Number(item.min_percent):null,max=hasMax?Number(item.max_percent):null;
 if(hasMin&&(!finite(item.min_percent)||min<0)||hasMax&&(!finite(item.max_percent)||max<0))
  return unavailable(method,base,'Min/max måste vara giltiga icke-negativa procenttal');
 if(hasMin&&hasMax&&min>max)return unavailable(method,base,'Minsta höjning överstiger högsta höjning');
 if(!Number.isFinite(amount)||amount<0)return unavailable(method,base,'Ogiltigt beräknat hyresbelopp');
 let adjusted=amount;
 if(hasMin)adjusted=Math.max(adjusted,base*(1+min/100));
 if(hasMax)adjusted=Math.min(adjusted,base*(1+max/100));
 if(item.floor!==0)adjusted=Math.max(base,adjusted);
 return available(adjusted,method,base);
}
export function calculateAnnualRate(item,{year,index=null}={}){
 const base=Number(item?.base_amount),method=item?.adjustment_method||'none';
 if(!finite(item?.base_amount)||!Number.isFinite(base)||base<0)return unavailable(method,null,'Ogiltigt grundbelopp');
 if(!Number.isInteger(year)||year<1900||year>9999)return unavailable(method,base,'Ogiltigt beräkningsår');
 if(method==='none')return available(base,method,base);
 if(method==='fixed'){
  if(!finite(item.annual_percent)||Number(item.annual_percent)<=-100)return unavailable(method,base,'Giltig årlig procentsats saknas');
  if(Number(item.annual_percent)===0&&item.min_percent==null&&item.max_percent==null)return available(base,method,base);
  if(!finite(item.base_year)||!Number.isInteger(Number(item.base_year))||Number(item.base_year)<1900)return unavailable(method,base,'Basår saknas');
  const elapsed=year-Number(item.base_year);
  if(elapsed<0)return unavailable(method,base,'Beräkningsår före basåret');
  return cappedAmount(item,base*Math.pow(1+Number(item.annual_percent)/100,elapsed),method,base);
 }
 if(method==='kpi'||method==='kpi-limited'){
  if(!nonnegative(item.index_share)||Number(item.index_share)>1)return unavailable(method,base,'Indexandel saknas eller är ogiltig');
  let amount=base;
  if(Number(item.index_share)>0){
   if(!finite(item.base_index)||Number(item.base_index)<=0)return unavailable(method,base,'KPI-bastal saknas');
   if(!finite(index)||Number(index)<=0)return unavailable(method,base,'KPI-tal för beräkningsåret saknas');
   amount=base*(1+Number(item.index_share)*(Number(index)/Number(item.base_index)-1));
  }
  return cappedAmount(item,amount,method,base);
 }
 return unavailable(method,base,'Okänd uppräkningsmetod');
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
