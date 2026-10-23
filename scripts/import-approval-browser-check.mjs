import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {createServer} from '../backend/lokaler/server.mjs';
import {normalize} from '../frontend/lokaler/model.js';
import {approveAllImportRecords} from './helpers/import-approval.mjs';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-import-approval';await mkdir(artifacts,{recursive:true});
const headers=['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Avtalsnummer','Area','Grundhyra','Hyra justeringsregel','Ort'];
const rows=[['P1','TESTET 1','Testgatan 1','O1','A1',100,10000,'none','Teststad'],['P2','TESTET 2','Exempelgatan 2','O2','A2',200,20000,'none','Teststad']];
const mapping=['Fastighet.FastighetsID','Fastighet.Fastighetsnamn','Fastighet.Adress','Objekt.ObjektID','Avtal.AvtalsID','Objekt.Yta, m²','Avtal.Bashyra','Avtal.Hyra justeringsregel','Fastighet.Ort'];
const bytes=rows=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Testunderlag');return Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));};
const files=[bytes([headers,...rows]),bytes([headers.map((_,i)=>'Källrubrik '+i),mapping,...rows.map(row=>row.map((value,i)=>i===6?value+1000:value)).reverse()]),bytes([headers,['P3','NYTT FÖRSLAG 3','Provvägen 3','O3','A3',50,30000,'none','Teststad']]),bytes([['FastighetsID','Fastighetsnamn','Gatuadress','Ort'],...Array.from({length:122},(_,i)=>['L'+i,'STORTEST '+i,'Provgränd '+i,'Teststad'])])];
const dir=await mkdtemp(join(tmpdir(),'approval-browser-')),file=join(dir,'data.sqlite');
let store=await LocalStore.open({file}),server,browser;
const baseline=store.snapshot().data;baseline.properties.push(normalize('properties',{id:'EXISTING',name:'SPARAD 1',address:'Sparad testgata 9',city:'Teststad'}));baseline.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:9876,propertyId:'EXISTING'}}];await store.replace(baseline,store.snapshot().version);
try{
 server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];let posts=0;
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
 page.on('request',request=>{if(request.url().endsWith('/api/lokaler/workspace')&&request.method()==='POST')posts++;});
 await page.route('https://**/*',async route=>route.request().url().endsWith('xlsx.full.min.js')?route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))}):route.abort());
 await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic test"}'}));
 await page.addInitScript(files=>{window.showOpenFilePicker=async()=>{const i=Number(sessionStorage.getItem('approval-file')||0);return [{name:'syntetiskt-'+i+'.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(files[i])],'syntetiskt-'+i+'.xlsx')}];};},files);
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();
 // Isolate the import transaction from the separate automatic geocoding job.
 await page.evaluate(()=>{window.LokalblickGeocodingService=null;});
 const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
 const begin=async index=>{
  await page.evaluate(index=>sessionStorage.setItem('approval-file',String(index)),index);
  await page.locator('.sidebar [data-view=sources]').evaluate(node=>node.click());await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();
  if(index===1){await page.locator('[data-mapping-row]').selectOption('yes');await page.locator('[data-check-records]').click();await ready();await page.locator('[data-import-conflict-mode]').selectOption('replace');await ready();}
  assert.equal(await page.locator('[data-apply]').isDisabled(),false,await page.locator('.import-mapping-dialog').innerText());
 };
 const open=async()=>{await page.locator('[data-apply]').click();await page.locator('.import-approval-dialog').waitFor();};
 const box=id=>page.locator('[data-create-record]').locator('xpath=..').filter({hasText:id}).locator('input');
 const next=()=>page.locator('[data-approval-next]').click();
 const selected=async()=>{
  await box('TESTET 1').check();await next();
  assert.equal(await box('Objekt O2').isDisabled(),true);await page.locator('[data-select-creations=all]').click();await next();
  assert.equal(await box('Avtal A2').isDisabled(),true);await page.locator('[data-select-creations=all]').click();await next();
  assert.match(await page.locator('.import-approval-dialog').innerText(),/Priser/);assert.equal(await page.locator('.import-approval-dialog tbody tr').count(),1);await next();
 };
 const confirm=async()=>{const saved=page.waitForResponse(response=>response.url().endsWith('/api/lokaler/workspace')&&response.request().method()==='POST');await page.locator('[data-confirm-import]').click();assert.equal((await saved).status(),200);await page.locator('.import-progress-dialog').waitFor({state:'detached'});};
 const snapshot=()=>JSON.stringify(store.snapshot());
 await begin(0);const before=snapshot();await open();assert.equal(await page.locator('[data-create-record]:checked').count(),0);await selected();assert.equal(snapshot(),before);assert.equal(posts,0,'No write before final confirmation');
 await page.locator('[data-approval-cancel]').click();await ready();assert.equal(snapshot(),before);await open();assert.equal(await page.locator('[data-create-record]:checked').count(),0,'Returning to column review invalidates earlier creation decisions');await selected();
 for(const width of [1440,390]){await page.setViewportSize({width,height:960});assert.equal(await page.locator('.import-approval-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth),true);await page.screenshot({path:join(artifacts,'summary-'+width+'.png')});}
 await confirm();assert.equal(posts,1);let data=store.snapshot().data;assert.deepEqual(data.properties.map(row=>row.id),['EXISTING','P1']);assert.deepEqual(data.agreements.map(row=>row.id),['A1']);assert.equal(data.agreement_items.length,1);assert.equal(data.workspace.sourceRegistry[0].receipt.deferredRecords,4);assert.deepEqual(data.workspace.budgetPlans,baseline.workspace.budgetPlans);
 await page.setViewportSize({width:1440,height:960});await begin(1);await open();assert.match(await page.locator('.import-approval-dialog h2').innerText(),/Fastigheter/);assert.equal(await page.locator('[data-create-record]').count(),1,'Saved mappings do not preapprove P2');await next();await next();await next();assert.equal(await page.locator('.import-approval-dialog tbody tr').count(),1);assert.match(await page.locator('.import-approval-dialog').innerText(),/11.000/);await next();await confirm();data=store.snapshot().data;assert.equal(data.properties.length,2);assert.equal(data.agreement_items[0].base_amount,11000);assert.equal(posts,2);
 await begin(2);await open();await page.locator('[data-map-property]').click();await page.locator('[data-existing-property-search]').fill('Sparad');await page.locator('[data-existing-property=EXISTING]').click();assert.equal(await page.locator('[data-create-record]').isDisabled(),true);await next();await page.locator('[data-select-creations=all]').click();await next();await page.locator('[data-select-creations=all]').click();await next();await next();await confirm();data=store.snapshot().data;assert.equal(data.properties.length,2);assert.equal(data.objects.find(row=>row.id==='O3').property_id,'EXISTING');assert.equal(data.properties.find(row=>row.id==='EXISTING').name,'SPARAD 1');assert.equal(posts,3);
 await begin(3);const beforeLarge=snapshot();await open();assert.equal(await page.locator('[data-create-record]').count(),100);await page.locator('[data-approval-search]').fill('L121');assert.equal(await page.locator('[data-create-record]').count(),1);await page.locator('[data-create-record]').check();await page.locator('[data-approval-search]').fill('');await page.locator('[data-approval-more]').click();assert.equal(await page.locator('[data-create-record]').count(),122);await page.locator('[data-select-creations=all]').click();assert.equal(await page.locator('[data-create-record]:checked').count(),122);await page.locator('[data-select-creations=none]').click();assert.equal(await page.locator('[data-create-record]:checked').count(),0);await page.locator('[data-approval-cancel]').click();await page.locator('[data-cancel]').click();assert.equal(snapshot(),beforeLarge);assert.equal(posts,3);assert.deepEqual(errors,[]);
 await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));server=null;store.close();store=await LocalStore.open({file});data=store.snapshot().data;assert.equal(data.properties.length,2);assert.equal(data.agreements.length,2);assert.equal(data.agreement_items.length,2);assert.deepEqual(data.workspace.budgetPlans,baseline.workspace.budgetPlans);
 console.log('PASS: selective approval, deferred dependencies, no writes on cancel, exactly one final POST per import, renamed headers, existing-property mapping, 122-row search/bulk selection, mobile/desktop and SQLite reopen.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));store.close();await rm(dir,{recursive:true,force:true});}
