// Local-only browser check with synthetic data; never opens company workbooks.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url),port=8797;
const server=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,LOKALBLICK_PORT:String(port)}});
const fixture={isDemo:true,properties:[{id:'p',designation:'Test 1',address:'Testgatan 1',city:'Malmö',responsiblePersonId:'u1'}],objects:[{id:'o',propertyId:'p',number:'01'}],contracts:[{id:'c',propertyId:'p',objectId:'o',number:'C1',unitId:'VARDBO',area:100,baseRent:120000}],organizations:[{id:'our',name:'Testorganisation',type:'our'}],people:[{id:'u1',name:'Första',organizationId:'our'},{id:'u2',name:'Nästa',organizationId:'our'}],activities:[],orders:[],assignments:[],currentUser:{name:'Test'}};
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Local server stopped '+code)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||chromium.executablePath(),args:['--no-sandbox','--disable-dev-shm-usage']});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://**/*',route=>{const url=route.request().url();if(url.includes('leaflet'))return route.fulfill({contentType:url.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(require.resolve('leaflet/dist/leaflet.'+(url.endsWith('.css')?'css':'js')))});return route.abort();});
  await page.addInitScript(data=>localStorage.setItem('lokalblick-public-demo-v1',JSON.stringify(data)),fixture);
  await page.goto(`http://127.0.0.1:${port}/v2/index.html`);await page.waitForSelector('.mobile-nav');
  if(width<700)await page.locator('.mobile-nav [data-view=more]').click();
  await page.locator('[data-view=properties]:visible').first().click();
  await page.locator('[data-edit=properties][data-id=p]').first().click();
  await page.locator('select[name=responsiblePersonId]').selectOption('u2');
  await page.locator('#edit-form button[type=submit]').click();await page.waitForSelector('#edit-form',{state:'detached'});
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')));
  assert.equal(state.properties[0].responsiblePersonId,'u2');assert.equal(state.assignments.length,2);assert.equal(state.assignments[0].fromDate,'');assert.ok(state.assignments[0].toDate);
  await page.locator('[data-edit=properties][data-id=p]').first().click();await page.locator('.responsibility-section summary').click();
  assert.ok((await page.locator('.responsibility-section').innerText()).includes('Första'));
  assert.ok((await page.locator('.responsibility-section').innerText()).includes('Nästa'));
  const bounds=await page.locator('.property-editor').boundingBox();assert.ok(bounds.width<=width+1);assert.deepEqual(errors,[]);
  console.log(`Verified property responsibility change and history at ${width}px`);await context.close();
 }
}finally{await browser?.close();server.kill();}
