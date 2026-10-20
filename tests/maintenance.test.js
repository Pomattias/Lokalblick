import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import ExcelJS from 'exceljs';import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {startInspection,addSpace,addPart,updatePoint,finishInspection,linkMaintenanceIssue} from '../frontend/lokaler/maintenance.js';
import {profileMaintenanceWorkbook,applyMaintenanceImport} from '../frontend/lokaler/maintenance-import.js';
import {writeWorkbook,readWorkbook} from '../frontend/lokaler/workbook.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {maintenancePage} from '../frontend/v2/maintenance-ui.js';

const fixture=()=>{
 const data=emptyData();
 data.properties.push(normalize('properties',{id:'F',name:'Testfastighet',address:'Testgatan 1'}));
 data.objects.push(normalize('objects',{id:'O',property_id:'F',area:100}),normalize('objects',{id:'O2',property_id:'F'}));
 data.people.push(normalize('people',{id:'P',name:'Testare'}));
 data.workspace.budgetPlans=[{year:2027,status:'Låst',versions:[{number:1}],lines:[{amount:12000}]}];
 return data;
};
function matrixBook(){
 const book=XLSX.utils.book_new();
 const rows=[['Datum utförande','Utförare'],['2026-10-20','Testare'],[],['','Nyskick','Bra skick - med anmärkningar','Dåligt skick - behöver åtgärdas','Kommentar','Senast åtgärdad (år)',2027,2028],['Våning 2'],['Kök'],['Tak','X','','','','Vet ej',10000,2000],['Golv','','','X','Sliten yta',2020],['El'],['Hall'],['Tak','','X','','Kontrollera'],['Golv','X'],[],['En fristående notering.'],['Sammanfattning skick','Nyskick','Bra','Dåligt'],['Samlad bedömning','X']];
 const sheet=XLSX.utils.aoa_to_sheet(rows);sheet.G3={t:'n',f:'SUM(G7:G12)',v:10000};sheet.T8={t:'s',v:'Sammanfattande anteckning'};sheet['!ref']='A1:T16';
 XLSX.utils.book_append_sheet(book,sheet,'Testobjekt');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Sammanställning'],['Total',12000]]),'Sammanställning');return book;
}
const viewFixture=()=>projectWorkspace(fixture());
const draftFixture=()=>{const data=viewFixture(),space=addSpace(data,'O','Kök','2',['Tak','Golv','El']),inspection=startInspection(data,'O','2026-10-20','P');return {data,space,inspection};};

test('maintenance reuses object-room-part structure and a new visit never copies old assessments',()=>{
 const {data,space,inspection}=draftFixture();
 assert.equal(data.spaces.length,1);assert.equal(data.buildingParts.length,3);
 assert(data.inspectionPoints.every(row=>row.assessment==='unchecked'));
 assert.throws(()=>finishInspection(data,inspection),/Kontrollera alla/);
 assert.throws(()=>startInspection(data,'O','2026-10-21','P'),/redan/);
 for(const point of data.inspectionPoints)updatePoint(data,point.id,{assessment:'ok',comment:'Förra besiktningen'});
 finishInspection(data,inspection);const clean=collectWorkspace(data,fixture());
 const next=startInspection(data,'O','2027-10-20','P');
 assert(data.inspectionPoints.filter(row=>row.inspectionId===next).every(row=>row.assessment==='unchecked'&&!row.comment));
 assert.equal(data.spaces[0].id,space);assert.equal(data.buildingParts.length,3);validateData(collectWorkspace(data,clean));
});
test('spaces distinguish floors and duplicate parts or spaces require a deliberate different label',()=>{
 const data=viewFixture();addSpace(data,'O','Hall','1',['Tak','Tak','Golv']);addSpace(data,'O','Hall','2',['Tak']);
 assert.equal(data.spaces.length,2);assert.equal(data.buildingParts.length,3);
 assert.throws(()=>addSpace(data,'O','hall','1',[]),/finns redan/);
 assert.throws(()=>addPart(data,data.spaces[0].id,'Tak'),/finns redan/);
 const inspection=startInspection(data,'O','2026-10-20','P');addPart(data,data.spaces[0].id,'El');
 assert.equal(data.inspectionPoints.filter(row=>row.inspectionId===inspection).length,4);
});
test('closed points stay immutable across the canonical boundary; issue links remain possible',()=>{
 const {data,inspection}=draftFixture();data.inspectionPoints.forEach(point=>updatePoint(data,point.id,{assessment:'defect'}));finishInspection(data,inspection);
 const baseline=collectWorkspace(data,fixture()),changed=structuredClone(baseline);changed.inspection_points[0].comment='Efterhandsändring';
 assert.throws(()=>validateData(changed,baseline),/Avslutade besiktningspunkter/);
 assert.throws(()=>updatePoint(data,data.inspectionPoints[0].id,{comment:'Fel'}),/ny besiktning/);
 const issue=linkMaintenanceIssue(data,data.inspectionPoints[0].id);assert.equal(linkMaintenanceIssue(data,data.inspectionPoints[0].id),issue);assert.equal(data.activities.length,1);
 const saved=collectWorkspace(data,baseline);assert.equal(saved.issues[0].object_id,'O');assert.equal(saved.issues[0].include_in_budget,'Nej');assert.deepEqual(saved.workspace.budgetPlans,baseline.workspace.budgetPlans);
 assert.equal(saved.inspection_points[0].issue_id,saved.issues[0].id);
});
test('issue linkage supports an existing issue and inherits its current data, never a copied second issue',()=>{
 const {data}=draftFixture(),point=data.inspectionPoints[0];
 data.activities.push({id:'existing',objectId:'O',title:'Redan planerad åtgärd',status:'Pågår',estimatedCost:5000});
 assert.equal(linkMaintenanceIssue(data,point.id,'existing'),'existing');assert.equal(data.activities.length,1);
 const clean=collectWorkspace(data,fixture());assert.equal(clean.inspection_points[0].issue_id,'existing');
 assert.equal(clean.inspection_points[0].estimated_cost,undefined);
 const nextPoint=data.inspectionPoints[1];data.activities.push({id:'elsewhere',objectId:'O2',title:'Fel objekt',status:'Nytt'});
 assert.throws(()=>linkMaintenanceIssue(data,nextPoint.id,'elsewhere'),/samma objekt/);
 const broken=structuredClone(clean);broken.issues[0].object_id='O2';assert.throws(()=>validateData(broken),/samma objekt/);
});
test('unfinished links to an existing issue survive the next visit without copying its observation',()=>{
 const {data,inspection}=draftFixture();data.inspectionPoints.forEach(point=>updatePoint(data,point.id,{assessment:'defect'}));const issueId=linkMaintenanceIssue(data,data.inspectionPoints[0].id);finishInspection(data,inspection);
 const next=startInspection(data,'O','2027-10-20','P'),point=data.inspectionPoints.find(row=>row.inspectionId===next&&row.issueId);
 assert.equal(point.issueId,issueId);assert.equal(point.assessment,'unchecked');assert.equal(data.activities.length,1);
});
test('matrix extraction recognizes room headers, unmarked parts, comments and annual plans but not derived summaries',async()=>{
 const {profiles,ignored}=await profileMaintenanceWorkbook(matrixBook(),XLSX,'test.xlsx'),profile=profiles[0],block=profile.blocks[0];
 assert.equal(profiles.length,1);assert.equal(ignored.length,1);assert.equal(block.date,'2026-10-20');assert.equal(block.inspector,'Testare');
 assert.deepEqual(block.spaces.map(row=>row.name),['Kök','Hall']);assert.equal(block.spaces[0].floor,'Våning 2');
 const points=block.spaces.flatMap(row=>row.points);assert.equal(points.length,5);
 assert.equal(points[0].assessment,'ok');assert.equal(points[1].assessment,'defect');assert.equal(points[2].assessment,'unchecked');
 assert.equal(points[0].lastAction,'Vet ej');assert.deepEqual(points[0].sourcePlans,[{year:2027,amount:10000},{year:2028,amount:2000}]);
 assert(block.notes.some(note=>note.includes('fristående')));assert(block.source.extra.some(row=>row.value==='Sammanfattande anteckning'));
 assert(!points.some(row=>/Samlad|Sammanfattning/.test(row.name)));
});
test('side-by-side matrices share one protocol; repeated rooms and interval X stay separate from money',async()=>{
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['Datum utförande','Utförare'],['2026-10-20','Testare'],[],['','Nyskick','Bra skick','Dåligt skick','Kommentar','Senast åtgärdad (år)','Inom 1 år','2–5 år','5-10 år','10+ år'],['Våning 1'],['Hall'],['Tak','','X','','','','','X'],['Hall'],['Tak','X']]);
 const right=XLSX.utils.aoa_to_sheet([['','Nyskick','Bra skick','Dåligt skick','Kommentar','Senast åtgärdad (år)','Inom 1 år','2–5 år','5-10 år','10+ år'],['Våning 2'],['Hall'],['Golv','','','X','','','','','X']]);
 for(const [at,cell]of Object.entries(right)){if(at.startsWith('!'))continue;const pos=XLSX.utils.decode_cell(at);sheet[XLSX.utils.encode_cell({r:pos.r+3,c:pos.c+12})]=cell;}sheet['!ref']='A1:V10';
 XLSX.utils.book_append_sheet(book,sheet,'O');const {profiles}=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx');assert.equal(profiles[0].blocks.length,1);
 const block=profiles[0].blocks[0];assert.equal(block.spaces.length,3);assert.equal(block.spaces[1].name,'Hall (2)');
 assert.deepEqual(block.spaces[0].points[0].sourcePlans,[{interval:'2–5 år'}]);assert.deepEqual(block.spaces[2].points[0].sourcePlans,[{interval:'5-10 år'}]);
 assert.equal(block.source.headers.length,2);
});
test('ambiguous/missing dates, duplicate condition marks and malformed amounts are preserved for explicit review',async()=>{
 const book=matrixBook(),sheet=book.Sheets.Testobjekt;sheet.A2={t:'s',v:'?'};sheet.B7={t:'s',v:'X'};sheet.D7={t:'s',v:'X'};sheet.G7={t:'s',v:'okänt belopp'};
 const {profiles}=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx'),block=profiles[0].blocks[0];assert.equal(block.date,null);assert.equal(block.spaces[0].points[0].assessment,'unchecked');
 assert(block.warnings.some(w=>/flera skickmarkeringar/.test(w)));assert(block.source.extra.some(row=>row.value==='okänt belopp'));
});
test('appliance names do not cause laundry or dishwashing rooms to be mistaken for parts',async()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['','Nyskick','Bra skick','Dåligt skick','Kommentar','Senast åtgärdad (år)',2027],['Tvättstuga'],['Väggar','X'],['Tvättmaskin','X'],['Diskrum'],['Väggar','X'],['Diskmaskin','X']
 ]),'O');const {profiles}=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx');assert.deepEqual(profiles[0].blocks[0].spaces.map(row=>row.name),['Tvättstuga','Diskrum']);
});
test('room-level condition and total amounts remain source annotations, not duplicate parts or costs',async()=>{
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
  ['','Nyskick','Bra skick','Dåligt skick','Kommentar','Senast åtgärdad (år)',2027],['Hall','X','','','Övergripande',2019,10000],['Väggar','X','','','','',10000],['Tak','X']
 ]),'O');const {profiles}=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx'),block=profiles[0].blocks[0];assert.deepEqual(block.spaces[0].points.map(row=>row.name),['Väggar','Tak']);assert(block.source.extra.some(row=>row.cell==='E2'&&row.value==='Övergripande'));assert(block.source.extra.some(row=>row.cell==='G2'&&row.value===10000));
});
test('reimport has stable identities even under another filename; changed source retains previous observations',async()=>{
 const data=viewFixture(),book=matrixBook(),first=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx');
 assert.deepEqual(applyMaintenanceImport(data,first.profiles,{Testobjekt:'O'}),{imported:1,unchanged:0,points:5});
 const clean=collectWorkspace(data,fixture()),again=await profileMaintenanceWorkbook(book,XLSX,'nytt-filnamn.xlsx');
 assert.deepEqual(applyMaintenanceImport(data,again.profiles,{Testobjekt:'O'}),{imported:0,unchanged:1,points:0});
 assert.equal(data.people.length,1);book.Sheets.Testobjekt.E8={t:'s',v:'Ny observation'};
 const changed=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx');applyMaintenanceImport(data,changed.profiles,{Testobjekt:'O'});
 assert.equal(data.inspections.length,2);assert.equal(data.spaces.length,2);assert.equal(data.buildingParts.length,5);assert.equal(data.inspectionPoints.length,10);
 const saved=collectWorkspace(data,clean);assert.deepEqual(saved.workspace.budgetPlans,clean.workspace.budgetPlans);assert.equal(saved.recurring_costs.length,0);assert.equal(saved.agreement_items.length,0);
});
test('unknown object IDs are not fabricated from sheet names and excluded sheets create no records',async()=>{
 const {profiles}=await profileMaintenanceWorkbook(matrixBook(),XLSX,'test.xlsx'),data=viewFixture();
 assert.throws(()=>applyMaintenanceImport(data,profiles,{}),/Välj minst/);assert.equal(data.inspections.length,0);
 assert.throws(()=>applyMaintenanceImport(data,profiles,{Testobjekt:'Missing'}),/befintligt ObjektID/);assert.equal(data.objects.length,2);
});
test('Excel dates respect the 1904 epoch and conflicting inspection dates never silently merge',async()=>{
 const book=matrixBook();book.Workbook={WBProps:{date1904:true}};book.Sheets.Testobjekt.A2={t:'n',v:44000,z:'yyyy-mm-dd'};
 const first=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx');assert.equal(first.profiles[0].blocks[0].date,'2024-06-19');
 // A second complete matrix with its own explicit dated header is a new visit.
 const extra=XLSX.utils.aoa_to_sheet([['Datum utförande','Utförare'],['2026-10-21','Testare'],[],['','Nyskick','Bra skick','Dåligt skick','Kommentar','Senast åtgärdad (år)',2027],['Hall'],['Golv','X']]);
 for(const [at,cell]of Object.entries(extra)){if(at.startsWith('!'))continue;const pos=XLSX.utils.decode_cell(at);book.Sheets.Testobjekt[XLSX.utils.encode_cell({r:pos.r+20,c:pos.c})]=cell;}book.Sheets.Testobjekt['!ref']='A1:T26';
 const second=await profileMaintenanceWorkbook(book,XLSX,'test.xlsx');assert.equal(second.profiles[0].blocks.length,2);assert(second.profiles[0].warnings.some(w=>/Olika datum/.test(w)));
});
test('Excel roundtrip preserves dates, source plans, original condition, issues, responsibility and locked Budget verbatim',async()=>{
 const data=viewFixture(),{profiles}=await profileMaintenanceWorkbook(matrixBook(),XLSX,'test.xlsx');applyMaintenanceImport(data,profiles,{Testobjekt:'O'});data.objects[0].maintenanceResponsibility='owner';data.buildingParts[0].responsibility='tenant';linkMaintenanceIssue(data,data.inspectionPoints[1].id);
 const clean=collectWorkspace(data,fixture()),bytes=await writeWorkbook(clean,ExcelJS),restored=await readWorkbook(bytes,ExcelJS);
 assert.deepEqual(restored,clean);assert.equal(restored.inspection_points[0].source_plans.length,2);assert.equal(restored.building_parts[0].responsibility,'tenant');
});
test('current Excel workbooks can acquire the empty maintenance registers, but partial registers are rejected',async()=>{
 const data=fixture(),bytes=await writeWorkbook(data,ExcelJS),book=new ExcelJS.Workbook();await book.xlsx.load(bytes);
 for(const name of ['Utrymmen','Delar','Besiktningar','Besiktningspunkter'])book.removeWorksheet(name);
 const restored=await readWorkbook(await book.xlsx.writeBuffer(),ExcelJS);assert.deepEqual(restored,data);
 book.addWorksheet('Utrymmen');await assert.rejects(readWorkbook(await book.xlsx.writeBuffer(),ExcelJS),/Kolumnerna|saknas/);
});
test('normal tabular Excel import uses the same canonical maintenance fields and relations',()=>{
 const book=XLSX.utils.book_new();for(const [name,rows]of [
  ['Utrymmen',[['UtrymmesID','ObjektID','Utrymme'],['S','O','Kök']]],
  ['Delar',[['DelID','UtrymmesID','Del'],['D','S','Tak']]],
  ['Besiktningar',[['BesiktningsID','ObjektID','Besiktningsdatum','Protokollstatus'],['I','O','2026-10-20','Pågående']]],
  ['Besiktningspunkter',[['BesiktningspunktID','BesiktningsID','DelID','Bedömning'],['Q','I','D','OK']]]
 ])XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
 const profiles=profileWorkbook(book,importSchemas,XLSX);for(const profile of profiles)for(const column of profile.columns)column.approved=true;
 const result=prepareCleanImport(book,profiles,fixture(),{},XLSX);assert.equal(result.report.blocking,0,JSON.stringify(result.clean.workspace.importReview));assert.equal(result.clean.inspection_points.length,1);assert.equal(result.clean.inspection_points[0].assessment,'ok');
});
for(const mode of ['sqlite','excel'])test('maintenance storage: atomic graph, read-only history and reopen in '+mode,async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'maintenance-')),file=path.join(dir,mode==='excel'?'local.xlsx':'local.sqlite');let store=await LocalStore.open({file,mode});
 try{
  await store.replace(fixture(),0);const data=projectWorkspace(store.snapshot().data),{profiles}=await profileMaintenanceWorkbook(matrixBook(),XLSX,'test.xlsx');applyMaintenanceImport(data,profiles,{Testobjekt:'O'});
  const clean=collectWorkspace(data,store.snapshot().data);await store.replace(clean,1);
  const point=clean.inspection_points[0];await assert.rejects(store.mutate([{table:'inspection_points',record:{...point,assessment:'defect'}}],2),/Avslutade/);assert.equal(store.snapshot().version,2);
  await store.close();store=await LocalStore.open({file,mode});assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot().data)),clean);
  const broken=structuredClone(clean);broken.inspection_points[0].part_id='Missing';await assert.rejects(store.replace(broken,store.snapshot().version),/saknas/);assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot().data)),clean);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
test('compact maintenance view keeps history optional and renders source text safely',()=>{
 const {data,space}=draftFixture();data.spaces[0].name='<script>bad</script>';
 const html=maintenancePage(data,{objectId:'O',open:[space]},true);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Ej kontrollerad/);assert.match(html,/<details class="maintenance-history"><summary>/);assert.doesNotMatch(html,/maintenance-history" open/);
});
test('an archived protocol only displays parts present at that visit',()=>{
 const {data,space,inspection}=draftFixture();data.inspectionPoints.forEach(point=>updatePoint(data,point.id,{assessment:'ok'}));finishInspection(data,inspection);addPart(data,space,'Ny del efter besiktningen');
 const html=maintenancePage(data,{objectId:'O',inspectionId:inspection,open:[space]},false);assert.doesNotMatch(html,/Ny del efter besiktningen/);assert.match(html,/Tak/);
});
