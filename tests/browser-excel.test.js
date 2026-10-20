import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {BrowserExcel} from '../frontend/lokaler/excel-client.js';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {readWorkbook,writeWorkbook} from '../frontend/lokaler/workbook.js';

const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
function fixture(name='Testfastighet'){
 const data=emptyData();data.properties.push(normalize('properties',{id:'F1',name}));
 data.workspace.budgetPlans=[{id:'syntetisk-plan',status:'locked',snapshot:{rent:12345},notes:'Syntetiskt låst underlag'}];
 data.workspace.auditLog=[{id:'test-audit',action:'Syntetisk historik'}];return data;
}
async function setup(t,data=fixture()){
 const originalWorker=globalThis.Worker,originalWindow=globalThis.window;
 t.after(()=>{globalThis.Worker=originalWorker;globalThis.window=originalWindow;});
 const jobs={workers:[],hold:null,error:null};
 globalThis.Worker=class{
  constructor(){this.terminated=false;jobs.workers.push(this);}
  terminate(){this.terminated=true;}
  postMessage({operation,input}){
   const error=jobs.error;jobs.error=null;
   if(error==='post')throw Object.assign(Error('Kunde inte kopiera Excel-underlaget'),{name:'DataCloneError'});
   const hold=jobs.hold?.operation===operation?jobs.hold:null;if(hold)jobs.hold=null;
   queueMicrotask(async()=>{
    try{
     if(hold){hold.started.resolve();await hold.promise;}
     if(this.terminated)return;
     if(error==='event'){this.onerror({preventDefault(){}});return;}
     if(error==='message'){this.onmessageerror();return;}
     if(error==='reply'){this.onmessage({data:{error:'Excel-underlaget kunde inte behandlas'}});return;}
     const result=operation==='read'?await readWorkbook(input,ExcelJS):await writeWorkbook(input,ExcelJS);
     if(!this.terminated)this.onmessage({data:{result}});
    }catch(failure){if(!this.terminated)this.onmessage({data:{error:failure.message}});}
   });
  }
 };
 globalThis.window={isSecureContext:true,showOpenFilePicker(){},showSaveFilePicker(){}};
 const state={bytes:Uint8Array.from(await writeWorkbook(data,ExcelJS)),locked:false,aborts:0,opens:0,fail:null,beforeOpen:null,closeHold:null};
 const handle={name:'syntetiskt.xlsx',
  async getFile(){const bytes=state.bytes.slice();return {size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer};},
  async createWritable(options){
   if(options?.mode==='exclusive'&&state.locked)throw Object.assign(Error('Låst'),{name:'NoModificationAllowedError'});
   await state.beforeOpen?.();state.beforeOpen=null;state.opens++;state.locked=true;
   let pending;
   return {
    async write(bytes){if(state.fail==='write'){state.fail=null;throw Error('Skrivfel');}pending=Uint8Array.from(bytes);},
    async close(){if(state.closeHold){const hold=state.closeHold;state.closeHold=null;hold.started.resolve();await hold.promise;}if(state.fail==='close'){state.fail=null;throw Error('Stängningsfel');}state.bytes=pending;state.locked=false;},
    async abort(){state.aborts++;state.locked=false;}
   };
  }
 };
 const store=new BrowserExcel(handle);await store.reload();
 const hold=operation=>jobs.hold={...deferred(),operation,started:deferred()};
 return {store,state,handle,jobs,hold};
}

test('reload excludes concurrent reads and saves, then allows a fresh save without losing state',async t=>{
 const {store,hold,state}=await setup(t),gate=hold('read'),version=store.version,pending=store.reload();await gate.started.promise;
 assert.equal(store.busy,true);
 await assert.rejects(store.reload(),/filåtgärd pågår/);await assert.rejects(store.replace(fixture('Ny'),version),/filåtgärd pågår/);await assert.rejects(store.save('properties',{id:'F1',name:'Ny'},version),/filåtgärd pågår/);
 gate.resolve();await pending;assert.equal(store.busy,false);assert.equal(store.version,version+1);assert.equal(store.data.properties[0].name,'Testfastighet');
 await store.save('properties',{id:'F1',name:'Ny'},store.version);assert.equal((await readWorkbook(state.bytes,ExcelJS)).properties[0].name,'Ny');
});

test('a pending save excludes reload and replacement until its new file and state are committed',async t=>{
 const {store,hold,state}=await setup(t),gate=hold('write'),old=store.snapshot(),next=fixture('Sparad ändring'),pending=store.replace(next,old.version);await gate.started.promise;
 await assert.rejects(store.reload(),/filåtgärd pågår/);await assert.rejects(store.replace(fixture('Överskrivning'),old.version),/filåtgärd pågår/);
 assert.deepEqual(store.snapshot(),old);gate.resolve();await pending;assert.equal(store.busy,false);assert.equal(store.version,old.version+1);assert.deepEqual(await readWorkbook(state.bytes,ExcelJS),next);
});

test('an external change while the write stream opens is preserved and can be reloaded before retry',async t=>{
 const {store,state}=await setup(t),old=structuredClone(store.snapshot()),oldHash=store.fileHash,external=fixture('Extern ändring'),externalBytes=Uint8Array.from(await writeWorkbook(external,ExcelJS));
 state.beforeOpen=async()=>{state.bytes=externalBytes.slice();};
 await assert.rejects(store.replace(fixture('Lokal ändring'),old.version),/ändrats utanför appen/);
 assert.deepEqual(state.bytes,externalBytes);assert.deepEqual(store.snapshot(),old);assert.equal(store.fileHash,oldHash);assert.equal(store.busy,false);assert.equal(state.aborts,1);assert.equal(state.locked,false);
 await store.reload();assert.deepEqual(store.data,external);await store.replace(fixture('Godkänd ändring'),store.version);assert.equal((await readWorkbook(state.bytes,ExcelJS)).properties[0].name,'Godkänd ändring');
});

test('two instances cannot write the same file together or overwrite a newly committed version',async t=>{
 const {store,state,handle}=await setup(t),other=new BrowserExcel(handle);await other.reload();
 const closeHold={...deferred(),started:deferred()};state.closeHold=closeHold;const saving=store.replace(fixture('Första ändringen'),store.version);await closeHold.started.promise;
 await assert.rejects(other.replace(fixture('Andra ändringen'),other.version),/låst eller skrivskyddad/);assert.equal(other.busy,false);assert.equal(state.aborts,0);
 closeHold.resolve();await saving;assert.equal((await readWorkbook(state.bytes,ExcelJS)).properties[0].name,'Första ändringen');
 await assert.rejects(other.replace(fixture('Andra ändringen'),other.version),/ändrats utanför appen/);assert.equal(state.aborts,1);
 await other.reload();await other.replace(fixture('Andra ändringen'),other.version);assert.equal((await readWorkbook(state.bytes,ExcelJS)).properties[0].name,'Andra ändringen');
});

for(const failure of ['write','close'])test(failure+' failure aborts the file, preserves history and version, and allows retry',async t=>{
 const {store,state}=await setup(t),old=structuredClone(store.snapshot()),bytes=state.bytes.slice(),hash=store.fileHash;state.fail=failure;
 await assert.rejects(store.replace(fixture('Ny ändring'),old.version),/fel/);
 assert.deepEqual(state.bytes,bytes);assert.deepEqual(store.snapshot(),old);assert.equal(store.fileHash,hash);assert.equal(store.busy,false);assert.equal(state.locked,false);assert.equal(state.aborts,1);
 await store.replace(fixture('Ny ändring'),old.version);const saved=await readWorkbook(state.bytes,ExcelJS);assert.deepEqual(saved.workspace,old.data.workspace);assert.equal(saved.properties[0].name,'Ny ändring');assert.equal(store.version,old.version+1);
});

test('a create operation never overwrites data added while its new write stream opens',async t=>{
 const {handle,state}=await setup(t),external=state.bytes.slice();state.bytes=new Uint8Array();state.beforeOpen=async()=>{state.bytes=external.slice();};
 await assert.rejects(BrowserExcel.connect(true,()=>{},handle),/Filen har fått innehåll/);assert.deepEqual(state.bytes,external);assert.equal(state.aborts,1);assert.equal(state.locked,false);
});

test('failed workbook reads preserve state and release the operation lock',async t=>{
 const {store,state}=await setup(t),old=structuredClone(store.snapshot()),hash=store.fileHash,valid=state.bytes.slice();state.bytes=new TextEncoder().encode('Inte en Excel-arbetsbok');
 await assert.rejects(store.reload());assert.deepEqual(store.snapshot(),old);assert.equal(store.fileHash,hash);assert.equal(store.busy,false);
 state.bytes=valid;await store.reload();assert.equal(store.version,old.version+1);assert.deepEqual(store.data,old.data);
});

test('worker posting, execution and message failures release resources and permit another save',async t=>{
 const {store,state,jobs}=await setup(t);
 for(const error of ['post','event','message','reply']){
  const old=structuredClone(store.snapshot()),bytes=state.bytes.slice();jobs.error=error;
  await assert.rejects(store.replace(fixture('Ny ändring'),store.version));assert.equal(jobs.workers.at(-1).terminated,true);assert.equal(store.busy,false);assert.deepEqual(store.snapshot(),old);assert.deepEqual(state.bytes,bytes);
  await store.replace(fixture('Ny ändring'),store.version);assert.equal(store.version,old.version+1);
 }
 assert(jobs.workers.every(worker=>worker.terminated));
});

test('worker timeout releases the file operation and leaves a retry possible',async t=>{
 const {store,state,hold,jobs}=await setup(t),old=structuredClone(store.snapshot()),bytes=state.bytes.slice(),gate=hold('write');
 t.mock.timers.enable({apis:['setTimeout']});const saving=store.replace(fixture('Ny ändring'),store.version);await gate.started.promise;
 const rejected=assert.rejects(saving,/30 sekunder/);t.mock.timers.tick(30000);await rejected;t.mock.timers.reset();
 assert.equal(jobs.workers.at(-1).terminated,true);assert.equal(store.busy,false);assert.deepEqual(store.snapshot(),old);assert.deepEqual(state.bytes,bytes);gate.resolve();
 await store.replace(fixture('Ny ändring'),store.version);assert.equal(store.version,old.version+1);
});

test('stale or missing versions and validation errors do not start a file write',async t=>{
 const {store,state,jobs}=await setup(t),old=structuredClone(store.snapshot()),jobsBefore=jobs.workers.length;
 await assert.rejects(store.replace(fixture('Ny'),old.version-1),/har ändrats/);await assert.rejects(store.replace(fixture('Ny')),/har ändrats/);await assert.rejects(store.save('properties',{id:'F1',name:'Ny'},old.version-1),/har ändrats/);
 await assert.rejects(store.save('agreements',{object_id:'O1'},old.version),/AvtalsID/);await assert.rejects(store.save('properties',{id:'F1',name:'Ny'},old.version,true),/ID finns redan/);
 assert.equal(jobs.workers.length,jobsBefore);assert.equal(state.opens,0);assert.equal(store.busy,false);assert.deepEqual(store.snapshot(),old);
 await store.replace(fixture('Ny'),old.version);assert.equal(store.version,old.version+1);
});
