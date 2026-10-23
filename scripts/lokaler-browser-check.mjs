import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {chromium} from 'playwright';import XLSX from 'xlsx';
import {LocalStore} from '../backend/lokaler/store.js';import {createServer} from '../backend/lokaler/server.mjs';import {readWorkbook} from '../backend/lokaler/workbook.js';
const require=createRequire(import.meta.url),artifacts='/tmp/lokalblick-clean-import-check';await mkdir(artifacts,{recursive:true});
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
 ['FastighetsID','Fastighetsbeteckning','Gatuadress','Ort','ObjektID','Area','Antal lägenheter','Avtalsnummer','Hyresgäst','Årshyra','Samordnare','Hyresgästens kontaktperson','Hyra justeringsregel','Ovidkommande','Fastighetsägare','Orgnr fastighetsägare','Orgnr hyresgäst'],
 ['F1','Eken 1','Testgatan 1','Malmö','O1',100,2,'9(1)','Fiktiv hyresgäst',100000,'Anna Test','Kim Test','none','Sparas inte','Fiktiv fastighetsägare','0000010001','0000020002'],
 ['F1','Eken 1','Testgatan 1','Malmö','O2',50,1,'91','Fiktiv hyresgäst',50000,'Anna Test','Kim Test','none','Sparas inte','Fiktiv fastighetsägare','0000010001','0000020002'],
 ['F2','Björken 1','Testgatan 2','Malmö','O3',80,0,'91,1','Fiktiv hyresgäst',80000,'Anna Test','Kim Test','none','Sparas inte','Fiktiv fastighetsägare','0000010001','0000020002']
]),'Underlag');const sourceBytes=Array.from(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));
const browser=await chromium.launch({executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
async function scenario(mode){
 const dir=await mkdtemp(path.join(os.tmpdir(),'clean-app-')),store=await LocalStore.open({file:path.join(dir,mode==='excel'?'data.xlsx':'data.sqlite'),mode:mode==='browser-excel'?'sqlite':mode}),server=createServer(store);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const page=await browser.newPage({viewport:{width:1440,height:940}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.type()==='prompt'?dialog.accept('Testare'):dialog.accept());
 await page.route('https://**/*',async route=>{const url=route.request().url();if(url.endsWith('xlsx.full.min.js'))return route.fulfill({contentType:'text/javascript',body:await readFile(require.resolve('xlsx/dist/xlsx.full.min.js'))});for(const ext of ['js','css'])if(url.endsWith('leaflet.'+ext))return route.fulfill({contentType:ext==='js'?'text/javascript':'text/css',body:await readFile(require.resolve('leaflet/dist/leaflet.'+ext))});return route.abort();});
 await page.route('**/api/geocode',route=>route.fulfill({status:503,contentType:'application/json',body:'{"ok":false,"code":"GEOCODING_NOT_CONFIGURED","error":"Test"}'}));
 await page.route('**/api/budget-index?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Test"}'}));
 if(mode==='browser-excel')await page.route('**/api/runtime-config',route=>route.fulfill({contentType:'text/javascript',body:'window.LokalblickRuntime={};'}));
 await page.addInitScript(bytes=>{
  const NativeDate=Date;window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:['2026-10-19T12:00:00Z']));}static now(){return NativeDate.parse('2026-10-19T12:00:00Z');}};
  window.showOpenFilePicker=async options=>options?.multiple?[{name:'syntetiskt.xlsx',queryPermission:async()=>'granted',getFile:async()=>new File([new Uint8Array(bytes)],'syntetiskt.xlsx')}]:[await(await navigator.storage.getDirectory()).getFileHandle('clean-data.xlsx')];
  window.showSaveFilePicker=async()=>await(await navigator.storage.getDirectory()).getFileHandle('clean-data.xlsx',{create:true});
 },sourceBytes);
 const nav=async name=>{await page.locator('.sidebar [data-view='+name+']').evaluate(button=>button.click());};
 const importFile=async()=>{
  await nav('sources');await page.locator('[data-source=import]').click();await page.locator('[data-import-sheet]').first().waitFor();
  await page.locator('[data-import-select=all]').click();await page.locator('[data-import-start]').click();
  await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();
  const ignore=page.locator('[data-ignore-unmapped]');if(await ignore.count()){await ignore.click();await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();}
  await page.locator('[data-column-group=mapped]').evaluate(node=>node.open=true);
  const identities=page.locator('[data-person-identity]');for(let i=0;i<await identities.count();i++){await identities.nth(i).check();await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();}
  if(await page.locator('[data-check-records]').count()){await page.locator('[data-check-records]').click();await page.locator('.import-mapping-dialog[aria-busy=false]').waitFor();}
  if(await page.locator('.import-mapping-dialog [data-apply]').isDisabled())throw Error(await page.locator('.import-mapping-dialog').innerText());const apply=page.locator('.import-mapping-dialog [data-apply]');assert.equal(await apply.isDisabled(),false,await page.locator('.import-mapping-dialog').innerText());await apply.click();
  await page.locator('.import-progress-dialog').waitFor({state:'detached'});await page.locator('.import-mapping-dialog').waitFor({state:'detached'});
 };
 const persisted=async()=>{
  if(mode!=='browser-excel')return store.snapshot().data;
  const bytes=await page.evaluate(async()=>Array.from(new Uint8Array(await(await(await navigator.storage.getDirectory()).getFileHandle('clean-data.xlsx')).getFile().then(file=>file.arrayBuffer()))));return readWorkbook(Buffer.from(bytes));
 };
 try{
  await page.goto(base);await page.locator('[data-dashboard-mode]').first().waitFor();
  await importFile();
  if(mode==='browser-excel'){await page.locator('[data-source=create]').first().click();await page.getByText('clean-data.xlsx',{exact:false}).first().waitFor();}
  let data=await persisted();assert.equal(data.properties.length,2);assert.equal(data.objects.length,3);assert.equal(data.agreements.length,3);assert.equal(data.people.length,2);assert.equal(data.contacts.length,5);assert.equal(data.workspace.importReview.length,0);assert.equal(data.parties.length,2);assert.equal(data.parties.find(p=>p.name==='Fiktiv fastighetsägare').organization_number,'000001-0001');assert.equal(data.parties.find(p=>p.name==='Fiktiv hyresgäst').organization_number,'000002-0002');
  assert.ok(!JSON.stringify(data).includes('Sparas inte'));assert.deepEqual(data.agreements.map(a=>a.id),['9(1)','91','91,1']);
  await importFile();data=await persisted();assert.equal(data.agreements.length,3);assert.equal(data.contacts.length,5);
  await nav('overview');await page.locator('[data-dashboard-mode]').first().waitFor();await page.screenshot({path:path.join(artifacts,mode+'-overview.png'),fullPage:true});
  await nav('contracts');await page.locator('[data-open-contract]').first().click();const form=page.locator('#edit-form');const agreementId=await form.getAttribute('data-record-id');await form.locator('[data-editor-activate]').click();assert.equal(await form.locator('[name=tenantOrganizationNumber]').inputValue(),'000002-0002');const tenantId=await form.locator('[name=tenantPartyId]').inputValue();await form.locator('[name=tenantPartyId]').selectOption(data.properties[0].owner_party_id);assert.equal(await form.locator('[name=tenantOrganizationNumber]').inputValue(),'000001-0001');await form.locator('[name=tenantPartyId]').selectOption(tenantId);assert.equal(await form.locator('[name=tenantOrganizationNumber]').inputValue(),'000002-0002');await form.locator('[name=tenantOrganizationNumber]').fill('0000030003');if(mode==='sqlite'){await page.screenshot({path:path.join(artifacts,'party-number-contract-desktop.png')});await page.setViewportSize({width:390,height:900});await form.locator('[name=tenantOrganizationNumber]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'party-number-contract-mobile.png')});await page.setViewportSize({width:1440,height:940});}await form.locator('[name=businessName],[name=workplaceCount],[name=hubCount]').evaluateAll(nodes=>{for(const node of nodes)for(let parent=node.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});await form.locator('[name=businessName]').fill('Verifierad kommentar');await form.locator('[name=costCenter]').fill('003418');await form.locator('[name=customerType]').fill('Intern');await form.locator('[name=agreementType]').fill('Överenskommelse');await form.locator('[name=workplaceCount]').fill('12');await form.locator('[name=hubCount]').fill('3');assert.equal(await form.locator('[name=number],[name=businessPartyId],[name=businessResponsiblePersonId],[name=businessIds],[name=employees]').count(),0);await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  data=await persisted();assert.equal(data.agreements.find(row=>row.id===agreementId).business_name,'Verifierad kommentar');assert.equal(data.agreements.find(row=>row.id===agreementId).cost_center,'003418');assert.equal(data.agreements.find(row=>row.id===agreementId).customer_type,'Intern');assert.equal(data.agreements.find(row=>row.id===agreementId).agreement_type,'Överenskommelse');assert.equal(data.parties.find(p=>p.id===data.agreements.find(a=>a.id===agreementId).tenant_party_id).organization_number,'000003-0003');assert(data.agreements.every(a=>a.tenantOrganizationNumber===undefined));assert.equal(data.agreements.find(row=>row.id===agreementId).workplace_count,12);assert.equal(data.agreements.find(row=>row.id===agreementId).hub_count,3);assert.ok(data.agreements.every(a=>a.area===undefined));
  await nav('objects');await page.locator('[data-edit=objects]').first().click();await form.locator('[data-context-tab=info]').click();await form.locator('[data-editor-activate]').click();assert.equal(await form.locator('[name=rooms]').count(),0);assert.equal(await form.locator('[name=id]').isDisabled(),true,'Existing object identity is immutable');const objectId=await form.getAttribute('data-record-id');await form.locator('[name=area]').fill('125');await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
  data=await persisted();assert.equal(data.objects.find(row=>row.id===objectId).area,125);
  await nav('objects');await page.locator('[data-new-object]').click();await form.locator('[name=propertyId]').selectOption('F1');await form.locator('[data-editor-tab=Uppgifter]').click();await form.locator('[name=id]').fill('O-NY');assert.equal(await form.locator('[name=name],[name=use],[name=unitId],[name=number],[name=rooms]').count(),0);await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});data=await persisted();assert.ok(data.objects.some(o=>o.id==='O-NY'&&o.property_id==='F1'));
  // Financial child forms exercise the same save/version/audit path in every store.
  assert.equal(data.agreement_items.length,3);assert.ok(data.agreements.every(a=>a.annual_rent===undefined));
  await nav('contracts');await page.locator('[data-open-contract]').first().click();
  const financeForm=page.locator('#edit-form'),financeAgreement=await financeForm.getAttribute('data-record-id');
  assert.equal(await financeForm.locator('[name=baseRent],[name=baseAdditions],[name=annualPropertyTax]').count(),0);
  await financeForm.locator('[data-item-new]').click();let financeDialog=page.locator('dialog.followup-dialog');
  await financeDialog.locator('[name=type]').selectOption('heat');await financeDialog.locator('[name=name]').fill('Värmetillägg');await financeDialog.locator('[name=baseAmount]').fill('12000');
  await financeDialog.locator('[name=adjustmentMethod]').selectOption('fixed');assert.equal(await financeDialog.locator('[name=baseIndex]').isVisible(),false);assert.equal(await financeDialog.locator('[name=annualPercent]').isVisible(),true);
  await financeDialog.locator('[name=baseYear]').fill('2025');await financeDialog.locator('[name=annualPercent]').fill('3');await financeDialog.locator('[name=reconcilable]').check();await financeDialog.locator('[type=submit]').click();await financeDialog.waitFor({state:'detached'});
  data=await persisted();assert.equal(data.agreement_items.filter(x=>x.agreement_id===financeAgreement).length,2);assert.equal(data.agreement_items.find(x=>x.name==='Värmetillägg').reconcilable,true);
  await financeForm.locator('[data-item-new]').click();financeDialog=page.locator('dialog.followup-dialog');await financeDialog.locator('[name=type]').selectOption('base');await financeDialog.locator('[name=name]').fill('Dubbel bashyra');await financeDialog.locator('[name=baseAmount]').fill('100');await financeDialog.locator('[type=submit]').click();await financeDialog.locator('[data-error]').getByText(/Endast en bashyra/).waitFor();await financeDialog.locator('[data-cancel]').click();
  await financeForm.locator('[data-editor-close]').click();await nav('properties');await page.getByRole('button',{name:'Eken 1',exact:true}).click();await page.locator('[data-context-tab=info]').click();
  assert.equal(await financeForm.locator('[name=ownerOrganizationNumber]').inputValue(),'000001-0001');if(mode==='sqlite'){await financeForm.locator('.property-section').first().scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'party-number-property-desktop.png')});}await financeForm.locator('[data-cost-new]').click();financeDialog=page.locator('dialog.followup-dialog');await financeDialog.locator('[name=category]').selectOption('heat');await financeDialog.locator('[name=name]').fill('Fastighetens värme');await financeDialog.locator('[name=annualAmount]').fill('20000');await financeDialog.locator('[type=submit]').click();await financeDialog.waitFor({state:'detached'});
  await financeForm.locator('[data-cost-evidence]').click();financeDialog=page.locator('dialog.followup-dialog');await financeDialog.locator('[name=type]').selectOption('invoice');await financeDialog.locator('[name=invoiceReference]').fill('TEST-1');await financeDialog.locator('[name=invoiceDate]').fill('2026-10-01');await financeDialog.locator('[name=start]').fill('2026-01-01');await financeDialog.locator('[name=end]').fill('2026-12-31');await financeDialog.locator('[name=amount]').fill('18000');await financeDialog.locator('[type=submit]').click();await financeDialog.waitFor({state:'detached'});
  assert.match(await financeForm.locator('[data-cost-panel]').innerText(),/Ej komplett/);
  await financeForm.locator('[data-cost-edit]').click();financeDialog=page.locator('dialog.followup-dialog');await financeDialog.locator('[name=complete]').check();await financeDialog.locator('[type=submit]').click();await financeDialog.waitFor({state:'detached'});assert.match(await financeForm.locator('[data-cost-panel]').innerText(),/Fakturor/);assert.doesNotMatch(await financeForm.locator('[data-cost-panel]').innerText(),/Ej komplett/);
  await financeForm.locator('[data-cost-evidence]').click();financeDialog=page.locator('dialog.followup-dialog');await financeDialog.locator('[name=amount]').fill('19000');await financeDialog.locator('[type=submit]').click();await financeDialog.waitFor({state:'detached'});assert.match(await financeForm.locator('[data-cost-panel]').innerText(),/Årsutfall/);
  data=await persisted();assert.equal(data.recurring_costs.length,1);assert.equal(data.cost_evidence.length,2);assert.equal(data.cost_evidence.find(x=>x.type==='annual').amount,19000);assert.equal(data.workspace.recurringCosts,undefined);assert(data.workspace.auditLog.some(x=>x.collection==='agreementItems'));assert(data.workspace.auditLog.some(x=>x.collection==='costEvidence'));
  await page.setViewportSize({width:390,height:900});await page.screenshot({path:path.join(artifacts,mode+'-property-costs-mobile.png')});await page.setViewportSize({width:1440,height:940});await financeForm.locator('[data-editor-activate]').click();await financeForm.locator('[name=ownerOrganizationNumber]').fill('0000040004');await financeForm.locator('[type=submit]').click();await financeForm.waitFor({state:'detached'});data=await persisted();assert.equal(data.parties.length,2);assert.equal(data.parties.find(p=>p.id===data.properties[0].owner_party_id).organization_number,'000004-0004');assert(data.properties.every(p=>p.ownerOrganizationNumber===undefined));
  await nav('datamodel');await page.locator('[data-relationship-table=agreements]').click();assert.equal(await page.locator('[data-relationship-table=contractBusinesses]').count(),0);assert.equal(await page.locator('[data-relationship-table=contacts]').count(),1);

  await page.reload();await page.locator('#content > *').first().waitFor();await nav('properties');assert.match(await page.locator('#content').innerText(),/Eken 1/);
  await page.setViewportSize({width:390,height:900});for(const view of ['overview','properties','contracts','activities','map','sources']){await nav(view);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,view+' mobile overflow');}
  await page.screenshot({path:path.join(artifacts,mode+'-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
  if(mode==='browser-excel')assert.equal(store.snapshot().data.properties.length,0,'Browser Excel never uploads records to the API');
  if(mode==='browser-excel'){
   const safety=await page.evaluate(async()=>{
    const {BrowserExcel}=await import('/frontend/lokaler/excel-client.js');
    const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle('stability-check.xlsx',{create:true});
    const client=await BrowserExcel.connect(true,()=>{},handle);
    await client.save('properties',{id:'TEST-F',name:'Fiktiv stabilitet'},client.version,true);
    const held=await handle.createWritable({mode:'exclusive'}),version=client.version;
    let blocked='';try{await client.save('properties',{id:'TEST-F',name:'Ska inte sparas'},client.version);}catch(error){blocked=error.message;}finally{await held.abort();}
    const unchanged=client.version===version&&client.data.properties[0].name==='Fiktiv stabilitet';
    await client.save('properties',{id:'TEST-F',name:'Godkänt återförsök'},client.version);await client.reload();
    const other=new BrowserExcel(handle);await other.reload();await other.save('properties',{id:'TEST-F',name:'Extern ändring'},other.version);
    let conflict='';try{await client.save('properties',{id:'TEST-F',name:'Ska inte skriva över'},client.version);}catch(error){conflict=error.message;}
    await client.reload();
    return {blocked,unchanged,conflict,name:client.data.properties[0].name,busy:client.busy};
   });
   assert.match(safety.blocked,/låst eller skrivskyddad/);assert.equal(safety.unchanged,true);assert.match(safety.conflict,/ändrats utanför appen/);assert.equal(safety.name,'Extern ändring');assert.equal(safety.busy,false);assert.deepEqual(errors,[]);
   console.log('browser-excel: native exclusive file lock, retry, external-change protection and reload passed');
  }
  console.log(mode+': original overview, reviewed import, reimport, linked owner/tenant organization numbers, editors, persistence and mobile passed');
 }catch(error){await page.screenshot({path:path.join(artifacts,mode+'-failure.png'),fullPage:true});throw error;}
 finally{await page.close();await new Promise(resolve=>server.close(resolve));await store.close();await rm(dir,{recursive:true,force:true});}
}
try{for(const mode of process.env.LOKALBLICK_TEST_MODE?[process.env.LOKALBLICK_TEST_MODE]:['sqlite','excel','browser-excel'])await scenario(mode);console.log('Screenshots: '+artifacts);}finally{await browser.close();}
