// Parent-derived public business numbers. Internal UUIDs never change.
// Explicit numbers from source data always take precedence over suggestions.
const number=s=>String(s??'').trim();
const escapeRegExp=s=>s.replace(/[|\\{}()[\]^$+*?.]/g,'\\$&');
function nextSuffix(prefix,used,width){
 if(!prefix)return null;
 const pattern=new RegExp('^'+escapeRegExp(prefix)+'-([0-9]+)$','i');
 let max=0;
 for(const current of used){
  const match=pattern.exec(number(current));
  if(match){
   const suffix=Number(match[1]);
   if(Number.isSafeInteger(suffix))max=Math.max(max,suffix);
  }
 }
 if(max>=Number.MAX_SAFE_INTEGER)throw Error('Nummerföljden är full.');
 const taken=new Set(used.map(v=>number(v).toLocaleLowerCase('sv')));
 let candidate;
 do {max++;candidate=prefix+'-'+String(max).padStart(width,'0')}
 while(taken.has(candidate.toLocaleLowerCase('sv')));
 return candidate;
}
export function nextObjectNumber(property,objects=[],properties=[]){
 if(!property)return null;
 const prefix=number(property.management_object_number);
 if(!prefix)return null;
 // Duplicated property numbers are ambiguous: require manual correction.
 if(properties.some(row=>row.id!==property.id&&number(row.management_object_number)
  .toLocaleLowerCase('sv')===prefix.toLocaleLowerCase('sv')))return null;
 return nextSuffix(prefix,objects.filter(row=>row.property_id===property.id).map(row=>row.object_number),3);
}
export function nextAgreementNumber(object,agreements=[]){
 const prefix=number(object?.object_number);
 if(!prefix)return null;
 return nextSuffix(prefix,agreements.map(row=>row.agreement_number),2);
}
