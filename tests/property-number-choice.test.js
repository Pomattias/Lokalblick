import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';import {profileTables} from '../frontend/services/import-matching.js';import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';import {recordHistory} from '../frontend/v2/field-history.js';import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';
const source=(id,headers=['Avtalsnummer','Adress'],row=[id,'Testgatan 1'])=>{const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,row]),'Avtal');return {workbook,profiles:profileTables(workbook,importSchemas,XLSX)};};
const run=(s,b=emptyData(),rowMatches={})=>prepareCleanImport(s.workbook,s.profiles,b,{fileName:'syntetiska-numrerval.xlsx',rowMatches},XLSX);
const choose=(p,id)=>({[p.matchingKey]:{propertyId:id,signature:p.signature}});
function base(id){const b=emptyData();b.properties.push(normalize('properties',{id,name:'TESTET 1',address:'Testgatan 1'}));b.workspace.auditLog=[{id:'old-history',collection:'properties',recordId:id,action:'Tidigare notering',fields:[{field:'designation',from:null,to:'TESTET 1'}]}];return b;}

test('unknown agreement prefixes never reuse another property through a shared address',()=>{
 for(const [stored,agreement,derived]of [['FAS-temporary','864-4-1102','864'],['80364','364-8402','364'],['5280','5730-90001-4','5730']]){
  const b=base(stored),s=source(agreement),pending=run(s,b),p=pending.report.linkProposals[0];assert.equal(p.evidence,'Uppdelat avtalsnummer');assert.deepEqual(p.matches.map(m=>m.id),[derived]);
  const accepted=run(s,b,choose(p,derived));assert.equal(accepted.clean.properties[0].id,stored);assert.equal(accepted.clean.properties.length,2);assert.equal(accepted.clean.objects[0].property_id,derived);validateData(accepted.clean);
 }
});
test('a supplied management number keeps a separate identity even at another property address',()=>{
 const b=base('5280'),s=source('5730-90001-4',['Förvaltningsobjekt','Avtalsnummer','Adress'],['5730','SF5730-90001-4','Testgatan 1']),r=run(s,b);assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.properties.length,2);assert.equal(r.clean.objects[0].property_id,'SF5730');assert.equal(r.clean.properties[0].id,'5280');
 const again=run(s,r.clean);assert.equal(again.report.review,0);assert.equal(again.clean.properties.length,2);assert.equal(again.clean.agreements.length,1);
});
test('a known agreement preserves every saved property link, documents, history and Budget despite its number prefix',async()=>{
 const b=base('80364');b.objects.push(normalize('objects',{id:'EXISTING',property_id:'80364',area:120}));b.agreements.push(normalize('agreements',{id:'364-8402',object_id:'EXISTING'}));b.people.push(normalize('people',{id:'P1',name:'Testperson'}));b.contacts.push(normalize('contacts',{id:'C1',person_id:'P1',role:'owner',property_id:'80364'}));b.issues.push(normalize('issues',{id:'I1',title:'Kontroll',property_id:'80364'}));b.recurring_costs.push(normalize('recurring_costs',{id:'K1',property_id:'80364',category:'heat',name:'Värme',annual_amount:12000}));b.spaces.push(normalize('spaces',{id:'S1',property_id:'80364',name:'Hall'}));b.inspections.push(normalize('inspections',{id:'B1',property_id:'80364'}));b.workspace.documents=[{id:'D1',propertyId:'80364'}];b.workspace.budgetPlans=[{id:'locked',year:2027,locked:true,snapshot:{amount:9876}}];
 const s=source('364-8402'),r=run(s,b);assert.equal(r.report.linkProposals.length,0);assert.equal(r.report.blocking,0);assert.equal(r.clean.objects[0].id,'EXISTING');assert.equal(r.clean.agreements[0].object_id,'EXISTING');
 for(const t of ['objects','contacts','issues','recurring_costs','spaces','inspections'])assert.equal(r.clean[t][0].property_id,'80364',t);
 assert.deepEqual(r.clean.workspace.documents,b.workspace.documents);assert.deepEqual(r.clean.workspace.budgetPlans,b.workspace.budgetPlans);assert.deepEqual(b.properties[0].id,'80364');assert(recordHistory(r.data,'properties','80364').some(e=>e.id==='old-history'));
 const restored=await readWorkbook(await writeWorkbook(r.clean));assert.deepEqual(restored,JSON.parse(JSON.stringify(r.clean)));assert.equal(run(s,restored).report.linkProposals.length,0);validateData(restored);
 const supplied=source('364-8402',['FastighetsID','Avtalsnummer','Adress'],['80364','364-8402','Testgatan 1']),again=run(supplied,restored);assert.equal(again.report.review,0);assert.equal(again.clean.properties.length,1);assert.equal(again.clean.properties[0].id,'80364');
});
test('a two-part number can supply a property ID but does not guess an object number',()=>{
 const s=source('5307-10040',['Avtalsnummer'],['5307-10040']),pending=run(s),p=pending.report.linkProposals[0];assert.equal(p.matches[0].id,'5307');const r=run(s,emptyData(),choose(p,'5307'));assert.equal(r.report.review,0);assert.equal(r.clean.properties[0].id,'5307');assert.equal(r.clean.objects[0].id,'OB-5307-10040');
});
test('80 is never stripped unless a different property number is actually supplied by the agreement and chosen',()=>{
 const b=base('80364'),s=source('80364-001-03'),pending=run(s,b),p=pending.report.linkProposals[0];assert.deepEqual(p.matches.map(m=>m.id),['80364']);assert.equal(p.requiresSelection,undefined);const r=run(s,b,choose(p,'80364'));assert.equal(r.clean.properties[0].id,'80364');assert.equal(r.clean.objects[0].id,'80364-001');
});
test('explicit property IDs outrank number guesses and cannot overwrite occupied IDs or locked Budget references',()=>{
 const b=base('80364');b.properties.push(normalize('properties',{id:'364',name:'ANNAT 1',address:'Annan gata 2'}));b.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{propertyId:'80364',amount:12345}}];
 const s=source('364-8402',['FastighetsID','Avtalsnummer','Adress'],['80364','364-8402','Testgatan 1']),r=run(s,b);
 assert.equal(r.report.linkProposals.length,0);assert.equal(r.report.blocking,0);assert.equal(r.clean.properties.length,2);assert.equal(r.clean.objects[0].property_id,'80364');assert.deepEqual(r.clean.workspace.budgetPlans,b.workspace.budgetPlans);
 const bad=run(source('364-8402',['FastighetsID','Avtalsnummer','Adress'],['364','364-8402','Testgatan 1']),b);
 assert.equal(bad.report.blocking,0);assert.equal(bad.clean.agreements.length,1);assert.equal(bad.clean.objects[0].property_id,'364');assert(bad.data.importReview.some(r=>r.field==='address'));assert.deepEqual(bad.clean.workspace.budgetPlans,b.workspace.budgetPlans);
});
test('a register row created earlier in the same import is never renamed through address matching',()=>{
 const s=source('864-4-1102');XLSX.utils.book_append_sheet(s.workbook,XLSX.utils.aoa_to_sheet([['Fastighetsnamn','Adress'],['TESTET 1','Testgatan 1']]),'Fastigheter');s.profiles=profileTables(s.workbook,importSchemas,XLSX);
 const pending=run(s),p=pending.report.linkProposals[0];assert.equal(p.requiresSelection,undefined);assert.equal(p.matches[0].id,'864');const r=run(s,emptyData(),choose(p,'864'));assert.equal(r.clean.properties.length,2);assert(r.clean.properties.some(p=>p.id==='864'));assert.equal(r.clean.objects[0].property_id,'864');validateData(r.clean);
});
test('number approvals cannot be reused for different supplied numbers',()=>{
 const b=base('80364'),s=source('364-8402'),p=run(s,b).report.linkProposals[0],approval=choose(p,'364');assert.equal(run(s,b,approval).clean.agreements.length,1);assert.equal(run(source('365-8402'),b,approval).clean.agreements.length,0);
});

test('an out-of-candidate approval cannot replace a supplied property number',()=>{
 const b=base('5280'),s=source('5730-001-01'),p=run(s,b).report.linkProposals[0],r=run(s,b,choose(p,'5280'));assert.equal(r.clean.properties[0].id,'5280');assert.equal(r.clean.agreements.length,0);assert.equal(r.report.blocking,1);validateData(r.clean);
});
