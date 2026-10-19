import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const artifacts='/tmp/lokalblick-compact-details';mkdirSync(artifacts,{recursive:true});
const server=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,LOKALBLICK_PORT:'8799'}});let browser;
try{
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
  browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
  await page.goto('http://127.0.0.1:8799/');await page.waitForSelector('[data-dashboard-mode]');
  await page.evaluate(async()=>{const {normalize}=await import('/v2/model.js');localStorage.setItem('lokalblick-public-demo-v1',JSON.stringify(normalize(window.LokalblickDemoData)));});
  await page.reload();await page.waitForSelector('[data-dashboard-mode]');
  const navigate=view=>page.locator(`.sidebar [data-view="${view}"]`).evaluate(button=>button.click());
  const form=page.locator('#edit-form');
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')));
  const openContract=async()=>{await navigate('contracts');await page.locator('[data-open-contract]').filter({hasText:'201-2025'}).click();await form.waitFor();};
  await openContract();const initial=await stored(),contract=initial.contracts.find(row=>row.number==='201-2025');
  const expectedRate=await page.evaluate(id=>{const data=JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')),c=data.contracts.find(row=>row.id===id);return new Intl.NumberFormat('sv-SE',{maximumFractionDigits:0}).format(LokalblickCalculations.annualValues(c,new Date().getFullYear(),0,data.indexSeries).rent.amount/c.area)+' kr';},contract.id);
  assert.equal(await form.locator('[data-contract-rent-per-sqm]').innerText(),expectedRate);
  for(const width of [390,320,667,1440]){
    await page.setViewportSize({width,height:900});
    const action=form.locator('.ui-heading-actions');
    assert.equal(await action.getByRole('button',{name:'Redigera',exact:true}).innerText(),'Redigera');
    assert.equal(await action.locator('svg').count(),0);
    const boxes=await action.locator('button').evaluateAll(buttons=>buttons.filter(b=>!b.hidden).map(b=>{const r=b.getBoundingClientRect();return {height:r.height,top:r.top,right:r.right};}));
    assert.equal(boxes.length,2);assert.ok(boxes.every(b=>b.height===30));assert.ok(Math.abs(boxes[0].top-boxes[1].top)<1);
    const right=await form.evaluate(node=>node.getBoundingClientRect().right);
    assert.ok(Math.abs(right-boxes[1].right)<2,'Actions align with the right edge at '+width);
    const dates=await form.locator('[data-contract-term] .editor-mode-value').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,content:n.scrollWidth,width:n.clientWidth,font:getComputedStyle(n).fontSize};}));
    assert.equal(dates.length,2);assert.ok(dates.every(d=>d.height<=32&&d.content<=d.width+1),'Complete dates fit on one line at '+width);assert.ok(Math.abs(dates[0].top-dates[1].top)<1,'Dates share a read row at '+width);
    assert.ok(dates[0].right<dates[1].left,'Dates do not overlap at '+width);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow at '+width);
    const summaries=await form.locator('details>summary').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontWeight,s.lineHeight,s.color,s.padding];}));
    assert.ok(summaries.length>=5);assert.ok(summaries.every(s=>JSON.stringify(s)===JSON.stringify(summaries[0])),'All agreement disclosures share a style');
    assert.equal(summaries[0][0],'11px');assert.equal(summaries[0][1],'500');
    await page.screenshot({path:`${artifacts}/contract-read-${width}.png`});
    await action.getByRole('button',{name:'Redigera',exact:true}).click();
    const native=await form.locator('[data-contract-term] input').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {top:r.top,right:r.right,font:parseFloat(s.fontSize)};}));
    assert.equal(native.length,2);assert.ok(Math.abs(native[0].top-native[1].top)<1,'Native dates share an edit row');
    if(width<=700)assert.ok(native.every(n=>n.font>=16),'Native date controls avoid iPhone autozoom');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await form.locator('[data-editor-undo]').click();await form.locator('.ui-heading-actions').waitFor();
  }
  await page.setViewportSize({width:390,height:900});
  await form.locator('[data-editor-activate]').click();
  assert.equal(await form.locator('[name=start]').count(),1);assert.equal(await form.locator('[name=end]').count(),1);
  await form.locator('[name=area]').fill('600');await form.locator('[name=start]').fill('2025-02-01');await form.locator('[name=end]').fill('2029-11-30');
  await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  const updated=(await stored()).contracts.find(row=>row.id===contract.id);
  assert.equal(updated.area,600);assert.equal(updated.start,'2025-02-01');assert.equal(updated.end,'2029-11-30');
  for(const key of ['objectId','propertyId','tenantPartyId','tenantName','baseRent','businessResponsiblePersonId'])assert.deepEqual(updated[key],contract[key]);
  await openContract();
  assert.notEqual(await form.locator('[data-contract-rent-per-sqm]').innerText(),expectedRate,'Saved area updates the derived rate');
  await page.keyboard.press('Escape');
  for(const [view,selector] of [['properties','.primary-cell [data-edit=properties]'],['objects','.primary-cell [data-edit=objects]'],['activities','.primary-cell [data-edit=activities]']]){
    await navigate(view);await page.locator(selector).first().click();
    if(view!=='activities')await form.locator('[data-context-tab=info]').click();
    assert.equal(await form.locator('[data-editor-activate]').innerText(),'Redigera');
    const styles=await form.locator('details>summary').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return [s.fontSize,s.fontWeight,s.lineHeight,s.padding];}));
    assert.ok(styles.length>0);assert.ok(styles.every(s=>s[0]==='11px'&&s[1]==='500'),'Small disclosures in '+view);
    await page.screenshot({path:`${artifacts}/${view}-390.png`});await page.keyboard.press('Escape');
  }
  for(const view of ['plan','sources','people','settings']){
    await navigate(view);
    const fonts=await page.locator('main details>summary').evaluateAll(nodes=>nodes.map(n=>[getComputedStyle(n).fontSize,getComputedStyle(n).fontWeight]));
    assert.ok(fonts.every(([size,weight])=>size==='11px'&&weight==='500'),'Shared disclosure typography on '+view);
    const heights=await page.locator('#view-global-actions>button:visible').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));
    assert.ok(heights.every(height=>height===30),'Compact page actions on '+view);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: compact right-aligned text actions, annual rent/m², one date row in read/edit, uniform small disclosures, preserved controls and saved lease fields across mobile and desktop.');
}finally{await browser?.close();server.kill('SIGTERM');}
