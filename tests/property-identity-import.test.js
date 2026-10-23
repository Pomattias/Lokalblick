import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook,readImportSource} from '../frontend/services/import-engine.js';
import {setMappingRow,resolveFieldName} from '../frontend/services/import-matching.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {readWorkbook,writeWorkbook} from '../backend/lokaler/workbook.js';
function book(sheets){const b=XLSX.utils.book_new();for(const [name,rows] of sheets)XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet(rows),name);return b;}
const profile=(b,saved=[])=>profileWorkbook(b,importSchemas,XLSX,saved,{reviewed:true});
const run=(b,seed=emptyData(),profiles=profile(b,seed.workspace.importMappings),context={})=>prepareCleanImport(b,profiles,seed,{fileName:'syntetiska-fastigheter.xlsx',...context},XLSX);
const approvals=result=>Object.fromEntries(result.report.linkProposals.map(p=>[p.matchingKey,{propertyId:p.matches[0].id,signature:p.signature}]));
const list=[['Förvaltningsobjekt','Gatuadress','Avtalsnummer','Area'],['1058','Testgatan 1A','A1',100],['1058','Testgatan 1 A','A2',200]];
const stock=[['Objektsnummer / Förvaltningsobjekt','Fastighetsbeteckning','Adress','Avtalsnummer','Lokalyta (kvm)'],['1058','TESTET 1','Testgatan 1A','A1',100],['1058','TESTET 1','Testgatan 1 A','A2',200]];
test('management numbers have their own property field and never replace canonical IDs',()=>{
 for(const header of ['Förvaltningsobjekt','Objektsnummer / Förvaltningsobjekt']){
  assert.equal(resolveFieldName(header,importSchemas,'contracts').target,'properties.managementObjectNumber');
  const b=book([['Ärenden', [['Ärendenamn',header],['Kontroll','1058']]]]);assert.equal(profile(b)[0].columns[1].target,'properties.managementObjectNumber');
 }
 for(const sheets of [[['Lokallista',list],['Lokalbestånd ',stock]],[['Lokalbestånd ',stock],['Lokallista',list]]]){
  const b=book(sheets),result=run(b);assert.equal(result.report.blocking,0);assert.equal(result.report.review,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.properties[0].management_object_number,'1058');assert.equal(result.clean.properties[0].name,'TESTET 1');assert.equal(result.clean.objects.length,2);assert.equal(result.clean.agreements.length,2);
  assert(result.clean.objects.every(o=>o.property_id===result.clean.properties[0].id));validateData(result.clean);
  const again=run(b,result.clean);assert.equal(again.clean.properties.length,1);assert.equal(again.clean.objects.length,2);assert.equal(again.clean.agreements.length,2);assert.equal(again.report.review,0);
 }
});
test('address-only enrichment joins a named property without replacing the name with its address',()=>{
 const b=book([['Lokallista',list],['Lokalbestånd',stock],['Fastighetslista',[['Postadress','Fastighetsägare'],['Testgatan 1A','Fiktiv ägare']]],['Lokaldata',[['Adress','Fastighetsnamn','Avtalsnummer'],['Testgatan 1 A','Testgatan 1 A','A3']]]]);
 const pending=run(b);assert.equal(pending.report.linkProposals.length,2);assert.equal(pending.clean.agreements.length,2);const result=run(b,emptyData(),profile(b),{rowMatches:approvals(pending)});assert.equal(result.report.blocking,0);assert.equal(result.report.review,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.properties[0].name,'TESTET 1');assert.equal(result.clean.agreements.length,3);assert(result.clean.objects.every(o=>o.property_id===result.clean.properties[0].id));assert.equal(result.clean.parties.length,1);
});
test('a genuine designation replaces an address fallback on a verified ID and address',()=>{
 const b=book([['A',[['FastighetsID','Adress'],['1058','Testgatan 1']]],['B',[['FastighetsID','Fastighetsnamn','Adress'],['1058','TESTET 1','Testgatan 1']]]]),first=run(b);
 assert.equal(first.clean.properties.length,1);assert.equal(first.clean.properties[0].name,'TESTET 1');assert.equal(first.report.review,0);
 const initial=run(book([['A',[['FastighetsID','Adress'],['1058','Testgatan 1']]]])),later=run(book([['B',[['FastighetsID','Fastighetsnamn','Adress'],['1058','TESTET 1','Testgatan 1']]]]),initial.clean);
 assert.equal(later.clean.properties[0].name,'TESTET 1');assert.equal(later.report.review,0);assert.equal(resolveImportChoices(later,{mode:'replace'}).clean.properties[0].name,'TESTET 1');
});
test('an ID always checks the address: differences are reviewed, conflicting known identities are blocked',()=>{
 const seed=run(book([['Lokallista',list]])).clean;
 const changed=run(book([['Fastigheter',[['FastighetsID','Adress'],[seed.properties[0].id,'Ny testgata 2']]]]),seed);
 assert.equal(changed.clean.properties.length,1);assert.equal(changed.clean.properties[0].address,'Testgatan 1A');assert.equal(changed.report.review,1);assert.equal(changed.report.blocking,0);assert.equal(resolveImportChoices(changed,{mode:'replace'}).clean.properties[0].address,'Ny testgata 2');
 seed.properties.push(normalize('properties',{id:'1059',name:'TESTET 2',address:'Andragatan 2'}));
 const wrong=run(book([['Lokallista',[list[0],['1058','Andragatan 2','A3',50]]]]),seed);
 assert.equal(wrong.report.blocking,1);assert.equal(wrong.clean.properties.length,2);assert.equal(wrong.clean.agreements.length,2);assert.match(wrong.clean.workspace.importReview[0].reason,/Förvaltningsobjekt och adress/);
 const unknown=run(book([['Fastigheter',[['FastighetsID','Adress'],['NEW-ID','Testgatan 1A']]]]),seed);assert.equal(unknown.report.blocking,1);assert.equal(unknown.clean.properties.length,2);assert.match(unknown.clean.workspace.importReview[0].reason,/annat FastighetsID/);
});
test('shared addresses require disambiguation, while different houses, suffixes and ranges are never merged',()=>{
 const seed=emptyData();seed.properties.push(normalize('properties',{id:'F1',name:'TESTET 1',address:'Testgatan 1A'}),normalize('properties',{id:'F2',name:'TESTET 2',address:'Testgatan 1A'}));
 const b=book([['Fastigheter',[['Adress','Populärnamn'],['Testgatan 1 A','Fiktivt namn']]]]),ambiguous=run(b,seed);assert.equal(ambiguous.report.blocking,1);assert.equal(ambiguous.clean.properties.length,2);assert.equal(ambiguous.clean.workspace.importReview[0].matches.length,2);
 const chosen=run(b,seed,profile(b),{rowMatches:{[ambiguous.clean.workspace.importReview[0].matchingKey]:{propertyId:'F2',signature:ambiguous.report.linkProposals[0].signature}}});assert.equal(chosen.report.blocking,0);assert.equal(chosen.clean.properties[1].popular_name,'Fiktivt namn');
 for(const address of ['Testgatan 1B','Testgatan 11A','Testgatan 1–3']){const result=run(book([['Fastigheter',[['Adress'],[address]]]]),seed);assert.equal(result.clean.properties.length,3,address);}
 const abbr=emptyData();abbr.properties.push(normalize('properties',{id:'F1',name:'TESTET 1',address:'Testpersons väg 24'}));const result=run(book([['Fastigheter',[['Adress'],['Testpersons v 24']]]]),abbr);assert.equal(result.clean.properties.length,1);assert.equal(result.report.blocking,1);assert.equal(result.report.linkProposals[0].matches[0].id,'F1');
});
test('obsolete saved object targets are corrected, exclusions and explicit mapping rows remain authoritative',()=>{
 const b=book([['Lokalbestånd',stock]]),p=profile(b)[0],old={sheet:p.name,signature:p.signature,layoutSignature:p.layoutSignature,primaryTable:p.primaryTable,columns:p.columns.map(c=>({...c,target:c.index===0?'objects.id':c.target}))};
 assert.equal(profile(b,[old])[0].columns[0].target,'properties.managementObjectNumber');old.columns[0].target='@ignore';assert.equal(profile(b,[old])[0].columns[0].target,'@ignore');
 const explicit=book([['Objekt',[['Objektsnummer / Förvaltningsobjekt'],['Objekt.ObjektID'],['O1']]]]),q=profile(explicit)[0];setMappingRow(explicit,q,true,importSchemas,XLSX);assert.equal(q.columns[0].target,'objects.id');
});
test('safe identity enrichment survives Excel roundtrip, retains history and leaves Budget snapshots untouched',async()=>{
 const seed=emptyData();seed.workspace.budgetPlans=[{id:'locked',year:2027,locked:true,snapshot:{amount:4321}}];const b=book([['Lokallista',list],['Lokalbestånd',stock]]),result=run(b,seed);
 assert.deepEqual(result.clean.workspace.budgetPlans,seed.workspace.budgetPlans);assert(result.clean.workspace.auditLog.some(row=>row.fields.some(field=>field.provenance?.matchingDecision?.addressChecked)));
 const restored=await readWorkbook(await writeWorkbook(result.clean,ExcelJS),ExcelJS);assert.deepEqual(restored.properties,result.clean.properties);assert.deepEqual(restored.objects,result.clean.objects);assert.deepEqual(restored.workspace.budgetPlans,seed.workspace.budgetPlans);assert.equal(run(b,restored).clean.properties.length,1);
});
test('formatted near-million-row stock sheets still reuse the existing range trimming before matching',()=>{
 const b=book([['Lokalbestånd ',stock]]);b.Sheets['Lokalbestånd ']['!ref']='A1:AY1048567';
 const trimmed=readImportSource({workbook:b,buffer:new Uint8Array()},b.SheetNames,XLSX),result=run(trimmed);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.agreements.length,2);
});
