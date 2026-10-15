import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import XLSX from 'xlsx';import {normalize} from '../frontend/v2/model.js';import {profileWorkbook,prepareMappedImport} from '../frontend/services/import-engine.js';import {webcrypto} from 'node:crypto';
const model=globalThis.LokalblickObjectModel;
test('legacy contract migration is stable and does not borrow agreement dates',()=>{
 const data=normalize({properties:[{id:'p'}],contracts:[{id:'a',propertyId:'p',start:'2020-01-01',end:'2030-12-31',area:100},{id:'b',propertyId:'p',area:200}]});
 assert.equal(data.objects.length,2);assert.equal(data.objects[0].start,'');assert.equal(data.objects[0].end,'');assert.equal(data.objects[0].area,100);
 const again=normalize(data);assert.deepEqual(again.objects,data.objects);assert.equal(again.contracts[0].objectId,data.objects[0].id);
});
test('two agreements over time refer to one object without duplicating object',()=>{
 const data=normalize({properties:[{id:'p'}],objects:[{id:'o',propertyId:'p',number:'O-1',start:'2010-01-01'}],contracts:[{id:'a',objectId:'o',start:'2020-01-01',end:'2025-12-31'},{id:'b',objectId:'o',start:'2026-01-01',end:'2030-12-31'}]});
 assert.equal(data.objects.length,1);assert.equal(data.contracts[1].propertyId,'p');assert.equal(data.objects[0].start,'2010-01-01');model.validate(data);
});
test('division and merge preserve predecessor identity and reject cycles or missing dates',()=>{
 const data={properties:[{id:'p'}],objects:[{id:'old',propertyId:'p',end:'2026-12-31'},{id:'a',propertyId:'p',start:'2027-01-01',end:'2027-12-31',predecessorIds:['old']},{id:'b',propertyId:'p',start:'2027-01-01',end:'2027-12-31',predecessorIds:['old']},{id:'merged',propertyId:'p',start:'2028-01-01',predecessorIds:['a','b']}],contracts:[]};
 model.validate(data);data.objects[0].predecessorIds=['merged'];assert.throws(()=>model.validate(data));
 delete data.objects[0].predecessorIds;data.objects[0].end='';assert.throws(()=>model.validate(data),/Avsluta/);
});
function adapter(){const ctx=vm.createContext({window:{},XLSX,crypto:webcrypto});vm.runInContext(fs.readFileSync('frontend/domain/object-model.js','utf8'),ctx);vm.runInContext(fs.readFileSync('frontend/services/source-service.js','utf8'),ctx);return ctx.window.LokalblickSourceService;}
test('objects and contract/object activity links roundtrip through real XLSX',()=>{
 const service=adapter(),data=normalize({properties:[{id:'p',address:'Testgatan',city:'Malmö'}],objects:[{id:'old',propertyId:'p',end:'2026-12-31',number:'O-old'},{id:'o',propertyId:'p',number:'O-1',area:100,start:'2027-01-01',predecessorIds:['old']}],contracts:[{id:'c',objectId:'o',number:'A-1',start:'2027-02-01'}],activities:[{id:'act',objectId:'o',scopeType:'object',type:'Projekt',title:'Tak',planningYear:2027,estimatedCost:100}]});
 const workbook=service.dataToWorkbook(data);assert.ok(workbook.Sheets.Objekt);
 const buffer=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),read=normalize(service.workbookToData(XLSX.read(buffer,{type:'buffer'})));
 assert.equal(read.objects.length,2);assert.equal(read.contracts[0].objectId,'o');assert.deepEqual(read.objects.find(o=>o.id==='o').predecessorIds,['old']);assert.equal(read.activities[0].objectId,'o');
});
test('one worksheet maps property then object then agreements with unique parent relations',()=>{
 const service=adapter(),w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Fastighetsbeteckning','Adress','Ort','Objektnummer','Objektarea','Avtalsnummer'],['Ek 1','Gatan 1','Malmö','O-1',100,'A-1'],['Ek 1','Gatan 1','Malmö','O-1',100,'A-2']]),'Lokallista');
 const profiles=profileWorkbook(w,service.schemas,XLSX),result=prepareMappedImport(w,profiles,{}, {fileName:'test.xlsx',fingerprint:'objecttest',schemas:service.schemas,actor:'Test'},XLSX);
 assert.equal(result.data.properties.length,1);assert.equal(result.data.objects.length,1);assert.equal(result.data.contracts.length,2);assert.equal(result.data.contracts[0].objectId,result.data.objects[0].id);assert.equal(result.data.contracts[1].objectId,result.data.objects[0].id);
});
test('object activity is budgeted once while old agreements fall outside budget year',async()=>{
 await import('../frontend/domain/calculations.js');
 const data=normalize({properties:[{id:'p'}],objects:[{id:'o',propertyId:'p',number:'O',unitId:'VARDBO'}],contracts:[{id:'old',objectId:'o',start:'2020-01-01',end:'2025-12-31',baseRent:1000,rentBaseYear:2025,rentIndexPercent:0},{id:'now',objectId:'o',start:'2026-01-01',end:'2027-12-31',baseRent:2000,rentBaseYear:2025,rentIndexPercent:0}],activities:[{id:'act',objectId:'o',scopeType:'object',title:'Tak',type:'Projekt',planningYear:2027,estimatedCost:6000000,startDate:'2027-08-01',endDate:'2028-07-31'}]});
 const rows=globalThis.LokalblickCalculations.budgetRows(data,2027);
 assert.equal(rows.filter(r=>r.sourceType==='contract').length,1);
 assert.equal(rows.filter(r=>r.sourceId==='act').length,1);assert.equal(rows.find(r=>r.sourceId==='act').amount,2500000);assert.equal(rows.find(r=>r.sourceId==='act').objectId,'o');
 const {scope}=await import('../frontend/v2/model.js');const scoped=scope(data,{unit:'VARDBO'});assert.equal(scoped.objects.length,1);assert.equal(scoped.items.length,1);
});
test('backend persists object dates and links across restart and blocks referenced deletion',async()=>{
 const {LokalblickRepository}=await import('../backend/company/data-repository.js');const fsp=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'lokalblick-objects-')),dataPath=path.join(dir,'store.json');
 const sourceAdapter={loadCore:async()=>({properties:[{id:'p'}],objects:[{id:'o',propertyId:'p',number:'O'}],contracts:[{id:'c',objectId:'o',propertyId:'p',number:'A'}]}),loadCoordinates:async()=>[]};
 try{const repo=await new LokalblickRepository({sourceAdapter,dataPath}).initialize(),data=await repo.bootstrap();assert.equal(data.objects.length,1);
 data.objects[0].start='2000-01-01';data.activities=[{id:'a',title:'Tak',type:'Projekt',objectId:'o',scopeType:'object'}];await repo.saveWorkspace(data);
 const restarted=await new LokalblickRepository({sourceAdapter,dataPath}).initialize(),read=await restarted.bootstrap();
 assert.equal(read.objects.length,1);assert.equal(read.objects[0].start,'2000-01-01');assert.equal(read.contracts[0].objectId,'o');assert.equal(read.activities[0].objectId,'o');
 await assert.rejects(()=>restarted.delete('objects','o'),/får inte raderas/);
 }finally{await fsp.rm(dir,{recursive:true,force:true});}
});
test('a property alone cannot identify an object during import',()=>{
 const service=adapter(),w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Fastighet','Objektarea'],['p',100]]),'Objekt');
 const profiles=profileWorkbook(w,service.schemas,XLSX);profiles[0].columns[0].target='objects.propertyId';
 const result=prepareMappedImport(w,profiles,{properties:[{id:'p'}],objects:[{id:'o',propertyId:'p',number:'O',area:50}]},{fileName:'test.xlsx',fingerprint:'noidentity',schemas:service.schemas,actor:'Test'},XLSX);
 assert.equal(result.data.objects.length,1);assert.equal(result.data.objects[0].area,50);assert.ok(result.data.importReview.some(r=>r.collection==='objects'));
});
test('object HTTP endpoints create, edit and validate property relations',async()=>{
 const {LokalblickRepository}=await import('../backend/company/data-repository.js');const {createLokalblickServer}=await import('../backend/company/server.js');const fsp=await import('node:fs/promises');const os=await import('node:os');const path=await import('node:path');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'lokalblick-object-api-')),sourceAdapter={loadCore:async()=>({properties:[{id:'p'}],contracts:[]}),loadCoordinates:async()=>[]};
 const repo=await new LokalblickRepository({sourceAdapter,dataPath:path.join(dir,'store.json')}).initialize(),server=createLokalblickServer(repo,{port:0});await new Promise(resolve=>server.on('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
 try{const post=await fetch(base+'/api/objects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'o',propertyId:'p',number:'O'})});assert.equal(post.status,201);
 const edit=await fetch(base+'/api/objects/o',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:'2027-01-01'})});assert.equal(edit.status,200);
 const list=await (await fetch(base+'/api/objects')).json();assert.equal(list[0].start,'2027-01-01');
 const bad=await fetch(base+'/api/objects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'bad',propertyId:'missing'})});assert.equal(bad.status,400);
 }finally{await new Promise(resolve=>server.close(resolve));await fsp.rm(dir,{recursive:true,force:true});}
});
test('object editor names predecessors and preserves unrecognized imported verksamhet',async()=>{
 const {editorHtml}=await import('../frontend/v2/editor.js'),previousWindow=globalThis.window;
 globalThis.window={LokalblickSourceService:adapter()};
 try{const data=normalize({properties:[{id:'p'}],objects:[{id:'old',propertyId:'p',name:'Tidigare lokal',end:'2026-12-31'},{id:'o',propertyId:'p',name:'Ny lokal',unitId:'Äldre verksamhet',start:'2027-01-01',predecessorIds:['old']}]}),html=editorHtml(data,'objects','o').html;
 assert.ok(html.includes('Tidigare lokal'));assert.ok(html.includes('name="predecessorIds" multiple'));
 assert.ok(html.includes('value="Äldre verksamhet" selected'));
 }finally{globalThis.window=previousWindow;}
});
