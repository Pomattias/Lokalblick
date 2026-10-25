import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {emptyData,propertySummary} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importCreationPlan,approveImportPlan} from '../frontend/lokaler/import-plan.js';

for(const mode of ['sqlite','excel'])test(`${mode}: distinct agreement IDs with equal or missing dates share an object and survive reimport`,async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'simultaneous-agreements-')),file=path.join(dir,mode==='sqlite'?'data.sqlite':'data.xlsx');let store=await LocalStore.open({file,mode});
 try{
  const base=emptyData();base.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:123}}];
  const book=XLSX.utils.book_new(),targets=['properties.id','properties.designation','objects.id','objects.area','contracts.id','contracts.start','contracts.end','agreementItems.baseAmount'];
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([targets,...[1,2,3,4].map(n=>['P1','TESTET 1','864-3',40,'864-3-010'+n,n<=2?'2027-01-01':'',n<=2?'2028-12-31':'',1000])]),'Avtal');
  const profiles=profileWorkbook(book,importSchemas,XLSX,[],{reviewed:true});profiles[0].columns.forEach((c,i)=>Object.assign(c,{target:targets[i],approved:true,...(i===7?{itemType:'base'}:{})}));
  const run=prior=>prepareCleanImport(book,profiles,prior,{fileName:'syntetiskt.xlsx'},XLSX),r=run(base);
  assert.equal(r.report.blocking,0);assert.equal(r.report.review,0);assert.equal(r.clean.agreements.length,4);assert.equal(r.clean.objects.length,1);
  const choices=Object.fromEntries(importCreationPlan(r,base).map(e=>[e.key,{signature:e.signature,action:'create'}])),approved=approveImportPlan(r,base,choices);
  await store.replace(approved.clean,0);assert.equal(propertySummary(store.snapshot().data,'P1','2027-06-01').area,40,'Concurrent agreements never multiply object area');
  const before=store.snapshot();await assert.rejects(store.mutate([{table:'agreements',create:true,record:{id:'864-3-0101',object_id:'864-3'}}],before.version),/ID finns redan/);assert.deepEqual(store.snapshot(),before);
  await assert.rejects(store.mutate([{table:'agreements',record:{id:'INVALID',object_id:'864-3',valid_from:'2028-01-01',valid_to:'2027-01-01'}}],before.version),/Slutdatum/);
  await assert.rejects(store.mutate([{table:'agreement_items',record:{id:'SECOND-BASE',agreement_id:'864-3-0101',type:'base',name:'Extra bashyra',base_amount:500}}],before.version),/Endast en bashyra/);
  await store.close();store=await LocalStore.open({file,mode});const saved=store.snapshot();assert.deepEqual(saved.data,before.data);
  const again=run(saved.data);assert.equal(again.report.blocking,0);assert.equal(again.report.review,0);assert.equal(importCreationPlan(again,saved.data).length,0);assert.equal(again.clean.agreements.length,4);assert.equal(again.clean.agreement_items.length,4);assert.deepEqual(again.clean.workspace.budgetPlans,base.workspace.budgetPlans);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('opening an existing SQLite workspace removes obsolete agreement-overlap triggers without changing records',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'obsolete-agreement-trigger-')),file=path.join(dir,'data.sqlite');let store=await LocalStore.open({file});
 try{
  await store.mutate([{table:'properties',record:{id:'P',name:'TESTET 1'}},{table:'objects',record:{id:'O',property_id:'P'}},{table:'agreements',record:{id:'A',object_id:'O'}}],0);
  for(const [name,action]of [['agreement_overlap_insert','INSERT'],['agreement_overlap_update','UPDATE']])store.db.exec(`CREATE TRIGGER ${name} BEFORE ${action} ON agreements BEGIN SELECT RAISE(ABORT,'old restriction'); END`);
  const before=store.snapshot();await store.close();store=await LocalStore.open({file});assert.deepEqual(store.snapshot(),before);
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'agreement_overlap_%'").get().n,0);
  await store.mutate([{table:'agreements',record:{id:'B',object_id:'O'}}],before.version);assert.equal(store.snapshot().data.agreements.length,2);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
