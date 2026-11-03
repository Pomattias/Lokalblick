import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import '../frontend/domain/calculations.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {projectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {resolveFieldName} from '../frontend/services/import-matching.js';
import {overview} from '../frontend/v2/views.js';
import {COLUMN_CATALOG} from '../frontend/v2/column-catalog.js';

const book=(rows,name='Lokallista')=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet(rows),name);return w;
};
const profile=(w,base=emptyData())=>profileWorkbook(w,importSchemas,XLSX,base.workspace?.importMappings||[],{reviewed:true});
const run=(w,base=emptyData(),profiles=profile(w,base))=>
 prepareCleanImport(w,profiles,base,{fileName:'test-hyror.xlsx',fingerprint:'2026-rents'},XLSX);

test('Avtal shows contract number separately from the tenant in Verksamhet, plus a real property number',()=>{
 const data=emptyData();
 data.properties.push({id:'property1',name:'FASTIGHETEN 1',address:'Exempelgatan 1',
  management_object_number:'116'});
 data.objects.push({id:'object1',property_id:'property1',area:100,valid_from:'2020-01-01'});
 data.parties.push({id:'tenant1',name:'Verksamheten AB',kind:'hyresgäst'});
 data.agreements.push({id:'contract1',object_id:'object1',tenant_party_id:'tenant1',
  valid_from:'2020-01-01',usage:'Särskilt boende'});
 const view=projectWorkspace(data);
 const html=overview(view,{unit:'',owner:'',person:'',q:'',propertyId:''},
  {perspective:'Avtal',year:2026,portfolioView:false});
 assert.match(html,/>Verksamhet</);
 assert.match(html,/>Verksamhetsbeskrivning</);
 const idx=html.indexOf('data-open-contract="contract1"');
 const nearby=html.slice(idx,idx+430);
 assert.match(nearby,/contract1/);
 assert.doesNotMatch(nearby,/Verksamheten AB/);
 assert.match(html,/Verksamheten AB/);
 assert.equal(view.properties[0].number,'SF116');
 assert.equal(COLUMN_CATALOG.contracts[9],'tenant');
});
test('FastighetsNr and Fastighetslista Objekt. nr target properties, never objects',()=>{
 assert.equal(resolveFieldName('FastighetsNr',importSchemas,'objects')?.target,
  'properties.managementObjectNumber');
 const w=book([['Objekt. nr','Fastighetsbeteckning'],['116','FASTIGHETEN 1']],'Fastighetslista');
 const p=profile(w)[0];
 assert.equal(p.columns[0].target,'properties.managementObjectNumber');
 const stale=[{sheet:p.name,signature:p.signature,layoutSignature:p.layoutSignature,
  primaryTable:p.primaryTable,columns:p.columns.map(c=>({...c,target:c.index===0?'objects.id':c.target}))}];
 assert.equal(profileWorkbook(w,importSchemas,XLSX,stale,{reviewed:true})[0].columns[0].target,
  'properties.managementObjectNumber');
});
test('Hyra 2026 produces a year-bound reported rent item without invented index/base rent',()=>{
 const w=book([['FastighetsID','ObjektID','Avtalsnummer','Hyra 2026'],
  ['F116','O116','AV116',125000]]);
 const p=profile(w);
 const rent=p[0].columns.find(c=>c.header==='Hyra 2026');
 assert.equal(rent.target,'agreementItems.reportedAmount');
 assert.equal(rent.itemType,'base');
 assert.equal(rent.reportedRentYear,2026);
 const result=run(w,emptyData(),p);
 assert.equal(result.report.blocking,0,JSON.stringify(result.report));
 assert.equal(result.clean.agreements.length,1);
 assert.equal(result.clean.agreement_items.length,1);
 const item=result.clean.agreement_items[0];
 assert.equal(item.base_amount,0);
 assert.equal(item.reported_amount,125000);
 assert.equal(item.valid_from,'2026-01-01');
 assert.equal(item.valid_to,'2026-12-31');
 assert.equal(item.adjustment_method,'none');
 assert.equal(item.sources[0].reportedYear,2026);
 const view=projectWorkspace(result.clean);
 const values=globalThis.LokalblickCalculations.annualValues(view.contracts[0],2026,0,[]);
 assert.equal(values.rent.amount,125000);
 assert.equal(values.rent.status,'Källvärde');
 assert.equal(globalThis.LokalblickCalculations.annualValues(view.contracts[0],2027,0,[]).rent.amount,0);
 validateData(result.clean);
});
test('year rent enriches an already imported agreement without creating duplicate agreements',()=>{
 const w=book([['FastighetsID','ObjektID','Avtalsnummer','Hyra 2026'],
  ['F116','O116','AV116',125000]]);
 const firstProfile=profile(w);firstProfile[0].columns.find(c=>c.header==='Hyra 2026').target='@ignore';
 const first=run(w,emptyData(),firstProfile);
 assert.equal(first.clean.agreement_items.length,0);
 const next=run(w,first.clean,profileWorkbook(w,importSchemas,XLSX,[],{reviewed:true}));
 assert.equal(next.clean.agreements.length,1);
 assert.equal(next.clean.agreement_items.length,1);
 const repeat=run(w,next.clean,profileWorkbook(w,importSchemas,XLSX,[],{reviewed:true}));
 assert.equal(repeat.clean.agreement_items.length,1);
});
test('reported annual rent never silently overwrites legitimate contractual base rent',()=>{
 const w=book([['FastighetsID','ObjektID','Avtalsnummer','Grundhyra','Hyra 2026'],
  ['F116','O116','AV116',95000,125000]]);
 const result=run(w);
 assert.equal(result.report.blocking,0);
 assert.equal(result.clean.agreement_items.length,1);
 const item=result.clean.agreement_items[0];
 assert.equal(item.base_amount,95000);
 assert.equal(item.reported_amount,125000);
 assert.notEqual(item.valid_from,'2026-01-01');
});
