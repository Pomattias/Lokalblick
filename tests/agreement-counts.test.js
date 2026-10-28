import test from 'node:test';
import assert from 'node:assert/strict';
import '../frontend/domain/calculations.js';
import {normalize} from '../frontend/v2/model.js';
import {portfolioScope,contractPeriodCounts} from '../frontend/v2/portfolio-context.js';
import {summary} from '../frontend/v2/views.js';
import {portfolioDashboard} from '../frontend/v2/portfolio-dashboard.js';

function fixture(){
 const year=Number(globalThis.LokalblickResponsibility.today().slice(0,4));
 return normalize({properties:[{id:'P1',designation:'TESTET 1'}],objects:[{id:'O1',propertyId:'P1'}],contracts:[
  ...Array.from({length:117},(_,i)=>({id:'CURRENT-'+i,propertyId:'P1',objectId:'O1',start:(year-1)+'-01-01',end:(year+1)+'-12-31',area:10,baseRent:1000,rentIndexPercent:0})),
  ...Array.from({length:20},(_,i)=>({id:'PAST-'+i,propertyId:'P1',objectId:'O1',start:(year-4)+'-01-01',end:(year-2)+'-12-31'})),
  ...Array.from({length:17},(_,i)=>({id:'FUTURE-'+i,propertyId:'P1',objectId:'O1',start:(year+2)+'-01-01',end:(year+3)+'-12-31'}))]});
}

test('154 total agreements and 117 current agreements can describe the same unchanged data',()=>{
 const data=fixture(),before=JSON.stringify(data),counts=contractPeriodCounts(data,data.contracts),view=portfolioScope(data);
 assert.equal(counts.total,154);assert.equal(counts.current,117);assert.equal(counts.past,20);assert.equal(counts.future,17);assert.equal(counts.total-counts.current,37);assert.equal(view.contracts.length,117);assert.equal(view.allContracts.length,154);assert.equal(JSON.stringify(data),before);
});

test('overview and lists expose their counting definition and a visible reconciliation',()=>{
 const data=fixture(),view=portfolioScope(data),year=Number(globalThis.LokalblickResponsibility.today().slice(0,4));
 const overview=summary(data,{},year,{view:'overview'});assert.match(overview,/class="summary-full-label">Avtal totalt<\/span>[\s\S]*?<strong>154 st<\/strong>/);assert.match(overview,/summary-explanation">117 gällande · 20 tidigare · 17 kommande/);
 for(const page of ['properties','objects','contracts']){
  const html=summary(data,{},year,{view:page,portfolioView:view});assert.match(html,/class="summary-full-label">Gällande avtal<\/span>[\s\S]*?<strong>117<\/strong>/);assert.match(html,/summary-explanation">154 totalt · 20 tidigare · 17 kommande/);
 }
 const html=portfolioDashboard(data,{},year);assert.match(html,/Avtal totalt <strong>154<\/strong>/);assert.match(html,/Fastigheter \/ avtal totalt/);
});

test('object dates can exclude agreements, date boundaries are inclusive and missing dates remain visible',()=>{
 const at='2026-10-25',data={objects:[{id:'past',end:'2026-10-24'},{id:'future',start:'2026-10-26'},{id:'current'}]},contracts=[
  {objectId:'past'}, {objectId:'future'}, {objectId:'current'},
  {objectId:'current',start:at,end:at},
  {objectId:'current',end:'2026-10-24'}, {objectId:'current',start:'2026-10-26'}];
 assert.deepEqual(contractPeriodCounts(data,contracts,at),{total:6,current:2,past:2,future:2,at});
});

test('counts follow the selected portfolio and keep full-year finance and locked Budget data unchanged',()=>{
 const data=fixture(),year=Number(globalThis.LokalblickResponsibility.today().slice(0,4));data.properties.push({id:'P2',designation:'ANNAN 2'});data.objects.push({id:'O2',propertyId:'P2'});data.contracts.push({id:'OTHER',propertyId:'P2',objectId:'O2'});data.budgetPlans=[{id:'locked',locked:true,snapshot:{amount:123}}];
 const before=JSON.stringify(data),selected=portfolioScope(data,{propertyId:'P1'}),counts=contractPeriodCounts(data,selected.allContracts);
 assert.equal(counts.total,154);assert.equal(counts.current,117);for(const page of ['overview','properties','objects','contracts','budget'])summary(data,{},year,{view:page,...(page==='overview'||page==='budget'?{}:{portfolioView:selected})});assert.equal(JSON.stringify(data),before);
});
