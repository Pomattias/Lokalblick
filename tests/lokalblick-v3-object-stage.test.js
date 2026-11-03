import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareObjectStage,generatedObjectMessage} from '../frontend/v3/object-stage.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';
const mk=(name,headers,...rows)=>({name,rows:[headers,...rows]});
const master=(...rows)=>mk('Lokallista',['Förvaltningsobjekt','Adress','Ort','Objektsnummer','Avtalsnummer','Startdatum','Yta'],...rows);
const enrich=(...rows)=>mk('Lokaldata',['Förvaltningsobjekt','Objektsnummer','Avtalsnummer','Area'],...rows);
const prop=(no,id='p'+no)=>({id,name:'Fastighet '+no,management_object_number:no,address:'Storgatan '+no,city:'Malmö'});
const snap=(props=[prop('101')],objects=[],agreements=[])=>({
 asOf:'2026-11-03',properties:props,objects,agreements});
const idFactory=()=>{let i=0;return()=> 'new'+(++i)};
test('numberless lease rows generate separate objects using the existing per-property numbering',()=>{
 const result=prepareObjectStage([master(
  ['101','Storgatan 101','Malmö','','A-1','2020-01-01','75'],
  ['101','Storgatan 101','Malmö','','A-2','2021-01-01','50'],
  ['101','Storgatan 101','Malmö','','A-2','2021-01-01','50']
 )],snap(),{makeId:idFactory()});
 assert.equal(result.stats.new,2);
 assert.equal(result.stats.generated,2);
 assert.deepEqual(result.commands.map(x=>x.fields.object_number),['101-001','101-002']);
 assert.equal(result.commands[0].fields.area,75);
 assert.equal(result.commands[0].fields.valid_from,'2020-01-01');
 assert.equal(result.commands[1].fields.area,50);
 assert.equal(result.commands.some(x=>x.action==='createAgreement'),false);
 assert.match(generatedObjectMessage,/Objektsnummer går att ändra i efterhand/);
});
test('enrichment from another selected tab adds an explicit object number, but never creates independent objects',()=>{
 const result=prepareObjectStage([
  master(['101','Storgatan 101','Malmö','','A-1','2020-01-01','']),
  enrich(['101','101-009','A-1','75'],['101','101-666','UNMATCHED','120'])
 ],snap(),{makeId:idFactory()});
 assert.deepEqual(result.commands.map(x=>x.fields.object_number),['101-009']);
 assert.equal(result.commands[0].fields.area,75);
 assert.equal(result.stats.new,1);
});
test('explicit object number is reused for several agreements without duplicate object creations',()=>{
 const result=prepareObjectStage([master(
  ['101','Storgatan 101','Malmö','101-003','A-1','2020-01-01','80'],
  ['101','Storgatan 101','Malmö','101-003','A-2','2021-01-01','80']
 )],snap(),{makeId:idFactory()});
 assert.equal(result.commands.length,1);
 assert.equal(result.commands[0].fields.object_number,'101-003');
 assert.deepEqual(result.entries[0].agreementNumbers,['A-1','A-2']);
});
test('multi-value agreement cell is never split into imaginary objects, safe rows continue',()=>{
 const result=prepareObjectStage([master(
  ['101','Storgatan 101','Malmö','','A-1;A-2','2020-01-01','75'],
  ['101','Storgatan 101','Malmö','','A-3','2020-01-01','80']
 )],snap(),{makeId:idFactory()});
 assert.equal(result.commands.length,1);
 assert.equal(result.stats.generated,1);
 assert.match(result.issues.map(x=>x.message).join(' '),/flera avtalsnummer i samma cell/);
});
test('missing property is separated from safe object rows',()=>{
 const result=prepareObjectStage([master(
  ['999','Storgatan 999','Malmö','','A-1','2020-01-01','75'],
  ['101','Storgatan 101','Malmö','','A-3','2020-01-01','80']
 )],snap(),{makeId:idFactory()});
 assert.equal(result.commands.length,1);
 assert.equal(result.stats.review,1);
 assert.match(result.issues[0].message,/Fastigheten finns inte/);
});
test('ambiguous existing numberless objects are never duplicated when the import is restarted',()=>{
 const old={id:'existing-object',property_id:'p101',object_number:'101-001',currentVersion:{valid_from:'2020-01-01',area:null}};
 const result=prepareObjectStage([master(['101','Storgatan 101','Malmö','','A-1','2020-01-01','75'])],
  snap([prop('101')],[old]),{makeId:idFactory()});
 assert.equal(result.commands.length,0);
 assert.equal(result.stats.review,1);
 assert.match(result.issues.map(x=>x.message).join(' '),/undvika dubbletter/);
 const linked=prepareObjectStage([master(['101','Storgatan 101','Malmö','','A-1','2020-01-01','75'])],
  snap([prop('101')],[old]),{objectLinks:{'p101|a-1':'existing-object'}});
 assert.equal(linked.commands.length,0);
 assert.equal(linked.stats.existing,1);
 assert.equal(linked.entries[0].objectNumber,'101-001');
});
test('conflicting areas omit only area; import a safe object',()=>{
 const result=prepareObjectStage([master(
  ['101','Storgatan 101','Malmö','101-100','A-1','2020-01-01','75'],
  ['101','Storgatan 101','Malmö','101-100','A-1','2020-01-01','85']
 )],snap(),{makeId:idFactory()});
 assert.equal(result.commands.length,1);
 assert.equal(result.commands[0].fields.area,undefined);
 assert.match(result.issues.map(x=>x.message).join(' '),/Olika areor/);
});
test('same agreement on two different properties cannot create two linked objects',()=>{
 const result=prepareObjectStage([master(
  ['101','Storgatan 101','Malmö','','SHARED','2020-01-01','75'],
  ['102','Storgatan 102','Malmö','','SHARED','2020-01-01','85']
 )],snap([prop('101'),prop('102')]),{makeId:idFactory()});
 assert.equal(result.commands.length,0);
 assert.equal(result.stats.review,2);
});
test('in-memory database persists generated objects but not agreements, and same-session reimport does not duplicate',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let state=await store.readSnapshot('2026-11-03');
  const properties=await store.mutate({version:state.version,asOf:state.asOf,
   commands:[{action:'createProperty',id:'prop101',fields:{name:'Kvarteret',management_object_number:'101'}}]});
  const rows=master(['101','','','','A-1','2022-01-01','20'],['101','','','','A-2','2022-01-01','25']);
  const planned=prepareObjectStage([rows],properties,{makeId:idFactory()});
  assert.equal(planned.commands.length,2);
  const saved=await store.mutate({version:properties.version,asOf:'2026-11-03',commands:planned.commands});
  assert.equal(saved.objects.length,2);
  assert.equal(saved.agreements.length,0);
  assert.equal(saved.parties.length,0);
  const repeat=prepareObjectStage([rows],saved,{objectLinks:planned.objectLinks});
  assert.equal(repeat.commands.length,0);
  assert.equal(repeat.stats.existing,2);
 }finally{db.close();}
});
