// The canonical source schema owns the names used by UI, Excel and mapping.
// UI captions may differ; canonical sheet names and saved fields remain intact.
export const issueCaption=value=>String(value??'').replace(/\b(Aktiviteter|aktiviteter|Aktivitet|aktivitet)\b/g,word=>({Aktiviteter:'Ärenden',aktiviteter:'ärenden',Aktivitet:'Ärende',aktivitet:'ärende'})[word]);
export const collectionCaption=schema=>schema.key==='activities'?'Ärenden':schema.sheet;
export function fieldCaption(collection,control,fallback) {
  const field=String(control).match(/\bname="([^"]+)"/)?.[1];
  const service=globalThis.LokalblickSourceService||globalThis.window?.LokalblickSourceService;
  return field ? service?.fieldLabel?.(collection,field,fallback)||fallback : fallback;
}
