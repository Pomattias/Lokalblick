// ID corrections are recorded in the existing history, not a second register.
export function propertyAliases(history=[]){
 const aliases=new Map();
 for(const entry of history)if(entry.collection==='properties')for(const field of entry.fields||[]){
  if(field.field==='id'&&typeof field.from==='string'&&typeof field.to==='string'&&field.from!==field.to)aliases.set(field.from,field.to);
 }
 return aliases;
}
export function resolvePropertyId(aliases,id){
 const visited=new Set();
 while(aliases.has(id)&&!visited.has(id)){visited.add(id);id=aliases.get(id);}
 return id;
}
export function propertyHistoryIds(history,id){
 const aliases=propertyAliases(history),current=resolvePropertyId(aliases,id);
 return new Set([id,current,...[...aliases.keys()].filter(previous=>resolvePropertyId(aliases,previous)===current)]);
}
export function propertyIdInBudget(plans,id){
 if(typeof plans==='string')return plans===id||plans.includes('property|'+id+'|');
 if(!plans||typeof plans!=='object')return false;
 return Object.entries(plans).some(([key,value])=>key===id||key.startsWith('property|'+id+'|')||propertyIdInBudget(value,id));
}
