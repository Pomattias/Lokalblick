import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {createServer} from '../backend/lokaler/server.mjs';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-issue-import-check';await mkdir(artifacts,{recursive:true});
const headers=['Åtgärd','Objekt','Fastighet','Kostnad','Start','Slut'],mapping=['Ärende.Namn','Ärende.ObjektID','Fastighet.Fastighetsnamn','Ärende.Beräknad kostnad, kr','Ärende.Tidplan fr.o.m.','Ärende.Tidplan t.o.m.'];
const rows=[['Ventilationskontroll','O1','Test 1',12000,'2027-01-01','2027-02-01'],['Kontrollera koppling','','Okänd fastighet',4000,'2027-03-01','2027-03-31']];
function bytes(rows){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,mapping,...rows]),'2027');return Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));}
const numberRows=[['Nummerkontroll','F1','Testgatan 1'],['Adresskontroll','','Testgatan 1'],['Kontrollera avvikelse','F1','Andragatan 2']];
function numberBytes(rows){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Ärendenamn','Objektsnummer','Gatuadress'],...rows]),'Ärenden 2027');return Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));}
const files=[bytes(rows),bytes([...rows].reverse()),numberBytes(numberRows),numberBytes([...numberRows].reverse())];
const dir=await mkdtemp(path.join(os.tmpdir(),'issue-import-browser-')),store=await LocalStore.open({file:path.join(dir,'data.sqlite')});
const seed=emptyData();seed.properties.push(normalize('properties',{id:'F1',name:'Test 1',address:'Testgatan 1',city:'Malmö'}));seed.properties.push(normalize('properties',{id:'F2',name:'Test 2',address:'Andragatan 2',city:'Malmö'}));seed.objects.push(normalize('objects',{id:'O1',property_id:'F1',area:100}));seed.workspace.budgetPlans=[{id:'locked',year:2027,locked:true,snapshot:{amount:4321}}];await store.replace(seed,0);
const server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
await page.route('https://**/*',async route=>{const url=route.request().url();if(url.endsWith('xlsx.full.min.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))});for(const ext of ['js','css'])if(url.endsWith('leaflet.'+ext))return route.fulfill({contentType:ext==='js'?'text/javascript':'text/css',body:await readFile(require.resolve('leaflet/dist/leaflet.'+ext))});return route.abort();});
await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"Test"}'}));await page.route('**/api/budget-index?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test"}'}));
await page.addInitScript(files=>{let chosen=Number(sessionStorage.getItem('test-file-index')||0);window.showOpenFilePicker=async()=>{sessionStorage.setItem('test-file-index',String(chosen+1));return [{name:'syntetiska-arenden.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(files[Math.min(chosen++,files.length-1)])],'syntetiska-arenden.xlsx')}];};},files);
const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
const navigate=view=>page.locator(`.sidebar [data-view="${view}"]`).evaluate(node=>node.click());
async function begin(numbers=false){await navigate('sources');await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();if(numbers)return;await page.locator('[data-import-table]').selectOption('activities');await ready();await page.locator('[data-mapping-row]').selectOption('yes');await ready();if(await page.locator('[data-check-records]').count()){await page.locator('[data-check-records]').click();await ready();}}
async function apply(){const saved=page.waitForResponse(r=>r.url().endsWith('/api/lokaler/workspace')&&r.request().method()==='POST');await page.locator('[data-apply]').click();assert.equal((await saved).status(),200);await page.locator('.import-progress-dialog').waitFor({state:'detached'});}
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await begin();
 assert.equal(await page.locator('[data-import-table]').inputValue(),'activities');assert.match(await page.locator('[data-import-result]').innerText(),/Att koppla/);assert.equal(await page.locator('[data-apply]').isDisabled(),false);await apply();
 let stored=store.snapshot().data;assert.deepEqual(stored.issues.map(row=>row.id),['ÄR-000001','ÄR-000002']);assert.equal(stored.properties.length,2);assert.equal(stored.issues[0].object_id,'O1');assert.equal(stored.issues[1].property_id,null);
 await navigate('activities');await page.locator('[data-portfolio-issue=status]').selectOption('unlinked');
 assert.equal(await page.locator('main [data-edit=activities][data-id="ÄR-000001"]').count(),0);await page.locator('main button[data-edit=activities][data-id="ÄR-000002"]').first().click();
 let form=page.locator('#edit-form');await form.waitFor();assert.match(await form.innerText(),/ÄR-000002/);assert.match(await form.innerText(),/Att koppla/);assert.match(await form.innerText(),/Okänd fastighet/);
 await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await form.locator('.issue-extra').evaluate(node=>node.open),true);await page.screenshot({path:path.join(artifacts,'mobile.png')});
 await form.locator('[data-editor-activate]').click();await form.locator('[name=issueHome]').selectOption('object:O1');await form.locator('[data-issue-save]').click();await form.waitFor({state:'detached'});
 stored=store.snapshot().data;assert.equal(stored.issues[1].id,'ÄR-000002');assert.equal(stored.issues[1].object_id,'O1');assert.equal(await page.locator('main [data-edit=activities][data-id="ÄR-000002"]').count(),0);
 await page.setViewportSize({width:1440,height:960});await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();await begin();await apply();
 stored=store.snapshot().data;assert.equal(stored.issues.length,2);assert.equal(stored.issues[1].id,'ÄR-000002');assert.equal(stored.issues[1].object_id,'O1');assert.deepEqual(stored.workspace.budgetPlans,seed.workspace.budgetPlans);assert.deepEqual(errors,[]);
 await begin(true);assert.equal(await page.locator('[data-apply]').isDisabled(),true);assert.match(await page.locator('[data-import-link-proposals]').innerText(),/Test 1.*F1/);assert.match(await page.locator('[data-import-link-proposals]').innerText(),/Ärende Adresskontroll/);await page.locator('[data-approve-link-proposals]').click();await ready();assert.match(await page.locator('[data-issue-home-result]').innerText(),/2 kopplade till fastighet.*1 att koppla/);assert.equal(await page.locator('[data-issue-number]').inputValue(),'activities.propertyId');assert.equal(await page.locator('[data-apply]').isDisabled(),false);
 await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(artifacts,'number-mapping-mobile.png')});await apply();
 stored=store.snapshot().data;assert.equal(stored.issues.length,5);assert.equal(stored.issues[2].property_id,'F1');assert.equal(stored.issues[2].object_id,null);assert.equal(stored.issues[3].property_id,'F1');assert.equal(stored.issues[4].property_id,null);assert.match(stored.issues[4].sources[0].matchingDecision.reason,/Ingen entydig/);
 await page.setViewportSize({width:1440,height:960});await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();await begin(true);assert.equal(await page.locator('[data-issue-number]').inputValue(),'activities.propertyId');await apply();
 stored=store.snapshot().data;assert.equal(stored.issues.length,5);assert.deepEqual(stored.workspace.budgetPlans,seed.workspace.budgetPlans);assert.deepEqual(errors,[]);
 console.log('PASS: ID-less Excel import in worker, preview, sequential IDs, Att koppla filter, source hints, linking with stable identity, reordered reimport, reload, SQLite, mobile/desktop property/management numbers, address lookup, conflict safety, saved column choices and preserved Budget. Screenshots: '+artifacts);
}catch(error){await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true});throw error;}
finally{await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
