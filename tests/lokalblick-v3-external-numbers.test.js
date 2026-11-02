import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openMemoryDatabase,createFreshDatabase,openExistingDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';
import {suggestImportMapping,prepareSmartImport} from '../frontend/v3/smart-import.js';
const at='2026-11-02';
const row=(number,external,system='Stadsfastigheter')=>
 ({headers:['FörvaltningsNr','FastighetsNr','Fastighetsnamn','Källsystem'],
 rows:[[number,external,'GRÖNDAL 1',system]]});

test('two number columns identify one property and link named external number with stable internal ID',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  const src=row('1600','SF1600');
  assert.deepEqual(suggestImportMapping(src.headers),['property_number','external_property_number','property_name','external_system']);
  const start=await store.readSnapshot(at),plan=prepareSmartImport(src,start);
  assert.deepEqual(plan.errors,[]);
  assert.deepEqual(plan.commands.map(c=>c.action),['createProperty','addPropertyExternalNumber']);
  const saved=await store.mutate({version:start.version,asOf:at,commands:plan.commands});
  assert.equal(saved.properties.length,1);
  assert.equal(saved.properties[0].name,'GRÖNDAL 1');
  assert.equal(saved.properties[0].management_object_number,'1600');
  assert.equal(saved.properties[0].externalNumbers.length,1);
  assert.equal(saved.properties[0].externalNumbers[0].external_number,'SF1600');
  assert.equal(saved.properties[0].externalNumbers[0].source_system,'Stadsfastigheter');
  assert.equal(saved.properties[0].externalNumbers[0].property_id,saved.properties[0].id);
  const again=prepareSmartImport(src,saved);
  assert.deepEqual(again.errors,[]);
  assert.equal(again.commands.length,0,'the same source must never duplicate property or alias');
  const known=prepareSmartImport({headers:['Externt FastighetsNr','Källsystem'],rows:[['SF1600','Stadsfastigheter']]},saved);
  assert.deepEqual(known.errors,[]);
  assert.equal(known.commands.length,0);
  assert.equal(known.records[0].propertyId,saved.properties[0].id);
 }finally{db.close();}
});
test('one externally labelled property number can be attached to a pre-existing property without modifying its objects or agreements',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let state=await store.readSnapshot(at);
  state=await store.mutate({version:state.version,asOf:at,command:{action:'createProperty',fields:{name:'GRÖNDAL 1',management_object_number:'1600'}}});
  const property=state.properties[0];
  state=await store.mutate({version:state.version,asOf:at,command:{action:'createObject',fields:{property_id:property.id,object_number:'1600-001',valid_from:'2024-01-01',area:100}}});
  const object=state.objects[0];
  state=await store.mutate({version:state.version,asOf:at,command:{action:'createAgreement',fields:{object_id:object.id,agreement_number:'A1',valid_from:'2024-01-01'}}});
  const agreement=state.agreements[0];
  const plan=prepareSmartImport(row('1600','SF1600'),state);
  assert.deepEqual(plan.errors,[]);
  assert.deepEqual(plan.commands.map(c=>c.action),['addPropertyExternalNumber']);
  const saved=await store.mutate({version:state.version,asOf:at,commands:plan.commands});
  assert.equal(saved.properties[0].id,property.id);
  assert.equal(saved.objects[0].property_id,property.id);
  assert.equal(saved.objects[0].id,object.id);
  assert.equal(saved.agreements[0].object_id,object.id);
  assert.equal(saved.agreements[0].id,agreement.id);
 }finally{db.close();}
});
test('two source numbers that point to different properties are blocked in automatic import',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);try{
  let s=await store.readSnapshot(at);
  const cmd=[{action:'createProperty',fields:{name:'GRÖNDAL 1',management_object_number:'1600'}},
   {action:'createProperty',fields:{name:'ANNA 2',management_object_number:'1700'}}];
  s=await store.mutate({version:s.version,asOf:at,commands:cmd});
  const target=s.properties.find(p=>p.management_object_number==='1700');
  s=await store.mutate({version:s.version,asOf:at,command:{action:'addPropertyExternalNumber',
   fields:{property_id:target.id,source_system:'Stadsfastigheter',external_number:'SF1600'}}});
  const preview=prepareSmartImport(row('1600','SF1600'),s);
  assert.match(preview.errors.join(' '),/pekar på olika fastigheter/);
  assert.equal(preview.commands.length,0);
  const current=await store.readSnapshot(at);
  assert.equal(current.propertyExternalNumbers[0].property_id,target.id);
 }finally{db.close();}
});
test('an external identifier requires source name, known aliases cannot be hijacked, and independent sources may reuse the same number',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);try{
  let s=await store.readSnapshot(at);
  s=await store.mutate({version:s.version,asOf:at,commands:[
   {action:'createProperty',fields:{name:'Ett',management_object_number:'1600'}},
   {action:'createProperty',fields:{name:'Två',management_object_number:'1700'}}]});
  const first=s.properties[0],second=s.properties[1];
  assert.match(prepareSmartImport(row('1600','SF1600',''),s).errors.join(' '),/källsystem/i);
  s=await store.mutate({version:s.version,asOf:at,command:{action:'addPropertyExternalNumber',fields:{
   property_id:first.id,source_system:'System A',external_number:'SF1600'}}});
  await assert.rejects(store.mutate({version:s.version,asOf:at,command:{action:'addPropertyExternalNumber',fields:{
   property_id:second.id,source_system:'System A',external_number:'sf1600'}}}),/redan kopplat/);
  const after=await store.readSnapshot(at);
  assert.equal(after.propertyExternalNumbers.length,1);
  s=await store.mutate({version:after.version,asOf:at,command:{action:'addPropertyExternalNumber',fields:{
   property_id:second.id,source_system:'System B',external_number:'SF1600'}}});
  assert.equal(s.propertyExternalNumbers.length,2);
 }finally{db.close();}
});
test('unknown external number alone cannot create a new property or invent FörvaltningsNr',()=>{
 const s={asOf:at,properties:[],propertyExternalNumbers:[],objects:[],agreements:[]};
 const result=prepareSmartImport({headers:['Externt FastighetsNr','Källsystem','Fastighetsnamn'],
  rows:[['SF1600','System A','GRÖNDAL 1']]},s);
 assert.match(result.errors.join(' '),/FörvaltningsNr saknas/);
 assert.equal(result.commands.length,0);
});
test('opening a valid existing v3 database creates only the empty alias link table and retains the other records',()=>{
 const dir=mkdtempSync(join(tmpdir(),'lokalblick-external-number-')),path=join(dir,'core.sqlite');
 try{
  const db=createFreshDatabase(path);
  db.prepare("INSERT INTO properties(id,name,management_object_number) VALUES (?,?,?)").run('stable-uuid','GRÖNDAL 1','1600');
  db.exec('DROP TABLE property_external_numbers');
  db.close();
  const opened=openExistingDatabase(path);
  assert.equal(opened.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='property_external_numbers'").get().name,'property_external_numbers');
  assert.equal(opened.prepare('SELECT management_object_number FROM properties WHERE id=?').get('stable-uuid').management_object_number,'1600');
  assert.equal(opened.prepare('SELECT count(*) AS count FROM property_external_numbers').get().count,0);
  opened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
