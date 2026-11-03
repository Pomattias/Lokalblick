// Browser smoke for the visible v2 import (large mixed workbook).
// Ensures guided steps replace the old 70-column review without touching main data.
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';
import {createServer} from '../backend/lokaler/server.mjs';

const require=createRequire(import.meta.url);
const dir=await mkdtemp(join(tmpdir(),'guided-import-')),file=join(dir,'data.sqlite');
let store=await LocalStore.open({file}),server,browser;
try{
 const headers=['FastighetsID','Fastighetsnamn','Gatuadress','ObjektID',
  'Avtalsnummer','Area','Grundhyra','Ort','Okänt systemfält'];
 const rows=Array.from({length:320},(_,i)=>[
  'P'+String(i+1).padStart(3,'0'),'Huset '+(i+1),'Gatan '+(i+1),
  i<2?'O'+(i+1):'',i===0?'A-1':i===1?'A-2; A-3':'',
  i<2?100:'',i===0?120000:i===1?150000:'','Malmö','okänd källdata'
 ]);
 const book=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,...rows]),'Lokallista');
 const buffer=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
 server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,
  args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.route('https://**/*',async route=>route.request().url().endsWith('xlsx.full.min.js')?
  route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))}):route.abort());
 await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Synthetic test"}'}));
 await page.addInitScript(bytes=>{window.showOpenFilePicker=async()=>[{
  name:'test-lokallista.xlsx',queryPermission:async()=>'granted',
  getFile:async()=>new File([new Uint8Array(bytes)],'test-lokallista.xlsx')
 }];},buffer);
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-dashboard-mode]').first().waitFor();
 await page.evaluate(()=>{window.LokalblickGeocodingService=null;});
 await page.locator('.sidebar [data-view=sources]').evaluate(n=>n.click());
 await page.locator('[data-source=import]').click();
 await page.locator('[data-import-sheet]').first().waitFor();
 await page.locator('[data-import-start]').click();
 const wizard=page.locator('[data-guided-review]');
 await wizard.waitFor();
 await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
 assert.equal(await wizard.getAttribute('data-guided-stage'),'0');
 assert.match(await wizard.innerText(),/Huset 1/);
 assert.match(await wizard.innerText(),/kolumn(er)? saknar säker koppling/);
 assert.equal(await page.locator('.import-decision-overview').count(),0);
 assert.equal(await page.locator('[data-guided-next]').isEnabled(),true);
 const next=async target=>{
  await page.locator('[data-guided-next]').click();
  await page.locator('[data-guided-stage="'+target+'"]').waitFor();
 };
 await next(1);
 assert.match(await wizard.innerText(),/O1/);
 await next(2);
 assert.match(await wizard.innerText(),/A-1/);
 assert.match(await wizard.innerText(),/flera avtalsnummer i samma cell/);
 assert.doesNotMatch(await page.locator('.import-guided-list').innerText(),/A-2; A-3/);
 await next(3);
 assert.equal(await wizard.getAttribute('data-guided-stage'),'3');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/lokaler/workspace')&&r.request().method()==='POST',{timeout:60000});
 await page.locator('[data-guided-next]').click();
 assert.equal((await saved).status(),200);
 await page.locator('.import-mapping-dialog').waitFor({state:'detached'});
 const data=store.snapshot().data;
 assert.equal(data.properties.length,320);
 assert(data.agreements.some(a=>a.id==='A-1'));
 assert(!data.agreements.some(a=>a.id==='A-2; A-3'));
 assert.equal(data.issues.length,0);
 assert.deepEqual(errors,[]);
 console.log('PASS: large v2 workbook uses 4 guided steps; safe records save; multi-agreement cells and unknown columns excluded.');
}finally{
 await browser?.close();
 if(server)await new Promise(resolve=>server.close(resolve));
 store.close();
 await rm(dir,{recursive:true,force:true});
}
