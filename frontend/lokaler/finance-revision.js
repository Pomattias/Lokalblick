import {legacyFinanceMap} from './finance-model.js';
const present=x=>x!==undefined&&x!==null&&x!=='';
// Stable IDs make repeated import/upgrades idempotent. Conflicts stop the import.
export function financialId(kind,id){
 const raw=kind+'|'+id;if(raw.length<=100)return raw;
 let a=2166136261,b=5381;for(const c of raw){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}return kind+'|'+(a>>>0).toString(16)+(b>>>0).toString(16);
}
export function legacyAgreementItems(row,agreementId=row.id,sources=[],existingItems=[]){
 const values=Object.fromEntries(Object.entries(legacyFinanceMap).map(([key,view])=>[view,row[key]]));
 const result=[];
 for(const [type,amount,prefix,name]of [['base','baseRent','rent','Bashyra'],['addition','baseAdditions','addition','Tilläggshyra'],['tax','annualPropertyTax',null,'Fastighetsskatt']]){
  const fields=prefix?['BaseYear','BaseIndex','IndexPercent','AdjustmentMethod','AnnualPercent','MinPercent','MaxPercent','LimitBasis']:[];
  if(!present(values[amount])&&!fields.some(suffix=>present(values[prefix+suffix])))continue;
  const item={id:financialId(type,agreementId),agreement_id:agreementId,type,name,base_amount:Number(values[amount]||0),valid_from:row.valid_from||null,valid_to:row.valid_to||null,adjustment_method:prefix?values[prefix+'AdjustmentMethod']||'kpi':'none',reconcilable:false,sources:sources.length?sources:[{table:'agreements',recordId:agreementId,fields:[amount,...fields.map(suffix=>prefix+suffix)]}]};
  if(prefix)for(const [field,suffix]of [['base_year','BaseYear'],['base_index','BaseIndex'],['index_share','IndexPercent'],['annual_percent','AnnualPercent'],['min_percent','MinPercent'],['max_percent','MaxPercent'],['limit_basis','LimitBasis']])item[field]=values[prefix+suffix]??null;
  if(item.index_share>1&&item.index_share<=100)item.index_share/=100;
  const previous=existingItems.find(row=>row.id===item.id);
  if(previous){
   const patch={id:item.id,sources:item.sources};
   if(present(values[amount]))patch.base_amount=item.base_amount;
   if(prefix)for(const [field,suffix]of [['base_year','BaseYear'],['base_index','BaseIndex'],['index_share','IndexPercent'],['adjustment_method','AdjustmentMethod'],['annual_percent','AnnualPercent'],['min_percent','MinPercent'],['max_percent','MaxPercent'],['limit_basis','LimitBasis']])if(present(values[prefix+suffix]))patch[field]=item[field];
   result.push(patch);
  }else result.push(item);
 }
 return result;
}
export function upgradeFinance(data){
 data.agreement_items ||= [];data.recurring_costs ||= [];data.cost_evidence ||= [];data.workspace ||= {};
 const moved=[];
 const insert=(table,row)=>{const existing=data[table].find(x=>x.id===row.id);if(existing)throw Error('Ekonomimigrering har motstridiga poster: '+row.id);data[table].push(row);};
 for(const row of data.agreements||[]){
  const values=Object.fromEntries(Object.keys(legacyFinanceMap).filter(key=>present(row[key])).map(key=>[key,row[key]]));
  if(Object.keys(values).length){for(const item of legacyAgreementItems(row))insert('agreement_items',item);moved.push({table:'agreements',id:row.id,values});}
  for(const key of Object.keys(legacyFinanceMap))delete row[key];
 }
 for(const cost of data.workspace.recurringCosts||[]){
  const agreement=data.agreements.find(a=>a.id===cost.contractId),object=data.objects.find(o=>o.id===agreement?.object_id);
  const propertyId=cost.propertyId||object?.property_id;
  if(!propertyId)throw Error('Kostnaden '+cost.id+' saknar fastighet. Inga data har ändrats.');
  const categories={värme:'heat',va:'water',el:'electricity',kyla:'cooling',sopor:'waste',övrigt:'other'};
  insert('recurring_costs',{id:cost.id,property_id:propertyId,name:cost.name,category:categories[String(cost.category||cost.name).toLocaleLowerCase('sv')]||'other',annual_amount:cost.annualAmount,valid_from:cost.startYear?cost.startYear+'-01-01':null,valid_to:cost.endYear?cost.endYear+'-12-31':null,sources:cost.sources||null});
  for(const actual of cost.actuals||[])insert('cost_evidence',{id:financialId('actual',cost.id+'|'+actual.year),cost_id:cost.id,type:'annual',year:actual.year,amount:actual.amount,selected:true});
  moved.push({table:'recurringCosts',id:cost.id,values:cost});
 }
 delete data.workspace.recurringCosts;
 if(moved.length)data.workspace.auditLog=[...(data.workspace.auditLog||[]),{id:crypto.randomUUID(),collection:'schema',action:'Ekonomi flyttad till avtalsposter och fastighetskostnader',by:'Lokalblick',at:new Date().toISOString(),fields:moved.map(row=>({field:row.table+'.'+row.id,from:row.values,to:null})),financialMigration:moved}];
 return data;
}
