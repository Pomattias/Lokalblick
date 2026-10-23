import {sourceServiceScript} from "./helpers/source-service.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {webcrypto} from 'node:crypto';
import {combineImportSources,readImportSource,profileWorkbook,prepareMappedImport} from '../frontend/services/import-engine.js';
const rules=globalThis.LokalblickImportRules;
const ctx=vm.createContext({window:{},XLSX,crypto:webcrypto});
vm.runInContext(sourceServiceScript(),ctx);
const schemas=ctx.window.LokalblickSourceService.schemas;
globalThis.crypto ||= webcrypto;
function source(rows,name='Underlag'){
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),name);
 return {fileName:'test.xlsx',buffer:XLSX.write(w,{type:'array',bookType:'xlsx'}),sheets:[{name,sheetName:name}]};
}
async function run(file,base={}){
 const {workbook,fingerprint}=await combineImportSources([file],file.sheets.map(s=>s.name),XLSX);
 return prepareMappedImport(workbook,profileWorkbook(workbook,schemas,XLSX),base,{fingerprint,fileName:file.fileName,schemas,actor:'Test'},XLSX);
}
test('successive import enriches existing properties and builds linked objects and agreements including new properties',async()=>{
 const first=await run(source([['Fast.bet','Adress','Ort'],['Test 1','Gatan 1','Malmö']],'Fastigheter'));
 const propertyId=first.data.properties[0].id;
 const next=source([['Fast.bet','Adress','Ort','Objektnummer','Objektarea','Avtalsnummer','Bashyra, kr/år'],
  ['Test 1','Gatan 1','Malmö','01',100,'A1',120000],
  ['Test 1','Gatan 1','Malmö','01',100,'A2',130000],
  ['Test 2','Gatan 2','Lund','01',200,'A3',240000]],'Avtal');
 const second=await run(next,first.data);
 assert.equal(second.data.properties.length,2);assert.equal(second.data.properties[0].id,propertyId);
 assert.equal(second.data.objects.length,2);assert.equal(second.data.contracts.length,3);
 for(const c of second.data.contracts){const o=second.data.objects.find(o=>o.id===c.objectId);assert.ok(o);assert.equal(c.propertyId,o.propertyId);}
 assert.equal(second.data.contracts[0].objectId,second.data.contracts[1].objectId);
 assert.notEqual(second.data.contracts[0].objectId,second.data.contracts[2].objectId);
 assert.equal(second.data.objects[0].provenance.area.cell,'E2');
 const repeat=await run(next,second.data);assert.equal(repeat.data.auditLog.length,second.data.auditLog.length);
 assert.equal(repeat.report.counts.created,0);
});
test('indexed identities preserve duplicate and address safety, and refresh changed and newly created identities',()=>{
 const rows=[{id:'p1',designation:'Test',address:'Gatan',city:'Malmö'},{id:'p2',designation:'Test',address:'Gatan',city:'Lund'}],index=rules.createIndex(rows);
 for(const v of [{designation:'Test'},{address:'Gatan',city:'Malmö'},{designation:'Ny'}])assert.deepEqual(rules.identify(rows,v,'properties',[],index),rules.identify(rows,v,'properties'));
 rows[0].designation='Ändrad';index.update(rows[0]);assert.equal(rules.identify(rows,{designation:'Test'},'properties',[],index).record.id,'p2');
 const fresh={id:'p3',designation:'Ny'};rows.push(fresh);index.update(fresh);assert.equal(rules.identify(rows,{designation:'Ny'},'properties',[],index).record.id,'p3');
});
test('selected workbook is parsed once per selection while new selections and files stay isolated',async()=>{
 const f=source([['Fast.bet'],['Test 1']],'Fastigheter');let reads=0;
 const counted={...XLSX,read(...args){reads++;return XLSX.read(...args);}};
 const a=await combineImportSources([f],['Fastigheter'],counted);
 assert.equal(readImportSource(f,['Fastigheter'],counted).Sheets.Fastigheter,a.workbook.Sheets.Fastigheter);
 await combineImportSources([f],['Fastigheter'],counted);assert.equal(reads,1);
 readImportSource({...f},['Fastigheter'],counted);assert.equal(reads,2);
});
test('cached provenance matches uncached output for displaced and repeated headers with fewer cell reads',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['Intro'],['Adress','Namn'],['Gatan','A'],['Adress','Namn'],['Annan','B']]);
 let reads=0;const monitored=new Proxy(sheet,{get(target,key){if(!String(key).startsWith('!'))reads++;return target[key];}});
 const workbook={Sheets:{Data:monitored}},cache=new WeakMap();globalThis.XLSX=XLSX;
 const input={sourceSheet:'Data',sourceRow:5};rules.provenance(workbook,input,'address','test.xlsx',[],cache);reads=0;
 const fast=rules.provenance(workbook,input,'address','test.xlsx',[],cache),cachedReads=reads;reads=0;
 const slow=rules.provenance(workbook,input,'address','test.xlsx');
 delete fast.at;delete slow.at;assert.deepEqual(fast,slow);assert.ok(cachedReads<reads);assert.equal(fast.cell,'A5');
});
