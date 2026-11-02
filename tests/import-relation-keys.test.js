import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {resolveFieldName} from '../frontend/services/import-matching.js';

const headings=[
 'FastighetsNr','Fastighetsbeteckning','Gatuadress','Objektnummer','Area',
 'Avtalsnummer','Hyresgästnamn','Hyresgäst orgnr',
 'Fastighetsägarens namn','Fastighetsägare orgnr','Förvaltarnamn',
 'Grundhyra','Hyra basår','Värme','Värme basår'
];
const record=(obj,agreement,tenant,org,basar)=>[
 '1600','GRÖNDAL 1','Andersgatan 14',obj,100,
 agreement,tenant,org,
 'Ägaren AB','556001-2222','Anna Testsson',120000,basar,12000,2023
];
function build(rows){
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headings,...rows]),'Lokallista');
 return book;
}
function importRows(book,base=emptyData()){
 const profiles=profileWorkbook(book,importSchemas,XLSX,base.workspace.importMappings||[],{reviewed:true});
 return {profiles,result:prepareCleanImport(book,profiles,base,{fileName:'relationer.xlsx'},XLSX)};
}
test('business headings map to canonical properties, agreements, Part, Person and separate base years',()=>{
 const expected={
  'FastighetsNr':'properties.managementObjectNumber',
  'Fastighetsbeteckning':'properties.designation',
  'Objektnummer':'objects.id',
  'Avtalsnummer':'contracts.id',
  'Hyresgästnamn':'contracts.tenantPartyId',
  'Hyresgäst orgnr':'contracts.tenantOrganizationNumber',
  'Fastighetsägarens namn':'properties.ownerPartyId',
  'Fastighetsägare orgnr':'properties.ownerOrganizationNumber',
  'Förvaltarnamn':'properties.ownerResponsiblePersonId'
 };
 for(const [heading,target]of Object.entries(expected)){
  assert.equal(resolveFieldName(heading,importSchemas,'contracts')?.target,target,heading);
 }
 const book=build([record('1600-001','A1','Butiken AB','556001-1111',2025)]);
 const {profiles}=importRows(book);
 for(const [heading,target] of Object.entries(expected))
  assert.equal(profiles[0].columns.find(c=>c.header===heading)?.target,target,heading);
 assert.equal(profiles[0].columns.find(c=>c.header==='Hyra basår').target,'agreementItems.baseYear');
 assert.equal(profiles[0].columns.find(c=>c.header==='Värme basår').itemType,'heat');
});
test('one property across two leases has one owner Part, one manager Person, two tenant Parties and independently linked rent items',()=>{
 const book=build([
  record('1600-001','A1','Butiken AB','556001-1111',2025),
  record('1600-002','A2','Restaurangen AB','556001-3333',2026)
 ]);
 const {result}=importRows(book),data=result.clean;
 assert.equal(result.report.blocking,0,JSON.stringify(result.report.sourceRows));
 assert.equal(result.report.review,0,JSON.stringify(data.workspace.importReview));
 assert.equal(data.properties.length,1);
 assert.equal(data.properties[0].management_object_number,'1600');
 assert.equal(data.objects.length,2);
 assert.equal(data.agreements.length,2);
 assert.equal(data.parties.length,3);
 assert.equal(data.people.length,1);
 const owner=data.parties.find(p=>p.name==='Ägaren AB');
 const manager=data.people.find(p=>p.name==='Anna Testsson');
 assert.equal(owner.organization_number,'556001-2222');
 assert.equal(manager.party_id,owner.id);
 assert.equal(data.properties[0].owner_party_id,owner.id);
 assert.equal(data.contacts.filter(c=>c.person_id===manager.id&&c.role==='owner').length,1);
 for(const [agreementId,tenantName,tenantOrg,year] of [
  ['A1','Butiken AB','556001-1111',2025],
  ['A2','Restaurangen AB','556001-3333',2026]
 ]){
  const agreement=data.agreements.find(a=>a.id===agreementId);
  const tenant=data.parties.find(p=>p.name===tenantName);
  const object=data.objects.find(o=>o.id===agreement.object_id);
  assert.equal(object.property_id,data.properties[0].id);
  assert.equal(agreement.tenant_party_id,tenant.id);
  assert.equal(tenant.organization_number,tenantOrg);
  const prices=data.agreement_items.filter(item=>item.agreement_id===agreement.id);
  assert.equal(prices.length,2);
  assert.equal(prices.find(p=>p.type==='base')?.base_year,year);
  assert.equal(prices.find(p=>p.type==='heat')?.base_year,2023);
 }
 validateData(data);
 const again=importRows(book,data).result;
 assert.equal(again.report.review,0);
 assert.equal(again.clean.properties.length,1);
 assert.equal(again.clean.objects.length,2);
 assert.equal(again.clean.agreements.length,2);
 assert.equal(again.clean.parties.length,3);
 assert.equal(again.clean.people.length,1);
 assert.equal(again.clean.agreement_items.length,4);
});

test('the same manager name at different owner organizations is not merged without identity evidence',()=>{
 const one=record('1600-001','A1','Butiken AB','556001-1111',2025);
 const other=record('1601-001','B1','Caféet AB','556001-5555',2026);
 other[0]='1601';other[1]='BLÅKULLA 2';other[2]='Framgatan 6';
 other[8]='Andra Ägaren AB';other[9]='556001-4444';
 const result=importRows(build([one,other])).result;
 assert.equal(result.report.blocking,0);
 assert.equal(result.report.review,0);
 assert.equal(result.clean.parties.length,4);
 assert.equal(result.clean.people.length,2);
 assert(result.clean.people.every(p=>p.name==='Anna Testsson'));
 assert.equal(new Set(result.clean.people.map(p=>p.party_id)).size,2);
 assert.equal(result.clean.contacts.filter(c=>c.role==='owner').length,2);
});
test('a known organization number reuses one canonical party while preserving its registered name',()=>{
 const first=importRows(build([record('1600-001','A1','Butiken AB','556001-1111',2025)])).result;
 const conflict=record('1600-002','A2','Ett Annat Företag AB','556001-1111',2026);
 const second=importRows(build([conflict]),first.clean).result;
 assert.equal(second.clean.parties.filter(p=>p.organization_number==='556001-1111').length,1);
 assert.equal(second.report.blocking,0);
 assert.equal(second.clean.parties.find(p=>p.organization_number==='556001-1111').name,'Butiken AB');
 assert.equal(second.clean.agreements.find(a=>a.id==='A2').tenant_party_id,first.clean.agreements[0].tenant_party_id);
});
