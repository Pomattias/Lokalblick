import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {webcrypto} from 'node:crypto';
import '../frontend/domain/responsibility-model.js';
import {normalize} from '../frontend/v2/model.js';
import {responsibilityHtml} from '../frontend/v2/responsibility-editor.js';
import {combineImportSources,profileWorkbook,prepareMappedImport} from '../frontend/services/import-engine.js';
const model=globalThis.LokalblickResponsibility;
function fixture(){return {properties:[{id:'p',ownerPartyId:'owner'}],objects:[{id:'o',propertyId:'p',number:'01'}],contracts:[{id:'c',propertyId:'p',objectId:'o',number:'C1',businessPartyId:'business',tenantPartyId:'tenant',unitId:'VARDBO'}],activities:[{id:'a',propertyId:'p',type:'Underhåll',title:'Tak',estimatedCost:500}],organizations:[{id:'our',type:'our',name:'Vi'},{id:'owner',type:'owner',name:'Ägare'},{id:'business',type:'business',name:'Verksamhet'},{id:'tenant',type:'tenant',name:'Juridisk hyresgäst'}],people:[{id:'u1',name:'Första',organizationId:'our'},{id:'u2',name:'Nästa',organizationId:'our'},{id:'owner1',name:'Ägarkontakt',organizationId:'owner'},{id:'b1',name:'Verksamhetskontakt',organizationId:'business'}],assignments:[],auditLog:[]};}
const replace=(d,personId,fromDate='2026-10-12',more={})=>model.change(d,{targetType:'property',targetId:'p',personId,fromDate,actor:'Test',...more});
test('migration preserves stable IDs and unknown dates and is idempotent',()=>{
 const d=fixture();d.properties[0].responsiblePersonId='u1';model.normalize(d);const first=structuredClone(d);model.normalize(d);assert.deepEqual(d,first);assert.equal(d.assignments[0].personId,'u1');assert.equal(d.assignments[0].fromDate,'');assert.equal(d.assignments[0].organizationId,'our');
 const legacy=fixture();legacy.assignments=[{id:'old',personId:'u1',targetType:'property',targetId:'p',role:'Ansvarig',fromDate:'',toDate:''}];model.normalize(legacy);assert.equal(legacy.assignments.length,1);assert.equal(legacy.assignments[0].id,'old');
});
test('replacement closes previous period, preserves unknown beginning and logs source and actor',()=>{
 const d=fixture();d.properties[0].responsiblePersonId='u1';model.normalize(d);const id=d.assignments[0].id;replace(d,'u2');assert.equal(d.assignments[0].id,id);assert.equal(d.assignments[0].fromDate,'');assert.equal(d.assignments[0].toDate,'2026-10-11');assert.equal(d.properties[0].responsiblePersonId,'u2');assert.equal(d.assignments[1].createdBy,'Test');assert.equal(d.assignments[1].provenance.source,'manual');model.validate(d);
 replace(d,'u2');assert.equal(d.assignments.length,2);assert.equal(d.auditLog.length,1);
});
test('same-day correction preserves cancelled relation and historical date selection',()=>{
 const d=fixture();replace(d,'u1');replace(d,'u2');assert.equal(d.assignments[0].cancelled,true);assert.equal(model.current(d,'property','p','our','2026-10-12')[0].personId,'u2');model.validate(d);
});
test('clearing a role does not resurrect it on restart or from a stale compatibility field',()=>{
 const d=fixture();d.properties[0].responsiblePersonId='u1';model.normalize(d);replace(d,'');d.properties[0].responsiblePersonId='u1';model.normalize(d);assert.equal(d.properties[0].responsiblePersonId,'');assert.equal(d.assignments.length,1);
});
test('multiple roles and homes coexist without confusing business and legal tenant',()=>{
 const d=fixture();replace(d,'u1');model.change(d,{targetType:'object',targetId:'o',personId:'u1',fromDate:'2026-10-12'});model.change(d,{targetType:'activity',targetId:'a',personId:'u2',fromDate:'2026-10-12'});model.change(d,{targetType:'contract',targetId:'c',personId:'b1',role:'business',fromDate:'2026-10-12'});model.change(d,{targetType:'property',targetId:'p',personId:'owner1',role:'owner',fromDate:'2026-10-12'});assert.equal(d.assignments.length,5);assert.equal(d.contracts[0].tenantPartyId,'tenant');assert.equal(d.contracts[0].businessPartyId,'business');assert.equal(d.assignments.find(a=>a.roleKey==='business').organizationId,'business');model.validate(d);
});
test('overlaps require all participants to explicitly share responsibility',()=>{
 const d=fixture();replace(d,'u1');const bad={...d.assignments[0],id:'bad',personId:'u2'};d.assignments.push(bad);assert.throws(()=>model.validate(d),/Överlappande/);d.assignments[0].shared=true;assert.throws(()=>model.validate(d),/Överlappande/);bad.shared=true;model.validate(d);
});
test('invalid dates, missing references and future responsibilities cannot be silently changed',()=>{
 const d=fixture();assert.throws(()=>replace(d,'u1','2026-02-30'),/Ogiltigt/);assert.throws(()=>replace(d,'absent'),/saknas/);assert.equal(d.assignments.length,0);replace(d,'u1','2099-01-01');assert.throws(()=>replace(d,'u2'),/Framtida/);assert.equal(d.assignments.length,1);
});
test('editing the person or their organization retains historical assignment identity and organization',()=>{
 const d=fixture();replace(d,'u1');d.people[0].name='Nytt namn';d.people[0].organizationId='tenant';model.normalize(d);assert.equal(d.assignments[0].organizationId,'our');assert.match(responsibilityHtml(d,'property','p'),/Nytt namn/);
});
test('form changes use shared lifecycle logic and retain ended responsibilities',()=>{
 const before=fixture();before.properties[0].responsiblePersonId='u1';model.normalize(before);const edited=structuredClone(before);edited.properties[0].responsiblePersonId='u2';model.applyChanges(before,edited,{actor:'Test',fromDate:'2026-10-12'});assert.equal(edited.assignments.length,2);assert.equal(edited.assignments[0].toDate,'2026-10-11');assert.equal(edited.properties[0].responsiblePersonId,'u2');
});
test('old overlapping data remains visible for correction but cannot introduce a new conflict',()=>{
 const d=fixture();replace(d,'u1');d.assignments.push({...d.assignments[0],id:'dup',personId:'u2'});const before=structuredClone(d);model.normalize(d);assert.equal(model.issues(d).length,1);model.validate(d,before);d.assignments.push({...d.assignments[0],id:'new'});assert.throws(()=>model.validate(d,before),/Överlappande/);
});
function sourceService(){const c=vm.createContext({window:{},XLSX,crypto:webcrypto,setTimeout});for(const p of ['frontend/domain/object-model.js','frontend/domain/responsibility-model.js','frontend/services/source-service.js'])vm.runInContext(fs.readFileSync(p,'utf8'),c);return c.window.LokalblickSourceService;}
test('real XLSX roundtrip retains assignment IDs, validity dates, shared flags and provenance',()=>{
 const svc=sourceService(),d=fixture();replace(d,'u1','2025-01-01');replace(d,'u2');const w=svc.dataToWorkbook(d);assert.ok(w.Sheets.Ansvar);const bytes=XLSX.write(w,{type:'buffer',bookType:'xlsx'});const out=svc.workbookToData(XLSX.read(bytes,{type:'buffer'}));assert.equal(out.assignments.length,2);assert.equal(out.assignments[0].id,d.assignments[0].id);assert.equal(out.assignments[0].toDate,'2026-10-11');assert.equal(out.assignments[1].provenance.confirmedBy,'Test');assert.equal(out.properties[0].responsiblePersonId,'u2');
});
test('canonical responsibility and legal tenant IDs remain stable without migration',()=>{
 const d=fixture();
 d.contracts[0].tenantPartyId='tenant';
 d.assignments=[{id:'assignment-1',personId:'u1',targetType:'property',targetId:'p',
   role:'Ansvarig',roleKey:'our',fromDate:'2025-01-01',toDate:''}];
 const out=normalize(d);
 assert.ok(out.assignments.some(a=>a.id==='assignment-1'));
 assert.equal(out.contracts[0].tenantPartyId,'tenant');
 assert.equal(out.contracts[0].businessPartyId,'business');
 assert.deepEqual(normalize(out),out);
});
test('reimporting stale responsibility fields stages a review and leaves current assignment history intact',async()=>{
 const d=fixture();d.properties[0].designation='Test 1';replace(d,'u1','2025-01-01');replace(d,'u2');const svc=sourceService(),w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Fast.bet','Ansvarig hos oss'],['Test 1','u1']]),'Fastigheter');const file={fileName:'test.xlsx',buffer:XLSX.write(w,{type:'array',bookType:'xlsx'}),sheets:[{name:'Fastigheter'}]};const prepared=await combineImportSources([file],['Fastigheter'],XLSX);const result=prepareMappedImport(prepared.workbook,profileWorkbook(prepared.workbook,svc.schemas,XLSX),d,{schemas:svc.schemas,fingerprint:prepared.fingerprint,fileName:file.fileName,actor:'Test'},XLSX);assert.equal(result.data.properties[0].responsiblePersonId,'u2');assert.equal(result.data.assignments.length,2);assert.ok(result.data.importReview.some(r=>r.field==='responsiblePersonId'));
});
test('import of dated assignment columns links a person and stages overlapping or missing homes',async()=>{
 const svc=sourceService(),d=fixture(),w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([['Person','Måltyp','Mål','Roll','Från','Till','Delat ansvar'],['Första','Fastighet','Test 1','Ansvarig','2026-01-01','','Nej'],['Nästa','Fastighet','Test 1','Ansvarig','2026-02-01','','Nej'],['Nästa','Fastighet','Saknas','Ansvarig','2026-02-01','','Nej']]),'Ansvar');d.properties[0].designation='Test 1';
 const file={fileName:'ansvar.xlsx',buffer:XLSX.write(w,{type:'array',bookType:'xlsx'}),sheets:[{name:'Ansvar'}]},prepared=await combineImportSources([file],['Ansvar'],XLSX);
 const result=prepareMappedImport(prepared.workbook,profileWorkbook(prepared.workbook,svc.schemas,XLSX),d,{schemas:svc.schemas,fingerprint:prepared.fingerprint,fileName:file.fileName,actor:'Test'},XLSX);
 assert.equal(result.data.assignments.length,1);assert.equal(result.data.assignments[0].personId,'u1');assert.equal(result.data.assignments[0].fromDate,'2026-01-01');assert.equal(result.report.counts.unresolved,2);model.validate(result.data);
 const again=prepareMappedImport(prepared.workbook,profileWorkbook(prepared.workbook,svc.schemas,XLSX),result.data,{schemas:svc.schemas,fingerprint:prepared.fingerprint,fileName:file.fileName,actor:'Test'},XLSX);assert.equal(again.data.assignments.length,1);assert.equal(again.data.assignments[0].id,result.data.assignments[0].id);
});
test('compact history uses the same markup on mobile and desktop and escapes person and part names',()=>{
 const d=fixture();d.people[0].name='<script>';replace(d,'u1');const html=responsibilityHtml(d,'property','p');assert.match(html,/<details><summary>Ansvarshistorik/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/name="responsibilityChangeDate"/);
});
