// Read-only annual cost settlement preview. No invoices or rent items are created.
// Match explicit cost categories only; a generic unclassified addition is never
// silently treated as heat, water or electricity. Values are SEK/year.
const categories=new Set(['heat','water','electricity','cooling','waste']);
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const activeAt=(r,date)=>(!r.valid_from||r.valid_from<=date)&&(!r.valid_to||r.valid_to>=date);
const validNumber=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
const periodCovers=(r,begin,end)=>(!r.valid_from||r.valid_from<=begin)&&(!r.valid_to||r.valid_to>=end);
function yearArea(object,begin,end){
 if(object.ended_on&&object.ended_on<end)return null;
 const versions=(object.versions||[]).filter(v=>v.valid_from<=end)
  .sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
 if(!versions.length||versions[0].valid_from>begin||!validNumber(versions[0].area)||Number(versions[0].area)<=0)
  return null;
 return Number(versions[0].area);
}
function contractCovers(agreement,begin,end){
 const versions=(agreement.versions||[]).filter(v=>v.valid_from<=end)
  .sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
 if(!versions.length||versions[0].valid_from>begin)return false;
 return !versions[0].legal_end_on||versions[0].legal_end_on>=end;
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
function costGroups(costs,year,begin,end){
 const byKey=new Map();
 for(const cost of costs){
  if(!categories.has(cost.category))continue;
  // An annual cost row only covers a full settlement year. Incomplete
  // invoices are retained as evidence but cannot be used for billing.
  if(!activeAt(cost,end))continue;
  const key=cost.property_id+'|'+cost.category;
  if(!byKey.has(key))byKey.set(key,{propertyId:cost.property_id,category:cost.category,costIds:[],totalCost:0,complete:true});
  const row=byKey.get(key);
  row.costIds.push(cost.id);
  if(!periodCovers(cost,begin,end)||!cost.actual?.complete||!validNumber(cost.actual.amount))
   row.complete=false;
  else row.totalCost+=Number(cost.actual.amount);
 }
 return [...byKey.values()].map(g=>({...g,totalCost:g.complete?round(g.totalCost):null}));
}
export function reconcileAnnualCosts({
 year,properties=[],objects=[],agreements=[],agreementItems=[],recurringCosts=[]
}={}){
 if(!Number.isInteger(year)||year<1900||year>9999)throw Error('Ange giltigt avräkningsår');
 const begin=year+'-01-01',end=year+'-12-31';
 const areaCache=new Map(),objectById=new Map(objects.map(o=>[o.id,o]));
 const results=[];
 for(const group of costGroups(recurringCosts,year,begin,end)){
  if(!areaCache.has(group.propertyId))areaCache.set(group.propertyId,propertyAreas(objects,group.propertyId,begin,end));
  const areas=areaCache.get(group.propertyId);
  const property=properties.find(p=>p.id===group.propertyId);
  for(const agreement of agreements){
   const object=objectById.get(agreement.object_id);
   if(!object||object.property_id!==group.propertyId)continue;
   if(!contractCovers(agreement,begin,end))continue;
   const rentItems=agreementItems.filter(item=>item.agreement_id===agreement.id&&item.type===group.category
    &&activeAt(item,end));
   const base={
    year,propertyId:group.propertyId,propertyName:property?.name||null,
    category:group.category,costIds:group.costIds,
    agreementId:agreement.id,agreementNumber:agreement.agreement_number,
    objectId:object.id,objectNumber:object.object_number,
    hasSupplement:rentItems.length>0,
    area:areas.parts.find(x=>x.objectId===object.id)?.area??null,
    totalArea:areas.total,
    totalCost:group.totalCost,
    share:null,allocatedCost:null,annualSupplement:null,difference:null,
    status:'review',reason:null
   };
   if(!rentItems.length){
    results.push({...base,status:'included',reason:'Inget separat avtalat tillägg – kostnaden ingår i hyran.'});
    continue;
   }
   if(!group.complete){results.push({...base,reason:'Fastställd, fullständig årskostnad saknas.'});continue;}
   if(areas.total===null||base.area===null){
    results.push({...base,reason:'Komplett årsarea för samtliga objekt saknas eller har ändrats.'});continue;
   }
   // Do not charge overlapping agreements against the same object without
   // checking occupancy periods. One physical area must not be settled twice.
   const overlapping=agreements.filter(a=>a.object_id===object.id&&contractCovers(a,begin,end));
   if(overlapping.length!==1){
    results.push({...base,reason:'Flera avtal omfattar samma objekt under året.'});continue;
   }
   if(!rentItems.every(item=>periodCovers(item,begin,end)&&item.adjustment_method==='none'
      &&validNumber(item.base_amount)&&Number(item.base_amount)>=0)){
    results.push({...base,reason:'Tillägget är indexerat eller har ändrats under året – kontrollera faktiskt debiterat belopp.'});
    continue;
   }
   const share=base.area/areas.total,allocatedCost=round(group.totalCost*share);
   const annualSupplement=round(rentItems.reduce((sum,item)=>sum+Number(item.base_amount),0));
   results.push({...base,share:round(share*100),allocatedCost,annualSupplement,
    difference:round(allocatedCost-annualSupplement),status:'ready'});
  }
 }
 return results;
}
