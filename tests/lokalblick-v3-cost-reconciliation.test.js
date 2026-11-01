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
test('dated or indexed supplement is not mistaken for a fully paid annual advance',()=>{
 const data=base();
 data.agreementItems[0].valid_from='2026-07-01';
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').status,'review');
 data.agreementItems[0].valid_from='2020-01-01';
 data.agreementItems[0].adjustment_method='kpi';
 assert.equal(reconcileAnnualCosts(data).find(x=>x.agreementId==='A-1').status,'review');
});
test('no complete yearly lease or matching property cost creates no fabricated debit',()=>{
 const data=base();
 data.agreements[0].versions[0].valid_from='2026-06-01';
 assert.equal(reconcileAnnualCosts(data).some(x=>x.agreementId==='A-1'),false);
 const other={...base(),recurringCosts:[{...costs()[0],property_id:'other'}]};
 assert.deepEqual(reconcileAnnualCosts(other),[]);
});
