import {legacyFinanceMap} from './finance-model.js';
const present=x=>x!==undefined&&x!==null&&x!=='';
// Stable IDs make repeated external imports idempotent. Conflicts stop the import.
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
