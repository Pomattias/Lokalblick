import {sourceServiceScript} from "./helpers/source-service.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {webcrypto} from 'node:crypto';
import {combineImportSources,profileWorkbook,prepareMappedImport,retargetColumn} from '../frontend/services/import-engine.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import '../frontend/domain/object-model.js';
const ctx=vm.createContext({window:{},XLSX,crypto:webcrypto});vm.runInContext(sourceServiceScript(),ctx,{filename:fs.realpathSync('frontend/services/source-service.js'),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});
const schemas=ctx.window.LokalblickSourceService.schemas;
function file(fileName,rows,key,sheetName='Underlag',date1904=false){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),sheetName);if(date1904)w.Workbook={WBProps:{date1904:true}};return {fileName,buffer:XLSX.write(w,{type:'array',bookType:'xlsx'}),sheets:[{name:key,sheetName}]};}
async function run(files,base={}){const combined=await combineImportSources(files,files.flatMap(f=>f.sheets.map(s=>s.name)),XLSX),profiles=profileWorkbook(combined.workbook,schemas,XLSX,base.importMappings||[]);return {combined,profiles,...prepareMappedImport(combined.workbook,profiles,base,{fingerprint:combined.fingerprint,fileName:files.map(f=>f.fileName).join(', '),actor:'Test',schemas},XLSX)};}
function fixture(){return [
 file('avtal.xlsx',[['Avtalsnummer','Objekt','Fastighet','Bashyra, tkr','t.o.m.'],['A-1','0001','Test 1','120,5','31/12/2027']],'a','Avtal'),
 file('objekt.xlsx',[['Objektnummer','Fastighet','Objektnamn'],['0001','Test 1','Kontor']],'o','Objekt'),
 file('fastigheter.xlsx',[['Fast.bet','Adress','Ort'],['Test 1','Testgatan 1','Malmö']],'p','Fastigheter'),
 file('extra.xlsx',[['Avtalsnummer','Fast.bet','Objektnummer','Bedömt belopp'],['A-1','Test 1','0001','25 kr']],'x','Avtal')];}
test('child-first files consolidate property, object and agreement with independent origins',async()=>{
 const r=await run(fixture());assert.equal(r.data.properties.length,1);assert.equal(r.data.objects.length,1);assert.equal(r.data.contracts.length,1);
 const p=r.data.properties[0],o=r.data.objects[0],c=r.data.contracts[0];assert.equal(o.propertyId,p.id);assert.equal(c.objectId,o.id);assert.equal(c.baseRent,120500);assert.equal(c.end,'2027-12-31');
 assert.equal(c.provenance.end.source,'avtal.xlsx');assert.equal(c.provenance.end.cell,'E2');assert.equal(o.provenance.name.source,'objekt.xlsx');
 assert.equal(c.supplemental[0].value,25);assert.equal(c.supplemental[0].type,'currency');assert.equal(c.supplemental[0].provenance.source,'extra.xlsx');
 assert.equal(r.report.consolidation.uniqueRecords,3);assert.ok(r.report.consolidation.mergedOccurrences>=3);assert.equal(r.report.counts.unresolved,0);
 const again=await run(fixture(),r.data);assert.equal(again.data.auditLog.length,r.data.auditLog.length);assert.equal(again.data.objects.length,1);
});
test('complementary batch produces same field values in reverse file order',async()=>{
 const a=await run(fixture()),b=await run(fixture().reverse());for(const [collection,fields] of [['properties',['designation','address','city']],['objects',['number','name']],['contracts',['number','baseRent','end']]])for(const field of fields)assert.equal(a.data[collection][0][field],b.data[collection][0][field]);
});
test('same sheet names from different files remain distinct in source and preview',async()=>{
 const r=await run([file('a.xlsx',[['Fast.bet','Adress'],['Test 1','Gatan']],'a'),file('b.xlsx',[['Fast.bet','Ort'],['Test 1','Malmö']],'b')]);
 assert.deepEqual(r.profiles.map(p=>p.name),['Underlag','Underlag']);assert.deepEqual(r.profiles.map(p=>p.sheetKey),['a','b']);assert.equal(r.data.properties.length,1);
 assert.equal(r.data.properties[0].provenance.address.source,'a.xlsx');assert.equal(r.data.properties[0].provenance.city.source,'b.xlsx');assert.equal(r.data.sourceRegistry.length,2);
 const html=columnPreviewHtml({fileName:'a.xlsx, b.xlsx'},{profiles:r.profiles},r,schemas);assert.ok(html.includes('a.xlsx · Underlag'));assert.ok(html.includes('b.xlsx · Underlag'));assert.ok(html.includes('2 filer'));assert.ok(!html.includes('data-transform'));
});
test('same object number on separate properties does not cross-connect agreements',async()=>{
 const files=[file('avtal.xlsx',[['Avtalsnummer','Objekt','Fastighet'],['A-1','01','Test 1'],['A-2','01','Test 2']],'a','Avtal'),file('objekt.xlsx',[['Objektnummer','Fastighet'],['01','Test 1'],['01','Test 2']],'o','Objekt'),file('fast.xlsx',[['Fast.bet'],['Test 1'],['Test 2']],'p','Fastigheter')];const r=await run(files);assert.equal(r.data.objects.length,2);assert.equal(r.data.contracts.length,2);assert.notEqual(r.data.contracts[0].objectId,r.data.contracts[1].objectId);assert.equal(r.report.counts.unresolved,0);
});
test('invalid dates, ambiguous parents and unattached agreements remain staged',async()=>{
 const r=await run([file('a.xlsx',[['Avtalsnummer','Objekt','t.o.m.'],['A-1','01','31/04/2027'],['A-2','01','31/12/2027']],'a','Avtal')],{properties:[{id:'p1'},{id:'p2'}],objects:[{id:'o1',number:'01',propertyId:'p1'},{id:'o2',number:'01',propertyId:'p2'}]});assert.equal(r.data.contracts.length,0);assert.equal(r.report.counts.unresolved,2);assert.ok(r.data.importReview[0].reason.includes('Ogiltigt datum'));
 const orphan=await run([file('b.xlsx',[['Avtalsnummer'],['A-1']],'b','Avtal')]);assert.equal(orphan.data.contracts.length,0);
});
test('per-file date systems remain correct when combined and column remapping resets identity',async()=>{
 const r=await run([file('a.xlsx',[['Avtalsnummer','Fastighet','t.o.m.'],['A-1','Test 1',46753]],'a','Avtal'),file('b.xlsx',[['Avtalsnummer','Fastighet','t.o.m.'],['A-2','Test 1',45291]],'b','Avtal',true),file('p.xlsx',[['Fast.bet'],['Test 1']],'p','Fastigheter')]);assert.deepEqual(r.data.contracts.map(c=>c.end),['2028-01-01','2028-01-01']);
 const col=r.profiles[0].columns[0];assert.equal(col.identity,true);retargetColumn(r.combined.workbook,r.profiles[0],col,'contracts.end',XLSX);assert.equal(col.identity,false);assert.equal(col.format.type,'date');assert.equal(col.format.invalid,1);
});
test('manual values survive batch consolidation and raw workbooks and base remain untouched',async()=>{
 const base={properties:[{id:'p',designation:'Test 1',address:'Manuell',provenance:{address:{source:'manual'}}}]},before=structuredClone(base),files=fixture(),buffers=files.map(f=>new Uint8Array(f.buffer).slice());const r=await run(files,base);assert.equal(r.data.properties[0].address,'Manuell');assert.ok(r.data.importReview.some(x=>x.protectedValue));assert.deepEqual(base,before);for(let i=0;i<files.length;i++)assert.deepEqual(new Uint8Array(files[i].buffer),buffers[i]);
});
test('known agreement anchors enrichment on property and object without creating duplicates',async()=>{
 const base={properties:[{id:'p',designation:'Test 1',city:'Malmö'}],objects:[{id:'o',propertyId:'p',number:'01'}],contracts:[{id:'c',number:'A-1',objectId:'o',propertyId:'p'}]};const r=await run([file('extra.xlsx',[['Avtalsnummer','Adress','Objektarea'],['A-1','Gatan','123,5']],'e','Avtal')],base);assert.equal(r.data.properties.length,1);assert.equal(r.data.objects.length,1);assert.equal(r.data.properties[0].address,'Gatan');assert.equal(r.data.objects[0].area,123.5);
});
test('local multi-file picker separates duplicated sheet names and cancellation clears pending data',async()=>{
 const files=fixture().slice(0,2);files.push(file('hyresunderlag.xlsx',[['Avtalsnummer','Grundhyra'],['A-1',120000]],'rent','Lokaldata'));let pickerOptions;const window={showOpenFilePicker:async options=>{pickerOptions=options;return files.map(f=>({queryPermission:async()=> 'granted',getFile:async()=>({name:f.fileName,arrayBuffer:async()=>f.buffer})}));}};const ctx=vm.createContext({window,XLSX,crypto:webcrypto,setTimeout});vm.runInContext(sourceServiceScript(),ctx,{filename:fs.realpathSync('frontend/services/source-service.js'),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});const service=window.LokalblickSourceService;
 const selected=await service.prepareImportWorkbook(()=>{},{multiple:true});assert.equal(pickerOptions.multiple,true);assert.equal(selected.fileCount,3);assert.equal(selected.sheets[2].recommended,true);assert.equal(selected.sheets[2].kind,'Avtal & avtalsposter');assert.equal(selected.sheets[2].financialColumns.join(', '),'Grundhyra');assert.equal(selected.sheets[0].sheetName,'Avtal');assert.equal(selected.sheets[0].name,'F0S0');assert.equal(selected.sheets[1].name,'F1S0');service.discardPreparedImport();await assert.rejects(service.prepareMapping({},[]),/Välj Excel-filen/);
});
test('normal file input handles local multiple files and cancellation without file-system API',async()=>{
 const files=fixture().slice(0,2);let cancel=false,input,removed=0;
 const document={body:{append(){}},createElement(){input={remove(){removed++;},click(){if(cancel)this.oncancel();else {this.files=files.map(f=>({name:f.fileName,arrayBuffer:async()=>f.buffer}));this.onchange();}}};return input;}};
 const window={},ctx=vm.createContext({window,document,XLSX,crypto:webcrypto,setTimeout});vm.runInContext(sourceServiceScript(),ctx,{filename:fs.realpathSync('frontend/services/source-service.js'),importModuleDynamically:vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER});const service=window.LokalblickSourceService;
 const selected=await service.prepareImportWorkbook(()=>{},{multiple:true});assert.equal(input.type,'file');assert.equal(input.multiple,true);assert.equal(selected.fileCount,2);assert.equal(removed,1);
 cancel=true;await assert.rejects(service.prepareImportWorkbook(()=>{},{multiple:true}),{name:'AbortError'});assert.equal(removed,2);await assert.rejects(service.prepareMapping({},[]),/Välj Excel-filen/);
});
test('activity files are linked after agreement creation and retain numeric costs and dates',async()=>{
 const files=fixture().slice(0,3);files.unshift(file('aktiviteter.xlsx',[['ID','Ärendenamn','Avtal','Bedömd kostnad, Mkr','Fr.o.m.','T.o.m.'],['ACT-1','Ombyggnad','A-1','6','01/08/2027','31/07/2028']],'act','Aktiviteter'));
 const r=await run(files);assert.equal(r.data.activities.length,1);assert.equal(r.data.activities[0].contractId,r.data.contracts[0].id);assert.equal(r.data.activities[0].estimatedCost,6000000);assert.equal(r.data.activities[0].startDate,'2027-08-01');
 const again=await run(files,r.data);assert.equal(again.data.activities.length,1);assert.equal(again.report.counts.fields,0);
});
