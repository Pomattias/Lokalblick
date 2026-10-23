import {profileWorkbook} from '../frontend/services/import-engine.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';import XLSX from 'xlsx';
import '../frontend/domain/calculations.js';
import {LocalStore} from '../backend/lokaler/store.js';
import {tables,emptyData,normalize,roles} from '../frontend/lokaler/model.js';
import {normalizeWorkspace} from '../frontend/lokaler/workspace-data.js';
import {writeWorkbook,readWorkbook} from '../frontend/lokaler/workbook.js';
import {viewFields} from '../frontend/lokaler/view-fields.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {renderContractEditor} from '../frontend/v2/contract-editor.js';
import {relationshipView} from '../frontend/v2/relationships.js';
const fixture=()=>normalizeWorkspace({...emptyData(),parties:[{id:'owner',name:'Ägaren'},{id:'tenant',name:'Hyresgästen'},{id:'our',name:'Vi',kind:'our'}],people:[{id:'P1',name:'Kontakt',party_id:'tenant'}],properties:[{id:'F1',name:'Fastighet',owner_party_id:'owner'}],objects:[{id:'O1',property_id:'F1',area:100,apartment_count:3}],agreements:[{id:'9(1)',object_id:'O1',tenant_party_id:'tenant',business_name:'Daglig verksamhet',business_description:'Beskrivning'}],agreement_items:[{id:'base',agreement_id:'9(1)',type:'base',name:'Bashyra',base_amount:123000,adjustment_method:'none'},{id:'addition',agreement_id:'9(1)',type:'addition',name:'Tillägg',base_amount:12000,adjustment_method:'none'},{id:'tax',agreement_id:'9(1)',type:'tax',name:'Skatt',base_amount:6000,adjustment_method:'none'}],contacts:[{id:'C1',role:'tenant',person_id:'P1',agreement_id:'9(1)'}],issues:[{id:'I1',property_id:'F1',title:'Ärende'}],workspace:{budgetPlans:[{year:2027,status:'Låst',rows:[{sourceType:'manual',sourceId:'MANUAL',amount:141000}]}],auditLog:[]}});

test('the current model has one agreement identity, business fields and three contact roles',()=>{
 assert.deepEqual(Object.keys(roles),['owner','coordinator','tenant']);
 const schema=importSchemas.find(s=>s.key==='contracts');assert.equal(schema.columns.filter(([k])=>k==='id').length,1);
 assert(schema.columns.some(([k])=>k==='businessName'));assert(schema.columns.some(([k])=>k==='businessDescription'));
 for(const key of ['number','business','business_comment'])assert.throws(()=>normalize('agreements',{id:'A',object_id:'O1',[key]:'obsolete'}),/finns inte/);
});
test('workspace validation is idempotent, clones input and adds no migration history',()=>{
 const data=fixture(),before=structuredClone(data),clean=normalizeWorkspace(data);assert.deepEqual(clean,before);assert.deepEqual(normalizeWorkspace(clean),clean);
 clean.agreements[0].business_name='Redigerat';assert.deepEqual(data,before);assert.deepEqual(clean.workspace.budgetPlans,before.workspace.budgetPlans);assert.deepEqual(clean.workspace.auditLog,[]);
});
test('editing current agreement fields leaves a locked budget baseline untouched',()=>{
 const data=fixture(),snapshot=structuredClone(data.workspace.budgetPlans),view=projectWorkspace(data);
 view.contracts[0].businessName='Ny verksamhet';view.contracts[0].businessDescription='Ny beskrivning';
 const saved=collectWorkspace(view,data);
 assert.equal(saved.agreements[0].business_name,'Ny verksamhet');assert.equal(saved.agreements[0].business_description,'Ny beskrivning');
 assert.deepEqual(saved.workspace.budgetPlans,snapshot);assert.deepEqual(data.workspace.budgetPlans,snapshot);
});
test('duplicate agreement IDs and obsolete registers are rejected without changing input',()=>{
 const data=fixture();data.agreements.push({...data.agreements[0]});const before=structuredClone(data);assert.throws(()=>normalizeWorkspace(data),/ID/);assert.deepEqual(data,before);
 assert.throws(()=>normalizeWorkspace({...fixture(),businesses:[]}),/Okänt register/);
});
test('current agreement items calculate rent, additions and tax without scalar copies',()=>{
 const data=fixture(),contract=projectWorkspace(data).contracts[0],calc=globalThis.LokalblickCalculations;
 assert.equal(calc.annualValues(contract,2027,0,[]).total,141000);assert.equal(data.agreements[0].annual_rent,undefined);
});
test('Excel persists current business fields and one agreement identity without conversion',async()=>{
 const data=fixture();data.agreements[0].workplace_count=12;data.agreements[0].hub_count=3;
 const bytes=await writeWorkbook(data,ExcelJS),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 const headers=book.getWorksheet('Avtal').getRow(1).values.slice(1);assert(headers.includes('AvtalsID'));assert(headers.includes('Verksamhet'));assert(headers.includes('Verksamhetsbeskrivning'));assert(!headers.includes('Avtalsnummer'));
 assert.deepEqual(await readWorkbook(bytes,ExcelJS),data);
});
test('a workbook with obsolete internal columns is rejected instead of migrated',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await writeWorkbook(fixture(),ExcelJS));const sheet=book.getWorksheet('Avtal');sheet.getCell(1,sheet.columnCount+1).value='Avtalsnummer';
 await assert.rejects(readWorkbook(await book.xlsx.writeBuffer(),ExcelJS),/Kolumnerna/);
});
test('an obsolete SQLite schema is rejected without migration or rewriting the data file',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'current-schema-')),file=path.join(dir,'data.sqlite');let store;
 try{
  store=await LocalStore.open({file});await store.replace(fixture(),0);await store.close();store=null;
  const db=new DatabaseSync(file);db.exec('ALTER TABLE agreements ADD COLUMN business TEXT');db.close();const before=await readFile(file);
  await assert.rejects(LocalStore.open({file}),/aktuell modell/);assert.deepEqual(await readFile(file),before);
 }finally{if(store)await store.close();await rm(dir,{recursive:true,force:true});}
});
test('dated contacts have one storage owner; order contacts and inheritance survive view saves',()=>{
 const data=fixture();data.people.push(normalize('people',{id:'OUR',name:'Samordnare',party_id:'our'}));data.contacts.push(normalize('contacts',{id:'OUR-LINK',person_id:'OUR',role:'coordinator',property_id:'F1'}));data.orders.push(normalize('orders',{id:'B1',issue_id:'I1',title:'Beställning'}));
 const view=projectWorkspace(data);assert.equal(view.orders[0].responsiblePersonId,'OUR');const saved=collectWorkspace(view,data);assert.equal(saved.contacts.length,data.contacts.length);assert.equal(saved.workspace.assignments,undefined);assert.equal(saved.orders[0].person_id,undefined);
 assert.doesNotMatch(relationshipView(view),/AvtalVerksamhet|Verksamheter/);assert.match(relationshipView(view),/Personkopplingar/);
});
test('old Avtalsnummer input maps to the sole identity and new descriptive fields create no organizations',()=>{
 const headers=['FastighetsID','Fastighetsnamn','ObjektID','Avtalsnummer','Verksamhet','Antal arbetsplatser','Antal hubbplatser'];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,['F1','Fastighet','O1','9(1)','Träffpunkt',12,3]]),'Underlag');
 const prepared={workbook:wb,profiles:[{name:'Underlag',headerRow:1,columns:headers.map((header,index)=>({header,index,target:'@unmapped'}))}]};
 const profiles=profileWorkbook(wb,importSchemas,XLSX,[],{reviewed:true});profiles[0].columns[1].target='properties.designation';const result=prepareCleanImport(wb,profiles,emptyData(),{fileName:'test.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements[0].id,'9(1)');assert.equal(result.clean.agreements[0].business_name,'Träffpunkt');assert.equal(result.clean.agreements[0].workplace_count,12);assert.equal(result.clean.agreements[0].hub_count,3);assert.equal(result.clean.parties.length,0);
 const log=result.clean.workspace.auditLog.find(e=>e.collection==='contracts'&&e.recordId==='9(1)');assert.equal(log.fields.find(f=>f.field==='businessName').provenance.row,2);assert.equal(log.fields.find(f=>f.field==='businessName').provenance.source,'test.xlsx');
});
test('person register and contact columns reuse the same identity, with party stored once',()=>{
 const base=fixture();base.people=[];base.contacts=[];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['PersonID','Namn','E-post','Part'],['P1','Kontakt','test@example.invalid','tenant']]),'Personer');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['AvtalsID','Kontakt','E-post'],['9(1)','Kontakt','test@example.invalid']]),'Avtal');
 const profiles=[{name:'Avtal',headerRow:1,columns:['contracts.id','contracts.tenantResponsiblePersonId','contact.1.email'].map((target,index)=>({index,target}))},{name:'Personer',headerRow:1,columns:['people.id','people.name','people.email','people.organizationId'].map((target,index)=>({index,target}))}];
 const result=prepareCleanImport(wb,profiles,base,{fileName:'register.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.people.length,1);assert.equal(result.clean.people[0].id,'P1');assert.equal(result.clean.people[0].party_id,'tenant');assert.equal(result.clean.contacts[0].person_id,'P1');assert(!Object.hasOwn(result.clean.contacts[0],'party_id'));
});
test('an order may have a dated responsible person without copying the person to the order',()=>{
 const base=fixture();base.people.push(normalize('people',{id:'OUR',name:'Intern person',party_id:'our',email:'our@example.invalid'}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['BeställningsID','ÄrendeID','Namn','Vår ansvarige','Kontakt e-post'],['B1','I1','Beställning','Intern person','our@example.invalid']]),'Beställningar');
 const profiles=[{name:'Beställningar',headerRow:1,columns:['orders.id','orders.activityId','orders.title','orders.responsiblePersonId','contact.3.email'].map((target,index)=>({target,index}))}];const result=prepareCleanImport(wb,profiles,base,{fileName:'order.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.orders.length,1);assert.equal(result.clean.people.length,2);const link=result.clean.contacts.find(c=>c.order_id==='B1');assert.equal(link.person_id,'OUR');assert.equal(link.role,'coordinator');assert.equal(result.clean.orders[0].person_id,undefined);
 assert.deepEqual(collectWorkspace(projectWorkspace(result.clean),result.clean).contacts,result.clean.contacts);
});
