import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {importSchemas} from '../frontend/lokaler/import-schema.js';

function fixture(){
 const clean=emptyData();
 clean.parties=[
  normalize('parties',{id:'TEN1',name:'Hyresgästen AB'}),
  normalize('parties',{id:'OWN1',name:'Fastighetsägaren AB'})
 ];
 clean.properties=[normalize('properties',{id:'F1',name:'Fastighet 1',owner_party_id:'OWN1'})];
 clean.objects=[normalize('objects',{id:'O1',property_id:'F1'})];
 clean.agreements=[normalize('agreements',{
  id:'A1',object_id:'O1',tenant_party_id:'TEN1',
  business_name:'Tidigare fristående verksamhetsnamn',
  business_description:'Beskrivning som tillhör avtalet'
 })];
 return clean;
}

test('hyresgästens partnamn är även visat verksamhetsnamn',()=>{
 const view=projectWorkspace(fixture());
 assert.equal(view.contracts[0].tenantName,'Hyresgästen AB');
 assert.equal(view.contracts[0].businessName,'Hyresgästen AB');
 assert.equal(view.contracts[0].businessDescription,'Beskrivning som tillhör avtalet');
});

test('härlett verksamhetsnamn dubbellagras inte vid sparning',()=>{
 const clean=fixture(),view=projectWorkspace(clean);
 view.contracts[0].businessName='Skall inte skrivas över';
 view.contracts[0].businessDescription='Ny beskrivning';
 const saved=collectWorkspace(view,clean);
 assert.equal(saved.agreements[0].tenant_party_id,'TEN1');
 assert.equal(saved.agreements[0].business_name,'Tidigare fristående verksamhetsnamn');
 assert.equal(saved.agreements[0].business_description,'Ny beskrivning');
});

test('import av Verksamhet går mot hyresgäst, utan dubbla importfält',()=>{
 const schema=importSchemas.find(row=>row.key==='contracts');
 assert.ok(schema.labelAliases.tenantPartyId.includes('Verksamhet'));
 assert.ok(schema.labelAliases.tenantPartyId.includes('Verksamhetsnamn'));
 assert.equal(schema.columns.filter(([key])=>key==='tenantPartyId').length,1);
 assert.equal(schema.columns.some(([key])=>key==='businessName'),false);
});
