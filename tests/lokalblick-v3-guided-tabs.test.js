import test from 'node:test';
import assert from 'node:assert/strict';
import {readGuidedRows} from '../frontend/v3/guided-source.js';
import {preparePropertyStage} from '../frontend/v3/property-stage.js';
import {preparePeopleStage} from '../frontend/v3/people-stage.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';

const tab=(name,header,...rows)=>({name,rows:[header,...rows]});
const ids=()=>{let k=0;return()=> 'id-'+(++k);};
test('FörvaltningsNr takes precedence over FastighetsNr in mixed source sheets',()=>{
 const mixed=tab('Lokallista',['FastighetsNr','FörvaltningsNr','Fastighetsnamn','Adress','Ort','Avtalsnummer'],
  ['EXT-009','101','Huset','Storgatan 1','Malmö','A-1']);
 const rows=readGuidedRows([mixed]);
 assert.equal(rows[0].fields.property_number,'101');
 const p=preparePropertyStage([mixed],{properties:[]},{makeId:ids()});
 assert.equal(p.commands[0].fields.management_object_number,'101');
});
test('separate company, person and tenant sheets use their explicit columns',()=>{
 const sheets=[
  tab('Parter',['Namn','Organisationsnummer','Typ'],['Samordning AB','556001-0202','Lokalsamordnare']),
  tab('Personer',['Namn','E-post','Part','Telefon'],['Eva Svensson','eva@example.test','Samordning AB','0701234567']),
  tab('Hyresgäster',['Avtalsnummer','Namn','OrgNr'],['AV1','Hyresgäst AB','556001-0101'])
 ];
 const rows=readGuidedRows(sheets);
 assert.equal(rows[0].fields.party_name,'Samordning AB');
 assert.equal(rows[1].fields.person_party,'Samordning AB');
 assert.equal(rows[1].fields.person_name,'Eva Svensson');
 assert.equal(rows[1].fields.person_phone,'0701234567');
 assert.equal(rows[2].fields.tenant_name,'Hyresgäst AB');
});
test('independent company/person sheets link safely and unique lease number resolves tenant property',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let s=await store.readSnapshot('2026-11-03');
  s=await store.mutate({version:s.version,asOf:s.asOf,commands:[
   {action:'createProperty',id:'p',fields:{name:'Huset',management_object_number:'101'}},
   {action:'createObject',id:'o',fields:{property_id:'p',object_number:'101-001',valid_from:'2020-01-01'}},
   {action:'createAgreement',id:'a',fields:{object_id:'o',agreement_number:'AV1',valid_from:'2020-01-01'}}
  ]});
  const sheets=[
   tab('Personer',['Namn','E-post','Part','Telefon'],['Eva Svensson','eva@example.test','Samordning AB','0701234567']),
   tab('Parter',['Namn','Organisationsnummer','Typ'],['Samordning AB','556001-0202','Lokalsamordnare']),
   tab('Hyresgäster',['Avtalsnummer','Namn','OrgNr'],['AV1','Hyresgäst AB','556001-0101'])
  ];
  const planned=preparePeopleStage(sheets,s,{makeId:ids()});
  assert.equal(planned.issues.length,0,planned.issues.map(x=>x.message).join('; '));
  assert.equal(planned.stats.parties,2);
  assert.equal(planned.stats.people,1);
  assert.equal(planned.stats.memberships,1);
  assert.equal(planned.stats.roles,1);
  for(const unit of planned.units)s=await store.mutate({version:s.version,asOf:s.asOf,commands:unit.commands});
  const person=s.people.find(p=>p.email==='eva@example.test');
  const employer=s.parties.find(p=>p.name==='Samordning AB');
  const tenant=s.parties.find(p=>p.name==='Hyresgäst AB');
  assert.equal(person.phone,'0701234567');
  assert(s.partyPeople.some(l=>l.party_id===employer.id&&l.person_id===person.id));
  assert(s.stakeholderAssignments.some(l=>l.role_code==='tenant'&&l.agreement_id==='a'&&l.party_id===tenant.id));
  const retry=preparePeopleStage(sheets,s);
  assert.equal(retry.commands.length,0,retry.issues.map(x=>x.message).join('; '));
 }finally{db.close();}
});
test('unsorted contract rows give manager earliest valid membership date',()=>{
 const s={asOf:'2026-11-03',properties:[{id:'p',management_object_number:'101'}],
  objects:[{id:'o',property_id:'p'}],
  agreements:[{id:'a-new',agreement_number:'A-NEW',object_id:'o',original_start_on:'2025-01-01'},
   {id:'a-old',agreement_number:'A-OLD',object_id:'o',original_start_on:'2020-01-01'}],
  parties:[],people:[],partyPeople:[],stakeholderAssignments:[]};
 const rows=tab('Lokallista',['Fastighetsnummer','Avtalsnummer','Förvaltare','Förvaltarbolag','Förvaltare epost'],
  ['101','A-NEW','Eva Svensson','Förvaltningsbolag AB','eva@example.test'],
  ['101','A-OLD','Eva Svensson','Förvaltningsbolag AB','eva@example.test']);
 const p=preparePeopleStage([rows],s,{makeId:ids()});
 assert.equal(p.stats.people,1);
 assert.equal(p.stats.memberships,1);
 assert.equal(p.stats.roles,1);
 assert.equal(p.commands.find(c=>c.action==='linkPersonParty').fields.valid_from,'2020-01-01');
 assert.equal(p.commands.find(c=>c.action==='setRole').fields.valid_from,'2020-01-01');
});
