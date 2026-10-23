import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {profileWorkbook,prepareMappedImport,fieldCatalog} from '../frontend/services/import-engine.js';
import '../frontend/domain/object-model.js';
const ctx=vm.createContext({window:{},XLSX});vm.runInContext(fs.readFileSync('frontend/services/source-service.js','utf8'),ctx);
const service=ctx.window.LokalblickSourceService,schemas=service.schemas;
const expected={terminatedOn:'2028-01-01',terminationReason:'Lokalen lämnas',use:'Träffpunkt',businessDescription:'Kommunal primärvård.',employees:12.5,category:'KP Kontor- och personallokaler',contractDocumentUrl:'https://example.invalid/avtal/A-1.pdf'};
function workbook(){
 const w=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
  ['Förvaltningsobjekt','Avtalsnummer','Gatuadress','Ort','Uppsagd den','Uppsägningsorsak','Användning'],
  ['P-1','A-1','Testgatan 1','Malmö',46753,expected.terminationReason,expected.use],
  ['P-2','A-2','Testgatan 2','Malmö','–','','Kontor']
 ]),'Lokallista');
 const sheet=XLSX.utils.aoa_to_sheet([
  ['Objektsnummer / Förvaltningsobjekt','Avtalsnummer','Kommentar verksamhet','Antal medarbetare (viss+ heltid)','Lokalkategori (LEB)','Lägenheter (yta)','Länk avtal (Huvudkontrakt)'],
  ['P-1','A-1',expected.businessDescription,'12,5',expected.category,'245,5','streamToClient'],
  ['P-2','A-2','','–','Kontor','-','']
 ]);sheet.G2.l={Target:expected.contractDocumentUrl};
 XLSX.utils.book_append_sheet(w,sheet,'Lokalbestånd');return w;
}
function run(w,base={}){const profiles=profileWorkbook(w,schemas,XLSX,base.importMappings||[],{reviewed:true});return {...prepareMappedImport(w,profiles,base,{schemas,fileName:'syntetiskt.xlsx',fingerprint:'test-contract-fields',actor:'Test',strictColumns:true},XLSX),profiles};}
test('all eight highlighted source captions map into canonical agreement fields without extra copies',()=>{
 const result=run(workbook());assert.ok(result.profiles.flatMap(p=>p.columns).every(c=>!c.target.startsWith('@')));
 const c=result.data.contracts.find(c=>c.number==='A-1');for(const [field,value] of Object.entries(expected))assert.equal(c[field],value,field);
 assert.equal(result.data.contracts.length,2);assert.equal(result.data.properties.length,2);assert.equal(result.report.counts.unresolved,0);
 assert.deepEqual(c.supplemental,[]);assert.equal(result.data.objects.find(o=>o.id===c.objectId).apartmentArea,245.5);assert.equal(c.apartmentArea,undefined);assert.equal(c.provenance.contractDocumentUrl.originalValue,'streamToClient');
 assert.equal(c.provenance.terminatedOn.cell,'E2');assert.equal(c.provenance.businessDescription.sheet,'Lokalbestånd');
 const missing=result.data.contracts.find(c=>c.number==='A-2');for(const field of ['terminatedOn','employees','apartmentArea'])assert.ok(missing[field]==null||missing[field]==='');
 assert.equal(result.profiles[0].columns.find(c=>c.target==='contracts.terminatedOn').format.invalid,0);
});
test('new agreement columns survive real Excel serialization and repeat import without duplication',()=>{
 const w=workbook(),first=run(w),saved=service.dataToWorkbook(first.data),bytes=XLSX.write(saved,{type:'array',bookType:'xlsx'}),restored=service.workbookToData(XLSX.read(bytes,{type:'array'}));
 const c=restored.contracts.find(c=>c.number==='A-1');for(const [field,value] of Object.entries(expected))assert.equal(c[field],value,field);
 const columns=schemas.find(s=>s.key==='contracts').columns;for(const field of Object.keys(expected))assert.equal(columns.filter(c=>c[0]===field).length,1);
 const again=run(w,first.data);assert.equal(again.report.counts.created,0);assert.equal(again.report.counts.fields,0);assert.equal(again.data.auditLog.length,first.data.auditLog.length);
});
test('invalid termination dates remain in review and cancellation reason remains text',()=>{
 const w=workbook();w.Sheets.Lokallista.E2={t:'s',v:'31/04/2028'};w.Sheets.Lokallista.F2={t:'s',v:'2028-01-01'};
 const result=run(w);assert.ok(result.data.importReview.some(r=>r.reason.includes('Ogiltigt datum')));
 assert.ok(!result.data.contracts.some(c=>c.terminatedOn==='2028-04-31'));
 assert.equal(result.profiles[0].columns.find(c=>c.target==='contracts.terminationReason').format.type,'text');
});
test('external workbook captions resolve to current agreement and object fields',()=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['_id','Avtalsnummer','Verksamhetstyp','Anställda','Lägenhetsyta','Avtals-PDF'],['c','A-1','Kontor',5,100,'https://example.invalid/a.pdf']]),'Avtal');
 const c=service.workbookToData(w).contracts[0];assert.equal(c.use,'Kontor');assert.equal(c.employees,5);assert.equal(c.apartmentArea,100);assert.equal(c.contractDocumentUrl,'https://example.invalid/a.pdf');
 assert.ok(fieldCatalog(schemas,true).some(f=>f.target==='contracts.businessDescription'&&f.aliases.includes('Kommentar verksamhet')));
});
