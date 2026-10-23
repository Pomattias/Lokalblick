import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {LokalblickRepository} from '../company/data-repository.js';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lokalblick-tenant-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const core={properties:[{id:'p',designation:'Test'}],contracts:[{id:'A1',propertyId:'p',baseRent:12345,baseAdditions:678}]},sourceAdapter={loadCore:async()=>structuredClone(core),loadCoordinates:async()=>[]},dataPath=path.join(dir,'data.json');return{repo:await new LokalblickRepository({sourceAdapter,dataPath}).initialize(),sourceAdapter,dataPath};}
test('backend persists one tenant party and dated contacts without business relation tables',async t=>{
 let{repo,sourceAdapter,dataPath}=await fixture(t);await repo.create('organizations',{id:'tenant',name:'Hyresgäst',type:'tenant'});await repo.create('people',{id:'P1',name:'Första',organizationId:'tenant'});await repo.create('people',{id:'P2',name:'Nästa',organizationId:'tenant'});
 let d=await repo.bootstrap();d.contracts[0].tenantPartyId='tenant';d.contracts[0].businessName='Beskrivande verksamhet';
 globalThis.LokalblickResponsibility.change(d,{targetType:'contract',targetId:'A1',role:'tenant',personId:'P1',fromDate:'2025-01-01'});
 globalThis.LokalblickResponsibility.change(d,{targetType:'contract',targetId:'A1',role:'tenant',personId:'P2',fromDate:'2026-10-19'});
 d=await repo.saveWorkspace(d);repo=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();const saved=await repo.bootstrap();
 assert.equal(saved.businesses,undefined);assert.equal(saved.contractBusinesses,undefined);assert.deepEqual(saved.assignments,d.assignments);assert.equal(saved.assignments[0].toDate,'2026-10-18');assert.equal(saved.contracts[0].tenantPartyId,'tenant');assert.equal(saved.contracts[0].businessName,'Beskrivande verksamhet');assert.equal(saved.contracts[0].baseRent,12345);assert.equal(saved.contracts[0].baseAdditions,678);
});
test('backend rejects the retired relation registers and protects contact history',async t=>{
 const{repo}=await fixture(t);await assert.rejects(repo.create('businesses',{id:'b',name:'Gamla verksamheter'}),/unknown/);await assert.rejects(repo.create('contractBusinesses',{id:'x',contractId:'A1'}),/unknown/);
 await repo.create('people',{id:'P',name:'Kontakt'});let d=await repo.bootstrap();globalThis.LokalblickResponsibility.change(d,{targetType:'contract',targetId:'A1',role:'tenant',personId:'P'});await repo.saveWorkspace(d);await assert.rejects(repo.delete('people','P'),/ansvarshistorik/);
});
