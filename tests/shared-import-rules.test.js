import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {webcrypto} from 'node:crypto';
import {parseDate,parseNumber,interpretCell,dateField,numberField} from '../frontend/services/import-formats.js';
const formats={parseDate,parseNumber,interpretCell,dateField,numberField};
function services(){const c=vm.createContext({XLSX,crypto:webcrypto,console,Date,setTimeout});c.window=c;c.LokalblickImportFormats=formats;for(const file of ['domain/object-model.js','domain/calculations.js','domain/import-rules.js','services/migration-adapter.js','services/address-match.js','services/operational-enrichment-adapter.js','services/contract-enrichment-adapter.js','services/project-2027-adapter.js','services/source-workbook.js','services/source-service.js'])vm.runInContext(fs.readFileSync('frontend/'+file,'utf8'),c);return c;}
function workbook(rows,name){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),name);return w;}
test('operational adapter uses common priorities and protects manually cleared fields with cell provenance',()=>{
 const c=services(),w=workbook([['Benämning','Postadress','Fastighetsägare','Förvaltare','Objekt. nr','Ort'],['Nytt namn','Gatan 1','','','EXT-1','Malmö']],'Fastighetslista');
 const base={properties:[{id:'p',sourceId:'EXT-1',name:'Gammalt',address:'',city:'',provenance:{address:{source:'manual',value:''},city:{source:'manual',value:''}}}],importFieldPreferences:{'properties|name|source.xlsx':'accept'}};
 const result=c.LokalblickOperationalEnrichmentAdapter.enrich(w,base,'source.xlsx');assert.equal(result.data.properties[0].name,'Nytt namn');assert.equal(result.data.properties[0].address,'');assert.equal(result.data.properties[0].provenance.name.cell,'A2');assert.ok(result.data.importReview.some(r=>r.field==='city'&&r.protectedValue));
 const repeated=c.LokalblickOperationalEnrichmentAdapter.enrich(w,result.data,'source.xlsx');assert.equal(repeated.report.changes.length,0);assert.equal(repeated.data.auditLog.length,result.data.auditLog.length);
});
test('known contract adapter interprets Swedish dates and currency while retaining source cells',()=>{
 const c=services(),w=workbook([['Avtalsnummer','Adress','Grundhyra','Inflyttningsdatum','Utflyttningsdatum','Fastighetsbeteckning','Verksamhet','Hyresvärd','kvm'],['A-1','Gatan 1','120 000 kr','01/01/2027','31/12/2028','Test 1','Kontor','Ägare',100]],'Avtal');
 const result=c.LokalblickContractEnrichmentAdapter.enrich(w,{properties:[{id:'p',address:'Gatan 1'}],contracts:[{id:'c',number:'A-1',propertyId:'p'}]},'source.xlsx');assert.equal(result.data.contracts[0].baseRent,120000);assert.equal(result.data.contracts[0].moveInDate,'2027-01-01');assert.equal(result.data.contracts[0].moveOutDate,'2028-12-31');assert.equal(result.data.contracts[0].provenance.moveOutDate.cell,'E2');
});
test('known contract adapter stages invalid calendar value without importing it',()=>{
 const c=services(),w=workbook([['Avtalsnummer','Adress','Grundhyra','Inflyttningsdatum','Fastighetsbeteckning','Verksamhet','Hyresvärd','kvm'],['A-1','Gatan 1',100000,'31/04/2027','Test 1','Kontor','Ägare',100]],'Avtal');
 const result=c.LokalblickContractEnrichmentAdapter.enrich(w,{properties:[{id:'p',address:'Gatan 1'}],contracts:[{id:'c',number:'A-1',propertyId:'p'}]},'source.xlsx');assert.equal(result.data.contracts[0].moveInDate,undefined);assert.ok(result.data.importReview.some(r=>r.kind==='invalid-import-field'&&r.provenance.cell==='D2'));
});
test('mixed specialized files resolve core before child sheets regardless of picker order',async t=>{
 const c=services(),children=workbook([['Verksamhet','Namn på verksamheten','Adress','Vad ska göras','Drift eller investering','Ansvarig','Uppskattat pris investering exkl moms, tkr','Budget 2027, tkr'],['VARDBO','Test','Gatan 1','Skalskydd','Investering','','300','300']],'Årshjul'),core=workbook([['Förvaltningsobjekt','Avtalsnummer','Gatuadress','Kundtyp avtal','Area','Lokalkategori','Användning'],['OBJ-1','A-1','Gatan 1','Ägare',100,'Kontor','VARDBO']],'SF');
 const files=[{name:'åtgärder.xlsx',workbook:children},{name:'fastigheter.xlsx',workbook:core}];c.showOpenFilePicker=async()=>files.map(f=>({queryPermission:async()=> 'granted',getFile:async()=>({name:f.name,arrayBuffer:async()=>XLSX.write(f.workbook,{type:'array',bookType:'xlsx'})})}));
 // Load the production service as a native module, using browser globals.
 const previousWindow=globalThis.window,previousXLSX=globalThis.XLSX,previousObjects=globalThis.LokalblickObjectModel;globalThis.window=c;globalThis.XLSX=XLSX;globalThis.LokalblickObjectModel=c.LokalblickObjectModel;t.after(()=>{globalThis.window=previousWindow;globalThis.XLSX=previousXLSX;globalThis.LokalblickObjectModel=previousObjects;});
 await import('../frontend/services/source-service.js?mixed-import-test');
 const selected=await c.LokalblickSourceService.prepareImportWorkbook(()=>{},{multiple:true}),result=await c.LokalblickSourceService.importPreparedWorkbook({},selected.sheets.map(s=>s.name),()=>{});
 assert.equal(result.data.properties.length,1);assert.equal(result.data.contracts.length,1);assert.equal(result.data.activities.length,1);assert.equal(result.data.activities[0].propertyId||result.data.contracts.find(c=>c.id===result.data.activities[0].contractId)?.propertyId,result.data.properties[0].id);assert.equal(result.data.activities[0].estimatedCost,300000);assert.equal(result.data.objects.length,1);assert.equal(result.data.contracts[0].objectId,result.data.objects[0].id);c.LokalblickObjectModel.validate(result.data);
});
