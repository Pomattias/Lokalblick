import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnnualRate,annualRateSummary,snapshotAnnualRate} from '../frontend/v3/rent-calculation.js';

const item=(fields={})=>({id:'x',agreement_id:'a',base_amount:120000,adjustment_method:'none',...fields});
test('unadjusted and fixed compounded rent use the same explicit year',()=>{
 assert.equal(calculateAnnualRate(item(),{year:2026}).amount,120000);
 const fixed=item({adjustment_method:'fixed',base_year:2024,annual_percent:5});
 assert.equal(calculateAnnualRate(fixed,{year:2024}).amount,120000);
 assert.equal(calculateAnnualRate(fixed,{year:2026}).amount,132300);
 assert.equal(calculateAnnualRate({...fixed,annual_percent:-5},{year:2026}).amount,120000);
 assert.equal(calculateAnnualRate({...fixed,annual_percent:-5,floor:0},{year:2026}).amount,108300);
 assert.equal(calculateAnnualRate({...fixed,base_year:null},{year:2026}).amount,null);
 assert.equal(calculateAnnualRate({...fixed,annual_percent:null},{year:2026}).amount,null);
});
test('KPI adjustment uses explicit index, base index, partial share and floor',()=>{
 const kpi=item({adjustment_method:'kpi',base_index:400,index_share:0.7});
 assert.equal(calculateAnnualRate(kpi,{year:2026,index:440}).amount,128400);
 assert.equal(calculateAnnualRate(kpi,{year:2026}).amount,null);
 assert.equal(calculateAnnualRate(kpi,{year:2026,index:380}).amount,120000);
 assert.equal(calculateAnnualRate({...kpi,floor:0},{year:2026,index:380}).amount,115800);
 assert.equal(calculateAnnualRate({...kpi,index_share:0},{year:2026,index:440}).amount,120000);
 assert.equal(calculateAnnualRate({...kpi,base_index:0},{year:2026,index:440}).amount,null);
});
test('annual min and max apply to PREVIOUS year rental rate, not once to base rent',()=>{
 const row=item({adjustment_method:'kpi-limited',base_year:2025,base_index:400,index_share:1,min_percent:2,max_percent:5});
 assert.equal(calculateAnnualRate(row,{year:2025}).amount,120000);
 assert.equal(calculateAnnualRate(row,{year:2026,index:404}).amount,122400);
 assert.equal(calculateAnnualRate(row,{year:2026,index:412}).amount,123600);
 assert.equal(calculateAnnualRate(row,{year:2026,index:440}).amount,126000);
 assert.equal(calculateAnnualRate(row,{year:2027,index:484,indexHistory:{2026:440}}).amount,132300);
 // The following 1% CPI becomes the annual 2% minimum on the 2026 rent.
 assert.equal(calculateAnnualRate(row,{year:2027,index:444.4,indexHistory:{2026:440}}).amount,128520);
 assert.equal(calculateAnnualRate({...row,min_percent:null},{year:2026,index:398}).amount,120000);
 assert.equal(calculateAnnualRate({...row,max_percent:null},{year:2026,index:440}).amount,132000);
});
test('guaranteed 2 percent minimum raises rent even when CPI is negative or unchanged',()=>{
 const rent=item({adjustment_method:'kpi-limited',base_amount:100000,
  base_year:2025,base_index:400,index_share:1,min_percent:2,max_percent:5});
 for(const [index,expected] of [[380,102000],[400,102000],[404,102000],[412,103000],[440,105000]]){
  assert.equal(calculateAnnualRate(rent,{year:2026,index}).amount,expected,
   'annual rent must honor 2% minimum for October CPI '+index);
 }
 // Two successive years of deflation still produce two guaranteed increases.
 const second=calculateAnnualRate(rent,{year:2027,index:360,indexHistory:{2026:380}});
 assert.equal(second.amount,104040);
 // Minimum is contractual, not merely the optional no-reduction floor.
 assert.equal(calculateAnnualRate({...rent,floor:0},{year:2026,index:380}).amount,102000);
 // A supplement may have its own independent guaranteed increase.
 const supplement={...rent,id:'extra',type:'addition',base_amount:20000,min_percent:3,max_percent:7};
 const total=annualRateSummary([rent,supplement],'2026-12-31',{index:380});
 assert.equal(total.calculated,122600);
 assert.equal(total.lines.find(x=>x.id==='extra').amount,20600);
});
test('different annual rent limits per base and addition also compound independently',()=>{
 const rent=item({id:'rent',type:'base',base_amount:100000,adjustment_method:'kpi-limited',base_year:2025,base_index:400,index_share:1,min_percent:2,max_percent:4});
 const extra=item({id:'extra',type:'addition',base_amount:20000,adjustment_method:'kpi-limited',base_year:2025,base_index:400,index_share:1,min_percent:0,max_percent:8});
 const summary=annualRateSummary([rent,extra],'2026-12-31',{index:440});
 assert.equal(summary.nominal,120000);
 assert.equal(summary.calculated,125600);
 const next=annualRateSummary([rent,extra],'2027-12-31',{index:484,indexHistory:{2026:440}});
 assert.equal(next.nominal,120000);
 assert.equal(next.calculated,131488); // 100000*1.04^2 + 20000*1.08^2
 assert.equal(next.lines.find(x=>x.id==='rent').amount,108160);
 assert.equal(next.lines.find(x=>x.id==='extra').amount,23328);
});
test('annual KPI needs all intervening observations; never derive annual cap from one distant index',()=>{
 const row=item({adjustment_method:'kpi-limited',base_year:2024,base_index:400,index_share:1,min_percent:1,max_percent:5});
 const missing=calculateAnnualRate(row,{year:2027,index:450});
 assert.equal(missing.amount,null);assert.match(missing.reason,/2025/);
 assert.equal(calculateAnnualRate(row,{year:2027,index:450,indexHistory:{2025:420}}).amount,null);
 assert.equal(calculateAnnualRate(row,{year:2027,index:450,indexHistory:{2025:420,2026:440}}).amount,135000);
 assert.equal(calculateAnnualRate({...row,min_percent:6,max_percent:5},{year:2027,index:450,indexHistory:{2025:420,2026:440}}).amount,null);
 assert.equal(calculateAnnualRate({...row,min_percent:-1},{year:2027,index:450,indexHistory:{2025:420,2026:440}}).amount,null);
 const result=annualRateSummary([row,item({id:'ordinary',base_amount:1000})],'2027-12-31',{index:450});
 assert.equal(result.nominal,121000);assert.equal(result.known,1000);assert.equal(result.calculated,null);assert.equal(result.unresolved,1);
});
test('fixed rent increase is bounded EACH year and floor controls decreases',()=>{
 const row=item({adjustment_method:'fixed',base_year:2025,annual_percent:8,min_percent:2,max_percent:5});
 assert.equal(calculateAnnualRate(row,{year:2026}).amount,126000);
 assert.equal(calculateAnnualRate(row,{year:2027}).amount,132300);
 assert.equal(calculateAnnualRate({...row,annual_percent:1},{year:2027}).amount,124848);
 const noCap=item({adjustment_method:'fixed',base_year:2024,annual_percent:-5,floor:0});
 assert.equal(calculateAnnualRate(noCap,{year:2026}).amount,108300);
});
test('unbounded KPI continues to use base to end point and zero percent share is nominal',()=>{
 const row=item({adjustment_method:'kpi',base_index:400,index_share:0.7});
 assert.equal(calculateAnnualRate(row,{year:2026,index:440}).amount,128400);
 const zero=item({adjustment_method:'kpi',index_share:0,base_index:null});
 assert.equal(calculateAnnualRate(zero,{year:2026}).amount,120000);
 assert.equal(calculateAnnualRate({...zero,base_year:2025,min_percent:2},{year:2026}).amount,122400);
});
test('date-effective annualized rent never adds multiple periods from a single agreement',()=>{
 const old=item({id:'old',base_amount:120000,valid_from:'2025-01-01',valid_to:'2026-06-30'});
 const next=item({id:'next',base_amount:135000,valid_from:'2026-07-01'});
 assert.equal(annualRateSummary([old,next],'2026-05-01').nominal,120000);
 assert.equal(annualRateSummary([old,next],'2026-12-31').nominal,135000);
});
test('snapshot rate excludes noncurrent agreements and objects, with optional property scope',()=>{
 const snapshot={
  objects:[{id:'o',property_id:'p',versions:[{valid_from:'2020-01-01'}]},
   {id:'closed',property_id:'p',ended_on:'2025-12-31',versions:[{valid_from:'2020-01-01'}]}],
  agreements:[{id:'a',object_id:'o',versions:[{valid_from:'2020-01-01',legal_end_on:null}]},
   {id:'expired',object_id:'closed',versions:[{valid_from:'2020-01-01'}]}],
  agreementItems:[item(),item({id:'exp',agreement_id:'expired',base_amount:30000})]
 };
 assert.equal(snapshotAnnualRate(snapshot,'2026-10-27').nominal,120000);
 assert.equal(snapshotAnnualRate(snapshot,'2026-10-27',{propertyId:'unknown'}).count,0);
});

test('zero uplift needs no index observation or base year, but missing base rent never becomes zero',()=>{
 const kpi=item({adjustment_method:'kpi',index_share:0,base_index:null});
 const fixed=item({adjustment_method:'fixed',annual_percent:0,base_year:null});
 assert.equal(calculateAnnualRate(kpi,{year:2026}).amount,120000);
 assert.equal(calculateAnnualRate(fixed,{year:2026}).amount,120000);
 assert.equal(calculateAnnualRate(item({base_amount:null}),{year:2026}).amount,null);
 assert.equal(calculateAnnualRate(item({base_amount:''}),{year:2026}).amount,null);
 assert.equal(calculateAnnualRate(item({adjustment_method:'kpi',index_share:null,base_index:null}),{year:2026}).amount,null);
});
