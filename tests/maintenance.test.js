import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import ExcelJS from 'exceljs';import XLSX from 'xlsx';
import {DatabaseSync} from 'node:sqlite';
import {LocalStore} from '../backend/lokaler/store.js';
import {emptyData,normalize,validateData,propertySummary} from '../frontend/lokaler/model.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {startInspection,addSpace,assessSpace,addPart,updatePoint,finishInspection,linkMaintenanceIssue,homeInspections} from '../frontend/lokaler/maintenance.js';
import {profileMaintenanceWorkbook,applyMaintenanceImport} from '../frontend/lokaler/maintenance-import.js';
import {writeWorkbook,readWorkbook} from '../frontend/lokaler/workbook.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {maintenancePage,maintenanceIssueContext} from '../frontend/v2/maintenance-ui.js';

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
const draftFixture=()=>{const data=viewFixture(),space=addSpace(data,{objectId:'O'},'Kök','2',['Tak','Golv','El']),inspection=startInspection(data,{objectId:'O'},'2026-10-20','P');return {data,space,inspection};};

test('maintenance reuses object-room-part structure and a new visit never copies old assessments',()=>{
 const {data,space,inspection}=draftFixture();
 assert.equal(data.spaces.length,1);assert.equal(data.buildingParts.length,3);
 assert(data.inspectionPoints.every(row=>row.assessment==='unchecked'));
 assert.throws(()=>finishInspection(data,inspection),/Kontrollera alla/);
 assert.throws(()=>startInspection(data,{objectId:'O'},'2026-10-21','P'),/redan/);
 for(const point of data.inspectionPoints)updatePoint(data,point.id,{assessment:'ok',comment:'Förra besiktningen'});
 finishInspection(data,inspection);const clean=collectWorkspace(data,fixture());
 const next=startInspection(data,{objectId:'O'},'2027-10-20','P');
 assert(data.inspectionPoints.filter(row=>row.inspectionId===next).every(row=>row.assessment==='unchecked'&&!row.comment));
 assert.equal(data.spaces[0].id,space);assert.equal(data.buildingParts.length,3);validateData(collectWorkspace(data,clean));
});
test('spaces distinguish floors and duplicate parts or spaces require a deliberate different label',()=>{
 const data=viewFixture();addSpace(data,{objectId:'O'},'Hall','1',['Tak','Tak','Golv']);addSpace(data,{objectId:'O'},'Hall','2',['Tak']);
 assert.equal(data.spaces.length,2);assert.equal(data.buildingParts.length,3);
 assert.throws(()=>addSpace(data,{objectId:'O'},'hall','1',[]),/finns redan/);
 assert.throws(()=>addPart(data,data.spaces[0].id,'Tak'),/finns redan/);
 const inspection=startInspection(data,{objectId:'O'},'2026-10-20','P');addPart(data,data.spaces[0].id,'El');
 assert.equal(data.inspectionPoints.filter(row=>row.inspectionId===inspection).length,4);
});
test('closed points stay immutable across the canonical boundary; issue links remain possible',()=>{
 const {data,inspection}=draftFixture();data.inspectionPoints.forEach((point,index)=>updatePoint(data,point.id,{assessment:index?'ok':'defect'}));finishInspection(data,inspection);
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
 const {data,inspection}=draftFixture();data.inspectionPoints.forEach((point,index)=>updatePoint(data,point.id,{assessment:index?'ok':'defect'}));const issueId=linkMaintenanceIssue(data,data.inspectionPoints[0].id);finishInspection(data,inspection);
 const next=startInspection(data,{objectId:'O'},'2027-10-20','P'),point=data.inspectionPoints.find(row=>row.inspectionId===next&&row.issueId);
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
  ['Besiktningspunkter',[['BesiktningspunktID','BesiktningsID','DelID','UtrymmesID','Bedömning'],['Q','I','D','','OK'],['Q2','I','','S','Brist']]]
 ])XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);
 const profiles=profileWorkbook(book,importSchemas,XLSX);for(const profile of profiles)for(const column of profile.columns)column.approved=true;
 const result=prepareCleanImport(book,profiles,fixture(),{},XLSX);assert.equal(result.report.blocking,0,JSON.stringify(result.clean.workspace.importReview));assert.equal(result.clean.inspection_points.length,2);assert.equal(result.clean.inspection_points[0].assessment,'ok');assert.equal(result.clean.inspection_points[1].space_id,'S');assert.equal(result.clean.inspection_points[1].part_id,null);
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
test('a property without objects can own assessed rooms and issues without a fabricated object',()=>{
 const data=viewFixture();data.objects=[];
 const home={propertyId:'F'},space=addSpace(data,home,'Entré','Bottenplan',[]),inspection=assessSpace(data,space,{assessment:'defect',comment:'Fuktfläck',photoReference:'C:\\Besiktningar\\entre.jpg'});Object.assign(data.inspections[0],{inspectedOn:'2026-10-21',inspectorId:'P'});
 const point=data.inspectionPoints[0];linkMaintenanceIssue(data,point.id);finishInspection(data,inspection);
 const clean=collectWorkspace(data,fixture());assert.equal(clean.objects.length,0);assert.equal(clean.spaces[0].property_id,'F');assert.equal(clean.spaces[0].object_id,null);assert.equal(clean.inspections[0].property_id,'F');assert.equal(clean.inspection_points[0].space_id,space);assert.equal(clean.inspection_points[0].part_id,null);assert.equal(clean.issues[0].property_id,'F');assert.equal(clean.issues[0].object_id,null);assert.equal(clean.issues[0].include_in_budget,'Nej');
 const html=maintenancePage(data,{propertyId:'F',open:[space]},false);assert.match(html,/Entré/);assert.doesNotMatch(html,/m²/);assert.match(html,/Fuktfläck/);assert.doesNotMatch(html,/Ny del/);
});
test('property and object inspections have separate scope, validation and pending visits',()=>{
 const data=viewFixture();
 addSpace(data,{propertyId:'F'},'Hall','1',['Tak']);addSpace(data,{objectId:'O'},'Hall','1',['Tak']);
 const propertyInspection=startInspection(data,{propertyId:'F'},'2026-10-21','P'),objectInspection=startInspection(data,{objectId:'O'},'2026-10-21','P');
 assert.equal(homeInspections(data,{propertyId:'F'}).length,1);assert.equal(homeInspections(data,{objectId:'O'}).length,1);
 assert(data.inspectionPoints.some(point=>point.inspectionId===propertyInspection));assert(data.inspectionPoints.some(point=>point.inspectionId===objectInspection));
 const clean=collectWorkspace(data,fixture()),broken=structuredClone(clean);broken.inspection_points[0].inspection_id=objectInspection;assert.throws(()=>validateData(broken),/samma objekt eller fastighet/);
 for(const table of ['spaces','inspections']){assert.throws(()=>normalize(table,{id:'x',name:'Hall'}),/antingen|finns inte/);assert.throws(()=>normalize(table,{id:'x',object_id:'O',property_id:'F',...(table==='spaces'?{name:'Hall'}:{})}),/antingen/);}
 assert.throws(()=>addSpace(data,{objectId:'O',propertyId:'F'},'Fel','',[]),/befintlig/);
});
test('room assessments share visits and immutable history with optional parts, without duplicating space data',()=>{
 const data=viewFixture(),space=addSpace(data,{objectId:'O'},'Toalett','',[]);
 const inspection=assessSpace(data,space,{assessment:'defect',comment:'Läckage',photoReference:'bild.jpg'}),point=data.inspectionPoints[0];
 Object.assign(data.inspections[0],{inspectorId:'P',inspectedOn:'2026-10-21'});
 assert.equal(assessSpace(data,space,{comment:'Läckage vid dörr'}),inspection);assert.equal(data.inspectionPoints.length,1);
 const part=addPart(data,space,'El');updatePoint(data,data.inspectionPoints.find(row=>row.partId===part).id,{assessment:'ok'});
 const issue=linkMaintenanceIssue(data,point.id);assert.equal(data.activities[0].title,'Toalett');finishInspection(data,inspection);
 const baseline=collectWorkspace(data,fixture());assert.equal(propertySummary(baseline,'F').area,100);
 const changed=structuredClone(baseline);changed.inspection_points[0].comment='Omskriven';assert.throws(()=>validateData(changed,baseline),/Avslutade/);
 assert.throws(()=>normalize('inspection_points',{id:'x',inspection_id:inspection,part_id:part,space_id:space}),/antingen/);
 assert.throws(()=>normalize('inspection_points',{id:'x',inspection_id:inspection}),/antingen/);
 const next=startInspection(data,{objectId:'O'},'2027-10-21','P'),nextPoints=data.inspectionPoints.filter(row=>row.inspectionId===next);
 assert.equal(nextPoints.length,2);assert(nextPoints.every(row=>row.assessment==='unchecked'&&!row.comment&&!row.photoReference));assert.equal(nextPoints.find(row=>row.spaceId===space).issueId,issue);
 assert.deepEqual(collectWorkspace(data,baseline).workspace.budgetPlans,baseline.workspace.budgetPlans);
});
for(const mode of ['sqlite','excel'])test('property-level room observations and photo references survive '+mode+' and Excel roundtrip',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'maintenance-property-')),file=path.join(dir,mode==='excel'?'local.xlsx':'local.sqlite');let store=await LocalStore.open({file,mode});
 try{
  await store.replace(fixture(),0);const data=projectWorkspace(store.snapshot().data),home={propertyId:'F'};const space=addSpace(data,home,'Gård','Utomhus',[]),inspection=assessSpace(data,space,{assessment:'defect',comment:'Ojämnt underlag',photoReference:'https://example.invalid/bild.jpg'});Object.assign(data.inspections[0],{inspectedOn:'2026-10-21',inspectorId:'P'});finishInspection(data,inspection);
  const clean=collectWorkspace(data,store.snapshot().data);await store.replace(clean,1);await store.close();store=await LocalStore.open({file,mode});assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot().data)),clean);
  assert.deepEqual(await readWorkbook(await writeWorkbook(clean,ExcelJS),ExcelJS),clean);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
test('current object-only SQLite maintenance tables gain property scope without losing IDs, history or Budget',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'maintenance-scope-')),file=path.join(dir,'current.sqlite');let store=await LocalStore.open({file});
 try{
  const {data,inspection}=draftFixture();data.inspectionPoints.forEach(point=>updatePoint(data,point.id,{assessment:'ok',comment:'Bevaras'}));finishInspection(data,inspection);await store.replace(collectWorkspace(data,fixture()),0);const before=JSON.parse(JSON.stringify(store.snapshot()));await store.close();
  const db=new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;
   CREATE TABLE spaces_original(id TEXT PRIMARY KEY NOT NULL,object_id TEXT NOT NULL REFERENCES objects(id),name TEXT NOT NULL,floor TEXT) STRICT;
   INSERT INTO spaces_original SELECT id,object_id,name,floor FROM spaces; DROP TABLE spaces; ALTER TABLE spaces_original RENAME TO spaces;
   CREATE TABLE inspections_original(id TEXT PRIMARY KEY NOT NULL,object_id TEXT NOT NULL REFERENCES objects(id),inspected_on TEXT,inspector_id TEXT REFERENCES people(id),status TEXT NOT NULL DEFAULT 'draft',notes TEXT,sources TEXT) STRICT;
   INSERT INTO inspections_original SELECT id,object_id,inspected_on,inspector_id,status,notes,sources FROM inspections; DROP TABLE inspections; ALTER TABLE inspections_original RENAME TO inspections;
   CREATE TABLE inspection_points_original(id TEXT PRIMARY KEY NOT NULL,inspection_id TEXT NOT NULL REFERENCES inspections(id),part_id TEXT NOT NULL REFERENCES building_parts(id),assessment TEXT NOT NULL DEFAULT 'unchecked',comment TEXT,last_action TEXT,photo_reference TEXT,issue_id TEXT REFERENCES issues(id),source_plans TEXT,sources TEXT,UNIQUE(inspection_id,part_id)) STRICT;
   INSERT INTO inspection_points_original SELECT id,inspection_id,part_id,assessment,comment,last_action,photo_reference,issue_id,source_plans,sources FROM inspection_points; DROP TABLE inspection_points; ALTER TABLE inspection_points_original RENAME TO inspection_points;
   COMMIT;`);db.close();
  store=await LocalStore.open({file});assert.deepEqual(JSON.parse(JSON.stringify(store.snapshot())),before);assert.equal(store.db.prepare('PRAGMA foreign_key_check').all().length,0);
  const next=projectWorkspace(store.snapshot().data);const room=addSpace(next,{propertyId:'F'},'Gård','',[]);assessSpace(next,room,{assessment:'ok',comment:'Ny rumsbedömning'});await store.replace(collectWorkspace(next,store.snapshot().data),before.version);assert.equal(store.snapshot().data.spaces.filter(row=>row.property_id==='F').length,1);assert.deepEqual(store.snapshot().data.workspace.budgetPlans,before.data.workspace.budgetPlans);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('a noted defect automatically opens one maintenance case with linked source evidence and inherited responsibility',()=>{
 const {data}=draftFixture(),point=data.inspectionPoints[0];
 updatePoint(data,point.id,{assessment:'defect',comment:'Spricka <kontrollera>',photoReference:'lokal-bild.jpg'});
 assert.equal(data.activities.length,1);const issue=data.activities[0];
 assert.equal(point.issueId,issue.id);assert.equal(issue.type,'Underhåll');assert.equal(issue.objectId,'O');assert.equal(issue.scopeType,'object');assert.equal(issue.includeInBudget,'Nej');assert.equal(issue.description,'');assert.equal(issue.responsiblePersonId,undefined);
 updatePoint(data,point.id,{comment:'Förtydligad observation'});updatePoint(data,point.id,{assessment:'defect'});assert.equal(data.activities.length,1);
 assert.equal(maintenanceIssueContext(data,undefined),'');assert.equal(maintenanceIssueContext(data,''),'');const html=maintenanceIssueContext(data,issue.id);assert.match(html,/Förtydligad observation/);assert.match(html,/Öppna besiktning/);assert.match(html,/Kök/);assert.match(html,/data-space-id/);
 const clean=collectWorkspace(data,fixture());assert.equal(clean.inspection_points[0].comment,'Förtydligad observation');assert.equal(clean.issues[0].description,null);
 updatePoint(data,point.id,{assessment:'ok'});assert.equal(data.activities[0].status,'Nytt');assert.equal(point.issueId,issue.id);
});
test('a new visit reuses an open action, but a new defect after closure starts a new case without changing history',()=>{
 const {data,inspection}=draftFixture(),point=data.inspectionPoints[0];
 data.inspectionPoints.forEach((row,index)=>updatePoint(data,row.id,{assessment:index?'ok':'defect'}));
 const firstIssue=point.issueId;finishInspection(data,inspection);
 const second=startInspection(data,{objectId:'O'},'2027-01-10','P'),secondPoint=data.inspectionPoints.find(row=>row.inspectionId===second&&row.partId===point.partId);
 updatePoint(data,secondPoint.id,{assessment:'defect'});assert.equal(secondPoint.issueId,firstIssue);assert.equal(data.activities.length,1);
 for(const row of data.inspectionPoints.filter(row=>row.inspectionId===second&&row.id!==secondPoint.id))updatePoint(data,row.id,{assessment:'ok'});finishInspection(data,second);
 data.activities[0].status='Klar';const baseline=collectWorkspace(data,fixture());
 const third=startInspection(data,{objectId:'O'},'2028-01-10','P'),thirdPoint=data.inspectionPoints.find(row=>row.inspectionId===third&&row.partId===point.partId);
 assert(!thirdPoint.issueId);updatePoint(data,thirdPoint.id,{assessment:'defect'});assert.notEqual(thirdPoint.issueId,firstIssue);assert.equal(data.activities.length,2);assert.equal(point.issueId,firstIssue);assert.equal(secondPoint.issueId,firstIssue);
 collectWorkspace(data,baseline);
});
test('reimported inspection defects share an open case and keep comments solely on the original observations',async()=>{
 const data=viewFixture(),{profiles}=await profileMaintenanceWorkbook(matrixBook(),XLSX,'test.xlsx');applyMaintenanceImport(data,profiles,{Testobjekt:'O'});
 const defect=data.inspectionPoints.find(row=>row.assessment==='defect'),issue=defect.issueId;assert(issue);assert.equal(data.activities.length,2);assert.equal(data.activities[0].type,'Underhåll');
 applyMaintenanceImport(data,profiles,{Testobjekt:'O'});assert.equal(data.activities.length,2);
 const changed=structuredClone(profiles);changed[0].blocks[0].fingerprint+='-second';changed[0].blocks[0].date='2027-10-20';applyMaintenanceImport(data,changed,{Testobjekt:'O'});
 assert.equal(data.activities.length,2);assert.equal(data.inspectionPoints.filter(row=>row.issueId===issue).length,2);assert.equal(data.activities[0].description,'');collectWorkspace(data,fixture());
});
