import {approveAllImportRecords} from './helpers/import-approval.mjs';
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
 ['Lokallista',[['Förvaltningsobjekt','Gatuadress','Avtalsnummer','Area','Årshyra','Fr.o.m.','T.o.m.','Specialvillkor','Internt kostnadsställe','Uppsagd den','Uppsägningsorsak','Användning','Hyresgästens kontaktperson','Kontaktens e-post','Avtalsansvarig','Ansvarigs e-post'],['P-1','Testgatan 1','A-1',425,120000,'2025-01-01','2028-12-31','FÅR INTE IMPORTERAS','K-42','2027-04-30','Avveckling','Träffpunkt','Anna Lind','anna.lind@example.invalid','Johan Ek','johan@example.invalid']]],
 ['Lokalbestånd',[['Objektsnummer / Förvaltningsobjekt','Avtalsnummer','Ort','Kommentar verksamhet','Antal medarbetare (viss+ heltid)','Lokalkategori (LEB)','Lägenheter (yta)','Länk avtal (Huvudkontrakt)','Fastighetsägare'],['P-1','A-1','Malmö','Kommunal primärvård.','12,5','KP Kontor- och personallokaler','245,5','https://example.invalid/A-1.pdf','Testbolaget AB']]],
]),file('syntetiska-personer.xlsx',[
 ['Personer',[['Namn','E-post','Telefon'],['Anna Lind','anna.lind@example.invalid','0700000001'],['Annan Person','annalind@example.invalid','0700000002']]],
])];
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true,executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.type()==='prompt'&&dialog.message().includes('Ange ditt namn')?dialog.accept('Importtest'):dialog.dismiss());
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
 const choose=async(key,search,target)=>{await page.locator(`[data-preview-map="${key}"]`).evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});await page.locator(`[data-preview-map="${key}"]`).click();await page.locator('[data-field-search]').fill(search);await page.locator(`[data-target="${target}"]`).click();await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();};
 await open();
 assert.equal(await page.locator('[data-existing],[data-preview-collection],[data-extra]').count(),0);
 assert.equal(await page.locator('[data-preview-map]').count(),28);
 assert.equal(await page.locator('[data-apply]').isDisabled(),true);
 assert.ok(!(await page.locator('.import-mapping-dialog').innerText()).includes('Kompletterande information'));
 await page.screenshot({path:`${artifacts}/pending-1280.png`});
 await choose('0:8','kostnadsställe','contracts.costCenterPremises');
 await page.locator('[data-ignore-column="0:7"]').click();
 await choose('0:12','hyresgästens kontaktperson','contracts.tenantResponsiblePersonId');
 await choose('0:13','hyresgästens e-post','contact.12.email');
 await choose('0:14','ansvarig hos oss','contracts.responsiblePersonId');
 await choose('0:15','Avtalsansvarig e-post','contact.14.email');
 assert.equal(await page.locator('[data-apply]').isEnabled(),true);
 // A saved or manually chosen duplicate identifier cannot slip through as a
 // seemingly successful partial import; it must be corrected in this dialog.
 await choose('0:8','fastighets-id','properties.sourceId');
 assert.equal(await page.locator('[data-apply]').isDisabled(),true);
 assert.ok((await page.locator('[data-mapping-conflicts]').innerText()).includes('Förvaltningsobjekt och Internt kostnadsställe'));
 assert.equal(await page.locator('[data-column-group="conflict"]').getAttribute('open'),'');
 await page.setViewportSize({width:390,height:950});assert.ok(await page.locator('.import-mapping-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:`${artifacts}/duplicate-identifier-390.png`});
 await choose('0:8','kostnadsställe','contracts.costCenterPremises');assert.equal(await page.locator('[data-mapping-conflicts]').count(),0);assert.equal(await page.locator('[data-apply]').isEnabled(),true);
 await page.locator('[data-column-group="mapped"]').evaluate(node=>node.open=true);
 for(const width of [1280,390,320]){
  await page.setViewportSize({width,height:950});
  const dimensions=await page.locator('.import-mapping-dialog').evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,'No horizontal scroll at '+width);
  await page.screenshot({path:`${artifacts}/review-${width}.png`});
 }
 await choose('0:8','kostnadsställe','contracts.costCenterPremises');
 await page.locator('[data-apply]').click();await approveAllImportRecords(page);await page.locator('.import-mapping-dialog').waitFor({state:'detached'});
 await page.locator('.import-progress-dialog').waitFor({state:'detached'});
 const loaded=()=>page.evaluate(()=>LokalblickDataService.load());
 const first=await loaded();assert.equal(first.properties.length,1);assert.equal(first.contracts.length,1);assert.equal(first.people.length,3);
 assert.equal(first.organizations.length,1);assert.equal(first.organizations[0].name,'Testbolaget AB');assert.equal(first.properties[0].ownerPartyId,first.organizations[0].id);
 assert.equal(first.assignments.length,2);assert.equal(first.contracts[0].tenantResponsiblePersonId,first.people.find(person=>person.name==='Anna Lind').id);assert.equal(first.contracts[0].responsiblePersonId,first.people.find(person=>person.name==='Johan Ek').id);
 assert.equal(first.objects[0].area,425);assert.equal(first.contracts[0].area,425);assert.equal(first.objects[0].start||'','');assert.equal(first.objects[0].end||'','');
 assert.equal(first.contracts[0].costCenterPremises,'K-42');assert.equal(first.contracts[0].baseRent,120000);assert.equal(first.contracts[0].end,'2028-12-31');
 const fields={terminatedOn:'2027-04-30',terminationReason:'Avveckling',use:'Träffpunkt',businessComment:'Kommunal primärvård.',employees:12.5,category:'KP Kontor- och personallokaler',apartmentArea:245.5,contractDocumentUrl:'https://example.invalid/A-1.pdf'};
 for(const [field,value] of Object.entries(fields))assert.equal(first.contracts[0][field],value,field);
 assert.ok(!JSON.stringify(first).includes('FÅR INTE IMPORTERAS'));assert.equal(first.contracts[0].supplemental,undefined);
 const canonical=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('lokalblick-clean-workspace',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('workspace','readonly'),read=tx.objectStore('workspace').get('current');read.onsuccess=()=>resolve(read.result.data);read.onerror=()=>reject(read.error);tx.oncomplete=()=>db.close();};request.onerror=()=>reject(request.error);}));
 assert.equal((await canonical()).agreements[0].area,undefined);assert.equal((await canonical()).objects[0].apartment_area,245.5);
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#content > *').first().waitFor();await navigate();assert.equal((await loaded()).contracts.length,1);
 await open();assert.equal(await page.locator('[data-column-group="pending"]').count(),0);assert.equal(await page.locator('[data-apply]').isEnabled(),true);
 assert.ok((await page.locator('[data-import-result]').innerText()).includes('Oförändrade'));
 await page.locator('[data-apply]').click();await approveAllImportRecords(page);await page.locator('.import-mapping-dialog').waitFor({state:'detached'});await page.locator('.import-progress-dialog').waitFor({state:'detached'});
 const again=await loaded();assert.equal(again.people.length,3);assert.equal(again.assignments.length,2);assert.equal(again.properties.length,1);assert.equal(again.contracts.length,1);assert.equal(again.auditLog.length,first.auditLog.length);
 // Cancelling a changed choice never persists its new rules or values.
 await open();await choose('0:8','kommentar','contracts.comment');await page.locator('[data-cancel]').click();
 assert.deepEqual(await loaded(),again);
 // The agreement keeps the imported source values and edits each real field once.
 await page.locator('.sidebar [data-view="contracts"]').evaluate(button=>button.click());await page.locator('[data-open-contract]').first().click();
 const form=page.locator('#edit-form');await form.waitFor();
 assert.equal(await form.locator('[data-object-area]').innerText(),'425');assert.equal(await form.locator('[name=area]').count(),0);
 await form.locator('[data-contract-context]>summary').click();await form.locator('[data-contract-notice-terms]>summary').click();
 for(const [field,value] of Object.entries(fields)){
  assert.equal(await form.locator(`[name="${field}"]`).count(),1,field);
  assert.equal(await form.locator(`[name="${field}"]`).inputValue(),String(value),field);
 }
 assert.equal(await form.locator('.contract-document a').getAttribute('href'),fields.contractDocumentUrl);
 for(const width of [390,1280]){await page.setViewportSize({width,height:950});assert.ok(await form.evaluate(node=>node.scrollWidth<=node.clientWidth+1));await page.screenshot({path:`${artifacts}/agreement-fields-${width}.png`});}
 await form.locator('[data-editor-activate]').click();
 await form.locator('[name="businessComment"]').fill('Kompletterad verksamhetskommentar.');await form.locator('[name="employees"]').fill('13.5');await form.locator('[name="terminatedOn"]').fill('2027-05-31');
 await form.locator('[type="submit"]').click();
 assert.deepEqual(await form.locator(':invalid').evaluateAll(nodes=>nodes.map(node=>({name:node.name,value:node.value,message:node.validationMessage}))),[],'Native agreement controls remain valid');
 await page.waitForFunction(()=>!document.querySelector('#edit-form')||document.querySelector('#notice.error'));
 assert.equal(await form.count(),0,await page.locator('#notice').innerText());
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#content > *').first().waitFor();
 const edited=(await loaded()).contracts[0];assert.equal(edited.businessComment,'Kompletterad verksamhetskommentar.');assert.equal(edited.employees,13.5);assert.equal(edited.terminatedOn,'2027-05-31');assert.equal(edited.category,fields.category);assert.equal(edited.contractDocumentUrl,fields.contractDocumentUrl);
 // Editing object area updates the derived agreement value, without storing
 // another copy or inventing object dates.
 await page.locator('.sidebar [data-view="objects"]').evaluate(button=>button.click());await page.locator('[data-edit="objects"]').first().click();
 await form.locator('[data-context-tab="info"]').click();await form.locator('[data-editor-activate]').click();await form.locator('[name="area"]').fill('500');await form.locator('[type="submit"]').click();await form.waitFor({state:'detached'});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('#content > *').first().waitFor();
 const resized=await loaded();assert.equal(resized.objects[0].area,500);assert.equal(resized.contracts[0].area,500);assert.equal((await canonical()).agreements[0].area,undefined);assert.equal(resized.objects[0].start||'','');assert.equal(resized.objects[0].end||'','');
 await page.locator('.sidebar [data-view="contracts"]').evaluate(button=>button.click());await page.locator('[data-open-contract]').first().click();assert.equal(await form.locator('[data-object-area]').innerText(),'500');await form.locator('[data-editor-close]').click();
 // After city completion the progress dialog describes saving, even if storage waits.
 const isolated=await browser.newContext({viewport:{width:390,height:900}}),cityPage=await isolated.newPage();
 await cityPage.route('https://**/*',route=>{
  const url=route.request().url();if(url.includes('xlsx'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});return route.abort();
 });
 await cityPage.addInitScript(file=>{window.showOpenFilePicker=async()=>[{queryPermission:async()=> 'granted',getFile:async()=>({name:file.name,arrayBuffer:async()=>new Uint8Array(file.bytes).buffer})}];},files[0]);
 await cityPage.goto('http://127.0.0.1:8805/v2/index.html');
 await cityPage.locator('.sidebar [data-view="sources"]').evaluate(button=>button.click());
 await cityPage.locator('[data-source="import"]').click();await cityPage.locator('[data-import-start]').click();await cityPage.locator('[data-ignore-unmapped]').click();
 await cityPage.locator('.import-mapping-dialog[aria-busy=false]').waitFor();await cityPage.locator('[data-column-group="mapped"]').evaluate(node=>node.open=true);await cityPage.locator('[data-ignore-column="1:2"]').click();
 await cityPage.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
 const cityIdentities=cityPage.locator('[data-person-identity]');for(let i=0;i<await cityIdentities.count();i++)await cityIdentities.nth(i).check();
 await cityPage.locator('[data-apply]:not([disabled])').waitFor();
 await cityPage.evaluate(()=>{const open=indexedDB.open.bind(indexedDB);indexedDB.open=(name,...args)=>{const request=open(name,...args);if(name==='lokalblick-clean-workspace')Object.defineProperty(request,'onsuccess',{set(handler){request.addEventListener('success',event=>{window.releaseImportSave=()=>handler.call(request,event);},{once:true});}});return request;};});
 await cityPage.locator('[data-apply]').click();await approveAllImportRecords(cityPage);await cityPage.locator('[data-city-value]').fill('Malmö');await cityPage.locator('[data-city-apply]').click();
 await cityPage.waitForFunction(()=>typeof window.releaseImportSave==='function');
 assert.equal(await cityPage.locator('.import-progress-dialog h2').innerText(),'Sparar import');
 assert.ok((await cityPage.locator('[data-import-progress-message]').innerText()).startsWith('Sparar godkända'));
 await cityPage.evaluate(()=>window.releaseImportSave());await cityPage.locator('.import-progress-dialog').waitFor({state:'detached'});
 assert.equal(await cityPage.evaluate(async()=>(await LokalblickDataService.load()).properties.length),1);
 await isolated.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: duplicate identifiers block apply and are corrected in place, owner names become linked parties, multiple person roles, canonical object area, blank dates, object editing, idempotent reimport, reload and mobile fit.');
}finally{await browser?.close();server.kill('SIGTERM');}
