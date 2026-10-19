import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { LocalStore } from '../backend/lokaler/store.js';
import { createServer } from '../backend/lokaler/server.mjs';
import { readWorkbook, writeWorkbook } from '../backend/lokaler/workbook.js';
const artifacts = '/tmp/lokalblick-lokaler-check';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.LOKALBLICK_CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
async function scenario(mode) {
 const dir = await mkdtemp(path.join(os.tmpdir(), 'lokaler-browser-'));
 const store = await LocalStore.open({ file: path.join(dir, mode === 'excel' ? 'data.xlsx' : 'data.sqlite'), mode: mode === 'browser-excel' ? 'sqlite' : mode });
 const server = createServer(store);
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = 'http://127.0.0.1:' + server.address().port;
 const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
 page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure()?.errorText));
 await page.addInitScript(() => {
  const NativeDate = Date;
  window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-19T12:00:00Z'])); } static now() { return NativeDate.parse('2026-10-19T12:00:00Z'); } };
 });
 const navigate = async table => {
  await page.locator('nav a').filter({ hasText: new RegExp('^' + ({ properties: 'Fastigheter', objects: 'Objekt', agreements: 'Avtal', issues: 'Ärenden', orders: 'Beställningar', people: 'Personer', parties: 'Parter', storage: 'Lagring' })[table] + '$') }).click();
  await page.locator('nav a[aria-current=page]').waitFor();
 };
 const save = async () => {
  if (mode === 'browser-excel') {
   await page.locator('#record-form [type=submit]').click();
   await page.locator('#editor').waitFor({ state: 'hidden' });
   assert.equal(await page.locator('#form-error').textContent(), '');
   return;
  }
  const [response] = await Promise.all([page.waitForResponse(res => res.url().endsWith('/api/lokaler/changes') && res.request().method() === 'POST'), page.locator('#record-form [type=submit]').click()]);
  assert.equal(response.status(), 200, await response.text());
  await page.locator('#editor').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#form-error').textContent(), '');
  assert.equal(await page.locator('#editor').evaluate(node => node.open), false);
 };
 const create = async (table, fields) => {
  await navigate(table); await page.locator('[data-action=create]').click();
  for (const [key, value] of Object.entries(fields)) await page.locator('#record-form [name=' + key + ']').fill(value);
  await save();
 };
 const closeDetail = () => page.locator('[data-action=close-detail]').click();
 const currentData = async () => {
  if (mode !== 'browser-excel') return (await (await fetch(base + '/api/lokaler')).json()).data;
  const bytes = await page.evaluate(async () => { const dir = await navigator.storage.getDirectory(); const file = await (await dir.getFileHandle('browser-test.xlsx')).getFile(); return Array.from(new Uint8Array(await file.arrayBuffer())); });
  return readWorkbook(Buffer.from(bytes));
 };
 try {
  if (mode === 'browser-excel') await page.addInitScript(() => {
   window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('browser-test.xlsx', { create: true });
   window.showOpenFilePicker = async () => [await (await navigator.storage.getDirectory()).getFileHandle('browser-test.xlsx')];
  });
  await page.goto(base + (mode === 'browser-excel' ? '/?demo=1' : ''));
  if (mode === 'browser-excel') { await page.locator('[data-action=new-excel]').click(); await page.locator('.demo-note').waitFor({ state: 'hidden' }); }
  await page.getByRole('heading', { name: 'Fastigheter', exact: true }).waitFor();
  assert.equal(await page.locator('.demo-note').count(), 0);
  await create('parties', { name: 'Fiktiv organisation' });
  await create('people', { name: 'Fiktiv samordnare', email: 'samordnare@example.invalid' });
  await create('people', { name: 'Fiktiv ärendeansvarig' });
  let state = await currentData();
  await navigate('properties'); await page.locator('[data-action=create]').click();
  await page.locator('[name=name]').fill('Testfastigheten');
  await page.locator('[name=popular_name]').fill('Exempelhuset');
  await page.locator('[name=address]').fill('Fiktiv väg 1');
  await page.locator('[name=owner_party_id]').selectOption(state.parties[0].id); await save();
  await page.locator('#rows a').first().click();
  await page.locator('[data-action=child][data-table=objects]').click();
  await page.locator('[name=name]').fill('Testlokal');
  await page.locator('[name=area]').fill('250');
  await page.locator('[name=apartment_count]').fill('2'); await save();
  assert.match(await page.locator('#detail').innerText(), /250 m²/);
  await page.locator('[data-action=contact]').click();
  await page.locator('[name=person_id]').selectOption(state.people[0].id); await save();
  await closeDetail(); await page.locator('[data-action=expand]').click();
  assert.equal(await page.locator('.expanded').count(), 1);
  await page.locator('.expanded a').first().click();
  await page.locator('[data-action=child][data-table=agreements]').click();
  await page.locator('[name=number]').fill('91,1');
  await page.locator('[name=tenant_party_id]').selectOption(state.parties[0].id);
  await page.locator('[name=annual_rent]').fill('200000');
  await page.locator('[name=valid_from]').fill('2026-01-01');
  await page.locator('[name=valid_to]').fill('2029-12-31');
  assert.equal(await page.locator('#record-form [name=area]').count(), 0); await save();
  await closeDetail(); await navigate('agreements');
  await page.locator('#rows a').filter({ hasText: 'Avtal 91,1' }).click();
  assert.match(await page.locator('#detail').innerText(), /800/);
  assert.match(await page.locator('#detail').innerText(), /2026-01-01 – 2029-12-31/);
  assert.equal(await page.locator('#detail summary').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).fontSize === '12px')), true);
  await closeDetail(); await navigate('properties'); await page.locator('#rows a').first().click();
  await page.locator('[data-action=child][data-table=issues]').click();
  await page.locator('[name=title]').fill('Utred belysning');
  await page.locator('[name=description]').fill('Fiktiv beskrivning');
  await page.locator('[name=target_kind]').selectOption('objects');
  assert.equal(await page.locator('[name=title]').inputValue(), 'Utred belysning');
  state = await currentData();
  await page.locator('[name=target_id]').selectOption(state.objects[0].id);
  await page.locator('[name=priority]').selectOption('high');
  await page.locator('[name=status]').selectOption('ongoing');
  await page.locator('[name=estimated_cost]').fill('45000');
  await page.locator('[name=planned_from]').fill('2026-11-01');
  await page.locator('[name=planned_to]').fill('2026-11-30');
  await page.locator('[name=notes]').fill('Fiktiv notering'); await save();
  await page.locator('#detail a').filter({ hasText: 'Utred belysning' }).click();
  assert.match(await page.locator('#detail').innerText(), /Via fastigheten/);
  assert.equal(await page.locator('#detail .chip.high').count(), 1);
  await page.locator('[data-action=child][data-table=orders]').click();
  await page.locator('[name=title]').fill('Inventera belysningen');
  await page.locator('[name=amount]').fill('5000'); await save();
  await page.locator('#detail a').filter({ hasText: 'Inventera belysningen' }).click();
  assert.match(await page.locator('#detail').innerText(), /Fiktiv samordnare/);
  await closeDetail(); await navigate('issues'); await page.locator('#rows a').first().click();
  await page.locator('#detail summary').filter({ hasText: 'Personkopplingar' }).click();
  await page.locator('[data-action=contact]').click();
  await page.locator('[name=person_id]').selectOption(state.people[1].id); await save();
  await closeDetail(); await navigate('orders'); await page.locator('#rows a').first().click();
  assert.match(await page.locator('#detail').innerText(), /Fiktiv ärendeansvarig/);
  assert.match(await page.locator('#detail').innerText(), /Via ärendet/);
  await closeDetail(); await navigate('properties');
  await page.locator('[name=q]').fill('Hittas inte'); assert.equal(await page.locator('#rows tbody').count(), 0);
  await page.locator('[name=q]').fill('Testfastigheten'); assert.equal(await page.locator('#rows tbody').count(), 1);
  await page.locator('[name=q]').fill('');
  await page.screenshot({ path: path.join(artifacts, mode + '-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const table of ['properties', 'objects', 'agreements', 'issues', 'people', 'orders', 'storage']) {
   await navigate(table); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, table + ': no overflow');
  }
  await navigate('issues'); await page.locator('#rows a').first().click();
  await page.screenshot({ path: path.join(artifacts, mode + '-mobile-issue.png'), fullPage: true });
  assert.equal(await page.locator('#detail').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await page.locator('[data-action=edit]').first().click();
  assert.equal(await page.locator('#editor').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await page.locator('[data-action=close-editor]').first().click(); await closeDetail();
  await page.reload();
  if (mode === 'browser-excel') { await page.locator('[data-action=open-excel]').click(); await page.locator('.demo-note').waitFor({ state: 'hidden' }); await navigate('issues'); }
  await page.locator('#rows').waitFor();
  assert.match(await page.locator('#rows').innerText(), /Utred belysning/);
  const final = await currentData();
  assert.equal(final.properties.length, 1); assert.equal(final.objects.length, 1); assert.equal(final.agreements.length, 1);
  assert.equal(final.contacts.length, 2); assert.equal(final.orders[0].person_id, undefined);
  if (mode === 'browser-excel') assert.equal(store.snapshot().data.properties.length, 0, 'Browser Excel does not send records to the API');
  if (mode === 'excel') assert.equal((await readWorkbook(await readFile(store.file))).agreements[0].number, '91,1');
  if (mode === 'browser-excel') {
   await page.locator('#rows a').first().click(); await page.locator('[data-action=edit]').first().click();
   await page.locator('[name=title]').fill('Skall inte skrivas över');
   const external = structuredClone(final); external.properties[0].name = 'Extern ändring';
   const bytes = Array.from(await writeWorkbook(external));
   await page.evaluate(async bytes => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('browser-test.xlsx');
    const writer = await handle.createWritable(); await writer.write(new Uint8Array(bytes)); await writer.close();
   }, bytes);
   await page.locator('#record-form [type=submit]').click();
   await page.locator('#form-error').filter({ hasText: 'utanför appen' }).waitFor();
   const preserved = await currentData(); assert.equal(preserved.properties[0].name, 'Extern ändring'); assert.equal(preserved.issues[0].title, 'Utred belysning');
   await page.locator('[data-action=close-editor]').first().click();
  }
  console.log(mode + (mode === 'browser-excel' ? ': browser → worker → local workbook → rendered response; no record upload' : ': browser → API → local file → rendered response verified'));
 } finally {
  await page.close(); await new Promise(resolve => server.close(resolve)); await store.close(); await rm(dir, { recursive: true, force: true });
 }
}
try { await scenario('sqlite'); await scenario('excel'); await scenario('browser-excel'); assert.deepEqual(errors, []); console.log('Screenshots: ' + artifacts); }
finally { await browser.close(); }
