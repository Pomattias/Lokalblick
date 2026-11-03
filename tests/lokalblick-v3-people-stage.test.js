import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePeopleStage} from '../frontend/v3/people-stage.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';
const source=(...rows)=>({name:'Lokallista',rows:[[
 'Fastighetsnummer','Avtalsnummer','Hyresgäst','Hyresgäst orgnr',
 'Fastighetsägare','Fastighetsägare orgnr',
 'Förvaltare','Förvaltarbolag','Förvaltare epost',
 'Lokalsamordnare','Lokalsamordnare organisation','Lokalsamordnare epost',
 'Hyresgästkontakt','Hyresgästkontakt epost',
 'Fastighetsägarkontakt','Fastighetsägarkontakt epost'
],...rows]});
const values=(contract='AV1',tenant='Hyresgäst AB')=>[
 '101',contract,tenant,'556001-1111','Ägarbolaget AB','556002-2222',
 'Anna Förvaltare','Förvaltning AB','anna@forvaltning.test',
 'Erik Lokalsamordnare','Samordning AB','erik@samordning.test',
 'Eva Kontakt','eva@tenant.test','Olle Kontakt','olle@owner.test'
];
const sample=()=>({asOf:'2026-11-03',properties:[{id:'p',name:'Huset',
 management_object_number:'101'}],objects:[{id:'o',property_id:'p',
 object_number:'101-001'}],agreements:[{id:'a',agreement_number:'AV1',
 object_id:'o',original_start_on:'2020-01-01'}],
 parties:[],people:[],partyPeople:[],stakeholderAssignments:[]});
const ids=()=>{let n=0;return()=>'n'+(++n)};
test('tenant, owner, coordinator and manager are linked to verified homes and persons to parties',()=>{
 const result=preparePeopleStage([source(values())],sample(),{makeId:ids()});
 assert.equal(result.stats.parties,4);
 assert.equal(result.stats.people,4);
 assert.equal(result.stats.memberships,4);
 assert.equal(result.stats.roles,6);
 assert.equal(result.issues.length,0,result.issues.map(x=>x.message).join('\n'));
 assert.deepEqual(result.commands.filter(c=>c.action==='setRole').map(c=>c.fields.role_code),
  ['tenant','owner','asset_manager','coordinator','tenant_contact','owner_contact']);
 assert(result.commands.filter(c=>c.action==='setRole'&&c.fields.role_code==='tenant')
  .every(c=>c.fields.agreement_id==='a'));
 assert(result.commands.filter(c=>c.action==='setRole'&&c.fields.role_code==='owner')
  .every(c=>c.fields.property_id==='p'));
});
test('uncertain person affiliation never guesses another company',()=>{
 const row=values();
 row[7]=''; // manager company absent
 const r=preparePeopleStage([source(row)],sample(),{makeId:ids()});
 assert.equal(r.commands.some(c=>c.action==='createPerson'&&c.fields.name==='Anna Förvaltare'),false);
 assert.equal(r.commands.some(c=>c.action==='setRole'&&c.fields.role_code==='asset_manager'),false);
 assert.match(r.issues.map(x=>x.message).join(' '),/Förvaltarens organisation saknas/);
 assert.equal(r.commands.some(c=>c.action==='setRole'&&c.fields.role_code==='tenant'),true);
});
test('existing role is kept if a different party is supplied',()=>{
 const existing={id:'old',name:'Tidigare ägare AB',organization_number:'556999-9999'};
 const old={id:'role',property_id:'p',role_code:'owner',party_id:'old',
  valid_from:'2019-01-01',valid_to:null};
 const result=preparePeopleStage([source(values())],{...sample(),parties:[existing],
  stakeholderAssignments:[old]},{makeId:ids()});
 assert(result.issues.some(x=>/skrivs inte över/.test(x.message)));
 assert.equal(result.commands.some(c=>c.action==='setRole'&&c.fields.role_code==='owner'),false);
});
test('repeat import does not create duplicate parties, people, links or assignments',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let s=await store.readSnapshot('2026-11-03');
  s=await store.mutate({version:s.version,asOf:s.asOf,commands:[
   {action:'createProperty',id:'p',fields:{name:'Huset',management_object_number:'101'}},
   {action:'createObject',id:'o',fields:{property_id:'p',object_number:'101-001',valid_from:'2019-01-01'}},
   {action:'createAgreement',id:'a',fields:{object_id:'o',agreement_number:'AV1',valid_from:'2020-01-01'}}
  ]});
  const plan=preparePeopleStage([source(values())],s);
  assert.equal(plan.issues.length,0,plan.issues.map(x=>x.message).join('\n'));
  // Respect the dependency order: parties and people before links and roles.
  for(const unit of plan.units)
   s=await store.mutate({version:s.version,asOf:s.asOf,commands:unit.commands});
  assert.equal(s.parties.length,4);
  assert.equal(s.people.length,4);
  assert.equal(s.partyPeople.length,4);
  assert.equal(s.stakeholderAssignments.length,6);
  const tenantRole=s.stakeholderAssignments.find(x=>x.role_code==='tenant');
  assert.equal(tenantRole.agreement_id,'a');
  const owner=s.stakeholderAssignments.find(x=>x.role_code==='owner');
  assert.equal(owner.property_id,'p');
  const again=preparePeopleStage([source(values())],s);
  assert.equal(again.commands.length,0,again.issues.map(x=>x.message).join('\n'));
 }finally{db.close();}
});
test('several leases from the same tenant reuse the party and do not duplicate owner',()=>{
 const s=sample();
 s.agreements.push({id:'a2',agreement_number:'AV2',object_id:'o',original_start_on:'2022-01-01'});
 const p=preparePeopleStage([source(values(),values('AV2'))],s,{makeId:ids()});
 assert.equal(p.stats.parties,4);
 assert.equal(p.stats.people,4);
 assert.equal(p.commands.filter(c=>c.action==='setRole'&&c.fields.role_code==='owner').length,1);
 assert.equal(p.commands.filter(c=>c.action==='setRole'&&c.fields.role_code==='tenant').length,2);
});
