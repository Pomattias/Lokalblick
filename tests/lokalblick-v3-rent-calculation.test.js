import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnnualRate,annualRateSummary,snapshotAnnualRate} from '../shared/v3/rent-calculation.js';

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
test('contract-specific limits remain unresolved rather than invent a financial amount',()=>{
 const capped=item({adjustment_method:'kpi-limited',base_index:400,index_share:1,min_percent:1,max_percent:5,limit_basis:'custom'});
 const result=calculateAnnualRate(capped,{year:2026,index:450});
 assert.equal(result.amount,null);
 assert.match(result.reason,/avtalstolkning/);
 const summary=annualRateSummary([capped,item({id:'ordinary',base_amount:1000})],'2026-12-31',{index:450});
 assert.equal(summary.nominal,121000);
 assert.equal(summary.known,1000);
 assert.equal(summary.calculated,null);
 assert.equal(summary.unresolved,1);
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
