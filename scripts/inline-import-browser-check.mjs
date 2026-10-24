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
import {approveAllImportRecords,revealImportSettings} from './helpers/import-approval.mjs';

const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-inline-import';await mkdir(artifacts,{recursive:true});
const base=emptyData();for(let i=1;i<=22;i++)base.properties.push(normalize('properties',{id:'P'+i,name:'TESTET '+i,address:'Testgatan '+i,city:'Teststad'}));
base.workspace.budgetPlans=[{id:'locked',status:'Låst',snapshot:{amount:12345}}];
const input=[['FastighetsID','Gatuadress','ObjektID','Avtalsnummer','Area','Säg upp senast'],...Array.from({length:133},(_,i)=>['P1','Testgatan 1','O'+i,'KNOWN-'+i,100,i===0?'not a date':'']),...Array.from({length:21},(_,i)=>['','Testgatan '+(i+2),'WAIT-O'+i,'WAIT-'+String(i+1).padStart(3,'0'),100,''])];
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(input),'Underlag');const bytes=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const dir=await mkdtemp(join(tmpdir(),'inline-import-')),file=join(dir,'data.sqlite');let store=await LocalStore.open({file}),server,browser;
await store.replace(base,0);
try{
 server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];let posts=0;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
 page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/lokaler/workspace'))posts++;});
 await page.route('https://**/*',async route=>route.request().url().endsWith('xlsx.full.min.js')?route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))}):route.abort());
 await page.addInitScript(bytes=>{window.showOpenFilePicker=async()=>[{name:'syntetiskt-154.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetiskt-154.xlsx')}];},bytes);
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await page.evaluate(()=>{window.LokalblickGeocodingService=null;});
 const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
 const begin=async()=>{await page.locator('.sidebar [data-view=sources]').evaluate(node=>node.click());await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();};
 await begin();const before=JSON.stringify(store.snapshot());assert.equal(await page.locator('[data-story-filter] option[value=""]').innerText(),'Alla (154)');assert.equal(await page.locator('[data-import-source-row]').count(),30);assert.equal(await page.locator('.import-link-proposals').count(),0);
 await page.locator('[data-filter-import-rows="attention:link"]').click();assert.equal(await page.locator('[data-import-source-row]').count(),21);assert.equal(await page.locator('[data-link-proposal]').count(),21);assert.equal(await page.locator('[data-link-proposal]').first().evaluate(node=>Boolean(node.closest('tr[data-import-source-row]'))),true);assert.match(await page.locator('[data-import-source-row]').first().innerText(),/Behöver kopplas/);
 await page.locator('[data-story-search]').fill('WAIT-021');assert.equal(await page.locator('[data-import-source-row]').count(),1);await page.locator('[data-approve-link]').check();await ready();assert.equal(await page.locator('[data-import-source-row]').count(),0);await page.locator('[data-story-search]').fill('');assert.equal(await page.locator('[data-import-source-row]').count(),20);
 await page.locator('[data-story-search]').fill('WAIT-020');await page.locator('[data-approve-link-proposals]').click();await ready();await page.locator('[data-story-search]').fill('');assert.equal(await page.locator('[data-import-source-row]').count(),19,'Filtered bulk action approves only its matching source row');assert.equal(posts,0);assert.equal(JSON.stringify(store.snapshot()),before);
 for(const width of [1440,390]){await page.setViewportSize({width,height:960});assert.equal(await page.locator('.import-mapping-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth),true);await page.locator('[data-import-table-review]').scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,'pending-'+width+'.png')});}
 await page.setViewportSize({width:1440,height:960});await page.locator('[data-story-filter]').selectOption('attention:complete');assert.equal(await page.locator('[data-import-source-row]').count(),1);assert.match(await page.locator('[data-import-source-row]').innerText(),/Behöver kompletteras/);await page.locator('[data-open-row]').click();assert.match(await page.locator('.import-row-detail').innerText(),/datum/);
 await revealImportSettings(page);await page.locator('[data-ignore-column="0:5"]').click();await ready();assert.equal(await page.locator('[data-import-source-row]').count(),0);await page.locator('[data-story-filter]').selectOption('attention:link');assert.equal(await page.locator('[data-import-source-row]').count(),19,'Fixing another column retains approved links');await page.locator('[data-approve-link-proposals]').click();await ready();assert.equal(await page.locator('[data-import-source-row]').count(),0);assert.equal(posts,0);
 await page.locator('[data-story-filter]').selectOption('');assert.equal(await page.locator('[data-story-filter] option[value=""]').innerText(),'Alla (154)');assert.equal(await page.locator('[data-approve-link]:checked').count(),0,'Approved rows beyond the current 30-row page remain in the draft');
 const saved=page.waitForResponse(response=>response.request().method()==='POST'&&response.url().endsWith('/api/lokaler/workspace'));await approveAllImportRecords(page);assert.equal((await saved).status(),200);await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,1);
 let data=store.snapshot().data;assert.equal(data.properties.length,22);assert.equal(data.objects.length,154);assert.equal(data.agreements.length,154);assert.equal(data.agreements.find(row=>row.id==='WAIT-021').object_id,'WAIT-O20');assert.equal(data.objects.find(row=>row.id==='WAIT-O20').property_id,'P22');assert.deepEqual(data.workspace.budgetPlans,base.workspace.budgetPlans);
 await begin();assert.equal(await page.locator('[data-link-proposal]').count(),0);assert.equal(await page.locator('[data-story-filter] option[value="attention:link"]').innerText(),'Behöver kopplas (0)');await page.locator('[data-cancel]').click();assert.equal(posts,1);assert.deepEqual(errors,[]);
 await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));server=null;store.close();store=await LocalStore.open({file});data=store.snapshot().data;assert.equal(data.agreements.length,154);assert.deepEqual(data.workspace.budgetPlans,base.workspace.budgetPlans);
 console.log('PASS: all 154 source rows retained; 21 pending links edited in their original table; separate completion/creation labels; filtered bulk approval; optional-field correction retains choices; no writes before one save; exact links, reimport, SQLite reopen, mobile/desktop and locked budgets.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));store.close();await rm(dir,{recursive:true,force:true});}
