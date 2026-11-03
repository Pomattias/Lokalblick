// First stage of the guided import. Pure planning: no database writes.
// A workbook may contain many sheets, but only unambiguous property data is saved.
const trim=v=>String(v??'').trim();
const identity=v=>trim(v).toLocaleLowerCase('sv').replace(/\s+/g,' ');
const heading=v=>identity(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const same=(a,b)=>identity(a)===identity(b);
const has=v=>trim(v)!=='';
const fieldNames={
 number:['forvaltningsobjekt','forvaltningsobjektnummer','forvaltningsnr','forvaltningsnummer','fastighetsnummer','fastighetsnr','fastighetsid','fastnr'],
 name:['fastighetsnamn','fastighetsbeteckning','fastighet'],
 address:['adress','gatuadress','fastighetsadress'],
 city:['ort','stad','kommun'],
 popular_name:['popularnamn','populartnamn','populärnamn']
};
const isMaster=name=>heading(name)==='lokallista';
const cleanName=v=>/^#(name|ref|value|n\/a|saknas)[!?]?$/i.test(trim(v))?'':trim(v);
function sourceColumns(name,headers){
 const names=headers.map(heading);
 const column=aliases=>names.findIndex(h=>aliases.includes(h));
 let number=column(fieldNames.number);
 const sheet=heading(name);
 if(number<0&&sheet==='fastighetslista')number=column(['objektnr','objektnummer']);
 if(number<0&&sheet==='lokalbestand')number=column(['objektsnummerforvaltningsobjekt','objektnummerforvaltningsobjekt']);
 if(number<0&&isMaster(name)&&['name','ref','value',''].includes(names[0]))number=0;
 return {number,name:column(fieldNames.name),address:column(fieldNames.address),
  city:column(fieldNames.city),popular_name:column(fieldNames.popular_name),
  agreement:column(['avtalsnummer','avtalsnr','kontraktsnummer','kontraktsnr','avtal'])};
}
const rowValue=(row,index)=>index<0?'':cleanName(row[index]);
function issue(sheet,row,field,message,value=''){
 return {sheet,row,field,value:trim(value),message};
}
function agreementCellHasMany(v){
 // Do not split a legitimate identifier containing "/" or "-".
 return /[;,\r\n]/.test(trim(v))&&trim(v).split(/[;,\r\n]/).filter(has).length>1;
}
const addressKey=(address,city)=>has(address)&&has(city)?identity(address)+'|'+identity(city):'';
const addressMatches=(a,b)=>Boolean(addressKey(a.address,a.city))&&addressKey(a.address,a.city)===addressKey(b.address,b.city);
const maxText=(v,max=200)=>trim(v).length<=max;
export function preparePropertyStage(sheets,snapshot,{makeId=()=>crypto.randomUUID()}={}){
 const problems=[],entries=[],commands=[],groups=new Map(),loose=[];
 const existing=snapshot.properties||[],active=sheets||[];
 const hasMaster=active.some(s=>isMaster(s.name));
 let readRows=0;
 for(const sheet of active){
  const rows=sheet.rows||[],columns=sourceColumns(sheet.name,rows[0]||[]);
  if([columns.number,columns.name,columns.address].every(i=>i<0))continue;
  for(let i=1;i<rows.length;i++){
   const row=rows[i];
   if(!Array.isArray(row)||!row.some(has))continue;
   const sourceRow=i+1,agreement=rowValue(row,columns.agreement);
   if(agreementCellHasMany(agreement))problems.push(issue(sheet.name,sourceRow,'Avtalsnummer',
    'Raden innehåller flera avtalsnummer i samma cell. Dela upp dem i flera rader i Excel-filen så kan vi importera dem.',agreement));
   const fields={number:rowValue(row,columns.number),name:rowValue(row,columns.name),
    address:rowValue(row,columns.address),city:rowValue(row,columns.city),
    popular_name:rowValue(row,columns.popular_name)};
   if(!Object.values(fields).some(has))continue;
   readRows++;
   const source={sheet:sheet.name,row:sourceRow,fields,master:isMaster(sheet.name)};
   if(!has(fields.number)){loose.push(source);continue;}
   if(/[;,\r\n]/.test(fields.number)){
    problems.push(issue(sheet.name,sourceRow,'FörvaltningsNr','Flera fastighetsnummer i samma cell. Dela upp raden i källfilen.',fields.number));continue;
   }
   const key=identity(fields.number);
   if(!groups.has(key))groups.set(key,{number:fields.number,sources:[]});
   groups.get(key).sources.push(source);
  }
 }
 // Enrichment without a management number is accepted only for one exact
 // address + city. Never create a property or guess an identity from a name.
 for(const source of loose){
  const {fields,sheet,row}=source;
  if(!addressKey(fields.address,fields.city)){
   problems.push(issue(sheet,row,'FörvaltningsNr','Fastighetsnummer saknas och adress + ort räcker inte för säker matchning.'));continue;
  }
  const candidates=[...groups.values()].filter(g=>g.sources.some(s=>addressMatches(s.fields,fields)));
  const matchingExisting=existing.filter(p=>addressMatches(p,fields));
  const ids=new Set([...candidates.map(g=>identity(g.number)),...matchingExisting.map(p=>identity(p.management_object_number||'id:'+p.id))]);
  if(ids.size!==1){
   problems.push(issue(sheet,row,'Adress',ids.size===0?
    'Ingen säker fastighet matchar adress och ort. Uppgiften har inte importerats.':
    'Adressen matchar flera fastigheter. Kontrollera kopplingen i Excel.',fields.address));continue;
  }
  if(candidates.length===1){candidates[0].sources.push(source);continue;}
  // An existing unnumbered property may be enriched, but it is never
  // automatically assigned an unrelated new management number.
  const found=matchingExisting[0],key='existing:'+found.id;
  if(!groups.has(key))groups.set(key,{number:found.management_object_number||'',existingId:found.id,sources:[]});
  groups.get(key).sources.push(source);
 }
 for(const group of groups.values()){
  const refs=group.sources.map(s=>({sheet:s.sheet,row:s.row}));
  const problem=(field,message,value='')=>problems.push(issue(refs[0]?.sheet||'',refs[0]?.row||0,field,message,value));
  // A property that appears only in an enrichment sheet is not added when
  // Lokallista has been selected as the master.
  const sourceInMaster=group.sources.some(s=>s.master);
  const values={number:group.number};
  for(const field of ['name','address','city','popular_name']){
   const masterValues=group.sources.filter(s=>s.master).map(s=>s.fields[field]).filter(has);
   const allValues=group.sources.map(s=>s.fields[field]).filter(has);
   const distinct=[...new Map(allValues.map(x=>[identity(x),x])).values()];
   const distinctMaster=[...new Map(masterValues.map(x=>[identity(x),x])).values()];
   const description=({name:'fastighetsnamn',address:'adresser',city:'orter',popular_name:'populärnamn'})[field];
   if(distinctMaster.length>1){
    problem(field,'Motstridiga '+description+' i Lokallista. Uppgiften lämnas utanför importen.',distinctMaster.join(' / '));
    values[field]='';
   }else if(distinctMaster.length===1){
    values[field]=distinctMaster[0];
    if(distinct.some(v=>!same(v,values[field])))problem(field,
     'Uppgiften skiljer sig mellan Lokallista och berikningsflikarna. Lokallistas värde behålls.',distinct.join(' / '));
   }else if(distinct.length>1){
    problem(field,'Motstridiga '+description+' i de valda flikarna. Uppgiften lämnas utanför importen.',distinct.join(' / '));
    values[field]='';
   }else values[field]=distinct[0]||'';
  }
  const matches=group.existingId?existing.filter(p=>p.id===group.existingId):
   existing.filter(p=>has(group.number)&&same(p.management_object_number,group.number));
  if(matches.length>1){
   problem('FörvaltningsNr','Fastighetsnumret finns på flera befintliga fastigheter. Ingen ändring görs.',group.number);
   entries.push({...values,refs,status:'review',changes:[]});continue;
  }
  let found=matches[0]||null;
  const byAddress=existing.filter(p=>addressMatches(p,values));
  if(!found&&byAddress.length===1){
   if(has(byAddress[0].management_object_number)&&!same(byAddress[0].management_object_number,group.number)){
    problem('FörvaltningsNr','Samma adress finns med ett annat fastighetsnummer. Kontrollera innan import.',group.number);
    entries.push({...values,refs,status:'review',changes:[]});continue;
   }
   found=byAddress[0];
  }
  if(!found&&byAddress.length>1){
   problem('Adress','Adressen förekommer på flera fastigheter och kan inte identifiera en unik post.');
   entries.push({...values,refs,status:'review',changes:[]});continue;
  }
  if(!found){
   if(hasMaster&&!sourceInMaster){
    problem('FörvaltningsNr','Fastigheten saknas i Lokallista och skapas därför inte från en kompletteringsflik.',group.number);
    entries.push({...values,refs,status:'review',changes:[]});continue;
   }
   if(!has(values.number)){
    problem('FörvaltningsNr','Nytt fastighetsnummer saknas. Ingen ny fastighet skapas.');
    entries.push({...values,refs,status:'review',changes:[]});continue;
   }
   const name=values.name||values.address;
   if(!has(name)||!maxText(name)||!maxText(values.number)||!maxText(values.address)||!maxText(values.city)){
    problem('Namn','Fastigheten saknar ett användbart namn eller adress, alternativt är ett fält för långt.');
    entries.push({...values,refs,status:'review',changes:[]});continue;
   }
   if(!values.name)problem('Namn','Fastighetsnamn saknas. Adressen används som tillfälligt namn.',name);
   const fields={name,management_object_number:values.number,
    ...(values.address?{address:values.address}:{}),...(values.city?{city:values.city}:{}),
    ...(values.popular_name?{popular_name:values.popular_name}:{})};
   if(!Object.values(fields).every(v=>maxText(v))){
    problem('Fält','Ett fastighetsfält är för långt och behöver kortas.');
    entries.push({...values,refs,status:'review',changes:[]});continue;
   }
   commands.push({action:'createProperty',id:makeId(),fields,sourceRow:refs[0].row});
   entries.push({...values,name,refs,status:'new',changes:Object.keys(fields)});continue;
  }
  const changes={};
  if(!has(found.management_object_number)&&has(values.number))changes.management_object_number=values.number;
  // Only fill empty fields. Conflicting existing information stays untouched.
  for(const [field,label] of [['name','Namn'],['address','Adress'],['city','Ort'],['popular_name','Populärnamn']]){
   const v=values[field];if(!v)continue;
   if(!has(found[field]))changes[field]=v;
   else if(!same(v,found[field]))problem(label,label+' skiljer sig från befintlig fastighet. Befintligt värde behålls.',v);
  }
  if(Object.values(changes).some(v=>!maxText(v))){
   problem('Fält','Ett kompletterande fält är för långt. Fastigheten lämnas oförändrad.');
   entries.push({...values,id:found.id,refs,status:'review',changes:[]});continue;
  }
  if(Object.keys(changes).length)commands.push({action:'updateProperty',id:found.id,fields:changes,sourceRow:refs[0].row});
  entries.push({...values,name:values.name||found.name,address:values.address||found.address||'',
   city:values.city||found.city||'',id:found.id,refs,status:Object.keys(changes).length?'update':'existing',
   changes:Object.keys(changes)});
 }
 return {entries,issues:problems,commands,stats:{
  found:entries.length,new:entries.filter(x=>x.status==='new').length,
  enriched:entries.filter(x=>x.status==='update').length,
  existing:entries.filter(x=>x.status==='existing').length,
  review:entries.filter(x=>x.status==='review').length,
  issues:problems.length,rows:readRows
 }};
}
