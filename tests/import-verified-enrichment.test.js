import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {importAddressKey} from '../frontend/lokaler/issue-import.js';
import {readFileSync} from 'node:fs';
import {approveImportPlan,importCreationPlan} from '../frontend/lokaler/import-plan.js';
import {readWorkbook,writeWorkbook} from '../backend/lokaler/workbook.js';

const source=(headings,rows)=>{
 const workbook=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headings,...rows]),'Fastighetslista');
 return {workbook,profiles:profileWorkbook(workbook,importSchemas,XLSX,[],{reviewed:true})};
};
const baseline=()=>{
 const data=emptyData();
 data.properties.push(
  normalize('properties',{id:'SF1600',management_object_number:'1600',name:'Andersgatan 14',address:'Andersgatan 14',city:'Malmö'}),
  normalize('properties',{id:'SF1601',management_object_number:'1601',name:'Testgatan 5',address:'Testgatan 5',city:'Malmö'})
 );
 data.objects.push(normalize('objects',{id:'SF1600-001',property_id:'SF1600'}));
 data.agreements.push(normalize('agreements',{id:'SF1600-001-01',object_id:'SF1600-001'}));
 return data;
};
const importOne=(src,data=baseline(),extra={})=>prepareCleanImport(
 src.workbook,src.profiles,data,{fileName:'LOKALLISTA BERIKNING.xlsx',enrichment:true,...extra},XLSX
);

test('unique existing address with placeholder name enriches real property designation without new property, object or agreement',()=>{
 const src=source(['Postadress','Fastighetsbeteckning','Benämning'],[
  ['Andersgatan 14','GRÖNDAL 1','Päronskogen, säbo']
 ]);
 const base=baseline(),copy=structuredClone(base),result=importOne(src,base);
 assert.equal(result.report.blocking,0);
 assert.equal(result.report.linkProposals.length,0);
 assert.equal(result.report.review,0,JSON.stringify(result.clean.workspace.importReview));
 assert.deepEqual(base,copy,'preview must not alter saved base');
 assert.equal(result.clean.properties.length,2);
 const property=result.clean.properties.find(p=>p.id==='SF1600');
 assert.equal(property.name,'GRÖNDAL 1');
 assert.equal(property.popular_name,'Päronskogen, säbo');
 assert.equal(property.address,'Andersgatan 14');
 assert.equal(property.management_object_number,'1600');
 assert.equal(result.clean.objects[0].property_id,'SF1600');
 assert.equal(result.clean.agreements[0].object_id,'SF1600-001');
 assert(result.report.changes.some(c=>c.collection==='properties'&&c.recordId==='SF1600'&&c.field==='designation'&&c.to==='GRÖNDAL 1'));
 assert(result.clean.workspace.auditLog.some(entry=>entry.fields?.some(f=>f.provenance?.matchingDecision?.method==='verified-address-name-enrichment')));
 const again=importOne(src,result.clean);
 assert.equal(again.report.blocking,0);
 assert.equal(again.report.review,0);
 assert.equal(again.clean.properties.length,2);
 assert.equal(again.report.changes.length,0);
 validateData(again.clean);
});

test('an actual existing property designation is never silently replaced by another name on an address-only match',()=>{
 const data=baseline();data.properties[0].name='GRÖNDAL 1';
 const src=source(['Postadress','Fastighetsbeteckning'],[['Andersgatan 14','STACKEN 1']]);
 const result=importOne(src,data);
 assert.equal(result.report.linkProposals.length,1);
 assert.equal(result.report.blocking,1);
 assert.equal(result.clean.properties[0].name,'GRÖNDAL 1');
});

test('ambiguous identical addresses across different saved property IDs require explicit choice',()=>{
 const data=baseline();
 data.properties.push(normalize('properties',{id:'SF1620',management_object_number:'1620',name:'Andersgatan 14',address:'Andersgatan 14',city:'Malmö'}));
 const result=importOne(source(['Postadress','Fastighetsbeteckning'],[['Andersgatan 14','GRÖNDAL 1']]),data);
 assert.equal(result.report.blocking,1);
 assert.equal(result.report.linkProposals.length,1);
 assert.equal(result.report.linkProposals[0].matches.length,2);
 assert.equal(result.clean.properties.find(p=>p.id==='SF1600').name,'Andersgatan 14');
});
test('addresses without a house number never trigger automatic keyless enrichment',()=>{
 const data=baseline();
 data.properties[0].address='Testgatan';data.properties[0].name='Testgatan';
 const result=importOne(source(['Postadress','Fastighetsbeteckning'],[['Testgatan','GRÖNDAL 1']]),data);
 assert.equal(result.report.blocking,1);
 assert.equal(result.report.linkProposals.length,1);
});
test('supplied foreign key that contradicts a verified address cannot be replaced by an address guess',()=>{
 const src=source(['FastighetsNr','Postadress','Fastighetsbeteckning'],[['1601','Andersgatan 14','GRÖNDAL 1']]);
 const result=importOne(src);
 assert.equal(result.report.linkProposals.length,0);
 assert.equal(result.clean.properties.find(p=>p.id==='SF1600').name,'Andersgatan 14');
 assert.equal(result.clean.properties.find(p=>p.id==='SF1601').name,'Testgatan 5');
 // Enrichment mode retains populated fields on the supplied property ID.
 // It must never silently use the unrelated address to move this relationship.
 assert.equal(result.report.blocking,0);
 assert.equal(result.clean.properties.find(p=>p.id==='SF1601').management_object_number,'1601');
});
test('import does not call the bulk geocoder; manually initiated lookup and retry remain available',()=>{
 const app=readFileSync(new URL('../frontend/v2/app.js',import.meta.url),'utf8');
 const sourceAction=app.slice(app.indexOf('async function sourceAction('),app.indexOf('document.addEventListener("keydown"'));
 assert.doesNotMatch(sourceAction,/startGeoEnrichment\s*\(/);
 assert.match(app,/if\s*\(\s*b\.hasAttribute\("data-geo-retry"\)\s*\)\s*startGeoEnrichment\s*\(/);
 assert.match(app,/globalThis\.LokalblickGeocodingService\.lookupProperty\(property\)/);
});

test('verified enrichment persists through normal approval, Excel serialization and later repeat import',async()=>{
 const base=baseline(),src=source(['Postadress','Fastighetsbeteckning','Benämning'],[
  ['Andersgatan 14','GRÖNDAL 1','Päronskogen, säbo']
 ]);
 const preview=importOne(src,base),plan=importCreationPlan(preview,base);
 assert.equal(plan.length,0,'an enriched existing property requires no new entity approval');
 const approved=approveImportPlan(preview,base,{});
 assert.equal(approved.clean.properties.find(p=>p.id==='SF1600').name,'GRÖNDAL 1');
 assert.equal(approved.clean.objects[0].property_id,'SF1600');
 const restored=await readWorkbook(await writeWorkbook(approved.clean));
 assert.equal(restored.properties.find(p=>p.id==='SF1600').name,'GRÖNDAL 1');
 assert.equal(restored.properties.find(p=>p.id==='SF1600').popular_name,'Päronskogen, säbo');
 assert.equal(restored.agreements[0].object_id,'SF1600-001');
 const again=approveImportPlan(importOne(src,restored),restored,{});
 assert.equal(again.report.review,0);
 assert.equal(again.report.changes.length,0);
});
