import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileAnnualCosts} from '../frontend/v3/cost-reconciliation.js';

const costs=(category='water',actual={amount:50000,kind:'annual',complete:true})=>
 [{id:'cost',property_id:'p',category,valid_from:'2020-01-01',valid_to:null,actual}];
const obj=(id,area)=>({id,property_id:'p',ended_on:null,object_number:id,
 versions:[{valid_from:'2020-01-01',area}]});
const agreement=(id,object_id)=>({id,object_id,agreement_number:id,
 versions:[{valid_from:'2020-01-01',legal_end_on:null}]});
const line=(agreement_id,type,amount,id='item')=>({id,agreement_id,type,base_amount:amount,
 adjustment_method:'none',valid_from:'2020-01-01',valid_to:null});
const base=()=>({year:2026,properties:[{id:'p',name:'Fastigheten'}],
 objects:[obj('tenant',100),obj('included',100),obj('vacant',800)],
 agreements:[agreement('A-1','tenant'),agreement('A-2','included')],
 agreementItems:[line('A-1','water',3000)],recurringCosts:costs()});

test('annual VA settlement uses 100 of 1000 sqm, deducts 3000 kr advance, leaves no-supplement contract included',()=>{
 const rows=reconcileAnnualCosts(base());
 assert.equal(rows.length,2);
 const a=rows.find(x=>x.agreementId==='A-1');
 assert.equal(a.status,'ready');
 assert.equal(a.totalArea,1000);
 assert.equal(a.area,100);
 assert.equal(a.share,10);
 assert.equal(a.totalCost,50000);
 assert.equal(a.allocatedCost,5000);
 assert.equal(a.annualSupplement,3000);
 assert.equal(a.difference,2000);
 const noAddon=rows.find(x=>x.agreementId==='A-2');
 assert.equal(noAddon.status,'included');
 assert.equal(noAddon.difference,null);
 assert.equal(noAddon.allocatedCost,null);
});
test('different cost categories and separately classified supplements do not cross-charge',()=>{
 const data=base();
 data.recurringCosts.push({...costs('heat',{amount:30000,complete:true,kind:'annual'})[0],id:'heat'});
 data.agreementItems.push(line('A-1','heat',1500,'heat-item'));
 const rows=reconcileAnnualCosts(data);
 assert.equal(rows.find(x=>x.agreementId==='A-1'&&x.category==='water').difference,2000);
 assert.equal(rows.find(x=>x.agreementId==='A-1'&&x.category==='heat').difference,1500);
 assert.equal(rows.find(x=>x.agreementId==='A-2'&&x.category==='heat').status,'included');
});
test('a generic unclassified addition does not falsely enable VA reconciliation',()=>{
 const data=base();data.agreementItems=[line('A-1','addition',3000)];
 const result=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(result.status,'included');
 assert.equal(result.difference,null);
});
test('more advance than allocated cost produces a credit, not extra debit',()=>{
 const data=base();data.agreementItems=[line('A-1','water',6000)];
 const result=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(result.status,'ready');
 assert.equal(result.difference,-1000);
});
test('multiple source cost lines for a category are aggregated exactly once',()=>{
 const data=base();
 data.recurringCosts=[{...costs()[0],id:'c1',actual:{amount:30000,complete:true,kind:'annual'}},
  {...costs()[0],id:'c2',actual:{amount:20000,complete:true,kind:'annual'}}];
 const a=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(a.totalCost,50000);
 assert.equal(a.difference,2000);
 assert.deepEqual(a.costIds,['c1','c2']);
});
test('missing certified annual evidence, missing area and changing area require a review',()=>{
 const data=base();
 data.recurringCosts=costs('water',{amount:25000,kind:'invoices',complete:false});
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').status,'review');
 data.recurringCosts=costs();
 data.objects[2].versions[0].area=null;
 assert.match(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').reason,/area/i);
 data.objects[2].versions[0].area=800;
 data.objects[1].versions.unshift({valid_from:'2026-06-01',area:120});
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').status,'review');
});
test('indexed supplement cannot be assumed paid at a fixed annual rate',()=>{
 const data=base();data.agreementItems[0].adjustment_method='kpi';
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').status,'review');
});
test('partial-year tenancy prorates both allocated cost and fixed annual VA supplement by exact days',()=>{
 const data=base();
 data.agreements[0].versions[0].valid_from='2026-06-01';
 const r=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(r.status,'ready');
 assert.equal(r.tenancyFrom,'2026-06-01');
 assert.equal(r.tenancyTo,'2026-12-31');
 assert.equal(r.tenancyDays,214);
 assert.equal(r.reconciliationDays,214);
 assert.equal(r.yearDays,365);
 assert.equal(r.allocatedCost,Math.round(5000*214/365*100)/100);
 assert.equal(r.annualSupplement,Math.round(3000*214/365*100)/100);
 assert.equal(r.difference,Math.round((r.allocatedCost-r.annualSupplement)*100)/100);
});
test('consecutive tenant replacements are separately prorated without double charging',()=>{
 const data=base();
 data.agreements=[agreement('A-1','tenant'),agreement('A-3','tenant')];
 data.agreements[0].versions[0].legal_end_on='2026-06-30';
 data.agreements[1].versions[0].valid_from='2026-07-01';
 data.agreementItems=[line('A-1','water',3000,'a1'),line('A-3','water',3000,'a3')];
 const rows=reconcileAnnualCosts(data);
 const a=rows.find(x=>x.agreementId==='A-1'),b=rows.find(x=>x.agreementId==='A-3');
 assert.equal(rows.length,2);
 assert.equal(a.status,'ready');assert.equal(b.status,'ready');
 assert.equal(a.tenancyDays,181);assert.equal(b.tenancyDays,184);
 assert.equal(a.reconciliationDays+b.reconciliationDays,365);
 assert.equal(a.allocatedCost+b.allocatedCost,5000);
 assert.equal(a.annualSupplement+b.annualSupplement,3000);
 assert.equal(a.difference+b.difference,2000);
 assert.equal(a.tenancyTo,'2026-06-30');assert.equal(b.tenancyFrom,'2026-07-01');
});
test('a revised lease version does not restart the original tenancy period',()=>{
 const data=base();
 data.agreements[0].versions.push({valid_from:'2026-07-01',legal_end_on:null});
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').tenancyDays,365);
});
test('supplement begins midyear: only matching supplement days are reconciled',()=>{
 const data=base();data.agreementItems[0].valid_from='2026-07-01';
 const r=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(r.status,'ready');
 assert.equal(r.tenancyDays,365);assert.equal(r.reconciliationDays,184);
 assert.equal(r.periods[0].from,'2026-07-01');
 assert.equal(r.allocatedCost,Math.round(5000*184/365*100)/100);
 assert.equal(r.annualSupplement,Math.round(3000*184/365*100)/100);
});
test('supplement rate revision midyear sums separate prorated advances',()=>{
 const data=base();
 data.agreementItems[0].valid_to='2026-06-30';
 data.agreementItems.push({...line('A-1','water',6000,'revised'),valid_from:'2026-07-01'});
 const r=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(r.status,'ready');assert.equal(r.reconciliationDays,365);
 assert.equal(r.annualSupplement,Math.round((3000*181+6000*184)/365*100)/100);
 assert.equal(r.allocatedCost,5000);
});
test('overlapping same-object tenancies require review instead of double billing',()=>{
 const data=base();
 data.agreements.push(agreement('A-3','tenant'));
 data.agreements[2].versions[0].valid_from='2026-06-01';
 data.agreementItems.push(line('A-3','water',3000,'a3'));
 const r=reconcileAnnualCosts(data);
 assert.equal(r.find(x=>x.agreementId==='A-1').status,'review');
 assert.equal(r.find(x=>x.agreementId==='A-3').status,'review');
});
test('overlapping supplement lines require review instead of counting tenant area twice',()=>{
 const data=base();data.agreementItems.push({...line('A-1','water',1000,'extra')});
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').status,'review');
});
test('lease ended prior to year is not allocated; vacant area remains in property total',()=>{
 const data=base();data.agreements[0].versions[0].legal_end_on='2025-12-31';
 const r=reconcileAnnualCosts(data);
 assert.equal(r.some(x=>x.agreementId==='A-1'),false);
 assert.equal(r.find(x=>x.agreementId==='A-2').status,'included');
});
test('leap day is included in partial-year annual settlement',()=>{
 const data=base();data.year=2024;
 data.agreements[0].versions[0].valid_from='2024-02-01';
 data.agreements[0].versions[0].legal_end_on='2024-02-29';
 const r=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(r.status,'ready');
 assert.equal(r.yearDays,366);assert.equal(r.tenancyDays,29);
 assert.equal(r.allocatedCost,Math.round(5000*29/366*100)/100);
 assert.equal(r.annualSupplement,Math.round(3000*29/366*100)/100);
});
test('partial property cost evidence still requires review',()=>{
 const data=base();data.recurringCosts[0].valid_to='2026-06-30';
 const r=reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1');
 assert.equal(r.status,'review');assert.match(r.reason,/årskostnad/i);
});
test('no matching property cost creates no fabricated debit',()=>{
 const other={...base(),recurringCosts:[{...costs()[0],property_id:'other'}]};
 assert.deepEqual(reconcileAnnualCosts(other),[]);
});
