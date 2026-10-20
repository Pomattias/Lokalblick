import '../domain/calculations.js';
import '../domain/recurring-costs.js';
// These compatibility values are disposable projections for existing views and
// Budget. Only the three financial registers are persisted by collectWorkspace.
export function projectFinance(view){
 for(const c of view.contracts||[]){
  c.items=(view.agreementItems||[]).filter(item=>item.contractId===c.id);
  for(const [type,prefix,amount]of [['base','rent','baseRent'],['addition','addition','baseAdditions']]){
   const rows=c.items.filter(item=>type==='addition'?!['base','tax'].includes(item.type):item.type===type),first=rows[0]||{};
   c[amount]=rows.reduce((sum,item)=>sum+Number(item.baseAmount||0),0);
   for(const suffix of ['BaseYear','BaseIndex','IndexPercent','AdjustmentMethod','AnnualPercent','MinPercent','MaxPercent','LimitBasis','SeriesBase','Floor'])c[prefix+suffix]=first[suffix[0].toLowerCase()+suffix.slice(1)]??null;
  }
  c.annualPropertyTax=c.items.filter(item=>item.type==='tax').reduce((sum,item)=>sum+Number(item.baseAmount||0),0);
 }
 for(const cost of view.recurringCosts||[]){
  const old=(view.auditLog||[]).flatMap(entry=>entry.financialMigration||[]).find(row=>row.table==='recurringCosts'&&row.id===cost.id)?.values;
  if(old?.contractId)cost.budgetScopeContractId=old.contractId;
  cost.startYear=cost.start?Number(cost.start.slice(0,4)):null;cost.endYear=cost.end?Number(cost.end.slice(0,4)):null;
  const evidence=(view.costEvidence||[]).filter(row=>row.costId===cost.id),years=new Set(evidence.flatMap(row=>row.type==='annual'?[row.year]:Array.from({length:Number(row.end.slice(0,4))-Number(row.start.slice(0,4))+1},(_,i)=>Number(row.start.slice(0,4))+i)));
  cost.actuals=[...years].map(year=>({year,...globalThis.LokalblickRecurringCosts.evidenceActual(cost,evidence,year)})).filter(row=>row.complete).map(({year,amount})=>({year,amount}));
 }
 return view;
}

// The protected Budget form still submits its original scalar controls. Adapt
// unambiguous edits to their sole stored item; never write a second amount.
export function applyContractFinanceEdit(view,before,next){
 const fields={BaseYear:'baseYear',BaseIndex:'baseIndex',IndexPercent:'indexPercent',AdjustmentMethod:'adjustmentMethod',AnnualPercent:'annualPercent',MinPercent:'minPercent',MaxPercent:'maxPercent',LimitBasis:'limitBasis'};
 for(const [type,prefix,amount]of [['base','rent','baseRent'],['addition','addition','baseAdditions'],['tax',null,'annualPropertyTax']]){
  const mapping={[amount]:'baseAmount',...(prefix?Object.fromEntries(Object.entries(fields).map(([suffix,key])=>[prefix+suffix,key])):{})};
  const changes=Object.entries(mapping).filter(([field])=>JSON.stringify(before?.[field]??null)!==JSON.stringify(next[field]??null));
  if(!changes.length)continue;
  const items=(view.agreementItems||[]).filter(item=>item.contractId===next.id&&(type==='addition'?!['base','tax'].includes(item.type):item.type===type));
  if(items.length>1)throw Error('Avtalet har flera separata poster. Redigera dessa på Avtalssidan.');
  let item=items[0];
  if(!item){item={id:crypto.randomUUID(),contractId:next.id,type,name:type==='base'?'Bashyra':type==='tax'?'Fastighetsskatt':'Tilläggshyra',baseAmount:0,adjustmentMethod:prefix?'kpi':'none',start:next.start||null,end:next.end||null};view.agreementItems.push(item);}
  for(const[field,key]of changes)item[key]=next[field]??null;
 }
}

export function applyLegacyCostEdit(view,next,year){
 const rows=view.recurringCosts||(view.recurringCosts=[]),previous=rows.find(row=>row.id===next.id);
 const cost={...previous,...next};
 if(cost.contractId){cost.propertyId=view.contracts.find(c=>c.id===cost.contractId)?.propertyId;delete cost.contractId;}
 if(!['heat','water','electricity','cooling','waste','other'].includes(cost.category))cost.category='other';
 if(!previous||next.startYear!==previous.startYear)cost.start=next.startYear?next.startYear+'-01-01':null;
 if(!previous||next.endYear!==previous.endYear)cost.end=next.endYear?next.endYear+'-12-31':null;
 const actual=next.actuals?.find(row=>row.year===Number(year)),before=previous?.actuals?.find(row=>row.year===Number(year));
 view.costEvidence ||= [];
 if((actual?.amount??null)!==(before?.amount??null)){
  const old=view.costEvidence.find(row=>row.costId===cost.id&&row.type==='annual'&&row.year===Number(year));
  if(actual){const evidence={...old,id:old?.id||crypto.randomUUID(),costId:cost.id,type:'annual',year:Number(year),amount:actual.amount,selected:true};if(old)Object.assign(old,evidence);else view.costEvidence.push(evidence);}
  else if(old)view.costEvidence=view.costEvidence.filter(row=>row.id!==old.id);
 }
 const index=rows.findIndex(row=>row.id===cost.id);if(index<0)rows.push(cost);else rows[index]=cost;
}
