import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openMemoryDatabase,createFreshDatabase,openExistingDatabase,objectVersionAt,agreementVersionsAt,resolvedStakeholders} from '../backend/lokaler/v3/database.js';
const exec=(db,q,...params)=>db.prepare(q).run(...params);
function fixture(db){
 exec(db,'INSERT INTO parties(id,name) VALUES (?,?)','owner','Fastighetsägare AB');
 exec(db,'INSERT INTO parties(id,name) VALUES (?,?)','tenant','Hyresgäst AB');
 exec(db,'INSERT INTO people(id,name) VALUES (?,?)','a','Anna');
 exec(db,'INSERT INTO people(id,name) VALUES (?,?)','b','Bengt');
 exec(db,'INSERT INTO people(id,name) VALUES (?,?)','c','Carina');
 exec(db,'INSERT INTO party_people(id,party_id,person_id,valid_from) VALUES (?,?,?,?)','pa','owner','a','2020-01-01');
 exec(db,'INSERT INTO party_people(id,party_id,person_id,valid_from) VALUES (?,?,?,?)','pb','owner','b','2020-01-01');
 exec(db,'INSERT INTO party_people(id,party_id,person_id,valid_from) VALUES (?,?,?,?)','pc','tenant','c','2020-01-01');
 exec(db,'INSERT INTO properties(id,name) VALUES (?,?)','p','Fastigheten');
 exec(db,'INSERT INTO objects(id,property_id,object_number) VALUES (?,?,?)','o','p','101');
 exec(db,'INSERT INTO object_versions(id,object_id,valid_from,area) VALUES (?,?,?,?)','v1','o','2020-01-01',200);
 exec(db,'INSERT INTO object_versions(id,object_id,valid_from,area) VALUES (?,?,?,?)','v2','o','2026-07-01',250);
 exec(db,'INSERT INTO agreements(id,agreement_number,object_id) VALUES (?,?,?)','ag','A-1','o');
 exec(db,'INSERT INTO agreement_versions(id,agreement_id,valid_from,legal_end_on) VALUES (?,?,?,?)','av1','ag','2022-01-01','2029-12-31');
 exec(db,'INSERT INTO agreement_versions(id,agreement_id,valid_from) VALUES (?,?,?)','av2','ag','2026-01-01');
 exec(db,'INSERT INTO stakeholder_assignments(id,property_id,role_code,party_id,valid_from) VALUES (?,?,?,?,?)','owner-property','p','owner','owner','2020-01-01');
 exec(db,'INSERT INTO stakeholder_assignments(id,property_id,role_code,party_id,person_id,valid_from) VALUES (?,?,?,?,?,?)','contact-property','p','owner_contact','owner','a','2020-01-01');
 exec(db,'INSERT INTO stakeholder_assignments(id,property_id,role_code,party_id,person_id,valid_from) VALUES (?,?,?,?,?,?)','coordinator-property','p','coordinator','owner','a','2020-01-01');
 exec(db,'INSERT INTO stakeholder_assignments(id,agreement_id,role_code,party_id,valid_from) VALUES (?,?,?,?,?)','tenant-contract','ag','tenant','tenant','2020-01-01');
 exec(db,'INSERT INTO stakeholder_assignments(id,object_id,role_code,party_id,person_id,valid_from) VALUES (?,?,?,?,?,?)','contact-object','o','owner_contact','owner','b','2025-01-01');
 exec(db,'INSERT INTO stakeholder_assignments(id,object_id,role_code,party_id,person_id,valid_from) VALUES (?,?,?,?,?,?)','tenant-object','o','tenant_contact','tenant','c','2020-01-01');
}
test('fresh v3 schema has exactly 21 domain tables, enforced foreign keys and no historical compatibility schema',()=>{
 const db=openMemoryDatabase();
 try{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name);
  assert.equal(tables.length,22);assert(tables.includes('stakeholder_assignments'));assert(tables.includes('object_versions'));
  assert(tables.includes('agreement_versions'));assert(!tables.includes('contacts'));
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>exec(db,"INSERT INTO objects(id,property_id,object_number) VALUES ('bad','missing','101')"),/FOREIGN KEY/);
 }finally{db.close();}
});
test('object identity persists and area is versioned by object number and start date',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  assert.equal(objectVersionAt(db,'o','2024-01-01').area,200);
  assert.equal(objectVersionAt(db,'o','2024-01-01').valid_to,'2026-06-30');
  assert.equal(objectVersionAt(db,'o','2026-10-27').area,250);
  assert.equal(objectVersionAt(db,'o','2019-01-01'),null);
  assert.throws(()=>exec(db,"INSERT INTO object_versions(id,object_id,valid_from,area) VALUES ('v3','o','2026-07-01',400)"),/UNIQUE/);
  assert.throws(()=>exec(db,"INSERT INTO objects(id,property_id,object_number) VALUES ('x','p','101')"),/UNIQUE/);
 }finally{db.close();}
});
test('latest dated agreement version is displayed once and earlier terms remain',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  assert.deepEqual(agreementVersionsAt(db,'2023-01-01').map(x=>x.version_id),['av1']);
  const current=agreementVersionsAt(db,'2026-10-27');
  assert.equal(current.length,1);assert.equal(current[0].version_id,'av2');
  assert.equal(current[0].period_status,'current');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM agreement_versions').get().n,2);
  assert.throws(()=>exec(db,"INSERT INTO agreement_versions(id,agreement_id,valid_from) VALUES ('av3','ag','2026-01-01')"),/UNIQUE/);
 }finally{db.close();}
});
test('part/person inherited by role and object override wins without copying',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  const property=resolvedStakeholders(db,{propertyId:'p'},'2026-10-27');
  assert.equal(property.owner_contact[0].personId,'a');
  const object=resolvedStakeholders(db,{objectId:'o'},'2026-10-27');
  assert.equal(object.owner_contact[0].personId,'b');assert.equal(object.owner_contact[0].inherited,false);
  assert.equal(object.coordinator[0].personId,'a');assert.equal(object.coordinator[0].inherited,true);
  assert.equal(object.tenant.length,0);
  const contract=resolvedStakeholders(db,{agreementId:'ag'},'2026-10-27');
  assert.equal(contract.owner_contact[0].personId,'b');assert.equal(contract.owner_contact[0].inherited,true);
  assert.equal(contract.tenant[0].partyId,'tenant');
  assert.equal(contract.tenant_contact[0].personId,'c');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stakeholder_assignments').get().n,6);
  assert.throws(()=>exec(db,"INSERT INTO stakeholder_assignments(id,agreement_id,role_code,party_id,person_id,valid_from) VALUES ('orphan','ag','tenant_contact','owner','c','2020-01-01')"),/Person saknar giltig partkoppling/);
  assert.throws(()=>exec(db,"INSERT INTO stakeholder_assignments(id,object_id,role_code,party_id,person_id,valid_from) VALUES ('bad','o','owner_contact','owner','a','2026-01-01')"),/Överlappande/);
 }finally{db.close();}
});
test('date scoped rents and cost evidence reject duplicate active base and annual actual',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  exec(db,"INSERT INTO agreement_items(id,agreement_id,type,name,base_amount,valid_from,valid_to) VALUES ('rent1','ag','base','Hyra',100000,'2020-01-01','2026-12-31')");
  assert.throws(()=>exec(db,"INSERT INTO agreement_items(id,agreement_id,type,name,base_amount,valid_from) VALUES ('rent2','ag','base','Hyra',110000,'2026-01-01')"),/Endast en bashyra/);
  exec(db,"INSERT INTO agreement_items(id,agreement_id,type,name,base_amount,valid_from) VALUES ('rent2','ag','base','Hyra',110000,'2027-01-01')");
  exec(db,"INSERT INTO recurring_costs(id,property_id,category,name,annual_amount) VALUES ('cost','p','heat','Värme',120000)");
  exec(db,"INSERT INTO cost_evidence(id,cost_id,type,year,amount) VALUES ('actual','cost','annual',2026,110000)");
  assert.throws(()=>exec(db,"INSERT INTO cost_evidence(id,cost_id,type,year,amount) VALUES ('actual2','cost','annual',2026,120000)"),/UNIQUE/);
  exec(db,"INSERT INTO budgets(id,property_id,budget_year,version) VALUES ('budget','p',2027,1)");
  exec(db,"INSERT INTO budget_lines(id,budget_id,cost_id,line_type,name,budget_amount) VALUES ('line','budget','cost','operating','Värme',125000)");
  exec(db,"UPDATE budgets SET status='locked',locked_at='2026-10-27' WHERE id='budget'");
  assert.throws(()=>exec(db,"UPDATE budget_lines SET budget_amount=1 WHERE id='line'"),/Låst budget/);
  assert.throws(()=>exec(db,"UPDATE budgets SET notes='ändrad' WHERE id='budget'"),/Låst budget/);
 }finally{db.close();}
});
test('completed inspection reports and their points are immutable',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  exec(db,"INSERT INTO spaces(id,object_id,name) VALUES ('space','o','Rum')");
  exec(db,"INSERT INTO building_parts(id,space_id,name) VALUES ('wall','space','Vägg')");
  exec(db,"INSERT INTO inspections(id,object_id,inspected_on,status) VALUES ('inspection','o','2026-10-27','draft')");
  exec(db,"INSERT INTO inspection_points(id,inspection_id,part_id,assessment) VALUES ('point','inspection','wall','good')");
  exec(db,"UPDATE inspections SET status='completed' WHERE id='inspection'");
  assert.throws(()=>exec(db,"UPDATE inspection_points SET assessment='urgent' WHERE id='point'"),/Avslutad besiktning/);
  assert.throws(()=>exec(db,"DELETE FROM inspections WHERE id='inspection'"),/Avslutad besiktning/);
 }finally{db.close();}
});
test('creator never overwrites or migrates an existing database',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'lokalblick-v3-'));const file=path.join(dir,'new.sqlite');
 try{
  const db=createFreshDatabase(file);db.close();
  assert.throws(()=>createFreshDatabase(file),/finns redan/);
  const reopened=openExistingDatabase(file);
  assert.equal(reopened.prepare('SELECT model_version FROM store_meta').get().model_version,3);
  reopened.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

// A party's industry/category is not its relationship. The same party can
// hold different roles on different records without duplicating its identity.
test('issue/order roles stay scoped; property owner and coordinator are inherited',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  exec(db,"INSERT INTO parties(id,name) VALUES ('contractor','Entreprenören AB')");
  exec(db,"INSERT INTO parties(id,name) VALUES ('supplier','Leverantören AB')");
  exec(db,"INSERT INTO issues(id,property_id,title) VALUES ('issue','p','Takåtgärd')");
  exec(db,"INSERT INTO orders(id,issue_id,title) VALUES ('order','issue','Takpannor')");
  exec(db,"INSERT INTO stakeholder_assignments(id,issue_id,role_code,party_id,valid_from) VALUES ('contractor-issue','issue','contractor','contractor','2026-01-01')");
  exec(db,"INSERT INTO stakeholder_assignments(id,order_id,role_code,party_id,valid_from) VALUES ('supplier-order','order','supplier','supplier','2026-01-01')");
  const issue=resolvedStakeholders(db,{issueId:'issue'},'2026-10-30');
  assert.equal(issue.owner[0].partyId,'owner');
  assert.equal(issue.owner[0].inherited,true);
  assert.equal(issue.contractor[0].partyId,'contractor');
  assert.equal(issue.supplier.length,0);
  const order=resolvedStakeholders(db,{orderId:'order'},'2026-10-30');
  assert.equal(order.supplier[0].partyId,'supplier');
  assert.equal(order.supplier[0].inherited,false);
  assert.equal(order.contractor[0].partyId,'contractor');
  assert.equal(order.contractor[0].inherited,true);
  assert.equal(order.coordinator[0].personId,'a');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stakeholder_assignments').get().n,8);
  assert.throws(()=>exec(db,"INSERT INTO stakeholder_assignments(id,property_id,role_code,party_id,valid_from) VALUES ('supplier-wrong','p','supplier','supplier','2026-01-01')"),/CHECK/);
 }finally{db.close();}
});
test('orders may belong directly to a property or an object without a fabricated issue',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  exec(db,"INSERT INTO orders(id,property_id,title) VALUES ('property-order','p','Driftmaterial')");
  exec(db,"INSERT INTO orders(id,object_id,title) VALUES ('object-order','o','Reparation')");
  assert.equal(resolvedStakeholders(db,{orderId:'property-order'},'2026-10-30').owner[0].partyId,'owner');
  assert.equal(resolvedStakeholders(db,{orderId:'object-order'},'2026-10-30').coordinator[0].personId,'a');
  assert.throws(()=>exec(db,"INSERT INTO orders(id,title) VALUES ('orphan','Saknar hemvist')"),/CHECK/);
  assert.throws(()=>exec(db,"INSERT INTO orders(id,object_id,property_id,title) VALUES ('duplicate-home','o','p','Fel')"),/CHECK/);
 }finally{db.close();}
});
test('several parties may share a contractor role without overwriting one another',()=>{
 const db=openMemoryDatabase();try{
  fixture(db);
  exec(db,"INSERT INTO parties(id,name) VALUES ('contractor','Entreprenören AB')");
  exec(db,"INSERT INTO issues(id,object_id,title) VALUES ('issue','o','Utredning')");
  exec(db,"INSERT INTO stakeholder_assignments(id,issue_id,role_code,party_id,valid_from,shared) VALUES ('a1','issue','consultant','owner','2026-01-01',1)");
  exec(db,"INSERT INTO stakeholder_assignments(id,issue_id,role_code,party_id,valid_from,shared) VALUES ('a2','issue','consultant','contractor','2026-01-01',1)");
  const roles=resolvedStakeholders(db,{issueId:'issue'},'2026-10-30').consultant;
  assert.equal(roles.length,2);
  assert.deepEqual(roles.map(x=>x.partyId).sort(),['contractor','owner']);
  assert.throws(()=>exec(db,"INSERT INTO stakeholder_assignments(id,issue_id,role_code,party_id,valid_from,shared) VALUES ('alone','issue','consultant','tenant','2026-01-01',0)"),/Överlappande/);
 }finally{db.close();}
});
