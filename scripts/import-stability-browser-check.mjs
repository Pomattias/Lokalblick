import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {chromium} from 'playwright';import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';import {createServer} from '../backend/lokaler/server.mjs';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-import-stability-check';await mkdir(artifacts,{recursive:true});
const headers=['FastighetsID','Fastighetsbeteckning','Gatuadress','ObjektID','Area','Avtalsnummer','Giltigt fr.o.m.','Giltigt t.o.m.','Länk avtal (Huvudkontrakt)','Användning','Ort'];
const row=(id,address='Testgatan 1',from='2025-01-01',url='https://example.invalid/document')=>['F1','Testfastighet 1',address,'O'+id,100,'A'+id,from,'2029-12-31',url,'Vald bort','Malmö'];
const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([headers,row(1),row(2,'Annan adress'),row(3,'Testgatan 1','Se avtal'),row(4,'Testgatan 1','2025-01-01','streamToClient'),row(5,'Testgatan 1','45291')]);
// Excel hyperlinks often contain a display label rather than the target URL.
sheet.I2.v='Öppna dokument';sheet.I2.l={Target:'https://example.invalid/document'};
XLSX.utils.book_append_sheet(book,sheet,'Underlag');const sourceBytes=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const dir=await mkdtemp(path.join(os.tmpdir(),'import-stability-')),store=await LocalStore.open({file:path.join(dir,'data.sqlite'),mode:'sqlite'}),server=createServer(store);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:940}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
await page.route('https://**/*',async route=>{const url=route.request().url();if(url.endsWith('xlsx.full.min.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))});for(const ext of ['js','css'])if(url.endsWith('leaflet.'+ext))return route.fulfill({contentType:ext==='js'?'text/javascript':'text/css',body:await readFile(require.resolve('leaflet/dist/leaflet.'+ext))});return route.abort();});
await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"Test"}'}));
await page.route('**/api/budget-index?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test"}'}));
await page.addInitScript(bytes=>{window.showOpenFilePicker=async()=>[{name:'syntetiskt.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetiskt.xlsx')}];},sourceBytes);
const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
const column=header=>page.locator('[data-import-column]').filter({has:page.locator('.import-column-name strong',{hasText:header})});
const begin=async()=>{await page.locator('.sidebar [data-view=sources]').evaluate(node=>node.click());await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();for(const selector of ['[data-column-group=mapped]','[data-column-group=ignored]'])await page.locator(selector).evaluateAll(nodes=>nodes.forEach(n=>n.open=true));};
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await begin();
 await column('Användning').locator('[data-ignore-column]').click();await ready();
 assert.equal(store.snapshot().data.properties.length,0,'Preview never writes to database');
 assert.equal(await page.locator('[data-apply]').isDisabled(),true,'Invalid rows block by default');
 await page.locator('[data-import-errors]').evaluate(node=>node.open=true);
 assert.match(await page.locator('[data-import-errors]').innerText(),/Se avtal/);assert.match(await page.locator('[data-import-errors]').innerText(),/streamToClient/);
 const link=column('Länk avtal');await link.locator('[data-invalid-link]').check();await ready();
 await column('Giltigt fr.o.m.').locator('[data-date-mode]').selectOption('excel-1900');await ready();
 assert.equal(await page.locator('[data-import-safe-rows]').isChecked(),false);await page.locator('[data-import-safe-rows]').check();assert.equal(await page.locator('[data-apply]').isDisabled(),false);
 // Changing any conversion invalidates the partial-import confirmation.
 await column('Giltigt fr.o.m.').locator('[data-date-mode]').selectOption('auto');await ready();assert.equal(await page.locator('[data-import-safe-rows]').isChecked(),false);assert.equal(await page.locator('[data-apply]').isDisabled(),true);
 await column('Giltigt fr.o.m.').locator('[data-date-mode]').selectOption('excel-1900');await ready();
 assert.equal(await page.locator('[data-import-errors]').getAttribute('open'),'','Expanded error list survives recalculation');
 await page.locator('[data-import-safe-rows]').check();await page.screenshot({path:path.join(artifacts,'review-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:900});assert.equal(await page.locator('.import-mapping-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth),true,'Preview fits mobile');await page.screenshot({path:path.join(artifacts,'review-mobile.png')});
 await page.locator('[data-apply]').click();await page.locator('.import-mapping-dialog').waitFor({state:'detached'});await page.locator('.import-progress-dialog').waitFor({state:'detached'});
 let data=store.snapshot().data;assert.equal(data.properties.length,1);assert.equal(data.objects.length,4);assert.equal(data.agreements.length,4);assert.equal(data.agreements.find(a=>a.id==='A1').main_contract_url,'https://example.invalid/document');assert.equal(data.agreements.find(a=>a.id==='A4').main_contract_url,null);assert.ok(!data.objects.some(o=>o.id==='O3'));assert.ok(!JSON.stringify(data).includes('Vald bort'));
 const rejected=data.workspace.importReview.find(r=>r.rowRejected);assert.equal(rejected.row,4);assert.equal(rejected.column,'Giltigt fr.o.m.');assert.ok(rejected.sourceValues.some(v=>v.raw==='A3'));assert.equal(data.workspace.importReview.filter(r=>!r.rowRejected).length,2);
 await page.setViewportSize({width:1440,height:940});await begin();
 assert.match(await column('Användning').locator('[data-ignore-column]').innerText(),/Ångra bortval/,'Saved exclusions survive alias recognition');assert.equal(await column('Giltigt fr.o.m.').locator('[data-date-mode]').inputValue(),'excel-1900');assert.equal(await column('Länk avtal').locator('[data-invalid-link]').isChecked(),true);assert.equal(await page.locator('[data-import-safe-rows]').isChecked(),false);
 await page.locator('[data-import-safe-rows]').check();await page.locator('[data-apply]').click();await page.locator('.import-progress-dialog').waitFor({state:'detached'});data=store.snapshot().data;assert.equal(data.agreements.length,4,'Reimport is idempotent');assert.equal(data.objects.length,4);
 // A saved descriptive conflict resolves against the property, with audit history.
 await page.locator('.sidebar [data-view=sources]').evaluate(node=>node.click());await page.locator('.review-details').evaluate(node=>node.open=true);
 const conflict=data.workspace.importReview.find(r=>!r.rowRejected&&r.proposed),invalid=data.workspace.importReview.find(r=>r.rowRejected);
 assert.equal(await page.locator('[data-review="'+invalid.id+'"][data-decision=accept]').count(),0,'Rejected rows offer correction, never blind approval');
 const saved=page.waitForResponse(response=>response.url().endsWith('/api/lokaler/workspace')&&response.request().method()==='POST');
 await page.locator('[data-review="'+conflict.id+'"][data-decision=accept]').click();assert.equal((await saved).status(),200);data=(await store.readSnapshot()).data;assert.equal(data.properties[0].address,'Annan adress');assert.equal(data.agreements.length,4);assert(data.workspace.auditLog.some(e=>e.collection==='properties'&&e.recordId==='F1'&&e.fields.some(f=>f.to==='Annan adress')));
 // Force out-of-order evaluations through the same preview UI: a stale result
 // must not enable Apply or override the last explicit column selection.
 await page.evaluate(async()=>{
  const {previewImport}=await import('/frontend/v2/import-mapping.js'),{importSchemas}=await import('/frontend/lokaler/import-model.js');
  const workbook={SheetNames:['Test'],Sheets:{Test:{'!ref':'A1:A2',A1:{t:'s',v:'Verksamhet'},A2:{t:'s',v:'Test'}}}},column={index:0,header:'Verksamhet',target:'contracts.business',filled:1,samples:['Test'],format:{type:'text',label:'Text'}};
  let revision=0;window.__previewRevisions=[];window.__previewResolved=false;
  const evaluator=async profiles=>{const current=++revision;await new Promise(r=>setTimeout(r,current===2?250:30));window.__previewRevisions.push(current);return {clean:{},data:{importReview:[]},report:{tables:[],changes:[],decisions:[],blocking:0,rows:1},selected:profiles[0].columns[0].target};};
  previewImport({fileName:'syntetiskt.xlsx',workbook,profiles:[{name:'Test',headerRow:1,columns:[column]}]}, {importFieldPreferences:{}},importSchemas,'Testare',evaluator).then(result=>{window.__previewResolved=result.selected;}).catch(error=>{window.__previewResolved=error.name;});
 });
 await ready();await page.locator('[data-ignore-column]').click();
 assert.equal(await page.locator('[data-apply]').isDisabled(),true,'Apply is disabled while evaluating');
 await page.locator('[data-ignore-column]').click();await ready();await page.waitForFunction(()=>window.__previewRevisions.includes(2));assert.equal(await page.locator('[data-apply]').isDisabled(),true,'Stale ignored result cannot enable Apply');
 await page.locator('[data-ignore-unmapped]').click();await ready();assert.equal(await page.locator('[data-apply]').isDisabled(),true,'No selected column can be imported');await page.locator('[data-cancel]').click();assert.deepEqual(errors,[]);
 console.log('PASS: real Excel import → worker → preview → explicit partial selection → SQLite; saved exclusions/date/link rules, row rollback, idempotent reimport, mobile and stale preview protection.');console.log('Screenshots: '+artifacts);
}catch(error){await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true});throw error;}
finally{await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
