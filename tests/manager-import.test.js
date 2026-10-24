import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {personFormat,parsePersonIdentity} from '../frontend/services/import-person-links.js';
import {projectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';
import {columnPreviewHtml,importColumnSettingsHtml} from '../frontend/v2/import-mapping.js';
const headers=['FastighetsID','Fastighetsnamn','Fastighetsägare','ObjektID','AvtalsID','Fastighetsförvaltare'];
const rows=[['F1','Test 1','Fiktiv ägare','O1','A1','MGR001 Anna Testsson'],['F2','Test 2','Fiktiv ägare','O2','A2','MGRTWO Bo Testsson'],['F1','Test 1','Fiktiv ägare','O3','A3','MGR001 Anna Testsson']];
function prepare(values=rows,base=emptyData(),configure=()=>{},labels=headers){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([labels,...values]),'Fastigheter');const profiles=profileWorkbook(workbook,importSchemas,XLSX,base.workspace.importMappings||[],{reviewed:true});configure(profiles);return {profiles,result:prepareCleanImport(workbook,profiles,base,{fileName:'syntetisk-forvaltare.xlsx'},XLSX)};}

test('manager role creates people with internal IDs and links each property without duplicate people or fields',()=>{
 const {profiles,result}=prepare(),data=result.clean,anna=data.people.find(p=>p.name==='Anna Testsson');assert.equal(profiles[0].columns[5].target,'properties.ownerResponsiblePersonId');assert.equal(personFormat(profiles[0].columns[5]),'auto-code');assert.equal(result.report.blocking,0);assert.equal(result.report.review,0);assert.equal(data.people.length,2);assert.notEqual(anna.id,'MGR001');assert(data.people.some(p=>p.name==='Bo Testsson'));assert.equal(data.contacts.length,2);assert(data.contacts.every(c=>c.role==='owner'&&c.property_id&&!c.agreement_id));assert.equal(anna.party_id,data.properties[0].owner_party_id);assert(!Object.hasOwn(data.properties[0],'person_id'));
 assert.equal(projectWorkspace(data).properties.find(p=>p.id==='F1').ownerResponsiblePersonId,anna.id);
 const again=prepare(rows,data).result;assert.deepEqual(again.clean.people,data.people);assert.deepEqual(again.clean.contacts,data.contacts);assert.equal(again.report.changes.length,0);
 const html=columnPreviewHtml({fileName:'syntetisk-forvaltare.xlsx'},{profiles},result,importSchemas);assert.doesNotMatch(html,/data-person-format/);assert.match(importColumnSettingsHtml({fileName:'syntetisk-forvaltare.xlsx'},{profiles},result,importSchemas,{}, {},0,5),/Namn: Anna Testsson · Källkod: MGR001/);assert(!html.includes('data-person-identity'));
});
test('plain names create and reuse a person automatically when a person role is selected',()=>{
 const values=rows.map(row=>[...row.slice(0,5),row[5].split(' ').slice(1).join(' ')]),first=prepare(values).result,again=prepare(values,first.clean).result;assert.equal(first.report.review,0);assert.equal(first.clean.people.length,2);assert.equal(first.clean.contacts.length,2);assert.deepEqual(again.clean.people,first.clean.people);assert.equal(again.clean.contacts.length,2);
 const recoded=prepare(rows,first.clean).result;assert.equal(recoded.report.review,0);assert.deepEqual(recoded.clean.people,first.clean.people);assert.deepEqual(recoded.clean.contacts,first.clean.contacts);
});
test('automatic cleanup accepts a mix of coded and plain names without requiring an identifier format',()=>{
 const {result}=prepare([...rows,['F3','Test 3','Fiktiv ägare','O4','A4','Dan Testsson']]);assert.equal(result.report.review,0);assert.equal(result.clean.people.length,3);assert(result.clean.people.some(person=>person.name==='Dan Testsson'));
});
test('ordinary uppercase names are not split; letter-only source codes have an optional reusable cleanup format',()=>{
 assert.deepEqual(parsePersonIdentity('Anna Maria Testsson'),{name:'Anna Maria Testsson'});assert.deepEqual(parsePersonIdentity('ANNA Maria Testsson'),{name:'ANNA Maria Testsson'});assert.equal(personFormat({samples:['ANNA Maria Testsson','BO Karl Testsson']}),'auto');assert.throws(()=>parsePersonIdentity('Oklar Testperson','code-name'),/Välj Automatisk/);
 const values=[['F1','Test 1','Fiktiv ägare','O1','A1','MGRCODE Anna Testsson']],explicit=prepare(values,emptyData(),profiles=>profiles[0].columns[5].personFormat='code-name').result;assert.notEqual(explicit.clean.people[0].id,'MGRCODE');assert.equal(explicit.clean.people[0].name,'Anna Testsson');const again=prepare(values,explicit.clean);assert.equal(again.profiles[0].columns[5].personFormat,'code-name');assert.equal(again.result.clean.people.length,1);
});
test('a separately mapped PersonID is independent of the optional code next to the name',()=>{
 const values=[[...rows[0],'INTERNAL-ID']],{result}=prepare(values,emptyData(),profiles=>profiles[0].columns[6].target='contact.5.sourceId',[...headers,'Separat PersonID']);assert.equal(result.report.blocking,0);assert.equal(result.report.review,0);assert.equal(result.clean.people[0].id,'INTERNAL-ID');assert.equal(result.clean.people[0].name,'Anna Testsson');
});
test('ambiguous names leave only the contact for review and never create an extra person or discard valid agreements',()=>{
 const base=prepare([rows[0]]).result.clean,party=base.properties[0].owner_party_id;base.people.push(normalize('people',{id:'AMB1',name:'Oklar Testperson',party_id:party}),normalize('people',{id:'AMB2',name:'Oklar Testperson',party_id:party}));const {result}=prepare([['F2','Test 2','Fiktiv ägare','O2','A2','Oklar Testperson']],base);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements.length,2);assert.equal(result.clean.people.length,3);assert.equal(result.clean.contacts.length,1);assert.match(result.clean.workspace.importReview[0].reason,/flera personer/);assert.equal(result.clean.workspace.importReview[0].personLinkRejected,true);assert.equal(result.clean.workspace.sourceRegistry[0].receipt.columns[5].read,0);
});
test('failed temporal links roll back person edits and keep the existing person and core records',()=>{
 const first=prepare([rows[0]]).result.clean;first.contacts[0].valid_from='2026-01-01';first.contacts[0].valid_to='2026-12-31';const id=first.people[0].id;
 const {result}=prepare([[...rows[0].slice(0,5),'MGR001 Nytt Testnamn','ny@example.invalid','2026-02-01',id]],first,profiles=>{profiles[0].columns[6].target='contact.5.email';profiles[0].columns[7].target='contact.5.fromDate';profiles[0].columns[8].target='contact.5.sourceId';},[...headers,'E-post','Kontakt från','PersonID']);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.people[0].email,first.people[0].email);assert.equal(result.clean.people[0].name,first.people[0].name);assert.deepEqual(result.clean.contacts,first.contacts);assert(result.clean.workspace.importReview.some(r=>r.personLinkRejected));validateData(result.clean);
});
test('invalid contact dates are isolated to the person link',()=>{
 const {result}=prepare([[...rows[0],'2026-02-30']],emptyData(),profiles=>profiles[0].columns[6].target='contact.5.fromDate',[...headers,'Kontakt från']);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements.length,1);assert.equal(result.clean.people.length,0);assert.equal(result.clean.workspace.importReview[0].personLinkRejected,true);
});
test('an existing PersonID alone reuses the person and a changed source code does not change that identity',()=>{
 const data=prepare([rows[0]]).result.clean,id=data.people[0].id,justId=prepare([[...rows[0].slice(0,5),id]],data).result;assert.equal(justId.report.review,0);assert.equal(justId.clean.people.length,1);assert.equal(justId.clean.contacts.length,1);
 const changedCode=prepare([[...rows[0].slice(0,5),'OTHER999 Anna Testsson']],data).result;assert.equal(changedCode.report.review,0);assert.equal(changedCode.clean.people[0].id,id);assert.equal(changedCode.clean.contacts.length,1);
});
test('structural errors still reject the whole row and no associated person escapes rollback',()=>{
 const first=prepare([rows[0]]).result.clean,{result}=prepare([['OTHER','Annan fastighet','Fiktiv ägare','O1','A1','MGR002 Bo Testsson']],first);assert.equal(result.report.blocking,1);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.people.length,1);assert.equal(result.clean.contacts.length,1);
});
test('person relationships and approved cleanup formats survive canonical Excel export',async()=>{
 const {result}=prepare(rows,emptyData(),profiles=>profiles[0].columns[5].personFormat='code-name'),restored=await readWorkbook(await writeWorkbook(result.clean));assert.deepEqual(restored.people,result.clean.people);assert.deepEqual(restored.contacts,result.clean.contacts);assert.equal(restored.workspace.importMappings[0].columns[5].personFormat,'code-name');assert.equal(restored.workspace.importMappings[0].columns[5].target,'properties.ownerResponsiblePersonId');
});
