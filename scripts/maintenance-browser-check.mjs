import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {chromium} from 'playwright';import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';import {createServer} from '../backend/lokaler/server.mjs';
import {emptyData,normalize} from '../frontend/lokaler/model.js';import {readWorkbook} from '../backend/lokaler/workbook.js';
const require=createRequire(import.meta.url),mode=process.env.LOKALBLICK_TEST_MODE||'sqlite',artifacts='/tmp/lokalblick-maintenance-check';await mkdir(artifacts,{recursive:true});
const seed=emptyData();for(const [table,record]of [
 ['properties',{id:'F1',name:'Testfastigheten',address:'Testgatan 1'}],['objects',{id:'O1',property_id:'F1',area:100}],['objects',{id:'O2',property_id:'F1',area:50}],['people',{id:'P1',name:'Testare'}],['contacts',{id:'C1',person_id:'P1',role:'coordinator',property_id:'F1'}]
])seed[table].push(normalize(table,record));seed.workspace.currentUser={name:'Testare'};
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['Datum utförande','Utförare'],['2026-10-20','Testare'],[],['','Nyskick','Bra skick - med anmärkningar','Dåligt skick - behöver åtgärdas','Kommentar','Senast åtgärdad (år)',2027,2028],['Våning 1'],['Hall'],['Tak','X','','','','Vet ej',10000,5000],['Golv','','','X','Sliten yta',2019],['El']
]),'Besiktningsunderlag');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Sammanställning',15000]]),'Sammanställning');
const importFile={name:'syntetisk-besiktning.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})};
const dir=await mkdtemp(path.join(os.tmpdir(),'maintenance-browser-')),store=await LocalStore.open({file:path.join(dir,mode==='excel'?'data.xlsx':'data.sqlite'),mode:mode==='browser-excel'?'sqlite':mode});if(mode!=='browser-excel')await store.replace(seed,0);
const server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
await page.route('https://**/*',async route=>{const url=route.request().url();if(url.endsWith('xlsx.full.min.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))});for(const ext of ['js','css'])if(url.endsWith('leaflet.'+ext))return route.fulfill({contentType:ext==='js'?'text/javascript':'text/css',body:await readFile(require.resolve('leaflet/dist/leaflet.'+ext))});return route.abort();});
await page.route('**/api/budget-index?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test"}'}));
await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"Test"}'}));
if(mode==='browser-excel')await page.route('**/api/runtime-config',route=>route.fulfill({contentType:'text/javascript',body:'window.LokalblickRuntime={};'}));
await page.addInitScript(()=>{window.showSaveFilePicker=async()=>await(await navigator.storage.getDirectory()).getFileHandle('maintenance.xlsx',{create:true});});
const nav=async view=>page.locator('.sidebar [data-view='+view+']').evaluate(button=>button.click());
const dialog=()=>page.locator('dialog.maintenance-dialog');
const submit=async()=>{await dialog().locator('[type=submit]').click();await dialog().waitFor({state:'detached'});};
const persisted=async()=>mode==='browser-excel'?readWorkbook(Buffer.from(await page.evaluate(async()=>Array.from(new Uint8Array(await(await(await navigator.storage.getDirectory()).getFileHandle('maintenance.xlsx')).getFile().then(file=>file.arrayBuffer())))))):store.snapshot().data;
async function importProtocol(){
 const picked=page.waitForEvent('filechooser');await page.locator('[data-maint-import]').click();await(await picked).setFiles(importFile);
 await dialog().getByRole('heading',{name:'Koppla flikar till objekt'}).waitFor();
 assert.equal(await dialog().locator('[name=sheet-0]').inputValue(),'','No name-based object creation or unsafe automatic link');
 await dialog().locator('[name=sheet-0]').selectOption('O2');await submit();
}
try{
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();
 if(mode==='browser-excel'){
  await page.evaluate(async data=>{await new Promise((resolve,reject)=>{const request=indexedDB.open('lokalblick-clean-workspace',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readwrite');tx.objectStore('workspace').put({data},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});sessionStorage.setItem('lokalblick-clean-active','1');},seed);
  await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();await nav('sources');await page.locator('[data-source=create]').first().click();await page.getByText('maintenance.xlsx',{exact:false}).first().waitFor();
 }
 await nav('objects');await page.locator('[data-edit=objects][data-id=O1]').first().click();await page.locator('[data-maintenance-record=objects]').click();await page.locator('#edit-form').waitFor({state:'detached'});assert.equal(await page.locator('[data-maint-object]').inputValue(),'O1');assert.equal(await page.locator('[data-maint-property]').inputValue(),'F1');
 await page.locator('[data-maint-space]').click();await dialog().locator('[name=name]').fill('Kök');await dialog().locator('[name=floor]').fill('Våning 2');await dialog().getByText('Delar (valfritt)',{exact:true}).click();await dialog().locator('[name=parts]').fill('Väggar\nTak\nGolv\nEl');await submit();
 assert.equal((await persisted()).building_parts.length,4);
 await page.locator('[data-maint-start]').click();await dialog().locator('[name=person]').selectOption('P1');await dialog().locator('[name=date]').fill('2026-10-20');await submit();
 assert.equal(await page.locator('[data-maint-assessment]').count(),4);assert((await persisted()).inspection_points.every(row=>row.assessment==='unchecked'));
 await page.locator('[data-maint-finish]').click();await dialog().locator('[type=submit]').click();await dialog().locator('[data-maint-error]').getByText(/Kontrollera alla/).waitFor();await dialog().locator('[data-maint-cancel]').click();
 for(let i=0;i<4;i++)await page.locator('[data-maint-assessment]').nth(i).selectOption(i===1?'defect':'ok');
 await page.locator('[data-maint-point]').nth(1).click();await dialog().locator('[name=comment]').fill('Spricka i takytan.');await dialog().getByText('Bild (förberett)',{exact:true}).click();await dialog().locator('[name=photo]').fill('C:\\Besiktningar\\foto.jpg');await submit();
 await page.locator('[data-maint-issue]').click();await submit();const form=page.locator('#edit-form');await form.waitFor();
 let data=await persisted();assert.equal(data.issues.length,1);assert.equal(data.objects.find(row=>row.id==='O1').area,100);assert.equal(data.issues[0].object_id,'O1');assert.equal(data.issues[0].include_in_budget,'Nej');assert.match(await form.innerText(),/Spricka i takytan/);await form.locator('[data-editor-close]').click();
 const settings=page.locator('.maintenance-space .maintenance-settings');await settings.locator('summary').click();await settings.locator('[data-maint-part-responsibility]').nth(1).selectOption('tenant');
 await page.locator('[data-maint-add-part]').click();await dialog().locator('[name=name]').fill('Ventilation');await submit();assert.equal(await page.locator('[data-maint-assessment]').count(),5);await page.locator('[data-maint-assessment]').last().selectOption('ok');
 await page.locator('[data-maint-finish]').click();await submit();assert.equal(await page.locator('[data-maint-assessment]').count(),0);assert.match(await page.locator('.maintenance-inspection').innerText(),/Besiktning 2026-10-20/);
 const first=(await persisted()).inspection_points.map(row=>({...row}));
 await page.locator('[data-maint-start]').click();await dialog().locator('[name=person]').selectOption('P1');await dialog().locator('[name=date]').fill('2027-10-20');await submit();
 data=await persisted();assert.equal(data.inspections.length,2);assert(data.inspection_points.filter(row=>!first.some(old=>old.id===row.id)).every(row=>row.assessment==='unchecked'&&!row.comment));assert.equal(data.issues.length,1);assert.equal(data.inspection_points.filter(row=>row.issue_id===data.issues[0].id).length,2);
 await importProtocol();data=await persisted();assert.equal(data.inspections.length,3);assert.equal(data.people.length,1);assert.equal(data.spaces.length,2);assert.equal(data.objects.length,2);assert.equal(data.inspection_points.filter(row=>row.source_plans?.length).length,1);
 await importProtocol();assert.equal((await persisted()).inspections.length,3);
 await page.locator('[data-maint-object]').selectOption('O2');await page.locator('[data-maint-room] > summary').click();
 assert.match(await page.locator('.maintenance-page').innerText(),/1 brister.*1 OK.*1 ej kontrollerade/);
 assert.equal(await page.locator('.maintenance-history').evaluate(node=>node.open),false);
 await page.screenshot({path:path.join(artifacts,mode+'-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(artifacts,mode+'-mobile.png'),fullPage:true});
 await page.locator('[data-maint-point]').first().click();await dialog().getByText('Importerad planering',{exact:true}).click();assert.match(await dialog().innerText(),/2027: 10.*000 kr/);assert.equal(await dialog().evaluate(node=>node.scrollWidth<=node.clientWidth),true);await page.screenshot({path:path.join(artifacts,mode+'-detail-mobile.png')});await dialog().locator('[data-maint-cancel]').click();
 await page.locator('[data-maint-search]').fill('Golv');assert.equal(await page.locator('.maintenance-part').count(),1);await page.locator('[data-maint-search]').fill('');assert.equal(await page.locator('.maintenance-part').count(),3);
 await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();await nav('maintenance');await page.locator('[data-maint-object]').selectOption('O2');assert.match(await page.locator('.maintenance-page').innerText(),/Besiktning 2026-10-20/);
 data=await persisted();assert.equal(data.inspections.length,3);assert.equal(data.inspection_points.length,13);assert.deepEqual(data.inspection_points.filter(row=>first.some(old=>old.id===row.id)).map(row=>({...row})),first);assert(data.workspace.auditLog.some(row=>row.collection==='inspectionPoints'));assert.equal(data.recurring_costs.length,0);
 await page.setViewportSize({width:1440,height:960});await nav('properties');await page.getByRole('button',{name:'Testfastigheten',exact:true}).click();await page.locator('[data-maintenance-record=properties]').click();await page.locator('#edit-form').waitFor({state:'detached'});
 assert.equal(await page.locator('[data-maint-property]').inputValue(),'F1');assert.equal(await page.locator('[data-maint-object]').inputValue(),'');assert.equal(await page.locator('[data-maint-room]').count(),0,'Property and object parts are separate homes');
 await page.locator('[data-maint-space]').click();await dialog().locator('[name=name]').fill('Entré');await dialog().locator('[name=assessment]').selectOption('defect');await dialog().locator('[name=comment]').fill('Fuktfläck i entrén');await dialog().getByText('Bild (förberett)',{exact:true}).click();await dialog().locator('[name=photo]').fill('C:\\Besiktningar\\entre.jpg');await submit();
 data=await persisted();const propertyInspection=data.inspections.find(row=>row.property_id==='F1');assert(propertyInspection);assert.equal(propertyInspection.object_id,null);const propertyPoint=data.inspection_points.find(row=>row.inspection_id===propertyInspection.id);assert(propertyPoint.space_id);assert.equal(propertyPoint.part_id,null);assert.equal(propertyPoint.assessment,'defect');assert.equal(propertyPoint.comment,'Fuktfläck i entrén');assert(propertyPoint.photo_reference.endsWith('entre.jpg'));assert.equal(data.objects.length,2);assert.equal(data.objects[0].area,100);
 await page.locator('[data-maint-point]').click();assert.equal(await dialog().locator('[name=assessment]').inputValue(),'defect');assert.equal(await dialog().locator('[name=comment]').inputValue(),'Fuktfläck i entrén');await dialog().locator('[data-maint-cancel]').click();
 await page.locator('[data-maint-issue]').click();await submit();await page.locator('#edit-form').waitFor();data=await persisted();assert.equal(data.issues.length,2);assert(data.issues.some(row=>row.property_id==='F1'&&!row.object_id));await page.locator('#edit-form [data-editor-close]').click();
 await page.locator('[data-maint-inspection-info]').click();await dialog().locator('[name=person]').selectOption('P1');await submit();await page.locator('[data-maint-finish]').click();await submit();
 await page.screenshot({path:path.join(artifacts,mode+'-property-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(artifacts,mode+'-property-mobile.png'),fullPage:true});
 await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();await nav('maintenance');await page.locator('[data-maint-property]').selectOption('F1');assert.equal(await page.locator('[data-maint-object]').inputValue(),'');await page.locator('[data-maint-room] > summary').click();assert.match(await page.locator('.maintenance-page').innerText(),/Fuktfläck i entrén/);assert.doesNotMatch(await page.locator('.maintenance-page').innerText(),/Spricka i takytan/);
 if(mode==='browser-excel')assert.equal(store.snapshot().data.inspections.length,0,'Browser mode never uploads inspection data to the API');
 assert.deepEqual(errors,[]);console.log('PASS '+mode+': direct property/object navigation, room assessments, free text, image references, rooms, parts, unchecked defaults, explicit closing, immutable history, linked issues without duplicates, responsibility, matrix import/reimport, source plans, source trace, desktop/mobile, reload and persistent Excel. Screenshots: '+artifacts);
}catch(error){await page.screenshot({path:path.join(artifacts,mode+'-failure.png'),fullPage:true});throw error;}
finally{await page.close();await browser.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
