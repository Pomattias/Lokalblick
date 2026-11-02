import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareSmartImport,suggestImportMapping} from '../frontend/v3/smart-import.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';

const headers=['Fastighetsnummer','Fastighetsnamn','Adress','Ort','Objektnummer','Yta',
 'Avtalsnummer','Startdatum','Slutdatum','Hyresgäst','Hyresgäst orgnr',
 'Fastighetsägare','Förvaltare','Bashyra','Årshyra totalt'];
const row=(agreement='A-101',tenant='Butik AB',org='556001-1111',from='2025-01-01')=>[
 'SF1213','Kvarteret','Storgatan 1','Malmö','SF1213-001','100',
 agreement,from,'2029-12-31',tenant,org,'Ägaren AB','Anna Andersson','120000','120000'];
const source=(rows=[row()])=>({headers,rows});
const plan=(data,snapshot,opts={})=>prepareSmartImport(data,snapshot,{scope:'core',...opts});
const blank=()=>({asOf:'2026-11-02',properties:[],objects:[],agreements:[],
 parties:[],stakeholderAssignments:[]});

test('core import maps only approved columns and excludes owners, manager, prices, summaries',()=>{
 const p=plan(source(),blank(),{mapping:suggestImportMapping(headers)});
 assert.deepEqual(p.errors,[]);
 assert.deepEqual(p.commands.map(c=>c.action),[
  'createProperty','createObject','createAgreement','createParty','setRole']);
 assert.equal(p.stats.created,1);
 assert(p.excludedColumns.includes(11));
 assert(p.excludedColumns.includes(12));
 assert(p.excludedColumns.includes(13));
 assert(p.excludedColumns.includes(14));
 assert(!p.commands.some(c=>['createPerson','addAgreementItem','createIssue','createCost'].includes(c.action)));
});

test('full property-object-agreement-tenant relationship is saved atomically and safe on reimport',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  const first=await store.readSnapshot('2026-11-02');
  const prepared=plan(source(),first);
  assert.equal(prepared.errors.length,0,prepared.errors.join('; '));
  const saved=await store.mutate({version:first.version,asOf:'2026-11-02',commands:prepared.commands});
  assert.equal(saved.properties.length,1);
  assert.equal(saved.objects.length,1);
  assert.equal(saved.agreements.length,1);
  assert.equal(saved.parties.length,1);
  assert.equal(saved.people.length,0);
  assert.equal(saved.agreementItems.length,0);
  assert.equal(saved.issues.length,0);
  assert.equal(saved.objects[0].property_id,saved.properties[0].id);
  assert.equal(saved.agreements[0].object_id,saved.objects[0].id);
  const tenantRole=saved.stakeholderAssignments.find(a=>a.role_code==='tenant');
  assert.equal(tenantRole.agreement_id,saved.agreements[0].id);
  assert.equal(tenantRole.party_id,saved.parties[0].id);
  const repeat=plan(source(),saved);
  assert.deepEqual(repeat.errors,[]);
  assert.equal(repeat.commands.length,0);
  assert.equal(repeat.records[0].status,'matched');
 }finally{db.close();}
});

test('new agreement shares existing property and object without duplicating tenants',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  const first=await store.readSnapshot('2026-11-02');
  const start=plan(source(),first);
  const saved=await store.mutate({version:first.version,asOf:'2026-11-02',commands:start.commands});
  const next=plan(source([row('A-102','Butik AB','556001-1111','2026-01-01')]),saved);
  assert.deepEqual(next.errors,[]);
  assert.deepEqual(next.commands.map(c=>c.action),['createAgreement','setRole']);
  const updated=await store.mutate({version:saved.version,asOf:'2026-11-02',commands:next.commands});
  assert.equal(updated.properties.length,1);
  assert.equal(updated.objects.length,1);
  assert.equal(updated.agreements.length,2);
  assert.equal(updated.parties.length,1);
  assert.equal(updated.stakeholderAssignments.filter(x=>x.role_code==='tenant').length,2);
 }finally{db.close();}
});

test('duplicates and conflicting tenant identities require review, never overwrite',()=>{
 const s=blank();
 assert.match(plan(source([row(),row()]),s).errors.join(' '),/flera gånger i filen/);
 const s2=blank();
 s2.parties=[{id:'part',name:'Annan AB',organization_number:'556001-1111',kind:'tenant'}];
 const conflicted=plan(source(),s2);
 assert.match(conflicted.errors.join(' '),/olika parter/);
 assert.equal(conflicted.stats.review,1);
});

test('uncertain object mapping is blocked until selected explicitly',()=>{
 const p=blank();p.properties=[{id:'p',name:'Kvarteret',address:'Storgatan 1',city:'Malmö',management_object_number:'SF1213'}];
 const record=row();record[4]='';
 const uncertain=plan(source([record]),p);
 assert.match(uncertain.errors.join(' '),/Objekt kan inte avgöras/);
 const approved=plan(source([record]),p,{objectChoices:{0:'@new'},makeId:(()=>{let n=0;return()=> 'new'+(++n);})()});
 assert.deepEqual(approved.errors,[]);
 assert.equal(approved.commands.find(c=>c.action==='createObject').fields.object_number,'SF1213-001');
});

test('out-of-order agreements use earliest evidenced object date',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  const original=await store.readSnapshot('2026-11-02');
  const data=source([row('A-LATE','Butik AB','556001-1111','2026-01-01'),
   row('A-EARLY','Annat AB','556001-2222','2020-01-01')]);
  const planned=plan(data,original);
  assert.deepEqual(planned.errors,[],planned.errors.join('; '));
  assert.equal(planned.commands.filter(c=>c.action==='createObject').length,1);
  assert.equal(planned.commands.find(c=>c.action==='createObject').fields.valid_from,'2020-01-01');
  const saved=await store.mutate({version:original.version,asOf:'2026-11-02',commands:planned.commands});
  assert.equal(saved.agreements.length,2);
  assert.equal(saved.objects.length,1);
 }finally{db.close();}
});

test('standalone tenant sheet imports only a tenant party and never creates an unverified link',()=>{
 const data={headers:['Namn','Organisationsnummer'],rows:[['Kafé AB','556889-1111']]};
 const one=plan(data,blank(),{mapping:['tenant_name','tenant_org']});
 assert.deepEqual(one.errors,[]);
 assert.deepEqual(one.commands.map(x=>x.action),['createParty']);
 assert.equal(one.commands[0].fields.kind,'tenant');
 const saved=blank();
 saved.parties=[{id:'tenant',name:'Kafé AB',organization_number:'556889-1111',kind:'tenant'}];
 const repeated=plan(data,saved,{mapping:['tenant_name','tenant_org']});
 assert.deepEqual(repeated.errors,[]);
 assert.equal(repeated.commands.length,0);
});

test('preview does not mutate existing party when proposing missing organization number',()=>{
 const before=blank();
 before.parties=[{id:'tenant',name:'Butik AB',organization_number:null,kind:'tenant'}];
 const sourceData=source();
 const untouched=JSON.stringify(before);
 const prepared=plan(sourceData,before);
 assert.equal(prepared.errors.length,0,prepared.errors.join('; '));
 assert(prepared.commands.some(c=>c.action==='updateParty'&&c.id==='tenant'));
 assert.equal(JSON.stringify(before),untouched);
});
