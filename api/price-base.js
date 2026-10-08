// Official price base amounts from Statistics Sweden (SCB), PxWeb API v2.
// Only an exact year/value combination is accepted. No inferred fallback.
const SCB_URL = "https://statistikdatabasen.scb.se/api/v2/tables/TAB598/data?lang=sv&outputFormat=json-stat2";
const SOURCE_PAGE = "https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__PR__PR0101__PR0101E/Basbeloppet/";
export function extractPriceBase(dataset, year) {
  const dimensions = dataset?.dimension;
  const ids = dataset?.id;
  if (!Array.isArray(ids) || !dimensions || !Array.isArray(dataset?.value)) throw Error("SCB returnerade oväntat dataformat");
  const timeId = ids.find(id => /^(tid|år|ar|time|year)$/i.test(id));
  if (!timeId) throw Error("Årsdimension saknas hos SCB");
  const time = dimensions[timeId], index = time?.category?.index;
  const slot = index && (Array.isArray(index) ? index.indexOf(String(year)) : index[String(year)]);
  if (!Number.isInteger(slot) || slot < 0) throw Error("SCB har inget fastställt prisbasbelopp för året");
  const sizes = ids.map(id => dataset.size[ids.indexOf(id)] ?? dimensions[id]?.category?.label && Object.keys(dimensions[id].category.label).length);
  if (sizes.some(n=>!Number.isInteger(n) || n<1)) throw Error("SCB:s dimensioner kunde inte tolkas");
  // The price base table contains one content value. Refuse ambiguous multi-content data.
  if (ids.some((id,i)=>id!==timeId && sizes[i]!==1)) throw Error("SCB returnerade flera olika mått");
  const pos=slot * sizes.slice(ids.indexOf(timeId)+1).reduce((a,b)=>a*b,1);
  const value=Number(dataset.value[pos]);
  if (!Number.isFinite(value) || value<1000 || value>200000) throw Error("Ogiltigt belopp från SCB");
  return Math.round(value);
}
export default async function handler(req,res) {
  if (req.method !== "GET") return res.status(405).json({error:"Endast GET stöds"});
  const year = Number(req.query?.year);
  if (!Number.isInteger(year) || year<1960 || year>2200) return res.status(400).json({error:"Ogiltigt år"});
  try {
    const response=await fetch(SCB_URL,{headers:{"Accept":"application/json"},signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error("SCB svarade HTTP "+response.status);
    const data=await response.json();
    const amount=extractPriceBase(data,year);
    res.setHeader("Cache-Control","s-maxage=86400, stale-while-revalidate=86400");
    return res.status(200).json({year,amount,source:"SCB · Prisbasbeloppet (PR0101A1)",sourceUrl:SOURCE_PAGE,tableId:"TAB598",retrievedAt:new Date().toISOString()});
  } catch(e) {
    return res.status(503).json({error:"Kunde inte hämta verifierat prisbasbelopp från SCB",detail:String(e.message||e)});
  }
}
