import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const artifacts='/tmp/lokalblick-current-records';mkdirSync(artifacts,{recursive:true});
const server=spawn(process.execPath,['backend/server.mjs'],{env:{...process.env,LOKALBLICK_PORT:'8797'}});
let browser;
try {
  await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Server exited '+code)));});
  browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('https://**/*',route=>route.abort());
  await page.goto('http://127.0.0.1:8797/');await page.waitForSelector('[data-dashboard-mode]');
  await page.evaluate(async()=>{
    const {normalize}=await import('/v2/model.js'),data=normalize(window.LokalblickDemoData),year=Number(globalThis.LokalblickResponsibility.today().slice(0,4));
    const date=offset=>(year+offset)+'-01-01';
    data.properties.push({id:'TEST-P',designation:'Provfastigheten',address:'Testgatan 1',city:'Teststad'});
    data.objects.push({id:'TEST-O',propertyId:'TEST-P',number:'P01',name:'Kontor',start:date(-1),end:'',predecessorIds:['TEST-OLD']},
      {id:'TEST-OLD',propertyId:'TEST-P',number:'P00',name:'Tidigare lokal',start:date(-5),end:(year-2)+'-12-31',predecessorIds:[]});
    const contract={...data.contracts[0],propertyId:'TEST-P',objectId:'TEST-O',unitId:'VARDBO',area:100,baseRent:100000,rentIndexPercent:0,baseAdditions:0,annualPropertyTax:0,
      responsiblePersonId:'',businessResponsiblePersonId:'',tenantResponsiblePersonId:'',noticePeriodMonths:0,renewalPeriodMonths:0,tenantName:'Provhyresgästen',tenantPartyId:''};
    data.contracts.push({...contract,id:'TEST-C',number:'Nuvarande',start:date(0),end:(year+1)+'-12-31'},
      {...contract,id:'TEST-PAST',number:'Tidigare',start:date(-1),end:(year-1)+'-12-31'},
      {...contract,id:'TEST-FUTURE',number:'Kommande',start:date(2),end:(year+3)+'-12-31'});
    for(const [id,name] of [['TA','Ägarkontakt A'],['TB','Samordnare B'],['TC','Samordnare C'],['TD','Tidigare kontakt'],['TE','Framtida kontakt']])data.people.push({id,name,organizationId:''});
    const assign=(id,targetType,targetId,roleKey,personId,fromDate,toDate,shared=false)=>({id,targetType,targetId,roleKey,role:globalThis.LokalblickResponsibility.roles[roleKey],personId,fromDate,toDate,shared});
    data.assignments.push(assign('T1','property','TEST-P','owner','TA',date(-1),'',false),
      assign('T2','property','TEST-P','our','TB',date(-1),'',true),assign('T3','property','TEST-P','our','TC',date(-1),'',true),
      assign('T4','property','TEST-P','our','TD',date(-4),(year-2)+'-12-31'),assign('T5','property','TEST-P','owner','TE',date(2),'',false),
      assign('T6','contract','TEST-C','business','TB',date(-1),'',false),assign('T7','contract','TEST-C','tenant','TB',date(-1),'',false));
    data.activities.push({id:'TEST-I',title:'Öppet på tidigare avtal',contractId:'TEST-PAST',status:'Pågår'},
      {id:'TEST-I2',title:'Öppet på tidigare objekt',objectId:'TEST-OLD',status:'Nytt'});
    localStorage.setItem('lokalblick-public-demo-v1',JSON.stringify(normalize(data)));
  });
  await page.reload();await page.waitForSelector('[data-dashboard-mode]');
  const navigate=view=>page.locator(`.sidebar [data-view="${view}"]`).evaluate(button=>button.click());
  await navigate('properties');
  const row=page.locator('[data-row-group="TEST-P"]');
  assert.ok((await row.innerText()).includes('1 avtal'));
  assert.equal(await row.locator('.property-list-summary>td').nth(4).getAttribute('data-sort-value'),'100');
  const openProperty=()=>row.locator('[data-edit=properties]').click();
  await openProperty();const form=page.locator('#edit-form');
  for(const width of [390,320,667,1440]){
    await page.setViewportSize({width,height:900});
    assert.equal(await form.locator('[data-context-record=contracts][data-id=TEST-C]').isVisible(),true);
    assert.equal(await form.locator('[data-context-record=contracts][data-id=TEST-PAST]').isVisible(),false);
    assert.equal(await form.locator('[data-context-record=contracts][data-id=TEST-FUTURE]').isVisible(),false);
    assert.equal(await form.locator('.context-summary').count(),0,'No repeated totals above the agreement');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow at '+width);
    await page.screenshot({path:`${artifacts}/property-${width}.png`});
  }
  await form.locator('[data-context-period=past]>summary').click();
  assert.equal(await form.locator('[data-context-record=contracts][data-id=TEST-PAST]').isVisible(),true);
  await form.locator('[data-context-record=contracts][data-id=TEST-PAST]').click();
  assert.equal(await form.locator('#editor-title').innerText(),'Avtal Tidigare');
  await form.locator('[data-context-back]').click();
  assert.equal(await form.locator('[data-context-period=past]').getAttribute('open'),'','Back restores explicit history choice');
  await form.locator('[data-context-period=past]>summary').click();
  await form.locator('[data-context-tab=issues]').click();
  assert.ok((await form.locator('[data-context-panel=issues]').innerText()).includes('Öppet på tidigare avtal'));
  assert.ok((await form.locator('[data-context-panel=issues]').innerText()).includes('Öppet på tidigare objekt'));
  await form.locator('[data-context-tab=info]').click();
  const contacts=form.locator('.context-current-contacts');
  for(const name of ['Ägarkontakt A','Samordnare B','Samordnare C'])assert.ok((await contacts.innerText()).includes(name));
  for(const name of ['Tidigare kontakt','Framtida kontakt'])assert.ok(!(await contacts.innerText()).includes(name));
  assert.equal(await form.locator('.context-legacy-contacts').isVisible(),false);
  assert.equal(await form.locator('.responsibility-section details').getAttribute('open'),null);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${artifacts}/property-info-390.png`});
  // Editing an unrelated field must preserve shared and dated assignments.
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lokalblick-public-demo-v1')));
  const before=await stored();
  await form.locator('[data-editor-activate]').click();await form.locator('[name=city]').fill('Ny teststad');
  await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  const after=await stored();assert.deepEqual(after.assignments,before.assignments);
  assert.deepEqual(after.contracts,before.contracts);
  await openProperty();await form.locator('[data-context-record=objects][data-id=TEST-O]:visible').click();
  assert.equal(await form.getAttribute('data-collection'),'objects');
  assert.ok((await form.locator('#editor-title').innerText()).includes('P01'));
  assert.equal(await form.locator('[data-context-record=contracts][data-id=TEST-C]').isVisible(),true);
  await form.locator('[data-context-tab=info]').click();
  assert.equal(await form.locator('[name=predecessorIds]').count(),1,'Use the original lifecycle control');
  const objectBefore=(await stored()).objects.find(row=>row.id==='TEST-O');
  await form.locator('[data-editor-activate]').click();await form.locator('[name=name]').fill('Kontor uppdaterat');
  await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  const objectAfter=(await stored()).objects.find(row=>row.id==='TEST-O');
  for(const key of ['propertyId','start','end','predecessorIds','number'])assert.deepEqual(objectAfter[key],objectBefore[key],'Object edit preserves '+key);
  await openProperty();await form.locator('[data-context-record=objects][data-id=TEST-O]:visible').click();
  await form.locator('[data-context-tab=issues]').click();await form.locator('[data-context-new-issue]').click();
  assert.equal(await form.locator('[name=issueHome]').inputValue(),'object:TEST-O');
  await form.locator('[data-context-back]').click();
  assert.equal(await form.getAttribute('data-collection'),'objects');
  await form.locator('[data-context-back]').click();
  assert.equal(await form.getAttribute('data-collection'),'properties');
  await form.locator('[data-context-record=contracts][data-id=TEST-C]').click();
  assert.equal(await form.locator('#editor-title').innerText(),'Avtal Nuvarande');
  const contractContacts=form.locator('.context-current-contacts');
  assert.equal(await contractContacts.locator('dd').filter({hasText:'Samordnare B'}).count(),1,'Several roles share one name row');
  assert.ok((await contractContacts.innerText()).includes('Verksamhetskontakt · Hyresgästkontakt'));
  assert.equal(await form.locator('[name=number] + .editor-mode-value').isVisible(),false);
  assert.equal(await form.locator('[name=objectId] + .editor-mode-value').isVisible(),false);
  assert.equal(await form.locator('.context-parent [data-context-record=objects]').count(),1);
  const dateHeights=await form.locator('[data-contract-section=dates]>.contract-grid>.contract-field').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  assert.ok(dateHeights.every(height=>height<=34),'Short date values use compact read rows on mobile');
  await page.screenshot({path:`${artifacts}/contract-390.png`});
  await page.keyboard.press('Escape');await navigate('contracts');
  const historic=page.locator('.portfolio-contract-history');
  assert.equal(await historic.locator('[data-edit=contracts][data-id=TEST-PAST]').isVisible(),false);
  await historic.locator(':scope>summary').click();
  assert.equal(await historic.locator('[data-edit=contracts][data-id=TEST-PAST]').isVisible(),true);
  assert.equal(await historic.locator('[data-edit=contracts][data-id=TEST-FUTURE]').isVisible(),true);
  await historic.locator('[data-edit=contracts][data-id=TEST-PAST]').click();
  assert.equal(await form.locator('#editor-title').innerText(),'Avtal Tidigare');
  assert.deepEqual(errors,[]);
  console.log('Current records browser check OK: current periods, explicit history, dated/shared contacts, object navigation, issue homes, unchanged saved data and mobile layouts.');
} finally {await browser?.close();server.kill('SIGTERM');}
