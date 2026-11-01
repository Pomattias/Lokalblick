// Read-only annual settlement: allocations and contractual supplements share
// the exact calendar-day period of each tenancy. No invoice is generated.
const categories=new Set(['heat','water','electricity','cooling','waste']);
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const validNumber=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
const overlaps=(r,begin,end)=>(!r.valid_from||r.valid_from<=end)&&(!r.valid_to||r.valid_to>=begin);
const periodCovers=(r,begin,end)=>(!r.valid_from||r.valid_from<=begin)&&(!r.valid_to||r.valid_to>=end);
const dayNumber=date=>Date.parse(date+'T00:00:00Z')/86400000;
const days=(from,to)=>dayNumber(to)-dayNumber(from)+1; // Both rent days are inclusive.
const later=(a,b)=>a>b?a:b,earlier=(a,b)=>a<b?a:b;
function yearArea(object,begin,end){
 if(object.ended_on&&object.ended_on<end)return null;
 const versions=(object.versions||[]).filter(v=>v.valid_from<=end)
  .sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
 if(!versions.length||versions[0].valid_from>begin||!validNumber(versions[0].area)||Number(versions[0].area)<=0)
  return null;
 return Number(versions[0].area);
}
function propertyAreas(objects,propertyId,begin,end){
 const rows=objects.filter(o=>o.property_id===propertyId
  &&(o.versions||[]).some(v=>v.valid_from<=end)
  &&(!o.ended_on||o.ended_on>=begin));
 const parts=rows.map(o=>({objectId:o.id,area:yearArea(o,begin,end)}));
 const total=parts.every(p=>p.area!==null)&&parts.length>0
  ?parts.reduce((sum,p)=>sum+p.area,0):null;
 return {total,parts};
}
function tenancyPeriod(agreement,object,begin,end){
 const versions=(agreement.versions||[]).filter(v=>v.valid_from<=end)
  .sort((a,b)=>a.valid_from.localeCompare(b.valid_from));
 if(!versions.length)return null;
 // A revision to the agreement does not restart the tenant's rental period.
 // The original contractual start and latest applicable legal end are decisive.
 const original=agreement.original_start_on||versions[0].valid_from;
 const latest=versions.at(-1);
 const from=later(begin,original);
 const to=earlier(end,earlier(latest.legal_end_on||end,object.ended_on||end));
 return from<=to?{from,to,days:days(from,to)}:null;
}
function costGroups(costs,begin,end){
 const byKey=new Map();
 for(const cost of costs){
  if(!categories.has(cost.category)||!overlaps(cost,begin,end))continue;
  const key=cost.property_id+'|'+cost.category;
  if(!byKey.has(key))byKey.set(key,{propertyId:cost.property_id,category:cost.category,costIds:[],totalCost:0,complete:true});
  const row=byKey.get(key);
  row.costIds.push(cost.id);
  // A cost or partial invoice that fails to cover a full year cannot be
  // assumed to be a certified, annual property total.
  if(!periodCovers(cost,begin,end)||!cost.actual?.complete||!validNumber(cost.actual.amount))
   row.complete=false;
  else row.totalCost+=Number(cost.actual.amount);
 }
 return [...byKey.values()].map(g=>({...g,totalCost:g.complete?round(g.totalCost):null}));
}
function chargeWindows(items,period){
 return items.map(item=>({
  item,from:later(period.from,item.valid_from||period.from),
  to:earlier(period.to,item.valid_to||period.to)
 })).filter(p=>p.from<=p.to).sort((a,b)=>a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
}
export function reconcileAnnualCosts({
 year,properties=[],objects=[],agreements=[],agreementItems=[],recurringCosts=[]
}={}){
 if(!Number.isInteger(year)||year<1900||year>9999)throw Error('Ange giltigt avräkningsår');
 const begin=year+'-01-01',end=year+'-12-31',yearDays=days(begin,end);
 const areaCache=new Map(),objectById=new Map(objects.map(o=>[o.id,o]));
 const tenancies=agreements.map(agreement=>{
  const object=objectById.get(agreement.object_id);
  return {agreement,object,period:object?tenancyPeriod(agreement,object,begin,end):null};
 }).filter(t=>t.period);
 const results=[];
 for(const group of costGroups(recurringCosts,begin,end)){
  if(!areaCache.has(group.propertyId))areaCache.set(group.propertyId,propertyAreas(objects,group.propertyId,begin,end));
  const areas=areaCache.get(group.propertyId);
  const property=properties.find(p=>p.id===group.propertyId);
  for(const {agreement,object,period} of tenancies){
   if(object.property_id!==group.propertyId)continue;
   const rentItems=agreementItems.filter(item=>item.agreement_id===agreement.id&&item.type===group.category
    &&overlaps(item,period.from,period.to));
   const windows=chargeWindows(rentItems,period);
   const base={
    year,propertyId:group.propertyId,propertyName:property?.name||null,
    category:group.category,costIds:group.costIds,
    agreementId:agreement.id,agreementNumber:agreement.agreement_number,
    objectId:object.id,objectNumber:object.object_number,
    tenancyFrom:period.from,tenancyTo:period.to,tenancyDays:period.days,yearDays,
    // Only rental days where a specifically classified supplement is agreed
    // may incur a variable-cost reconciliation.
    hasSupplement:windows.length>0,reconciliationDays:0,periods:[],
    area:areas.parts.find(x=>x.objectId===object.id)?.area??null,
    totalArea:areas.total,totalCost:group.totalCost,
    share:null,allocatedCost:null,annualSupplement:null,difference:null,
    status:'review',reason:null
   };
   if(!windows.length){
    results.push({...base,status:'included',reason:'Inget separat avtalat tillägg under hyresperioden – kostnaden ingår i hyran.'});
    continue;
   }
   if(!group.complete){results.push({...base,reason:'Fastställd, fullständig årskostnad saknas.'});continue;}
   if(areas.total===null||base.area===null){
    results.push({...base,reason:'Komplett årsarea för samtliga objekt saknas eller har ändrats.'});continue;
   }
   // Consecutive tenants are fine; genuinely overlapping tenancy periods
   // on the same physical object must not both be charged.
   const conflicting=tenancies.some(other=>other.agreement.id!==agreement.id
    &&other.object.id===object.id&&other.period.from<=period.to&&other.period.to>=period.from);
   if(conflicting){
    results.push({...base,reason:'Överlappande hyresperioder för samma objekt – kontrollera avtalen.'});continue;
   }
   if(windows.some((window,i)=>i>0&&windows[i-1].to>=window.from)){
    results.push({...base,reason:'Överlappande tilläggsperioder av samma typ – kontrollera avtalet.'});continue;
   }
   if(!windows.every(({item})=>item.adjustment_method==='none'&&validNumber(item.base_amount)&&Number(item.base_amount)>=0)){
    results.push({...base,reason:'Tillägget är indexerat eller saknar säkert årsbelopp – kontrollera faktisk debitering.'});continue;
   }
   const reconciliationDays=windows.reduce((sum,w)=>sum+days(w.from,w.to),0);
   const share=base.area/areas.total;
   const allocatedCost=round(group.totalCost*share*reconciliationDays/yearDays);
   const annualSupplement=round(windows.reduce((sum,w)=>sum+Number(w.item.base_amount)*days(w.from,w.to)/yearDays,0));
   results.push({...base,share:round(share*100),reconciliationDays,
    periods:windows.map(w=>({from:w.from,to:w.to,days:days(w.from,w.to),annualAmount:Number(w.item.base_amount)})),
    allocatedCost,annualSupplement,difference:round(allocatedCost-annualSupplement),status:'ready'});
  }
 }
 return results;
}
