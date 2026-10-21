// Source identities belong to the issue's existing provenance, not a second register.
// Row positions are evidence only. Matching survives reordered rows and columns.
const text=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('sv');
const digest=value=>{let a=2166136261,b=5381;for(const char of JSON.stringify(value)){a=Math.imul(a^char.charCodeAt(0),16777619);b=Math.imul(b,33)^char.charCodeAt(0);}return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');};
const homes=new Set(['properties.id','properties.sourceId','properties.designation','properties.address','objects.id','objects.number','objects.propertyId','activities.propertyId','activities.objectId','contracts.id']);
export function issueImportPlan(workbook,profiles,issues,context,XLSX){
 const plans=new Map(),groups=new Map(),knownFingerprints=new Map();
 for(const issue of issues)for(const source of issue.sources||[])if(source.kind==='issue-import'&&source.fingerprint){
  if(!knownFingerprints.has(source.fingerprint))knownFingerprints.set(source.fingerprint,new Set());knownFingerprints.get(source.fingerprint).add(issue.id);
 }
 for(const profile of profiles){
  if(!profile.columns.some(column=>column.target.startsWith('activities.')))continue;
  const sheet=workbook.Sheets[profile.sheetKey||profile.name];if(!sheet?.['!ref'])continue;
  const source=profile.fileName||context.fileName||'Excel',groupKey=JSON.stringify([source,profile.name]);
  if(!groups.has(groupKey))groups.set(groupKey,[]);
  const rows=new Map(),selected=profile.columns.filter(column=>!column.target.startsWith('@')),end=XLSX.utils.decode_range(sheet['!ref']).e.r;plans.set(profile,rows);
  for(let r=profile.dataStartRow??profile.headerRow;r<=end;r++){
   const values=selected.map(column=>({target:column.target,value:sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})]?.v})).filter(cell=>cell.value!=null&&cell.value!=='');
   if(!values.some(cell=>cell.target.startsWith('activities.')))continue;
   if(rows.size>=20000)throw Error('Högst 20 000 datarader per import. Dela underlaget i mindre filer.');
   const title=text(values.find(cell=>cell.target==='activities.title')?.value);
   const location=values.filter(cell=>homes.has(cell.target)).map(cell=>[cell.target,text(cell.value)]).sort();
   const record={kind:'issue-import',source,sheet:profile.name,row:r+1,fingerprint:digest(values.map(cell=>[cell.target,text(cell.value)]).sort()),identity:title?digest([title,location]):null};
   const row={record,explicitId:values.find(cell=>cell.target==='activities.id')?.value?.toString().trim()};rows.set(r,row);groups.get(groupKey).push(row);
  }
 }
 for(const rows of groups.values()){
  if(!rows.length)continue;
  const {source,sheet}=rows[0].record;
  const prior=issues.flatMap(issue=>(issue.sources||[]).filter(record=>record.kind==='issue-import'&&record.source===source&&record.sheet===sheet).map(record=>({issue,record})));
  const matched=new Set(),incoming=new Map(),fingerprints=new Map(),identities=new Map();
  for(const row of rows)if(!row.explicitId)incoming.set(row.record.identity,(incoming.get(row.record.identity)||0)+1);
  for(const item of prior){
   for(const [index,value]of [[fingerprints,item.record.fingerprint],[identities,item.record.identity]]){
    if(!index.has(value))index.set(value,new Set());index.get(value).add(item.issue.id);
   }
  }
  for(const row of rows){
   const {record,explicitId}=row;
   if(explicitId){row.id=String(explicitId).trim();matched.add(row.id);continue;}
   const ids=[...(fingerprints.get(record.fingerprint)||identities.get(record.identity)||[])];
   if(!record.identity||incoming.get(record.identity)>1||ids.length>1){row.error='Ärendet kan inte identifieras entydigt. Ange ÄrendeID för dessa rader eller gör ärendenamnet och kopplingen unika.';continue;}
   if(ids.length===1){row.id=ids[0];matched.add(row.id);}
   else if(knownFingerprints.has(record.fingerprint))row.error='Raden liknar ett ärende från en annan fil eller flik ('+[...knownFingerprints.get(record.fingerprint)].join(', ')+'). Kontrollera och ange ÄrendeID för att återanvända rätt ärende.';
  }
  const missing=prior.some(item=>!matched.has(item.issue.id));
  for(const row of rows)if(!row.id&&!row.error&&missing)row.error='Ny eller ändrad ärenderad kan inte skiljas från tidigare importerade ärenden. Ange tidigare ÄrendeID för ändrade rader. Nya rader kan läsas in när tidigare rader är identifierade.';
 }
 return plans;
}
