import { randomUUID } from 'node:crypto';
import { createFreshDatabase, openExistingDatabase, objectVersionAt, resolvedStakeholders, agreementVersionsAt } from './database.js';
import { existsSync } from 'node:fs';
import {runModuleCommand,operationalSnapshot} from './modules.js';

// V3 operations are explicit and transactional; there is no V2 workspace replacement.
const date=v=>{const raw=String(v||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw)||!Number.isFinite(Date.parse(raw+'T00:00:00Z'))||new Date(raw+'T00:00:00Z').toISOString().slice(0,10)!==raw)throw Error('Ogiltigt datum, ange ÅÅÅÅ-MM-DD.');return raw;};
const text=(v,label,max=200)=>{const s=String(v??'').trim();if(!s||s.length>max)throw Error('Ange '+label+'.');return s;};
const optional=v=>v==null||v===''?null:String(v).trim();
const nonneg=(v,label)=>{if(v==null||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('Ogiltigt '+label);return n;};
const previousDay=value=>new Date(Date.parse(date(value)+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const lookup=(db,table,id)=>db.prepare('SELECT * FROM '+table+' WHERE id=?').get(id);
const all=(db,table)=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all();
const insert=(db,table,row)=>{
 const fields=Object.keys(row);
 db.prepare('INSERT INTO '+table+' ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')').run(...Object.values(row));
};
const update=(db,table,id,values)=>{
 const keys=Object.keys(values);
 if(!lookup(db,table,id))throw Error('Posten saknas: '+table);
 db.prepare('UPDATE '+table+' SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=?').run(...keys.map(k=>values[k]),id);
};
const editable={
 property:['name','popular_name','management_object_number','address','city','latitude','longitude','maintenance_responsibility'],
 party:['name','organization_number','kind','owner_class'],
 person:['name','email','phone'],
};
function fields(input,allowed,required=[]){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Ange fält.');
 if(Object.keys(input).some(k=>!allowed.includes(k)))throw Error('Okänt eller skrivskyddat fält.');
 for(const key of required)text(input[key],key);
 return Object.fromEntries(Object.entries(input).map(([k,v])=>[k,v===''?null:v]));
}
function asOfSnapshot(db,asOf) {
 const at=date(asOf);
 const parties=all(db,'parties'),people=all(db,'people'),partyPeople=all(db,'party_people'),properties=all(db,'properties');
 const objects=all(db,'objects').map(o=>({
  ...o,versions:db.prepare('SELECT * FROM object_versions WHERE object_id=? ORDER BY valid_from DESC').all(o.id),
  currentVersion:objectVersionAt(db,o.id,at),
  stakeholders:resolvedStakeholders(db,{objectId:o.id},at)
 }));
 const latest=new Map(agreementVersionsAt(db,at).map(v=>[v.id,v]));
 const agreements=all(db,'agreements').map(a=>({
  ...a,versions:db.prepare('SELECT * FROM agreement_versions WHERE agreement_id=? ORDER BY valid_from DESC').all(a.id),
  currentVersion:latest.get(a.id)||null,
  stakeholders:resolvedStakeholders(db,{agreementId:a.id},at)
 }));
 const propertiesWithRoles=properties.map(p=>({...p,stakeholders:resolvedStakeholders(db,{propertyId:p.id},at)}));
 return {schemaVersion:3,version:db.prepare('SELECT version FROM store_meta WHERE id=1').get().version,asOf:at,
  parties,people,partyPeople,properties:propertiesWithRoles,objects,agreements,stakeholderAssignments:all(db,'stakeholder_assignments'),
  agreementItems:all(db,'agreement_items'),
  ...operationalSnapshot(db,at,{all}),
  schema:db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'store_meta' ORDER BY name").all().map(t=>({name:t.name,columns:db.prepare('PRAGMA table_info('+t.name+')').all().map(c=>({name:c.name,type:c.type,required:Boolean(c.notnull),primary:Boolean(c.pk)})),references:db.prepare('PRAGMA foreign_key_list('+t.name+')').all().map(f=>({column:f.from,table:f.table,target:f.to}))}))};
}
function perform(db,command) {
 if(!command||typeof command!=='object'||Array.isArray(command))throw Error('Ogiltig åtgärd.');
 const id=()=>randomUUID(),p=command.fields||{},now=command.effectiveFrom;
 switch(command.action) {
  case 'createParty':{const row=fields(p,editable.party,['name']);insert(db,'parties',{id:command.id?text(command.id,'PartID',64):id(),...row});break;}
  case 'updateParty':update(db,'parties',text(command.id,'PartID'),fields(p,editable.party));break;
  case 'createPerson':{const row=fields(p,editable.person,['name']);insert(db,'people',{id:command.id?text(command.id,'PersonID',64):id(),...row});break;}
  case 'updatePerson':update(db,'people',text(command.id,'PersonID'),fields(p,editable.person));break;
  case 'linkPersonParty':{
   const party_id=text(p.party_id,'part'),person_id=text(p.person_id,'person');
   insert(db,'party_people',{id:id(),party_id,person_id,job_title:optional(p.job_title),
    valid_from:date(p.valid_from),valid_to:p.valid_to?date(p.valid_to):null,is_primary:p.is_primary?1:0});break;
  }
  case 'createProperty':{
   const row=fields(p,editable.property,['name']);
   if(row.latitude!=null)row.latitude=Number(row.latitude);
   if(row.longitude!=null)row.longitude=Number(row.longitude);
   insert(db,'properties',{id:id(),...row});break;
  }
  case 'updateProperty':{
   const row=fields(p,editable.property);
   if(row.latitude!=null)row.latitude=Number(row.latitude);
   if(row.longitude!=null)row.longitude=Number(row.longitude);
   update(db,'properties',text(command.id,'FastighetsID'),row);break;
  }
  case 'createObject':{
   const objectId=id(),property_id=text(p.property_id,'fastighet'),object_number=text(p.object_number,'objektsnummer');
   const valid_from=date(p.valid_from);
   insert(db,'objects',{id:objectId,property_id,object_number});
   insert(db,'object_versions',{id:id(),object_id:objectId,valid_from,area:nonneg(p.area,'yta'),category:optional(p.category),
    apartment_area:nonneg(p.apartment_area,'lägenhetsyta'),common_area:nonneg(p.common_area,'gemensam yta')});break;
  }
  case 'reviseObject':{
   const object_id=text(command.id,'ObjektID'),valid_from=date(p.valid_from);
   const o=lookup(db,'objects',object_id);
   if(!o)throw Error('Objektet saknas.');
   const last=db.prepare('SELECT MAX(valid_from) AS latest FROM object_versions WHERE object_id=?').get(object_id).latest;
   if(valid_from<=last)throw Error('En ny objektversion måste börja efter den senaste.');
   if(o.ended_on&&valid_from>o.ended_on)throw Error('Objektet är avslutat.');
   const data=fields(p,['valid_from','area','apartment_area','common_area','category','maintenance_responsibility','notes'],['valid_from']);
   const prior=db.prepare('SELECT * FROM object_versions WHERE object_id=? ORDER BY valid_from DESC LIMIT 1').get(object_id);
   insert(db,'object_versions',{id:id(),object_id,valid_from,
    area:data.area===undefined?prior.area:nonneg(data.area,'yta'),
    apartment_area:data.apartment_area===undefined?prior.apartment_area:nonneg(data.apartment_area,'lägenhetsyta'),
    common_area:data.common_area===undefined?prior.common_area:nonneg(data.common_area,'gemensam yta'),
    category:data.category===undefined?prior.category:optional(data.category),
    maintenance_responsibility:data.maintenance_responsibility===undefined?prior.maintenance_responsibility:optional(data.maintenance_responsibility),
    notes:data.notes===undefined?prior.notes:optional(data.notes)});break;
  }
  case 'endObject':{
   const o=lookup(db,'objects',text(command.id,'ObjektID'));if(!o)throw Error('Objektet saknas.');
   const ended_on=date(p.ended_on),first=db.prepare('SELECT MIN(valid_from) AS start FROM object_versions WHERE object_id=?').get(o.id).start;
   if(ended_on<first)throw Error('Slutdatum före objektets start.');
   update(db,'objects',o.id,{ended_on});break;
  }
  case 'createAgreement':{
   const agreementId=id(),agreement_number=text(p.agreement_number,'avtalsnummer'),object_id=text(p.object_id,'objekt'),valid_from=date(p.valid_from);
   const object=lookup(db,'objects',object_id);
   if(!object)throw Error('Objektet saknas.');
   const earliest=db.prepare('SELECT MIN(valid_from) AS first FROM object_versions WHERE object_id=?').get(object_id).first;
   if(!earliest||valid_from<earliest||object.ended_on&&valid_from>object.ended_on)
    throw Error('Avtalets start måste ligga inom objektets giltighetstid.');
   insert(db,'agreements',{id:agreementId,agreement_number,object_id,original_start_on:valid_from});
   insert(db,'agreement_versions',{id:id(),agreement_id:agreementId,valid_from,legal_end_on:p.legal_end_on?date(p.legal_end_on):null,
    usage:optional(p.usage),business_description:optional(p.business_description)});break;
  }
  case 'reviseAgreement':{
   const agreement_id=text(command.id,'AvtalsID'),valid_from=date(p.valid_from);
   if(!lookup(db,'agreements',agreement_id))throw Error('Avtalet saknas.');
   const last=db.prepare('SELECT * FROM agreement_versions WHERE agreement_id=? ORDER BY valid_from DESC LIMIT 1').get(agreement_id);
   if(valid_from<=last.valid_from)throw Error('En ny avtalsversion måste börja efter den senaste.');
   const data=fields(p,['valid_from','legal_end_on','usage','business_description','notice_months','renewal_months','cost_center','agreement_type'],['valid_from']);
   insert(db,'agreement_versions',{id:id(),agreement_id,valid_from,
    legal_end_on:data.legal_end_on===undefined?last.legal_end_on:(data.legal_end_on?date(data.legal_end_on):null),
    usage:data.usage===undefined?last.usage:optional(data.usage),
    business_description:data.business_description===undefined?last.business_description:optional(data.business_description),
    notice_months:data.notice_months===undefined?last.notice_months:nonneg(data.notice_months,'uppsägningstid'),
    renewal_months:data.renewal_months===undefined?last.renewal_months:nonneg(data.renewal_months,'förlängningstid'),
    cost_center:data.cost_center===undefined?last.cost_center:optional(data.cost_center),
    agreement_type:data.agreement_type===undefined?last.agreement_type:optional(data.agreement_type)});break;
  }
  case 'setRole':{
   const role_code=text(p.role_code,'roll'),scope=['property_id','object_id','agreement_id','issue_id','order_id'].filter(k=>p[k]);
   if(scope.length!==1)throw Error('Ange exakt en hemvist.');
   const valid_from=date(p.valid_from),key=scope[0],keyId=text(p[key],'hemvist');
   const current=db.prepare(`SELECT * FROM stakeholder_assignments WHERE ${key}=? AND role_code=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>=?)`).all(keyId,role_code,valid_from,valid_from);
   if(current.some(r=>r.valid_from===valid_from))throw Error('Ansvar ändras från en ny dag, inte inom samma giltighetsstart.');
   const future=db.prepare(`SELECT COUNT(*) AS n FROM stakeholder_assignments WHERE ${key}=? AND role_code=? AND valid_from>?`).get(keyId,role_code,valid_from).n;
   if(future)throw Error('Det finns framtida rolländringar. Välj den senaste perioden.');
   for(const row of current)update(db,'stakeholder_assignments',row.id,{valid_to:previousDay(valid_from)});
   insert(db,'stakeholder_assignments',{id:id(),[key]:keyId,role_code,valid_from,
    party_id:optional(p.party_id),person_id:optional(p.person_id),
    assignment_mode:p.assignment_mode==='block'?'block':'assign',shared:p.shared?1:0});break;
  }
  case 'addAgreementItem':
  case 'updateAgreementItem':{
   const allowed=['agreement_id','type','name','base_amount','valid_from','valid_to','adjustment_method',
    'base_year','base_index','index_share','annual_percent','min_percent','max_percent','limit_basis','floor','reconcilable'];
   const data=fields(p,allowed);
   const existing=command.action==='updateAgreementItem'?lookup(db,'agreement_items',text(command.id,'AvtalspostID')):null;
   if(command.action==='updateAgreementItem'&&!existing)throw Error('Hyresposten saknas.');
   const agreement_id=existing?.agreement_id||text(data.agreement_id,'avtal');
   if(data.agreement_id&&data.agreement_id!==agreement_id)throw Error('En hyrespost kan inte flyttas mellan avtal.');
   if(!lookup(db,'agreements',agreement_id))throw Error('Avtalet saknas.');
   const amount=data.base_amount===undefined?existing?.base_amount:nonneg(data.base_amount,'belopp');
   if(amount==null)throw Error('Grundbelopp krävs.');
   const values={agreement_id,type:data.type||existing?.type,name:data.name||existing?.name,base_amount:amount};
   if(!values.type||!values.name)throw Error('Ange posttyp och benämning.');
   for(const key of ['valid_from','valid_to']){
    if(data[key]!==undefined)values[key]=data[key]?date(data[key]):null;
    else if(!existing)values[key]=null;
   }
   if(values.valid_from&&values.valid_to&&values.valid_from>values.valid_to)throw Error('Slutdatum får inte vara före startdatum.');
   values.adjustment_method=data.adjustment_method===undefined?existing?.adjustment_method||'none':data.adjustment_method||'none';
   for(const key of ['base_year','base_index','index_share','annual_percent','min_percent','max_percent']){
    if(data[key]===undefined){if(!existing)values[key]=null;continue;}
    if(data[key]===null){values[key]=null;continue;}
    const v=Number(data[key]);
    if(!Number.isFinite(v)||key==='base_year'&&(!Number.isInteger(v)||v<1900))
     throw Error('Ogiltigt värde för '+key+'.');
    if(key==='index_share'&&(v<0||v>1))throw Error('Indexandel ska vara mellan 0 och 1.');
    values[key]=v;
   }
   for(const key of ['limit_basis']){
    if(data[key]!==undefined)values[key]=optional(data[key]);
   }
   for(const key of ['floor','reconcilable']){
    if(data[key]!==undefined)values[key]=Number(data[key])?1:0;
   }
   if(existing){
    delete values.agreement_id;
    update(db,'agreement_items',existing.id,values);
   }else insert(db,'agreement_items',{id:id(),...values});
   break;
  }
  default:if(!runModuleCommand(db,command,{id,date,text,optional,nonneg,fields,insert,update,lookup,previousDay}))throw Error('Åtgärden stöds inte i Lokalblick v3.');
 }
}
// One SQLite transaction per command, optimistic concurrency, no mass replace.
export class CoreV3Store {
 constructor(db,{ownsDatabase=false,fileName='minne'}={}){this.db=db;this.ownsDatabase=ownsDatabase;this.fileName=fileName;this.queue=Promise.resolve();}
 static open(file) {
  const db=existsSync(file)?openExistingDatabase(file):createFreshDatabase(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
  return new CoreV3Store(db,{ownsDatabase:true,fileName:'Lokalblick v3'});
 }
 readSnapshot(at=new Date().toISOString().slice(0,10)){return Promise.resolve(asOfSnapshot(this.db,at));}
 mutate(input){
  const job=this.queue.then(()=>{
   if(!input||!Number.isInteger(input.version)||(!input.command&&!input.commands))throw Error('Ange version och kommando.');
   const commands=input.commands||[input.command];
   if(!Array.isArray(commands)||commands.length<1||commands.length>200)throw Error('Ange mellan 1 och 200 ändringar per import.');
   this.db.exec('BEGIN IMMEDIATE');
   try{
    const version=this.db.prepare('SELECT version FROM store_meta WHERE id=1').get().version;
    if(input.version!==version){const e=Error('Uppgifterna har ändrats. Läs in på nytt.');e.status=409;throw e;}
    for(const command of commands)perform(this.db,command);
    this.db.exec('UPDATE store_meta SET version=version+1 WHERE id=1');
    this.db.exec('COMMIT');
    return asOfSnapshot(this.db,input.asOf||new Date().toISOString().slice(0,10));
   }catch(error){this.db.exec('ROLLBACK');throw error;}
  });
  this.queue=job.catch(()=>{});
  return job;
 }
 async close(){await this.queue;if(this.ownsDatabase)this.db.close();}
}
