import test from 'node:test';
import assert from 'node:assert/strict';
import {workbookRole,defaultWorkbookSheets,workbookFieldRule,enrichmentFields}
 from '../frontend/lokaler/import-workbook-rules.js';

const sheets=['EXT','SF','Lokallista','Lokalbestånd ','Fastighetslista','Beställningar','Lokaldata','Årshjul'];
test('Lokallista is the only base; selection excludes references, orders and planning',()=>{
 assert.deepEqual(defaultWorkbookSheets(sheets),
  ['Lokallista','Lokalbestånd ','Fastighetslista','Lokaldata']);
 assert.equal(workbookRole('Lokallista',sheets),'base');
 assert.equal(workbookRole('Fastighetslista',sheets),'enrichment');
 assert.equal(workbookRole('SF',sheets),'reference');
 assert.equal(workbookRole('Årshjul',sheets),'optional');
});
test('historical reference-only workbooks retain ordinary recommended selection',()=>{
 assert.deepEqual(defaultWorkbookSheets(['Avtal','Fastigheter'],[true,false]),['Avtal']);
});
test('known headers use actual parent identities; never create an object from source property number',()=>{
 assert.equal(workbookFieldRule('Lokallista','#NAME?',0),'properties.managementObjectNumber');
 assert.equal(workbookFieldRule('Lokalbestånd ','Objektsnummer / Förvaltningsobjekt',2),
  'properties.managementObjectNumber');
 assert.equal(workbookFieldRule('Fastighetslista','Objekt. nr',12),'properties.managementObjectNumber');
});
test('computed and person columns are ignored by default during enrichment',()=>{
 assert.equal(workbookFieldRule('Lokaldata','Hyra 2026',20),'@ignore');
 assert.equal(workbookFieldRule('Lokaldata','Hyra (kr/kvm)',23),'@ignore');
 assert.equal(workbookFieldRule('Fastighetslista','Email (förvaltare)',8),'@ignore');
 assert.equal(workbookFieldRule('Fastighetslista','Fastighetsägare',5),'@ignore');
 assert.equal(workbookFieldRule('Lokaldata','VERKSAMHET',4),'contracts.businessName');
 assert.equal(workbookFieldRule('Lokalbestånd ','Verksamhet',1),'contracts.businessName');
 assert(!enrichmentFields.has('agreementItems.baseAmount'));
 assert(!enrichmentFields.has('activities.title'));
 assert(enrichmentFields.has('objects.area'));
});
