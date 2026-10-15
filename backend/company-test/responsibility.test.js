import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LokalblickRepository} from '../company/data-repository.js';
const model=globalThis.LokalblickResponsibility;
async function repository(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lokalblick-ansvar-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const dataPath=path.join(dir,'data.json'),core={properties:[{id:'p',address:'Testgatan',designation:'Test 1'}],contracts:[{id:'c',propertyId:'p',number:'C1'}]};const sourceAdapter={loadCore:async()=>structuredClone(core),loadCoordinates:async()=>[]};return {repo:await new LokalblickRepository({dataPath,sourceAdapter}).initialize(),dataPath,sourceAdapter};}
test('company responsibility survives save, source refresh and restart without legacy conversion',async t=>{
 let {repo,dataPath,sourceAdapter}=await repository(t);await repo.create('organizations',{id:'our',name:'Vi',type:'our'});await repo.create('people',{id:'u1',name:'Första',organizationId:'our'});await repo.create('people',{id:'u2',name:'Andra',organizationId:'our'});
 let d=await repo.bootstrap();model.change(d,{targetType:'property',targetId:'p',personId:'u1',fromDate:'2025-01-01',actor:'Test'});await repo.saveWorkspace(d);d=await repo.bootstrap();model.change(d,{targetType:'property',targetId:'p',personId:'u2',fromDate:'2026-10-12',actor:'Test'});await repo.saveWorkspace(d);const history=structuredClone(d.assignments);
 await repo.refreshSource();repo=await new LokalblickRepository({dataPath,sourceAdapter}).initialize();const out=await repo.bootstrap();assert.deepEqual(out.assignments,history);assert.equal(out.properties[0].responsiblePersonId,'u2');assert.equal(out.properties[0].address,'Testgatan');
 assert.equal((await repo.get('people','u2')).id,'u2');
});
test('backend rejects overlaps, dangling references and history removal without partial writes',async t=>{
 const {repo}=await repository(t);await repo.create('people',{id:'u1',name:'Person'});let d=await repo.bootstrap();model.change(d,{targetType:'property',targetId:'p',personId:'u1',fromDate:'2026-01-01'});await repo.saveWorkspace(d);const stable=await repo.bootstrap();
 const bad=structuredClone(stable);bad.assignments.push({...bad.assignments[0],id:'duplicate'});await assert.rejects(repo.saveWorkspace(bad),/Överlappande/);assert.deepEqual((await repo.bootstrap()).assignments,stable.assignments);
 await assert.rejects(repo.saveWorkspace({...stable,assignments:[]}),/historik/);await assert.rejects(repo.create('assignments',{id:'invalid',targetType:'property',targetId:'p',personId:'absent',role:'Ansvarig'}),/Personen/);
 await assert.rejects(repo.delete('people','u1'),/historik/);assert.equal((await repo.bootstrap()).people.length,1);
});
test('concurrent assignments cannot create an overlap through individual API writes',async t=>{
 const {repo}=await repository(t);await repo.create('people',{id:'u1',name:'Person'});
 const row={personId:'u1',targetType:'property',targetId:'p',role:'Ansvarig',roleKey:'our',fromDate:'2026-01-01',toDate:''};
 const result=await Promise.allSettled([repo.create('assignments',{...row,id:'one'}),repo.create('assignments',{...row,id:'two'})]);assert.equal(result.filter(x=>x.status==='fulfilled').length,1);assert.equal((await repo.bootstrap()).assignments.length,1);
});
test('local HTTP API returns validation errors without changing saved history',async t=>{
 const {createLokalblickServer}=await import('../company/server.js');const {repo}=await repository(t);await repo.create('people',{id:'u1',name:'Person'});
 const server=createLokalblickServer(repo,{port:0});await new Promise(resolve=>server.once('listening',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const url='http://127.0.0.1:'+server.address().port;
 const data=await (await fetch(url+'/api/bootstrap')).json();model.change(data,{targetType:'property',targetId:'p',personId:'u1',fromDate:'2026-01-01'});
 let response=await fetch(url+'/api/workspace',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});assert.equal(response.status,200);
 const saved=await response.json(),invalid=structuredClone(saved);invalid.assignments.push({...invalid.assignments[0],id:'overlap'});
 response=await fetch(url+'/api/workspace',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(invalid)});assert.equal(response.status,400);
 const reread=await (await fetch(url+'/api/bootstrap')).json();assert.deepEqual(reread.assignments,saved.assignments);
});
