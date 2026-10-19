import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {profileWorkbook,prepareMappedImport,mappingConflicts,retargetColumn} from '../frontend/services/import-engine.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {normalize} from '../frontend/v2/model.js';
const context=vm.createContext({window:{},XLSX});vm.runInContext(fs.readFileSync('frontend/services/source-service.js','utf8'),context);
const schemas=context.window.LokalblickSourceService.schemas;
const settings={schemas,fileName:'syntetiskt.xlsx',fingerprint:'recovery',actor:'Test',strictColumns:true,personLinks:true};
function book(sheets){const workbook=XLSX.utils.book_new();for(const [name,rows] of sheets)XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name);return workbook;}
function profile(workbook,base={}){return profileWorkbook(workbook,schemas,XLSX,base.importMappings||[],{reviewed:true});}
function run(workbook,base={},profiles=profile(workbook,base),options={}){return prepareMappedImport(workbook,profiles,base,{...settings,...options},XLSX);}
function portfolio(){
 const core=[['Förvaltningsobjekt','Avtalsnummer','Kostnadsställe','Gatuadress','Area']];
 for(let i=0;i<154;i++)core.push(['P'+i%97,'A'+i,'K'+i%10,'Testgata '+i%97,100+i]);
 const supplement=[['Objektsnummer / Förvaltningsobjekt','Avtalsnummer','Fastighetsbeteckning','Adress','Fastighetsägare','Lokalyta (kvm)']];
 for(let i=0;i<107;i++)supplement.push(['P'+i%97,'A'+i,'Test '+i%97,'Testgata '+i%97,'Ägarbolag '+(i%97)%44,100+i]);
 return book([['Lokallista',core],['Lokalbestånd ',supplement]]);
}
test('261 source rows import 97 properties with linked agreements and deduplicated owners',()=>{
 const workbook=portfolio(),result=run(workbook);
 assert.equal(result.data.properties.length,97);assert.equal(result.data.contracts.length,154);assert.equal(result.data.organizations.length,44);assert.equal(result.data.objects.length,154);
 assert.equal(result.data.importReview.filter(review=>review.status==='pending').length,0);
 const valid=normalize(result.data);
 assert.ok(valid.properties.every(property=>valid.organizations.some(party=>party.id===property.ownerPartyId)));
 assert.ok(valid.contracts.every(contract=>valid.objects.some(object=>object.id===contract.objectId&&object.propertyId===contract.propertyId)));
 assert.equal(valid.contracts.find(contract=>contract.number==='A9').costCenterPremises,'K9');
 const again=run(workbook,result.data);assert.equal(again.report.counts.fields,0);assert.equal(again.report.counts.created,0);assert.equal(again.data.auditLog.length,result.data.auditLog.length);
});
test('duplicate identifier mappings are named and blocked before applying; separate person columns remain legal',()=>{
 const workbook=portfolio(),profiles=profile(workbook);profiles[0].columns[2].target='properties.sourceId';
 const conflicts=mappingConflicts(profiles);assert.equal(conflicts.length,1);assert.deepEqual(conflicts[0].columns.map(column=>column.header),['Förvaltningsobjekt','Kostnadsställe']);
 assert.throws(()=>run(workbook,{},profiles),/dubbelkoppling/);
 const result=run(workbook,{},profiles,{allowMappingConflicts:true});
 const html=columnPreviewHtml({fileName:settings.fileName},{profiles},result,schemas);
 assert.match(html,/data-mapping-conflicts/);assert.match(html,/Förvaltningsobjekt och Kostnadsställe/);assert.match(html,/data-column-group="conflict" open/);assert.match(html,/data-apply class="primary-action" disabled/);
 assert.equal(mappingConflicts([{columns:[{header:'Kontakt 1',target:'contracts.responsiblePersonId'},{header:'Kontakt 2',target:'contracts.responsiblePersonId'}]}]).length,0);
 assert.equal(mappingConflicts([{columns:[{header:'E-post 1',target:'contact.0.email'},{header:'E-post 2',target:'contact.0.email'}]}]).length,1);
});
test('correcting the column choice recovers rejected rows and closes their old identity reviews',()=>{
 const workbook=book([['Lokallista',[['Förvaltningsobjekt','Avtalsnummer','Kostnadsställe','Gatuadress','Area'],['P0','A0','K0','Testgata 0',100],['P1','A1','K1','Testgata 1',200],['P1','A2','K1','Testgata 1',300]]]]);
 const base={properties:[{id:'existing',sourceId:'P0',address:'Testgata 0'}]},wrong=profile(workbook);wrong[0].columns[2].target='properties.sourceId';
 const failed=run(workbook,base,wrong,{allowMappingConflicts:true});assert.equal(failed.data.properties.length,1);assert.ok(failed.data.importReview.some(review=>review.status==='pending'));
 const corrected=profile(workbook,failed.data);retargetColumn(workbook,corrected[0],corrected[0].columns[2],'contracts.costCenterPremises',XLSX);
 const recovered=run(workbook,failed.data,corrected);
 assert.equal(recovered.data.properties.length,2);assert.equal(recovered.data.contracts.length,3);assert.equal(recovered.data.importReview.filter(review=>review.status==='pending').length,0);
 assert.ok(recovered.data.importReview.every(review=>review.status==='resolved'&&review.resolvedBy==='Test'));
 assert.equal(recovered.data.sourceRegistry[0].review,0);assert.ok(recovered.data.sourceRegistry[0].created>1);
 assert.equal(recovered.data.properties.find(property=>property.sourceId==='P0').id,'existing');
});
test('new owners use exact party names and unresolved owner identity does not discard property or agreement',()=>{
 const workbook=book([['Lokalbestånd ',[['Förvaltningsobjekt','Avtalsnummer','Fastighetsägare','Area'],['P1','A1','Ägarbolag AB',100]]]]);
 const ambiguous={organizations:[{id:'a',name:'Ägarbolag AB',type:'owner'},{id:'b',name:'Ägarbolag AB',type:'owner'}]};
 const result=run(workbook,ambiguous);assert.equal(result.data.properties.length,1);assert.equal(result.data.contracts.length,1);assert.equal(result.data.properties[0].ownerPartyId,undefined);assert.equal(result.data.organizations.length,2);
 assert.ok(result.data.importReview.some(review=>review.field==='ownerPartyId'&&review.reason.includes('Flera parter')));
 const punctuation=run(workbook,{organizations:[{id:'different',name:'Ägarbolag A B',type:'owner'}]});assert.equal(punctuation.data.organizations.length,2);assert.notEqual(punctuation.data.properties[0].ownerPartyId,'different');
 const ignored=profile(workbook);ignored[0].columns[2].target='@ignore';const excluded=run(workbook,{},ignored);assert.equal(excluded.data.organizations.length,0);assert.equal(excluded.data.properties[0].ownerPartyId,undefined);
 const unsafe=profile(workbook);unsafe[0].columns[0].target='@ignore';const orphan=run(workbook,{},unsafe);assert.equal(orphan.data.properties.length,0);assert.equal(orphan.data.organizations.length,0);
});
test('manual owner remains protected when a source proposes another owner',()=>{
 const workbook=book([['Lokalbestånd',[['Förvaltningsobjekt','Avtalsnummer','Fastighetsägare'],['P1','A1','Annat bolag AB']]]]);
 const base={properties:[{id:'p',sourceId:'P1',ownerPartyId:'old',provenance:{ownerPartyId:{source:'manual'}}}],organizations:[{id:'old',name:'Tidigare bolag AB',type:'owner'}]};
 const result=run(workbook,base);assert.equal(result.data.properties[0].ownerPartyId,'old');assert.equal(result.data.contracts.length,1);assert.ok(result.data.importReview.some(review=>review.kind==='operational-conflict'&&review.field==='ownerPartyId'&&review.protectedValue));
});
test('a generated object identity cannot create a second record with an ID already used at another property',()=>{
 const workbook=book([['Lokallista',[['Förvaltningsobjekt','Avtalsnummer','Area'],['P1','A1',100]]]]);
 const base={properties:[{id:'p',sourceId:'P1'},{id:'other',sourceId:'P2'}],objects:[{id:'OBJ|p|A1',propertyId:'other',number:'Other',area:200}]};
 const result=run(workbook,base);
 assert.equal(new Set(result.data.objects.map(object=>object.id)).size,result.data.objects.length);
 assert.equal(result.data.objects.find(object=>object.id==='OBJ|p|A1').area,200);
 assert.ok(result.data.importReview.some(review=>review.reason?.includes('Identifieraren finns redan')));
 assert.ok(result.data.contracts.every(contract=>result.data.objects.some(object=>object.id===contract.objectId&&object.propertyId===contract.propertyId)));
});
test('reviewed open-ended lease markers are valid end dates; dates needing interpretation stay in review',()=>{
 for(const value of ['Tillsvidare','Tills vidare','tills vidare']){
  const workbook=book([['Lokallista',[['Förvaltningsobjekt','Avtalsnummer','From','Tom'],['P1','A1','2025-01-01',value]]]]),result=run(workbook);
  assert.equal(result.data.contracts.length,1);assert.ok(!result.data.contracts[0].end);assert.equal(result.data.importReview.length,0);
 }
 const workbook=book([['Lokallista',[['Förvaltningsobjekt','Avtalsnummer','From','Tom'],['P1','A1','Se respektive avtal','2029-13-31']]]]),result=run(workbook);
 assert.equal(result.data.properties.length,1);assert.equal(result.data.contracts.length,0);assert.ok(result.data.importReview.some(review=>review.reason.includes('Ogiltigt')));
});
