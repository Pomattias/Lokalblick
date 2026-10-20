import {profileWorkbook} from '../frontend/services/import-engine.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import ExcelJS from 'exceljs';import XLSX from 'xlsx';
import '../frontend/domain/calculations.js';
import {LocalStore} from '../backend/lokaler/store.js';
import {tables,emptyData,normalize,roles} from '../frontend/lokaler/model.js';
import {upgradeData,retiredFields} from '../frontend/lokaler/model-revision.js';
import {writeWorkbook,readWorkbook} from '../frontend/lokaler/workbook.js';
import {viewFields} from '../frontend/lokaler/view-fields.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {renderContractEditor} from '../frontend/v2/contract-editor.js';
import {relationshipView} from '../frontend/v2/relationships.js';
const oldData=()=>({...emptyData(),parties:[{id:'owner',name:'Ägaren'},{id:'tenant',name:'Hyresgästen'},{id:'our',name:'Vi',kind:'our'}],people:[{id:'P1',name:'Kontakt',party_id:'tenant'}],properties:[{id:'F1',name:'Fastighet',owner_party_id:'owner',kind:'Gammal typ',geo_source:'manual',geo_confirmed_by:'Test',geo_confirmed_at:'2026-01-01'}],objects:[{id:'O1',property_id:'F1',name:'Gammal benämning',area:100,apartment_count:3,usage:'Gammal typ',unit_id:'ORDBO'}],agreements:[{id:'internal-id',number:'9(1)',object_id:'O1',tenant_party_id:'tenant',annual_rent:123000,annual_additions:12000,annual_property_tax:6000,rent_adjustment_method:'none',addition_adjustment_method:'none',business_comment:'Daglig verksamhet',staff_count:'12 / 3',cost_center:'123'}],contacts:[{id:'C1',role:'tenant',person_id:'P1',agreement_id:'internal-id'},{id:'C2',role:'business',person_id:'P1',agreement_id:'internal-id'}],issues:[{id:'I1',property_id:'F1',title:'Ärende',phase:'Planering'}],workspace:{budgetPlans:[{year:2027,status:'Låst',rows:[{sourceType:'manual',sourceId:'MANUAL',amount:141000}]}],auditLog:[{id:'old-audit',collection:'contracts',recordId:'internal-id',fields:[{field:'business_comment',from:'Tidigare',to:'Daglig verksamhet'}]}]}});

test('the selected retired fields are absent from the model, import catalog and view field map',()=>{
 for(const[t,fields]of Object.entries(retiredFields))for(const key of Object.keys(fields)){
  assert(!tables[t].fields.some(f=>f.key===key),t+'.'+key);assert(!Object.hasOwn(viewFields[t]||{},key));
  assert.throws(()=>normalize(t,{id:'test',[key]:'retired'}),/finns inte/);
 }
 const schema=importSchemas.find(s=>s.key==='contracts');assert.equal(schema.columns.filter(([k])=>k==='id').length,1);assert(!schema.columns.some(([k])=>k==='number'||k==='businessResponsiblePersonId'||k==='businessPartyId'));
 assert.deepEqual(Object.keys(roles),['owner','coordinator','tenant']);
});
test('upgrade keeps agreement identity, historical contact dates and removed values auditable',()=>{
 const old=oldData(),budget=structuredClone(old.workspace.budgetPlans),data=upgradeData(old);
 assert.equal(old.agreements[0].number,'9(1)','input is unchanged');assert.equal(data.agreements[0].id,'9(1)');assert.equal(data.contacts.length,1);assert.equal(data.contacts[0].agreement_id,'9(1)');assert.equal(data.contacts[0].id,'C1');
 assert.equal(data.agreements[0].business,'Daglig verksamhet');assert.equal(data.agreements[0].workplace_count,null);assert.equal(data.agreements[0].hub_count,null,'composite old counts are never guessed');
 assert.equal(data.workspace.auditLog[0].recordId,'9(1)');assert.equal(data.workspace.auditLog[0].previousRecordId,'internal-id');
 assert.match(JSON.stringify(data.workspace.auditLog),/Gammal benämning/);assert.match(JSON.stringify(data.workspace.auditLog),/12 \/ 3/);assert.deepEqual(data.workspace.budgetPlans,budget);
 assert.deepEqual(upgradeData(data),data,'upgrade is idempotent');
});
test('ambiguous agreement identities stop an upgrade without changing the source data',()=>{
 const old=oldData();old.agreements.push({...old.agreements[0],id:'different'});const before=structuredClone(old);assert.throws(()=>upgradeData(old),/AvtalsID finns flera/);assert.deepEqual(old,before);
});
test('current rent, contractual additions and tax remain identical after cleanup',()=>{
 const old=oldData();const data=upgradeData(old),contract=projectWorkspace(data).contracts[0],calc=globalThis.LokalblickCalculations;
 const before={baseRent:123000,baseAdditions:12000,annualPropertyTax:6000,rentAdjustmentMethod:'none',additionAdjustmentMethod:'none'};
 assert.deepEqual(calc.annualValues(contract,2027,0,[]),calc.annualValues(before,2027,0,[]));assert.equal(calc.annualValues(contract,2027,0,[]).total,141000);
});
test('Excel persists only one agreement identity and keeps descriptive business and two counts',async()=>{
 const data=upgradeData(oldData());data.agreements[0].workplace_count=12;data.agreements[0].hub_count=3;
 const bytes=await writeWorkbook(data,ExcelJS),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 const headers=book.getWorksheet('Avtal').getRow(1).values.slice(1);assert(headers.includes('AvtalsID'));assert(!headers.includes('Avtalsnummer'));assert(!headers.includes('Kommentar verksamhet'));assert(headers.includes('Verksamhet'));
 const read=await readWorkbook(bytes,ExcelJS);assert.deepEqual(read,data);assert(!read.workspace.assignments);
});
test('the preceding Excel headings can be read without losing history or writing the source file',async()=>{
 const data=upgradeData(oldData()),book=new ExcelJS.Workbook();await book.xlsx.load(await writeWorkbook(data,ExcelJS));
 const a=book.getWorksheet('Avtal');const idIndex=a.getRow(1).values.indexOf('AvtalsID');a.getCell(2,idIndex).value='internal-id';const col=a.columnCount+1;a.getCell(1,col).value='Avtalsnummer';a.getCell(2,col).value='9(1)';
 const contacts=book.getWorksheet('Personkopplingar');const index=contacts.getRow(1).values.indexOf('AvtalsID');contacts.getCell(2,index).value='internal-id';
 const roleIndex=contacts.getRow(1).values.indexOf('Roll');contacts.getCell(2,roleIndex).value='Verksamhetens kontakt';
 const loaded=await readWorkbook(await book.xlsx.writeBuffer(),ExcelJS);assert.equal(loaded.agreements[0].id,'9(1)');assert.equal(loaded.contacts[0].agreement_id,'9(1)');assert.equal(loaded.contacts[0].role,'tenant');
});
test('SQL removes old physical columns transactionally and keeps a backup and budget snapshot',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'simplify-sql-'));const file=path.join(dir,'data.sqlite');let store;
 try{
  const db=new DatabaseSync(file);db.exec('PRAGMA application_id=0x4c4b4c32; CREATE TABLE store_meta(id INTEGER PRIMARY KEY,version INTEGER); INSERT INTO store_meta VALUES(1,4); CREATE TABLE workspace(key TEXT PRIMARY KEY,value TEXT);');
  const old=oldData();
  for(const[t,spec]of Object.entries(tables)){
   const fields=new Map([['id','TEXT'],...spec.fields.map(f=>[f.key,['number','coordinate'].includes(f.type)?'REAL':['integer','boolean'].includes(f.type)?'INTEGER':'TEXT']),...Object.keys(retiredFields[t]||{}).map(k=>[k,'TEXT']),...Object.keys(old[t]?.[0]||{}).filter(k=>!spec.fields.some(f=>f.key===k)&&k!=='id').map(k=>[k,typeof old[t][0][k]==='number'?'REAL':'TEXT'])]);
   db.exec(`CREATE TABLE ${t} (${[...fields].map(([k,type])=>k+' '+type).join(',')})`);
   for(const row of old[t]){const keys=Object.keys(row);db.prepare(`INSERT INTO ${t}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));}
  }
  for(const[k,v]of Object.entries(old.workspace))db.prepare('INSERT INTO workspace VALUES(?,?)').run(k,JSON.stringify(v));db.close();
  store=await LocalStore.open({file});const saved=store.snapshot();assert.equal(saved.version,5);assert.equal(saved.data.agreements[0].id,'9(1)');assert.deepEqual(saved.data.workspace.budgetPlans,old.workspace.budgetPlans);
  for(const[t,fields]of Object.entries(retiredFields)){const cols=store.db.prepare('PRAGMA table_info('+t+')').all().map(c=>c.name);assert(Object.keys(fields).every(k=>!cols.includes(k)));}
  const backups=(await readdir(dir)).filter(n=>n.includes('before-simplify-'));assert.equal(backups.length,1);const backup=new DatabaseSync(path.join(dir,backups[0]),{readOnly:true});assert.equal(backup.prepare('SELECT number FROM agreements').get().number,'9(1)');backup.close();
  await store.close();store=null;store=await LocalStore.open({file});assert.equal(store.snapshot().version,5);assert.equal((await readdir(dir)).filter(n=>n.includes('before-simplify-')).length,1);
 }finally{if(store)await store.close();await rm(dir,{recursive:true,force:true});}
});
test('dated contacts have one storage owner; order contacts and inheritance survive view saves',()=>{
 const data=upgradeData(oldData());data.people.push(normalize('people',{id:'OUR',name:'Samordnare',party_id:'our'}));data.contacts.push(normalize('contacts',{id:'OUR-LINK',person_id:'OUR',role:'coordinator',property_id:'F1'}));data.orders.push(normalize('orders',{id:'B1',issue_id:'I1',title:'Beställning'}));
 const view=projectWorkspace(data);assert.equal(view.orders[0].responsiblePersonId,'OUR');const saved=collectWorkspace(view,data);assert.equal(saved.contacts.length,data.contacts.length);assert.equal(saved.workspace.assignments,undefined);assert.equal(saved.orders[0].person_id,undefined);
 assert.doesNotMatch(relationshipView(view),/AvtalVerksamhet|Verksamheter/);assert.match(relationshipView(view),/Personkopplingar/);
});
test('old Avtalsnummer input maps to the sole identity and new descriptive fields create no organizations',()=>{
 const headers=['FastighetsID','Fastighetsnamn','ObjektID','Avtalsnummer','Verksamhet','Antal arbetsplatser','Antal hubbplatser'];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([headers,['F1','Fastighet','O1','9(1)','Träffpunkt',12,3]]),'Underlag');
 const prepared={workbook:wb,profiles:[{name:'Underlag',headerRow:1,columns:headers.map((header,index)=>({header,index,target:'@unmapped'}))}]};
 const profiles=profileWorkbook(wb,importSchemas,XLSX,[],{reviewed:true});profiles[0].columns[1].target='properties.designation';const result=prepareCleanImport(wb,profiles,emptyData(),{fileName:'test.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.agreements[0].id,'9(1)');assert.equal(result.clean.agreements[0].business,'Träffpunkt');assert.equal(result.clean.agreements[0].workplace_count,12);assert.equal(result.clean.agreements[0].hub_count,3);assert.equal(result.clean.parties.length,0);
 const log=result.clean.workspace.auditLog.find(e=>e.collection==='contracts'&&e.recordId==='9(1)');assert.equal(log.fields.find(f=>f.field==='business').provenance.row,2);assert.equal(log.fields.find(f=>f.field==='business').provenance.source,'test.xlsx');
});
test('person register and contact columns reuse the same identity, with party stored once',()=>{
 const base=upgradeData(oldData());base.people=[];base.contacts=[];
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['PersonID','Namn','E-post','Part'],['P1','Kontakt','test@example.invalid','tenant']]),'Personer');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['AvtalsID','Kontakt','E-post'],['9(1)','Kontakt','test@example.invalid']]),'Avtal');
 const profiles=[{name:'Avtal',headerRow:1,columns:['contracts.id','contracts.tenantResponsiblePersonId','contact.1.email'].map((target,index)=>({index,target}))},{name:'Personer',headerRow:1,columns:['people.id','people.name','people.email','people.organizationId'].map((target,index)=>({index,target}))}];
 const result=prepareCleanImport(wb,profiles,base,{fileName:'register.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.people.length,1);assert.equal(result.clean.people[0].id,'P1');assert.equal(result.clean.people[0].party_id,'tenant');assert.equal(result.clean.contacts[0].person_id,'P1');assert(!Object.hasOwn(result.clean.contacts[0],'party_id'));
});
test('an order may have a dated responsible person without copying the person to the order',()=>{
 const base=upgradeData(oldData());base.people.push(normalize('people',{id:'OUR',name:'Intern person',party_id:'our',email:'our@example.invalid'}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['BeställningsID','ÄrendeID','Namn','Vår ansvarige','Kontakt e-post'],['B1','I1','Beställning','Intern person','our@example.invalid']]),'Beställningar');
 const profiles=[{name:'Beställningar',headerRow:1,columns:['orders.id','orders.activityId','orders.title','orders.responsiblePersonId','contact.3.email'].map((target,index)=>({target,index}))}];const result=prepareCleanImport(wb,profiles,base,{fileName:'order.xlsx'},XLSX);
 assert.equal(result.report.blocking,0);assert.equal(result.clean.orders.length,1);assert.equal(result.clean.people.length,2);const link=result.clean.contacts.find(c=>c.order_id==='B1');assert.equal(link.person_id,'OUR');assert.equal(link.role,'coordinator');assert.equal(result.clean.orders[0].person_id,undefined);
 assert.deepEqual(collectWorkspace(projectWorkspace(result.clean),result.clean).contacts,result.clean.contacts);
});

test('an existing budget reference to a replaced identity blocks conversion instead of changing Budget',()=>{
 const old=oldData();old.workspace.budgetPlans[0].rows=[{sourceType:'contract',sourceId:'internal-id',amount:141000}];const before=structuredClone(old);
 assert.throws(()=>upgradeData(old),/Budgeten refererar till tidigare AvtalsID/);assert.deepEqual(old,before);
});
