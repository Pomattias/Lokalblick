/* Update old zero-index fixture contracts when an older demo was saved locally.
   Real connected data and user-edited lease conditions are never changed. */
const FIELDS=["rentBaseYear","rentBaseIndex","rentIndexPercent","rentSeriesBase"];
export function updateLegacyDemoIndexTerms(data, fixture){
  if(!data?.isDemo || !fixture?.isDemo || !Array.isArray(data.contracts))return 0;
  const examples=new Map((fixture.contracts||[]).map(c=>[String(c.id),c]));
  let changed=0;
  for(const c of data.contracts){
    const reference=examples.get(String(c.id));
    if(!reference||!String(c.id).startsWith("AVT-DEMO-"))continue;
    if(Number(c.baseRent)!==Number(reference.baseRent)||
       Number(c.rentIndexPercent)!==0||
       (c.rentBaseYear!=null&&c.rentBaseYear!=="")||
       (c.rentBaseIndex!=null&&c.rentBaseIndex!==""))continue;
    for(const field of FIELDS)c[field]=reference[field];
    changed++;
  }
  return changed;
}
