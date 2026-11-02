// Smoke the native v3 frontend against a temporary private in-memory database.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { openMemoryDatabase } from '../backend/lokaler/v3/database.js';
import { CoreV3Store } from '../backend/lokaler/v3/core-store.js';
import { createServer } from '../backend/lokaler/server.mjs';
const db=openMemoryDatabase(),store=new CoreV3Store(db),server=createServer(store,{v3:true});
let browser;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.LOKALBLICK_CHROMIUM_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const go=async view=>{await page.locator('.sidebar [data-view="'+view+'"]').click();await assert.rejects(async()=>{await page.getByText('Anslutningen saknas', {exact:true}).waitFor({timeout:80})})};
 const save=async()=>{await page.locator('#edit-form button[type=submit]').click();await page.locator('#editor').waitFor({state:'hidden'});};
 const add=async(view,fill)=>{await go(view);await page.locator('#new-record').click();await fill();await save()};
 await page.goto(origin+'/frontend/v3/');
 await page.locator('#heading').getByText('Översikt').waitFor();
 await add('properties',async()=>{await page.locator('#edit-form [name=name]').fill('Mobilfastigheten');await page.locator('#edit-form [name=address]').fill('Testgatan 1')});
 await page.getByRole('button',{name:/Mobilfastigheten/}).first().waitFor();
 // A child created from its parent's detail inherits that parent without manual selection.
 await page.locator('.record-row').filter({hasText:'Mobilfastigheten'}).click();
 await page.locator('#detail [data-create-child="objects"]').click();
 assert.equal(await page.locator('#edit-form [name=property_id]').count(),0);
 await page.locator('#edit-form [name=object_number]').fill('102');
 await page.locator('#edit-form [name=valid_from]').fill('2020-01-01');
 await save();
 assert.equal(await page.locator('#heading').innerText(),'Objekt');
 await page.locator('#detail [data-create-child="agreements"]').click();
 assert.equal(await page.locator('#edit-form [name=object_id]').count(),0);
 await page.locator('#edit-form [name=agreement_number]').fill('A-102');
 await page.locator('#edit-form [name=valid_from]').fill('2025-01-01');
 await save();
 assert.equal(await page.locator('#heading').innerText(),'Avtal');
 const parentSnapshot=await (await fetch(origin+'/api/v3/core')).json();
 const parentProperty=parentSnapshot.properties.find(x=>x.name==='Mobilfastigheten');
 const childObject=parentSnapshot.objects.find(x=>x.object_number==='102');
 const childAgreement=parentSnapshot.agreements.find(x=>x.agreement_number==='A-102');
 assert.equal(childObject.property_id,parentProperty.id);
 assert.equal(childAgreement.object_id,childObject.id);
 assert.match(await page.locator('#detail').innerText(),/Nominell årshyresnivå/);
 // Browser contract: revised terms are a dated successor, not an overwrite.
 await page.locator('#detail [data-mode=rent]').click();
 await page.locator('#edit-form [name=base_amount]').fill('120000');
 await page.locator('#edit-form [name=valid_from]').fill('2025-01-01');
 await page.locator('#edit-form [name=adjustment_method]').selectOption('kpi-limited');
 await page.locator('#edit-form [name=base_index]').fill('400');
 await page.locator('#edit-form [name=index_share]').fill('1');
 await page.locator('#edit-form [name=min_percent]').fill('2');
 await page.locator('#edit-form [name=max_percent]').fill('5');
 await save();
 await page.locator('#detail [data-edit-rent]').click();
 await page.locator('#edit-form [name=base_amount]').fill('135000');
 await page.locator('#edit-form [name=valid_from]').fill('2026-01-01');
 await page.locator('#edit-form [name=min_percent]').fill('1');
 await page.locator('#edit-form [name=max_percent]').fill('4');
 await save();
 const rentalSnapshot=await (await fetch(origin+'/api/v3/core')).json();
 const rentalPeriods=rentalSnapshot.agreementItems.filter(i=>i.agreement_id===childAgreement.id);
 assert.equal(rentalPeriods.length,2);
 assert.equal(rentalPeriods.find(i=>i.base_amount===120000).valid_to,'2025-12-31');
 assert.equal(rentalPeriods.find(i=>i.base_amount===135000).valid_from,'2026-01-01');
 assert.equal(rentalPeriods.find(i=>i.base_amount===120000).min_percent,2);
 assert.equal(rentalPeriods.find(i=>i.base_amount===120000).max_percent,5);
 assert.equal(rentalPeriods.find(i=>i.base_amount===135000).min_percent,1);
 assert.equal(rentalPeriods.find(i=>i.base_amount===135000).max_percent,4);
 await add('objects',async()=>{await page.locator('#edit-form [name=property_id]').selectOption({index:1});await page.locator('#edit-form [name=object_number]').fill('101');await page.locator('#edit-form [name=valid_from]').fill('2020-01-01');await page.locator('#edit-form [name=area]').fill('200')});
 await page.locator('.record-row').first().click();
 await page.locator('[data-mode=revise]').click();await page.locator('#edit-form [name=valid_from]').fill('2026-07-01');await page.locator('#edit-form [name=area]').fill('250');await save();
 assert.match(await page.locator('#detail').innerText(),/250 m²/);
 await add('agreements',async()=>{await page.locator('#edit-form [name=object_id]').selectOption({index:1});await page.locator('#edit-form [name=agreement_number]').fill('A-101');await page.locator('#edit-form [name=valid_from]').fill('2025-01-01')});
 await add('issues',async()=>{await page.locator('#edit-form [name=home]').selectOption({index:1});await page.locator('#edit-form [name=title]').fill('Kontrollera tak')});
 await add('recurringCosts',async()=>{await page.locator('#edit-form [name=property_id]').selectOption({index:1});await page.locator('#edit-form [name=name]').fill('Värme');await page.locator('#edit-form [name=annual_amount]').fill('50000')});
 await add('budgets',async()=>{await page.locator('#edit-form [name=property_id]').selectOption({index:1});await page.locator('#edit-form [name=budget_year]').fill('2026')});
 await page.locator('.record-row').first().click();
 await page.locator('[data-mode=kpi]').click();
 await page.locator('#edit-form [name=scenario_index]').fill('425.42');
 await save();
 assert.match(await page.locator('#detail').innerText(),/425.42|425,42/);
 await add('spaces',async()=>{await page.locator('#edit-form [name=home]').selectOption({index:1});await page.locator('#edit-form [name=name]').fill('Entré')});
 await add('inspections',async()=>{await page.locator('#edit-form [name=home]').selectOption({index:1});await page.locator('#edit-form [name=inspected_on]').fill('2026-10-27')});
 await go('sources');
 await page.locator('.smart-import-legacy > summary').click();
 await page.locator('[data-import-register]').selectOption('properties');
 const csv=Buffer.from('Fastighetsnamn;Adress\nImportfastigheten;Importgatan 4\n','utf8');
 await page.locator('[data-import-file]').setInputFiles({name:'syntetiskt.csv',mimeType:'text/csv',buffer:csv});
 await page.locator('[data-import-apply]:not([disabled])').waitFor();
 assert.equal(await page.locator('[data-import-apply]').isEnabled(),true);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-import-apply]').click();
 await page.locator('#feedback').getByText(/åtgärder importerade/).waitFor();
 await go('properties');
 assert.match(await page.locator('.record-list').innerText(),/Importfastigheten/);

 await go('properties');
 await page.locator('.record-row').filter({hasText:'Mobilfastigheten'}).click();
 await page.locator('#detail [data-jump-view="objects"]').first().click();
 assert.equal(await page.locator('#heading').innerText(),'Objekt');
 await page.locator('#toggle-history').click();
 assert.equal(await page.locator('#toggle-history').getAttribute('aria-pressed'),'true');
 await page.locator('#toggle-history').click();
 await go('properties');
 await page.locator('.record-row').filter({hasText:'Mobilfastigheten'}).click();
 await page.locator('#detail [data-mode="edit"]').click();
 await page.locator('#edit-form [name=latitude]').fill('55.607');
 await page.locator('#edit-form [name=longitude]').fill('13.010');
 await save();
 await go('map');
 await page.locator('#map-panel [data-map-property]').first().click();
 assert.equal(await page.locator('#heading').innerText(),'Fastigheter');
 const tight=await page.locator('.record-row').first().evaluate(r=>{
  const title=r.querySelector('strong')?.getBoundingClientRect(),sub=r.querySelector('small')?.getBoundingClientRect();
  return title&&sub&&Math.abs(title.top-sub.top)<=5;
 });
 assert.equal(tight,true,'Registerraden visar namn och adress på samma rad');
 await go('datamodel');await page.locator('.record-row').first().click();
 assert.match(await page.locator('#detail').innerText(),/Kolumner/);

 // Parent actions propose a business number but never replace immutable IDs.
 await add('properties',async()=>{
  await page.locator('#edit-form [name=name]').fill('Seriefastigheten');
  await page.locator('#edit-form [name=management_object_number]').fill('SF1213');
 });
 await go('properties');
 await page.locator('.record-row').filter({hasText:'Seriefastigheten'}).click();
 await page.locator('#detail [data-create-child="objects"]').click();
 assert.equal(await page.locator('#edit-form [name=object_number]').inputValue(),'SF1213-001');
 await page.locator('#edit-form [name=valid_from]').fill('2020-01-01');
 await save();
 await page.locator('#detail [data-create-child="agreements"]').click();
 assert.equal(await page.locator('#edit-form [name=agreement_number]').inputValue(),'SF1213-001-01');
 await page.locator('#edit-form [name=valid_from]').fill('2020-01-01');
 await save();
 const numbered=await (await fetch(origin+'/api/v3/core')).json();
 const numberedProperty=numbered.properties.find(x=>x.management_object_number==='SF1213');
 const numberedObject=numbered.objects.find(x=>x.property_id===numberedProperty.id);
 assert.equal(numberedObject.object_number,'SF1213-001');
 assert.equal(numbered.agreements.find(a=>a.object_id===numberedObject.id).agreement_number,'SF1213-001-01');
 // A multi-property import must not invent a second object merely because an
 // external source has a new contract number without a physical object number.
 await go('sources');
 await page.locator('.smart-import-legacy > summary').click();
 await page.locator('[data-import-register]').selectOption('agreementLinks');
 const rows=Buffer.from('Fastighetsnummer;Avtalsnummer;Startdatum;Objektsnummer\nSF1213;EXTERNAL-11;2026-01-01;SF1213-001\nSF1213;EXTERNAL-12;2026-03-01;\n','utf8');
 await page.locator('[data-import-file]').setInputFiles({name:'avtalslista.csv',mimeType:'text/csv',buffer:rows});
 assert.equal(await page.locator('[data-import-apply]').isDisabled(),true,'Unclear object link cannot be silently imported');
 await page.locator('[data-link-object="1"]').selectOption('@new');
 assert.equal(await page.locator('[data-import-apply]').isEnabled(),true);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-import-apply]').click();
 await page.locator('#feedback').getByText(/åtgärder importerade/).waitFor();
 const linked=await (await fetch(origin+'/api/v3/core')).json();
 assert.equal(linked.objects.filter(o=>o.property_id===numberedProperty.id).length,2);
 const existingLease=linked.agreements.find(a=>a.agreement_number==='EXTERNAL-11');
 const newLease=linked.agreements.find(a=>a.agreement_number==='EXTERNAL-12');
 assert.equal(existingLease.object_id,numberedObject.id);
 assert.equal(linked.objects.find(o=>o.id===newLease.object_id).object_number,'SF1213-002');
 assert.equal(linked.objects.find(o=>o.id===newLease.object_id).currentVersion.area,null);

 // Default, no-configuration import creates the entire relationship chain.
 await go('sources');
 const autoCsv=Buffer.from(
  'Fastighetsnummer;Fastighetsnamn;Objektnummer;Yta;Avtalsnummer;Startdatum;Hyresgäst;Fastighetsägare;Förvaltare;Bashyra;Bashyra basår;Tillägg;Tillägg basår\n'+
  'SF3300;Importkvarteret;SF3300-001;125;TEST-3300-01;2025-01-01;Butik Syd AB;Ägaren Syd AB;Eva Förvaltare;120000;2025;3000;2024\n','utf8');
 await page.locator('[data-smart-file]').setInputFiles({name:'blandad-lista.csv',mimeType:'text/csv',buffer:autoCsv});
 await page.locator('[data-smart-save]').waitFor();
 assert.equal(await page.locator('[data-smart-save]').isEnabled(),true);
 assert.match(await page.locator('[data-smart-results]').innerText(),/Ny eller kompletterad|Nya\/kopplade/);
 await page.locator('.smart-import-relations summary').first().click();
 const mappingDetails=await page.locator('.smart-import-relations').first().innerText();
 assert.match(mappingDetails,/Hyresgäst/);
 assert.match(mappingDetails,/Fastighetsägare/);
 assert.match(mappingDetails,/Förvaltare/);
 assert.match(mappingDetails,/Bashyra/);
 assert.match(mappingDetails,/basår 2025/);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-smart-save]').click();
 await page.locator('#feedback').getByText(/åtgärder importerade/).waitFor();
 const automatic=await (await fetch(origin+'/api/v3/core')).json();
 const autoProperty=automatic.properties.find(p=>p.management_object_number==='SF3300');
 const autoObject=automatic.objects.find(o=>o.property_id===autoProperty?.id);
 const autoAgreement=automatic.agreements.find(a=>a.agreement_number==='TEST-3300-01');
 assert.equal(autoObject.object_number,'SF3300-001');
 assert.equal(autoAgreement.object_id,autoObject.id);
 assert.equal(automatic.parties.find(p=>p.name==='Butik Syd AB')?.id,
  automatic.stakeholderAssignments.find(a=>a.agreement_id===autoAgreement.id&&a.role_code==='tenant')?.party_id);
 assert.equal(automatic.parties.find(p=>p.name==='Ägaren Syd AB')?.id,
  automatic.stakeholderAssignments.find(a=>a.property_id===autoProperty.id&&a.role_code==='owner')?.party_id);
 const managerRole=automatic.stakeholderAssignments.find(a=>a.property_id===autoProperty.id&&a.role_code==='asset_manager');
 assert.equal(automatic.people.find(p=>p.name==='Eva Förvaltare')?.id,managerRole?.person_id);
 assert.deepEqual(automatic.agreementItems.filter(x=>x.agreement_id===autoAgreement.id)
  .map(i=>[i.type,i.base_amount,i.base_year]),[['base',120000,2025],['addition',3000,2024]]);
 // Reimport must match existing records without creating duplicates.
 await go('sources');
 await page.locator('[data-smart-file]').setInputFiles({name:'blandad-lista.csv',mimeType:'text/csv',buffer:autoCsv});
 await page.locator('[data-smart-save]').waitFor();
 assert.equal(await page.locator('[data-smart-save]').isDisabled(),true);
 // New lease on the same property without an object number requires review.
 const ambiguousCsv=Buffer.from(
  'Fastighetsnummer;Fastighetsnamn;Avtalsnummer;Startdatum;Hyresgäst\n'+
  'SF3300;Importkvarteret;TEST-3300-02;2026-01-01;Butik Syd AB\n','utf8');
 await page.locator('[data-smart-file]').setInputFiles({name:'nya-avtal.csv',mimeType:'text/csv',buffer:ambiguousCsv});
 await page.locator('[data-smart-object="0"]').waitFor();
 assert.equal(await page.locator('[data-smart-save]').isDisabled(),true);
 await page.locator('[data-smart-object="0"]').selectOption(autoObject.id);
 assert.equal(await page.locator('[data-smart-save]').isEnabled(),true);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('[data-smart-save]').click();
 await page.locator('#feedback').getByText(/åtgärder importerade/).waitFor();
 const linkedSnapshot=await (await fetch(origin+'/api/v3/core')).json();
 assert.equal(linkedSnapshot.objects.filter(o=>o.property_id===autoProperty.id).length,1);
 assert.equal(linkedSnapshot.agreements.find(a=>a.agreement_number==='TEST-3300-02')?.object_id,autoObject.id);
 await go('overview');
 const geometry=await page.evaluate(()=>{
  const sw=document.documentElement.scrollWidth;
  const nodes=[...document.querySelectorAll('body *')].map(el=>{
   const r=el.getBoundingClientRect(),st=getComputedStyle(el);
   return {tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className.slice(0,70):'',right:Math.round(r.right),left:Math.round(r.left),width:Math.round(r.width),scroll:el.scrollWidth,client:el.clientWidth,overflow:st.overflowX};
  }).filter(x=>x.right>innerWidth+2||x.width>innerWidth+2).sort((a,b)=>b.right-a.right).slice(0,25);
  return {viewport:innerWidth,scrollWidth:sw,nodes};
 });
 if(geometry.scrollWidth>geometry.viewport)console.error('V3 mobile layout diagnostic:',JSON.stringify(geometry));
 assert.equal(geometry.scrollWidth<=geometry.viewport,true);
 assert.deepEqual(errors,[]);
 console.log('v3 browser: responsive CRUD, version history, inspection, finance and model view OK');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
