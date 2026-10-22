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
const fieldName=value=>matchName(String(value).replace(/[, ]+(?:kr|tkr|mkr|sek|m²|m2|kvm)(?:\/(?:år|mån))?$/i,''));
// Derived once per analysis, never cached across model changes or persisted.
function fieldResolver(schemas,fields=schemaFields(schemas)){
 const names=fields.map(field=>({field,names:new Set([field.field,field.caption,...field.aliases].map(fieldName))}));
 const tables=schemas.map(schema=>({schema,names:tableNames(schema)}));
 const types=new Map(Object.entries(schemas.find(s=>s.key==='agreementItems')?.itemTypes||{}).map(([label,type])=>[matchName(label),type]));
 const shortcuts=schemas.flatMap(s=>(s.shortcuts||[]).map(shortcut=>({...shortcut,owner:s.key})));
 const shortcutNames=shortcuts.map(shortcut=>({shortcut,names:new Set(shortcut.aliases.map(fieldName))}));
 // Item categories and field names come from the current model. A heading
 // such as “Värme basår” selects that item's field, not a shared agreement term.
 const itemFields=names.filter(row=>row.field.collection==='agreementItems'&&row.field.field!=='id'&&row.field.type!=='ref');
 const validItemTypes=new Set(types.values());
 const itemNames=[...types].map(([name,type])=>({name,type}));
 for(const {shortcut,names}of shortcutNames)if(shortcut.target==='agreementItems.baseAmount'&&validItemTypes.has(shortcut.itemType))for(const name of names)itemNames.push({name,type:shortcut.itemType});
 itemNames.sort((a,b)=>b.name.length-a.name.length);
 const itemField=(name)=>{
  for(const item of itemNames){
   const rest=name.startsWith(item.name)?name.slice(item.name.length):name.endsWith(item.name)?name.slice(0,-item.name.length):null;
   if(!rest)continue;
   const hits=itemFields.filter(row=>row.names.has(rest));
   if(hits.length===1)return {...hits[0].field,itemType:item.type};
  }
  return null;
 };
 const typedField=(field,typed)=>{const itemType=typed?types.get(matchName(typed[1])):null;return typed&&!itemType?null:{...field,...(itemType?{itemType}:{})};};
 return (value,primary)=>{
  const raw=String(value??'').trim();if(!raw)return null;
  if(['importerainte','ignorera','ignore'].includes(matchName(raw)))return {target:'@ignore'};
  const typed=raw.match(/\s*\[([^\]]+)\]\s*$/),text=typed?raw.slice(0,typed.index).trim():raw;
  const direct=fields.find(f=>f.target===text||f.storage===text);
  if(direct)return typedField(direct,typed);
  const split=text.indexOf('.'),table=split>=0?tables.find(t=>t.names.includes(matchName(text.slice(0,split))))?.schema:null;
  const name=fieldName(table?text.slice(split+1):text);
  const scoped=(!table&&['contracts','agreementItems'].includes(primary)||table?.key==='agreementItems')&&itemField(name);
  if(scoped&&!typed)return scoped;
  let hits=names.filter(f=>(!table||f.field.collection===table.key)&&f.names.has(name)).map(f=>f.field);
  if(!hits.length&&table)hits=fields.filter(f=>f.collection===table.key&&f.aliases.some(alias=>matchName(alias)===matchName(text)));
  const generic=['belopp','arsbelopp','kostnad','typ','namn','kategori'].includes(name);
  const chosen=hits.length===1?(!table&&generic&&hits[0].collection!==primary&&!relatedTables(schemas,primary).includes(hits[0].collection)?null:hits[0]):hits.find(f=>f.collection===primary)||hits.find(f=>f.field==='id');
  if(chosen)return typedField(chosen,typed);
  // Wide rent columns are input conveniences that still point at a real item field.
  if(!table&&['recurringCosts','costEvidence'].includes(primary))return null;
  const shortcut=shortcutNames.find(({shortcut:s,names})=>(!table||s.owner===table.key||s.target.startsWith(table.key+'.'))&&names.has(name))?.shortcut;
  return shortcut&&fields.some(f=>f.target===shortcut.target)?shortcut:null;
 };
}
export function resolveFieldName(value,schemas,primary){
 return fieldResolver(schemas)(value,primary);
}
export const issueNumberColumn=(profile,column)=>profile.primaryTable==='activities'&&['objektsnummer','objektnummer','objektnr','objektsnr'].includes(matchName(column.header));
// This is column evidence, not a fallback that changes the meaning of a chosen FK.
// Explicit and approved choices always win; mixed or colliding numbers need a choice.
export function suggestIssueNumberColumns(profiles,data){
 const key=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('sv').replace(/^0+(?=\d+$)/,'');
 const ids=rows=>new Set((rows||[]).map(row=>key(row.id)));
 const properties=ids(data?.properties),objects=ids(data?.objects);let changed=false;
 for(const profile of profiles)for(const column of profile.columns){
  if(!issueNumberColumn(profile,column)||column.approved||column.matchSource==='explicit'||column.target==='@ignore')continue;
  const samples=(column.samples||[]).filter(present).map(key);if(!samples.length)continue;
  const property=samples.every(value=>properties.has(value)&&!objects.has(value)),object=samples.every(value=>objects.has(value)&&!properties.has(value));
  const target=property?'activities.propertyId':object?'activities.objectId':'@unmapped';
  changed ||= column.target!==target;column.target=target;column.collection=target.split('.')[0];column.identity=true;
  column.matchSource=target==='@unmapped'?'unmatched':'alias';
  column.warning=property?'Numren matchar FastighetsID/förvaltningsnummer i registret.':object?'Numren matchar ObjektID i registret.':'Ange om numret avser FastighetsID/förvaltningsnummer eller ObjektID.';
 }
 return changed;
}
function inferTable(name,headers,samples,schemas,match){
 const scores=schemas.map(schema=>{
  const names=tableNames(schema),sheet=matchName(name);let score=names.some(n=>n.length>3&&sheet.includes(n))?30:0;
  for(const header of headers){const matches=match(header,schema.key);if(matches?.collection===schema.key||matches?.target?.startsWith(schema.key+'.'))score+=matches.field==='id'?8:schema.fieldSpecs?.[matches.field]?.type==='ref'?1:3;}
  // ID-shaped values strengthen a named ID column; data never acts as instructions.
  if(samples.some(row=>row.some(v=>typeof v==='number')))score+=headers.some(h=>schema.columns.some(([f,label])=>schema.fieldSpecs?.[f]?.type==='number'&&matchName(label)===matchName(h)))?1:0;
  return {key:schema.key,score};
 });
 // Several amount columns describe one agreement with multiple items. Count
 // that evidence for agreements too; a row-per-item list has its own ID/type.
 const categories=new Set(headers.map(header=>match(header,'contracts')).filter(field=>field?.target==='agreementItems.baseAmount'&&field.itemType).map(field=>field.itemType));
 const itemRows=headers.some(header=>['agreementItems.id','agreementItems.type'].includes(match(header,'agreementItems')?.target));
 const agreements=scores.find(row=>row.key==='contracts'),items=scores.find(row=>row.key==='agreementItems');
 if(agreements&&items&&categories.size>1&&!itemRows&&headers.some(header=>match(header,'contracts')?.target==='contracts.id'))agreements.score+=items.score;
 scores.sort((a,b)=>b.score-a.score);
 return scores[0]?.score?{key:scores[0].key,confidence:scores[0].score>(scores[1]?.score||0)?'suggested':'review'}:{key:schemas.find(s=>s.key==='properties')?.key||schemas[0]?.key,confidence:'review'};
}
// Context refines suggestions only. Explicit rows, saved rules and manual choices
// remain authoritative, and every destination must exist in the current catalog.
export function suggestTableColumns(profile,schemas){
 const fields=schemaFields(schemas),valid=new Set(fields.map(f=>f.target)),near=new Set([profile.primaryTable,...relatedTables(schemas,profile.primaryTable)]);
 const match=fieldResolver(schemas),costSheet=['recurringCosts','costEvidence'].includes(profile.primaryTable);
 const agreementContext=!costSheet&&(['contracts','agreementItems'].includes(profile.primaryTable)||profile.columns.some(c=>['contracts.id','agreementItems.contractId'].includes(c.target)));
 const perRow=profile.primaryTable==='agreementItems'&&profile.columns.some(c=>c.target==='agreementItems.type');
 const automatic=column=>!column.approved&&column.matchSource!=='explicit';
 const choose=(column,target,itemType,warning='')=>{if(!valid.has(target))return;column.target=target;column.itemType=itemType;column.matchSource='alias';column.warning=warning;};
 const review=(column,warning)=>{column.target='@unmapped';delete column.itemType;column.matchSource='unmatched';column.warning=warning;};
 const values=column=>(column.samples||[]).filter(present);
 const roleColumns=()=>profile.columns.filter(c=>personRole(c.target));
 for(const column of profile.columns.filter(automatic)){
  const header=matchName(column.header),collection=column.target.split('.')[0];
  const financial=agreementContext&&match(column.header,'contracts');
  if(financial?.target?.startsWith('agreementItems.'))choose(column,financial.target,perRow?undefined:financial.itemType);
  if(['activities','orders'].includes(profile.primaryTable)&&(!near.has(collection)||collection==='orders'&&profile.primaryTable==='activities'||collection==='activities'&&profile.primaryTable==='orders')&&!column.target.startsWith('@')&&!column.header.includes('.'))review(column,'Detta fält hör till en annan tabell. Välj en uttrycklig koppling om uppgiften ska läsas in.');
  if(profile.primaryTable==='activities'&&column.target==='objects.id')choose(column,'activities.objectId');
  if(profile.primaryTable==='activities'&&column.target==='properties.id')choose(column,'activities.propertyId');
  if(header==='benamning'&&['properties','contracts'].includes(profile.primaryTable)&&profile.columns.some(c=>c.target==='properties.designation'))choose(column,'properties.popularName');
  if(column.target==='properties.ownerPartyId'&&profile.columns.filter(c=>matchName(c.header)===header).length>1&&values(column).length&&values(column).every(v=>/^\+?[\d ()-]{7,}$/.test(String(v))))review(column,'Denna kolumn verkar innehålla telefonnummer trots rubriken Fastighetsägare. Välj rätt kontaktfält eller Importera inte.');
  if(['orgnnr','orgnr','orgnummer','organisationsnummer'].includes(header)&&profile.primaryTable!=='organizations'){
   const owners=profile.columns.some(c=>c.target==='properties.ownerPartyId'),tenants=profile.columns.some(c=>c.target==='contracts.tenantPartyId');
   if(owners!==tenants)choose(column,owners?'properties.ownerOrganizationNumber':'contracts.tenantOrganizationNumber');
   else review(column,'Välj om organisationsnumret tillhör fastighetsägaren eller hyresgästen.');
  }
  if(['emailforvaltare','epostforvaltare','forvaltarenr','telefonforvaltare'].includes(header)){
   const owners=roleColumns().filter(c=>personRole(c.target).role==='owner');
   if(owners.length===1){column.target='contact.'+owners[0].index+'.'+(/email|epost/.test(header)?'email':'phone');column.matchSource='alias';column.warning='';}
   else review(column,'Välj först namnkolumnen för fastighetsägarens kontaktperson.');
  }
  if(header==='ursprungligtgiltigttom'||header==='ursprungligaavtalstid')review(column,'Ursprunglig avtalstid är inte samma uppgift som aktuell hyrestid. Välj ett befintligt fält eller Importera inte.');
  if(/^hyra\d{4}$/.test(header)){
   review(column,'Årsbeloppet kan redan vara uppräknat. Använd Grundhyra för bashyran; välj Källans rapporterade årsbelopp endast efter kontroll av år och indexvillkor.');
  }
  if(header==='indexprocent'&&agreementContext&&profile.columns.some(c=>c.target==='agreementItems.baseAmount'&&c.itemType==='base'))choose(column,'agreementItems.indexPercent','base','Kontrollera att procenten avser indexandel för bashyran.');
  if(column.target==='agreementItems.baseAmount'&&column.format?.checked&&column.format.invalid===column.format.checked)review(column,'Kolumnen innehåller inte belopp. Text om vad som ingår får inte bli ett hyrestillägg.');
  const spec=schemas.find(s=>s.key===column.target.split('.')[0])?.fieldSpecs?.[column.target.split('.')[1]];
  if(spec?.type==='select'&&values(column).length&&values(column).every(v=>typeof v==='number'))review(column,'Numeriska koder behöver förklaras. Använd fältets benämningar: '+Object.values(spec.values||{}).join(', ')+'.');
  if(column.target==='@unmapped'&&!column.filled){column.target='@ignore';column.warning='Tom kolumn. Du kan välja ett fält om den ska användas.';}
  else if(column.target==='@unmapped'&&!column.warning)column.warning='Inget entydigt fält i den aktuella datamodellen. Välj ett fält med samma betydelse eller Importera inte.';
 }
 // A wide sheet may contain multiple item categories. Unqualified item
 // conditions must not leak into every item through the shared row payload.
 const itemTypes=[...new Set(profile.columns.filter(c=>c.target.startsWith('agreementItems.')&&c.itemType).map(c=>c.itemType))];
 for(const column of profile.columns.filter(automatic))if(column.target.startsWith('agreementItems.')&&!column.itemType&&!['id','contractId','type'].includes(column.target.split('.')[1])&&!perRow&&itemTypes.length){
  const type=itemTypes.length===1?itemTypes[0]:itemTypes.includes('base')?'base':null;
  if(type)choose(column,column.target,type,itemTypes.length>1?'Villkoret föreslås för Bashyra. Kontrollera posttypen.':'');
  else review(column,'Flera avtalsposter finns. Ange vilken post villkoret gäller, exempelvis Värme basår.');
 }
 const groups=new Map();for(const column of profile.columns){if(column.target.startsWith('@')||personRole(column.target))continue;const key=column.target+(column.itemType?'['+column.itemType+']':'');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(column);}
 for(const columns of groups.values())if(columns.length>1)for(const column of columns.filter(automatic))review(column,'Flera kolumner föreslås till samma fält. Välj vilken som gäller; beloppen eller uppgifterna slås inte ihop automatiskt.');
 for(const column of profile.columns)column.collection=column.target.split('.')[0];
}
export function importIdentityWarnings(profile,schemas){
 const schema=schemas.find(s=>s.key===profile.primaryTable),selected=new Set(profile.columns.map(c=>c.target)),warnings=[];
 if(!schema)return warnings;
 const caption=field=>schema.columns.find(([key])=>key===field)?.[1]||field;
 if(['contracts','activities','orders'].includes(schema.key)&&!(schema.canonical&&schema.key==='activities')&&!selected.has(schema.key+'.id'))warnings.push('Koppla '+caption('id')+' för säker återimport. Lägg till en beständig identifierare i Excel om kolumnen saknas.');
 if(schema.key==='activities'&&schema.canonical&&!selected.has('activities.id'))warnings.push('ÄrendeID skapas automatiskt. Återimport matchar tidigare ärenderader; osäkra träffar granskas. Saknad fastighets-/objektkoppling visas som Att koppla.');
 if(schema.key==='orders'&&!selected.has('orders.activityId')&&!selected.has('activities.id'))warnings.push('Beställningarna behöver '+caption('activityId')+' för koppling till rätt ärende.');
 return warnings;
}
function formatTableColumn(column,schemas,cells,XLSX){
 const spec=schemas.find(s=>s.key===column.target.split('.')[0])?.fieldSpecs?.[column.target.split('.')[1]];
 column.format=profileFormat(cells,{...column,valueType:spec?.type},XLSX);
 column.identity=column.target.endsWith('.id')||spec?.type==='ref';column.valueType=spec?.type;
}
// Saved exclusions remain choices. Offer a fresh, typed suggestion separately
// when the current model recognizes a previously skipped financial column.
export function skippedFinancialSuggestions(workbook,profile,schemas,XLSX){
 if(!schemas.some(s=>s.key==='agreementItems')||['recurringCosts','costEvidence'].includes(profile.primaryTable)||profile.mappingRow)return [];
 const match=fieldResolver(schemas),draft=structuredClone(profile),candidates=new Set();
 const sheet=workbook.Sheets[profile.sheetKey||profile.name],last=XLSX.utils.decode_range(sheet?.['!ref']||'A1').e.r;
 for(const column of draft.columns){
  if(column.matchSource!=='saved'||!['@ignore','@unmapped'].includes(column.target)||!column.filled)continue;
  const field=match(column.header,'contracts');if(!field?.target?.startsWith('agreementItems.'))continue;
  Object.assign(column,{target:field.target,itemType:field.itemType,approved:false,matchSource:'alias',warning:''});candidates.add(column.index);
  const cells=[];for(let r=profile.dataStartRow??profile.headerRow;r<=last&&cells.length<100;r++){const cell=sheet[XLSX.utils.encode_cell({r,c:(profile.startColumn||0)+column.index})];if(present(cell?.v))cells.push(cell);}
  formatTableColumn(column,schemas,cells,XLSX);
 }
 if(!candidates.size)return [];
 suggestTableColumns(draft,schemas);
 return draft.columns.filter(column=>candidates.has(column.index)&&column.target.startsWith('agreementItems.'));
}
function refreshSuggestions(workbook,profile,schemas,XLSX){
 if(profile.primaryTable==='agreementItems'&&profile.columns.some(c=>c.target==='agreementItems.type'))for(const column of profile.columns)if(!column.approved&&column.matchSource!=='explicit')delete column.itemType;
 const samples=refreshTableProfile(workbook,profile,schemas,XLSX);
 suggestTableColumns(profile,schemas);
 for(const [column,{cells,target,itemType}] of samples)if(column.target!==target||column.itemType!==itemType)formatTableColumn(column,schemas,cells,XLSX);
}
export function setPrimaryTable(workbook,profile,primary,schemas,XLSX){
 if(!schemas.some(schema=>schema.key===primary))throw Error('Välj en befintlig huvudtabell.');
 const match=fieldResolver(schemas);profile.primaryTable=primary;profile.tableConfidence='selected';
 for(const column of profile.columns)if(!column.approved&&column.matchSource!=='explicit'){
  const field=match(column.header,primary);column.target=field?.target||'@unmapped';column.itemType=field?.itemType;column.matchSource=field?'alias':'unmatched';column.warning='';
 }
 refreshSuggestions(workbook,profile,schemas,XLSX);
}
export function profileTables(workbook,schemas,XLSX,saved=[],options={}){
 const fields=schemaFields(schemas),valid=new Set(fields.map(f=>f.target)),match=fieldResolver(schemas,fields);
 return workbook.SheetNames.map(sheetKey=>{
  const source=workbook.__importSources?.find(s=>s.sheetKey===sheetKey),name=source?.sheetName||sheetKey,sheet=workbook.Sheets[sheetKey],range=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']):{s:{r:0,c:0},e:{r:0,c:0}};
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true}),start=range.s.r;
  let headerIndex=0,best=-1;
  matrix.slice(0,50).forEach((row,i)=>{
   // Qualified field names in a mapping row must never win header detection.
   const recognized=row.filter(present).filter(v=>match(v)),qualified=recognized.filter(v=>String(v).includes('.')).length,known=recognized.length;
   const score=known*8+row.filter(v=>typeof v==='string').length-row.filter(v=>typeof v==='number').length-qualified*12;
   if(score>best&&(known>=2||i===0||row.filter(present).length===1&&known===1)){best=score;headerIndex=i;}
  });
  const headers=matrix[headerIndex]||[],signature=JSON.stringify(headers.filter(present).map(matchName).sort()),layoutSignature=JSON.stringify(headers.map(matchName));
  const candidates=saved.filter(s=>s.signature===signature),exact=candidates.find(s=>s.sheet===name&&(!source?.fileName||s.fileName===source.fileName));
  const previous=exact||(candidates.length&&candidates.every(s=>JSON.stringify(s.columns.map(c=>[matchName(c.header),c.target,c.itemType]))===JSON.stringify(candidates[0].columns.map(c=>[matchName(c.header),c.target,c.itemType])))?candidates[0]:null);
  const inference=inferTable(name,headers,matrix.slice(headerIndex+1,headerIndex+9),schemas,match),primary=valid.size&&schemas.some(s=>s.key===previous?.primaryTable)?previous.primaryTable:inference.key;
  const profile={name,sheetKey,fileName:source?.fileName,fingerprint:source?.fingerprint,signature,layoutSignature,headerIndex,headerRow:start+headerIndex+1,startColumn:range.s.c,primaryTable:primary,inferred:primary,tableConfidence:inference.confidence,canonical:true};
  const possible=matrix[headerIndex+1]||[],nonempty=possible.filter(present),qualified=nonempty.filter(v=>/^[^.]+\..+/.test(String(v))&&match(v,primary));
  profile.mappingRowSuggested=qualified.length>=2&&qualified.length/nonempty.length>=0.6;
  profile.mappingRow=false;
  profile.columns=headers.map((header,index)=>{
   if(!present(header))return null;
   const duplicate=headers.filter(h=>matchName(h)===matchName(header)).length>1,matches=(previous?.columns||[]).filter(c=>matchName(c.header)===matchName(header));
   const savedRule=duplicate?(previous?.layoutSignature===layoutSignature?matches.find(c=>c.index===index):null):matches.length===1?matches[0]:null;
   // Correct obsolete object suggestions for captions the current model declares
   // to be property identifiers. Explicit rows and saved exclusions still win.
   const rule=savedRule&&['objects.id','contracts.objectId','activities.objectId'].includes(savedRule.target)&&match(header,'properties')?.target==='properties.id'?null:savedRule;
   const suggestion=match(header,primary);let target=rule?(valid.has(rule.target)||rule.target==='@ignore'||rule.target.startsWith('contact.')?rule.target:'@unmapped'):suggestion?.target||'@unmapped';
   if(rule?.contactHeader&&contactPart(target)){const contacts=headers.map((h,i)=>({h,i})).filter(c=>matchName(c.h)===matchName(rule.contactHeader));target=contacts.length===1?'contact.'+contacts[0].i+'.'+contactPart(target).field:'@unmapped';}
   return {header:String(header),index,target,collection:target.split('.')[0],itemType:rule?rule.itemType:suggestion?.itemType,transform:rule?.transform||(/månadshyra/i.test(header)?'monthly':'auto'),date1904:Boolean(workbook.Workbook?.WBProps?.date1904||source?.date1904),dateMode:rule?.dateMode||'auto',invalidPolicy:rule?.invalidPolicy||'reject-row',emptyMarkers:true,approved:Boolean(rule),personFormat:rule?.personFormat,shared:rule?.shared===true,matchSource:rule?'saved':suggestion?'alias':'unmatched',warning:rule&&target==='@unmapped'?'Det tidigare fältet finns inte längre. Välj ett aktuellt fält.':''};
  }).filter(Boolean);
  refreshSuggestions(workbook,profile,schemas,XLSX);if(options.referenceData)suggestIssueNumberColumns([profile],options.referenceData);return profile;
 });
}
// Sheet names are hints too. Inspect only a bounded sample of an unknown
// sheet, using the same model and matcher as the full reviewed import.
export function financialSheetHint(sheet,name,contentRef,schemas,XLSX){
 if(!contentRef)return null;
 const range=XLSX.utils.decode_range(contentRef),end={r:Math.min(range.e.r,range.s.r+49),c:Math.min(range.e.c,range.s.c+255)},sample={};
 for(let r=range.s.r;r<=end.r;r++)for(let c=range.s.c;c<=end.c;c++){const address=XLSX.utils.encode_cell({r,c});if(sheet[address])sample[address]=sheet[address];}
 sample['!ref']=XLSX.utils.encode_range({s:range.s,e:end});
 const profile=profileTables({SheetNames:[name],Sheets:{[name]:sample}},schemas,XLSX)[0];
 const amounts=profile.columns.filter(column=>column.target==='agreementItems.baseAmount');
 if(!amounts.length||!profile.columns.some(column=>['contracts.id','agreementItems.contractId'].includes(column.target)))return null;
 return {kind:'Avtal & avtalsposter',recommended:true,financialColumns:amounts.map(column=>column.header)};
}
export function refreshTableProfile(workbook,profile,schemas,XLSX){
 const sheet=workbook.Sheets[profile.sheetKey||profile.name],range=XLSX.utils.decode_range(sheet['!ref']||'A1');
 const first=profile.headerRow+(profile.mappingRow?1:0);profile.dataStartRow=first;
 let rows=0;for(let r=first;r<=range.e.r;r++)if(profile.columns.some(c=>present(sheet[XLSX.utils.encode_cell({r,c:profile.startColumn+c.index})]?.v)))rows++;profile.rowCount=rows;
 const samples=new Map();
 for(const column of profile.columns){
  const cells=[];
  // Match only a representative sample; every imported value is validated later.
  for(let r=first;r<=range.e.r&&cells.length<100;r++){const cell=sheet[XLSX.utils.encode_cell({r,c:profile.startColumn+column.index})];if(present(cell?.v))cells.push(cell);}
  samples.set(column,{cells,target:column.target,itemType:column.itemType});formatTableColumn(column,schemas,cells,XLSX);column.samples=[];
  for(let r=first;r<Math.min(first+3,range.e.r+1);r++)column.samples.push(sheet[XLSX.utils.encode_cell({r,c:profile.startColumn+column.index})]?.v??'');
  column.filled=cells.length;column.sampled=profile.rowCount>100;
 }
 return samples;
}
export function setMappingRow(workbook,profile,enabled,schemas,XLSX){
 profile.mappingRow=enabled;const match=fieldResolver(schemas);
 for(const column of profile.columns){
  if(enabled){const mappingValue=workbook.Sheets[profile.sheetKey||profile.name][XLSX.utils.encode_cell({r:profile.headerRow,c:profile.startColumn+column.index})]?.v;column.beforeMapping={target:column.target,itemType:column.itemType,approved:column.approved,matchSource:column.matchSource};const field=match(mappingValue,profile.primaryTable)||(contactPart(String(mappingValue))?{target:String(mappingValue)}:null);column.target=field?.target||'@unmapped';column.itemType=field?.itemType;column.matchSource='explicit';column.approved=Boolean(field);column.warning=!field?'Okänt Lokalblick-fält: '+String(mappingValue||'(tomt)')+'. Välj fält eller Importera inte.':'';}
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
