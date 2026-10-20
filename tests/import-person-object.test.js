import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import XLSX from 'xlsx';
import {profileWorkbook,prepareMappedImport,retargetColumn,fieldCatalog} from '../frontend/services/import-engine.js';
import {reviewProfiles} from '../frontend/v2/import-mapping.js';
import {normalize} from '../frontend/v2/model.js';
const context=vm.createContext({window:{},XLSX});vm.runInContext(fs.readFileSync('frontend/domain/object-model.js','utf8'),context);vm.runInContext(fs.readFileSync('frontend/services/source-service.js','utf8'),context);
const service=context.window.LokalblickSourceService,schemas=service.schemas;
const headers=['Förvaltningsobjekt','Avtalsnummer','Objektnummer','Area','Årshyra','Hyresgästens kontaktperson','E-post hyresgäst','Vår avtalsansvarige','E-post ansvarig','Kontakt från','Kontakt till'];
const row=['P1','A1','O1',100,120000,'Anna Lind','anna@example.invalid','Johan Ek','johan@example.invalid','',''];
function run(rows=[row],base={},configure=()=>{}){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Lokallista');
 const profiles=profileWorkbook(workbook,schemas,XLSX,base.importMappings||[],{reviewed:true});
 const targets=['properties.sourceId','contracts.number','objects.number','objects.area','contracts.baseRent','contracts.tenantResponsiblePersonId','contact.5.email','contracts.responsiblePersonId','contact.7.email','contact.5.fromDate','contact.5.toDate'];
 profiles[0].columns.forEach((column,index)=>retargetColumn(workbook,profiles[0],column,targets[index],XLSX));
 configure(profiles,workbook);
 return prepareMappedImport(workbook,profiles,base,{schemas,fileName:'test.xlsx',fingerprint:'test-contact-object',actor:'Test',strictColumns:true,personLinks:true,objectAreas:true},XLSX);
}
test('several name columns become distinct roles; repeated rows and reimport reuse people and links',()=>{
 const first=run([row,row,{...row,1:'A2',2:'O2',4:240000}].map(value=>Array.isArray(value)?value:Object.values(value)));
 assert.equal(first.data.properties.length,1);assert.equal(first.data.objects.length,2);assert.equal(first.data.contracts.length,2);
 assert.equal(first.data.people.length,2);assert.equal(first.data.assignments.length,4);
 for(const contract of first.data.contracts){
  assert.equal(contract.tenantResponsiblePersonId,first.data.people.find(person=>person.name==='Anna Lind').id);
  assert.equal(contract.responsiblePersonId,first.data.people.find(person=>person.name==='Johan Ek').id);
 }
 const again=run([row,row,[...row.slice(0,1),'A2','O2',...row.slice(3)]],first.data);
 assert.equal(again.data.people.length,2);assert.equal(again.data.assignments.length,4);assert.equal(again.report.counts.fields,0);
 assert.deepEqual(globalThis.LokalblickResponsibility.issues(again.data),[]);
});
test('two name columns can select the same role only with explicit shared responsibility',()=>{
 const first=run([row],{},profiles=>{profiles[0].columns[7].target='contracts.tenantResponsiblePersonId';});
 assert.equal(first.data.people.length,1);assert.equal(first.data.assignments.length,1);assert.ok(first.data.importReview.some(review=>review.kind==='person-link'));
 const shared=run([row],{},profiles=>{profiles[0].columns[7].target='contracts.tenantResponsiblePersonId';profiles[0].columns[5].shared=true;profiles[0].columns[7].shared=true;profiles[0].columns[9].target='@ignore';profiles[0].columns[10].target='@ignore';});
 // Undated initial links may coexist only when every link is explicitly shared.
 assert.equal(shared.data.assignments.length,2);assert.equal(shared.data.people.length,2);assert.deepEqual(globalThis.LokalblickResponsibility.issues(shared.data),[]);
});
test('same person in two columns is stored once and linked to property and contract',()=>{
 const same=[...row];same[7]=same[5];same[8]=same[6];
 const result=run([same],{},profiles=>{profiles[0].columns[7].target='properties.responsiblePersonId';});
 assert.equal(result.data.people.length,1);assert.equal(result.data.assignments.length,2);
 assert.deepEqual(new Set(result.data.assignments.map(link=>link.targetType)),new Set(['property','contract']));
 assert.ok(result.data.assignments.every(link=>link.fromDate===''&&link.toDate===''));
});
test('a selected person role creates named people without reading ignored email',()=>{
 const configure=profiles=>{profiles[0].columns[6].target='@ignore';profiles[0].columns[8].target='@ignore';};
 const uncertain=run([row],{},configure);assert.equal(uncertain.data.people.length,2);assert.equal(uncertain.data.assignments.length,2);assert.equal(uncertain.data.contracts.length,1);
 const confirmed=run([row],{},configure);
 assert.equal(confirmed.data.people.length,2);assert.ok(confirmed.data.people.every(person=>!person.email));
 assert.ok(!JSON.stringify(confirmed).includes('anna@example.invalid'));
 const again=run([row],confirmed.data,configure);assert.equal(again.data.people.length,2);assert.equal(again.report.counts.fields,0);
});
test('ambiguous identities and missing homes stage the link without orphan people',()=>{
 const base={people:[{id:'a',name:'Anna Lind',email:'anna@example.invalid'},{id:'b',name:'Annan Anna',email:'anna@example.invalid'}]};
 const ambiguous=run([row],base);assert.equal(ambiguous.data.people.length,3);assert.equal(ambiguous.data.assignments.length,1);assert.ok(ambiguous.data.importReview.some(review=>review.reason?.includes('Flera personer')));
 const missing=run([row],{},profiles=>{profiles[0].columns[0].target='@ignore';});
 assert.equal(missing.data.people.length,0);assert.equal(missing.data.assignments.length,0);assert.equal(missing.data.contracts.length,0);
});
test('dated contact change closes the old link; undated and invalid changes preserve it',()=>{
 const first=run(),next=[...row];next[5]='Ny Kontakt';next[6]='ny@example.invalid';
 const undated=run([next],first.data);assert.equal(undated.data.people.length,2);assert.equal(undated.data.assignments.length,2);
 next[9]='2026-01-01';next[10]='2027-12-31';const changed=run([next],first.data);
 assert.equal(changed.data.people.length,3);assert.equal(changed.data.assignments.length,3);
 const history=globalThis.LokalblickResponsibility.history(changed.data,'contract',changed.data.contracts[0].id,'tenant');
 assert.equal(history.find(link=>link.personId===first.data.contracts[0].tenantResponsiblePersonId).toDate,'2025-12-31');
 assert.equal(history.find(link=>link.fromDate==='2026-01-01').toDate,'2027-12-31');
 assert.equal(run([next],changed.data).report.counts.fields,0);
 next[10]='2025-01-01';const invalid=run([next],first.data);assert.equal(invalid.data.people.length,2);assert.equal(invalid.data.assignments.length,2);
});
test('contact support columns need a selected name column in their own sheet',()=>{
 assert.throws(()=>run([row],{},profiles=>{profiles[0].columns[5].target='@ignore';}),/befintligt fält/);
 const profile={columns:[{index:0,target:'@ignore'},{index:1,target:'contact.0.email'}]};
 assert.equal(reviewProfiles([profile],schemas)[0].columns[1].target,'@unmapped');
});
test('saved person support choices follow their name column when Excel columns move',()=>{
 const first=run(),order=[7,8,0,1,2,3,4,5,6,9,10],workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([order.map(index=>headers[index]),order.map(index=>row[index])]),'Lokallista');
 const profiles=profileWorkbook(workbook,schemas,XLSX,first.data.importMappings,{reviewed:true});
 assert.equal(profiles[0].columns.find(column=>column.header==='E-post ansvarig').target,'contact.0.email');
 assert.equal(profiles[0].columns.find(column=>column.header==='E-post hyresgäst').target,'contact.7.email');
 const again=prepareMappedImport(workbook,profiles,first.data,{schemas,fileName:'test.xlsx',fingerprint:'test-contact-object',actor:'Test',strictColumns:true,personLinks:true},XLSX);
 assert.equal(again.data.people.length,2);assert.equal(again.data.assignments.length,2);assert.equal(again.report.counts.fields,0);
});
test('area is stored only on the object, dates stay blank and views derive agreement area',()=>{
 const result=run();assert.equal(result.data.objects[0].area,100);assert.equal(result.data.contracts[0].area,undefined);assert.equal(result.data.contracts[0].objectAreaManaged,true);
 assert.equal(result.data.objects[0].start||'','');assert.equal(result.data.objects[0].end||'','');
 const view=normalize(result.data);assert.equal(view.contracts[0].area,100);
 view.objects[0].area=150;assert.equal(normalize(view).contracts[0].area,150);
 assert.ok(!fieldCatalog(schemas,true).some(field=>field.target==='contracts.area'));
});
test('compatibility writes used by existing consumers still edit and clear area once on the object',()=>{
 const before=normalize(run().data),edited=structuredClone(before),model=globalThis.LokalblickObjectModel;
 edited.contracts[0].area=125;model.applyAreaChanges(before,edited);model.projectAreas(edited);assert.equal(edited.objects[0].area,125);assert.equal(edited.contracts[0].area,125);
 const cleared=structuredClone(edited);cleared.contracts[0].area='';model.applyAreaChanges(edited,cleared);model.projectAreas(cleared);model.stripAreas(cleared);assert.equal(cleared.objects[0].area,'');assert.equal(cleared.contracts[0].area,undefined);
 const conflicting=structuredClone(before);conflicting.contracts[0].area=125;conflicting.objects[0].area=150;assert.throws(()=>model.applyAreaChanges(before,conflicting),/Olika ytor/);
});
test('source agreement can anchor an unnumbered object; explicit object dates roundtrip without agreement dates',()=>{
 const result=run([row],{},profiles=>{profiles[0].columns[2].target='@ignore';});
 assert.equal(result.data.objects.length,1);assert.equal(result.data.objects[0].area,100);assert.ok(!result.data.objects[0].number);
 assert.equal(run([row],result.data,profiles=>{profiles[0].columns[2].target='@ignore';}).data.objects.length,1);
 const dated=normalize(result.data);dated.objects[0].start='2020-01-01';dated.objects[0].end='2030-12-31';dated.contracts[0].start='2025-01-01';
 const workbook=service.dataToWorkbook(dated),read=service.workbookToData(workbook);
 assert.equal(XLSX.utils.sheet_to_json(workbook.Sheets.Avtal)[0]['Area, m²'],'');
 assert.equal(read.objects[0].area,100);assert.equal(read.objects[0].start,'2020-01-01');assert.equal(read.objects[0].end,'2030-12-31');assert.equal(normalize(read).contracts[0].area,100);
});
test('legacy conflicting areas are preserved for review instead of silently overwriting the object',()=>{
 const first=run();first.data.contracts[0].area=125;delete first.data.contracts[0].objectAreaManaged;
 const result=run([row],first.data);assert.equal(result.data.objects[0].area,100);assert.equal(result.data.contracts[0].area,125);assert.ok(result.data.importReview.some(review=>review.kind==='object-area'));
});
test('reviewed import applies through the company backend, survives restart and keeps area canonical',async()=>{
 const {LokalblickRepository}=await import('../backend/company/data-repository.js'),fsp=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const directory=await fsp.mkdtemp(path.join(os.tmpdir(),'lokalblick-person-object-')),dataPath=path.join(directory,'workspace.json');
 const sourceAdapter={loadCore:async()=>({properties:[],contracts:[]}),loadCoordinates:async()=>[]};
 try{
  let repository=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();
  const result=run(),preview=await repository.previewImport(result);await repository.applyImport({previewId:preview.previewId});
  let stored=JSON.parse(await fsp.readFile(dataPath,'utf8'));
  assert.equal(stored.imported.contracts[0].area,undefined);assert.equal(stored.entities.objects[0].area,100);assert.equal(stored.entities.assignments.length,2);
  repository=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();let data=await repository.bootstrap();
  assert.equal(data.contracts[0].area,100);assert.equal(data.people.length,2);assert.equal(data.assignments.length,2);
  data.objects[0].area=150;await repository.saveWorkspace(data);data=await repository.bootstrap();assert.equal(data.contracts[0].area,150);
  stored=JSON.parse(await fsp.readFile(dataPath,'utf8'));assert.equal(stored.imported.contracts[0].area,undefined);assert.ok(stored.entities.contractOverlays.every(contract=>contract.area===undefined));
  const changedRow=[...row];changedRow[5]='Ny Kontakt';changedRow[6]='ny@example.invalid';changedRow[9]='2026-01-01';changedRow[10]='2027-12-31';changedRow[3]=150;
  const change=run([changedRow],data),next=await repository.previewImport(change);await repository.applyImport({previewId:next.previewId});
  repository=await new LokalblickRepository({sourceAdapter,dataPath}).initialize();data=await repository.bootstrap();
  assert.equal(data.people.length,3);assert.equal(data.assignments.length,3);assert.equal(data.assignments.find(link=>link.fromDate==='2026-01-01').toDate,'2027-12-31');
  assert.equal(data.assignments.find(link=>link.personId===result.data.contracts[0].tenantResponsiblePersonId).toDate,'2025-12-31');
  assert.deepEqual(globalThis.LokalblickResponsibility.issues(data),[]);
 }finally{await fsp.rm(directory,{recursive:true,force:true});}
});
