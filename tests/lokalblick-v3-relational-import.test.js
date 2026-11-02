import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAgreementLinks} from '../frontend/v3/relational-import.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';
const property=(id,number)=>({id,name:'Fastighet '+id,management_object_number:number});
const object=(id,property_id,object_number)=>({id,property_id,object_number});
const agreement=(id,object_id,agreement_number)=>({id,object_id,agreement_number});
const snapshot=()=>({
 properties:[property('p1','SF1213'),property('p2','SF9900')],
 objects:[object('o1','p1','SF1213-001'),object('o2','p1','SF1213-002'),object('o9','p2','SF9900-001')],
 agreements:[agreement('a1','o1','SF1213-001-01')]
});
const entry=(row,propertyNumber,agreementNumber,extra={})=>({sourceRow:row,fields:{
 management_object_number:propertyNumber,agreement_number:agreementNumber,valid_from:'2026-01-01',...extra
}});
test('import reuses matched lease without creating a new object or lease',()=>{
 const result=prepareAgreementLinks([entry(2,'SF1213','SF1213-001-01')],snapshot());
 assert.equal(result.errors.length,0);
 assert.equal(result.records[0].action,'existing');
 assert.equal(result.records[0].objectId,'o1');
 assert.deepEqual(result.commands,[]);
});
test('explicit object number or fully parsed lease number only links an existing physical object',()=>{
 const rows=[entry(2,'SF1213','A-999',{object_number:'SF1213-002'}),
  entry(3,'SF1213','SF1213-001-03')];
 const result=prepareAgreementLinks(rows,snapshot());
 assert.equal(result.errors.length,0);
 assert.equal(result.commands.length,2);
 assert.deepEqual(result.commands.map(c=>c.fields.object_id),['o2','o1']);
});
test('different properties in the same source file retain their exact property-scoped object links',()=>{
 const rows=[entry(2,'SF1213','M-1',{object_number:'SF1213-001'}),
  entry(3,'SF9900','M-2',{object_number:'SF9900-001'})];
 const result=prepareAgreementLinks(rows,snapshot());
 assert.equal(result.errors.length,0);
 assert.deepEqual(result.commands.map(c=>c.fields.object_id),['o1','o9']);
});
test('a missing object number never invents a different physical object for each agreement',()=>{
 const r=prepareAgreementLinks([entry(2,'SF1213','RANDOM-17')],snapshot());
 assert.match(r.errors[0],/Välj ett befintligt objekt/);
 assert.equal(r.commands.length,0);
 assert.equal(r.records[0].objectId,null);
});
test('approval can reuse a chosen physical object or explicitly create a new one',()=>{
 const rows=[entry(2,'SF1213','RANDOM-17')];
 const selected=prepareAgreementLinks(rows,snapshot(),{0:'o2'});
 assert.equal(selected.errors.length,0);
 assert.equal(selected.commands.length,1);
 assert.equal(selected.commands[0].fields.object_id,'o2');
 const newId='11111111-1111-4111-8111-111111111111';
 const created=prepareAgreementLinks(rows,snapshot(),{0:'@new'},()=>newId);
 assert.equal(created.errors.length,0);
 assert.deepEqual(created.commands.map(x=>x.action),['createObject','createAgreement']);
 assert.equal(created.commands[0].id,newId);
 assert.equal(created.commands[0].fields.object_number,'SF1213-003');
 assert.equal(created.commands[1].fields.object_id,newId);
 assert.equal(created.commands[0].fields.area,undefined);
});
test('known structured lease supplies a proposed object number only upon explicit new-object approval',()=>{
 const r=prepareAgreementLinks([entry(2,'SF1213','SF1213-007-03')],snapshot());
 assert.equal(r.commands.length,0);
 assert.equal(r.records[0].suggestedObject,'SF1213-007');
 const chosen=prepareAgreementLinks([entry(2,'SF1213','SF1213-007-03')],snapshot(),
  {0:'@new'},()=> 'new-specified-id');
 assert.equal(chosen.errors.length,0);
 assert.equal(chosen.commands[0].fields.object_number,'SF1213-007');
});
test('unknown and ambiguous property business numbers block import',()=>{
 const rows=[entry(2,'MISSING','K-1'),entry(3,'SF1213','K-2')];
 const data=snapshot();data.properties.push(property('dup','sf1213'));
 const r=prepareAgreementLinks(rows,data);
 assert.equal(r.commands.length,0);
 assert.match(r.errors[0],/Fastighetsnumret finns inte/);
 assert.match(r.errors[1],/Flera fastigheter/);
});
test('existing lease with mismatched property or explicit object stays unchanged and blocks import',()=>{
 const bad=prepareAgreementLinks([entry(2,'SF9900','SF1213-001-01')],snapshot());
 assert.equal(bad.commands.length,0);assert.match(bad.errors[0],/annan fastighet/);
 const other=prepareAgreementLinks([entry(2,'SF1213','SF1213-001-01',{object_number:'SF1213-002'})],snapshot());
 assert.equal(other.commands.length,0);assert.match(other.errors[0],/annat objektnummer/);
});
test('file duplicates do not create duplicate agreements and do not silently rewrite source rows',()=>{
 const rows=[entry(2,'SF1213','A-42',{object_number:'SF1213-002'}),
  entry(3,'SF1213','A-42',{object_number:'SF1213-002'})];
 const result=prepareAgreementLinks(rows,snapshot());
 assert.equal(result.commands.length,1);
 assert.match(result.errors[0],/flera gånger/);
});
test('reviewed relation import executes in one atomic transaction and remains idempotent on reimport',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let state=await store.readSnapshot('2026-11-02');
  const apply=async commands=>{state=await store.mutate({version:state.version,asOf:'2026-11-02',commands});return state};
  await apply([{action:'createProperty',fields:{name:'Ett',management_object_number:'SF1213'}},
   {action:'createProperty',fields:{name:'Två',management_object_number:'SF9900'}}]);
  const rows=[entry(2,'SF1213','A-1'),entry(3,'SF9900','B-1')];
  const selections={0:'@new',1:'@new'};
  const prepared=prepareAgreementLinks(rows,state,selections,(()=>{let n=0;return()=> 'NEW-OBJ-'+(++n)})());
  assert.equal(prepared.errors.length,0);
  await apply(prepared.commands);
  assert.deepEqual(state.objects.map(o=>o.object_number),['SF1213-001','SF9900-001']);
  assert.deepEqual(state.agreements.map(a=>a.agreement_number),['A-1','B-1']);
  assert.equal(state.agreements[0].object_id,state.objects[0].id);
  assert.equal(state.agreements[1].object_id,state.objects[1].id);
  const repeat=prepareAgreementLinks(rows,state);
  assert.equal(repeat.errors.length,0);
  assert.equal(repeat.commands.length,0);
  assert(repeat.records.every(r=>r.action==='existing'));
  assert.equal(state.objects[0].currentVersion.area,null);
 }finally{db.close()}
});
test('invalid rows cannot partially save relational import batch',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let state=await store.readSnapshot('2026-11-02');
  state=await store.mutate({version:state.version,asOf:'2026-11-02',
   command:{action:'createProperty',fields:{name:'Ett',management_object_number:'SF1213'}}});
  const prepared=prepareAgreementLinks([entry(2,'SF1213','A-1')],state,{0:'@new'},()=> 'new1');
  assert.equal(prepared.errors.length,0);
  await assert.rejects(store.mutate({version:state.version,asOf:'2026-11-02',
   commands:[...prepared.commands,{action:'createAgreement',fields:{object_id:'does-not-exist',agreement_number:'A-2',valid_from:'2026-01-01'}}]}),/Objektet saknas/);
  const after=await store.readSnapshot('2026-11-02');
  assert.equal(after.objects.length,0);assert.equal(after.agreements.length,0);
  assert.equal(after.version,state.version);
 }finally{db.close()}
});
