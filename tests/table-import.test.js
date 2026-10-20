import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {profileWorkbook,fieldCatalog,mappingConflicts,combineImportSources} from '../frontend/services/import-engine.js';
import {resolveFieldName,setMappingRow,setPrimaryTable,mappingTemplate,relatedTables} from '../frontend/services/import-matching.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {createCleanEvaluator} from '../frontend/lokaler/import-worker-client.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {overview} from '../frontend/v2/views.js';
import '../frontend/domain/calculations.js';
const book=(rows,name='Hyresavtal 2027')=>{const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),name);return workbook;};
const profile=(workbook,saved=[])=>profileWorkbook(workbook,importSchemas,XLSX,saved,{reviewed:true});
const rows=[['FastighetsID','Fast.nr','ObjektID','Avtalsnummer','Kontraktsstart','Årshyra','Tillägg','Hyra justeringsregel'],['F1','Test 1','0001','A1','2027-01-01',850000,25000,'none']];
const run=(workbook,profiles=profile(workbook),base=emptyData(),context={})=>prepareCleanImport(workbook,profiles,base,{fileName:'syntetiskt.xlsx',...context},XLSX);

test('Fastighet and Fastighetsnamn import the property name separately from address and preserve ID links',()=>{
 for(const header of ['Fastighet','Fastighetsnamn']){
  const workbook=book([['FastighetsID',header,'Adress','ObjektID','AvtalsID'],['F1','Testfastigheten','Testgatan 12','O1','A1'],['F1','Testfastigheten','Testgatan 12','O2','A2']]),ps=profile(workbook),result=run(workbook,ps);
  assert.equal(ps[0].columns[0].target,'properties.id');assert.equal(ps[0].columns[1].target,'properties.designation');assert.equal(ps[0].columns[2].target,'properties.address');
  assert.equal(result.report.blocking,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.properties[0].name,'Testfastigheten');assert.equal(result.clean.properties[0].address,'Testgatan 12');
  assert(result.clean.objects.every(o=>o.property_id==='F1'));assert.deepEqual(result.clean.agreements.map(a=>a.object_id),['O1','O2']);
  const html=overview(result.data,{propertyId:'',unit:'',owner:'',person:'',q:''},{perspective:'Fastigheter',year:2026,contractId:''});
  assert.match(html,/<td class="primary-cell"><button[^>]*data-edit="properties"[^>]*>Testfastigheten<\/button>/);assert.match(html,/<td>Testgatan 12</);
  const again=run(workbook,ps,result.clean);assert.equal(again.clean.properties.length,1);assert.equal(again.report.review,0);validateData(again.clean);
 }
});
test('reimport can replace an old address-based name with Fastighetsnamn without changing the address or links',()=>{
 const base=run(book([['FastighetsID','Adress','ObjektID','AvtalsID'],['F1','Testgatan 12','O1','A1']])).clean;
 assert.equal(base.properties[0].name,'Testgatan 12');
 const workbook=book([['FastighetsID','Fastighetsnamn'],['F1','Testfastigheten']],'Fastigheter'),preview=run(workbook,profile(workbook),base);
 assert.equal(preview.report.blocking,0);assert.equal(preview.report.review,1);assert.equal(preview.clean.properties[0].name,'Testgatan 12');
 const result=resolveImportChoices(preview,{mode:'replace'});
 assert.equal(result.report.review,0);assert.equal(result.clean.properties[0].name,'Testfastigheten');assert.equal(result.clean.properties[0].address,'Testgatan 12');assert.equal(result.clean.objects[0].property_id,'F1');assert.equal(result.clean.agreements[0].object_id,'O1');
 assert(result.clean.workspace.auditLog.some(e=>e.fields?.some(f=>f.field==='designation'&&f.from==='Testgatan 12'&&f.to==='Testfastigheten')));validateData(result.clean);
});

test('current-model catalog has no contract monetary copies, retired fields or parallel organizations',()=>{
 const fields=fieldCatalog(importSchemas,true);assert(fields.some(f=>f.target==='agreementItems.baseAmount'));assert(fields.some(f=>f.target==='recurringCosts.annualAmount'));assert(!fields.some(f=>f.target==='contracts.baseRent'||f.target==='contracts.number'||f.target==='contracts.businessPartyId'||f.target==='activities.phase'));
 assert(relatedTables(importSchemas,'contracts').includes('objects'));assert(relatedTables(importSchemas,'contracts').includes('agreementItems'));
});
test('sheet name, current labels and aliases infer contracts while keeping property/object fields distinct',()=>{
 const workbook=book(rows),p=profile(workbook)[0];assert.equal(p.primaryTable,'contracts');assert.equal(p.mappingRowSuggested,false);assert.equal(p.columns[1].target,'properties.designation');assert.equal(p.columns[2].target,'contracts.objectId');assert.equal(p.columns[4].target,'contracts.start');assert.equal(p.columns[5].target,'agreementItems.baseAmount');assert.equal(p.columns[5].itemType,'base');assert.equal(p.columns[6].itemType,'addition');assert.equal(mappingConflicts([p]).length,0);
 const result=run(workbook,[p]);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreement_items.length,2);assert.equal(result.clean.agreement_items.find(i=>i.type==='base').base_amount,850000);assert.equal(result.clean.agreement_items.find(i=>i.type==='addition').base_amount,25000);assert.equal(result.clean.agreements[0].base_amount,undefined);assert.equal(result.clean.objects[0].id,'0001');
});
test('a proposed mapping row requires an active decision and explicit mappings outrank saved exclusions',()=>{
 const workbook=book([['Fast.nr','Startdatum','Årshyra','Avtalsnr','ObjektID','FastighetsID'],['Fastighet.Fastighetsbeteckning','Avtal.Fr.o.m.','Avtal.Bashyra','Avtal.AvtalsID','Objekt.ObjektID','Fastighet.FastighetsID'],['Test 1','2027-01-01',850000,'A1','O1','F1']]);
 let ps=profile(workbook),p=ps[0];assert.equal(p.headerRow,1);assert.equal(p.mappingRowSuggested,true);assert.equal(p.mappingRow,false);const preview=run(workbook,ps);assert.match(columnPreviewHtml({fileName:'syntetiskt.xlsx'},{profiles:ps},preview,importSchemas),/data-apply class="primary-action" disabled/);
 const saved={sheet:p.name,signature:p.signature,layoutSignature:p.layoutSignature,columns:p.columns.map(c=>({...c,target:'@ignore'}))};p=profile(workbook,[saved])[0];setMappingRow(workbook,p,true,importSchemas,XLSX);p.mappingRowDecision='yes';const result=run(workbook,[p]);assert.equal(p.dataStartRow,2);assert.equal(p.rowCount,1);assert.equal(p.columns[0].matchSource,'explicit');assert.equal(result.report.blocking,0);assert.equal(result.clean.properties[0].name,'Test 1');assert.equal(result.clean.agreements[0].valid_from,'2027-01-01');assert.equal(result.clean.agreement_items[0].base_amount,850000);assert.equal(result.clean.workspace.auditLog.find(e=>e.collection==='contracts').fields[0].provenance.row,3);
});
test('ordinary dotted text is never silently treated as mapping instructions',()=>{
 const workbook=book([['FastighetsID','Fastighetsnamn'],['F1','Testfastighet.Exempel'],['F2','Avtal.Bashyra']],'Fastigheter');const p=profile(workbook)[0];assert.equal(p.mappingRowSuggested,false);assert.equal(p.rowCount,2);const result=run(workbook,[p]);assert.equal(result.clean.properties.length,2);
});
test('unknown explicit field names remain visible and require a current field or standalone exclusion',()=>{
 const workbook=book([['FastighetsID','Rubrik'],['Fastighet.FastighetsID','Avtal.BorttagetFält'],['F1','Text']]);const p=profile(workbook)[0];setMappingRow(workbook,p,true,importSchemas,XLSX);assert.equal(p.columns[1].target,'@unmapped');assert.match(p.columns[1].warning,/Okänt Lokalblick-fält/);assert.equal(p.dataStartRow,2);
});
test('changing the primary table cannot turn an unknown explicit field into a header-based guess',()=>{
 const workbook=book([['FastighetsID','Grundhyra'],['Fastighet.FastighetsID','Avtal.BorttagetFält'],['F1',100000]]),p=profile(workbook)[0];setMappingRow(workbook,p,true,importSchemas,XLSX);
 const warning=p.columns[1].warning;setPrimaryTable(workbook,p,'agreementItems',importSchemas,XLSX);
 assert.equal(p.columns[1].target,'@unmapped');assert.equal(p.columns[1].matchSource,'explicit');assert.equal(p.columns[1].warning,warning);assert.equal(p.columns[0].target,'properties.id');assert.equal(p.dataStartRow,2);
});
test('a primary-table change refreshes automatic choices while preserving approved choices and exclusions',()=>{
 const workbook=book([['ÄrendeID','Namn','Status','Övrigt'],['I1','Fiktivt ärende','Öppet','Bortvald text']],'Ärenden'),p=profile(workbook)[0];p.columns[1].approved=true;p.columns[3].target='@ignore';p.columns[3].approved=true;
 assert.equal(p.columns[2].target,'activities.status');setPrimaryTable(workbook,p,'orders',importSchemas,XLSX);
 assert.equal(p.columns[0].target,'orders.activityId');assert.equal(p.columns[1].target,'activities.title');assert.equal(p.columns[2].target,'orders.status');assert.equal(p.columns[3].target,'@ignore');assert.equal(p.tableConfidence,'selected');assert.equal(p.rowCount,1);
});
test('similar files reuse approved columns when the layout agrees; removed model fields do not remain available',()=>{
 const workbook=book(rows),first=run(workbook),other=book(rows,'Hyresavtal 2028');const p=profile(other,first.clean.workspace.importMappings)[0];assert(p.columns.every(c=>c.approved));assert.equal(p.columns[5].itemType,'base');
 const schemas=structuredClone(importSchemas);const contracts=schemas.find(s=>s.key==='contracts');contracts.columns=contracts.columns.filter(([field])=>field!=='start');delete contracts.fieldSpecs.start;
 const changed=profileWorkbook(other,schemas,XLSX,first.clean.workspace.importMappings,{reviewed:true})[0];assert.equal(changed.columns[4].target,'@unmapped');assert.match(changed.columns[4].warning,/finns inte längre/);assert(!fieldCatalog(schemas,true).some(f=>f.target==='contracts.start'));
});
test('a header-only template preserves original captions and typed money mappings without business data',()=>{
 const workbook=book(rows),ps=profile(workbook),template=mappingTemplate(workbook,ps,importSchemas,XLSX),sheet=template.Sheets[template.SheetNames[0]],values=XLSX.utils.sheet_to_json(sheet,{header:1});assert.deepEqual(values[0],rows[0]);assert.equal(values.length,2);assert(!JSON.stringify(values).includes('850000'));assert.match(values[1][5],/Avtalsposter.*Bashyra/);
 XLSX.utils.sheet_add_aoa(sheet,[rows[1]],{origin:'A3'});const p=profile(template)[0];setMappingRow(template,p,true,importSchemas,XLSX);const result=run(template,[p]);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreement_items.length,2);
});
test('a property cost amount is not classified as tenant rent just because a caption resembles rent',()=>{
 assert.equal(resolveFieldName('Årshyra',importSchemas,'recurringCosts'),null);assert.equal(resolveFieldName('Avtal.Bashyra',importSchemas,'contracts').target,'agreementItems.baseAmount');assert.equal(resolveFieldName('Fastighetskostnad.Budgeterat årsbelopp, kr',importSchemas,'recurringCosts').target,'recurringCosts.annualAmount');
});
test('post matching reuses an exact unique property designation with a new address as a value choice',()=>{
 const data=emptyData();data.properties.push(normalize('properties',{id:'F1',name:'Test 1',address:'Tidigare gata'}));const workbook=book([['Fast.nr','Gatuadress','ObjektID','Avtalsnummer'],['Test 1','Ny gata','O1','A1']]);const result=run(workbook,profile(workbook),data);assert.equal(result.report.blocking,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.objects[0].property_id,'F1');assert.equal(result.report.review,1);
});
test('ambiguous record matching offers candidates, accepts only an explicit valid choice and preserves relations',()=>{
 const data=emptyData();for(const id of ['F1','F2'])data.properties.push(normalize('properties',{id,name:'Test 1',address:id+' gata'}));const workbook=book([['Fast.nr','ObjektID','Avtalsnummer'],['Test 1','O1','A1']]),ps=profile(workbook),ambiguous=run(workbook,ps,data);assert.equal(ambiguous.report.blocking,1);assert.equal(ambiguous.clean.objects.length,0);const review=ambiguous.clean.workspace.importReview[0];assert.equal(review.matches.length,2);
 const chosen=run(workbook,ps,data,{rowMatches:{[review.matchingKey]:'F2'}});assert.equal(chosen.report.blocking,0);assert.equal(chosen.clean.objects[0].property_id,'F2');assert.equal(chosen.clean.agreements[0].object_id,'O1');validateData(chosen.clean);
 const bad=run(workbook,ps,data,{rowMatches:{[review.matchingKey]:'F9'}});assert.equal(bad.report.blocking,1);assert.equal(bad.clean.objects.length,0);
});
test('numeric scaling, monthly rent and invalid calendars remain correctly typed through real item fields',()=>{
 const data=emptyData();data.properties.push(normalize('properties',{id:'F1',name:'Test 1'}));const workbook=book([['FastighetsID','ObjektID','Avtalsnr','Månadshyra','Kontraktsstart'],['F1','O1','A1',10000,'2027-02-01']]),result=run(workbook,profile(workbook),data);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreement_items[0].base_amount,120000);
 workbook.Sheets['Hyresavtal 2027'].E2.v='2027-02-30';assert.equal(run(workbook,profile(workbook),data).report.blocking,1);
});
test('one parsed workbook is reused when selecting another set of sheets',async()=>{
 const workbook=book(rows);XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['FastighetsID'],['F1']]),'Fastigheter');let reads=0;const xlsx={...XLSX,read(...args){reads++;return XLSX.read(...args);}},file={fileName:'syntetiskt.xlsx',buffer:XLSX.write(workbook,{type:'array'}),sheets:workbook.SheetNames.map(name=>({name,sheetName:name}))};await combineImportSources([file],[file.sheets[0].name],xlsx);await combineImportSources([file],['Fastigheter'],xlsx);assert.equal(reads,1);
});
test('worker rechecks send only profiles/preferences and reuse the initialized parsed workbook',async()=>{
 const OriginalWorker=globalThis.Worker,created=[];class Worker{constructor(){this.messages=[];created.push(this);}postMessage(message){this.messages.push(message);if(message.type==='evaluate')queueMicrotask(()=>this.onmessage({data:{id:message.id,result:{ok:true}}}));}terminate(){this.stopped=true;}}
 globalThis.Worker=Worker;try{const evaluator=createCleanEvaluator({Sheets:{}},emptyData(),{});await evaluator([],{importFieldPreferences:{}});await evaluator([],{importFieldPreferences:{}});assert.equal(created.length,1);assert.deepEqual(created[0].messages.map(m=>m.type),['init','evaluate','evaluate']);assert(!Object.hasOwn(created[0].messages[2],'workbook'));evaluator.cancel();assert.equal(created[0].stopped,true);}finally{globalThis.Worker=OriginalWorker;}
});

test('a populated item Type column remains authoritative over a misleading rent caption',()=>{
 const base=run(book(rows)).clean;
 const workbook=book([['PostID','AvtalsID','Typ','Benämning','Bashyra'],['heat-1','A1','Värme','Värme från extern fil',12500]],'Avtalsposter'),ps=profile(workbook),result=run(workbook,ps,base);assert.equal(ps[0].primaryTable,'agreementItems');assert.equal(ps[0].columns[4].itemType,undefined);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreement_items.find(i=>i.id==='heat-1').type,'heat');assert.equal(result.clean.agreement_items.find(i=>i.id==='heat-1').base_amount,12500);
});
test('choosing the item table uses its Type column instead of retaining a wide-rent shortcut',()=>{
 const base=run(book(rows)).clean,workbook=book([['PostID','AvtalsID','Typ','Bashyra','Benämning'],['heat-1','A1','Värme',12000,'Fiktivt värmetillägg']]),p=profile(workbook)[0];assert.equal(p.primaryTable,'contracts');assert.equal(p.columns[3].itemType,'base');
 setPrimaryTable(workbook,p,'agreementItems',importSchemas,XLSX);assert.equal(p.columns[2].target,'agreementItems.type');assert.equal(p.columns[3].itemType,undefined);
 const result=run(workbook,[p],base);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreement_items.find(i=>i.id==='heat-1').type,'heat');assert.equal(result.clean.agreement_items.filter(i=>i.type==='base').length,1);
});
test('a second overlapping typed base item is a row review, not a complete-import exception',()=>{
 const base=run(book(rows)).clean,workbook=book([['PostID','AvtalsID','Bashyra'],['second-base','A1',100]],'Avtalsposter'),result=run(workbook,profile(workbook),base);assert.equal(result.report.blocking,1);assert.equal(result.clean.agreement_items.filter(i=>i.type==='base').length,1);assert.match(result.clean.workspace.importReview[0].reason,/Endast en bashyra/);
});
test('contact column mappings can be exported and reimported with the owning person role',()=>{
 const workbook=book([['FastighetsID','Fastighetsnamn','Samordnare','E-post'],['F1','Test 1','Anna Test','anna@example.invalid']],'Fastigheter'),ps=profile(workbook),p=ps[0];p.columns[3].target='contact.2.email';p.columns[3].approved=true;const template=mappingTemplate(workbook,ps,importSchemas,XLSX);XLSX.utils.sheet_add_aoa(template.Sheets.Fastigheter,[['F1','Test 1','Anna Test','anna@example.invalid']],{origin:'A3'});const again=profile(template)[0];setMappingRow(template,again,true,importSchemas,XLSX);assert.equal(again.columns[3].target,'contact.2.email');const result=run(template,[again]);assert.equal(result.report.blocking,0);assert.equal(result.clean.contacts.length,1);assert.equal(result.clean.people[0].email,'anna@example.invalid');
});
