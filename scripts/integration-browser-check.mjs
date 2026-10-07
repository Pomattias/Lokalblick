import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const server=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,LOKALBLICK_PORT:'8796'}});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack));
 await page.route('https://**/*',route=>{
  const url=route.request().url();
  for(const type of ['js','css'])if(url.endsWith('/leaflet.'+type))return route.fulfill({contentType:type==='js'?'text/javascript':'text/css',body:readFileSync(require.resolve('leaflet/dist/leaflet.'+type))});
  return route.abort();
 });
 await page.goto('http://127.0.0.1:8796/');await page.waitForSelector('.mobile-nav');assert.ok(page.url().includes('/v2/index.html'));
 await page.locator('.mobile-nav [data-view=budget]').click();
 await page.locator('[data-year]').fill('2027');await page.locator('[data-year]').dispatchEvent('change');
 await page.locator('.budget-danger-zone summary').click();await page.locator('[data-followup-layer]').click();
 await page.locator('.followup-dialog [name=amount]').fill('1000');await page.locator('.followup-dialog [name=reason]').fill('V2 integration');await page.locator('.followup-dialog [name=confirmation]').fill('no');await page.locator('.followup-dialog [type=submit]').click();assert.equal(await page.locator('.followup-dialog').count(),1);
 await page.locator('.followup-dialog [name=confirmation]').fill('danger');await page.locator('.followup-dialog [type=submit]').click();await page.waitForSelector('.followup-dialog',{state:'detached'});
 let data=await page.evaluate(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')));assert.equal(data.budgetPlans.find(p=>p.year===2027).versions.length,1);assert.ok(data.auditLog.some(h=>h.collection==='budgetPlans'&&h.recordId==='2027'&&h.by&&h.at));
 await page.locator('.budget-comparison tr').filter({hasText:'Underhåll'}).locator('[data-followup-final]').first().click();await page.locator('.followup-dialog [name=amount]').fill('0');await page.locator('.followup-dialog [type=submit]').click();await page.waitForSelector('.followup-dialog',{state:'detached'});
 await page.reload();await page.locator('.mobile-nav [data-view=budget]').click();assert.ok(await page.locator('.budget-comparison tr').filter({hasText:'Utförd'}).count()>0);
 const mobileColor=await page.locator('.mobile-nav [data-view=budget]').evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));
 await page.setViewportSize({width:1440,height:900});const desktopColor=await page.locator('.sidebar [data-view=budget]').evaluate(e=>({background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color}));assert.deepEqual(mobileColor,desktopColor);
 await page.locator('#history').click();assert.ok((await page.locator('.followup-dialog').innerText()).includes('V2 integration'));await page.locator('.followup-dialog button').click();
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:667,height:375}]){
  await page.setViewportSize(viewport);await page.locator('.mobile-nav [data-view=map]').click();await page.waitForSelector('.leaflet-pane',{state:'attached'});
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.mobile-nav button')].every(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b;})));
  await page.locator('.mobile-nav [data-view=budget]').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.screenshot({path:'/tmp/lokalblick-v2-integrated.png'});
 assert.deepEqual(errors,[]);console.log('PASS: default V2, shared budget danger/version/final cost/audit/reload, equal mobile/desktop colors, real map navigation and legacy fallback.');
 await page.goto('http://127.0.0.1:8796/index.html?legacy=1');await page.waitForSelector('#mobile-dock');assert.ok(!page.url().includes('/v2/'));
}finally {await browser?.close();server.kill();}
