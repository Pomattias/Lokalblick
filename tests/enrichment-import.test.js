import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {emptyData,validateData} from '../frontend/lokaler/model.js';
import {profileWorkbook,readImportSource,mappingConflicts} from '../frontend/services/import-engine.js';
import {resolveFieldName,importIdentityWarnings,setMappingRow,suggestTableColumns,refreshTableProfile} from '../frontend/services/import-matching.js';
import {writeWorkbook,readWorkbook} from '../frontend/lokaler/workbook.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';

// Source captions, synthetic values only. Never retain the uploaded workbook.
function source(headers,rows,name='Lokaldata'){
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),name);return workbook;
}
const profiles=(workbook,saved=[])=>profileWorkbook(workbook,importSchemas,XLSX,saved,{reviewed:true});
const column=(profile,header)=>profile.columns.find(c=>c.header===header);
const selected=ps=>ps.map(p=>({...p,columns:p.columns.map(c=>c.target==='@unmapped'?{...c,target:'@ignore'}:c)}));
const run=(workbook,ps=profiles(workbook),base=emptyData())=>prepareCleanImport(workbook,selected(ps),base,{fileName:'syntetisk-berikning.xlsx'},XLSX);

test('EXT and SF captions map current agreement terms, owner and object area without copying original end dates',()=>{
 for(const name of ['EXT','SF']){
  const workbook=source(['Förvaltningsobjekt','Avtalsnummer','Fast.bet.','Gatuadress','Lev.namn','Area','Ursprungligt giltigt t.o.m.','Aktuellt giltigt t.o.m.','Förlängningstid','Uppsägningstid','Lokalkategori'],[['F1','A1','Test 1','Testgatan 1','Fiktiv ägare',120,'2025-12-31','2028-12-31',36,9,'Kontor']],name),ps=profiles(workbook),p=ps[0];
  assert.equal(p.primaryTable,'contracts');assert.equal(column(p,'Aktuellt giltigt t.o.m.').target,'contracts.end');assert.equal(column(p,'Ursprungligt giltigt t.o.m.').target,'@unmapped');assert.match(column(p,'Ursprungligt giltigt t.o.m.').warning,/Ursprunglig avtalstid/);
  const result=run(workbook,ps);assert.equal(result.report.blocking,0);assert.equal(result.clean.properties[0].management_object_number,'F1');assert.equal(result.clean.objects[0].property_id,result.clean.properties[0].id);assert.equal(result.clean.objects[0].area,120);assert.equal(result.clean.agreements[0].valid_to,'2028-12-31');assert.equal(result.clean.agreements[0].notice_months,9);assert.equal(result.clean.agreements[0].renewal_months,36);assert.equal(result.clean.agreements[0].eb_category,'Kontor');assert.equal(result.clean.parties[0].name,'Fiktiv ägare');
 }
});

test('property enrichment separates an owner name from a mislabelled telephone and links manager contact details',()=>{
 const workbook=source(['FastighetsID','Fastighetsbeteckning','Benämning','Postadress','Fastighetsägare','Fastighetsägare','Förvaltare','Förvaltare nr.','Email (förvaltare)'],[['F1','Test 1','Testhuset','Testgatan 1','Fiktiv ägare','040-1234567','Fiktiv Förvaltare','070-1234567','forvaltare@example.invalid']],'Fastighetslista'),ps=profiles(workbook),p=ps[0];
 assert.equal(p.primaryTable,'properties');assert.equal(p.columns[4].target,'properties.ownerPartyId');assert.equal(p.columns[5].target,'@unmapped');assert.match(p.columns[5].warning,/telefonnummer/);assert.equal(p.columns[7].target,'contact.6.phone');assert.equal(p.columns[8].target,'contact.6.email');assert.equal(mappingConflicts(ps).length,0);
 const result=run(workbook,ps);assert.equal(result.report.blocking,0);assert.equal(result.clean.properties[0].popular_name,'Testhuset');assert.equal(result.clean.people.length,1);assert.equal(result.clean.people[0].phone,'070-1234567');assert.equal(result.clean.people[0].email,'forvaltare@example.invalid');assert.equal(result.clean.people[0].party_id,result.clean.properties[0].owner_party_id);assert.equal(result.clean.contacts[0].person_id,result.clean.people[0].id);assert.equal(result.clean.contacts[0].property_id,'F1');
 const again=run(workbook,profiles(workbook,result.clean.workspace.importMappings),result.clean);assert.equal(again.clean.people.length,1);assert.equal(again.clean.contacts.length,1);assert.equal(again.report.review,0);
});

test('Lokalbestånd uses tenant party for verksamhet and keeps description, ownership and object area',async()=>{
 const workbook=source(['FastighetsID','Fastighetsbeteckning','ObjektID','Avtalsnummer','Verksamhet','Kommentar verksamhet','Fastighetsägare','Orgn.nr','Lokalyta (kvm)','Lägenheter (yta)','From','Tom'],[['F1','Test 1','O1','A1','Dagverksamhet','En beskrivande kommentar','Fiktiv ägare','0000000000','123,5',40,'2027-01-01','2029-12-31']],'Lokalbestånd '),ps=profiles(workbook),p=ps[0];
 assert.equal(p.primaryTable,'contracts');assert.equal(column(p,'Verksamhet').target,'contracts.tenantPartyId');assert.equal(column(p,'Kommentar verksamhet').target,'contracts.businessDescription');assert.equal(column(p,'Orgn.nr').target,'@unmapped');column(p,'Orgn.nr').target='properties.ownerOrganizationNumber';assert.equal(mappingConflicts(ps).length,0);
 const result=run(workbook,ps);assert.equal(result.report.blocking,0);assert.equal(result.clean.parties.find(p=>p.id===result.clean.agreements[0].tenant_party_id)?.name,'Dagverksamhet');assert.equal(result.clean.agreements[0].business_name,null);assert.equal(result.clean.agreements[0].business_description,'En beskrivande kommentar');assert.equal(result.clean.agreements[0].area,undefined);assert.equal(result.clean.objects[0].area,123.5);assert.equal(result.clean.objects[0].valid_from,null);assert.equal(result.clean.parties.find(p=>p.name==='Fiktiv ägare')?.organization_number,'000000-0000');
 const restored=await readWorkbook(await writeWorkbook(result.clean,ExcelJS),ExcelJS);assert.deepEqual(restored,JSON.parse(JSON.stringify(result.clean)));validateData(restored);
});

test('each monetary column becomes a separate item while indexed reports and included-service text need review',()=>{
 const workbook=source(['FastighetsID','Avtalsnummer','Grundhyra','Tillägg','Hyra 2026','Tillägg','F-skatt','f-skatt','Basår','Index procent','Värme','El','VA','Sopor'],[['F1','A1',100000,5000,110000,5500,1000,'Ja',2025,.94,'Ingår','Nej','Ja','Ingår']]),ps=profiles(workbook),p=ps[0];
 workbook.Sheets.Lokaldata.J2.z='0%';const refreshed=profiles(workbook)[0];
 assert.equal(column(p,'Grundhyra').target,'agreementItems.baseAmount');assert.equal(column(p,'Grundhyra').itemType,'base');assert.equal(column(p,'Hyra 2026').target,'@unmapped');assert.match(column(p,'Hyra 2026').warning,/redan vara uppräknat/);
 assert.deepEqual(p.columns.filter(c=>c.header==='Tillägg').map(c=>[c.target,c.itemType,c.itemKey]),[['agreementItems.baseAmount','addition','addition'],['agreementItems.baseAmount','addition','addition:2']]);
 for(const header of ['f-skatt','Värme','El','VA','Sopor']){assert.equal(column(p,header).target,'@unmapped');assert.match(column(p,header).warning,/inte belopp/);}
 assert.equal(column(p,'F-skatt').itemType,'tax');assert.equal(column(p,'Basår').itemType,'base');assert.equal(column(p,'Index procent').itemType,'base');assert.equal(mappingConflicts(ps).length,0);
 const result=run(workbook,[refreshed]);assert.equal(result.report.blocking,0);assert.equal(result.clean.agreement_items.length,4);assert.deepEqual(result.clean.agreement_items.filter(i=>i.type==='addition').map(i=>i.base_amount),[5000,5500]);const base=result.clean.agreement_items.find(i=>i.type==='base');assert.equal(base.base_amount,100000);assert.equal(base.reported_amount,null);assert.equal(base.index_share,.94);assert.equal(result.clean.agreement_items.find(i=>i.type==='tax').base_amount,1000);
});

test('numeric service columns use actual item categories and never become property expenses',()=>{
 const workbook=source(['FastighetsID','Avtalsnummer','Grundhyra','Värme','VA','El','Sopor'],[['F1','A1',100000,12000,5000,3000,1000]]),result=run(workbook);
 assert.equal(result.report.blocking,0);assert.deepEqual(result.clean.agreement_items.map(i=>i.type).sort(),['base','electricity','heat','waste','water']);assert.equal(result.clean.recurring_costs.length,0);assert(result.clean.agreement_items.every(i=>i.agreement_id==='A1'));
});

test('Årshjul identifies issues and warns about missing stable IDs and unexplained priority codes',()=>{
 const workbook=source(['Verksamhet','Namn på verksamheten','Adress','Vad ska göras','Kommentar','Prio ','Ansvarig','Betalas av fastighetsägaren','Kolumn1','Januari'],[['Verksamhet','Namn','Testgatan 1','Kontrollera ventilation','Fiktiv notering',1,'Fiktiv Samordnare','Ja','','']],'Årshjul'),p=profiles(workbook)[0];
 assert.equal(p.primaryTable,'activities');assert.equal(column(p,'Vad ska göras').target,'activities.title');assert.equal(column(p,'Kommentar').target,'activities.notes');assert.equal(column(p,'Ansvarig').target,'activities.responsiblePersonId');assert.equal(column(p,'Prio ').target,'@unmapped');assert.match(column(p,'Prio ').warning,/Numeriska koder/);assert.equal(column(p,'Verksamhet').target,'@unmapped');assert.equal(column(p,'Betalas av fastighetsägaren').target,'@unmapped');assert.equal(column(p,'Kolumn1').target,'@ignore');assert.equal(column(p,'Januari').target,'@ignore');assert.match(importIdentityWarnings(p,importSchemas).join(' '),/ÄrendeID/);
});

test('order captions propose order fields and show both missing order identity and issue relation before saving',()=>{
 const workbook=source(['Beställningsdatum','Produktnamn/beskrivning','Leverantör','Leveransdatum','Status (Enbart beställt eller klart)','Verksamhet','Kommentarer'],[['2027-01-01','Fiktiv beställning','Fiktiv leverantör','Vecka 5','Beställd','Dagverksamhet','En notering']],'Beställningar'),p=profiles(workbook)[0];
 assert.equal(p.primaryTable,'orders');assert.equal(column(p,'Beställningsdatum').target,'orders.orderedAt');assert.equal(column(p,'Produktnamn/beskrivning').target,'orders.title');assert.equal(column(p,'Leveransdatum').target,'orders.deliveryText');assert.equal(column(p,'Verksamhet').target,'@unmapped');assert.equal(column(p,'Kommentarer').target,'@unmapped');
 assert.match(importIdentityWarnings(p,importSchemas).join(' '),/BeställningsID.*ÄrendeID/);const result=run(workbook,[p]);const html=columnPreviewHtml({fileName:'syntetisk.xlsx'},{profiles:[p]},result,importSchemas);assert.match(html,/Koppla BeställningsID/);assert.match(html,/Beställningarna behöver ÄrendeID/);
});

test('existing issue and order IDs import their source statuses through current model labels',()=>{
 const issues=source(['ÄrendeID','FastighetsID','Fastighetsnamn','Vad ska göras','Kommentar','Prio'],[['I1','F1','Test 1','Kontrollera ventilation','Fiktiv notering','Hög']],'Årshjul'),first=run(issues);
 assert.equal(first.report.blocking,0);assert.equal(first.clean.issues[0].priority,'high');assert.equal(first.clean.issues[0].notes,'Fiktiv notering');assert.equal(importIdentityWarnings(profiles(issues)[0],importSchemas).length,0);
 const workbook=source(['BeställningsID','ÄrendeID','Produktnamn/beskrivning','Beställningsdatum','Status (Enbart beställt eller klart)'],[['B1','I1','Fiktiv leverans','2027-01-01','Klart'],['B2','I1','Ytterligare leverans','2027-01-02','Beställt']],'Beställningar'),ps=profiles(workbook),result=run(workbook,ps,first.clean);
 assert.equal(importIdentityWarnings(ps[0],importSchemas).length,0);assert.equal(result.report.blocking,0);assert.deepEqual(result.clean.orders.map(o=>o.status),['done','ordered']);assert(result.clean.orders.every(o=>o.issue_id==='I1'));assert.equal(result.clean.orders[0].ordered_at,'2027-01-01');validateData(result.clean);
});

test('a property reference identifies name enrichment in mixed object rows; conflicting references reject atomically',()=>{
 const workbook=source(['ObjektID','FastighetsID','Fastighetsnamn','Area'],[['O1','F1','Test 1',100]],'Objekt'),p=profiles(workbook)[0],first=run(workbook,[p]);
 assert.equal(p.primaryTable,'objects');assert.equal(column(p,'FastighetsID').target,'objects.propertyId');assert.equal(first.report.blocking,0);assert.equal(first.clean.properties[0].id,'F1');assert.equal(first.clean.properties[0].name,'Test 1');assert.equal(first.clean.objects[0].property_id,'F1');
 const bad=source(['properties.id','properties.designation','objects.id','objects.propertyId'],[['F1','Test 1','O1','F2']],'Objekt'),result=run(bad);
 assert.equal(result.report.blocking,1);assert.match(result.clean.workspace.importReview[0].reason,/pekar på olika fastigheter/);assert.equal(result.clean.properties.length,0);assert.equal(result.clean.objects.length,0);
});

test('management object captions identify properties and dotted object abbreviations still identify objects',()=>{
 const workbook=source(['Fastighetsbeteckning','Avtalsnummer','Objektsnummer / Förvaltningsobjekt','Objekt. nr'],[['Test 1','A1','F1','O1']],'Lokalbestånd'),p=profiles(workbook)[0];
 assert.equal(column(p,'Objektsnummer / Förvaltningsobjekt').target,'properties.managementObjectNumber');assert.equal(column(p,'Objekt. nr').target,'objects.id');assert.equal(resolveFieldName('Objekt. nr',importSchemas,'properties').target,'objects.id');
});

test('approved rules and explicit rows outrank new contextual proposals and can resolve duplicate captions',()=>{
 const workbook=source(['FastighetsID','Avtalsnummer','Grundhyra','Tillägg','Tillägg'],[['F1','A1',100000,5000,5500]]),ps=profiles(workbook);ps[0].columns[3].target='agreementItems.baseAmount';ps[0].columns[3].itemType='addition';ps[0].columns[4].target='@ignore';
 const first=run(workbook,ps),again=profiles(workbook,first.clean.workspace.importMappings)[0];assert.equal(again.columns[3].itemType,'addition');assert.equal(again.columns[4].target,'@ignore');assert.equal(mappingConflicts([again]).length,0);
 const explicit=source(['F','A','Hyra 2026'],[['Fastighet.FastighetsID','Avtal.AvtalsID','Avtal.Bashyra'],['F1','A1',100000]]),p=profiles(explicit)[0];setMappingRow(explicit,p,true,importSchemas,XLSX);suggestTableColumns(p,importSchemas);assert.equal(p.columns[2].target,'agreementItems.baseAmount');assert.equal(p.columns[2].itemType,'base');
});

test('model removals remove contextual suggestions too, and optional contact columns require their selected role',()=>{
 const schemas=structuredClone(importSchemas),properties=schemas.find(s=>s.key==='properties');properties.columns=properties.columns.filter(([key])=>!['popularName','ownerOrganizationNumber','ownerResponsiblePersonId'].includes(key));
 const workbook=source(['FastighetsID','Fastighetsbeteckning','Benämning','Fastighetsägare','Orgn.nr','Email (förvaltare)'],[['F1','Test 1','Testhuset','Fiktiv ägare','0000000000','kontakt@example.invalid']],'Fastighetslista'),p=profileWorkbook(workbook,schemas,XLSX,[],{reviewed:true})[0];
 assert.equal(column(p,'Benämning').target,'@unmapped');assert.equal(column(p,'Orgn.nr').target,'@unmapped');assert.equal(column(p,'Email (förvaltare)').target,'@unmapped');
 p.columns[2].target='@ignore';p.columns[2].approved=true;refreshTableProfile(workbook,p,schemas,XLSX);suggestTableColumns(p,schemas);assert.equal(p.columns[2].target,'@ignore');
});

test('existing range trimming handles a near-million-row sheet and far-right formatting without losing real data',()=>{
 const workbook=source(['FastighetsID','Fastighetsnamn'],[['F1','Test 1']],'Fastighetslista'),sheet=workbook.Sheets.Fastighetslista;sheet['!ref']='A1:XFC1048567';sheet.XFC1048567={t:'z'};
 const trimmed=readImportSource({workbook,buffer:new Uint8Array()},workbook.SheetNames,XLSX);assert.equal(trimmed.Sheets.Fastighetslista['!ref'],'A1:B2');const p=profiles(trimmed)[0];assert.equal(p.rowCount,1);assert.equal(p.columns.length,2);assert.equal(run(trimmed,[p]).clean.properties[0].name,'Test 1');
});
