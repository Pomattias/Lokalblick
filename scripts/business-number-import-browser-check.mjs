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
import {approveAllImportRecords,withImportColumnSettings} from './helpers/import-approval.mjs';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-business-numbers';await mkdir(artifacts,{recursive:true});
const workbook=XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
 ['Förvaltningsobjekt','Avtalsnummer','Gatuadress','Area','From','Tom','Bashyra','Hyra justeringsregel','Fastighetsförvaltare','Ort'],
 ['4201','SF4201-001-03','Syntetisk gränd 1',100,'2027-01-01','2029-12-31',10000,'none','TEST001 Anna Testsson','Teststad'],
 ['4201','SF4201-002-3','Syntetisk gränd 1',200,'2027-01-01','2029-12-31',20000,'none','TEST001 Anna Testsson','Teststad']
]),'Syntetiskt');
const bytes=Array.from(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const mode of ['sqlite','excel'])for(const existing of [false,true]){
  const dir=await mkdtemp(join(tmpdir(),'business-numbers-')),file=join(dir,mode==='excel'?'data.xlsx':'data.sqlite');let store=await LocalStore.open({file,mode});
  const base=emptyData();base.workspace.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:54321}}];
  if(existing){base.properties.push(normalize('properties',{id:'FAS-ab123cd',management_object_number:'4201',name:'Syntetisk gränd 1',address:'Syntetisk gränd 1',city:'Teststad'}));base.objects.push(normalize('objects',{id:'OB-SF4201-001-03',property_id:'FAS-ab123cd'}));base.agreements.push(normalize('agreements',{id:'SF4201-001-03',object_id:'OB-SF4201-001-03',valid_from:'2027-01-01',valid_to:'2029-12-31'}));}
  await store.replace(base,store.snapshot().version);
  const server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];let posts=0;
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/lokaler/workspace'))posts++;});
  await page.route('https://**/*',async route=>route.request().url().endsWith('xlsx.full.min.js')?route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))}):route.abort());
  await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic fixture"}'}));
  await page.addInitScript(bytes=>{window.showOpenFilePicker=async()=>[{name:'syntetiska-nummer.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetiska-nummer.xlsx')}];},bytes);
  const ready=()=>page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
  const begin=async()=>{await page.locator('.sidebar [data-view=sources]').evaluate(node=>node.click());await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();await ready();};
  const noInternal=async node=>assert.doesNotMatch(await node.innerText(),/FAS-|OB-|PER-|KOP-|\bbase\|/);
  try{
   await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await page.evaluate(()=>{window.LokalblickGeocodingService=null;});
   await begin();const baseline=JSON.stringify(store.snapshot());
   const columns=page.locator('.import-column-row');assert.equal(await columns.count(),10);assert.equal(await columns.locator('select').count(),20);assert.equal(await columns.locator('small,details,button').count(),0);assert.doesNotMatch(await columns.allInnerTexts().then(rows=>rows.join(' ')),/Fler kolumnval|ifyllda|fältändringar/);
   await page.locator('.import-mapping-dialog').evaluate(node=>node.scrollTop=0);await page.screenshot({path:join(artifacts,mode+'-'+existing+'-overview.png')});
   await withImportColumnSettings(page,'From',async settings=>{assert.equal(await settings.locator('[data-date-mode]').count(),1);await settings.locator('[data-date-mode]').selectOption('auto');await ready();});
   await page.locator('[data-open-row]').first().click();const detail=page.locator('.import-row-detail').first();await noInternal(detail);assert.match(await detail.innerText(),/Fastighetsnummer: SF4201/);assert.match(await detail.locator('[data-chain-table=objects]').innerText(),/Objekt SF4201-001/);assert.match(await detail.locator('[data-chain-table=agreements]').innerText(),/Avtal SF4201-001-03/);
   await detail.locator('[data-add-contact]').click();await noInternal(page.locator('.import-contact-dialog'));await page.locator('[data-contact-cancel]').click();
   await page.locator('[data-new-records]').evaluate(node=>node.open=true);await noInternal(page.locator('[data-new-records]'));
   await detail.locator('.import-link-chain').scrollIntoViewIfNeeded();await page.screenshot({path:join(artifacts,mode+'-'+existing+'-desktop.png')});await page.setViewportSize({width:390,height:900});assert(await page.locator('.import-mapping-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth));await page.screenshot({path:join(artifacts,mode+'-'+existing+'-mobile.png')});await page.setViewportSize({width:1440,height:960});
   await page.locator('[data-cancel]').click();await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,0);assert.equal(JSON.stringify(store.snapshot()),baseline,'Cancel does not write');
   await begin();await approveAllImportRecords(page);await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,1);
   let data=(await store.readSnapshot()).data;assert.equal(data.properties.length,1);assert.equal(data.properties[0].id,existing?'FAS-ab123cd':'SF4201');assert.equal(data.objects.length,2);assert(data.objects.some(o=>o.id==='SF4201-002'));assert.equal(data.agreements.find(a=>a.id==='SF4201-001-03').object_id,existing?'OB-SF4201-001-03':'SF4201-001');assert.equal(data.agreement_items.length,2);assert.equal(data.people.length,1);assert.equal(data.contacts.length,1);assert.deepEqual(data.workspace.budgetPlans,base.workspace.budgetPlans);
   await page.locator('.sidebar [data-view=objects]').evaluate(node=>node.click());await noInternal(page.locator('main'));const object=page.locator('[data-edit=objects]').filter({hasText:'SF4201-001'});await object.click();await page.locator('[data-context-tab=info]').click();assert.equal(await page.locator('#edit-form [name=id]').inputValue(),'SF4201-001');await page.locator('[data-editor-close]').click();
   await begin();assert.equal(await page.locator('[data-new-records]').count(),0);await page.locator('[data-open-row]').first().click();await noInternal(page.locator('.import-row-detail'));await page.locator('[data-apply]').click();await page.locator('.import-progress-dialog').waitFor({state:'detached'});assert.equal(posts,2);data=(await store.readSnapshot()).data;assert.equal(data.objects.length,2);assert.equal(data.contacts.length,1);assert.deepEqual(errors,[]);
   console.log('PASS '+mode+' '+(existing?'saved keys':'new SF chain')+': compact headers, editable settings, business labels, contact picker, cancel, approval, save/reimport, object editor and budgets');
  }catch(error){await page.screenshot({path:join(artifacts,'failure-'+mode+'-'+existing+'.png'),fullPage:true});throw error;}
  finally{await page.close();await new Promise(resolve=>server.close(resolve));await store.close();}
  store=await LocalStore.open({file,mode});assert.equal(store.snapshot().data.objects.length,2);await store.close();await rm(dir,{recursive:true,force:true});
 }
}finally{await browser.close();}
console.log('Screenshots: '+artifacts);
