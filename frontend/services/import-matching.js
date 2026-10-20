import {personRole,contactPart,contactFields} from './import-person-links.js';
// Column choices are derived from the supplied current schemas, never a second model.
import {profileFormat} from './import-formats.js';
export const matchName=value=>String(value??'').trim().toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const present=value=>value!=null&&String(value).trim()!=='';
export function schemaFields(schemas){return schemas.flatMap(schema=>schema.columns.map(([field,label])=>({target:schema.key+'.'+field,collection:schema.key,field,label:schema.sheet+' → '+label,caption:label,type:schema.fieldSpecs?.[field]?.type,aliases:schema.labelAliases?.[field]||[],storage:schema.fieldSpecs?.[field]?.storageTarget||schema.storage+'.'+(schema.fieldSpecs?.[field]?.storageKey||field)})));}
function tableNames(schema){return [schema.key,schema.storage,schema.sheet,schema.singular,...(schema.aliases||[])].filter(Boolean).map(matchName);}
export function relatedTables(schemas,primary){
 const root=schemas.find(s=>s.key===primary);if(!root)return [];
 const near=new Set(root.related||[]);for(const parent of root.parents||[])for(const key of schemas.find(s=>s.key===parent)?.parents||[])near.add(key);return [...near].filter(key=>key!==primary);
}
export function resolveFieldName(value,schemas,primary){
 const raw=String(value??'').trim();if(!raw)return null;
 if(['importerainte','ignorera','ignore'].includes(matchName(raw)))return {target:'@ignore'};
 const typed=raw.match(/\s*\[([^\]]+)\]\s*$/),text=typed?raw.slice(0,typed.index).trim():raw;
 const fields=schemaFields(schemas),direct=fields.find(f=>f.target===text||f.storage===text);
 if(direct){const itemType=typed?Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).find(([label])=>matchName(label)===matchName(typed[1]))?.[1]:null;if(typed&&!itemType)return null;return {...direct,...(itemType?{itemType}:{})};}
 const split=text.indexOf('.'),table=split>=0?schemas.find(s=>tableNames(s).includes(matchName(text.slice(0,split)))):null;
 const name=matchName((table?text.slice(split+1):text).replace(/[, ]+(?:kr|tkr|mkr|sek|m²|m2|kvm)(?:\/(?:år|mån))?$/i,'')),scope=table?fields.filter(f=>f.collection===table.key):fields;
 const hits=scope.filter(f=>[f.field,f.caption,...f.aliases].some(alias=>matchName(String(alias).replace(/[, ]+(?:kr|tkr|mkr|sek|m²|m2|kvm)(?:\/(?:år|mån))?$/i,''))===name));
 const generic=['belopp','arsbelopp','kostnad','typ','namn','kategori'].includes(name);
 const chosen=hits.length===1?(!table&&generic&&hits[0].collection!==primary&&!relatedTables(schemas,primary).includes(hits[0].collection)?null:hits[0]):hits.find(f=>f.collection===primary)||hits.find(f=>f.field==='id');
 if(chosen){const itemType=typed?Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).find(([label])=>matchName(label)===matchName(typed[1]))?.[1]:null;if(typed&&!itemType)return null;return {...chosen,...(itemType?{itemType}:{})};}
 // Wide rent columns are input conveniences that still point at a real item field.
 const shortcuts=schemas.flatMap(s=>(s.shortcuts||[]).map(shortcut=>({...shortcut,owner:s.key})));
 if(!table&&['recurringCosts','costEvidence'].includes(primary))return null;
 const shortcut=shortcuts.find(s=>(!table||s.owner===table.key||s.target.startsWith(table.key+'.'))&&s.aliases.some(alias=>matchName(String(alias).replace(/[, ]+(?:kr|tkr|mkr|sek|m²|m2|kvm)(?:\/(?:år|mån))?$/i,''))===name));
 return shortcut&&fields.some(f=>f.target===shortcut.target)?shortcut:null;
}
export function inferTable(name,headers,samples,schemas){
 const scores=schemas.map(schema=>{
  const names=tableNames(schema),sheet=matchName(name);let score=names.some(n=>n.length>3&&sheet.includes(n))?30:0;
  for(const header of headers){const matches=resolveFieldName(header,schemas,schema.key);if(matches?.collection===schema.key||matches?.target?.startsWith(schema.key+'.'))score+=matches.field==='id'?8:schema.fieldSpecs?.[matches.field]?.type==='ref'?1:3;}
  // ID-shaped values strengthen a named ID column; data never acts as instructions.
  if(samples.some(row=>row.some(v=>typeof v==='number')))score+=headers.some(h=>schema.columns.some(([f,label])=>schema.fieldSpecs?.[f]?.type==='number'&&matchName(label)===matchName(h)))?1:0;
  return {key:schema.key,score};
 }).sort((a,b)=>b.score-a.score);
 return scores[0]?.score?{key:scores[0].key,confidence:scores[0].score>(scores[1]?.score||0)?'suggested':'review'}:{key:schemas.find(s=>s.key==='properties')?.key||schemas[0]?.key,confidence:'review'};
}
export function profileTables(workbook,schemas,XLSX,saved=[],options={}){
 const fields=schemaFields(schemas),valid=new Set(fields.map(f=>f.target));
 return workbook.SheetNames.map(sheetKey=>{
  const source=workbook.__importSources?.find(s=>s.sheetKey===sheetKey),name=source?.sheetName||sheetKey,sheet=workbook.Sheets[sheetKey],range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):{s:{r:0,c:0},e:{r:0,c:0}};
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true}),start=range.s.r;
  let headerIndex=0,best=-1;
  matrix.slice(0,50).forEach((row,i)=>{
   // Qualified field names in a mapping row must never win header detection.
   const qualified=row.filter(present).filter(v=>String(v).includes('.')&&resolveFieldName(v,schemas)).length;
   const known=row.filter(present).filter(v=>resolveFieldName(v,schemas)).length;
   const score=known*8+row.filter(v=>typeof v==='string').length-row.filter(v=>typeof v==='number').length-qualified*12;
   if(score>best&&(known>=2||i===0||row.filter(present).length===1&&known===1)){best=score;headerIndex=i;}
  });
  const headers=matrix[headerIndex]||[],signature=JSON.stringify(headers.filter(present).map(matchName).sort()),layoutSignature=JSON.stringify(headers.map(matchName));
  const candidates=saved.filter(s=>s.signature===signature),exact=candidates.find(s=>s.sheet===name&&(!source?.fileName||s.fileName===source.fileName));
  const previous=exact||(candidates.length&&candidates.every(s=>JSON.stringify(s.columns.map(c=>[matchName(c.header),c.target,c.itemType]))===JSON.stringify(candidates[0].columns.map(c=>[matchName(c.header),c.target,c.itemType])))?candidates[0]:null);
  const inference=inferTable(name,headers,matrix.slice(headerIndex+1,headerIndex+9),schemas),primary=valid.size&&schemas.some(s=>s.key===previous?.primaryTable)?previous.primaryTable:inference.key;
  const profile={name,sheetKey,fileName:source?.fileName,fingerprint:source?.fingerprint,signature,layoutSignature,headerIndex,headerRow:start+headerIndex+1,startColumn:range.s.c,primaryTable:primary,inferred:primary,tableConfidence:inference.confidence,canonical:true};
  const possible=matrix[headerIndex+1]||[],nonempty=possible.filter(present),qualified=nonempty.filter(v=>/^[^.]+\..+/.test(String(v))&&resolveFieldName(v,schemas,primary));
  profile.mappingRowSuggested=qualified.length>=2&&qualified.length/nonempty.length>=0.6;
  profile.mappingRow=false;
  profile.columns=headers.map((header,index)=>{
   if(!present(header))return null;
   const duplicate=headers.filter(h=>matchName(h)===matchName(header)).length>1,matches=(previous?.columns||[]).filter(c=>matchName(c.header)===matchName(header));
   const rule=duplicate?(previous?.layoutSignature===layoutSignature?matches.find(c=>c.index===index):null):matches.length===1?matches[0]:null;
   const suggestion=resolveFieldName(header,schemas,primary);let target=rule?(valid.has(rule.target)||rule.target==='@ignore'||rule.target.startsWith('contact.')?rule.target:'@unmapped'):suggestion?.target||'@unmapped';
   if(rule?.contactHeader&&contactPart(target)){const contacts=headers.map((h,i)=>({h,i})).filter(c=>matchName(c.h)===matchName(rule.contactHeader));target=contacts.length===1?'contact.'+contacts[0].i+'.'+contactPart(target).field:'@unmapped';}
   const ambiguous=matchName(header)==='objektsnummerforvaltningsobjekt'&&!rule;
   return {header:String(header),index,target:ambiguous?'@unmapped':target,collection:target.split('.')[0],itemType:rule?rule.itemType:suggestion?.itemType,transform:rule?.transform||(/månadshyra/i.test(header)?'monthly':'auto'),date1904:Boolean(workbook.Workbook?.WBProps?.date1904||source?.date1904),dateMode:rule?.dateMode||'auto',invalidPolicy:rule?.invalidPolicy||'reject-row',emptyMarkers:true,approved:Boolean(rule),personFormat:rule?.personFormat,shared:rule?.shared===true,matchSource:rule?'saved':suggestion?'alias':'unmatched',warning:rule&&target==='@unmapped'?'Det tidigare fältet finns inte längre. Välj ett aktuellt fält.':''};
  }).filter(Boolean);
  if(primary==='agreementItems'&&profile.columns.some(c=>c.target==='agreementItems.type'))for(const c of profile.columns)if(!c.approved)delete c.itemType;
  refreshTableProfile(workbook,profile,schemas,XLSX);return profile;
 });
}
export function refreshTableProfile(workbook,profile,schemas,XLSX){
 const sheet=workbook.Sheets[profile.sheetKey||profile.name],range=XLSX.utils.decode_range(sheet['!ref']||'A1');
 const first=profile.headerRow+(profile.mappingRow?1:0);profile.dataStartRow=first;
 let rows=0;for(let r=first;r<=range.e.r;r++)if(profile.columns.some(c=>present(sheet[XLSX.utils.encode_cell({r,c:profile.startColumn+c.index})]?.v)))rows++;
 profile.rowCount=rows;
 for(const column of profile.columns){
  const spec=schemas.find(s=>s.key===column.target.split('.')[0])?.fieldSpecs?.[column.target.split('.')[1]],cells=[];
  // Match only a representative sample; every imported value is validated later.
  for(let r=first;r<=range.e.r&&cells.length<100;r++){const cell=sheet[XLSX.utils.encode_cell({r,c:profile.startColumn+column.index})];if(present(cell?.v))cells.push(cell);}
  column.format=profileFormat(cells,{...column,valueType:spec?.type},XLSX);column.samples=[];
  for(let r=first;r<Math.min(first+3,range.e.r+1);r++)column.samples.push(sheet[XLSX.utils.encode_cell({r,c:profile.startColumn+column.index})]?.v??'');
  column.filled=cells.length;column.sampled=profile.rowCount>100;column.identity=column.target.endsWith('.id')||spec?.type==='ref';column.valueType=spec?.type;
 }
}
export function setMappingRow(workbook,profile,enabled,schemas,XLSX){
 profile.mappingRow=enabled;
 for(const column of profile.columns){
  if(enabled){const mappingValue=workbook.Sheets[profile.sheetKey||profile.name][XLSX.utils.encode_cell({r:profile.headerRow,c:profile.startColumn+column.index})]?.v;column.beforeMapping={target:column.target,itemType:column.itemType,approved:column.approved,matchSource:column.matchSource};const field=resolveFieldName(mappingValue,schemas,profile.primaryTable)||(contactPart(String(mappingValue))?{target:String(mappingValue)}:null);column.target=field?.target||'@unmapped';column.itemType=field?.itemType;column.matchSource='explicit';column.approved=Boolean(field);column.warning=!field?'Okänt Lokalblick-fält: '+String(mappingValue||'(tomt)')+'. Välj fält eller Importera inte.':'';}
  else{Object.assign(column,column.beforeMapping||{target:'@unmapped',matchSource:'unmatched',approved:false});column.warning='';delete column.beforeMapping;}
 }
 const contacts=new Set(contactFields(profile).map(f=>f.target));for(const column of profile.columns)if(contactPart(column.target)&&!contacts.has(column.target)){column.target='@unmapped';column.warning='Kontaktfältet saknar sin namnkolumn. Välj aktuell personkoppling.';}
 refreshTableProfile(workbook,profile,schemas,XLSX);
}
export function mappingTemplate(workbook,profiles,schemas,XLSX){
 const result=XLSX.utils.book_new(),fields=schemaFields(schemas);
 for(const [pi,profile]of profiles.entries()){
  const labels=profile.columns.map(column=>{if(column.target==='@ignore')return 'Importera inte';if(contactFields(profile).some(f=>f.target===column.target))return column.target;const field=fields.find(f=>f.target===column.target);if(!field)throw Error('Godkänn samtliga kolumnval före export av mallen.');const schema=schemas.find(s=>s.key===field.collection),type=column.itemType&&Object.entries(schema.itemTypes||{}).find(([,v])=>v===column.itemType)?.[0];return schema.sheet+'.'+field.caption+(type?' ['+type+']':'');});
  // A template contains headers and mapping only, never source business data.
  const sheet=XLSX.utils.aoa_to_sheet([profile.columns.map(c=>c.header),labels]);sheet['!cols']=profile.columns.map(()=>({wch:28}));
  let name=profile.name.slice(0,31);if(result.SheetNames.includes(name))name=name.slice(0,27)+' '+(pi+1);XLSX.utils.book_append_sheet(result,sheet,name);
 }
 return result;
}
