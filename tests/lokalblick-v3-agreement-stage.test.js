import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAgreementStage} from '../frontend/v3/agreement-stage.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';

const sheet=(name,headers,...rows)=>({name,rows:[headers,...rows]});
const master=(...rows)=>sheet('Lokallista',
 ['Fastighetsnummer','Objektsnummer','Avtalsnummer','Startdatum','Slutdatum','Användning','Bashyra','Bashyra basår'],...rows);
const snapshot=(changes={})=>({asOf:'2026-11-03',
 properties:[{id:'p',name:'Kvarteret',management_object_number:'101'}],
 objects:[{id:'o',property_id:'p',object_number:'101-001',
  versions:[{valid_from:'2020-01-01',area:50}]}],
 agreements:[],agreementItems:[],...changes});
const makeId=()=>{let n=0;return()=>String(++n)};
const row=(no='101-001',ag='A-1',start='2021-01-01',price='100000')=>['101',no,ag,start,'2030-12-31','Kontor',price,'2021'];

test('agreement and price are separate safe units with a verified object link',()=>{
 const p=prepareAgreementStage([master(row())],snapshot(),{makeId:makeId()});
 assert.equal(p.stats.new,1);
 assert.equal(p.stats.prices,1);
 assert.deepEqual(p.commands.map(x=>x.action),['createAgreement','addAgreementItem']);
 assert.equal(p.commands[0].fields.object_id,'o');
 assert.equal(p.commands[1].fields.base_amount,100000);
 assert.deepEqual(p.units[1].dependsOn,['agreement:1']);
});
test('existing object generated in previous step is used via retained agreement mapping',()=>{
 const p=prepareAgreementStage([master(row('','A-7'))],snapshot(),
  {objectLinks:{'p|a-7':'o'},makeId:makeId()});
 assert.equal(p.stats.new,1);
 assert.equal(p.entries[0].objectNumber,'101-001');
});
test('several agreements in one cell are skipped, but other contracts are safely planned',()=>{
 const p=prepareAgreementStage([master(row('101-001','A-1; A-2'),row('101-001','A-3'))],
  snapshot(),{makeId:makeId()});
 assert.equal(p.stats.new,1);
 assert.equal(p.entries[0].agreementNumber,'A-3');
 assert.match(p.issues.map(x=>x.message).join(' '),/flera avtalsnummer i samma cell/);
});
test('agreement with no safe object is listed for review without blocking a safe contract',()=>{
 const p=prepareAgreementStage([master(row('','UNLINKED'),row('101-001','LINKED'))],
  snapshot(),{makeId:makeId()});
 assert.equal(p.stats.review,1);
 assert.equal(p.stats.new,1);
 assert.match(p.issues.map(x=>x.message).join(' '),/Objektet kan inte identifieras/);
});
test('contradictory price does not block safe agreement creation',()=>{
 const s=sheet('Berikning',['Fastighetsnummer','Avtalsnummer','Bashyra'],
  ['101','A-4','90000']);
 const p=prepareAgreementStage([master(row('101-001','A-4', '2021-01-01','100000')),s],
  snapshot(),{makeId:makeId()});
 assert.equal(p.stats.new,1);
 assert.equal(p.stats.prices,1);
 assert.equal(p.commands.find(x=>x.action==='addAgreementItem').fields.base_amount,100000);
 assert.match(p.issues.map(x=>x.message).join(' '),/skiljer sig från Lokallista/);
});
test('existing agreements are reused and rents never overwritten',()=>{
 const old={id:'existing',object_id:'o',agreement_number:'A-1',
  original_start_on:'2021-01-01'};
 const p=prepareAgreementStage([master(row())],snapshot({agreements:[old],
  agreementItems:[{agreement_id:'existing',type:'base',name:'Bashyra',base_amount:50000,
   valid_from:'2021-01-01',adjustment_method:'none',base_year:2021}]}));
 assert.equal(p.stats.existing,1);
 assert.equal(p.stats.new,0);
 assert.equal(p.stats.prices,0);
 assert.equal(p.commands.length,0);
 assert.match(p.issues.map(x=>x.message).join(' '),/skrivs inte över/);
});
test('generated object and agreement can be imported in sequence in isolated database',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  let s=await store.readSnapshot('2026-11-03');
  s=await store.mutate({version:s.version,asOf:s.asOf,commands:[
   {action:'createProperty',id:'p',fields:{name:'Kvarteret',management_object_number:'101'}},
   {action:'createObject',id:'o',fields:{property_id:'p',object_number:'101-001',valid_from:'2020-01-01'}}
  ]});
  const p=prepareAgreementStage([master(row('','A-9'))],s,{objectLinks:{'p|a-9':'o'}});
  assert.equal(p.stats.new,1);
  for(const u of p.units) s=await store.mutate({version:s.version,asOf:s.asOf,commands:u.commands});
  assert.equal(s.agreements.length,1);
  assert.equal(s.agreementItems.length,1);
  assert.equal(s.agreements[0].object_id,'o');
  const again=prepareAgreementStage([master(row('','A-9'))],s,{objectLinks:{'p|a-9':'o'}});
  assert.equal(again.commands.length,0);
  assert.equal(again.stats.existing,1);
 }finally{db.close();}
});
