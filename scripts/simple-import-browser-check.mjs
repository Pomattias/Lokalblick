import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {chromium} from 'playwright';import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';import {createServer} from '../backend/lokaler/server.mjs';
import {emptyData} from '../frontend/lokaler/model.js';import {approveAllImportRecords} from './helpers/import-approval.mjs';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-simple-import';await mkdir(artifacts,{recursive:true});
const book=XLSX.utils.book_new(),headers=['Förvaltningsobjekt','Avtalsnummer','Fastighetsbeteckning','Gatuadress','Area','From','Tom','Bashyra','Hyra justeringsregel','Användning','Ort'];
const row=(p,a,name,address,from,to)=>[p,a,name,address,100,from,to,10000,'none','Fiktiv användning','Teststad'];
XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,
 row('4201','SF4201-001-03','9000','Provgatan 1','2026-01-01','2026-12-31'),
 row('4202','SF4202-001-03','9000','Annan gata 2','2026-01-01','2026-12-31'),
 row('4203','SF4203-001-03','TESTET 3','Provgatan 1','2026-01-01','2026-12-31'),
 row('4201','SF4201-001-04','9000','Provgatan 1','2027-01-01','2027-12-31'),
 row('4201','SF4201-001-05','9000','Provgatan 1','2027-06-01','2028-12-31')
]),'Syntetiskt');const bytes=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const dir=await mkdtemp(join(tmpdir(),'simple-import-')),file=join(dir,'data.sqlite');let store=await LocalStore.open({file});
const base=emptyData();base.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:98765}}];await store.replace(base,0);
const server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];let posts=0;
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/lokaler/workspace'))posts++;});
await page.route('https://**/*',async route=>route.request().url().endsWith('xlsx.full.min.js')?route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))}):route.abort());
await page.addInitScript(bytes=>{window.showOpenFilePicker=async()=>[{name:'syntetisk-import.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetisk-import.xlsx')}];},bytes);
const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
const begin=async()=>{await page.locator('.sidebar [data-view=sources]').evaluate(n=>n.click());await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();};
const dialog=page.locator('.import-mapping-dialog'),usage=page.locator('[data-import-column="0:9"]');
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await page.evaluate(()=>{window.LokalblickGeocodingService=null;});await begin();const before=JSON.stringify(store.snapshot());
 assert.equal(await page.locator('[data-preview-table]').count(),headers.length);assert.equal(await page.locator('[data-preview-map]').count(),headers.length);assert.equal(await page.locator('input[data-ignore-column][type=checkbox]').count(),headers.length);assert.equal(await page.locator('[data-link-proposal]').count(),0);assert.equal(await page.locator('[data-import-source-row]').count(),5);
 assert.equal(await page.locator('[data-preview-table="0:0"]').inputValue(),'properties');assert.equal(await page.locator('[data-preview-map="0:0"]').inputValue(),'properties.managementObjectNumber');
 await usage.locator('[data-preview-table]').selectOption('objects');await ready();assert.equal(await usage.locator('[data-preview-map]').inputValue(),'');assert.equal(await page.locator('[data-apply]').isDisabled(),true);
 await usage.locator('[data-preview-map]').selectOption('objects.category');await ready();await usage.locator('[data-preview-table]').selectOption('contracts');await ready();await usage.locator('[data-preview-map]').selectOption('contracts.use');await ready();
 await usage.locator('[data-ignore-column]').check();await ready();assert.equal(await usage.locator('[data-preview-map]').inputValue(),'contracts.use');await usage.locator('[data-ignore-column]').uncheck();await ready();assert.equal(await usage.locator('[data-preview-map]').inputValue(),'contracts.use');
 await page.locator('[data-open-row]').first().click();const detail=page.locator('.import-row-detail').first();assert.match(await detail.innerText(),/Nytt objekt/);assert.match(await detail.innerText(),/Nytt avtal/);assert.equal(await detail.locator('.import-outcome[data-outcome=pending]').count(),0);assert.equal(await page.locator('.import-repeated-headers').count(),1);assert.equal(await page.locator('[data-preview-map]').count(),headers.length);
 assert.doesNotMatch(await dialog.innerText(),/Ny objekt\b|Ny avtal\b|Behöver åtgärd|Behöver ditt val|Identifierade förslag väntar|FAS-|OB-/);assert.doesNotMatch(await page.locator('[data-import-source-row]').last().innerText(),/Avtalsperiod överlappar/);
 await dialog.evaluate(n=>{n.scrollTop=0;n.querySelectorAll('.import-source-scroll').forEach(s=>s.scrollLeft=0);});await page.screenshot({path:join(artifacts,'overview-desktop.png')});await detail.scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,'details-desktop.png')});await page.setViewportSize({width:390,height:900});assert(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth));await page.screenshot({path:join(artifacts,'details-mobile.png')});await page.setViewportSize({width:1440,height:960});
 await page.locator('[data-cancel]').click();await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,0);assert.equal(JSON.stringify(store.snapshot()),before);
 await begin();const saved=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/lokaler/workspace'));await approveAllImportRecords(page);assert.equal((await saved).status(),200);await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,1);
 let data=(await store.readSnapshot()).data;assert.deepEqual(data.properties.map(p=>p.id),['SF4201','SF4202','SF4203']);assert.equal(data.objects.length,3);assert.equal(data.agreements.length,5);assert.equal(data.agreement_items.length,5);assert.equal(data.agreements.find(a=>a.id==='SF4201-001-04').object_id,'SF4201-001');assert(data.agreements.some(a=>a.id==='SF4201-001-05'));assert.deepEqual(data.workspace.budgetPlans,base.workspace.budgetPlans);
 await begin();assert.equal(await page.locator('[data-link-proposal]').count(),0);assert.equal(await page.locator('[data-new-records]').count(),0);const again=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/api/lokaler/workspace'));await page.locator('[data-apply]').click();assert.equal((await again).status(),200);await page.locator('.import-progress-dialog').waitFor({state:'detached'});data=(await store.readSnapshot()).data;assert.equal(data.agreements.length,5);assert.equal(data.properties.length,3);assert.deepEqual(errors,[]);
 console.log('PASS: separate table/field controls, reversible column exclusion, repeated context headers, Swedish noun forms, no redundant pending badges, first-load number precedence despite matching names/addresses, new/repeated leases, concurrent agreement IDs, cancel/no writes, one save, reimport and preserved budgets. Screenshots: '+artifacts);
}catch(error){await page.screenshot({path:join(artifacts,'failure.png'),fullPage:true});throw error;}
finally{await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
