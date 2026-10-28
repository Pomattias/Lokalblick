// V2 Vercel-preview regression: same compact mobile table language across registers.
// Synthetic demo records only, no local or production database mutations.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const port=8817,server=spawn(process.execPath,['backend/server.mjs'],{
 env:{...process.env,LOKALBLICK_PORT:String(port)}
});
let browser;
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<=3,label+': '+a+' vs '+b);
try{
 await new Promise((resolve,reject)=>{
  server.stdout.once('data',resolve);
  server.once('error',reject);
  server.once('exit',code=>reject(Error('Server stoppades: '+code)));
 });
 browser=await chromium.launch({headless:true,executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://**/*',route=>route.abort());
 await page.goto('http://127.0.0.1:'+port+'/');
 await page.waitForSelector('[data-dashboard-mode]');
 const go=async view=>{
  await page.locator('.sidebar [data-view="'+view+'"]').evaluate(b=>b.click());
  await page.locator('body[data-view="'+view+'"]').waitFor();
 };
 const bounds=loc=>loc.evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height}});
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  for(const view of ['properties','contracts','activities','objects']){
   await go(view);
   const table=page.locator('.portfolio-list > table[data-smart-table]').first();
   await table.waitFor();
   const chips=table.locator('thead>tr:first-child>th[data-mobile-sort="true"]>.column-sort:visible');
   const count=await chips.count();
   assert.ok(count>=4,view+': should show available sorting chips, got '+count);
   const chipRect=await chips.evaluateAll(xs=>xs.map(el=>{
    const r=el.getBoundingClientRect();
    return {top:Math.round(r.top),left:r.left,right:r.right};
   }));
   const y=new Set(chipRect.map(x=>x.top));
   assert.equal(y.size,1,view+': sorting must remain on one swipeable row');
   const carousel=table.locator('thead>tr:first-child');
   const size=await carousel.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth,overflow:getComputedStyle(el).overflowX}));
   assert.ok(size.scroll>size.client+5,view+': carousel must expose more than one screen of sorting options');
   assert.match(size.overflow,/auto|scroll/);
   await carousel.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
   const scrolled=await carousel.evaluate(el=>el.scrollLeft);
   assert.ok(scrolled>0,view+': carousel is horizontally swipeable');
   await carousel.evaluate(el=>{el.scrollLeft=0;});
   const previous=await chips.first().getAttribute('data-direction');
   await chips.first().click();
   const next=await chips.first().getAttribute('data-direction');
   assert.ok(['asc','desc'].includes(next)&&next!==previous,view+': native sorting remains active');
   const showFilter=page.locator('.portfolio-list [data-toggle-column-filters]').first();
   await showFilter.click();
   await table.locator('.column-filters:not([hidden])').waitFor();
   await showFilter.click();
   const pageWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
   assert.ok(pageWidth<=width+2,view+': no document overflow '+pageWidth+' > '+width);
  }
  await go('properties');
  const filters=page.locator('#filters .filters>.filter-chip');
  assert.ok(await filters.count()>=3);
  const fst=await bounds(filters.nth(0)),snd=await bounds(filters.nth(1)),third=await bounds(filters.nth(2));
  near(fst.top,snd.top,'first filter row');
  near(fst.top,third.top,'three filter chips on the first row');
  const search=await bounds(page.locator('#filters .ui-search-action-row'));
  assert.ok(search.top>third.top+5,'search appears after filter choices');
  const inline=filters.nth(1).locator('.filter-mobile-inline');
  assert.equal(await inline.isVisible(),true);
  const caption=await bounds(inline.locator('.filter-mobile-caption'));
  const value=await bounds(inline.locator('.filter-mobile-selected'));
  near(caption.top,value.top,'caption and selected value are on a single line');
  const tiles=page.locator('#summary .summary>div');
  assert.equal(await tiles.count(),4);
  const t0=await bounds(tiles.nth(0)),t1=await bounds(tiles.nth(1)),t2=await bounds(tiles.nth(2));
  near(t0.top,t1.top,'first two KPI tiles share a row');
  assert.ok(t2.top>t0.top,'KPI tiles form two rows');
  const label=await bounds(tiles.nth(0).locator('.summary-label'));
  const value=await bounds(tiles.nth(0).locator('strong'));
  near(label.top,value.top,'KPI caption and value on the same baseline');
  assert.ok(t0.height<58,'KPI is compact');
  assert.ok(await tiles.nth(1).locator('.summary-explanation').isVisible(),'secondary agreement counts are displayed');
  await go('activities');
  const activityFilters=page.locator('#filters .filters>.filter-chip');
  assert.equal(await activityFilters.count(),6,'six filters on issues page');
  const rows=await activityFilters.evaluateAll(items=>items.map(el=>Math.round(el.getBoundingClientRect().top)));
  assert.equal(new Set(rows).size,2,'six filters are arranged as exactly two rows');
  assert.equal(new Set(rows.slice(0,3)).size,1,'first three filters share a row');
  assert.equal(new Set(rows.slice(3,6)).size,1,'last three filters share a row');
  const issueTable=page.locator('.portfolio-list table[data-list-key="activities"]');
  const issueFirst=issueTable.locator('tbody>tr:not([data-table-empty])').first();
  const issueDistance=await issueFirst.evaluate(el=>el.getBoundingClientRect().top - document.querySelector('#filters').getBoundingClientRect().top);
  assert.ok(issueDistance<370,'first issue should appear early; vertical distance is '+issueDistance);
  await go('contracts');
  const contract=page.locator('.portfolio-list table[data-list-key="contracts"] tbody>tr:not([data-table-empty])').first();
  await contract.waitFor();
  const first=await bounds(contract.locator('td:nth-child(3)'));
  const property=await bounds(contract.locator('td:nth-child(1)'));
  const rent=await bounds(contract.locator('td:nth-child(5)'));
  const area=await bounds(contract.locator('td:nth-child(4)'));
  assert.ok(property.top>first.top,'property follows agreement');
  assert.ok(rent.top>property.top,'rent follows property');
  near(rent.top,area.top,'area and rent appear on the same row');
  assert.ok(await contract.locator('.contract-mobile-property').isVisible(),'property and address share a compact row');
 }
 await page.setViewportSize({width:1280,height:850});
 await go('contracts');
 const allHeaders=page.locator('.portfolio-list table[data-list-key="contracts"] thead>tr:first-child th:visible');
 assert.ok(await allHeaders.count()>=9,'full desktop columns preserved');
 assert.equal(await page.locator('.contract-mobile-property').first().isVisible(),false);
 assert.deepEqual(errors,[],'no JavaScript errors');
 console.log('PASS: portfolio table parity at 320/390/1280, one-row carousel, three-column filters, compact KPI, sorting and filtering');
}catch(error){console.error(error);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
