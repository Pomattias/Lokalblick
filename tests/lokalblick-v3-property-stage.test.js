import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePropertyStage} from '../frontend/v3/property-stage.js';
import {openMemoryDatabase} from '../backend/lokaler/v3/database.js';
import {CoreV3Store} from '../backend/lokaler/v3/core-store.js';
const source=(name,headers,...rows)=>({name,rows:[headers,...rows]});
const snap=properties=>({properties});
const master=(...rows)=>source('Lokallista',['Förvaltningsobjekt','Fastighetsnamn','Adress','Ort','Avtalsnummer'],...rows);
const enrich=(...rows)=>source('Fastighetslista',['Objekt. nr','Fastighetsbeteckning','Adress','Ort'],...rows);
const seq=()=>{let i=0;return()=>String(++i).padStart(8,'0');};
test('property stage combines Lokallista with enrichment, creates one property per number, never objects or agreements',()=>{
 const p=preparePropertyStage([
  master(['101','Huset A','','Malmö','AV1'],['101','Huset A','','Malmö','AV2'],['102','Huset B','Storgatan 2','Lund','AV3']),
  enrich(['101','Huset A','Kajgatan 1','Malmö'],['999','Främmande','Okänd 5','Lund'])
 ],snap([]),{makeId:seq()});
 assert.equal(p.stats.found,3); // The enrichment-only property is visible but cannot be created.
 assert.equal(p.stats.new,2);
 assert.equal(p.stats.review,1);
 assert.equal(p.commands.length,2);
 assert(p.commands.every(c=>c.action==='createProperty'));
 assert.equal(p.commands[0].fields.address,'Kajgatan 1');
 assert.match(p.issues.map(x=>x.message).join(' '),/saknas i Lokallista/);
});
test('Lokallista is authoritative; conflicting enrichment does not overwrite the master name',()=>{
 const p=preparePropertyStage([
  master(['11','Huvudbyggnaden','Hamngatan 1','Malmö','AV1']),
  enrich(['11','Annan beteckning','Hamngatan 1','Malmö'])
 ],snap([]),{makeId:seq()});
 assert.equal(p.commands.length,1);
 assert.equal(p.commands[0].fields.name,'Huvudbyggnaden');
 assert.match(p.issues.map(x=>x.message).join(' '),/Lokallistas värde behålls/);
});
test('a cell with several agreement numbers is explained, but the safe property still imports',()=>{
 const p=preparePropertyStage([master(['7','Kvarteret','Hamnvägen 7','Malmö','AV-1; AV-2'])],snap([]),{makeId:seq()});
 assert.equal(p.stats.new,1);
 assert.equal(p.commands.length,1);
 assert.equal(p.commands[0].action,'createProperty');
 assert.match(p.issues.map(x=>x.message).join(' '),/flera avtalsnummer i samma cell/);
 assert.equal(p.issues[0].row,2);
 assert.equal(p.issues[0].sheet,'Lokallista');
});
test('contradictory property address is excluded without blocking an otherwise safe property',()=>{
 const p=preparePropertyStage([master(
  ['11','Fabriken','Gata 1','Lund','A-1'],
  ['11','Fabriken','Gata 99','Lund','A-2'],
  ['12','Skolan','Gata 12','Lund','A-3']
 )],snap([]),{makeId:seq()});
 assert.equal(p.commands.length,2);
 assert.equal(p.commands[0].fields.address,undefined);
 assert.equal(p.commands[1].fields.address,'Gata 12');
 assert.match(p.issues.map(x=>x.message).join(' '),/Motstridiga adresser/);
});
test('existing properties are enriched only where data is missing, never silently overwritten',()=>{
 const s=snap([{id:'p1',name:'Gammalt namn',management_object_number:'11',address:null,city:'Malmö'}]);
 const p=preparePropertyStage([master(['11','Nytt namn','Nygatan 1','Malmö','A1'])],s);
 assert.equal(p.stats.enriched,1);
 assert.deepEqual(p.commands.map(c=>c.action),['updateProperty']);
 assert.deepEqual(p.commands[0].fields,{address:'Nygatan 1'});
 assert.match(p.issues.map(x=>x.message).join(' '),/skiljer sig från befintlig/);
});
test('duplicate existing property identity is isolated without blocking other properties',()=>{
 const p=preparePropertyStage([master(['11','Dubbel','Gata 1','Malmö','A1'],['12','Unik','Gata 2','Malmö','A2'])],
  snap([{id:'a',management_object_number:'11',name:'Dubbel'},
   {id:'b',management_object_number:'11',name:'Dubbel'}]),{makeId:seq()});
 assert.equal(p.stats.review,1);
 assert.equal(p.commands.length,1);
 assert.equal(p.commands[0].fields.management_object_number,'12');
});
test('numberless enrichment needs a unique exact address AND city to match',()=>{
 const p=preparePropertyStage([master(['41','Biblioteket','Bokgatan 1','Malmö','AV1']),
  source('Lokaldata',['Adress','Ort','Populärnamn'],['Bokgatan 1','Malmö','Bokhuset'],['Bokgatan 3','Malmö','Saknas'])],
  snap([]),{makeId:seq()});
 assert.equal(p.commands.length,1);
 assert.equal(p.commands[0].fields.popular_name,'Bokhuset');
 assert.match(p.issues.map(x=>x.message).join(' '),/Ingen säker fastighet matchar/);
});
test('Lokallista broken #NAME? header can still identify the property number in column A',()=>{
 const p=preparePropertyStage([source('Lokallista',['#NAME?','Fastighet','Adress','Ort'],['9(1)','Huset 9','Ny väg 9','Lund'])],
  snap([]),{makeId:seq()});
 assert.equal(p.commands[0].fields.management_object_number,'9(1)');
});
test('property identity keeps punctuation rather than merging unrelated numbers',()=>{
 const p=preparePropertyStage([master(['9(1)','Hus A','Gata 1','Lund',''],['91','Hus B','Gata 2','Lund',''])],
  snap([]),{makeId:seq()});
 assert.equal(p.stats.new,2);
});
test('approved property commands persist without prematurely creating objects, agreements or tenants',async()=>{
 const db=openMemoryDatabase(),store=new CoreV3Store(db);
 try{
  const s=await store.readSnapshot('2026-11-03');
  const p=preparePropertyStage([master(['12','Skolan','Skolgatan 2','Malmö','A12'],['13','','Kajen 13','Malmö','A13'])],
   s,{makeId:()=>crypto.randomUUID()});
  assert.equal(p.commands.length,2);
  const saved=await store.mutate({version:s.version,asOf:'2026-11-03',commands:p.commands});
  assert.equal(saved.properties.length,2);
  assert.equal(saved.objects.length,0);assert.equal(saved.agreements.length,0);assert.equal(saved.parties.length,0);
  assert.equal(saved.properties.find(x=>x.management_object_number==='13').name,'Kajen 13');
  const repeat=preparePropertyStage([master(['12','Skolan','Skolgatan 2','Malmö','A12'],['13','','Kajen 13','Malmö','A13'])],saved);
  assert.equal(repeat.commands.length,0);
  assert.equal(repeat.stats.existing,2);
 }finally{db.close();}
});
