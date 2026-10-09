import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {profileWorkbook,prepareMappedImport} from '../frontend/services/import-engine.js';
import {audit,resolveReview} from '../frontend/v2/model.js';
import {fieldCaption} from '../frontend/v2/field-labels.js';
import {fieldCatalog} from '../frontend/services/import-engine.js';
const context=vm.createContext({window:{},XLSX,crypto:webcrypto});
vm.runInContext(fs.readFileSync('frontend/services/source-service.js','utf8'),context);
const schemas=context.window.LokalblickSourceService.schemas;
function fixture(rows,name='Ny struktur'){const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),name);return w;}
function run(w,base={},options={}){const profiles=profileWorkbook(w,schemas,XLSX,base.importMappings||[]);return prepareMappedImport(w,profiles,base,{fingerprint:'test-hash',fileName:'test.xlsx',actor:'Test',schemas,...options},XLSX);}
test('unknown structure and displaced headers preserve source cell and supplementary information',()=>{
 const w=fixture([['Rapport'],[],['Fast.bet','Adress','Ort','Okänd uppgift'],['Ek 1','Gatan 1','Malmö','Specialvillkor']]);
 const result=run(w);const p=result.data.properties[0];
 assert.equal(p.designation,'Ek 1');assert.equal(p.provenance.address.cell,'B4');
 assert.equal(p.supplemental[0].value,'Specialvillkor');assert.equal(result.report.counts.created,1);
});
test('same identity enriches fields, preserves manual values and does not mutate base',()=>{
 const base={properties:[{id:'p',designation:'Ek 1',city:'Malmö',address:'Manuellt',provenance:{address:{source:'manual'}}}]};
 const result=run(fixture([['Fast.bet','Adress','Ort'],['Ek 1','Ny gata','Malmö']]),base);
 assert.equal(result.data.properties.length,1);assert.equal(result.data.properties[0].address,'Manuellt');
 assert.equal(result.data.importReview[0].protectedValue,true);assert.equal(base.properties[0].address,'Manuellt');
});
test('unchanged reimport produces no new records or audit entries',()=>{
 const w=fixture([['Fast.bet','Adress','Ort'],['Ek 1','Gatan 1','Malmö']]);const first=run(w),second=run(w,first.data);
 assert.equal(second.data.properties.length,1);assert.equal(second.data.auditLog.length,first.data.auditLog.length);
 assert.equal(second.data.importMappings.length,1);assert.equal(second.data.sourceRegistry.length,1);
});
test('same address and ambiguous identity stay in staging',()=>{
 const base={properties:[{id:'p1',address:'Gatan 1',city:'Malmö'},{id:'p2',address:'Gatan 1',city:'Malmö'}]};
 const result=run(fixture([['Adress','Ort'],['Gatan 1','Malmö']]),base);
 assert.equal(result.data.properties.length,2);assert.equal(result.data.importReview[0].classification,'B');
});
test('a designation in another city cannot silently merge',()=>{
 const result=run(fixture([['Fast.bet','Ort'],['Ek 1','Lund']]),{properties:[{id:'p',designation:'Ek 1',city:'Malmö'}]});
 assert.equal(result.data.properties.length,1);assert.equal(result.report.counts.unresolved,1);
});
test('insufficient identity and invalid numeric value remain available for review',()=>{
 const w=fixture([['Avtalsnummer','BRA'],['123','fel']]);const result=run(w);
 assert.equal(result.data.contracts.length,0);assert.equal(result.data.importReview[0].values.number,'123');
});
test('two contracts on the same property retain separate identities',()=>{
 const w=fixture([['Fast.bet','Adress','Ort','Avtalsnummer','Årshyra'],['Ek 1','Gatan 1','Malmö','1',100],['Ek 1','Gatan 1','Malmö','2',200]]);
 const r=run(w);assert.equal(r.data.properties.length,1);assert.equal(r.data.contracts.length,2);
 assert.equal(r.data.contracts[0].propertyId,r.data.contracts[1].propertyId);
 assert.ok(r.report.changes.every(c=>c.provenance));
});
test('complementary files produce the same field values in either order',()=>{
 const a=fixture([['Fast.bet','Adress'],['Ek 1','Gatan 1']]);
 const b=fixture([['Fast.bet','Ort'],['Ek 1','Malmö']]);
 const ab=run(b,run(a).data),ba=run(a,run(b).data);
 for(const key of ['designation','address','city'])assert.equal(ab.data.properties[0][key],ba.data.properties[0][key]);
 assert.equal(ab.data.properties.length,1);
});
test('manual clearing remains protected even when higher priority would fill an empty field',()=>{
 const base={properties:[{id:'p',designation:'Ek 1',address:'',provenance:{address:{source:'manual'}}}],importFieldPreferences:{'properties|address|test.xlsx':'accept'}};
 const r=run(fixture([['Fast.bet','Adress'],['Ek 1','Gatan 1']]),base);
 assert.equal(r.data.properties[0].address,'');assert.equal(r.data.importReview[0].protectedValue,true);
});
test('manual assignment has per-field provenance and no-op writes produce no events',()=>{
 const data={auditLog:[]},before={id:'p',responsiblePersonId:'a'},after={...before,responsiblePersonId:'b'};
 audit(data,'properties','p',before,after,'Test');
 assert.equal(after.provenance.responsiblePersonId.source,'manual');assert.equal(data.auditLog[0].actorVerified,false);
 audit(data,'properties','p',after,after,'Test');assert.equal(data.auditLog.length,1);
});
test('review resolution preserves original cell metadata and creates conflicts for existing values',()=>{
 const data={properties:[{id:'p',designation:'Ek 1',city:'Malmö'}],auditLog:[],importReview:[{id:'r',status:'pending',kind:'mapped-identity',collection:'properties',source:'test.xlsx',values:{address:'Gatan 1',city:'Lund'},origins:{address:{source:'test.xlsx',cell:'A5'}}}]};
 resolveReview(data,'r','accept','p','Test');
 assert.equal(data.properties[0].provenance.address.cell,'A5');assert.equal(data.properties[0].city,'Malmö');
 assert.equal(data.importReview[1].kind,'operational-conflict');
});
test('monthly rent and document hyperlinks are mapped from values and metadata',()=>{
 const w=fixture([['Fast.bet','Ort','Avtalsnummer','Månadshyra','Avtals-PDF'],['Ek 1','Malmö','1',100,'Avtal']]);
 w.Sheets['Ny struktur'].E2.l={Target:'https://intranet/1.pdf'};
 const r=run(w);assert.equal(r.data.contracts[0].baseRent,1200);assert.equal(r.data.contracts[0].contractDocumentUrl,'https://intranet/1.pdf');
});
test('rules recognize reordered columns without reusing incorrect column indices',()=>{
 const first=run(fixture([['Fast.bet','Adress','Ort'],['Ek 1','Gatan 1','Malmö']]));
 const w=fixture([['Ort','Fast.bet','Adress'],['Malmö','Ek 1','Gatan 1']]);const p=profileWorkbook(w,schemas,XLSX,first.data.importMappings);
 assert.equal(p[0].columns[0].target,'properties.city');assert.equal(p[0].columns[0].approved,true);
 const result=prepareMappedImport(w,p,first.data,{fingerprint:'changed',fileName:'test.xlsx',actor:'Test',schemas},XLSX);
 assert.equal(result.data.properties.length,1);assert.equal(result.report.counts.fields,0);
});
test('priority applies only to conflicting unprotected fields',()=>{
 const base={properties:[{id:'p',designation:'Ek 1',address:'Gammal'}],importFieldPreferences:{'properties|address|test.xlsx':'accept'}};
 const result=run(fixture([['Fast.bet','Adress'],['Ek 1','Ny']]),base);
 assert.equal(result.data.properties[0].address,'Ny');assert.equal(result.data.auditLog[0].fields[0].from,'Gammal');
});
test('Excel roundtrip preserves full registry, mappings and provenance history',()=>{
 const result=run(fixture([['Fast.bet','Adress','Ort'],['Ek 1','Gatan 1','Malmö']]));
 const service=context.window.LokalblickSourceService;
 const w=service.dataToWorkbook(result.data);const bytes=XLSX.write(w,{type:'buffer',bookType:'xlsx'});
 const restored=service.workbookToData(XLSX.read(bytes,{type:'buffer'}));
 assert.deepEqual(JSON.parse(JSON.stringify(restored.importMappings)),result.data.importMappings);
 assert.equal(restored.sourceRegistry[0].fingerprint,'test-hash');assert.equal(restored.auditLog[0].fields[0].provenance.cell,'A2');
});
test('lease columns determine context even on a sheet named Lokallista',()=>{
 const w=fixture([['Avtalsnummer','Ursprungligt giltigt fr.o.m.','Aktuellt giltigt t.o.m.','Förlängningstid','Uppsägningstid'],['A-1',43739,46752,'12 mån','9 mån']],'Lokallista');
 const p=profileWorkbook(w,schemas,XLSX)[0];
 assert.equal(p.inferred,'contracts');
 assert.deepEqual(p.columns.map(c=>c.target),['contracts.number','contracts.start','contracts.end','contracts.renewalPeriodMonths','contracts.noticePeriodMonths']);
 assert.match(p.columns[2].examples[0],/^\d{4}-\d{2}-\d{2}$/);
});
test('short date headers follow contract or activity context but remain ambiguous without context',()=>{
 for(const [name,headers,expected] of [['Lokallista',['Avtalsnummer','t.o.m.'],'contracts.end'],['Projekt',['Aktivitet','t.o.m.'],'activities.endDate'],['Personer',['Namn','t.o.m.'],'@extra']]){
  const p=profileWorkbook(fixture([headers,['1',46752]],name),schemas,XLSX)[0];
  assert.equal(p.columns[1].target,expected);
 }
});
test('Swedish month durations become numeric contract terms',()=>{
 const r=run(fixture([['Fast.bet','Ort','Avtalsnummer','Förlängningstid','Uppsägningstid'],['Ek 1','Malmö','A-1','12 mån','9 månader']]));
 assert.equal(r.data.contracts[0].renewalPeriodMonths,12);assert.equal(r.data.contracts[0].noticePeriodMonths,9);
});
test('contract captions, workbook headers and import targets share the same names',()=>{
 const service=context.window.LokalblickSourceService;
 const old=globalThis.window;globalThis.window={LokalblickSourceService:service};
 try{
  for(const [field,label] of [['start','Giltigt fr.o.m.'],['end','Giltigt t.o.m.'],['renewalPeriodMonths','Förlängningstid, månader']]){
   assert.equal(fieldCaption('contracts',`<input name="${field}">`,'gammalt namn'),label);
   assert.equal(fieldCatalog(schemas).find(f=>f.target==='contracts.'+field).label,'Avtal → '+label);
  }
  assert.equal(fieldCaption('contracts','<select name="businessResponsiblePersonId">','Verksamhetsansvarig'),'Verksamhetsansvarig');
 }finally{globalThis.window=old;}
 const w=service.dataToWorkbook({properties:[{id:'p',designation:'Ek 1'}],contracts:[{id:'c',propertyId:'p',number:'A-1',start:'2026-01-01',end:'2027-12-31'}]});
 const headers=XLSX.utils.sheet_to_json(w.Sheets.Avtal,{header:1})[0];
 assert.ok(headers.includes('Giltigt t.o.m.'));assert.ok(!headers.includes('Slut'));
});
test('previous canonical Excel date headers still read without losing values',()=>{
 const w=fixture([['_id','_propertyId','Avtalsnummer','Start','Slut','Uppsägningstid månader'],['c','p','A-1','2026-01-01','2027-12-31',9]],'Avtal');
 const restored=context.window.LokalblickSourceService.workbookToData(w);
 assert.equal(restored.contracts[0].start,'2026-01-01');assert.equal(restored.contracts[0].end,'2027-12-31');assert.equal(restored.contracts[0].noticePeriodMonths,9);
});
