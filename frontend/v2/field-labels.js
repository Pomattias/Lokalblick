// The canonical source schema owns the names used by UI, Excel and mapping.
export function fieldCaption(collection,control,fallback) {
  const field=String(control).match(/\bname="([^"]+)"/)?.[1];
  const service=globalThis.LokalblickSourceService||globalThis.window?.LokalblickSourceService;
  return field ? service?.fieldLabel?.(collection,field,fallback)||fallback : fallback;
}
