import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {approveImportPlan,importCreationPlan} from '../frontend/lokaler/import-plan.js';
import {explainImport} from '../frontend/lokaler/import-explanation.js';
import {importTableHtml} from '../frontend/v2/import-table.js';
import {readWorkbook,writeWorkbook} from '../backend/lokaler/workbook.js';

function base(){
 const data=emptyData();data.properties.push(normalize('properties',{id:'INH0196',name:'TESTET 3',address:'Provgatan 7B',city:'Malmö',management_object_number:'1234'}));
 data.objects.push(normalize('objects',{id:'O1',property_id:'INH0196',area:40}));data.agreements.push(normalize('agreements',{id:'A1',object_id:'O1'}));
 data.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{propertyId:'INH0196',amount:123}}];return data;
}
function source(rows,headers=['Fastighetsbeteckning','Gatuadress','Populärnamn']){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Underlag');
 const profiles=profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true});return {workbook,profiles,fileName:'syntetiskt.xlsx',XLSX};
}
const run=(src,data=base(),context={})=>prepareCleanImport(src.workbook,src.profiles,data,{fileName:src.fileName,...context},XLSX);

test('a unique saved designation and normalized address enrich automatically without a creation or link choice',()=>{
 const src=source([['testet  3','PROVGATAN 7 B','Nytt populärnamn']]),data=base(),before=structuredClone(data),r=run(src,data),saved=approveImportPlan(r,data);
 assert.equal(r.report.blocking,0);assert.equal(r.report.review,0);assert.equal(r.report.linkProposals.length,0);assert.equal(importCreationPlan(r,data).length,0);
 assert.equal(saved.clean.properties.length,1);assert.equal(saved.clean.properties[0].id,'INH0196');assert.equal(saved.clean.properties[0].management_object_number,'1234');assert.equal(saved.clean.properties[0].name,'TESTET 3');assert.equal(saved.clean.properties[0].address,'Provgatan 7B');assert.equal(saved.clean.properties[0].city,'Malmö');assert.equal(saved.clean.properties[0].popular_name,'Nytt populärnamn');
 assert.deepEqual(saved.clean.objects,data.objects);assert.deepEqual(saved.clean.agreements,data.agreements);assert.deepEqual(saved.clean.workspace.budgetPlans,data.workspace.budgetPlans);assert.deepEqual(data,before);
 assert.equal(r.report.sourceRows[0].matchingDecision.method,'property-designation-address');validateData(saved.clean);
 const story=explainImport(r,data,{approved:saved,profiles:src.profiles}),html=importTableHtml(src,src.profiles,r,data,{approved:saved});assert.match(story.rows[0].explanation,/tomma fält kompletteras/);assert.doesNotMatch(html,/data-link-proposal=|data-link-use=|data-link-new=/);
});

test('automatic enrichment retains nonempty saved facts and does not create a competing owner organization',()=>{
 const data=base();data.parties.push(normalize('parties',{id:'OWNER',name:'Sparat bolag AB'}));Object.assign(data.properties[0],{popular_name:'Sparat namn',owner_party_id:'OWNER'});
 const r=run(source([['TESTET 3','Provgatan 7B','Annat namn','Annat bolag AB']],['Fastighetsbeteckning','Gatuadress','Populärnamn','Fastighetsägare']),data);
 assert.equal(r.report.blocking,0);assert.equal(r.report.review,0);assert.equal(r.clean.properties[0].popular_name,'Sparat namn');assert.equal(r.clean.properties[0].owner_party_id,'OWNER');assert.deepEqual(r.clean.parties,data.parties);
 const src=source([['TESTET 3','Provgatan 7B','Filens namn']]),column=src.profiles[0].columns[2],manual=run(src,data,{cellEdits:{edited:{source:src.fileName,sheet:'Underlag',row:2,index:column.index,target:column.target,value:'Manuellt valt namn'}}});assert.equal(manual.clean.properties[0].popular_name,'Manuellt valt namn','An explicit cell correction still overrides the saved descriptive value');
});

test('a missing owner and its contact can be added through the automatically identified property',()=>{
 const data=base(),r=run(source([['TESTET 3','Provgatan 7B','Nytt bolag AB','Anna Testsson']],['Fastighetsbeteckning','Gatuadress','Fastighetsägare','Fastighetsförvaltare']),data),saved=approveImportPlan(r,data);
 assert.equal(r.report.blocking,0);assert.equal(saved.clean.parties.length,1);assert.equal(saved.clean.people.length,1);assert.equal(saved.clean.contacts.length,1);assert.equal(saved.clean.contacts[0].property_id,'INH0196');assert.equal(saved.clean.properties[0].owner_party_id,saved.clean.parties[0].id);
});

test('a differing designation, an address-only match or duplicate saved matches still require a specific choice',()=>{
 const different=run(source([['TESTET 4','Provgatan 7B','Namn']]));assert.equal(different.report.linkProposals.length,1);assert.equal(different.report.linkProposals[0].approved,false);assert.equal(different.clean.properties[0].name,'TESTET 3');
 const addressOnly=run(source([['Provgatan 7B','Namn']],['Gatuadress','Populärnamn']));assert.equal(addressOnly.report.linkProposals.length,1);
 const data=base();data.properties.push(normalize('properties',{...data.properties[0],id:'INH0197'}));const duplicate=run(source([['TESTET 3','Provgatan 7B','Namn']]),data);assert.equal(duplicate.report.linkProposals[0].matches.length,2);assert.equal(duplicate.report.blocking,1);
 const src=source([['TESTET 4','Provgatan 7B','Namn']]),html=importTableHtml(src,src.profiles,different,base());assert.match(html,/Beteckningarna skiljer sig/);assert.match(html,/import-link-list/);assert.match(html,/<details data-property-comparison>/);assert.doesNotMatch(html,/<details data-property-comparison open/);
});

test('fallback address names, numeric names, missing addresses and conflicting cities do not count as two matching identity facts',()=>{
 for(const name of ['Provgatan 7B','1234','Fastighetsbeteckning saknas']){const data=base();data.properties[0].name=name;const r=run(source([[name,'Provgatan 7B','Namn']]),data);assert.notEqual(r.report.sourceRows[0].matchingDecision?.method,'property-designation-address');}
 const named=run(source([['TESTET 3','Namn']],['Fastighetsbeteckning','Populärnamn']));assert.equal(named.report.linkProposals.length,1);
 const city=run(source([['TESTET 3','Provgatan 7B','Lund']],['Fastighetsbeteckning','Gatuadress','Ort']));assert.notEqual(city.report.sourceRows[0].matchingDecision?.method,'property-designation-address');
});

test('supplied conflicting identifiers and properties created during the first import never use automatic text matching',()=>{
 const src=source([['NEW','TESTET 3','Provgatan 7B']],['FastighetsID','Fastighetsbeteckning','Gatuadress']),r=run(src);assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.properties.length,2);assert.equal(r.clean.properties[1].id,'NEW');
 const first=run(source([['P1','TESTET 3','Provgatan 7B'],['P2','TESTET 3','Provgatan 7B'],['','TESTET 3','Provgatan 7B']],['FastighetsID','Fastighetsbeteckning','Gatuadress']),emptyData());assert(first.report.sourceRows.every(row=>row.matchingDecision?.method!=='property-designation-address'));
});

test('automatic matches, original numbers and matching provenance survive Excel roundtrip and repeated import',async()=>{
 const data=base(),src=source([['TESTET 3','Provgatan 7B','Nytt namn']]),r=approveImportPlan(run(src,data),data),roundtrip=await readWorkbook(await writeWorkbook(r.clean)),again=run(src,roundtrip);
 assert.equal(again.report.blocking,0);assert.equal(again.report.review,0);assert.equal(again.report.linkProposals.length,0);assert.equal(again.clean.properties.length,1);assert.equal(again.clean.properties[0].id,'INH0196');assert(roundtrip.workspace.auditLog.some(a=>a.fields.some(f=>f.provenance?.matchingDecision?.method==='property-designation-address')));
});
