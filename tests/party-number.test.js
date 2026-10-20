import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,normalize,normalizeOrganizationNumber,validateData} from '../frontend/lokaler/model.js';
import {prepareCleanImport,importSchemas} from '../frontend/lokaler/import-model.js';
import {profileWorkbook} from '../frontend/services/import-engine.js';
import {mappingTemplate,setMappingRow} from '../frontend/services/import-matching.js';
import {collectWorkspace,projectWorkspace} from '../frontend/lokaler/view-adapter.js';
import {resolveImportChoices} from '../frontend/lokaler/import-conflicts.js';
import {applyLinkedPartyNumber} from '../frontend/v2/party-fields.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';
import {renderPropertyEditor} from '../frontend/v2/property-editor.js';
import {renderContractEditor} from '../frontend/v2/contract-editor.js';
function prepare(rows,base=emptyData(),adjust=()=>{}){const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),rows[0][0]==='PartID'?'Parter':'Avtal');const profiles=profileWorkbook(workbook,importSchemas,XLSX,base.workspace.importMappings||[],{reviewed:true});adjust(profiles);return {workbook,profiles,result:prepareCleanImport(workbook,profiles,base,{fileName:'parter-test.xlsx'},XLSX)};}
const rows=[['FastighetsID','Fastighetsnamn','Fastighetsägare','Orgnr fastighetsägare','ObjektID','AvtalsID','Hyresgäst','Orgnr hyresgäst'],['F1','Test 1','Testägare','0000010001','O1','A1','Testhyresgäst','000002-0002']];

test('mixed Excel rows place each organization number on the correct party, never on property or agreement',()=>{
 const {result,profiles}=prepare(rows);assert.equal(result.report.blocking,0);assert.equal(profiles[0].columns[2].target,'properties.ownerPartyId');assert.equal(profiles[0].columns[3].target,'properties.ownerOrganizationNumber');assert.equal(profiles[0].columns[7].target,'contracts.tenantOrganizationNumber');
 const data=result.clean,owner=data.parties.find(p=>p.id===data.properties[0].owner_party_id),tenant=data.parties.find(p=>p.id===data.agreements[0].tenant_party_id);assert.equal(owner.organization_number,'000001-0001');assert.equal(tenant.organization_number,'000002-0002');assert.equal(data.properties[0].organization_number,undefined);assert.equal(data.agreements[0].organization_number,undefined);
 const again=prepare(rows,data).result;assert.equal(again.clean.parties.length,2);assert.equal(again.clean.properties.length,1);assert.equal(again.clean.agreements.length,1);assert.equal(again.report.changes.length,0);
});
test('a single party can own multiple properties and be tenant without duplicate organization records',()=>{
 const {result}=prepare([...rows,['F2','Test 2','Annat namn på samma ägare','000001-0001','O2','A2','Testägare','0000010001']]);assert.equal(result.report.blocking,0);assert.equal(result.clean.parties.length,2);assert.equal(result.clean.properties[0].owner_party_id,result.clean.properties[1].owner_party_id);assert.equal(result.clean.agreements[1].tenant_party_id,result.clean.properties[0].owner_party_id);
});
test('later property/agreement-ID rows enrich existing party links and conflicting numbers stay reviewable',()=>{
 const first=prepare(rows).result.clean;
 const changed=prepare([['FastighetsID','AvtalsID','Orgnr fastighetsägare','Orgnr hyresgäst'],['F1','A1','0000030003','0000040004']],first).result;
 assert.equal(changed.report.blocking,0);assert.equal(changed.report.review,2);assert.equal(changed.clean.parties.length,2);
 const selected=resolveImportChoices(changed,{mode:'replace'});assert.equal(selected.report.review,0);assert.equal(selected.clean.parties.find(p=>p.name==='Testägare').organization_number,'000003-0003');assert.equal(selected.clean.parties.find(p=>p.name==='Testhyresgäst').organization_number,'000004-0004');
});
test('contradicting identities and malformed numbers roll back the source row',()=>{
 const first=prepare(rows).result.clean;
 for(const value of ['000002-0002','not-a-number']){const changed=structuredClone(rows);changed[1][3]=value;const result=prepare(changed,first).result;assert.equal(result.report.blocking,1);assert.equal(result.clean.parties.length,2);assert.equal(result.clean.properties[0].owner_party_id,first.properties[0].owner_party_id);}
 assert.equal(normalizeOrganizationNumber('000001 0001'),'000001-0001');assert.equal(normalizeOrganizationNumber(''),null);
 const duplicate=structuredClone(first);duplicate.parties[1].organization_number='0000010001';assert.throws(()=>validateData(duplicate),/Organisationsnumret finns flera gånger/);
});
test('context fields survive a mapping template and canonical workbook without duplicate facts',async()=>{
 const {workbook,profiles,result}=prepare(rows),template=mappingTemplate(workbook,profiles,importSchemas,XLSX);XLSX.utils.sheet_add_aoa(template.Sheets.Avtal,[rows[1]],{origin:'A3'});const ps=profileWorkbook(template,importSchemas,XLSX,[],{reviewed:true});setMappingRow(template,ps[0],true,importSchemas,XLSX);const again=prepareCleanImport(template,ps,emptyData(),{fileName:'mall.xlsx'},XLSX);assert.equal(again.report.blocking,0);assert.deepEqual(again.clean.parties.map(p=>p.organization_number),result.clean.parties.map(p=>p.organization_number));
 const restored=await readWorkbook(await writeWorkbook(result.clean));assert.deepEqual(restored.parties,result.clean.parties);
});
test('editing a linked number updates the shared party, leaves canonical home records clean and records history',()=>{
 const {result}=prepare(rows),view=projectWorkspace(result.clean),next={...view.properties[0],ownerOrganizationNumber:'0000050005'};applyLinkedPartyNumber(view,'properties',next,'Testare');view.properties[0]=next;
 const saved=collectWorkspace(view,result.clean);assert.equal(saved.parties.find(p=>p.id===saved.properties[0].owner_party_id).organization_number,'000005-0005');assert.equal(saved.properties[0].ownerOrganizationNumber,undefined);assert(saved.workspace.auditLog.some(e=>e.collection==='organizations'&&e.fields.some(f=>f.field==='organizationNumber')));
 assert.throws(()=>applyLinkedPartyNumber(view,'contracts',{...view.contracts[0],tenantOrganizationNumber:'0000050005'},'Testare'),/tillhör redan/);
});
test('ordinary party-register number input participates in matching, including numeric Excel cells',()=>{
 const {result}=prepare([['PartID','Namn','Organisationsnummer'],['P1','Testpart',1234567890]]);assert.equal(result.report.blocking,0);assert.equal(result.clean.parties[0].organization_number,'123456-7890');
});
test('context forms show each number once, allow any party to own a property and leave Budget forms unchanged',()=>{
 const data=projectWorkspace(prepare(rows).result.clean),property=data.properties[0],agreement=data.contracts[0];
 const propertyHtml=renderPropertyEditor(data,property,property.id,false,{portfolio:true});assert.equal((propertyHtml.match(/name="ownerOrganizationNumber"/g)||[]).length,1);assert.match(propertyHtml,new RegExp('value="'+agreement.tenantPartyId+'"'));
 const contractHtml=renderContractEditor(data,agreement,agreement.id,false,{portfolio:true});assert.equal((contractHtml.match(/name="tenantOrganizationNumber"/g)||[]).length,1);
 assert(!renderContractEditor(data,agreement,agreement.id,false,{portfolio:false}).includes('tenantOrganizationNumber'));assert(!renderPropertyEditor(data,property,property.id,false,{portfolio:false}).includes('ownerOrganizationNumber'));
});
