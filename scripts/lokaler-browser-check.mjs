import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {chromium} from 'playwright';import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';import {createServer} from '../backend/lokaler/server.mjs';import {readWorkbook} from '../backend/lokaler/workbook.js';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-clean-import-check';await mkdir(artifacts,{recursive:true});
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['FastighetsID','Fastighetsbeteckning','Gatuadress','Ort','ObjektID','Area','Antal lägenheter','Avtalsnummer','Hyresgäst','Årshyra','Samordnare','Hyresgästens kontaktperson','Hyra justeringsregel','Ovidkommande'],
 ['F1','Eken 1','Testgatan 1','Malmö','O1',100,2,'9(1)','Fiktiv hyresgäst',100000,'Anna Test','Kim Test','none','Sparas inte'],
 ['F1','Eken 1','Testgatan 1','Malmö','O2',50,1,'91','Fiktiv hyresgäst',50000,'Anna Test','Kim Test','none','Sparas inte'],
 ['F2','Björken 1','Testgatan 2','Malmö','O3',80,0,'91,1','Fiktiv hyresgäst',80000,'Anna Test','Kim Test','none','Sparas inte']
]),'Underlag');const sourceBytes=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
async function scenario(mode){
 const dir=await mkdtemp(path.join(os.tmpdir(),'clean-app-')),store=await LocalStore.open({file:path.join(dir,mode==='excel'?'data.xlsx':'data.sqlite'),mode:mode==='browser-excel'?'sqlite':mode}),server=createServer(store);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const page=await browser.newPage({viewport:{width:1440,height:940}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
 await page.route('https://**/*',async route=>{const url=route.request().url();if(url.endsWith('xlsx.full.min.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))});for(const ext of ['js','css'])if(url.endsWith('leaflet.'+ext))return route.fulfill({contentType:ext==='js'?'text/javascript':'text/css',body:await readFile(require.resolve('leaflet/dist/leaflet.'+ext))});return route.abort();});
 await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"GEOCODING_NOT_CONFIGURED","error":"Test"}'}));
 await page.route('**/api/budget-index?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test"}'}));
 if(mode==='browser-excel')await page.route('**/api/runtime-config',route=>route.fulfill({contentType:'text/javascript',body:'window.LokalblickRuntime={};'}));
 await page.addInitScript(bytes=>{
  const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-19T12:00:00Z']));}static now(){return NativeDate.parse('2026-10-19T12:00:00Z');}};
  window.showOpenFilePicker=async options=>options?.multiple?[{name:'syntetiskt.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetiskt.xlsx')}]:[await(await navigator.storage.getDirectory()).getFileHandle('clean-data.xlsx')];
  window.showSaveFilePicker=async()=>await(await navigator.storage.getDirectory()).getFileHandle('clean-data.xlsx',{create:true});
 },sourceBytes);
 const nav=async name=>{await page.locator('.sidebar [data-view='+name+']').evaluate(button=>button.click());};
 const importFile=async()=>{
  await nav('sources');await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();
  await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();
  await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
  const ignore=page.locator('[data-ignore-unmapped]');if(await ignore.count()){await ignore.click();await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();}
  await page.locator('[data-column-group=mapped]').evaluate(node=>node.open=true);
  const identities=page.locator('[data-person-identity]');for(let i=0;i<await identities.count();i++){await identities.nth(i).check();await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();}
  if(await page.locator('.import-mapping-dialog [data-apply]').isDisabled())throw Error(await page.locator('.import-mapping-dialog').innerText());const apply=page.locator('.import-mapping-dialog [data-apply]');assert.equal(await apply.isDisabled(),false,await page.locator('.import-mapping-dialog').innerText());await apply.click();
  await page.locator('.import-progress-dialog').waitFor({state:'detached'});await page.locator('.import-mapping-dialog').waitFor({state:'detached'});
 };
 const persisted=async()=>{
  if(mode!=='browser-excel')return store.snapshot().data;
  const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await(await navigator.storage.getDirectory()).getFileHandle('clean-data.xlsx')).getFile().then(file=>file.arrayBuffer()))));return readWorkbook(Buffer.from(bytes));
 };
 try{
  await page.goto(base);await page.locator('[data-dashboard-mode]').first().waitFor();
  await importFile();
  if(mode==='browser-excel'){await page.locator('[data-source=create]').first().click();await page.getByText('clean-data.xlsx',{exact:false}).first().waitFor();}
  let data=await persisted();assert.equal(data.properties.length,2);assert.equal(data.objects.length,3);assert.equal(data.agreements.length,3);assert.equal(data.people.length,2);assert.equal(data.contacts.length,5);assert.equal(data.workspace.importReview.length,0);
  assert.ok(!JSON.stringify(data).includes('Sparas inte'));assert.deepEqual(data.agreements.map(a=>a.number),['9(1)','91','91,1']);
  await importFile();data=await persisted();assert.equal(data.agreements.length,3);assert.equal(data.contacts.length,5);
  await nav('overview');await page.locator('[data-dashboard-mode]').first().waitFor();await page.screenshot({path:path.join(artifacts,mode+'-overview.png'),fullPage:true});
  await nav('contracts');await page.locator('[data-open-contract]').first().click();const form=page.locator('#edit-form');const agreementId=await form.getAttribute('data-record-id');await form.locator('[data-editor-activate]').click();await form.locator('[name=businessComment]').evaluate(node=>{for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});await form.locator('[name=businessComment]').fill('Verifierad kommentar');await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  data=await persisted();assert.equal(data.agreements.find(row=>row.id===agreementId).business_comment,'Verifierad kommentar');assert.ok(data.agreements.every(a=>a.area===undefined));
  await nav('objects');await page.locator('[data-edit=objects]').first().click();await form.locator('[data-context-tab=info]').click();await form.locator('[data-editor-activate]').click();assert.equal(await form.locator('[name=rooms]').count(),0);const objectId=await form.getAttribute('data-record-id');await form.locator('[name=area]').fill('125');await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  data=await persisted();assert.equal(data.objects.find(row=>row.id===objectId).area,125);
  await page.reload();await page.locator('#content > *').first().waitFor();await nav('properties');assert.match(await page.locator('#content').innerText(),/Eken 1/);
  await page.setViewportSize({width:390,height:900});for(const view of ['overview','properties','contracts','activities','map','sources']){await nav(view);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,view+' mobile overflow');}
  await page.screenshot({path:path.join(artifacts,mode+'-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  if(mode==='browser-excel')assert.equal(store.snapshot().data.properties.length,0,'Browser Excel never uploads records to the API');
  console.log(mode+': original overview, reviewed import, reimport, editors, persistence and mobile passed');
 }catch(error){await page.screenshot({path:path.join(artifacts,mode+'-failure.png'),fullPage:true});throw error;}
 finally{await page.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
}
try{for(const mode of process.env.LOKALBLICK_TEST_MODE?[process.env.LOKALBLICK_TEST_MODE]:['sqlite','excel','browser-excel'])await scenario(mode);console.log('Screenshots: '+artifacts);}finally{await browser.close();}
