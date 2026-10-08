// Same-origin geocoding endpoint for the hosted Lokalblick frontend.
// ORS_API_KEY stays server-side; no property workbook is uploaded.
const key = process.env.ORS_API_KEY || process.env.OPENROUTESERVICE_API_KEY || "";
const respond = (res,status,payload) => { res.setHeader("Cache-Control","no-store"); res.setHeader("Content-Type","application/json; charset=utf-8"); return res.status(status).json(payload); };
export default async function handler(req,res) {
  if (req.method === "GET") return respond(res,200,{ok:true,configured:Boolean(key),provider:"openrouteservice"});
  if (req.method !== "POST") return respond(res,405,{ok:false,error:"Metoden stöds inte."});
  if (!key) return respond(res,503,{ok:false,code:"GEOCODING_NOT_CONFIGURED",error:"ORS_API_KEY saknas i Vercels miljövariabler."});
  const props = req.body?.properties;
  if (!Array.isArray(props) || props.length > 100) return respond(res,400,{ok:false,error:"Förväntade högst 100 fastigheter."});
  const results = [], seen = new Map();
  for (const property of props) {
    const id = String(property?.id || "");
    const address = String(property?.address || "").trim();
    const city = String(property?.city || "").trim();
    if (!id || !address || !city) { results.push({id,status:"not_found",latitude:null,longitude:null}); continue; }
    const lookup = [address,city,"Sweden"].join(", ");
    let result = seen.get(lookup);
    if (!result) {
      try {
        const url = new URL("https://api.openrouteservice.org/geocode/search");
        url.searchParams.set("api_key",key);
        url.searchParams.set("text",lookup);
        url.searchParams.set("boundary.country","SWE");
        url.searchParams.set("size","1");
        const response = await fetch(url,{signal:AbortSignal.timeout(11000)});
        if (!response.ok) {
          const detail = (await response.text()).slice(0,180);
          return respond(res,502,{ok:false,code:"GEOCODING_PROVIDER_ERROR",error:"OpenRouteService svarade "+response.status+": "+detail});
        }
        const payload = await response.json();
        const feature = payload.features?.[0];
        const coords = feature?.geometry?.coordinates;
        const longitude = Number(coords?.[0]), latitude = Number(coords?.[1]);
        const confidence = Number(feature?.properties?.confidence ?? 0);
        const precision = String(feature?.properties?.layer || "");
        // Do not silently pin a street, locality or an uncertain approximation.
        const matched = Array.isArray(coords) && Number.isFinite(longitude) && Number.isFinite(latitude) &&
          confidence >= 0.8 && ["address","venue"].includes(precision);
        result = { status:matched?"matched":feature?"review":"not_found",latitude:matched?latitude:null,
          longitude:matched?longitude:null,confidence,provider:"openrouteservice",
          matchCode:precision,geocodedAt:new Date().toISOString() };
        seen.set(lookup,result);
      } catch (error) {
        return respond(res,502,{ok:false,code:"GEOCODING_PROVIDER_ERROR",error:"Geokodningen misslyckades: "+error.message});
      }
    }
    results.push({...result,id,address,city});
  }
  return respond(res,200,{ok:true,provider:"openrouteservice",results});
}
