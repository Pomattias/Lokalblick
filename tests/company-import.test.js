import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {LokalblickRepository} from '../backend/company/data-repository.js';
import {createLokalblickServer} from '../backend/company/server.js';
import {normalize} from '../frontend/v2/model.js';
import {createTransport} from '../frontend/v2/transport.js';
const sourceAdapter={loadCore:async()=>({properties:[{id:'p',designation:'Test 1',address:'Gatan',city:'Malmö'}],contracts:[{id:'c',number:'A-1',propertyId:'p',area:100}]}),loadCoordinates:async()=>[]};
async function setup(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lokalblick-import-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const dataPath=path.join(dir,'data.json'),repo=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();return {repo,dataPath};}
function proposed(base){const data=normalize(base);data.properties.push({id:'p2',designation:'Test 2',city:'Malmö'});data.objects.push({id:'o2',number:'01',propertyId:'p2',start:'2027-01-01',end:''});data.contracts.push({id:'c2',number:'A-2',propertyId:'p2',objectId:'o2',area:120,baseRent:120000,rentIndexPercent:0,start:'2027-01-01',end:'2027-12-31'});data.activities.push({id:'a',sourceId:'ACT-1',type:'Projekt',contractId:'c2',title:'Ombyggnad',estimatedCost:6000000,startDate:'2027-08-01',endDate:'2028-07-31'});data.orders.push({id:'order',orderReference:'REQ-1',activityId:'a',orderedCost:100,finalCost:0,completedAt:'2027-08-01'});data.sourceRegistry.push({id:'s',name:'syntetisk.xlsx'});data.importMappings=[{id:'m',sheet:'Avtal'}];data.importFieldPreferences={'contracts|baseRent|syntetisk.xlsx':'accept'};return data;}
test('preview is read only and approved company import persists core, objects, orders and source history through refresh and restart',async t=>{
 const {repo,dataPath}=await setup(t),base=await repo.bootstrap(),before=await fs.readFile(dataPath,'utf8'),data=proposed(base);
 const preview=await repo.previewImport({data,baseRevision:base.workspaceRevision,report:{fileName:'syntetisk.xlsx'}});assert.equal(await fs.readFile(dataPath,'utf8'),before);assert.equal((await repo.bootstrap()).contracts.length,1);
 const applied=normalize(await repo.applyImport({previewId:preview.previewId}));assert.equal(applied.contracts.length,2);assert.equal(applied.orders[0].activityId,'a');assert.equal(applied.orders[0].finalCost,0);assert.equal(applied.importMappings.length,1);assert.equal(applied.importFieldPreferences['contracts|baseRent|syntetisk.xlsx'],'accept');assert.ok(applied.auditLog.some(x=>x.recordId==='c2'));
 const refreshed=normalize(await repo.refreshSource());assert.equal(refreshed.contracts.length,2);assert.equal(refreshed.activities[0].estimatedCost,6000000);
 const reopened=await new LokalblickRepository({sourceAdapter,dataPath}).initialize(),reloaded=normalize(await reopened.bootstrap());assert.equal(reloaded.contracts.find(c=>c.id==='c2').objectId,'o2');assert.equal(reloaded.auditLog.length,applied.auditLog.length);
 const repeated=await reopened.previewImport({data:reloaded,baseRevision:reloaded.workspaceRevision,report:{fileName:'syntetisk.xlsx'}});assert.equal(repeated.report.changes.length,0);assert.equal(repeated.data.auditLog.length,reloaded.auditLog.length);
});
test('stale, ambiguous or invalid company imports cannot partially write data',async t=>{
 const {repo,dataPath}=await setup(t),base=await repo.bootstrap();const preview=await repo.previewImport({data:proposed(base),baseRevision:base.workspaceRevision});await repo.create('people',{id:'person',name:'Test'});const afterEdit=await fs.readFile(dataPath,'utf8');
 await assert.rejects(repo.applyImport({previewId:preview.previewId}),e=>e.statusCode===409);assert.equal(await fs.readFile(dataPath,'utf8'),afterEdit);
 await assert.rejects(repo.previewImport({data:proposed(base),baseRevision:base.workspaceRevision}),e=>e.statusCode===409);
 const current=await repo.bootstrap(),invalid=proposed(current);invalid.orders[0].activityId='missing';await assert.rejects(repo.previewImport({data:invalid}),/aktivitet/);assert.equal(await fs.readFile(dataPath,'utf8'),afterEdit);
 const dates=proposed(current);dates.contracts.find(c=>c.id==='c2').end='2027-02-29';await assert.rejects(repo.previewImport({data:dates}),/datum/);assert.equal(await fs.readFile(dataPath,'utf8'),afterEdit);
});
test('API transport completes company import and backend preserves manual fields and per-file priorities',async t=>{
 const {repo}=await setup(t),base=normalize(await repo.bootstrap());base.contracts[0].baseRent=100;base.contracts[0].provenance={baseRent:{source:'manual',value:100}};base.auditLog=[{id:'old',collection:'contracts',recordId:'c',action:'Ändrad'}];base.budgetData=[{id:'lokalblick-v2-workspace',workspace:{auditLog:base.auditLog}}];await repo.saveWorkspace(base);
 const server=createLokalblickServer(repo,{port:0});await new Promise(r=>server.on('listening',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port;
 const request=async(endpoint,payload)=>{const response=await fetch(url+endpoint,{method:payload?'POST':'GET',headers:{'Content-Type':'application/json'},body:payload?JSON.stringify(payload):undefined});const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value;};
 const savedWindow=globalThis.window;globalThis.window={LokalblickDataService:{mode:'company-api',load:()=>request('/api/bootstrap'),previewImport:p=>request('/api/imports/preview',p),applyImport:p=>request('/api/imports/apply',p)}};t.after(()=>{globalThis.window=savedWindow;});
 const transport=createTransport(),current=await transport.load(),data=proposed(current);data.contracts[0].baseRent=200;data.contracts[0].provenance.baseRent={source:'syntetisk.xlsx',value:200,cell:'D2'};data.importFieldPreferences['contracts|baseRent|syntetisk.xlsx']='accept';const imported=await transport.commitImport({data,report:{fileName:'syntetisk.xlsx'}});
 assert.equal(imported.contracts[0].baseRent,100);assert.equal(imported.contracts.length,2);assert.ok(imported.importReview.some(x=>x.protectedValue));assert.ok(imported.auditLog.some(x=>x.id==='old'));
});
test('explicit object field review updates the stored object and survives later ordinary saves',async t=>{
 const {repo}=await setup(t),base=normalize(await repo.bootstrap());base.objects[0].area=120;base.objects[0].provenance={area:{source:'syntetisk.xlsx',value:120,cell:'C2'}};
 const preview=await repo.previewImport({data:base,report:{fileName:'syntetisk.xlsx'}});const applied=normalize(await repo.applyImport({previewId:preview.previewId}));assert.equal(applied.contracts[0].area,100);
 const {resolveReview}=await import('../frontend/v2/model.js');const review=applied.importReview.find(r=>r.field==='area');resolveReview(applied,review.id,'accept','','Test');
 applied.budgetData=[{id:'lokalblick-v2-workspace',workspace:{importReview:applied.importReview,auditLog:applied.auditLog}}];
 const saved=normalize(await repo.saveWorkspace(applied));assert.equal(saved.contracts[0].area,120);saved.contracts[0].comment='Ny anteckning';const again=normalize(await repo.saveWorkspace(saved));assert.equal(again.contracts[0].area,120);assert.equal(again.contracts[0].comment,'Ny anteckning');
});
test('source refresh uses the same priority rules and never freezes untouched master fields',async t=>{
 const {repo,dataPath}=await setup(t),base=normalize(await repo.bootstrap()),preview=await repo.previewImport({data:proposed(base),report:{fileName:'syntetisk.xlsx'}});await repo.applyImport({previewId:preview.previewId});
 const loaded=await sourceAdapter.loadCore();loaded.contracts[0].area=200;repo.sourceAdapter={...sourceAdapter,loadCore:async()=>loaded};
 const refreshed=normalize(await repo.refreshSource());assert.equal(refreshed.contracts.find(c=>c.id==='c').area,100);assert.ok(refreshed.importReview.some(r=>r.source==='LEB'&&r.field==='area'&&r.proposed===200));
 refreshed.importFieldPreferences['objects|area|leb']='accept';refreshed.budgetData=[{id:'lokalblick-v2-workspace',workspace:{importReview:refreshed.importReview,importFieldPreferences:refreshed.importFieldPreferences,auditLog:refreshed.auditLog}}];await repo.saveWorkspace(refreshed);
 const accepted=normalize(await repo.refreshSource());assert.equal(accepted.contracts.find(c=>c.id==='c').area,200);
 const reopened=await new LokalblickRepository({sourceAdapter:repo.sourceAdapter,dataPath}).initialize();assert.equal(normalize(await reopened.bootstrap()).contracts.find(c=>c.id==='c').area,200);
});
test('additional agreement fields persist through approved import and restart, with valid termination dates',async t=>{
 const {repo,dataPath}=await setup(t),base=await repo.bootstrap(),data=proposed(base);
 const fields={terminatedOn:'2027-06-30',terminationReason:'Avveckling',use:'Träffpunkt',businessDescription:'Kommunal primärvård.',employees:12.5,category:'KP Kontor- och personallokaler',contractDocumentUrl:'https://example.invalid/a.pdf'};
 Object.assign(data.contracts.find(c=>c.id==='c2'),fields);data.objects.find(o=>o.id==='o2').apartmentArea=245.5;
 const invalid=structuredClone(data);invalid.contracts.find(c=>c.id==='c2').terminatedOn='2027-02-29';
 await assert.rejects(repo.previewImport({data:invalid,baseRevision:base.workspaceRevision,report:{fileName:'fel.xlsx'}}),/datum/);
 assert.equal((await repo.bootstrap()).contracts.length,1);
 const preview=await repo.previewImport({data,baseRevision:base.workspaceRevision,report:{fileName:'syntetiskt.xlsx'}});await repo.applyImport({previewId:preview.previewId});
 const reopened=await new LokalblickRepository({sourceAdapter,dataPath}).initialize(),saved=await reopened.bootstrap();
 for(const [field,value] of Object.entries(fields))assert.equal(saved.contracts.find(c=>c.id==='c2')[field],value,field);assert.equal(saved.objects.find(o=>o.id==='o2').apartmentArea,245.5);
});
