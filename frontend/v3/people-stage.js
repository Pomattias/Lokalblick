// Guided stage 4: companies, tenant/owner roles and named people.
// Never infer a person's employer, overwrite an existing assignment, or
// create historical issues/contacts from unrelated source fields.
import {readGuidedRows,propertyFor,issue,key,heading,same,multiValue,validDate} from './guided-source.js';

const safe=v=>String(v??'').trim();
const has=v=>safe(v)!=='';
const normalizedEmail=v=>key(v);
const roleLabels={tenant:'Hyresgäst',owner:'Fastighetsägare',asset_manager:'Förvaltare',
 coordinator:'Lokalsamordnare',tenant_contact:'Hyresgästkontakt',owner_contact:'Fastighetsägarkontakt'};
const fromAgreement=a=>a?.original_start_on||a?.versions?.at(-1)?.valid_from||'';
const linkedTo=(snapshot,agreement,propertyId)=>{
 const object=(snapshot.objects||[]).find(x=>x.id===agreement.object_id);
 return object?.property_id===propertyId;
};

export function preparePeopleStage(sheets,snapshot,{makeId=()=>crypto.randomUUID()}={}){
 const issues=[],entries=[],units=[],allParties=[...(snapshot.parties||[])],
  allPeople=[...(snapshot.people||[])],allLinks=[...(snapshot.partyPeople||[])],
  assignments=[...(snapshot.stakeholderAssignments||[])],agreements=snapshot.agreements||[];
 const requests=new Map(),mentioned=new Set(),createdParties=new Set(),createdPeople=new Set();
 const newByName=new Map();
 const asOf=validDate(snapshot.asOf)?snapshot.asOf:'2026-01-01';
 const warn=(row,field,message,value='')=>issues.push(issue(row.sheet,row.row,field,message,value));
 const unit=(k,commands,dependsOn=[],row)=>{units.push({key:k,commands,dependsOn,sheet:row?.sheet||'',row:row?.row||0});};
 const party=(name,org,kind,row)=>{
  name=safe(name);org=safe(org);
  if(!name&&!org)return null;
  if(multiValue(name)||multiValue(org)){warn(row,'Part','Flera organisationer eller organisationsnummer i samma cell.',name||org);return null;}
  if(!name){warn(row,'Part','Organisationsnamn saknas.',org);return null;}
  if(name.length>200||org.length>200){warn(row,'Part','Partens namn eller organisationsnummer är för långt.',name);return null;}
  const matchesByOrg=org?allParties.filter(p=>same(p.organization_number,org)):[];
  const matchesByName=allParties.filter(p=>same(p.name,name));
  if(matchesByOrg.length>1||matchesByName.length>1){
   warn(row,'Part','Flera parter har samma identifierare. Kontrollera i registret.',name);return null;
  }
  if(org&&matchesByOrg[0]&&matchesByName[0]&&matchesByOrg[0].id!==matchesByName[0].id){
   warn(row,'Part','Organisationsnummer och namn pekar på olika parter.',name);return null;
  }
  let p=matchesByOrg[0]||matchesByName[0]||null;
  if(p&&org&&p.organization_number&&!same(p.organization_number,org)||
     p&&org&&matchesByOrg[0]&&!same(p.name,name)){
   warn(row,'Part','Namn eller organisationsnummer skiljer sig från befintlig part.',name);return null;
  }
  if(!p){
   p={id:makeId(),name,organization_number:org||null,kind};
   allParties.push(p);createdParties.add(p.id);
   unit('party:'+p.id,[{action:'createParty',id:p.id,sourceRow:row.row,
    fields:{name,kind,...(org?{organization_number:org}:{})}}],[],row);
  }else if(org&&!p.organization_number){
   p.organization_number=org;
   const k='party-update:'+p.id;
   if(!units.some(u=>u.key===k))
    unit(k,[{action:'updateParty',id:p.id,sourceRow:row.row,
     fields:{organization_number:org}}],[],row);
  }
  mentioned.add(p.id);
  return p;
 };
 const person=(name,email,partyRef,row,date,jobTitle='',phone='')=>{
  name=safe(name);email=safe(email);phone=safe(phone);
  if(!name)return null;
  if(!partyRef){warn(row,'Person','Personens organisation kan inte identifieras. Ingen person eller koppling skapas.',name);return null;}
  if(multiValue(name)||multiValue(email)){warn(row,'Person','Flera namn eller e-postadresser i samma cell. Dela upp i Excel.',name);return null;}
  if(name.length>200||email.length>200||phone.length>100){
   warn(row,'Person','Namn, e-postadress eller telefonnummer är för långt.',name);return null;
  }
  const emailMatches=email?allPeople.filter(p=>same(p.email,email)):[];
  const nameMatches=allPeople.filter(p=>same(p.name,name));
  if(emailMatches.length>1||nameMatches.length>1&&!email){
   warn(row,'Person','Personens identitet är tvetydig. Ange e-post för säker matchning.',name);return null;
  }
  let p=emailMatches[0]||null;
  if(p&&!same(p.name,name)){warn(row,'Person','E-postadressen tillhör en person med annat namn.',email);return null;}
  if(!p&&nameMatches.length===1){
   const maybe=nameMatches[0],member=allLinks.some(l=>l.person_id===maybe.id&&l.party_id===partyRef.id);
   if(email&&maybe.email&&!same(maybe.email,email)){
    warn(row,'Person','Personen har annan e-postadress i registret. Kontrollera identiteten.',name);return null;
   }
   if(email&&(!maybe.email)&&!member){
    warn(row,'Person','Person med samma namn finns hos annan part utan bekräftad e-post. Matcha manuellt.',name);return null;
   }
   if(!email&&!member){
    if(createdPeople.has(maybe.id)){
     warn(row,'Person','Samma namn förekommer på flera parter utan e-post. Kontrollera personen.',name);return null;
    }
    warn(row,'Person','Person med samma namn finns men är inte verifierad hos denna part. Ange e-post eller koppla manuellt.',name);
    return null;
   }
   p=maybe;
  }
  if(!p){
   const sameNewName=newByName.get(key(name));
   if(!email&&sameNewName&&sameNewName!==partyRef.id){
    warn(row,'Person','En person med samma namn finns redan i annan importerad organisation. Ange e-post.',name);return null;
   }
   p={id:makeId(),name,email:email||null,phone:phone||null};
   allPeople.push(p);createdPeople.add(p.id);
   newByName.set(key(name),partyRef.id);
   unit('person:'+p.id,[{action:'createPerson',id:p.id,sourceRow:row.row,
    fields:{name,...(email?{email}:{}),...(phone?{phone}:{})}}],[],row);
  }
  // Verified identity: fill a missing phone number, never overwrite.
  if(phone&&!createdPeople.has(p.id)){
   if(p.phone&&!same(p.phone,phone))
    warn(row,'Telefon','Telefonnumret skiljer sig från befintligt. Uppgiften ändras inte.',phone);
   else if(!p.phone&&!units.some(u=>u.key==='person-update:'+p.id)){
    unit('person-update:'+p.id,[{action:'updatePerson',id:p.id,sourceRow:row.row,
     fields:{phone}}],[],row);p.phone=phone;
   }
  }
  const links=allLinks.filter(l=>l.party_id===partyRef.id&&l.person_id===p.id);
  const valid=links.some(l=>l.valid_from<=date&&(!l.valid_to||l.valid_to>=date));
  if(!valid){
   if(links.length){
    warn(row,'Person','Personens befintliga parttillhörighet täcker inte datumet. Granska historiken.',name);
    return null;
   }
   allLinks.push({party_id:partyRef.id,person_id:p.id,valid_from:date,valid_to:null});
   const depends=[...(createdParties.has(partyRef.id)?['party:'+partyRef.id]:[]),
    ...(createdPeople.has(p.id)?['person:'+p.id]:[])];
   unit('membership:'+partyRef.id+':'+p.id,[{action:'linkPersonParty',sourceRow:row.row,
    fields:{party_id:partyRef.id,person_id:p.id,valid_from:date,...(jobTitle?{job_title:jobTitle}:{})}}],
    depends,row);
  }
  return p;
 };
 const requestRole=(row,scope,id,code,partyRef,personRef,date)=>{
  if(!partyRef||!id)return;
  const k=scope+'|'+id+'|'+code,previous=requests.get(k);
  if(previous){
   if(previous.partyId!==partyRef.id||previous.personId!==(personRef?.id||null))
    previous.conflict=true;
   if(date<previous.date)previous.date=date;
   return;
  }
  requests.set(k,{scope,id,code,partyId:partyRef.id,personId:personRef?.id||null,
   date,row,conflict:false});
 };
 const evidence=readGuidedRows(sheets);
 // Process older contractual evidence first, so person-party membership
 // covers the earliest role date even if source rows are unsorted.
 const effective=row=>fromAgreement(agreements.find(a=>same(a.agreement_number,
  row.fields.agreement_number)))||asOf;
 evidence.sort((a,b)=>effective(a).localeCompare(effective(b)));
 const sourceMaster=(sheets||[]).some(s=>s.name&&/lokallista/i.test(s.name));
 const validProps=new Set();
 // Only properties genuinely represented in the master file may be
 // enriched from additional sheets when Lokallista is selected.
 if(sourceMaster)for(const row of evidence)if(row.master){
  const result=propertyFor(row.fields,snapshot);
  if(result.property)validProps.add(result.property.id);
 }
 const resultRows=[];
 // An explicitly selected Part register creates only identifiable organizations.
 // It does not guess any relation to a property or agreement.
 for(const row of evidence){
  const f=row.fields;
  if(!has(f.party_name))continue;
  const kind=heading(f.party_kind||'');
  const type=({hyresgast:'hyresgäst',fastighetsagare:'fastighetsägare',
   lokalsamordnare:'lokalsamordnare',forvaltare:'förvaltare'})[kind]||'övrig';
  const p=party(f.party_name,f.party_org,type,row);
  if(p)resultRows.push({sheet:row.sheet,sourceRow:row.row,
   propertyNumber:'',agreementNumber:'',owner:'',tenant:'',parties:[p.name],status:'existing'});
 }
 for(const row of evidence){
  const f=row.fields;
  if(has(f.party_name))continue;
  // Standalone person sheets require a verified, unique affiliation.
  if(has(f.person_name)){
   const affiliation=safe(f.person_party);
   const candidates=affiliation?allParties.filter(p=>same(p.name,affiliation)||
    same(p.organization_number,affiliation)):[];
   if(candidates.length!==1){
    warn(row,'Person','Personens tillhörighet saknas eller matchar inte exakt en part. Personen hoppas över.',affiliation);
    continue;
   }
   const candidate=person(f.person_name,f.person_email,candidates[0],row,asOf,'',f.person_phone);
   if(candidate)resultRows.push({sheet:row.sheet,sourceRow:row.row,propertyNumber:'',
    agreementNumber:'',owner:'',tenant:'',parties:[candidates[0].name+' · '+candidate.name],
    status:'existing'});
   continue;
  }
  if(!['tenant_name','owner_name','manager_name','coordinator_name','tenant_contact','owner_contact']
    .some(field=>has(f[field])))continue;
  let resolved=propertyFor(f,snapshot);
  // A unique, existing agreement can identify the property's
  // relationship in a standalone Hyresgäster sheet.
  if(resolved.error&&!has(f.property_number)&&!has(f.property_address)&&has(f.agreement_number)&&
   !multiValue(f.agreement_number)){
   const matches=agreements.filter(a=>same(a.agreement_number,f.agreement_number));
   if(matches.length===1){
    const obj=(snapshot.objects||[]).find(o=>o.id===matches[0].object_id);
    const p=(snapshot.properties||[]).find(p=>p.id===obj?.property_id);
    if(p)resolved={property:p};
   }
  }
  if(resolved.error){warn(row,'Fastighet',resolved.error,f.property_number);continue;}
  const property=resolved.property;
  if(sourceMaster&&!validProps.has(property.id)){
   warn(row,'Fastighet','Kopplingen saknar underlag i vald Lokallista. Raden hoppas över.',f.property_number);continue;
  }
  const contract=f.agreement_number;
  const agreementMatches=contract?agreements.filter(a=>same(a.agreement_number,contract)):[];
  let agreement=null;
  if(contract&&multiValue(contract)){warn(row,'Avtalsnummer','Flera avtalsnummer i samma cell. Dela upp i flera Excel-rader.',contract);}
  else if(agreementMatches.length===1&&linkedTo(snapshot,agreementMatches[0],property.id))agreement=agreementMatches[0];
  else if(contract)warn(row,'Avtal',agreementMatches.length>1?'Avtalet är inte unikt.':
   'Avtalet saknas eller hör till en annan fastighet. Hyresgästkopplingen hoppas över.',contract);
  const date=agreement?fromAgreement(agreement)||asOf:asOf;
  const tenant=agreement?party(f.tenant_name,f.tenant_org,'hyresgäst',row):null;
  const owner=party(f.owner_name,f.owner_org,'fastighetsägare',row);
  const managerParty=has(f.manager_party)?party(f.manager_party,'','förvaltare',row):null;
  const coordinatorParty=has(f.coordinator_party)?party(f.coordinator_party,'','lokalsamordnare',row):null;
  if(agreement&&tenant)requestRole(row,'agreement_id',agreement.id,'tenant',tenant,null,date);
  if(owner)requestRole(row,'property_id',property.id,'owner',owner,null,date);
  if(has(f.manager_name)){
   if(!managerParty)warn(row,'Förvaltare','Förvaltarens organisation saknas. Ange organisation innan person och ansvar kan kopplas.',f.manager_name);
   else{
    const m=person(f.manager_name,f.manager_email,managerParty,row,date,'Förvaltare');
    if(m)requestRole(row,'property_id',property.id,'asset_manager',managerParty,m,date);
   }
  }
  if(has(f.coordinator_name)){
   if(!coordinatorParty)warn(row,'Lokalsamordnare','Organisation för Lokalsamordnare saknas. Ange organisation för säker koppling.',f.coordinator_name);
   else{
    const p=person(f.coordinator_name,f.coordinator_email,coordinatorParty,row,date,'Lokalsamordnare');
    if(p)requestRole(row,'property_id',property.id,'coordinator',coordinatorParty,p,date);
   }
  }
  if(has(f.tenant_contact)){
   if(!tenant)warn(row,'Hyresgästkontakt','Kontaktperson saknar ett säkert avtal och en hyresgäst. Ingen koppling görs.',f.tenant_contact);
   else{
    const p=person(f.tenant_contact,f.tenant_contact_email,tenant,row,date,'Hyresgästkontakt');
    if(p)requestRole(row,'agreement_id',agreement.id,'tenant_contact',tenant,p,date);
   }
  }
  if(has(f.owner_contact)){
   if(!owner)warn(row,'Fastighetsägarkontakt','Fastighetsägarens part måste vara känd.',f.owner_contact);
   else{
    const p=person(f.owner_contact,f.owner_contact_email,owner,row,date,'Ägarkontakt');
    if(p)requestRole(row,'property_id',property.id,'owner_contact',owner,p,date);
   }
  }
  resultRows.push({sheet:row.sheet,sourceRow:row.row,propertyNumber:property.management_object_number,
   agreementNumber:agreement?.agreement_number||contract||'',owner:owner?.name||'',tenant:tenant?.name||'',
   parties:[tenant,owner,managerParty,coordinatorParty].filter(Boolean).map(p=>p.name),
   people:[f.manager_name,f.coordinator_name,f.tenant_contact,f.owner_contact].filter(has),
   status:'existing'});
 }
 for(const request of requests.values()){
  const {scope,id,code,partyId,personId,date,row,conflict}=request;
  if(conflict){warn(row,roleLabels[code],'Olika parter eller personer har angivits för samma roll. Granska i Excel.');continue;}
  const relevant=assignments.filter(x=>x[scope]===id&&x.role_code===code);
  const overlap=relevant.filter(x=>x.valid_from<=date&&(!x.valid_to||x.valid_to>=date));
  if(overlap.length){
   if(overlap.length!==1||overlap[0].party_id!==partyId||(overlap[0].person_id||null)!==personId)
    warn(row,roleLabels[code],'Befintlig ansvarskoppling skiljer sig. Den skrivs inte över.');
   continue;
  }
  if(relevant.some(x=>x.valid_from>date)){
   warn(row,roleLabels[code],'Det finns senare daterade ansvarskopplingar. Granska historiken.');continue;
  }
  const depends=[];
  if(createdParties.has(partyId))depends.push('party:'+partyId);
  if(personId){
   if(createdPeople.has(personId))depends.push('person:'+personId);
   if(units.some(u=>u.key==='membership:'+partyId+':'+personId))
    depends.push('membership:'+partyId+':'+personId);
  }
  unit('role:'+scope+':'+id+':'+code,
   [{action:'setRole',sourceRow:row.row,fields:{[scope]:id,role_code:code,
    party_id:partyId,...(personId?{person_id:personId}:{}),valid_from:date}}],depends,row);
 }
 const counts={parties:units.filter(x=>x.key.startsWith('party:')).length,
  people:units.filter(x=>x.key.startsWith('person:')).length,
  memberships:units.filter(x=>x.key.startsWith('membership:')).length,
  roles:units.filter(x=>x.key.startsWith('role:')).length};
 return {entries:resultRows,issues,units,commands:units.flatMap(u=>u.commands),stats:{
  found:resultRows.length,...counts,issues:issues.length}};
}
