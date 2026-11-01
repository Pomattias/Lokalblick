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
test('min/max cap the rental increase (not the CPI index)',()=>{
 const row=item({adjustment_method:'kpi-limited',base_index:400,index_share:1,min_percent:2,max_percent:5});
 assert.equal(calculateAnnualRate(row,{year:2026,index:404}).amount,122400);
 assert.equal(calculateAnnualRate(row,{year:2026,index:412}).amount,123600);
 assert.equal(calculateAnnualRate(row,{year:2026,index:440}).amount,126000);
 assert.equal(calculateAnnualRate({...row,min_percent:null},{year:2026,index:398}).amount,120000);
 assert.equal(calculateAnnualRate({...row,max_percent:null},{year:2026,index:440}).amount,132000);
});
test('base rent and supplement have independently constrained increases',()=>{
 const rent=item({id:'rent',type:'base',base_amount:100000,adjustment_method:'kpi-limited',base_index:400,index_share:1,min_percent:2,max_percent:4});
 const extra=item({id:'extra',type:'addition',base_amount:20000,adjustment_method:'kpi-limited',base_index:400,index_share:1,min_percent:0,max_percent:8});
 const summary=annualRateSummary([rent,extra],'2026-12-31',{index:440});
 assert.equal(summary.nominal,120000);
 assert.equal(summary.calculated,125600);
 assert.equal(summary.lines.find(x=>x.id==='rent').amount,104000);
 assert.equal(summary.lines.find(x=>x.id==='extra').amount,21600);
});
test('bad min/max or missing CPI remains unresolved',()=>{
 const row=item({adjustment_method:'kpi-limited',base_index:400,index_share:1,min_percent:1,max_percent:5});
 assert.equal(calculateAnnualRate(row,{year:2026}).amount,null);
 assert.equal(calculateAnnualRate({...row,min_percent:6},{year:2026,index:440}).amount,null);
 assert.equal(calculateAnnualRate({...row,min_percent:-1},{year:2026,index:440}).amount,null);
 assert.equal(calculateAnnualRate({...row,min_percent:null,max_percent:null},{year:2026,index:440}).amount,null);
 const s=annualRateSummary([row,item({id:'other',base_amount:1000})],'2026-12-31');
 assert.equal(s.nominal,121000);assert.equal(s.known,1000);
 assert.equal(s.calculated,null);assert.equal(s.unresolved,1);
});
test('optional caps apply to regular KPI and fixed adjustments',()=>{
 const indexed=item({adjustment_method:'kpi',base_index:400,index_share:0.7,min_percent:2,max_percent:4});
 assert.equal(calculateAnnualRate(indexed,{year:2026,index:440}).amount,124800);
 const fixed=item({adjustment_method:'fixed',base_year:2025,annual_percent:8,max_percent:5});
 assert.equal(calculateAnnualRate(fixed,{year:2026}).amount,126000);
 const zero=item({adjustment_method:'kpi',index_share:0,base_index:null});
 assert.equal(calculateAnnualRate(zero,{year:2026}).amount,120000);
 assert.equal(calculateAnnualRate({...zero,min_percent:2},{year:2026}).amount,122400);
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
