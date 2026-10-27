import test from 'node:test';
import assert from 'node:assert/strict';
import { openMemoryDatabase } from '../backend/lokaler/v3/database.js';
import { CoreV3Store } from '../backend/lokaler/v3/core-store.js';
import { createServer } from '../backend/lokaler/server.mjs';

async function setup(){
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 const server=createServer(store,{v3:true});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const read=async(date='2026-10-27')=>{
  const r=await fetch(base+'/api/v3/core?date='+date);assert.equal(r.status,200);return r.json();
 };
 const save=async(command,version)=>{
  const response=await fetch(base+'/api/v3/core',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,asOf:'2026-10-27',command})});
  return {status:response.status,data:await response.json()};
 };
 const close=async()=>{await new Promise(resolve=>server.close(resolve));db.close()};
 return {db,read,save,close,base};
}
test('v3 API creates properties, objects and historical object versions atomically',async()=>{
 const s=await setup();try{
  let x=await s.read();assert.equal(x.schemaVersion,3);assert.equal(x.properties.length,0);assert.equal(x.version,0);
  x=(await s.save({action:'createProperty',fields:{name:'Fastighet Alfa',address:'Storgatan 1'}},x.version)).data;
  assert.equal(x.properties.length,1);
  const propertyId=x.properties[0].id;
  const create=(await s.save({action:'createObject',fields:{property_id:propertyId,object_number:'101',valid_from:'2020-01-01',area:200}},x.version));
  assert.equal(create.status,200);x=create.data;
  const obj=x.objects[0];assert.equal(obj.currentVersion.area,200);
  x=(await s.save({action:'reviseObject',id:obj.id,fields:{valid_from:'2026-07-01',area:250}},x.version)).data;
  assert.equal(x.objects[0].versions.length,2);assert.equal(x.objects[0].currentVersion.area,250);
  const old=await s.read('2025-01-01');assert.equal(old.objects[0].currentVersion.area,200);
  const version=x.version;
  const stale=await s.save({action:'reviseObject',id:obj.id,fields:{valid_from:'2027-01-01',area:300}},version-1);
  assert.equal(stale.status,409);
  assert.equal((await s.read()).objects[0].versions.length,2);
  const invalid=await s.save({action:'createObject',fields:{property_id:'missing',object_number:'bad',valid_from:'2025-01-01',area:5}},version);
  assert.equal(invalid.status,400);assert.equal((await s.read()).objects.length,1);
 }finally{await s.close();}
});
test('v3 API connects parties, people, roles with dated inheritance and agreements',async()=>{
 const s=await setup();try{
  let x=await s.read();
  const apply=async command=>{const result=await s.save(command,x.version);assert.equal(result.status,200,JSON.stringify(result.data));x=result.data};
  await apply({action:'createParty',fields:{name:'Ägarbolaget'}});
  await apply({action:'createParty',fields:{name:'Hyresgästen'}});
  await apply({action:'createPerson',fields:{name:'Anna'}});
  await apply({action:'createProperty',fields:{name:'Huset'}});
  const owner=x.parties.find(p=>p.name==='Ägarbolaget'),tenant=x.parties.find(p=>p.name==='Hyresgästen'),
        person=x.people[0],property=x.properties[0];
  await apply({action:'linkPersonParty',fields:{party_id:owner.id,person_id:person.id,valid_from:'2020-01-01'}});
  await apply({action:'setRole',fields:{property_id:property.id,role_code:'owner',party_id:owner.id,valid_from:'2020-01-01'}});
  await apply({action:'setRole',fields:{property_id:property.id,role_code:'owner_contact',party_id:owner.id,person_id:person.id,valid_from:'2020-01-01'}});
  await apply({action:'createObject',fields:{property_id:property.id,object_number:'101',valid_from:'2020-01-01',area:120}});
  assert.equal(x.objects[0].stakeholders.owner_contact[0].personId,person.id);
  assert.equal(x.objects[0].stakeholders.owner_contact[0].inherited,true);
  await apply({action:'createAgreement',fields:{agreement_number:'A-101',object_id:x.objects[0].id,valid_from:'2022-01-01'}});
  const agreementId=x.agreements[0].id;
  await apply({action:'setRole',fields:{agreement_id:agreementId,role_code:'tenant',party_id:tenant.id,valid_from:'2022-01-01'}});
  assert.equal(x.agreements[0].stakeholders.owner_contact[0].personId,person.id);
  assert.equal(x.agreements[0].stakeholders.tenant[0].partyId,tenant.id);
  await apply({action:'reviseAgreement',id:agreementId,fields:{valid_from:'2026-01-01',usage:'Kontor'}});
  assert.equal(x.agreements[0].versions.length,2);
  assert.equal(x.agreements[0].currentVersion.usage,'Kontor');
  const history=await s.read('2024-01-01');assert.equal(history.agreements[0].currentVersion.valid_from,'2022-01-01');
  await apply({action:'addAgreementItem',fields:{agreement_id:agreementId,type:'base',name:'Bashyra',base_amount:120000,valid_from:'2026-01-01'}});
  assert.equal(x.agreementItems[0].base_amount,120000);
  const invalid=await s.save({action:'setRole',fields:{agreement_id:agreementId,role_code:'tenant_contact',party_id:tenant.id,person_id:person.id,valid_from:'2026-01-01'}},x.version);
  assert.equal(invalid.status,400);assert.match(invalid.data.error,/partkoppling/);
  const old=await fetch(s.base+'/api/lokaler');assert.equal(old.status,404);
 }finally{await s.close();}
});
test('v3 local-only API rejects requests with a foreign host or cross-site origin',async()=>{
 const s=await setup();try{
  const external=await fetch(s.base+'/api/v3/core',{headers:{Origin:'https://example.com'}});
  assert.equal(external.status,403);
  const config=await fetch(s.base+'/api/runtime-config');
  assert.equal(config.status,200);
  assert.match(await config.text(),/databaseVersion:3/);
  const page=await fetch(s.base+'/frontend/v3/index.html');
  assert.equal(page.status,200);
  assert.match(await page.text(),/data-view="overview"/);
 }finally{await s.close();}
});
