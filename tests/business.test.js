import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/domain/business-model.js';
import '../frontend/domain/responsibility-model.js';
import {normalize,resolveReview} from '../frontend/v2/model.js';
const model=globalThis.LokalblickBusinessModel;
const fixture=()=>({properties:[{id:'p'}],objects:[{id:'o',propertyId:'p'}],contracts:[{id:'A1',objectId:'o',propertyId:'p',tenantName:'Hyresgäst AB',business:'Dagverksamhet'}],organizations:[],people:[],assignments:[],activities:[],auditLog:[],importReview:[]});
test('verksamhet is descriptive text and never produces a register or relationship',()=>{
 const once=normalize(fixture()),twice=normalize(once);assert.deepEqual(twice,once);
 assert.equal(once.contracts[0].business,'Dagverksamhet');assert.equal(once.businesses,undefined);assert.equal(once.contractBusinesses,undefined);
 assert.equal(once.organizations.length,1);assert.equal(once.contracts[0].tenantPartyId,once.organizations[0].id);
});
test('only exact tenant party names are reused; punctuation is significant',()=>{
 const data=fixture();data.organizations=[{id:'other',name:'Hyresgast AB'}];model.normalize(data);
 assert.notEqual(data.contracts[0].tenantPartyId,'other');assert.equal(data.organizations.length,2);
 const party=data.organizations.find(p=>p.id===data.contracts[0].tenantPartyId);assert.equal(party.name,'Hyresgäst AB');
});
test('ambiguous tenant names require an explicit identity decision',()=>{
 const d=fixture();d.organizations=[{id:'a',name:'Hyresgäst AB'},{id:'b',name:'Hyresgäst AB'}];model.normalize(d);
 assert.equal(d.contracts[0].tenantPartyId,undefined);assert.equal(d.importReview.length,1);
 resolveReview(d,d.importReview[0].id,'accept','b','Test');assert.equal(d.contracts[0].tenantPartyId,'b');
});
test('person links offer exactly the three agreed roles',()=>{
 assert.deepEqual(Object.keys(globalThis.LokalblickResponsibility.roles),['our','owner','tenant']);
 assert.throws(()=>globalThis.LokalblickResponsibility.change(fixture(),{targetType:'contract',targetId:'A1',role:'business',personId:'p'}),/Välj ägarens kontakt/);
});
test('tenant identity keeps source-cell provenance without changing rental terms',()=>{
 const d=fixture();d.contracts[0].provenance={tenantName:{source:'test.xlsx',sheet:'Avtal',row:2,cell:'D2'}};d.contracts[0].baseRent=123456;d.contracts[0].baseAdditions=2345;
 model.normalize(d);assert.equal(d.organizations[0].provenance.name.cell,'D2');assert.equal(d.contracts[0].baseRent,123456);assert.equal(d.contracts[0].baseAdditions,2345);
});
