import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {LocalStore} from '../backend/lokaler/store.js';
import {createServer} from '../backend/lokaler/server.mjs';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
const artifacts='/tmp/lokalblick-agreement-counts';await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const mode of ['sqlite','excel']){
 const dir=await mkdtemp(join(tmpdir(),'agreement-counts-')),store=await LocalStore.open({file:join(dir,mode==='excel'?'data.xlsx':'data.sqlite'),mode}),base=emptyData();
 for(let i=0;i<97;i++)base.properties.push(normalize('properties',{id:'P'+i,name:'TESTET '+(i+1),address:'Provgatan '+(i+1),city:'Provstad'}));
 for(let i=0;i<138;i++)base.objects.push(normalize('objects',{id:'O'+i,property_id:'P'+(i%97),area:10}));
 const add=(prefix,count,start,end)=>{for(let i=0;i<count;i++)base.agreements.push(normalize('agreements',{id:prefix+i,object_id:'O'+i,valid_from:start,valid_to:end}));};
 add('CURRENT-',117,'2025-01-01','2027-12-31');add('PAST-',20,'2020-01-01','2024-12-31');add('FUTURE-',17,'2028-01-01','2029-12-31');base.workspace.budgetPlans=[{id:'locked',locked:true,amount:123}];await store.replace(base,0);
 const server=createServer(store);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];let writes=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/lokaler/workspace'))writes++;});await page.route('https://**/*',r=>r.abort());
 await page.addInitScript(()=>{const Native=Date;window.Date=class extends Native{constructor(...args){super(...(args.length?args:['2026-10-25T12:00:00Z']));}static now(){return Native.parse('2026-10-25T12:00:00Z');}};});
 const nav=async view=>page.locator('.sidebar [data-view="'+view+'"]').evaluate(n=>n.click());
 const card=label=>page.locator('#summary .summary>div').filter({has:page.locator('span').filter({hasText:new RegExp('^'+label+'$')})});
 try{
  const before=JSON.stringify(await store.readSnapshot());await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('[data-dashboard-mode]').first().waitFor();await page.evaluate(()=>{window.LokalblickGeocodingService=null;});
  assert.match(await card('Avtal totalt').innerText(),/154 st\s+117 gällande · 20 tidigare · 17 kommande/);assert.match(await card('Avtal totalt').getAttribute('title'),/2026-10-25/);await page.screenshot({path:join(artifacts,mode+'-overview.png')});
  for(const view of ['properties','objects','contracts']){await nav(view);assert.match(await card('Gällande avtal').innerText(),/117\s+154 totalt · 20 tidigare · 17 kommande/);await page.screenshot({path:join(artifacts,mode+'-'+view+'.png')});}
  assert.equal(await page.locator('table[data-list-key=contracts]>tbody>tr:not([data-table-empty])').count(),117);const history=page.locator('.portfolio-contract-history');assert.match(await history.locator('summary').innerText(),/37/);await history.locator('summary').click();assert.equal(await page.locator('table[data-list-key=contracts-history]>tbody>tr:not([data-table-empty])').count(),37);
  const historyText=await history.innerText();assert.match(historyText,/PAST-0/);assert.match(historyText,/FUTURE-0/);await page.setViewportSize({width:390,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:join(artifacts,mode+'-mobile.png')});
  assert.equal(writes,0);assert.equal(JSON.stringify(await store.readSnapshot()),before);assert.deepEqual(errors,[]);console.log('PASS '+mode+': 154 total / 117 current, 20 past + 17 future retained in history, 97 properties and 138 objects, labels on all four views, reference date, mobile, no writes and unchanged locked Budget.');
 }catch(e){await page.screenshot({path:join(artifacts,mode+'-failure.png'),fullPage:true});throw e;}
 finally{await page.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
}}finally{await browser.close();}
