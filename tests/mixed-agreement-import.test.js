import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook,mappingConflicts} from '../frontend/services/import-engine.js';
import {resolveFieldName,setPrimaryTable,setMappingRow,mappingTemplate} from '../frontend/services/import-matching.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {readWorkbook,writeWorkbook} from '../backend/lokaler/workbook.js';

const headers=['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Area','Avtalsnummer','Hyresgäst','From','Tom','Grundhyra','Hyra basår','Hyra bastal KPI','Hyra indexandel, %','Hyra justeringsregel','Värme','Värme basår','Värme bastal KPI','Värme indexandel','Värme uppräkningsmetod','Värme startdatum','VA','VA uppräkningsmetod','VA slutdatum'];
const values=['F1','TESTET 1','Testgatan 1','O1',100,'A1','Fiktiv hyresgäst','2027-01-01','2029-12-31',100000,2025,400,100,'KPI',12000,2026,420,50,'KPI','2027-04-01',5000,'Ingen','2027-06-30'];
function source(h=headers,row=values,name='Hyresavtal 2027'){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([h,row]),name);return workbook;}
const profiles=(book,saved=[],schemas=importSchemas)=>profileWorkbook(book,schemas,XLSX,saved,{reviewed:true});
const run=(book,ps=profiles(book),base=emptyData())=>prepareCleanImport(book,ps,base,{fileName:'syntetiska-avtal.xlsx'},XLSX);
const column=(profile,header)=>profile.columns.find(c=>c.header===header);

test('one agreement sheet distributes property, object, terms, tenant and separately indexed items without manual table changes',()=>{
 const book=source(),p=profiles(book)[0];assert.equal(p.primaryTable,'contracts');assert.equal(mappingConflicts([p]).length,0);assert(p.columns.every(c=>!c.target.startsWith('@')));
 assert.equal(column(p,'Area').target,'objects.area');assert.equal(column(p,'From').target,'contracts.start');assert.equal(column(p,'Grundhyra').itemType,'base');
 for(const [header,field] of [['Värme basår','baseYear'],['Värme bastal KPI','baseIndex'],['Värme indexandel','indexPercent'],['Värme uppräkningsmetod','adjustmentMethod'],['Värme startdatum','start']]){assert.equal(column(p,header).target,'agreementItems.'+field);assert.equal(column(p,header).itemType,'heat');}
 const result=run(book,[p]);assert.equal(result.report.blocking,0);assert.equal(result.report.review,0);assert.equal(result.clean.properties.length,1);assert.equal(result.clean.objects[0].area,100);assert.equal(result.clean.agreements[0].valid_from,'2027-01-01');assert.equal(result.clean.parties[0].name,'Fiktiv hyresgäst');
 assert.equal(result.clean.agreements[0].tenant_party_id,result.clean.parties[0].id);assert.equal(result.clean.agreements[0].base_amount,undefined);assert.equal(result.clean.recurring_costs.length,0);
 const items=Object.fromEntries(result.clean.agreement_items.map(item=>[item.type,item]));assert.equal(Object.keys(items).length,3);assert.equal(items.base.base_amount,100000);assert.equal(items.base.base_year,2025);assert.equal(items.base.base_index,400);assert.equal(items.base.index_share,1);
 assert.equal(items.heat.base_amount,12000);assert.equal(items.heat.base_year,2026);assert.equal(items.heat.base_index,420);assert.equal(items.heat.index_share,.5);assert.equal(items.heat.valid_from,'2027-04-01');assert.equal(items.heat.adjustment_method,'kpi');assert.equal(items.water.valid_to,'2027-06-30');assert.equal(items.water.adjustment_method,'none');assert.equal(items.water.base_year,null);validateData(result.clean);
 const again=run(book,profiles(book,result.clean.workspace.importMappings),result.clean);assert.equal(again.report.review,0);assert.equal(again.clean.agreement_items.length,3);assert.equal(again.clean.objects.length,1);
});
test('a property-led mixed sheet still recognizes named item conditions when an agreement identifier is selected',()=>{
 const book=source(),p=profiles(book)[0];setPrimaryTable(book,p,'properties',importSchemas,XLSX);
 assert.equal(column(p,'Värme basår').target,'agreementItems.baseYear');assert.equal(column(p,'Värme basår').itemType,'heat');assert.equal(column(p,'Hyra basår').itemType,'base');assert.equal(run(book,[p]).report.blocking,0);
});
test('item condition headings follow current model field names and categories, including suffix notation',()=>{
 for(const caption of ['Värme basår','Basår Värme','Avtalsposter.Värme basår'])assert.deepEqual([resolveFieldName(caption,importSchemas,'contracts').target,resolveFieldName(caption,importSchemas,'contracts').itemType],['agreementItems.baseYear','heat']);
 const schemas=structuredClone(importSchemas),items=schemas.find(s=>s.key==='agreementItems');items.itemTypes['Ånga']='steam';assert.equal(resolveFieldName('Ånga basår',schemas,'contracts').itemType,'steam');
 items.columns=items.columns.filter(([field])=>field!=='baseYear');assert.equal(resolveFieldName('Ånga basår',schemas,'contracts'),null);assert.equal(resolveFieldName('Värme basår',schemas,'contracts'),null);
 assert.equal(resolveFieldName('Värme basår',importSchemas,'recurringCosts'),null);assert.equal(resolveFieldName('Fastighetskostnad.Värme basår',importSchemas,'contracts'),null);
});
test('unqualified conditions attach to one item and never silently affect multiple additions',()=>{
 const single=source(['FastighetsID','Avtalsnummer','Värme','Basår'],['F1','A1',12000,2026]),p=profiles(single)[0];assert.equal(column(p,'Basår').itemType,'heat');assert.equal(run(single,[p]).clean.agreement_items[0].base_year,2026);
 const mixed=source(['FastighetsID','Avtalsnummer','Värme','VA','Basår'],['F1','A1',12000,5000,2026]),q=profiles(mixed)[0];assert.equal(column(q,'Basår').target,'@unmapped');assert.match(column(q,'Basår').warning,/vilken post/);assert.equal(q.columns.filter(c=>c.itemType==='heat'&&c.target==='agreementItems.baseAmount').length,1);
});
test('saved choices and explicit mapping rows stay authoritative over category-based proposals',()=>{
 const book=source(),first=run(book),saved=structuredClone(first.clean.workspace.importMappings);const chosen=saved[0].columns.find(c=>c.header==='Värme basår');chosen.itemType='base';
 const p=profiles(book,saved)[0];assert.equal(column(p,'Värme basår').itemType,'base');assert.equal(column(p,'Värme basår').matchSource,'saved');
 const explicit=source(['FastighetsID','Avtalsnummer','Värme basår'],['Fastighet.FastighetsID','Avtal.AvtalsID','Avtalsposter.Basår [VA]']);XLSX.utils.sheet_add_aoa(explicit.Sheets[explicit.SheetNames[0]],[['F1','A1',2026]],{origin:'A3'});const q=profiles(explicit)[0];setMappingRow(explicit,q,true,importSchemas,XLSX);assert.equal(column(q,'Värme basår').itemType,'water');setPrimaryTable(explicit,q,'contracts',importSchemas,XLSX);assert.equal(column(q,'Värme basår').itemType,'water');
});
test('the mapping template preserves destinations and separate item categories through actual Excel roundtrip',async()=>{
 const book=source(),p=profiles(book)[0],first=run(book,[p]);first.clean.workspace.budgetPlans=[{id:'locked',locked:true,year:2027,snapshot:{amount:12345}}];
 const restored=await readWorkbook(await writeWorkbook(first.clean));assert.deepEqual(restored,JSON.parse(JSON.stringify(first.clean)));
 const template=mappingTemplate(book,[p],importSchemas,XLSX);XLSX.utils.sheet_add_aoa(template.Sheets[template.SheetNames[0]],[values],{origin:'A3'});const q=profiles(template)[0];setMappingRow(template,q,true,importSchemas,XLSX);assert.equal(q.rowCount,1);const again=run(template,[q],restored);assert.equal(again.report.blocking,0);assert.equal(again.clean.agreement_items.length,3);assert.equal(again.report.review,0);assert.deepEqual(again.clean.workspace.budgetPlans,first.clean.workspace.budgetPlans);
});
test('a compact overview explains actual destinations, categories and the per-column choice',()=>{
 const book=source(),ps=profiles(book),result=run(book,ps),html=columnPreviewHtml({fileName:'syntetiska-avtal.xlsx'},{profiles:ps},result,importSchemas);
 assert.match(html,/Ändra förslagen i kolumnrubrikerna/);assert.match(html,/Utgångspunkt för förslag/);assert.doesNotMatch(html,/<label>Huvudtabell/);for(const collection of ['properties','objects','contracts','agreementItems'])assert.match(html,new RegExp('data-register="'+collection+'"'));
 assert.match(html,/Avtalsposter → Grundbelopp, kr\/år · Värme/);assert.equal((html.match(/data-preview-map=/g)||[]).length,ps[0].columns.length);assert.doesNotMatch(html,/data-import-destination-fields|data-column-group/);
});
