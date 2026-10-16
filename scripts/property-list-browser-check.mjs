import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';

// Optional --baseline=/path/to/unchanged-worktree also compares Budget pixels
// and persisted results against a separate server using the same demo fixtures.
const require = createRequire(import.meta.url);
const artifacts = '/tmp/lokalblick-property-check';
mkdirSync(artifacts,{recursive:true});
const baseline = process.argv.find(arg=>arg.startsWith('--baseline='))?.slice('--baseline='.length);
const servers = [];
let browser;
async function serve(cwd, port) {
  const server = spawn(process.execPath,['backend/server.mjs'],{cwd,env:{...process.env,LOKALBLICK_PORT:String(port)}});
  servers.push(server);
  await new Promise((resolve,reject)=>{
    server.stdout.once('data',resolve);
    server.once('error',reject);
    server.once('exit',code=>reject(Error('Server exited '+code)));
  });
  return `http://127.0.0.1:${port}`;
}
async function open(base) {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const NativeDate = Date;
    window.Date = class extends NativeDate {
      constructor(...args) {super(...(args.length?args:['2026-10-16T12:00:00Z']));}
      static now() {return NativeDate.parse('2026-10-16T12:00:00Z');}
    };
  });
  await page.route('**/api/budget-index?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Offline test fixture"}'}));
  await page.route('https://**/*',route=>{
    const url = route.request().url();
    for(const type of ['js','css']) if(url.endsWith('/leaflet.'+type)) {
      return route.fulfill({contentType:type==='js'?'text/javascript':'text/css',body:readFileSync(require.resolve('leaflet/dist/leaflet.'+type))});
    }
    if(url.endsWith('/xlsx.full.min.js')) return route.fulfill({contentType:'text/javascript',body:readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});
    return route.abort();
  });
  await page.goto(base+'/');
  await page.waitForSelector('[data-dashboard-mode]');
  return {page,errors};
}
const navigate = (page,view) => page.locator(`.sidebar [data-view="${view}"]`).evaluate(button=>button.click());
const names = page => page.locator('tbody[data-row-group]:visible .property-list-summary td:first-child').allTextContents();
const noOverflow = page => page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

async function budgetEvidence(base,label) {
  const {page,errors} = await open(base);
  const screenshots = [];
  // Start from the changed list as well, to catch table-state leaking into Budget.
  await navigate(page,'properties');
  const expander = page.locator('[data-row-toggle]').first();
  if(await expander.count()) {
    await expander.click();
    await page.getByRole('button',{name:'Sortera på Area',exact:true}).click();
    await page.locator('[data-toggle-column-filters]').click();
    await page.getByRole('searchbox',{name:'Filtrera Fastighet',exact:true}).fill('Hamnen');
  }
  await navigate(page,'budget');
  await page.waitForSelector('.budget-comparison');
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    await page.mouse.move(0,0);
    assert.ok(await noOverflow(page),'Budget must fit at '+width);
    screenshots.push(await page.screenshot({path:path.join(artifacts,`${label}-budget-${width}.png`),fullPage:true}));
  }
  const manual = page.locator('[data-preliminary]');
  await manual.fill('450');
  await manual.dispatchEvent('input');
  assert.ok((await page.locator('[data-budget-index-live]').innerText()).includes('Förhandsvisning'));
  await manual.dispatchEvent('change');
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')).budgetPlans.some(plan=>plan.year===2027&&plan.preliminaryIndex===450));
  const lock = page.locator('[data-budget-lock]');
  page.on('dialog',dialog=>dialog.accept());
  if(await lock.count()) await lock.click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')).budgetPlans.some(plan=>plan.year===2027&&plan.status==='Låst'));
  await page.reload();
  await page.waitForSelector('[data-dashboard-mode]');
  await navigate(page,'budget');
  await page.waitForSelector('[data-budget-reopen]');
  const text = await page.locator('#content').innerText();
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    await page.mouse.move(0,0);
    screenshots.push(await page.screenshot({path:path.join(artifacts,`${label}-budget-locked-${width}.png`),fullPage:true}));
  }
  await page.locator('.budget-danger-zone summary').click();
  await page.locator('[data-followup-layer]').click();
  await page.locator('.followup-dialog [name="amount"]').fill('1000');
  await page.locator('.followup-dialog [name="reason"]').fill('Regressionstest av låst budget');
  await page.locator('.followup-dialog [name="confirmation"]').fill('no');
  await page.locator('.followup-dialog [type="submit"]').click();
  assert.equal(await page.locator('.followup-dialog').count(),1);
  await page.locator('.followup-dialog [name="confirmation"]').fill('danger');
  await page.locator('.followup-dialog [type="submit"]').click();
  await page.waitForSelector('.followup-dialog',{state:'detached'});
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')).budgetPlans.find(plan=>plan.year===2027).versions.length===1);
  await page.locator('.budget-comparison tr').filter({hasText:'Takbesiktning'}).locator('[data-followup-final]').click();
  await page.locator('.followup-dialog [name="amount"]').fill('0');
  await page.locator('.followup-dialog [type="submit"]').click();
  await page.waitForSelector('.followup-dialog',{state:'detached'});
  await page.reload();
  await page.waitForSelector('[data-dashboard-mode]');
  await navigate(page,'budget');
  await page.waitForSelector('[data-budget-reopen]');
  assert.ok((await page.locator('.budget-comparison tr').filter({hasText:'Takbesiktning'}).innerText()).includes('Utförd'));
  const revisedText = await page.locator('#content').innerText();
  const plans = await page.evaluate(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')).budgetPlans);
  assert.deepEqual(errors,[]);
  await page.close();
  return {screenshots,text,revisedText,plans};
}

try {
  const base = await serve(process.cwd(),8794);
  browser = await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox']});
  const {page,errors} = await open(base);
  await navigate(page,'properties');
  assert.deepEqual(await names(page),['Centrum 5','Gräset 2','Hamnen 4']);
  await page.getByRole('button',{name:'Sortera på Area',exact:true}).click();
  assert.deepEqual(await names(page),['Centrum 5','Hamnen 4','Gräset 2']);
  const group = page.locator('tbody[data-row-group]').filter({has:page.getByRole('button',{name:'Centrum 5',exact:true})});
  const toggle = group.locator('[data-row-toggle]');
  await toggle.focus();await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  assert.equal(await group.locator('[data-group-detail] [data-edit="contracts"]').count(),2);
  await page.getByRole('button',{name:'Sortera på Area',exact:true}).click();
  assert.deepEqual(await names(page),['Gräset 2','Hamnen 4','Centrum 5']);
  assert.ok(await group.locator('[data-group-detail]').isVisible(),'Expansion moves with the sorted record');
  await page.locator('[data-toggle-column-filters]').click();
  const column = page.getByRole('searchbox',{name:'Filtrera Fastighet',exact:true});
  await column.fill('Hamnen');
  assert.deepEqual(await names(page),['Hamnen 4']);
  assert.equal(await page.locator('[data-table-count]').innerText(),'1 av 3 fastigheter');
  await column.fill('finns inte');
  assert.ok(await page.locator('[data-table-empty]').isVisible());
  await column.fill('');
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  // Saving through the existing editor must retain table filters, sort and expansion.
  await page.getByRole('button',{name:'Hamnen 4',exact:true}).click();
  assert.ok(await page.locator('#edit-form.editor-readonly').count());
  await page.getByRole('button',{name:'Redigera',exact:true}).click();
  await page.locator('#edit-form [name="city"]').fill('Testort');
  await page.locator('#edit-form [type="submit"]').click();
  await page.waitForSelector('#edit-form',{state:'detached'});
  assert.deepEqual(await names(page),['Gräset 2','Hamnen 4','Centrum 5']);
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');
  assert.ok(await column.isVisible());
  await page.getByRole('button',{name:'Hamnen 4',exact:true}).click();
  assert.equal(await page.locator('#edit-form [name="city"]').inputValue(),'Testort');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button',{name:'Hamnen 4',exact:true}).evaluate(button=>document.activeElement===button),true);
  await page.getByRole('button',{name:'Sortera på Fastighet',exact:true}).click();
  await page.locator('[data-toggle-column-filters]').click();
  await page.screenshot({path:path.join(artifacts,'properties-desktop.png'),fullPage:true});
  await toggle.click();
  await page.screenshot({path:path.join(artifacts,'properties-desktop-collapsed.png'),fullPage:true});
  for(const width of [390,320,667]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await noOverflow(page),'Property list fits at '+width);
    assert.equal(await page.locator('.property-list-summary').first().locator('td').nth(4).isVisible(),false);
    await page.locator('[data-table-sort]').selectOption('0:asc');
    await toggle.click();
    assert.ok(await group.locator('[data-group-detail]').isVisible());
    const detailWidth = await group.locator('[data-group-detail]>td').evaluate(cell=>cell.getBoundingClientRect().width);
    assert.ok(detailWidth >= width-24,'Expanded content uses the available mobile width');
    await page.screenshot({path:path.join(artifacts,`properties-mobile-${width}.png`),fullPage:true});
    await group.locator('[data-group-detail] [data-edit="contracts"]').first().click();
    assert.ok(await page.locator('#edit-form[data-collection="contracts"]').count());
    await page.keyboard.press('Escape');
    await toggle.click();
  }
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('searchbox',{name:'Sök',exact:true}).fill('201-2025');
  await page.getByRole('searchbox',{name:'Sök',exact:true}).dispatchEvent('change');
  assert.deepEqual(await names(page),['Centrum 5']);
  await toggle.click();
  assert.equal(await group.locator('[data-group-detail] [data-edit="contracts"]').count(),1);
  assert.ok((await group.locator('[data-group-detail]').innerText()).includes('1 av 2 i aktuellt urval'));
  // The extracted interactions must still work for the existing ordinary lists.
  await page.getByRole('searchbox',{name:'Sök',exact:true}).fill('');
  await page.getByRole('searchbox',{name:'Sök',exact:true}).dispatchEvent('change');
  for(const [view,heading,filter] of [['contracts','Avtal','201-2025'],['activities','Aktivitet','Ventilation']]) {
    await navigate(page,view);
    await page.getByRole('button',{name:'Sortera på '+heading,exact:true}).click();
    assert.equal(await page.locator('th[aria-sort="ascending"]').count(),1);
    await page.locator('[data-toggle-column-filters]').click();
    await page.getByRole('searchbox',{name:'Filtrera '+heading,exact:true}).fill(filter);
    assert.equal(await page.locator('table[data-smart-table] tbody tr:visible').count(),1);
  }
  assert.deepEqual(errors,[]);
  await page.close();
  const current = await budgetEvidence(base,'current');
  if(baseline) {
    const reference = await budgetEvidence(await serve(path.resolve(baseline),8795),'reference');
    assert.deepEqual(current.text,reference.text,'Budget text must remain identical');
    assert.deepEqual(current.revisedText,reference.revisedText,'Budget revision and final-cost text must remain identical');
    assert.deepEqual(current.plans,reference.plans,'Budget calculations and persisted plans must remain identical');
    current.screenshots.forEach((shot,index)=>assert.ok(shot.equals(reference.screenshots[index]),'Budget screenshot differs: '+index));
    console.log('PASS: Budget pixels, text and persisted plans identical to baseline, including scenario, lock, revision, final cost and reload.');
  }
  console.log('PASS: property numeric sort, grouped expansion/filtering, keyboard, editor save, retained state, scoped contracts and compact mobile.');
  console.log('Screenshots: '+artifacts);
} finally {
  await browser?.close();
  for(const server of servers) server.kill();
}
