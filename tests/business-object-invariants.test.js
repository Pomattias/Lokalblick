import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/domain/business-model.js';
import '../frontend/domain/object-model.js';

const business=globalThis.LokalblickBusinessModel;
const objects=globalThis.LokalblickObjectModel;
const property={id:'p1'};

test('verksamhet lives in one register; description and contract relation survive normalize',()=>{
 const data={properties:[property],objects:[],organizations:[],contracts:[{
  id:'c1',tenantName:'Kommunen',businessName:'Hemtjänst',businessComment:'Hjälp och omsorg i hemmet'
 }]};
 business.normalize(data);business.normalize(data);
 assert.equal(data.businesses.length,1);
 assert.equal(data.contractBusinesses.length,1);
 assert.equal(data.businesses[0].name,'Hemtjänst');
 assert.equal(data.businesses[0].description,'Hjälp och omsorg i hemmet');
 assert.ok(data.contracts[0].tenantPartyId);
 assert.equal(data.contractBusinesses[0].contractId,'c1');
 business.validate(data);
 business.strip(data);
 assert.equal(Object.hasOwn(data.contracts[0],'businessName'),false);
 assert.equal(Object.hasOwn(data.contracts[0],'businessComment'),false);
});

test('the same verksamhet can be used by separate contracts without duplication',()=>{
 const data={organizations:[],contracts:[
  {id:'a1',businessName:'Bibliotek',unitId:'KULTUR'},
  {id:'a2',businessName:'Bibliotek',unitId:'KULTUR'}
 ]};
 business.normalize(data);
 assert.equal(data.businesses.length,1);
 assert.equal(data.contractBusinesses.length,2);
 business.validate(data);
});

test('same business cannot be linked to the same contract twice during overlapping dates',()=>{
 const data={organizations:[],contracts:[{id:'a1'}],businesses:[{id:'b1',name:'Vård'}],contractBusinesses:[
  {id:'l1',contractId:'a1',businessId:'b1',fromDate:'2026-01-01',toDate:'2026-12-31'},
  {id:'l2',contractId:'a1',businessId:'b1',fromDate:'2026-06-01',toDate:''}
 ]};
 assert.throws(()=>business.validate(data),/två gånger/);
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

test('conflicting incoming areas are flagged instead of silently choosing one',()=>{
 const data={properties:[property],objects:[{id:'o1',propertyId:'p1',predecessorIds:[]}],
  contracts:[{id:'c1',objectId:'o1',area:500},{id:'c2',objectId:'o1',area:600}],activities:[]};
 objects.normalize(data);
 assert.equal(data.objects[0].area,undefined);
 assert.ok(data.importReview.some(r=>r.kind==='object-area-conflict'));
});

test('changing a contract area cannot rewrite the physical object',()=>{
 const before={contracts:[{id:'c1',objectId:'o1',area:450}]};
 const data={objects:[{id:'o1',propertyId:'p1',area:450}],
  contracts:[{id:'c1',objectId:'o1',area:530}]};
 assert.throws(()=>objects.applyAreaChanges(before,data),/Yta ändras på objektet/);
 assert.equal(data.objects[0].area,450);
});
