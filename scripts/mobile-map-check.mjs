import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=process.cwd();
const server=spawn(process.execPath,['backend/server.mjs'],{cwd:root,env:{...process.env,LOKALBLICK_PORT:'8797'}});
let browser;
try {
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const baseline of [true,false]) {
  const page=await browser.newPage({viewport:{width:390,height:667}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
  await page.route('https://**/*',route=>{
   const url=route.request().url();
   if(url.endsWith('/leaflet.js'))return route.fulfill({contentType:'text/javascript',body:readFileSync(require.resolve('leaflet/dist/leaflet.js'))});
   if(url.endsWith('/leaflet.css'))return route.fulfill({contentType:'text/css',body:readFileSync(require.resolve('leaflet/dist/leaflet.css'))});
   return route.abort();
  });
  if(baseline)for(const css of ['styles.css','unified-design.css'])await page.route('**/'+css,route=>route.fulfill({contentType:'text/css',body:execFileSync('git',['show','59d89651770c9eaa2316769c9258951235aef345:frontend/'+css],{cwd:root,encoding:'utf8'})}));
  await page.goto('http://127.0.0.1:8797/index.html');await page.locator('[data-mobile-dock=map]').click();await page.waitForSelector('.leaflet-pane',{state:'attached'});
  const check=()=>page.evaluate(()=>{
   const dock=document.querySelector('#mobile-dock'),map=document.querySelector('#property-map'),box=map.getBoundingClientRect();
   return {mapHeight:box.height,dockTop:dock.getBoundingClientRect().top,mapBottom:box.bottom,hits:[...dock.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b;})};
  });
  if(baseline)await page.evaluate(()=>scrollBy(0,18));
  const result=await check();console.log(baseline?'Baseline':'Fixed',result);
  if(baseline){assert.ok(result.hits.some(x=>!x),'Must reproduce original navigation obstruction');await page.close();continue;}
  assert.ok(result.hits.every(Boolean));assert.ok(result.mapBottom<=result.dockTop);
  for(const target of ['overview','plan','budget','map']){await page.locator('[data-mobile-dock='+target+']').click();assert.ok(await page.locator('[data-mobile-dock='+target+']').evaluate(e=>e.classList.contains('active')));}
  await page.locator('[data-mobile-dock=more]').click();assert.ok(await page.locator('.mobile-sheet-card').isVisible());await page.locator('[data-mobile-sheet-close]').last().click();
  for(const viewport of [{width:390,height:844},{width:320,height:568},{width:430,height:932},{width:667,height:375}]){
   await page.setViewportSize(viewport);await page.locator('[data-mobile-dock=map]').click();assert.ok((await check()).hits.every(Boolean));
   await page.mouse.move(120,250);await page.mouse.wheel(0,300);assert.ok((await check()).hits.every(Boolean));
   await page.locator('[data-mobile-dock=budget]').click();assert.ok(await page.locator('.budget-page').isVisible());
  }
  await page.setViewportSize({width:390,height:844});await page.locator('[data-mobile-dock=map]').click();await page.screenshot({path:'/tmp/lokalblick-map-fixed.png'});
  await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'/tmp/lokalblick-map-desktop.png'});assert.equal(await page.locator('#mobile-dock').isVisible(),false);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('PASS: real Leaflet, obstruction reproduced, all five navigation targets, small/large mobile, landscape, scrolling and desktop.');
}finally{await browser?.close();server.kill();}
