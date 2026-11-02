import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestImportMapping,inferImportColumn,rankImportSheets,prepareSmartImport} from '../frontend/v3/smart-import.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';
const headers=['Fastighetsnummer','Fastighetsnamn','Objektnummer','Yta','Avtalsnummer','Startdatum',
 'Hyresgäst','Hyresgäst orgnr','Fastighetsägare','Fastighetsägare orgnr','Förvaltare',
 'Bashyra','Bashyra basår','Tillägg','Tillägg basår','VA','VA basår'];
const values=(property='SF1213',agreement='A-101')=>[
 property,'Kvarteret','SF1213-001','100',agreement,'2025-01-01',
 'Butik AB','556001-1111','Ägaren AB','556001-2222','Anna Andersson',
 '120 000','2025','12 000','2024','6 000','2025'
];
const source=(r=[values()])=>({headers,rows:r});
const snapshot=(add={})=>({asOf:'2026-11-02',properties:[],objects:[],agreements:[],
 parties:[],people:[],partyPeople:[],stakeholderAssignments:[],agreementItems:[],...add});
test('automatic column mapping resolves property, object, lease, tenant, owner, manager and separate prices and base years',()=>{
 const m=suggestImportMapping(headers);
 assert.deepEqual(m,['property_number','property_name','object_number','area','agreement_number','valid_from',
  'tenant_name','tenant_org','owner_name','owner_org','manager_name',
  'price.base.amount','price.base.year','price.addition.amount','price.addition.year',
  'price.water.amount','price.water.year']);
 assert.equal(inferImportColumn('Tillägg 2 basår'),'price.addition2.year');
 assert.equal(inferImportColumn('Värme KPI-bastal'),'price.heat.index');
 const ranked=rankImportSheets([{name:'Kommentarer',rows:[['Anteckning'],['A']]},
  {name:'Lokallista',rows:[headers,values()]}]);
 assert.equal(ranked[0].name,'Lokallista');
});
test('one mixed source row creates the correct normalized entities, roles and financial items in one transaction',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  const s=await store.readSnapshot('2026-11-02');
  const prepared=prepareSmartImport(source(),s);
  assert.equal(prepared.errors.length,0,prepared.errors.join('\n'));
  assert.equal(prepared.stats.created,1);
  assert.deepEqual(prepared.commands.map(c=>c.action),[
   'createProperty','createObject','createAgreement',
   'createParty','createParty','createPerson','linkPersonParty',
   'setRole','setRole','setRole','addAgreementItem','addAgreementItem','addAgreementItem'
  ]);
  const saved=await store.mutate({version:s.version,asOf:'2026-11-02',commands:prepared.commands});
  assert.equal(saved.properties.length,1);
  assert.equal(saved.objects.length,1);
  assert.equal(saved.agreements.length,1);
  assert.equal(saved.parties.length,2);
  assert.equal(saved.people.length,1);
  assert.equal(saved.agreementItems.length,3);
  const property=saved.properties[0],obj=saved.objects[0],agreement=saved.agreements[0];
  assert.equal(property.management_object_number,'SF1213');
  assert.equal(obj.property_id,property.id);
  assert.equal(agreement.object_id,obj.id);
  const tenant=saved.parties.find(x=>x.name==='Butik AB'),owner=saved.parties.find(x=>x.name==='Ägaren AB');
  const manager=saved.people.find(x=>x.name==='Anna Andersson');
  assert.equal(saved.stakeholderAssignments.find(x=>x.role_code==='tenant').agreement_id,agreement.id);
  assert.equal(saved.stakeholderAssignments.find(x=>x.role_code==='tenant').party_id,tenant.id);
  const ownerRole=saved.stakeholderAssignments.find(x=>x.role_code==='owner');
  assert.equal(ownerRole.property_id,property.id);assert.equal(ownerRole.party_id,owner.id);
  const managerRole=saved.stakeholderAssignments.find(x=>x.role_code==='asset_manager');
  assert.equal(managerRole.property_id,property.id);
  assert.equal(managerRole.party_id,owner.id);
  assert.equal(managerRole.person_id,manager.id);
  assert.equal(saved.partyPeople[0].person_id,manager.id);
  assert.equal(saved.partyPeople[0].party_id,owner.id);
  for(const [type,amount,year] of [['base',120000,2025],['addition',12000,2024],['water',6000,2025]]){
   const item=saved.agreementItems.find(x=>x.type===type);
   assert.equal(item.agreement_id,agreement.id);
   assert.equal(item.base_amount,amount);
   assert.equal(item.base_year,year);
   assert.equal(item.valid_from,'2025-01-01');
  }
  const repeat=prepareSmartImport(source(),saved);
  assert.deepEqual(repeat.errors,[]);
  assert.equal(repeat.commands.length,0);
  assert.equal(repeat.records[0].status,'matched');
 }finally{db.close();}
});
test('new lease on existing physical object attaches to correct parent and does not duplicate property, owner, person',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);try{
  const first=await store.readSnapshot('2026-11-02');
  const original=prepareSmartImport(source(),first);
  const saved=await store.mutate({version:first.version,asOf:'2026-11-02',commands:original.commands});
  const next=values('SF1213','A-102');next[5]='2026-01-01';next[6]='Nästa Butik AB';next[7]='556001-3333';
  const planned=prepareSmartImport(source([next]),saved);
  assert.equal(planned.errors.length,0,planned.errors.join('\n'));
  const result=await store.mutate({version:saved.version,asOf:'2026-11-02',commands:planned.commands});
  assert.equal(result.properties.length,1);assert.equal(result.objects.length,1);
  assert.equal(result.agreements.length,2);assert.equal(result.parties.length,3);assert.equal(result.people.length,1);
  assert(result.agreements.every(a=>a.object_id===result.objects[0].id));
  assert.equal(result.agreementItems.length,6);
 }finally{db.close();}
});
test('unknown physical object with no object number requires explicit selection even if property exists',()=>{
 const s=snapshot({properties:[{id:'p',name:'Kvarteret',management_object_number:'SF1213'}]});
 const row=values();row[2]='';
 const blocked=prepareSmartImport(source([row]),s);
 assert.equal(blocked.stats.review,1);
 assert.match(blocked.errors.join(' '),/Objekt kan inte avgöras/);
 const chosen=prepareSmartImport(source([row]),s,{objectChoices:{0:'@new'},makeId:(()=>{let n=0;return()=> 'new'+(++n)})()});
 assert.equal(chosen.errors.length,0,chosen.errors.join(' '));
 assert.equal(chosen.commands.find(c=>c.action==='createObject').fields.object_number,'SF1213-001');
});
test('conflicting rental prices on an existing lease are flagged and never silently overwritten',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);try{
  const a=await store.readSnapshot('2026-11-02');
  const p=prepareSmartImport(source(),a);
  const saved=await store.mutate({version:a.version,asOf:'2026-11-02',commands:p.commands});
  const changed=values();changed[11]='140 000';
  const result=prepareSmartImport(source([changed]),saved);
  assert.equal(result.stats.review,1);
  assert.match(result.errors.join(' '),/Avtalspriset Bashyra skiljer/);
  assert.equal(result.commands.filter(c=>c.action==='addAgreementItem').length,0);
 }finally{db.close();}
});
test('conflicting owner on same property is not automatically replaced',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);try{
  const a=await store.readSnapshot('2026-11-02');
  const p=prepareSmartImport(source(),a);
  const saved=await store.mutate({version:a.version,asOf:'2026-11-02',commands:p.commands});
  const changed=values();changed[8]='Annat Ägarbolag';changed[9]='556001-9999';
  const result=prepareSmartImport(source([changed]),saved);
  assert.match(result.errors.join(' '),/Befintlig roll owner/);
 }finally{db.close();}
});
test('manual column override corrects a source header without affecting other field proposals',()=>{
 const changed=[...headers];changed[0]='FastighetsID från ekonomisystemet';
 const inferred=suggestImportMapping(changed);
 assert.equal(inferred[0],'');
 const fixed=suggestImportMapping(changed,{0:'property_number'});
 assert.equal(fixed[0],'property_number');
 const result=prepareSmartImport({headers:changed,rows:[values()]},snapshot(),{mapping:fixed});
 assert.equal(result.errors.length,0,result.errors.join(' '));
});
test('an unexpected manager without owner or manager organization cannot silently become a property manager',()=>{
 const arr=values();arr[8]='';arr[9]='';
 const p=prepareSmartImport(source([arr]),snapshot());
 assert.match(p.errors.join(' '),/saknar tillhörande organisation/);
});
test('additional additions have distinct slots, amounts, basår and typed price categories',()=>{
 const h=['Fastighetsnummer','Fastighetsnamn','Objektnummer','Avtalsnummer','Startdatum',
  'Bashyra','Bashyra basår','Tillägg','Tillägg basår','Tillägg 2','Tillägg 2 basår',
  'Värme','Värme basår'];
 const row=['F12','Huset','F12-001','F12-001-01','2024-01-01','50000','2024','5000','2024','800','2023','4500','2022'];
 const r=prepareSmartImport({headers:h,rows:[row]},snapshot());
 assert.equal(r.errors.length,0,r.errors.join(' '));
 const prices=r.commands.filter(x=>x.action==='addAgreementItem').map(x=>x.fields);
 assert.deepEqual(prices.map(x=>[x.type,x.name,x.base_amount,x.base_year]),[
  ['base','Bashyra',50000,2024],['addition','Tillägg',5000,2024],
  ['addition','Tillägg 2',800,2023],['heat','Värme',4500,2022]
 ]);
});
test('incomplete indexed rent evidence requires review rather than inventing KPI settings',()=>{
 const h=['Fastighetsnummer','Fastighetsnamn','Objektnummer','Avtalsnummer','Startdatum',
  'Bashyra','Bashyra basår','Bashyra uppräkning'];
 const row=['F12','Huset','F12-001','F12-001-01','2024-01-01','50000','2024','KPI'];
 const r=prepareSmartImport({headers:h,rows:[row]},snapshot());
 assert.match(r.errors.join(' '),/saknar KPI-bastal eller indexandel/);
});
