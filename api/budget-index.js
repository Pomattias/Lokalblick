const URL='https://statistikdatabasen.scb.se/api/v2/tables/TAB6792/data?lang=sv&outputFormat=json-stat2';
export function extractBudgetIndex(dataset,year) {
  const ids=dataset?.id,sizes=dataset?.size;
  if(!Array.isArray(ids)||ids.length!==2||!Array.isArray(sizes))throw Error('Oväntat KPI-format');
  const time=ids.indexOf('Tid'),content=ids.indexOf('ContentsCode');
  if(time<0||content<0)throw Error('KPI-dimensioner saknas');
  const index=dataset.dimension.ContentsCode.category.index;
  const metric=index['000007MM']; // SCB: fastställd KPI ombasad till 1980=100.
  if(!Number.isInteger(metric))throw Error('KPI med basår 1980 saknas');
  const rows=[];
  for(const [period,slot] of Object.entries(dataset.dimension.Tid.category.index)) {
    if(!new RegExp('^'+year+'M(0[1-9]|10)$').test(period))continue;
    const coordinates=[];coordinates[time]=slot;coordinates[content]=metric;
    const pos=coordinates[0]*sizes[1]+coordinates[1],value=dataset.value[pos];
    if(typeof value!=='number'||!Number.isFinite(value)||value<=0)continue;
    rows.push({year,month:Number(period.slice(-2)),value,seriesBase:'1980',source:'SCB · fastställda KPI-tal · TAB6792',tableId:'TAB6792',retrievedAt:new Date().toISOString()});
  }
  if(!rows.length)throw Error('Inget publicerat KPI för indexåret');
  return rows;
}
export async function fetchBudgetIndex(year) {
  if(!Number.isInteger(year)||year<2025||year>2200)throw Error('Ogiltigt indexår');
  const response=await fetch(URL,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('SCB svarade '+response.status);
  return extractBudgetIndex(await response.json(),year);
}
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).json({error:'Endast GET'});
  try {const rows=await fetchBudgetIndex(Number(req.query?.year));res.setHeader('Cache-Control','s-maxage=3600');return res.status(200).json({rows});}
  catch(error){return res.status(503).json({error:error.message});}
}
