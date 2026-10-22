import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';import {emptyData} from '../frontend/lokaler/model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {skippedFinancialSuggestions,setMappingRow,financialSheetHint} from '../frontend/services/import-matching.js';import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
const headers=['FastighetsID','ObjektID','Avtalsnummer','Grundhyra','Värme','Basår'];
function source(h=headers,values=['F1','O1','A1',100000,12000,2026]){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([h,values]),'Avtal');return book;}
const profiles=(book,saved=[],schemas=importSchemas)=>profileWorkbook(book,schemas,XLSX,saved,{reviewed:true});
const run=(book,ps,base=emptyData())=>prepareCleanImport(book,ps,base,{fileName:'syntetiska-avtal.xlsx'},XLSX);
function previouslySkipped(book){const ps=profiles(book);for(const p of ps)for(const column of p.columns)if(column.target.startsWith('agreementItems.'))column.target='@ignore';return run(book,ps);}

test('saved exclusions reproduce zero item proposals; fresh financial suggestions are separate and do not import without approval',()=>{
 const book=source(),first=previouslySkipped(book),ps=profiles(book,first.clean.workspace.importMappings),before=structuredClone(ps),proposed=skippedFinancialSuggestions(book,ps[0],importSchemas,XLSX);
 assert.equal(first.clean.agreement_items.length,0);assert(ps[0].columns.filter(c=>/Grundhyra|Värme|Basår/.test(c.header)).every(c=>c.target==='@ignore'));assert.equal(proposed.length,3);assert.deepEqual(ps,before);assert.equal(run(book,ps,first.clean).clean.agreement_items.length,0);
 for(const column of proposed)Object.assign(ps[0].columns.find(c=>c.index===column.index),column,{approved:true,matchSource:'manual'});
 const accepted=run(book,ps,first.clean);assert.equal(accepted.report.blocking,0);assert.equal(accepted.clean.agreement_items.length,2);assert.equal(accepted.clean.agreement_items.find(i=>i.type==='base').base_amount,100000);assert.equal(accepted.clean.agreement_items.find(i=>i.type==='base').base_year,2026);assert.equal(accepted.clean.agreement_items.find(i=>i.type==='heat').base_amount,12000);assert.equal(accepted.clean.agreements.length,1);
 const again=profiles(book,accepted.clean.workspace.importMappings);assert.equal(skippedFinancialSuggestions(book,again[0],importSchemas,XLSX).length,0);assert.equal(run(book,again,accepted.clean).clean.agreement_items.length,2);
 const html=columnPreviewHtml({fileName:'syntetiska-avtal.xlsx'},{profiles:before},run(book,before,first.clean),importSchemas,{}, {financialSuggestions:proposed.map(column=>({key:'0:'+column.index,column}))});assert.match(html,/Hyreskolumner att koppla på nytt/);assert.match(html,/Grundhyra/);assert.match(html,/Avtalsposter → Grundbelopp, kr\/år · Värme/);assert.match(html,/data-restore-financial="all"/);
});
test('individual acceptance preserves other saved exclusions and explicit or current manual choices are never replaced',()=>{
 const book=source(),first=previouslySkipped(book),ps=profiles(book,first.clean.workspace.importMappings),proposed=skippedFinancialSuggestions(book,ps[0],importSchemas,XLSX),heat=proposed.find(c=>c.header==='Värme');Object.assign(ps[0].columns.find(c=>c.index===heat.index),heat,{approved:true,matchSource:'manual'});
 const result=run(book,ps,first.clean);assert.equal(result.clean.agreement_items.length,1);assert.equal(result.clean.agreement_items[0].type,'heat');assert.equal(ps[0].columns.find(c=>c.header==='Grundhyra').target,'@ignore');
 for(const c of ps[0].columns)if(c.target==='@ignore')c.matchSource='manual';assert.equal(skippedFinancialSuggestions(book,ps[0],importSchemas,XLSX).length,0);
 const mapping=source(['FastighetsID','Avtalsnummer','Grundhyra'],['Fastighet.FastighetsID','Avtal.AvtalsID','Importera inte']);XLSX.utils.sheet_add_aoa(mapping.Sheets.Avtal,[['F1','A1',100000]],{origin:'A3'});const p=profiles(mapping)[0];setMappingRow(mapping,p,true,importSchemas,XLSX);assert.equal(skippedFinancialSuggestions(mapping,p,importSchemas,XLSX).length,0);
});
test('recovering saved mappings never invents amounts from included-service text, annual reports or empty fields',()=>{
 const book=source(['FastighetsID','Avtalsnummer','Grundhyra','Värme','Tillägg','Tillägg','Hyra 2026','Kyla'],['F1','A1',100000,'Ingår',5000,6000,115000,'']),first=previouslySkipped(book),p=profiles(book,first.clean.workspace.importMappings)[0];
 for(const c of p.columns)if(c.target==='@unmapped')Object.assign(c,{target:'@ignore',matchSource:'saved'});
 const proposed=skippedFinancialSuggestions(book,p,importSchemas,XLSX);assert.deepEqual(proposed.map(c=>c.header),['Grundhyra','Tillägg','Tillägg']);assert.equal(new Set(proposed.map(c=>c.itemKey)).size,3);
 p.primaryTable='recurringCosts';assert.equal(skippedFinancialSuggestions(book,p,importSchemas,XLSX).length,0);
});
test('fresh proposals respect current field definitions and never target removed fields',()=>{
 const book=source(),first=previouslySkipped(book),schemas=structuredClone(importSchemas),items=schemas.find(s=>s.key==='agreementItems');items.columns=items.columns.filter(([field])=>field!=='baseYear');const p=profiles(book,first.clean.workspace.importMappings,schemas)[0];const proposed=skippedFinancialSuggestions(book,p,schemas,XLSX);assert(proposed.every(c=>c.target!=='agreementItems.baseYear'));assert.equal(proposed.length,2);
});

test('retired saved agreement money targets get a current item proposal without silently changing the saved choice',()=>{
 const book=source(),first=previouslySkipped(book),saved=structuredClone(first.clean.workspace.importMappings);saved[0].columns.find(c=>c.header==='Grundhyra').target='contracts.baseRent';const p=profiles(book,saved)[0],column=p.columns.find(c=>c.header==='Grundhyra');assert.equal(column.target,'@unmapped');const proposed=skippedFinancialSuggestions(book,p,importSchemas,XLSX).find(c=>c.header==='Grundhyra');assert.equal(proposed.target,'agreementItems.baseAmount');assert.equal(proposed.itemType,'base');assert.equal(column.target,'@unmapped');
});

test('unknown sheet names with agreement identities and monetary items are recommended from contents using the current model',()=>{
 const book=source(),sheet=book.Sheets.Avtal,ref=sheet['!ref'];sheet['!ref']='A1:XFC1048567';const hint=financialSheetHint(sheet,'Godtyckligt underlag',ref,importSchemas,XLSX);assert.equal(hint.recommended,true);assert.deepEqual(hint.financialColumns,['Grundhyra','Värme']);assert.equal(sheet['!ref'],'A1:XFC1048567');
 const text=source(['Avtalsnummer','Värme'],['A1','Ingår']);assert.equal(financialSheetHint(text.Sheets.Avtal,'Text',text.Sheets.Avtal['!ref'],importSchemas,XLSX),null);
 const missing=source(['Grundhyra','Värme'],[100000,12000]);assert.equal(financialSheetHint(missing.Sheets.Avtal,'Orelaterade belopp',missing.Sheets.Avtal['!ref'],importSchemas,XLSX),null);
 const schemas=structuredClone(importSchemas);schemas.find(s=>s.key==='agreementItems').columns=schemas.find(s=>s.key==='agreementItems').columns.filter(([key])=>key!=='baseAmount');assert.equal(financialSheetHint(sheet,'Underlag',ref,schemas,XLSX),null);
});
