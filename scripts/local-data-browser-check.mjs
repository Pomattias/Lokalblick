import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {createServer} from '../backend/lokaler/server.mjs';
import {localDataHeaders,localAgreementId,localDataRow} from '../tests/helpers/local-data-fixture.js';

const require=createRequire(import.meta.url),count=80,artifacts='/tmp/lokalblick-local-data';
await mkdir(artifacts,{recursive:true});
const bytes=(headers,rows)=>{
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,[],...rows]),'Lokaldata');
 return Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
};
const firstHeaders=['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID','Avtalsnummer','Area','Ort'];
const firstRows=Array.from({length:count},(_,i)=>['property-a','Testfastighet','Testgatan 1','object-'+i,localAgreementId(i),100+i,'Teststad']);
const rows=Array.from({length:count},(_,i)=>localDataRow(i));
const updated=rows.map(row=>row.map((value,index)=>index===2?'009999':value)).reverse();
const files=[bytes(firstHeaders,firstRows),bytes(localDataHeaders,rows),bytes(localDataHeaders,updated),bytes(localDataHeaders,updated)];
const dir=await mkdtemp(join(tmpdir(),'local-data-browser-')),file=join(dir,'data.sqlite');
let store=await LocalStore.open({file}),server=createServer(store),browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
 await page.route('https://**/*',async route=>{
  if(route.request().url().endsWith('xlsx.full.min.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))});
  return route.abort();
 });
 await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"error":"Test"}'}));
 await page.addInitScript(files=>{
  let chosen=Number(sessionStorage.getItem('local-data-file')||0);
  window.showOpenFilePicker=async()=>{
   const index=chosen++;sessionStorage.setItem('local-data-file',String(chosen));
   return [{name:'syntetisk-'+index+'.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(files[index])],'syntetisk-'+index+'.xlsx')}];
  };
 },files);
 const ready=()=>page.locator('.import-mapping-dialog[aria-busy="false"]').waitFor();
 const begin=async()=>{
  await page.locator('.sidebar [data-view=sources]').evaluate(node=>node.click());
  await page.locator('[data-source=import]').click();
  await page.locator('[data-import-sheet]').first().waitFor();
  await page.locator('[data-import-select=all]').click();
  await page.locator('[data-import-start]').click();
  await ready();
 };
 const apply=async()=>{
  assert.equal(await page.locator('[data-apply]').isDisabled(),false);
  const response=page.waitForResponse(response=>response.url().endsWith('/api/lokaler/workspace')&&response.request().method()==='POST');
  await page.locator('[data-apply]').click();
  assert.equal((await response).status(),200);
  await page.locator('.import-progress-dialog').waitFor({state:'detached'});
  await page.locator('.import-mapping-dialog').waitFor({state:'detached'});
  await page.locator('[data-import-receipt]').first().waitFor();
 };
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-dashboard-mode]').first().waitFor();
 await begin();assert.equal(await page.locator('[data-approve-link]').count(),0);await apply();
 let saved=(await store.readSnapshot()).data;
 assert.equal(saved.properties[0].id,'property-a');assert.equal(saved.agreements.length,count);
 const budget=[{year:2027,status:'Låst',lines:[{sourceType:'contract',sourceId:localAgreementId(0),amount:12345}]}];
 const before=await store.readSnapshot();
 await store.replace({...before.data,workspace:{...before.data.workspace,budgetPlans:budget,importFieldPreferences:{'contracts|costcenter|syntetisk-2.xlsx':'reject'}}},before.version);
 await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();
 await begin();
 assert.match(await page.locator('[data-import-reused-links]').innerText(),/80 avtal.*sparade/);
 assert.equal(await page.locator('[data-approve-link]').count(),0);
 assert.equal(await page.locator('[data-column-group=pending]').count(),0);
 assert.equal(await page.locator('[data-import-conflict-mode]').inputValue(),'review');
 await page.locator('[data-import-conflict-mode]').selectOption('keep');await ready();
 // A later column review must retain the import-wide choice.
 await page.locator('[data-column-group=mapped]').evaluate(node=>node.open=true);
 const centerRow=page.locator('.import-column-row').filter({has:page.locator('.import-column-name strong',{hasText:'Kostnadsställe'})});
 await centerRow.locator('[data-preview-map]').click();
 await page.locator('[data-target="contracts.costCenter"]').click();
 await page.locator('[data-check-records]').click();await ready();
 assert.equal(await page.locator('[data-import-conflict-mode]').inputValue(),'keep');
 await page.locator('[data-column-group=mapped]').evaluate(node=>node.open=false);
 await page.locator('[data-import-enrichment]').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(artifacts,'desktop.png')});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('.import-mapping-dialog').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
 await page.locator('[data-import-enrichment]').scrollIntoViewIfNeeded();
 await page.screenshot({path:join(artifacts,'mobile.png')});
 await page.setViewportSize({width:1440,height:960});await apply();
 saved=(await store.readSnapshot()).data;
 assert.equal(saved.properties.length,1);assert.equal(saved.properties[0].management_object_number,'4100');
 assert.equal(saved.objects.length,count);assert.equal(saved.agreements.length,count);assert.equal(saved.people.length,1);assert.equal(saved.contacts.length,1);
 for(let i=0;i<count;i++){
  const agreement=saved.agreements.find(row=>row.id===localAgreementId(i));
  assert.equal(agreement.object_id,'object-'+i);assert.equal(agreement.cost_center,'003418');assert.equal(agreement.customer_type,'Intern');assert.equal(agreement.agreement_type,'Överenskommelse');assert.equal(agreement.valid_from,'2019-10-01');assert.equal(agreement.notice_months,12);
 }
 assert.deepEqual(saved.workspace.budgetPlans,budget);
 await page.reload();await page.locator('[data-dashboard-mode]').first().waitFor();
 await page.locator('.sidebar [data-view=contracts]').evaluate(node=>node.click());
 await page.locator('[data-open-contract="'+localAgreementId(0)+'"]').first().click();
 await page.locator('#edit-form').waitFor();assert.equal(await page.locator('#edit-form [name=costCenter]').inputValue(),'003418');
 await page.locator('#edit-form [data-editor-close]').click();
 await begin();assert.equal(await page.locator('[data-import-value-choices]').count(),0,'A saved source rule initially keeps the earlier cost centre');
 await page.locator('[data-import-conflict-mode]').selectOption('replace');await ready();
 assert.equal(await page.locator('[data-import-value-choices]').evaluate(node=>node.open),false);await apply();
 saved=(await store.readSnapshot()).data;
 assert(saved.agreements.every(row=>row.cost_center==='009999'));assert.equal(saved.workspace.importFieldPreferences['contracts|costcenter|syntetisk-2.xlsx'],'reject','Global choice must not erase saved source rules');assert.deepEqual(saved.workspace.budgetPlans,budget);
 await begin();assert.equal(await page.locator('[data-approve-link]').count(),0);await apply();
 saved=(await store.readSnapshot()).data;
 assert.equal(saved.properties.length,1);assert.equal(saved.objects.length,count);assert.equal(saved.agreements.length,count);assert.equal(saved.contacts.length,1);assert.deepEqual(saved.workspace.budgetPlans,budget);assert.deepEqual(errors,[]);
 await browser.close();browser=null;await new Promise(resolve=>server.close(resolve));server=null;await store.close();store=null;
 store=await LocalStore.open({file});saved=store.snapshot().data;
 assert(saved.agreements.every(row=>row.cost_center==='009999'&&row.object_id.startsWith('object-')));assert.deepEqual(saved.workspace.budgetPlans,budget);
 console.log('PASS: first table import, 80 existing agreement links reused, all local-data fields, persistent global choice, one bulk value update, mobile/desktop, editor/reload and SQLite restart; locked Budget unchanged.');
 console.log('Screenshots: '+artifacts);
}finally{
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await store?.close();await rm(dir,{recursive:true,force:true});
}
