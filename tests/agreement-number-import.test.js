import test from 'node:test';import assert from 'node:assert/strict';import XLSX from 'xlsx';
import {emptyData,normalize,validateData} from '../frontend/lokaler/model.js';
import {importSchemas,prepareCleanImport} from '../frontend/lokaler/import-model.js';
import {profileTables} from '../frontend/services/import-matching.js';
import {columnPreviewHtml} from '../frontend/v2/import-mapping.js';
import {writeWorkbook,readWorkbook} from '../backend/lokaler/workbook.js';
const source=(headers,rows)=>{const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...rows]),'Avtal');return {workbook,profiles:profileTables(workbook,importSchemas,XLSX)};};
const run=(s,base=emptyData(),rowMatches={})=>prepareCleanImport(s.workbook,s.profiles,base,{fileName:'syntetiska-nummer.xlsx',rowMatches},XLSX);
const approve=p=>({[p.matchingKey]:{signature:p.signature,propertyId:p.matches[0].id}});
function fixture(){const b=emptyData();b.properties.push(normalize('properties',{id:'SF1213',name:'TESTET 1',address:'Testgatan 1'}));b.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:12345}}];return b;}

test('a three-part agreement number proposes its property and object in the existing approval list without saving either',()=>{
 const s=source(['Avtalsnummer','Bashyra'],[['SF1213-001-03',100000]]),pending=run(s),p=pending.report.linkProposals[0];
 assert.equal(pending.report.blocking,1);assert.equal(pending.clean.properties.length,0);assert.equal(pending.clean.objects.length,0);assert.equal(p.matches[0].id,'SF1213');assert.match(p.matches[0].detail,/Ny fastighet/);assert.deepEqual(p.records,[{label:'Objekt',value:'SF1213-001'},{label:'Avtal',value:'SF1213-001-03'}]);
 const r=run(s,emptyData(),approve(p));assert.equal(r.report.review,0);assert.equal(r.clean.properties[0].id,'SF1213');assert.deepEqual(r.clean.objects.map(o=>[o.id,o.property_id]),[['SF1213-001','SF1213']]);assert.equal(r.clean.agreements[0].id,'SF1213-001-03');assert.equal(r.clean.agreements[0].object_id,'SF1213-001');assert.equal(r.clean.agreement_items[0].agreement_id,'SF1213-001-03');validateData(r.clean);
 const html=columnPreviewHtml({fileName:'syntetiska-nummer.xlsx'},{profiles:s.profiles},pending,importSchemas);assert.match(html,/Uppdelat avtalsnummer/);assert.match(html,/Objekt SF1213-001 · Avtal SF1213-001-03/);assert.match(html,/data-approve-link="0"/);
});
test('numeric prefixes and leading zeroes are preserved; explicit matching property IDs still require object approval',()=>{
 const s=source(['FastighetsID','Avtalsnummer'],[['001213','001213-0001-03']]),pending=run(s),p=pending.report.linkProposals[0];assert.equal(p.matches[0].id,'001213');const r=run(s,emptyData(),approve(p));assert.equal(r.clean.objects[0].id,'001213-0001');assert.equal(r.clean.agreements[0].id,'001213-0001-03');
});
test('known properties and objects are reused and sequential lease periods keep one object',()=>{
 const b=fixture(),s=source(['Avtalsnummer','From','Tom'],[['SF1213-001-03','2027-01-01','2027-12-31'],['SF1213-001-04','2028-01-01','2028-12-31']]),pending=run(s,b),choices=Object.assign({},...pending.report.linkProposals.map(approve)),r=run(s,b,choices);
 assert.equal(r.report.blocking,0);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.properties.length,1);assert.equal(r.clean.agreements.length,2);assert(r.clean.agreements.every(a=>a.object_id==='SF1213-001'));assert.deepEqual(r.clean.workspace.budgetPlans,b.workspace.budgetPlans);
 const repeat=run(s,r.clean);assert.equal(repeat.report.linkProposals.length,0);assert.equal(repeat.clean.objects.length,1);assert.equal(repeat.report.review,0);
});
test('explicit IDs and previously linked agreements take precedence over the inferred number structure',()=>{
 const b=fixture();b.objects.push(normalize('objects',{id:'EXISTING',property_id:'SF1213'}));b.agreements.push(normalize('agreements',{id:'SF1213-001-03',object_id:'EXISTING'}));
 const linked=run(source(['Avtalsnummer'],[['SF1213-001-03']]),b);assert.equal(linked.report.linkProposals.length,0);assert.equal(linked.clean.agreements[0].object_id,'EXISTING');
 const explicit=run(source(['FastighetsID','ObjektID','Avtalsnummer'],[['SF1213','CUSTOM','SF1213-002-03']]),fixture());assert.equal(explicit.report.linkProposals.length,0);assert.equal(explicit.clean.objects[0].id,'CUSTOM');
 const mismatch=run(source(['FastighetsID','Avtalsnummer'],[['OTHER','SF1213-001-03']]));assert.equal(mismatch.report.linkProposals.length,0);assert.equal(mismatch.clean.objects[0].id,'OB-SF1213-001-03');assert.equal(mismatch.clean.objects[0].property_id,'OTHER');
});
test('an explicit object keeps its ID while a missing property is proposed from the agreement',()=>{
 const s=source(['ObjektID','Avtalsnummer'],[['CUSTOM','SF1213-001-03']]),pending=run(s),r=run(s,emptyData(),approve(pending.report.linkProposals[0]));assert.equal(r.report.review,0);assert.equal(r.clean.objects[0].id,'CUSTOM');assert.equal(r.clean.objects[0].property_id,'SF1213');
});
test('unclear numbers and date-shaped IDs keep the OB- rule without inferring another property',()=>{
 for(const id of ['5307-10030','ABC','1234567','1234-001-03 extra','2027-01-01']){const r=run(source(['FastighetsID','Avtalsnummer'],[['F1',id]]));assert.equal(r.report.linkProposals.length,0);assert.equal(r.clean.objects[0].id,'OB-'+id);}
});
test('inference cannot bypass conflicting addresses or existing object ownership',()=>{
 const b=fixture();b.properties.push(normalize('properties',{id:'OTHER',name:'ANNAT 1',address:'Annan gata 2'}));b.objects.push(normalize('objects',{id:'SF1213-001',property_id:'OTHER'}));
 const objectConflict=run(source(['Avtalsnummer'],[['SF1213-001-03']]),b);assert.equal(objectConflict.report.linkProposals.length,0);assert.equal(objectConflict.clean.agreements.length,0);assert.match(objectConflict.data.importReview[0].reason,/ObjektID.*annan fastighet/);
 const addressConflict=run(source(['Avtalsnummer','Adress'],[['SF1213-002-03','Annan gata 2']]),b);assert.equal(addressConflict.report.linkProposals.length,0);assert.equal(addressConflict.clean.agreements.length,0);assert.match(addressConflict.data.importReview[0].reason,/adress.*olika fastigheter/);
});
test('approvals are bound to the agreement structure, source contents and current object, and history survives Excel',async()=>{
 const b=fixture(),s=source(['Avtalsnummer'],[['SF1213-001-03']]),pending=run(s,b),choices=approve(pending.report.linkProposals[0]);
 const changed=run(source(['Avtalsnummer'],[['SF1213-002-03']]),b,choices);assert.equal(changed.clean.objects.length,0);
 const changedObject=structuredClone(b);changedObject.objects.push(normalize('objects',{id:'SF1213-001',property_id:'SF1213'}));assert.equal(run(s,changedObject,choices).clean.agreements.length,0);
 const accepted=run(s,b,choices),restored=await readWorkbook(await writeWorkbook(accepted.clean));assert.deepEqual(restored,JSON.parse(JSON.stringify(accepted.clean)));assert(restored.workspace.auditLog.some(e=>e.fields.some(f=>f.provenance?.matchingDecision?.method==='agreement-number-approved')));assert.equal(run(s,restored).report.linkProposals.length,0);
});

test('bulk approval creates one new property and one object for successive leases, even without other property columns',()=>{
 const s=source(['Avtalsnummer','From','Tom'],[['SF1213-001-03','2027-01-01','2027-12-31'],['SF1213-001-04','2028-01-01','2028-12-31']]),pending=run(s),choices=Object.assign({},...pending.report.linkProposals.map(approve)),r=run(s,emptyData(),choices);
 assert.equal(r.report.review,0);assert.equal(r.clean.properties.length,1);assert.equal(r.clean.objects.length,1);assert.equal(r.clean.agreements.length,2);assert.equal(r.report.linkProposals.filter(p=>p.approved).length,2);validateData(r.clean);
});
test('a known address with a different stored ID uses the existing address proposal and OB fallback without duplicating the property',()=>{
 const b=fixture(),s=source(['Avtalsnummer','Adress'],[['SF9999-001-03','Testgatan 1']]),pending=run(s,b),p=pending.report.linkProposals[0];assert.equal(p.matches[0].id,'SF1213');assert.equal(p.inferredIds,undefined);
 const r=run(s,b,approve(p));assert.equal(r.report.review,0);assert.equal(r.clean.properties.length,1);assert.equal(r.clean.objects[0].property_id,'SF1213');assert.equal(r.clean.objects[0].id,'OB-SF9999-001-03');validateData(r.clean);
});
