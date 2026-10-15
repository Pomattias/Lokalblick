// One user-facing date convention in Lokalblick: YYYY-MM-DD.
// Keep ISO date values unchanged; format timestamped journal entries in
// Swedish local time while keeping a numeric ISO date and 24-hour time.
export function isoDate(value) {
  const raw=String(value??"").trim();
  if(!raw)return "";
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const parsed=new Date(raw);
  if(Number.isNaN(parsed.getTime()))return raw;
  return new Intl.DateTimeFormat("sv-SE",{
    timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit"
  }).format(parsed);
}
export function isoDateTime(value) {
  const raw=String(value??"").trim();
  if(!raw)return "";
  const parsed=new Date(raw);
  if(Number.isNaN(parsed.getTime()))return raw;
  return new Intl.DateTimeFormat("sv-SE",{
    timeZone:"Europe/Stockholm",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hour12:false
  }).format(parsed).replace(", "," ");
}
