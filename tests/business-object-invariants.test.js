import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/domain/business-model.js';
import '../frontend/domain/object-model.js';

const business=globalThis.LokalblickBusinessModel;
const objects=globalThis.LokalblickObjectModel;
const property={id:'p1'};

test('verksamhet and its description are ordinary fields on Avtal',()=>{
 const data={organizations:[],contracts:[
  {id:'c1',businessName:'Hemtjänst',businessDescription:'Hjälp och omsorg i hemmet'}
 ]};
 business.normalize(data);
 assert.equal(data.contracts[0].businessName,'Hemtjänst');
 assert.equal(data.contracts[0].businessDescription,'Hjälp och omsorg i hemmet');
 assert.equal(Object.hasOwn(data,'businesses'),false);
 assert.equal(Object.hasOwn(data,'contractBusinesses'),false);
 business.validate(data);
});

test('current contract fields remain independent through repeated normalization',()=>{
 const data={organizations:[],contracts:[
  {id:'c1',businessName:'Bibliotek',businessDescription:'Kommunalt bibliotek'}
 ]};
 business.normalize(data);
 assert.equal(data.contracts[0].businessName,'Bibliotek');
 assert.equal(data.contracts[0].businessDescription,'Kommunalt bibliotek');
 assert.equal(Object.hasOwn(data.contracts[0],'business'),false);
 assert.equal(Object.hasOwn(data.contracts[0],'businessComment'),false);
 business.normalize(data);
 assert.equal(data.contracts.length,1);
});

test('two agreements have independent verksamhet fields without links',()=>{
 const data={organizations:[],contracts:[
  {id:'a1',businessName:'Kontor',businessDescription:'Förvaltning'},
  {id:'a2',businessName:'Kontor',businessDescription:'Besöksmottagning'}
 ]};
 business.normalize(data);
 assert.equal(data.contracts.length,2);
 assert.notEqual(data.contracts[0].businessDescription,data.contracts[1].businessDescription);
 assert.equal(data.contractBusinesses,undefined);
});

test('juridisk hyresgäst remains separate from verksamhet',()=>{
 const data={organizations:[],contracts:[{id:'c1',tenantName:'Malmö stad',businessName:'Hälsa'}]};
 business.normalize(data);
 assert.equal(data.organizations.length,1);
 assert.equal(data.contracts[0].businessName,'Hälsa');
 assert.equal(data.organizations[0].id,data.contracts[0].tenantPartyId);
});

test('object dates, not agreement area, determine area for historical periods',()=>{
 const data={properties:[property],objects:[
  {id:'o1',propertyId:'p1',area:2500,start:'2026-01-01',end:'2027-12-31',predecessorIds:[]},
  {id:'o2',propertyId:'p1',area:2300,start:'2028-01-01',end:'',predecessorIds:['o1']}
 ],contracts:[{id:'c1',objectId:'o2',area:2300}],activities:[]};
 objects.normalize(data);
 objects.validate(data);
 assert.equal(objects.objectAt(data,'o2','2027-06-01').area,2500);
 assert.equal(objects.objectAt(data,'o2','2028-06-01').area,2300);
 objects.stripAreas(data);
 assert.equal(Object.hasOwn(data.contracts[0],'area'),false);
});

test('an unambiguous imported agreement area is adopted by the linked object',()=>{
 const data={properties:[property],objects:[{id:'o1',propertyId:'p1',predecessorIds:[]}],
  contracts:[{id:'c1',objectId:'o1',area:500}],activities:[]};
 objects.normalize(data);
 assert.equal(data.objects[0].area,500);
 objects.stripAreas(data);
 assert.equal(Object.hasOwn(data.contracts[0],'area'),false);
});

test('conflicting incoming areas are flagged for review',()=>{
 const data={properties:[property],objects:[{id:'o1',propertyId:'p1',predecessorIds:[]}],
  contracts:[{id:'c1',objectId:'o1',area:500},{id:'c2',objectId:'o1',area:600}],activities:[]};
 objects.normalize(data);
 assert.equal(data.objects[0].area,undefined);
 assert.ok(data.importReview.some(r=>r.kind==='object-area-conflict'));
});

test('changing a contract area cannot rewrite the object area',()=>{
 const before={contracts:[{id:'c1',objectId:'o1',area:450}]};
 const data={objects:[{id:'o1',propertyId:'p1',area:450}],
  contracts:[{id:'c1',objectId:'o1',area:530}]};
 assert.throws(()=>objects.applyAreaChanges(before,data),/Yta ändras på objektet/);
 assert.equal(data.objects[0].area,450);
});
