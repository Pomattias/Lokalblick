import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,coordinator,validateData} from '../frontend/lokaler/model.js';
import {issueHomeMatcher} from '../frontend/lokaler/issue-import.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileTables,suggestIssueNumberColumns,setMappingRow} from '../frontend/services/import-matching.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
function base(){
 const data=emptyData();
 data.properties.push(normalize('properties',{id:'1058',name:'Testfastighet',address:'Testgatan 1 A',city:'Malmö'}));
 data.objects.push(normalize('objects',{id:'O1',property_id:'1058',area:100}));
 data.people.push(normalize('people',{id:'P1',name:'Testperson'}));
 data.contacts.push(normalize('contacts',{id:'C1',person_id:'P1',role:'coordinator',property_id:'1058'}));
 return data;
}
function prepared(rows,headers=['Ärendenamn','Objektsnummer','Gatuadress'],options={}){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Ärenden 2027');
 return {workbook,profiles:profileTables(workbook,importSchemas,XLSX,[],options)};
}
function run(rows,headers,seed=base(),context={}){
 const {workbook,profiles}=prepared(rows,headers,{referenceData:seed});
 return prepareCleanImport(workbook,profiles,seed,{fileName:'syntetiska-arenden.xlsx',...context},XLSX);
}
const approvals=result=>Object.fromEntries(result.report.linkProposals.map(p=>[p.matchingKey,{propertyId:p.matches[0].id,signature:p.signature}]));
test('ambiguous source number suggests property or object by existing registers; choices stay transparent',()=>{
 const seed=base(),p=prepared([['Kontroll',1058,'Testgatan 1A']],undefined,{referenceData:seed});
 assert.equal(p.profiles[0].primaryTable,'activities');assert.equal(p.profiles[0].columns[1].target,'activities.propertyId');
 const result=prepareCleanImport(p.workbook,p.profiles,seed,{fileName:'syntetiska-arenden.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.issues[0].property_id,'1058');assert.equal(result.clean.issues[0].object_id,null);
 assert.equal(coordinator(result.clean,'issues',result.clean.issues[0]).person.id,'P1');
 const html=columnPreviewHtml({fileName:'syntetiska-arenden.xlsx'}, {profiles:p.profiles},result,importSchemas);
 assert.match(html,/data-issue-number/);assert.match(html,/1 kopplade till fastighet/);assert.match(html,/FastighetsID \/ förvaltningsnummer/);
 const object=prepared([['Kontroll','O1','Testgatan 1A']],undefined,{referenceData:seed});assert.equal(object.profiles[0].columns[1].target,'activities.objectId');
 seed.objects.push(normalize('objects',{id:'1058',property_id:'1058'}));
 const ambiguous=prepared([['Kontroll',1058]],undefined,{referenceData:seed});assert.equal(ambiguous.profiles[0].columns[1].target,'@unmapped');
 ambiguous.profiles[0].columns[1].target='activities.propertyId';ambiguous.profiles[0].columns[1].approved=true;
 assert.equal(suggestIssueNumberColumns(ambiguous.profiles,seed),false);assert.equal(ambiguous.profiles[0].columns[1].target,'activities.propertyId');
});
test('explicit ObjectID, explicit mapping rows and saved choices are not reinterpreted as property numbers',()=>{
 const seed=base();
 const actual=run([['Kontroll','O1']],['Ärendenamn','ObjektID']);assert.equal(actual.clean.issues[0].object_id,'O1');
 const unknown=run([['Kontroll',1058]],['Ärendenamn','ObjektID']);assert.equal(unknown.clean.issues[0].property_id,null);assert.equal(unknown.clean.issues[0].object_id,null);
 const p=prepared([['Ärende.Namn','Ärende.ObjektID'],['Kontroll',1058]],['Ärendenamn','Objektsnummer']);
 setMappingRow(p.workbook,p.profiles[0],true,importSchemas,XLSX);suggestIssueNumberColumns(p.profiles,seed);assert.equal(p.profiles[0].columns[1].target,'activities.objectId');
 const plain=prepared([['Kontroll',1058]],undefined,{referenceData:seed}),profile=plain.profiles[0];
 const saved=[{signature:profile.signature,layoutSignature:profile.layoutSignature,sheet:profile.name,primaryTable:'activities',columns:profile.columns.map(c=>({...c,target:c.index===1?'activities.objectId':c.target}))}];
 const again=profileTables(plain.workbook,importSchemas,XLSX,saved,{referenceData:seed});assert.equal(again[0].columns[1].target,'activities.objectId');assert.equal(again[0].columns[1].matchSource,'saved');
});
test('addresses match conservatively and never fabricate objects or overwrite property information',()=>{
 const rows=[['Kontroll','  TESTGATAN  1A  ','Annat beskrivande namn']],headers=['Ärendenamn','Gatuadress','Fastighet'],pending=run(rows,headers);assert.equal(pending.clean.issues.length,0);const first=run(rows,headers,base(),{rowMatches:approvals(pending)});
 assert.equal(first.clean.issues[0].property_id,'1058');assert.equal(first.clean.issues[0].object_id,null);assert.deepEqual(first.clean.properties,base().properties);assert.equal(first.clean.objects.length,1);
 assert.equal(first.clean.issues[0].sources[0].matchingDecision.method,'explicit-row-choice');validateData(first.clean);
 for(const address of ['Testgatan 1','Testgatan 1B','Testgatan 11A','Testgatan 1–3']){
  const result=run([['Kontroll',address]],['Ärendenamn','Gatuadress']);assert.equal(result.clean.issues[0].property_id,null,address);assert.equal(result.clean.properties.length,1);
 }
 const seed=base();seed.properties.push(normalize('properties',{id:'1059',name:'Annan fastighet',address:'Testgatan 1A',city:'Lund'}));
 const ambiguous=run([['Kontroll','Testgatan 1A']],['Ärendenamn','Gatuadress'],seed);assert.equal(ambiguous.clean.issues.length,0);assert.equal(ambiguous.report.linkProposals[0].matches.length,2);
 const city=run([['Kontroll','Testgatan 1A','Malmö']],['Ärendenamn','Gatuadress','Ort'],seed);assert.equal(city.clean.issues.length,0);assert.equal(city.report.linkProposals[0].matches[0].id,'1058');
 const id=run([['Kontroll','1059','Testgatan 1A']],['Ärendenamn','FastighetsID','Gatuadress'],seed);assert.equal(id.clean.issues[0].property_id,'1059');
});
test('known conflicting references are left Att koppla rather than attached to a wrong property',()=>{
 const seed=base();seed.properties.push(normalize('properties',{id:'1059',name:'Annan fastighet',address:'Andragatan 2'}));
 const result=run([['Kontroll','1058','Andragatan 2']],['Ärendenamn','FastighetsID','Gatuadress'],seed);
 assert.equal(result.clean.issues[0].property_id,null);assert.match(result.clean.issues[0].sources[0].matchingDecision.reason,/Ingen entydig/);
 const object=run([['Kontroll','O1','Andragatan 2']],['Ärendenamn','ObjektID','Gatuadress'],seed);assert.equal(object.clean.issues[0].object_id,null);
 const matcher=issueHomeMatcher(seed);assert.equal(matcher({issues:{property_id:'001058'}}).property.id,'1058');
 seed.properties.push(normalize('properties',{id:'01058',name:'Separat',address:'Tredjegatan 3'}));
 assert.equal(issueHomeMatcher(seed)({issues:{property_id:'0001058'}}).property,undefined);
 assert.equal(issueHomeMatcher(seed)({issues:{property_id:'01058'}}).property.id,'01058');
});
test('register sheets are imported before issue lookup sheets and repeat imports retain IDs and links',()=>{
 const seed=emptyData(),p=prepared([['Kontroll','Ny testgata 2']],['Ärendenamn','Gatuadress']);
 XLSX.utils.book_append_sheet(p.workbook,XLSX.utils.aoa_to_sheet([['FastighetsID','Fastighetsnamn','Gatuadress'],['F2','Ny fastighet','Ny testgata 2']]),'Fastigheter');
 p.profiles=profileTables(p.workbook,importSchemas,XLSX);
 const pending=prepareCleanImport(p.workbook,p.profiles,seed,{fileName:'syntetiska-arenden.xlsx'},XLSX);assert.equal(pending.clean.properties.length,1);assert.equal(pending.clean.issues.length,0);const result=prepareCleanImport(p.workbook,p.profiles,seed,{fileName:'syntetiska-arenden.xlsx',rowMatches:approvals(pending)},XLSX);assert.equal(result.clean.issues[0].property_id,'F2');assert.equal(result.clean.properties.length,1);
 const again=prepareCleanImport(p.workbook,p.profiles,result.clean,{fileName:'syntetiska-arenden.xlsx'},XLSX);assert.equal(again.clean.issues.length,1);assert.equal(again.clean.issues[0].id,result.clean.issues[0].id);assert.equal(again.clean.issues[0].property_id,'F2');
 const initially=run([['Kontroll','Okänd gata 2']],['Ärendenamn','Gatuadress']);
 initially.clean.properties[0].address='Okänd gata 2';
 const waiting=run([['Kontroll','Okänd gata 2']],['Ärendenamn','Gatuadress'],initially.clean),linked=run([['Kontroll','Okänd gata 2']],['Ärendenamn','Gatuadress'],initially.clean,{rowMatches:approvals(waiting)});assert.equal(linked.clean.issues[0].id,initially.clean.issues[0].id);assert.equal(linked.clean.issues[0].property_id,'1058');
});
test('correcting a saved object-number mapping reuses the existing issue and preserves manual homes',()=>{
 const seed=base(),p=prepared([['Kontroll',1058,'Testgatan 1A']]);
 p.profiles[0].columns[1].target='activities.objectId';p.profiles[0].columns[1].approved=true;
 const first=prepareCleanImport(p.workbook,p.profiles,seed,{fileName:'syntetiska-arenden.xlsx'},XLSX);
 assert.equal(first.clean.issues[0].property_id,null);
 p.profiles[0].columns[1].target='activities.propertyId';
 const linked=prepareCleanImport(p.workbook,p.profiles,first.clean,{fileName:'syntetiska-arenden.xlsx'},XLSX);
 assert.equal(linked.report.blocking,0);assert.equal(linked.clean.issues.length,1);assert.equal(linked.clean.issues[0].id,first.clean.issues[0].id);assert.equal(linked.clean.issues[0].property_id,'1058');
 const unknown=run([['Kontroll','Okänd adress']],['Ärendenamn','Gatuadress']);unknown.clean.issues[0].object_id='O1';
 const unchanged=run([['Kontroll','Okänd adress']],['Ärendenamn','Gatuadress'],unknown.clean);assert.equal(unchanged.clean.issues[0].object_id,'O1');
});
