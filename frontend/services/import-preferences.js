const normalized=value=>String(value??'').trim().toLocaleLowerCase('sv');
export const sourcePreferenceKey=(collection,field,source)=>[collection,field,source].map(normalized).join('|');
export function columnPreferenceKey(collection,field,source,profile,column){
 const repeated=profile?.columns?.filter(other=>normalized(other.header)===normalized(column?.header)).length>1;
 return JSON.stringify([collection,field,source,profile?.name,column?.header,repeated?profile?.layoutSignature:'',repeated?column?.index:''].map(normalized));
}
export function importPreference(preferences,collection,field,source,profile,column){
 return preferences?.[columnPreferenceKey(collection,field,source,profile,column)]??preferences?.[sourcePreferenceKey(collection,field,source)];
}
