// Automatic, explainable import planning. No persistence or mutation occurs here.
// Every generated foreign key points to its canonical v3 entity, never a label.
import {agreementNumberParts} from '../lokaler/business-identities.js';
import {nextObjectNumber} from './numbering.js';
const txt=x=>String(x??'').trim();
const norm=x=>txt(x).toLocaleLowerCase('sv').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const eq=(a,b)=>norm(a)===norm(b);
const value=(row,cols,target)=>{const i=cols.findIndex(x=>x===target);return i>=0?txt(row[i]):''};
const exists=x=>txt(x)!=='';
const cleanDate=x=>{
 const s=txt(x);if(!s)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
 if(m)return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
 return s;
};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
function money(v){
 const raw=txt(v).replace(/[\s\u00a0]/g,'').replace(/kr|sek/gi,'');
 if(!raw)return null;
 const s=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):/^\d{1,3}(?:\.\d{3})+$/.test(raw)?raw.replace(/\./g,''):raw;
 const n=Number(s);
 return Number.isFinite(n)&&n>=0?n:null;
}
const fixed={
 property_number:['fastighetsnummer','fastighetsnr','fastighetsid','fastnr','fastid','forvaltningsobjekt','forvaltningsobjektnummer'],
 property_name:['fastighetsnamn','fastighetsbeteckning','fastighet'],
 property_address:['fastighetsadress','gatuadress','adress'],
 property_city:['ort','stad','kommun'],
 object_number:['objektsnummer','objektnummer','objektnr','objektid','lokalnummer','lokalnr'],
 area:['yta','area','kvm','ytakvm','lokalyta'],
 agreement_number:['avtalsnummer','avtalsnr','avtalsid','kontraktsnummer','kontraktsnr','avtal','kontrakt'],
 valid_from:['avtalsstart','avtalfran','avtalfrom','hyrestidfran','hyresstart','fran','from','fromdatum','startdatum','giltigfran','fr o m'],
 legal_end_on:['avtalsslut','avtaltill','hyrestidtill','hyresslut','slutdatum','tom','tillochmed'],
 tenant_name:['hyresgast','hyresgastnamn','hyresgastforetag','verksamhet','hyresgastorganisation'],
 tenant_org:['hyresgastorgnr','hyresgastorganisationsnummer','hyresgastorgnummer','hyresgastorg'],
 owner_name:['fastighetsagare','fastighetsagarnamn','agare','fastighetsagarbolag'],
 owner_org:['fastighetsagareorgnr','fastighetsagareorganisationsnummer','agarorgnr','agarorganisationsnummer'],
 manager_name:['forvaltare','forvaltarnamn','fastighetsforvaltare','ansvarigforvaltare'],
 manager_email:['forvaltareepost','forvaltareemail','forvaltarmail'],
 manager_party:['forvaltarbolag','forvaltarorganisation','forvaltarforetag'],
 usage:['anvandning','verksamhetstyp','andamal']
};
export const priceTypes=[
 {id:'base',label:'Bashyra',type:'base'},
 {id:'addition',label:'Tillägg',type:'addition'},
 {id:'addition2',label:'Tillägg 2',type:'addition'},
 {id:'water',label:'VA',type:'water'},
 {id:'heat',label:'Värme',type:'heat'},
 {id:'electricity',label:'El',type:'electricity'},
 {id:'cooling',label:'Kyla',type:'cooling'},
 {id:'waste',label:'Avfall',type:'waste'},
 {id:'tax',label:'Fastighetsskatt',type:'tax'}
];
const priceWords={
 base:['bashyra','grundhyra','hyresgrundbelopp'],
 addition:['tillagg','tillaggshyra','ovrigttillagg','hyrestillagg'],
 addition2:['tillagg2','tillaggnr2','tillaggshyra2'],
 water:['va','vatten','vattenavlopp','vavatten'],
 heat:['varme','varmetillagg','uppvarmning'],
 electricity:['el','eltillagg','elektricitet'],
 cooling:['kyla','kyltillagg'],
 waste:['avfall','sopor','renhallning'],
 tax:['fastighetsskatt','skattetillagg']
};
const detailWords={year:['basar','basaret','grundar'],method:['upprakning','indexmetod','metod'],
 index:['bastal','basindex','kpibastal','kpiindex','kpiindextal'],share:['indexandel','kpiandel'],
 min:['minprocent','minhojning','garanteradmin'],max:['maxprocent','maxhojning','hogstahojning']};
function priceHeader(header){
 const n=norm(header);
 for(const [id,words] of Object.entries(priceWords)){
  for(const word of words){
   if(n===word||n===word+'kr'||n===word+'krar'||n===word+'krperar'||n===word+'krm2'||n===word+'perar'||n===word+'belopp'||n===word+'arsbelopp'||n===word+'grundbelopp')return 'price.'+id+'.amount';
   if(n.startsWith(word)){
    const tail=n.slice(word.length);
    for(const [part,labels]of Object.entries(detailWords))if(labels.includes(tail))return 'price.'+id+'.'+part;
   }
  }
 }
 if(n==='bashyrabasar')return 'price.base.year';
 return '';
}
export const importFieldOptions=[
 ...Object.entries(fixed).map(([id,aliases])=>({id,label:({
  property_number:'Fastighet · nummer',property_name:'Fastighet · namn',property_address:'Fastighet · adress',
  property_city:'Fastighet · ort',object_number:'Objekt · nummer',area:'Objekt · area',
  agreement_number:'Avtal · nummer',valid_from:'Avtal · fr.o.m.',legal_end_on:'Avtal · t.o.m.',
  tenant_name:'Part · hyresgäst',tenant_org:'Hyresgäst · organisationsnummer',
  owner_name:'Part · fastighetsägare',owner_org:'Fastighetsägare · organisationsnummer',
  manager_name:'Förvaltare · person',manager_email:'Förvaltare · e-post',manager_party:'Förvaltare · organisation',
  usage:'Avtal · användning'})[id]||id})),
 ...priceTypes.flatMap(p=>['amount','year','method','index','share','min','max'].map(field=>({
  id:'price.'+p.id+'.'+field,label:p.label+' · '+({amount:'årskostnad/årshyra',year:'basår',
   method:'uppräkning',index:'KPI-bastal',share:'indexandel',min:'min %',max:'max %'})[field]
 })))
];
const fieldSet=new Set(importFieldOptions.map(x=>x.id));
export function inferImportColumn(header){
 const n=norm(header);
 if(!n)return '';
 for(const [id,aliases]of Object.entries(fixed))if(aliases.some(alias=>norm(alias)===n))return id;
 return priceHeader(header);
}
export function suggestImportMapping(headers,overrides={}){
 return headers.map((header,i)=>Object.hasOwn(overrides,i)?(fieldSet.has(overrides[i])?overrides[i]:''):inferImportColumn(header));
}
export function rankImportSheets(sheets){
 return sheets.map(s=>({...s,score:(s.rows?.[0]||[]).reduce((n,h)=>n+(inferImportColumn(h)?1:0),0)}))
  .sort((a,b)=>b.score-a.score);
}
export function prepareSmartImport({headers=[],rows=[]},snapshot,{mapping=null,objectChoices={},ignoredColumns=[],makeId=()=>crypto.randomUUID()}={}){
 const cols=mapping||suggestImportMapping(headers);
 const used=cols.filter(Boolean),warnings=[],errors=[],commands=[],records=[];
 const properties=[...(snapshot.properties||[])],objects=[...(snapshot.objects||[])],
  agreements=[...(snapshot.agreements||[])],parties=[...(snapshot.parties||[])],
  people=[...(snapshot.people||[])],partyPeople=[...(snapshot.partyPeople||[])],
  assignments=[...(snapshot.stakeholderAssignments||[])],items=[...(snapshot.agreementItems||[])];
 const id=()=>makeId(),seenAgreements=new Set(),initialAgreements=new Set(agreements.map(a=>a.id));
 // Property-scoped roles should not depend on the order of agreements in
 // the file. Only evidence rows that actually name that role count.
 const earliestRoleDate=new Map(),earliestObjectDate=new Map();
 for(const record of rows){
  const number=norm(value(record,cols,'property_number'));
  const from=cleanDate(value(record,cols,'valid_from'));
  if(!number||!validDate(from))continue;
  const objectNumber=norm(value(record,cols,'object_number'));
  if(objectNumber){
   const objectToken=number+'|'+objectNumber,old=earliestObjectDate.get(objectToken);
   if(!old||from<old)earliestObjectDate.set(objectToken,from);
  }
  for(const [field,role] of [['owner_name','owner'],['manager_name','manager']]){
   if(!value(record,cols,field))continue;
   const token=number+'|'+role,previous=earliestRoleDate.get(token);
   if(!previous||from<previous)earliestRoleDate.set(token,from);
  }
 }
 if(used.length!==new Set(used).size)errors.push('Två kolumner är kopplade till samma fält.');
 if(rows.length>200)errors.push('Högst 200 datarader per omgång. Dela filen eller välj färre rader.');
 if(!used.length)errors.push('Inga kolumner kunde identifieras. Ange fält under Ändra kolumner.');
 const criticalUnmapped=headers.filter((header,i)=>!cols[i]&&!ignoredColumns.includes(i)
  &&/(hyra|tillagg|basar|index|kpi|pris|belopp)/.test(norm(header)));
 if(criticalUnmapped.length)errors.push('Ekonomikolumner saknar säker koppling: '+
  criticalUnmapped.join(', ')+'. Koppla dem manuellt eller markera Ignorera kolumn.');
 const get=(row,field)=>value(row,cols,field);
 const cmd=(action,fields,sourceRow,extra={})=>commands.push({action,fields,sourceRow,...extra});
 const chooseUnique=(list,predicate)=>{const a=list.filter(predicate);return a.length===1?a[0]:null};
 function party(name,org,kind,sourceRow,fail){
  if(!exists(name)&&!exists(org))return null;
  const matchByOrg=org?parties.filter(p=>eq(p.organization_number,org)):[];
  if(matchByOrg.length>1){fail('Flera parter har samma organisationsnummer.');return null;}
  let p=matchByOrg[0];
  if(p&&name&&!eq(p.name,name)){fail('Organisationsnumret tillhör en part med annat namn: '+p.name+'.');return null;}
  if(!p){
   const named=parties.filter(p=>eq(p.name,name));
   if(named.length>1||named.some(p=>org&&p.organization_number&&!eq(p.organization_number,org))){
    fail('Parten '+name+' har tvetydig identitet.');return null;
   }
   p=named[0];
  }
  if(!p&&!name){fail('Organisationsnummer '+org+' saknar organisationsnamn.');return null;}
  if(p&&org&&!p.organization_number){
   p.organization_number=org;
   cmd('updateParty',{organization_number:org},sourceRow,{id:p.id});
  }
  if(!p){p={id:id(),name,organization_number:org||null,kind};parties.push(p);
   cmd('createParty',{name,...(org?{organization_number:org}:{}),kind},sourceRow,{id:p.id});}
  return p;
 }
 function person(name,email,party,sourceRow,fail,date){
  if(!name)return null;
  let candidate;
  if(email){
   const byEmail=people.filter(p=>eq(p.email,email));
   if(byEmail.length>1){fail('Flera personer har samma e-post.');return null;}
   candidate=byEmail[0];
   if(candidate&&!eq(candidate.name,name)){fail('E-post tillhör en annan person: '+candidate.name);return null;}
  }
  if(!candidate){
   const byName=people.filter(p=>eq(p.name,name));
   if(byName.length>1){fail('Flera personer heter '+name+'; komplettera med e-post.');return null;}
   candidate=byName[0];
   if(candidate&&email&&candidate.email&&!eq(candidate.email,email)){fail('Förvaltaren har en annan e-post i registret.');return null;}
   if(candidate&&!email&&party&&!partyPeople.some(link=>link.person_id===candidate.id&&link.party_id===party.id)){
    fail('Förvaltaren '+name+' finns registrerad, men är inte verifierad hos '+party.name+'. Ange e-post eller koppla personen manuellt.');
    return null;
   }
  }
  if(!candidate){candidate={id:id(),name,email:email||null};people.push(candidate);
   cmd('createPerson',{name,...(email?{email}:{})},sourceRow,{id:candidate.id});}
  if(party&&!partyPeople.some(x=>x.party_id===party.id&&x.person_id===candidate.id&&(!x.valid_to||x.valid_to>=date))){
   cmd('linkPersonParty',{party_id:party.id,person_id:candidate.id,valid_from:date},sourceRow);
   partyPeople.push({party_id:party.id,person_id:candidate.id,valid_from:date,valid_to:null});
  }
  return candidate;
 }
 function role(scope,idRef,code,partyRef,personRef,date,sourceRow,fail){
  if(!partyRef)return;
  const relevant=assignments.filter(a=>a[scope]===idRef&&a.role_code===code
   &&a.valid_from<=date&&(!a.valid_to||a.valid_to>=date));
  if(relevant.length){
   if(relevant.length!==1||relevant[0].party_id!==partyRef.id
    ||(relevant[0].person_id||null)!==(personRef?.id||null))
    fail('Befintlig roll '+code+' har en annan part/person. Ändra manuellt i register.');
   return;
  }
  const later=assignments.some(a=>a[scope]===idRef&&a.role_code===code&&a.valid_from>date);
  if(later){fail('Det finns en framtida rollkoppling för '+code+'.');return;}
  const fields={[scope]:idRef,role_code:code,party_id:partyRef.id,valid_from:date};
  if(personRef)fields.person_id=personRef.id;
  cmd('setRole',fields,sourceRow);
  assignments.push({...fields,valid_to:null});
 }
 function priceFields(row,sourceRow,fail,agreement){
  for(const p of priceTypes){
   const prefix='price.'+p.id+'.',amountText=get(row,prefix+'amount');
   const detail=['year','method','index','share','min','max'].some(k=>exists(get(row,prefix+k)));
   if(!amountText){if(detail)fail(p.label+' har basår/index utan grundbelopp.');continue;}
   const amountValue=money(amountText);
   if(amountValue===null){fail('Ogiltigt årsbelopp för '+p.label+': '+amountText);continue;}
   const yearText=get(row,prefix+'year'),baseYear=yearText?Number(yearText):null;
   if(yearText&&(!Number.isInteger(baseYear)||baseYear<1900||baseYear>9999)){
    fail('Ogiltigt basår för '+p.label+'.');continue;
   }
   const methodRaw=norm(get(row,prefix+'method'));
   const method=({'kpi':'kpi','index':'kpi','kpiindex':'kpi','fastprocent':'fixed',
    'fast':'fixed','fixed':'fixed','ingen':'none','none':'none',
    'kpiminmax':'kpi-limited','kpilimited':'kpi-limited'})[methodRaw]||'';
   if(methodRaw&&!method){fail('Okänd uppräkning för '+p.label+'.');continue;}
   if(method&&method!=='none'&&!baseYear){fail(p.label+' saknar basår för uppräkningen.');continue;}
   const item={agreement_id:agreement.id,type:p.type,name:p.label,base_amount:amountValue,
    valid_from:get(row,'valid_from')?cleanDate(get(row,'valid_from')):agreement.original_start_on,
    adjustment_method:method||'none'};
   if(baseYear)item.base_year=baseYear;
   for(const [field,target]of [['index','base_index'],['share','index_share'],['min','min_percent'],['max','max_percent']]){
    const v=get(row,prefix+field);if(!v)continue;
    const n=money(v);
    if(n===null){fail('Ogiltigt värde för '+p.label+' · '+field);continue;}
    item[target]=n;
   }
   if(['kpi','kpi-limited'].includes(item.adjustment_method)
     &&(item.base_index==null||item.index_share==null)){
    fail(p.label+' saknar KPI-bastal eller indexandel.');continue;
   }
   if(item.adjustment_method==='kpi-limited'&&item.min_percent==null&&item.max_percent==null){
    fail(p.label+' saknar min/max-gräns.');continue;
   }
   const matching=items.filter(i=>i.agreement_id===agreement.id&&i.type===p.type&&eq(i.name,p.label)
    &&i.valid_from===item.valid_from);
   if(matching.length>1){fail('Flera likadana hyresposter för '+p.label+'.');continue;}
   if(matching.length){
    const old=matching[0];
    const same=['base_amount','base_year','base_index','index_share','min_percent',
     'max_percent','adjustment_method'].every(k=>(old[k]??null)===(item[k]??null));
    if(!same)fail('Avtalspriset '+p.label+' skiljer sig från befintligt. Kräver separat versionsbeslut.');
    continue;
   }
   // Do not create a second base item for an existing lease from a different date.
   if(p.type==='base'&&items.some(i=>i.agreement_id===agreement.id&&i.type==='base')){
    fail('Bashyra finns redan på avtalet med annan period. Granska hyresversion.');continue;
   }
   cmd('addAgreementItem',item,sourceRow);
   items.push(item);
  }
 }
 for(let i=0;i<Math.min(rows.length,200);i++){
  const row=rows[i],sourceRow=i+2,startCommands=commands.length,rowErrors=[];
  const fail=msg=>rowErrors.push(msg);
  const propertyNum=get(row,'property_number'),propertyName=get(row,'property_name'),
   contractNum=get(row,'agreement_number'),objNum=get(row,'object_number'),
   startText=get(row,'valid_from'),start=cleanDate(startText),end=cleanDate(get(row,'legal_end_on'));
  const info={index:i,sourceRow,propertyNumber:propertyNum,propertyName,agreementNumber:contractNum,
   objectNumber:objNum,objectId:null,propertyId:null,candidates:[],status:'matched',
   description:'',reason:'',created:[],warnings:[],
   relationships:[
    ...(get(row,'tenant_name')?[{label:'Hyresgäst',name:get(row,'tenant_name'),target:'Avtal '+(contractNum||'–')}]:[]),
    ...(get(row,'owner_name')?[{label:'Fastighetsägare',name:get(row,'owner_name'),target:'Fastighet '+propertyNum}]:[]),
    ...(get(row,'manager_name')?[{label:'Förvaltare',name:get(row,'manager_name'),
     target:(get(row,'manager_party')||get(row,'owner_name')||'Part saknas')+' · fastighet '+propertyNum}]:[])
   ],
   pricePreview:priceTypes.filter(p=>get(row,'price.'+p.id+'.amount'))
    .map(p=>({label:p.label,amount:get(row,'price.'+p.id+'.amount'),
     baseYear:get(row,'price.'+p.id+'.year')||'ej angivet'}))};
  const finalize=()=>{
   if(rowErrors.length){info.status='review';info.reason=rowErrors.join(' · ');
    errors.push('Rad '+sourceRow+': '+info.reason);}
   else if(commands.length>startCommands){info.status='new';info.description=info.created.join(', ')||'Nya kopplingar';}
   else{info.description='Oförändrat – befintliga kopplingar känns igen';}
   records.push(info);
  };
  if(!propertyNum){fail('Fastighetsnummer saknas.');finalize();continue;}
  let match=properties.filter(p=>eq(p.management_object_number,propertyNum));
  if(match.length>1){fail('Fastighetsnumret finns på flera fastigheter.');finalize();continue;}
  let property=match[0];
  if(!property){
   if(!propertyName){fail('Fastigheten är ny men saknar namn. Ange fastighetsnamn.');finalize();continue;}
   property={id:id(),name:propertyName,management_object_number:propertyNum,
    address:get(row,'property_address')||null,city:get(row,'property_city')||null};
   properties.push(property);
   cmd('createProperty',{name:property.name,management_object_number:propertyNum,
    ...(property.address?{address:property.address}:{}),...(property.city?{city:property.city}:{})},
    sourceRow,{id:property.id});info.created.push('fastighet');
  }else if(propertyName&&!eq(propertyName,property.name)){
   fail('Fastighetens namn avviker från registret ('+property.name+'). Kontrollera identiteten.');
  }
  info.propertyId=property.id;
  if(startText&&!validDate(start))fail('Ogiltigt avtalsdatum.');
  if(end&&!validDate(end))fail('Ogiltigt slutdatum.');
  if(start&&end&&end<start)fail('Avtalet slutar före startdatum.');
  const agreementMatches=contractNum?agreements.filter(a=>eq(a.agreement_number,contractNum)):[];
  if(agreementMatches.length>1)fail('Avtalsnumret är inte unikt.');
  let agreement=agreementMatches[0]||null;
  if(contractNum){
   if(seenAgreements.has(norm(contractNum)))fail('Avtalet förekommer på flera rader. Välj källa eller slå ihop rader först.');
   seenAgreements.add(norm(contractNum));
  }
  const localObjects=objects.filter(o=>o.property_id===property.id);
  info.candidates=localObjects.map(o=>({id:o.id,number:o.object_number}));
  let object=agreement?objects.find(o=>o.id===agreement.object_id):null;
  if(agreement&&(!object||object.property_id!==property.id))fail('Avtalet tillhör redan en annan fastighet.');
  if(object&&objNum&&!eq(object.object_number,objNum))fail('Källans objektnummer stämmer inte med avtalets objekt.');
  if(!object&&objNum){
   const matches=localObjects.filter(o=>eq(o.object_number,objNum));
   if(matches.length>1)fail('Objektnumret är tvetydigt.');
   object=matches[0]||null;
  }
  if(!object&&contractNum&&!objNum){
   const parts=agreementNumberParts(contractNum);
   const inferred=parts&&eq(parts.propertyId,propertyNum)?parts.objectId:null;
   const matches=inferred?localObjects.filter(o=>eq(o.object_number,inferred)):[];
   if(matches.length===1)object=matches[0];
  }
  if(!object&&exists(objectChoices[i])&&objectChoices[i]!=='@new'){
   object=localObjects.find(o=>o.id===objectChoices[i]);
   if(!object)fail('Valt objekt hör inte till fastigheten.');
   if(object&&objNum&&!eq(object.object_number,objNum))fail('Valt objekt har annat nummer än källan.');
  }
  if(!object&&!rowErrors.length&&(objNum||objectChoices[i]==='@new')){
   const proposed=objNum||nextObjectNumber(property,objects,properties);
   if(!proposed||localObjects.some(o=>eq(o.object_number,proposed)))fail('Nytt objektnummer är inte entydigt.');
   else{
    const objectStart=earliestObjectDate.get(norm(propertyNum)+'|'+norm(proposed))||start||snapshot.asOf||'2026-01-01';
    object={id:id(),object_number:proposed,property_id:property.id,
     versions:[{valid_from:objectStart,area:null}]};
    objects.push(object);
    const areaRaw=get(row,'area');
    const areaValue=areaRaw?money(areaRaw):null;
    if(areaRaw&&areaValue===null)fail('Ogiltig objektarea.');
    cmd('createObject',{property_id:property.id,object_number:proposed,
     valid_from:objectStart,...(areaValue!==null?{area:areaValue}:{})},
     sourceRow,{id:object.id});info.created.push('objekt');
   }
  }
  if(!object&&contractNum&&!rowErrors.length)fail('Objekt kan inte avgöras säkert. Välj befintligt objekt eller skapa nytt.');
  if(object){info.objectId=object.id;info.objectNumber=object.object_number;}
  if(object&&get(row,'area')){
   const areaValue=money(get(row,'area'));
   if(areaValue===null)fail('Ogiltig objektarea.');
   else if(!info.created.includes('objekt')){
    const version=object.currentVersion||object.versions?.[0];
    if(version?.area==null)
     fail('Objektet saknar registrerad area. Skapa eller granska en daterad objektversion.');
    else if(Number(version.area)!==areaValue)
     fail('Objektets area skiljer sig från registret. Granska en ny objektversion.');
   }
  }
  if(!agreement&&contractNum&&object&&start&&!rowErrors.length){
   agreement={id:id(),agreement_number:contractNum,object_id:object.id,original_start_on:start};
   agreements.push(agreement);
   cmd('createAgreement',{object_id:object.id,agreement_number:contractNum,valid_from:start,
    ...(end?{legal_end_on:end}:{}),...(get(row,'usage')?{usage:get(row,'usage')}:{})},
    sourceRow,{id:agreement.id});info.created.push('avtal');
  }
  if(contractNum&&!agreement&&!start)fail('Nytt avtal saknar startdatum.');
  if(agreement&&initialAgreements.has(agreement.id)){
   const earliest=agreement.original_start_on||agreement.versions?.at(-1)?.valid_from;
   if(start&&earliest&&start!==earliest)info.warnings.push('Avtalsstart skiljer sig från befintligt; originalperioden behålls.');
  }
  const ownerName=get(row,'owner_name'),tenantName=get(row,'tenant_name'),
   managerName=get(row,'manager_name'),managerEmail=get(row,'manager_email'),
   managerPartyName=get(row,'manager_party');
  const owner=party(ownerName,get(row,'owner_org'),'fastighetsägare',sourceRow,fail);
  const tenant=party(tenantName,get(row,'tenant_org'),'hyresgäst',sourceRow,fail);
  let managerParty=owner;
  if(managerPartyName)managerParty=party(managerPartyName,'','förvaltare',sourceRow,fail);
  if(managerName&&!managerParty)fail('Förvaltaren '+managerName+' saknar tillhörande organisation eller fastighetsägare.');
  const effective=start&&validDate(start)?start:(snapshot.asOf||'2026-11-02');
  const ownerStart=earliestRoleDate.get(norm(propertyNum)+'|owner')||effective;
  const managerStart=earliestRoleDate.get(norm(propertyNum)+'|manager')||effective;
  const manager=managerParty?person(managerName,managerEmail,managerParty,sourceRow,fail,managerStart):null;
  if(owner)role('property_id',property.id,'owner',owner,null,ownerStart,sourceRow,fail);
  if(manager)role('property_id',property.id,'asset_manager',managerParty,manager,managerStart,sourceRow,fail);
  if(tenant&&!agreement)fail('Hyresgäst saknar avtal att knytas till.');
  if(tenant&&agreement)role('agreement_id',agreement.id,'tenant',tenant,null,
   agreement.original_start_on||effective,sourceRow,fail);
  const hasPrice=priceTypes.some(p=>exists(get(row,'price.'+p.id+'.amount')));
  if(hasPrice&&!agreement)fail('Avtalspriser saknar ett säkert avtal.');
  if(agreement)priceFields(row,sourceRow,fail,agreement);
  finalize();
 }
 return {commands,records,errors,warnings,mapping:cols,stats:{
  matched:records.filter(x=>x.status==='matched').length,
  created:records.filter(x=>x.status==='new').length,
  review:records.filter(x=>x.status==='review').length,
  commands:commands.length
 }};
}
