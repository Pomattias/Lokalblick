import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { LocalStore } from '../backend/lokaler/store.js';
import { writeWorkbook, readWorkbook } from '../backend/lokaler/workbook.js';
import { createServer } from '../backend/lokaler/server.mjs';
import { coordinator, propertySummary, normalize, emptyData, tables, active } from '../frontend/lokaler/model.js';
const fixtures = () => [
 { table: 'parties', record: { id: 'PAR1', name: 'Fiktiv part' } },
 { table: 'people', record: { id: 'PER1', name: 'Fiktiv samordnare', email: 'example@example.invalid' } },
 { table: 'people', record: { id: 'PER2', name: 'Fiktiv ersättare' } },
 { table: 'properties', record: { id: 'FAS1', name: 'Testfastighet', popular_name: 'Testhuset', owner_party_id: 'PAR1' } },
 { table: 'objects', record: { id: 'OBJ1', property_id: 'FAS1', area: 100, apartment_count: 2 } },
 { table: 'objects', record: { id: 'OBJ2', property_id: 'FAS1', area: 50 } },
 { table: 'agreements', record: { id: '9(1)', object_id: 'OBJ1', valid_from: '2025-01-01', valid_to: '2025-12-31' } },
 { table: 'agreements', record: { id: '91,1', object_id: 'OBJ1', valid_from: '2026-01-01' } },
 {table:'agreement_items',record:{id:'base2025',agreement_id:'9(1)',type:'base',name:'Bashyra',base_amount:100000,valid_from:'2025-01-01',valid_to:'2025-12-31'}},
 {table:'agreement_items',record:{id:'base2026',agreement_id:'91,1',type:'base',name:'Bashyra',base_amount:120000,valid_from:'2026-01-01'}},
 { table: 'issues', record: { id: 'ARE1', object_id: 'OBJ1', title: 'Fiktivt ärende' } },
 { table: 'orders', record: { id: 'BES1', issue_id: 'ARE1', title: 'Fiktiv beställning' } },
 { table: 'contacts', record: { id: 'KOP1', role: 'coordinator', person_id: 'PER1', property_id: 'FAS1' } }
];
async function withStore(run, mode = 'sqlite') {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'lokaler-test-'));
 let store = await LocalStore.open({ file: path.join(dir, mode === 'excel' ? 'data.xlsx' : 'data.sqlite'), mode });
 try { await run(store, dir, async () => { const { file } = store; await store.close(); store = await LocalStore.open({ file, mode }); return store; }); }
 finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
}
test('ren modell: yta bara på objekt, obligatoriska kopplingar och verkliga datum', () => {
 assert.equal(tables.agreements.fields.some(f => /area|apartment/.test(f.key)), false);
 assert.equal(tables.objects.fields.some(f => /number|room/.test(f.key)), false);
 assert.equal(normalize('issues', { id: 'x', title: 'Test' }).property_id,null);
 assert.throws(() => normalize('issues', { id: 'x', title: 'Test', property_id: 'p', object_id: 'o' }), /antingen/);
 assert.throws(() => normalize('objects', { id: 'x', property_id: 'p', valid_from: '2026-02-30' }), /giltigt datum/);
 assert.throws(() => normalize('agreements', { id: 'x', object_id: 'o', number: 'n', area: 10 }), /finns inte/);
 assert.throws(() => normalize('contacts', { id: 'x', person_id: 'p', role: 'owner', agreement_id: 'a' }), /fastigheten/);
 assert.equal(normalize('objects', { id: 'OBJ,1', property_id: 'p', area: '1 234,5' }).area, 1234.5);
 assert.equal(active({ valid_from: '2026-01-01', valid_to: '2026-01-31' }, '2026-01-31'), true);
});
test('databas: persistens, exakta avtalsnummer och summering av unika objekt inklusive vakans', async () => withStore(async (store, dir, reopen) => {
 await store.mutate(fixtures(), 0);
 const state = store.snapshot();
 assert.deepEqual(state.data.agreements.map(a => a.id), ['9(1)', '91,1']);
 const totals = propertySummary(state.data, 'FAS1', '2026-10-19');
 assert.equal(totals.area, 150); assert.equal(totals.apartments, 2); assert.equal(totals.annualRent, 120000);
 const reopened = await reopen(); assert.equal(reopened.snapshot().version, 1); assert.deepEqual(reopened.snapshot().data, state.data);
}));
test('databas: avtal får inte överlappa eller lämna objektets period', async () => withStore(async store => {
 await store.mutate(fixtures(), 0);
 await assert.rejects(store.mutate([{ table: 'agreements', record: { id: '91', object_id: 'OBJ1', valid_from: '2026-01-01' } }], 1), /redan ett avtal/);
 const object = store.snapshot().data.objects[0];
 await assert.rejects(store.mutate([{ table: 'objects', record: { ...object, valid_from: '2026-01-01' } }], 1), /rymma/);
 assert.equal(store.snapshot().data.agreements.length, 2); assert.equal(store.snapshot().version, 1);
}));
test('databas: arv order → ärende → fastighet utan kopierad person', async () => withStore(async store => {
 await store.mutate(fixtures(), 0);
 let data = store.snapshot().data;
 assert.equal(coordinator(data, 'orders', data.orders[0], '2026-10-19').person.id, 'PER1');
 assert.equal(coordinator(data, 'orders', data.orders[0], '2026-10-19').via, 'properties');
 await store.mutate([{ table: 'contacts', record: { id: 'KOP2', role: 'coordinator', person_id: 'PER2', issue_id: 'ARE1', valid_from: '2026-01-01', valid_to: '2026-12-31' } }], 1);
 data = store.snapshot().data;
 assert.equal(coordinator(data, 'orders', data.orders[0], '2026-10-19').person.id, 'PER2');
 assert.equal(coordinator(data, 'orders', data.orders[0], '2027-01-01').person.id, 'PER1');
 assert.equal(data.orders[0].person_id, undefined); assert.equal(data.contacts.filter(c => c.order_id).length, 0);
 await assert.rejects(store.mutate([{ table: 'contacts', record: { id: 'KOP3', role: 'coordinator', person_id: 'PER1', issue_id: 'ARE1' } }], 2), /överlappar/);
}));
test('databas: en trasig hänvisning rullar tillbaka hela ändringen; samtidiga versioner stoppas', async () => withStore(async store => {
 await assert.rejects(store.mutate([{ table: 'parties', record: { id: 'p', name: 'Test' } }, { table: 'objects', record: { id: 'o', property_id: 'saknas' } }], 0), /hänvisning/);
 assert.equal(store.snapshot().data.parties.length, 0);
 const outcomes = await Promise.allSettled([store.mutate(fixtures(), 0), store.mutate(fixtures(), 0)]);
 assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
 assert.match(outcomes.find(r => r.status === 'rejected').reason.message, /ändrats/);
 await assert.rejects(store.mutate([{ table: 'properties', create: true, record: { id: 'FAS1', name: 'Dublett' } }], 1), /ID finns/);
}));
test('databas: delning/sammanslagning bevarar nya ID:n och förhindrar dubbel yta i tiden', async () => withStore(async store => {
 const first = fixtures().filter(op => !['agreements', 'agreement_items', 'contacts', 'issues', 'orders'].includes(op.table));
 await store.mutate(first, 0);
 const old = store.snapshot().data.objects.find(o => o.id === 'OBJ1');
 await store.mutate([
  { table: 'objects', record: { ...old, valid_to: '2026-10-31' } },
  { table: 'objects', record: { id: 'OBJ3', property_id: 'FAS1', area: 40, valid_from: '2026-11-01' } },
  { table: 'objects', record: { id: 'OBJ4', property_id: 'FAS1', area: 60, valid_from: '2026-11-01' } },
  { table: 'object_links', record: { id: 'L1', predecessor_id: 'OBJ1', successor_id: 'OBJ3' } },
  { table: 'object_links', record: { id: 'L2', predecessor_id: 'OBJ1', successor_id: 'OBJ4' } }
 ], 1);
 assert.equal(propertySummary(store.snapshot().data, 'FAS1', '2026-11-01').area, 150);
 await assert.rejects(store.mutate([{ table: 'object_links', record: { id: 'bad', predecessor_id: 'OBJ3', successor_id: 'OBJ1' } }], 2), /slutdatum/);
}));
test('Excel: samma modell, beständig arbetsfil och backup utan extra databas', async () => withStore(async (store, dir, reopen) => {
 await store.mutate(fixtures(), 0);
 const bytes = await readFile(store.file);
 const excel = await readWorkbook(bytes);
 assert.equal(excel.agreements[1].id, '91,1'); assert.equal(excel.objects[0].area, 100);
 assert.equal(excel.agreements[0].area, undefined); assert.equal(excel.contacts[0].person_id, 'PER1');
 assert.ok((await readFile(store.file + '.bak')).length);
 const reopened = await reopen(); assert.equal(reopened.snapshot().data.objects.length, 2);
 assert.equal(reopened.db.location(), null);
}, 'excel'));
test('Excel: extern ändring skrivs aldrig över och databastransaktionen återställs', async () => withStore(async store => {
 await store.mutate(fixtures(), 0);
 const external = await readWorkbook(await readFile(store.file));
 external.properties[0].popular_name = 'Ändrat utanför appen';
 const bytes = await writeWorkbook(external); await writeFile(store.file, bytes);
 await assert.rejects(store.mutate([{ table: 'properties', record: { ...store.snapshot().data.properties[0], name: 'Oönskad överskrivning' } }], 1), /utanför appen/);
 assert.equal(store.snapshot().data.properties[0].name, 'Testfastighet');
 assert.deepEqual(await readFile(store.file), bytes);
}, 'excel'));
test('Excel: mall fungerar tom och saknade tabeller/formler avvisas', async () => {
 assert.deepEqual(await readWorkbook(await writeWorkbook(emptyData())), emptyData());
 const { default: ExcelJS } = await import('exceljs');
 const book = new ExcelJS.Workbook(); await book.xlsx.load(await writeWorkbook(emptyData()));
 book.getWorksheet('Fastigheter').addRow(['P', { formula: '1+1', result: 2 }]);
 await assert.rejects(readWorkbook(await book.xlsx.writeBuffer()), /formler/);
 book.removeWorksheet('Objekt');
 // Formula is still rejected first; neither error silently imports data.
 await assert.rejects(readWorkbook(await book.xlsx.writeBuffer()));
});
test('lokalt API: lagring till svar, export, inga öppna CORS-anrop och versionskonflikt', async () => withStore(async store => {
 const server = createServer(store); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + server.address().port;
 try {
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);assert.equal(typeof(await health.json()).geocoding.configured,'boolean');
  const response = await fetch(base + '/api/lokaler/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 0, operations: fixtures() }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).data.properties.length, 1);
  assert.equal((await (await fetch(base + '/api/lokaler')).json()).version, 1);
  assert.equal((await fetch(base + '/api/lokaler', { headers: { Origin: 'https://foreign.invalid' } })).status, 403);
  assert.equal(await new Promise((resolve, reject) => { const req = http.get(base + '/api/lokaler', { headers: { Host: 'evil.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); }), 403);
  assert.equal((await fetch(base + '/api/lokaler/changes', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(base + '/api/lokaler/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 0, operations: fixtures() }) })).status, 409);
  const exported = await fetch(base + '/api/lokaler/workbook'); assert.equal(exported.status, 200);
  assert.equal((await readWorkbook(Buffer.from(await exported.arrayBuffer()))).people.length, 2);
  const html = await fetch(base + '/frontend/lokaler/'); assert.match(await html.text(), /<title>Lokalblick<\/title>/);
  assert.equal((await fetch(base + '/api/not-a-route')).status, 404);
 } finally { await new Promise(resolve => server.close(resolve)); }
}));

test('en tidigare eller annan databas öppnas inte och förblir orörd', async () => {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'lokaler-foreign-'));
 const file = path.join(dir, 'previous.sqlite');
 try {
  const db = new DatabaseSync(file); db.exec("CREATE TABLE previous_data (name TEXT); INSERT INTO previous_data VALUES ('synthetic')"); db.close();
  const before = await readFile(file);
  await assert.rejects(LocalStore.open({ file }), /ny tom fil/);
  assert.deepEqual(await readFile(file), before);
 } finally { await rm(dir, { recursive: true, force: true }); }
});

test('hela den rena arbetsytan och Budgetmetadata sparas atomärt med versionsskydd', async () => withStore(async (store, dir, reopen) => {
 await store.mutate(fixtures(),0);
 const input=store.snapshot().data;input.workspace={budgetPlans:[{year:2027,locked:true,rows:[{id:'B',amount:1234}]}],currentUser:{name:'Testare'}};
 await store.replace(input,1);const saved=store.snapshot();
 const bad=structuredClone(input);bad.objects[0].property_id='saknas';
 await assert.rejects(store.replace(bad,2),/hänvisar/);assert.deepEqual(store.snapshot(),saved);
 await assert.rejects(store.replace(input,1),/ändrats/);
 const reopened=await reopen();assert.deepEqual(reopened.snapshot().data.workspace,input.workspace);
}));
test('långa Budgetanteckningar med emoji överlever verklig Excel-serialisering', async () => {
 const data=emptyData();data.workspace={budgetPlans:[{year:2027,notes:'text😀'.repeat(12000)}]};
 const loaded=await readWorkbook(await writeWorkbook(data));assert.deepEqual(loaded.workspace,data.workspace);
});
