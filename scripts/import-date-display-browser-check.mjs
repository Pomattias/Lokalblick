import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {createServer} from '../backend/lokaler/server.mjs';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-import-dates';await mkdir(artifacts,{recursive:true});
const headers=['FastighetsID','Fastighetsnamn','ObjektID','Avtalsnummer','From','Tom','Säg upp avtal senast','Ort'],book=XLSX.utils.book_new();
const serial=date=>(Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
const sheet=XLSX.utils.aoa_to_sheet([headers,['P1','TESTET 1','O1','A1',serial('2026-01-11'),serial('2027-10-31'),'Se avtal','Provstad']]);sheet.E2.z='m/d/yy';sheet.F2.z='m/d/yy';XLSX.utils.book_append_sheet(book,sheet,'Avtal');const bytes=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const mode of ['sqlite','excel']){
 const dir=await mkdtemp(join(tmpdir(),'import-dates-')),file=join(dir,mode==='excel'?'data.xlsx':'data.sqlite'),store=await LocalStore.open({file,mode});const base=emptyData();base.workspace.budgetPlans=[{id:'locked',locked:true,amount:123}];await store.replace(base,0);
 const server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];let posts=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'Testare':undefined));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/lokaler/workspace'))posts++;});
 await page.route('https://**/*',async route=>route.request().url().endsWith('xlsx.full.min.js')?route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))}):route.abort());
 await page.addInitScript(bytes=>{window.showOpenFilePicker=async()=>[{name:'syntetiska-datum.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetiska-datum.xlsx')}];},bytes);
 const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
 const begin=async()=>{await page.locator('.sidebar [data-view=sources]').evaluate(n=>n.click());await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();for(const [i,target]of [[4,'contracts.start'],[5,'contracts.end'],[6,'contracts.notice']]){await page.locator('[data-preview-table="0:'+i+'"]').selectOption('contracts');await ready();await page.locator('[data-preview-map="0:'+i+'"]').selectOption(target);await ready();}};
 const notice=()=>page.getByLabel('Säg upp avtal senast · rad 2',{exact:true});
 const correct=async()=>{await page.locator('[data-open-row]').click();assert.equal(await page.getByLabel('From · rad 2',{exact:true}).inputValue(),'2026-01-11');assert.equal(await notice().getAttribute('aria-invalid'),'true');const id=await notice().getAttribute('aria-describedby');assert.match(await page.locator('#'+id).innerText(),/ÅÅÅÅ-MM-DD/);await notice().fill('2027-04-30');await notice().press('Tab');await ready();assert.equal(await page.locator('[data-cell-problem]').count(),0);};
 try{
  await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await page.evaluate(()=>{window.LokalblickGeocodingService=null;});const before=JSON.stringify(await store.readSnapshot());
  await begin();const row=page.locator('[data-import-source-row]');assert.match(await row.innerText(),/2026-01-11/);assert.match(await row.innerText(),/2027-10-31/);assert.doesNotMatch(await row.innerText(),/1\/11\/26|10\/31\/27/);assert.equal(await row.locator('[data-cell-problem]').count(),1);assert.match(await row.locator('.import-attention-reason').innerText(),/Säg upp avtal senast: Datum kan inte tolkas/);assert.match(await row.locator('[data-cell-problem]').innerText(),/Se avtal/);
  await page.locator('[data-ignore-column="0:4"]').check();await ready();assert.match(await row.innerText(),/2026-01-11/);await page.locator('[data-ignore-column="0:4"]').uncheck();await ready();
  await row.locator('[data-cell-problem]').scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,mode+'-problem.png')});await page.setViewportSize({width:390,height:900});assert(await page.locator('.import-mapping-dialog').evaluate(n=>n.scrollWidth<=n.clientWidth));await page.screenshot({path:join(artifacts,mode+'-mobile.png')});await page.setViewportSize({width:1440,height:960});await correct();await page.locator('[data-cancel]').click();await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,0);assert.equal(JSON.stringify(await store.readSnapshot()),before);
  await begin();await correct();await page.locator('[data-new-records]').evaluate(n=>n.open=true);await page.locator('[data-select-creations=all]').click();const response=page.waitForResponse(r=>r.url().endsWith('/api/lokaler/workspace')&&r.request().method()==='POST');await page.locator('[data-apply]').click();assert.equal((await response).status(),200);await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,1);
  const saved=(await store.readSnapshot()).data;assert.equal(saved.agreements[0].valid_from,'2026-01-11');assert.equal(saved.agreements[0].valid_to,'2027-10-31');assert.equal(saved.agreements[0].notice_by,'2027-04-30');assert.deepEqual(saved.workspace.budgetPlans,base.workspace.budgetPlans);
  await begin();assert.equal(await page.locator('[data-new-records]').count(),0);assert.match(await row.innerText(),/2026-01-11/);assert.equal((await store.readSnapshot()).data.agreements[0].notice_by,'2027-04-30');await page.locator('[data-cancel]').click();await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,1);assert.deepEqual(errors,[]);
  console.log('PASS '+mode+': Swedish ISO date display from Excel American formats, excluded dates, exact field error with accessible description, inline correction, cancel/no writes, one API save, ISO persistence, reimport, mobile and locked Budget.');
 }catch(error){await page.screenshot({path:join(artifacts,mode+'-failure.png'),fullPage:true});throw error;}
 finally{await page.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
}}finally{await browser.close();}
