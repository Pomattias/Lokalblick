import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';import ExcelJS from 'exceljs';import XLSX from 'xlsx';
import {tables,emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {normalizeWorkspace} from '../frontend/lokaler/workspace-data.js';
import {legacyFinanceMap,legacyFinanceFields} from '../frontend/lokaler/finance-model.js';
import {projectWorkspace,collectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {writeWorkbook,readWorkbook} from '../frontend/lokaler/workbook.js';
import {prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {LocalStore} from '../backend/lokaler/store.js';
import {agreementItemsPanel,propertyCostsPanel} from '../frontend/v2/finance-ui.js';
const C=globalThis.LokalblickCalculations,R=globalThis.LokalblickRecurringCosts;
const close=(a,b)=>assert(Math.abs(a-b)<.000001,`${a} != ${b}`);
const fixture=()=>normalizeWorkspace({...emptyData(),properties:[{id:'F',name:'Testfastighet'}],objects:[{id:'O',property_id:'F',area:100}],agreements:[{id:'A',object_id:'O'}]});
const add=(data,table,row)=>{data[table].push(normalize(table,row));return data;};
const item=(id,extra={})=>({id,agreement_id:'A',name:id,type:'addition',base_amount:10000,adjustment_method:'none',...extra});
const cost=(extra={})=>({id:'K',property_id:'F',category:'heat',name:'Värme',annual_amount:100000,...extra});
const invoice=(id,from,to,amount=1000)=>({id,cost_id:'K',type:'invoice',invoice_reference:id,invoice_date:from,valid_from:from,valid_to:to,amount});
const series=[{year:2025,month:10,value:419.35,seriesBase:'1980',source:'SCB KPI'},{year:2026,month:10,value:460,seriesBase:'1980',source:'SCB KPI'}];

test('financial ownership is real: no agreement scalar amounts, cost owner or stored annual summary duplicates',()=>{
 for(const field of Object.keys(legacyFinanceMap))assert(!tables.agreements.fields.some(f=>f.key===field));
 assert.deepEqual(tables.agreement_items.fields.filter(f=>f.type==='ref').map(f=>f.table),['agreements']);
 assert.deepEqual(tables.recurring_costs.fields.filter(f=>f.type==='ref').map(f=>f.table),['properties']);
 assert.deepEqual(tables.cost_evidence.fields.filter(f=>f.type==='ref').map(f=>f.table),['recurring_costs']);
 assert.throws(()=>normalize('agreements',{id:'A',object_id:'O',annual_rent:2}),/finns inte/);
 assert.throws(()=>normalize('recurring_costs',{...cost(),contract_id:'A'}),/finns inte/);
});
test('current item registers retain exact rent, addition and tax calculations for each index method',()=>{
 for(const method of ['none','kpi','fixed','kpi-limited']){
  const data=fixture();data.workspace.indexSeries=series;
  add(data,'agreement_items',item('base',{type:'base',base_amount:100000,base_year:2024,base_index:415.51,index_share:.8,adjustment_method:method,annual_percent:3,min_percent:2,max_percent:4,limit_basis:'rent'}));
  add(data,'agreement_items',item('addition',{base_amount:25000}));add(data,'agreement_items',item('tax',{type:'tax',base_amount:6000}));
  const before=structuredClone(data),view=projectWorkspace(normalizeWorkspace(data));
  for(const year of [2025,2026,2027]){const amounts=C.agreementItemValues(view.contracts[0],year,0,series);close(C.annualValues(view.contracts[0],year,0,series).total,amounts.reduce((sum,row)=>sum+row.annualRate,0));}
  assert.deepEqual(data,before);assert.equal(data.agreements[0].annual_rent,undefined);
 }
});
test('same-category additions have independent index rules and zero does not create missing-base diagnostics',()=>{
 const data=fixture();add(data,'agreement_items',item('base',{type:'base',base_amount:100000,adjustment_method:'fixed',base_year:2024,annual_percent:3}));
 add(data,'agreement_items',item('heat1',{type:'heat',adjustment_method:'kpi',base_year:2024,base_index:415.51,index_share:.8}));
 add(data,'agreement_items',item('heat2',{type:'heat',adjustment_method:'kpi-limited',base_year:2024,base_index:415.51,index_share:.5,min_percent:2,max_percent:4,limit_basis:'index'}));validateData(data);
 const v=projectWorkspace(data),rows=C.agreementItemValues(v.contracts[0],2027,0,series);
 close(rows[0].value.amount,106090);close(rows[1].value.amount,10000*(1+.8*(460/415.51-1)));close(rows[2].value.amount,10000*1.01*1.02);
 close(C.annualValues(v.contracts[0],2027,0,series).total,rows.reduce((sum,row)=>sum+row.annualRate,0));
 add(data,'agreement_items',item('free',{type:'other',base_amount:0}));assert.equal(C.itemComponent(projectWorkspace(data).agreementItems.at(-1),2027,0,series).amount,0);
});
test('only one base rent may overlap, with inclusive dates; same-category additions may overlap',()=>{
 const data=fixture();add(data,'agreement_items',item('a',{type:'base',valid_to:'2027-06-30'}));add(data,'agreement_items',item('b',{type:'base',valid_from:'2027-07-01'}));validateData(data);
 data.agreement_items[1].valid_from='2027-06-30';assert.throws(()=>validateData(data),/Endast en bashyra/);
 data.agreement_items[1].type='heat';validateData(data);
});
test('day proration distinguishes current run rate, calendar cost, leap days and agreement occupancy',()=>{
 const data=fixture();data.agreements[0].valid_from='2024-03-01';data.agreements[0].valid_to='2025-02-28';
 add(data,'agreement_items',item('base',{type:'base',base_amount:36600,valid_from:'2024-03-01',valid_to:'2024-12-31'}));
 add(data,'agreement_items',item('base2',{type:'base',base_amount:36500,valid_from:'2025-01-01'}));
 add(data,'agreement_items',item('heat',{type:'heat',base_amount:3660,valid_from:'2024-02-29',valid_to:'2024-03-01'}));
 const c=projectWorkspace(data).contracts[0];
 close(C.agreementYearCost(c,2024,0,[]),30600+10);close(C.agreementYearCost(c,2025,0,[]),5900);
 close(C.annualValues(c,2024,0,[],{date:'2024-03-01'}).total,40260);
 close(C.annualValues(c,2024,0,[],{date:'2024-07-01'}).total,36600);
 close(C.annualValues(c,2025,0,[],{date:'2025-03-01'}).total,0);
 close(C.budgetRows({...projectWorkspace(data),indexSeries:[]},2024)[0].amount,30610);
});
test('current cost evidence and frozen budget plans survive a view save without duplicate costs',()=>{
 const data=fixture();add(data,'recurring_costs',cost({annual_amount:12000,valid_from:'2025-01-01',valid_to:'2027-12-31'}));add(data,'cost_evidence',{id:'Y',cost_id:'K',type:'annual',year:2025,amount:11000,selected:true});
 data.workspace.budgetPlans=[{year:2025,status:'Låst',rows:[{amount:24000,sourceSnapshot:{id:'A',baseRent:10000}}]}];
 const before=structuredClone(data),view=projectWorkspace(data),saved=collectWorkspace(view,data);
 assert.equal(C.budgetRows(view,2025,view.contracts,view.properties).find(row=>row.sourceType==='recurringCost').amount,12000);
 assert.equal(C.actualRows(view,2025).find(row=>row.sourceType==='recurringCost').amount,11000);
 for(const table of Object.keys(tables))assert.deepEqual(saved[table],before[table],table);assert.deepEqual(saved.workspace.budgetPlans,before.workspace.budgetPlans);assert.equal(saved.workspace.recurringCosts,undefined);
});
test('invoices crossing year boundary use cost-period days; gaps or missing completion stay preliminary',()=>{
 const data=fixture();add(data,'recurring_costs',cost({valid_from:'2026-12-01',valid_to:'2027-01-31',invoice_complete_years:[2026,2027]}));add(data,'cost_evidence',invoice('INV','2026-12-01','2027-01-31',6200));
 const v=projectWorkspace(data),k=v.recurringCosts[0];assert.equal(R.evidenceActual(k,v.costEvidence,2026).amount,3100);assert.equal(R.evidenceActual(k,v.costEvidence,2027).amount,3100);assert.equal(R.evidenceActual(k,v.costEvidence,2027).complete,true);
 k.end='2027-02-28';assert.equal(R.evidenceActual(k,v.costEvidence,2027).complete,false);assert.equal(R.evidenceActual({...k,end:'2027-01-31',invoiceCompleteYears:[]},v.costEvidence,2027).complete,false);
});
test('annual actual explicitly replaces invoices, and category summaries never add both or mark partial evidence complete',()=>{
 const data=fixture();add(data,'recurring_costs',cost({invoice_complete_years:[2027]}));add(data,'cost_evidence',invoice('INV','2027-01-01','2027-12-31',90000));add(data,'cost_evidence',{id:'Y',cost_id:'K',type:'annual',year:2027,amount:100000,selected:true});
 let v=projectWorkspace(data);assert.equal(R.categoryActual(v,'F','heat',2027).amount,100000);assert.equal(v.recurringCosts[0].actuals[0].amount,100000);
 data.cost_evidence[1].selected=false;v=projectWorkspace(data);assert.equal(R.categoryActual(v,'F','heat',2027).amount,90000);
 add(data,'recurring_costs',cost({id:'K2',annual_amount:50000}));v=projectWorkspace(data);assert.equal(R.categoryActual(v,'F','heat',2027).complete,false);
 assert.throws(()=>validateData({...data,cost_evidence:[...data.cost_evidence,{...data.cost_evidence[0],id:'duplicate'}]}),/Fakturareferensen/);
 assert.throws(()=>validateData({...data,cost_evidence:[...data.cost_evidence,{...data.cost_evidence[1],id:'duplicate'}]}),/ett årsutfall/);
});
test('real Excel roundtrip includes all three registers, signed credits, sources and no legacy monetary columns',async()=>{
 const data=fixture();add(data,'agreement_items',item('base',{type:'base',sources:[{source:'syntetisk.xlsx',sheet:'Avtal',row:2}]}));add(data,'recurring_costs',cost({invoice_complete_years:[2027]}));add(data,'cost_evidence',invoice('credit','2027-01-01','2027-12-31',-100));
 const book=new ExcelJS.Workbook(),bytes=await writeWorkbook(data,ExcelJS);await book.xlsx.load(bytes);assert(book.getWorksheet('Avtalsposter'));assert(book.getWorksheet('Fastighetskostnader'));assert(book.getWorksheet('Kostnadsunderlag'));
 const headers=book.getWorksheet('Avtal').getRow(1).values.slice(1);assert(!headers.some(h=>/Bastillägg|Årshyra|bastal|indexandel|Fastighetsskatt/.test(h)));
 assert.deepEqual(await readWorkbook(bytes,ExcelJS),data);
});
test('obsolete financial workbook columns are rejected at the storage boundary',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await writeWorkbook(fixture(),ExcelJS));const sheet=book.getWorksheet('Avtal');sheet.getCell(1,sheet.columnCount+1).value='Bashyra, kr/år';
 await assert.rejects(readWorkbook(await book.xlsx.writeBuffer(),ExcelJS),/Kolumnerna/);
});
test('wide external Excel import creates separate items idempotently, with source rows and review instead of overwrite',()=>{
 const data=fixture();const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['AvtalsID','Hyra','Tillägg','Skatt','Metod'],['A',100000,10000,5000,'none']]),'Underlag');
 const profile={name:'Underlag',headerRow:1,columns:['contracts.id','contracts.baseRent','contracts.baseAdditions','contracts.annualPropertyTax','contracts.rentAdjustmentMethod'].map((target,index)=>({index,target}))};
 const result=prepareCleanImport(workbook,[profile],data,{fileName:'syntetisk.xlsx'},XLSX);assert.equal(result.report.review,0);assert.equal(result.clean.agreement_items.length,3);assert.equal(result.clean.agreement_items[0].sources[0].row,2);
 const again=prepareCleanImport(workbook,[profile],result.clean,{fileName:'syntetisk.xlsx'},XLSX);assert.equal(again.clean.agreement_items.length,3);assert.equal(again.report.changes.length,0);
 workbook.Sheets.Underlag.B2.v=200000;const conflict=prepareCleanImport(workbook,[profile],result.clean,{fileName:'syntetisk.xlsx'},XLSX);assert.equal(conflict.report.review,1);assert.equal(conflict.clean.agreement_items[0].base_amount,100000);
});
test('current SQLite items, negative evidence and atomic overlap validation persist across reopen',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'finance-sql-')),file=path.join(dir,'test.sqlite');let store;
 try{
  store=await LocalStore.open({file});const data=fixture();add(data,'agreement_items',item('base',{type:'base'}));add(data,'recurring_costs',cost());add(data,'cost_evidence',invoice('credit','2027-01-01','2027-12-31',-20));await store.replace(data,0);await store.close();store=null;
  store=await LocalStore.open({file});const saved=store.snapshot();assert.equal(saved.data.agreement_items[0].base_amount,10000);assert.equal(saved.data.cost_evidence[0].amount,-20);
  await assert.rejects(store.mutate([{table:'agreement_items',record:item('overlap',{type:'base'})}],saved.version),/Endast en bashyra/);assert.deepEqual(store.snapshot(),saved);
  await assert.rejects(store.replace(data,saved.version-1),/ändrats/);
 }finally{if(store)await store.close();await rm(dir,{recursive:true,force:true});}
});
test('compact V2 panels show distinct run rate/calendar cost and missing actuals as incomplete',()=>{
 const data=fixture();add(data,'agreement_items',item('base',{type:'base'}));add(data,'recurring_costs',cost());const v=projectWorkspace(data);
 const agreement=agreementItemsPanel(v,v.contracts[0],2027),property=propertyCostsPanel(v,'F',2027);
 assert.match(agreement,/Lägg till post/);assert.match(agreement,/Aktuell årstakt/);assert.match(agreement,/Kalenderår 2027/);assert.match(property,/Ej komplett/);assert.match(property,/Underlag/);
});

test('new register sheets infer their own ID references and normalized JSON/boolean imports remain idempotent',async()=>{
 const {importSchemas}=await import('../frontend/lokaler/import-model.js');const {profileWorkbook}=await import('../frontend/services/import-engine.js');
 const data=fixture();add(data,'agreement_items',item('base',{type:'base',sources:[{source:'original.xlsx',row:2}]}));add(data,'recurring_costs',cost({invoice_complete_years:[2027]}));add(data,'cost_evidence',invoice('INV','2027-01-01','2027-12-31',9000));
 const workbook=XLSX.read(await writeWorkbook(data,ExcelJS),{type:'array'}),names=['Kostnadsunderlag','Fastighetskostnader','Avtalsposter'];
 const selected={...workbook,SheetNames:names};const profiles=profileWorkbook(selected,importSchemas,XLSX,[],{reviewed:true});
 assert.equal(profiles[0].columns.find(c=>c.header==='KostnadsID').target,'costEvidence.costId');assert.equal(profiles[2].columns.find(c=>c.header==='AvtalsID').target,'agreementItems.contractId');
 const result=prepareCleanImport(workbook,profiles,fixture(),{fileName:'register.xlsx'},XLSX);assert.equal(result.report.review,0);assert.equal(result.clean.agreement_items.length,1);assert.equal(result.clean.recurring_costs.length,1);assert.equal(result.clean.cost_evidence.length,1);
 const again=prepareCleanImport(workbook,profiles,result.clean,{fileName:'register.xlsx'},XLSX);assert.equal(again.report.review,0);assert.equal(again.report.changes.length,0);
});
test('repeated agreement rows enrich item provenance without creating duplicate rent or false conflicts',()=>{
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['AvtalsID','Bashyra'],['A',100],['A',100]]),'Underlag');
 const profile={name:'Underlag',headerRow:1,columns:['contracts.id','contracts.baseRent'].map((target,index)=>({index,target}))};
 const result=prepareCleanImport(workbook,[profile],fixture(),{fileName:'test.xlsx'},XLSX);assert.equal(result.report.review,0);assert.equal(result.clean.agreement_items.length,1);assert.equal(result.clean.agreement_items[0].sources.length,2);
 const again=prepareCleanImport(workbook,[profile],result.clean,{fileName:'test.xlsx'},XLSX);assert.equal(again.report.review,0);assert.equal(again.report.changes.length,0);
});
test('protected Budget scalar edits update a sole stored item and refuse ambiguous multiple additions',async()=>{
 const {applyContractFinanceEdit,projectFinance}=await import('../frontend/lokaler/finance-view.js');
 const data=fixture();add(data,'agreement_items',item('base',{type:'base'}));const view=projectWorkspace(data),before=structuredClone(view.contracts[0]);
 applyContractFinanceEdit(view,before,{...before,baseRent:12000});projectFinance(view);assert.equal(view.agreementItems[0].baseAmount,12000);assert.equal(collectWorkspace(view,data).agreements[0].annual_rent,undefined);
 view.agreementItems.push({id:'heat1',contractId:'A',type:'heat',name:'Värme',baseAmount:1000,adjustmentMethod:'none'},{id:'heat2',contractId:'A',type:'heat',name:'Värme 2',baseAmount:2000,adjustmentMethod:'none'});projectFinance(view);
 assert.throws(()=>applyContractFinanceEdit(view,view.contracts[0],{...view.contracts[0],baseAdditions:6000}),/flera separata poster/);
});
test('incomplete new Excel structure and out-of-period evidence are rejected, never silently discarded',async()=>{
 const data=fixture(),book=new ExcelJS.Workbook();await book.xlsx.load(await writeWorkbook(data,ExcelJS));book.removeWorksheet('Avtalsposter');await assert.rejects(readWorkbook(await book.xlsx.writeBuffer(),ExcelJS),/Fliken Avtalsposter saknas/);
 add(data,'recurring_costs',cost({valid_from:'2027-01-01',valid_to:'2027-06-30'}));add(data,'cost_evidence',invoice('bad','2027-01-01','2027-12-31'));assert.throws(()=>validateData(data),/utanför kostnadens/);
});
test('unchanged Budget cost form preserves exact dates, invoice source choice, completeness and provenance',async()=>{
 const {applyLegacyCostEdit,projectFinance}=await import('../frontend/lokaler/finance-view.js');
 const data=fixture();add(data,'recurring_costs',cost({valid_from:'2027-02-01',valid_to:'2027-11-30',invoice_complete_years:[2027],sources:[{source:'source.xlsx'}]}));add(data,'cost_evidence',invoice('INV','2027-02-01','2027-11-30',15000));
 const view=projectWorkspace(data),before=structuredClone(view.recurringCosts[0]);
 applyLegacyCostEdit(view,{id:'K',name:before.name,category:before.category,annualAmount:before.annualAmount,startYear:2027,endYear:2027,propertyId:'F',contractId:'',actuals:before.actuals},2027);projectFinance(view);
 assert.equal(view.costEvidence.length,1);assert.equal(view.costEvidence[0].type,'invoice');assert.deepEqual(collectWorkspace(view,data).recurring_costs,data.recurring_costs);
 applyLegacyCostEdit(view,{...view.recurringCosts[0],actuals:[{year:2027,amount:16000}]},2027);projectFinance(view);assert.equal(view.costEvidence.length,2);assert.equal(view.costEvidence.find(row=>row.type==='annual').amount,16000);assert.equal(view.recurringCosts[0].actuals[0].amount,16000);
});
test('wide index enrichment never overwrites omitted amount, post name, period, method or reconciliation choice',()=>{
 const data=fixture();add(data,'agreement_items',item('base|A',{type:'base',name:'Avtalad lokalhyra',base_amount:100000,valid_from:'2027-03-01',adjustment_method:'none',reconcilable:true}));
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['AvtalsID','Basår'],['A',2026]]),'Underlag');const profile={name:'Underlag',headerRow:1,columns:['contracts.id','contracts.rentBaseYear'].map((target,index)=>({index,target}))};
 const result=prepareCleanImport(workbook,[profile],data,{fileName:'komplettering.xlsx'},XLSX);assert.equal(result.report.review,0);const saved=result.clean.agreement_items[0];assert.equal(saved.base_amount,100000);assert.equal(saved.name,'Avtalad lokalhyra');assert.equal(saved.valid_from,'2027-03-01');assert.equal(saved.reconcilable,true);assert.equal(saved.adjustment_method,'none');assert.equal(saved.base_year,2026);
});
test('new financial panels stay outside the protected Budget editor presentation',async()=>{
 const {renderPropertyEditor}=await import('../frontend/v2/property-editor.js');const {renderContractEditor}=await import('../frontend/v2/contract-editor.js');
 const data=fixture();add(data,'agreement_items',item('base',{type:'base'}));const v=projectWorkspace(data);
 assert.doesNotMatch(renderPropertyEditor(v,v.properties[0],'F',false,{portfolio:false}),/data-cost-new|data-cost-evidence/);
 const budget=renderContractEditor(v,v.contracts[0],'A',false,{portfolio:false});assert.match(budget,/name="baseRent"/);assert.doesNotMatch(budget,/data-item-new/);
 const portfolio=renderContractEditor(v,v.contracts[0],'A',false,{portfolio:true});assert.match(portfolio,/data-item-new/);assert.doesNotMatch(portfolio,/name="baseRent"/);
});
