import test from 'node:test';
import assert from 'node:assert/strict';
import {importIdentityConflicts} from '../frontend/v3/import.js';
const row=(fields,sourceRow=2)=>({fields,sourceRow});
test('tenant duplicates are blocked before save',()=>{
 const snapshot={parties:[{kind:'tenant',name:'Hyresgäst AB',organization_number:'556000-0000'}]};
 assert.equal(importIdentityConflicts('parties',[row({name:'Nytt namn',organization_number:'556000-0000'})],snapshot).length,1);
});
test('file duplicates, existing objects and agreements are rejected',()=>{
 assert.equal(importIdentityConflicts('properties',[row({name:'A',management_object_number:'42'}),row({name:'B',management_object_number:'42'},3)],{}).length,1);
 assert.equal(importIdentityConflicts('objects',[row({object_number:'001',property_id:'p'})],{objects:[{object_number:'001',property_id:'p'}]}).length,1);
 assert.equal(importIdentityConflicts('agreements',[row({agreement_number:'AV-1'})],{agreements:[{agreement_number:'AV-1'}]}).length,1);
});
test('safe distinct properties are accepted',()=>{
 assert.deepEqual(importIdentityConflicts('properties',[row({name:'A',management_object_number:'11'}),row({name:'B',management_object_number:'12'},3)],{}),[]);
});
