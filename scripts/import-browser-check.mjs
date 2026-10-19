import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-simple-import';fs.mkdirSync(artifacts,{recursive:true});
const server=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,LOKALBLICK_PORT:'8805'}});let browser;
function file(name,sheets){const workbook=XLSX.utils.book_new();for(const [sheet,rows] of sheets)XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(rows),sheet);return {name,bytes:[...XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})]};}
const files=[file('syntetiska-avtal.xlsx',[
 ['Lokallista',[['Förvaltningsobjekt','Gatuadress','Avtalsnummer','Area','Årshyra','Fr.o.m.','T.o.m.','Specialvillkor','Internt kostnadsställe'],['P-1','Testgatan 1','A-1',425,120000,'2025-01-01','2028-12-31','FÅR INTE IMPORTERAS','K-42']]],
 ['Lokalbestånd',[['Objektsnummer / Förvaltningsobjekt','Avtalsnummer','Ort'],['P-1','A-1','Malmö']]],
]),file('syntetiska-personer.xlsx',[
 ['Personer',[['Namn','E-post','Telefon'],['Anna Lind','anna.lind@example.invalid','0700000001'],['Annan Person','annalind@example.invalid','0700000002']]],
])];
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true,executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**/*',route=>{
  const url=route.request().url();
  if(url.includes('xlsx'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});
  if(url.includes('leaflet'))return route.fulfill({contentType:url.includes('.css')?'text/css':'application/javascript',body:fs.readFileSync(require.resolve('leaflet/dist/leaflet.'+(url.includes('.css')?'css':'js')))});
  return route.abort();
 });
 await page.addInitScript(files=>{window.showOpenFilePicker=async()=>files.map(file=>({queryPermission:async()=> 'granted',getFile:async()=>({name:file.name,arrayBuffer:async()=>new Uint8Array(file.bytes).buffer})}));},files);
 await page.goto('http://127.0.0.1:8805/v2/index.html');
 const navigate=()=>page.locator('.sidebar [data-view="sources"]').evaluate(button=>button.click());
 await navigate();
 const open=async()=>{await page.locator('[data-source="import"]').click();await page.locator('[data-import-select="all"]').click();await page.locator('[data-import-start]').click();await page.locator('[data-preview-map]').first().waitFor();};
 const choose=async(key,search,target)=>{await page.locator(`[data-preview-map="${key}"]`).evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});await page.locator(`[data-preview-map="${key}"]`).click();await page.locator('[data-field-search]').fill(search);await page.locator(`[data-target="${target}"]`).click();};
 await open();
 assert.equal(await page.locator('[data-existing],[data-preview-collection],[data-extra]').count(),0);
 assert.equal(await page.locator('[data-preview-map]').count(),15);
 assert.equal(await page.locator('[data-apply]').isDisabled(),true);
 assert.ok(!(await page.locator('.import-mapping-dialog').innerText()).includes('Kompletterande information'));
 await page.screenshot({path:`${artifacts}/pending-1280.png`});
 await choose('0:8','kostnadsställe','contracts.costCenterPremises');
 await page.locator('[data-ignore-column="0:7"]').click();
 assert.equal(await page.locator('[data-apply]').isEnabled(),true);
 await page.locator('[data-column-group="mapped"]').evaluate(node=>node.open=true);
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:950});
  const dimensions=await page.locator('.import-mapping-dialog').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,'No horizontal scroll at '+width);
  await page.screenshot({path:`${artifacts}/review-${width}.png`});
 }
 await choose('0:8','kostnadsställe','contracts.costCenterPremises');
 await page.locator('[data-apply]').click();await page.locator('.import-mapping-dialog').waitFor({state:'detached'});
 await page.locator('.import-progress-dialog').waitFor({state:'detached'});
 const loaded=()=>page.evaluate(()=>LokalblickDataService.load());
 const first=await loaded();assert.equal(first.properties.length,1);assert.equal(first.contracts.length,1);assert.equal(first.people.length,2);
 assert.equal(first.contracts[0].costCenterPremises,'K-42');assert.equal(first.contracts[0].baseRent,120000);assert.equal(first.contracts[0].end,'2028-12-31');
 assert.ok(!JSON.stringify(first).includes('FÅR INTE IMPORTERAS'));assert.deepEqual(first.contracts[0].supplemental,[]);
 await page.reload();await navigate();assert.equal((await loaded()).contracts.length,1);
 await open();assert.equal(await page.locator('[data-column-group="pending"]').count(),0);assert.equal(await page.locator('[data-apply]').isEnabled(),true);
 assert.ok((await page.locator('[data-import-result]').innerText()).includes('Oförändrade'));
 await page.locator('[data-apply]').click();await page.locator('.import-mapping-dialog').waitFor({state:'detached'});await page.locator('.import-progress-dialog').waitFor({state:'detached'});
 const again=await loaded();assert.equal(again.people.length,2);assert.equal(again.properties.length,1);assert.equal(again.contracts.length,1);assert.equal(again.auditLog.length,first.auditLog.length);
 // Cancelling a changed choice never persists its new rules or values.
 await open();await choose('0:8','kommentar','contracts.comment');await page.locator('[data-cancel]').click();
 assert.deepEqual(await loaded(),again);
 // After city completion the progress dialog describes saving, even if storage waits.
 const isolated=await browser.newContext({viewport:{width:390,height:900}}),cityPage=await isolated.newPage();
 await cityPage.route('https://**/*',route=>{
  const url=route.request().url();if(url.includes('xlsx'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});return route.abort();
 });
 await cityPage.addInitScript(file=>{window.showOpenFilePicker=async()=>[{queryPermission:async()=> 'granted',getFile:async()=>({name:file.name,arrayBuffer:async()=>new Uint8Array(file.bytes).buffer})}];},files[0]);
 await cityPage.goto('http://127.0.0.1:8805/v2/index.html');
 await cityPage.locator('.sidebar [data-view="sources"]').evaluate(button=>button.click());
 await cityPage.locator('[data-source="import"]').click();await cityPage.locator('[data-import-start]').click();await cityPage.locator('[data-ignore-unmapped]').click();
 await cityPage.locator('[data-column-group="mapped"]').evaluate(node=>node.open=true);await cityPage.locator('[data-ignore-column="1:2"]').click();
 await cityPage.evaluate(()=>{const bridge=LokalblickViewBridge,save=bridge.save;bridge.save=(...args)=>new Promise((resolve,reject)=>{window.releaseImportSave=()=>Promise.resolve(save(...args)).then(resolve,reject);});});
 await cityPage.locator('[data-apply]').click();await cityPage.locator('[data-city-value]').fill('Malmö');await cityPage.locator('[data-city-apply]').click();
 await cityPage.waitForFunction(()=>typeof window.releaseImportSave==='function');
 assert.equal(await cityPage.locator('.import-progress-dialog h2').innerText(),'Sparar import');
 assert.ok((await cityPage.locator('[data-import-progress-message]').innerText()).startsWith('Sparar godkända'));
 await cityPage.evaluate(()=>window.releaseImportSave());await cityPage.locator('.import-progress-dialog').waitFor({state:'detached'});
 assert.equal(await cityPage.evaluate(async()=>(await LokalblickDataService.load()).properties.length),1);
 await isolated.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: one review, searchable direct fields, independent exclusions on recognized sheets, no supplemental data, mobile fit, saved choices, distinct people, idempotent reimport, cancellation and reload.');
}finally{await browser?.close();server.kill('SIGTERM');}
