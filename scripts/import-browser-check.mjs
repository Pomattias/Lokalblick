import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import XLSX from 'xlsx';
const require=createRequire(import.meta.url);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:1280,height:850}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://**/*',route=>{
 const url=route.request().url();
 if(url.includes('xlsx'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});
 if(url.includes('leaflet'))return route.fulfill({contentType:url.includes('.css')?'text/css':'application/javascript',body:fs.readFileSync(require.resolve('leaflet/dist/leaflet.'+(url.includes('.css')?'css':'js')))});
 return route.abort();
});
const underlag=[
 {name:'syntetiska-avtal.xlsx',rows:[['Avtalsnummer','Fastighet','BRA','Årshyra','t.o.m.','Specialvillkor'],['TEST-1','Test 1','425','120 000 kr','31/12/2028','Syntetisk anteckning']]},
 {name:'syntetiska-fastigheter.xlsx',rows:[['Fast.bet','Adress','Ort'],['Test 1','Testgatan 1','Malmö']]}
].map(file=>{const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(file.rows),'Underlag');return {name:file.name,bytes:[...XLSX.write(workbook,{type:'buffer',bookType:'xlsx'})]};});
await page.addInitScript(files=>{
 window.showOpenFilePicker=async()=>files.map(file=>({requestPermission:async()=> 'granted',queryPermission:async()=> 'granted',getFile:async()=>({name:file.name,arrayBuffer:async()=>new Uint8Array(file.bytes).buffer})}));
},underlag);
try{
 await page.goto('http://127.0.0.1:8795/v2/index.html');
 await page.waitForSelector('.sidebar [data-view="sources"]');
 await page.locator('.sidebar [data-view="sources"]').click();
 await page.locator('[data-source="import"]').click();
 await page.locator('[data-import-select="all"]').click();
 await page.locator('[data-import-start]').click();
 await page.waitForSelector('[data-map]');
 assert.equal(await page.locator('[data-map]').count(),9);
 assert.equal(await page.locator('[data-transform],[data-identity]').count(),0);
 assert.ok((await page.locator('dialog').innerText()).includes('Kronor · tolkas automatiskt'));
 await page.locator('[data-next]').click();
 await page.waitForSelector('[data-apply]');
 assert.ok((await page.locator('dialog').innerText()).includes('425'));
 await page.locator('[data-apply]').click();
 await page.waitForSelector('[data-apply]',{state:'detached'});
 await page.reload();
 await page.waitForSelector('tbody');
 const state=await page.evaluate(async()=>await window.LokalblickDataService.load());
 assert.equal(state.properties.length,1);assert.equal(state.contracts.length,1);
 assert.equal(state.contracts[0].area,425);assert.equal(state.contracts[0].baseRent,120000);assert.equal(state.contracts[0].end,'2028-12-31');assert.equal(state.contracts[0].supplemental[0].value,'Syntetisk anteckning');
 assert.equal(state.sourceRegistry.length,2);assert.equal(state.contracts[0].provenance.end.source,'syntetiska-avtal.xlsx');assert.equal(state.properties[0].provenance.address.source,'syntetiska-fastigheter.xlsx');
 await page.locator('.sidebar [data-view="contracts"]').click();
 await page.locator('[data-edit="contracts"]').first().click();
 await page.waitForSelector('#edit-form');
 assert.equal(await page.locator('.field-history').count(),1);
 await page.locator('[data-editor-close]').first().click();
 assert.deepEqual(errors,[]);
 console.log('Verified: multi-file picker → duplicate sheet names → automatic formats → consolidated preview → local save → reload → field history.');
}finally{await browser.close();}
