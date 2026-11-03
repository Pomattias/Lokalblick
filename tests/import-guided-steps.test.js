import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData} from '../frontend/lokaler/model.js';
import {importCreationPlan} from '../frontend/lokaler/import-plan.js';
import {guidedReviewHtml,guidedReviewModel,guidedApproveStage,guidedStages,guidedWorkbookRowCount} from '../frontend/v2/import-guided-steps.js';
import XLSX from 'xlsx';

const before=()=>emptyData();
const fixture=()=>{
 const clean=before();
 clean.properties=[{id:'p',name:'Kvarteret',address:'Kajgatan 1',city:'Malmö',management_object_number:'101'}];
 clean.objects=[{id:'o',property_id:'p',area:70}];
 clean.agreements=[{id:'a',object_id:'o',valid_from:'2021-01-01'}];
 clean.parties=[{id:'tenant',name:'Hyresgästen AB'}];
 clean.people=[{id:'person',name:'Anna Andersson',email:'anna@example.test'}];
 const recordStates={properties:{p:'created'},objects:{o:'created'},contracts:{a:'created'},
  organizations:{tenant:'created'},people:{person:'created'}};
 const result={clean,report:{changes:[],sourceRows:[],recordStates},
  data:{importReview:[]}};
 return {result,plan:importCreationPlan(result,before())};
};
test('guidance works for both generic and canonical profiles without rowCount',()=>{
 const sheet=XLSX.utils.aoa_to_sheet([['Fastighetsnummer'],...Array.from({length:949},(_,i)=>['F'+i])]);
 const wb={Sheets:{Lokallista:sheet},SheetNames:['Lokallista']};
 const canonical=[{name:'Lokallista',headerRow:1,headerIndex:0,canonical:true}];
 assert.equal(guidedWorkbookRowCount(canonical,wb,XLSX),949);
 assert.equal(guidedWorkbookRowCount([{...canonical[0],rowCount:949}],wb,XLSX),949);
 assert.equal(guidedWorkbookRowCount([{...canonical[0],rowCount:0}],wb,XLSX),949);
});
test('guided review has exactly four sequential register steps, not a 70-column dashboard',()=>{
 const {result,plan}=fixture();
 assert.deepEqual(guidedStages.map(x=>x.title),[
  'Fastigheter','Objekt','Avtal','Hyresgäster, parter & personer']);
 const markup=guidedReviewHtml({fileName:'LOKALLISTA BERIKNING.xlsx'},result,before(),plan,{},0,{
  skippedColumns:['Lokallista · Verksamhetstyp','Lokalbestånd · Antal medarbetare']});
 assert.match(markup,/data-guided-stage="0"/);
 assert.match(markup,/Kajgatan 1/);
 assert.match(markup,/101/);
 assert.match(markup,/2 kolumner saknar säker koppling/);
 assert.match(markup,/Godkänn fastigheter och fortsätt/);
 assert.doesNotMatch(markup,/Välj mål|Nya poster att godkänna|Granska kolumner/);
});
test('each step only lists the relevant records and can go backwards',()=>{
 const {result,plan}=fixture();
 const properties=guidedReviewModel({},result,before(),plan,{},0);
 const objects=guidedReviewModel({},result,before(),plan,{},1);
 const agreements=guidedReviewModel({},result,before(),plan,{},2);
 const parties=guidedReviewModel({},result,before(),plan,{},3);
 assert.equal(properties.rows.length,1);
 assert.equal(properties.rows[0].table,'properties');
 assert.equal(objects.rows.length,1);
 assert.equal(objects.rows[0].table,'objects');
 assert.equal(agreements.rows.length,1);
 assert.equal(agreements.rows[0].table,'agreements');
 assert.deepEqual(parties.rows.map(x=>x.table),['parties','people']);
 assert.match(guidedReviewHtml({},result,before(),plan,{},1),/data-guided-back/);
});
test('safe creations approve in dependency order, without writing or mutating the inputs',()=>{
 const {result,plan}=fixture(),original=JSON.stringify(result);
 let choices={};
 for(let step=0;step<3;step++)choices=guidedApproveStage(plan,choices,result,before(),step);
 const actions=Object.fromEntries(plan.map(p=>[p.table,choices[p.key]?.action]));
 assert.deepEqual(actions,{properties:'create',objects:'create',agreements:'create'});
 assert.equal(JSON.stringify(result),original);
});
test('an unsafe row is left for correction while other properties can be approved',()=>{
 const {result}=fixture();
 result.clean.properties.push({id:'p2',name:'Trygg',management_object_number:'102'});
 result.report.recordStates.properties.p2='created';
 result.data.importReview=[{status:'pending',collection:'properties',recordId:'p',
  row:12,sheet:'Lokallista',reason:'Fastighetsnummer behöver kontrolleras',blocking:true}];
 const plan=importCreationPlan(result,before());
 const choices=guidedApproveStage(plan,{},result,before(),0);
 assert.equal(choices[plan.find(p=>p.record.id==='p').key].action,'defer');
 assert.equal(choices[plan.find(p=>p.record.id==='p2').key].action,'create');
 const html=guidedReviewHtml({fileName:'import.xlsx'},result,before(),plan,choices,0);
 assert.match(html,/Behöver åtgärdas/);
 assert.match(html,/Fastighetsnummer behöver kontrolleras/);
 assert.match(html,/Trygg/);
});
test('a previously existing matched property is displayed without being counted as new',()=>{
 const {result,plan}=fixture();
 const existing=before();
 existing.properties.push({...result.clean.properties[0]});
 result.report.recordStates.properties.p='unchanged';
 const model=guidedReviewModel({},result,existing,plan,{},0);
 assert.equal(model.rows.length,1);
 assert.equal(model.rows[0].status,'existing');
 assert.equal(model.stats.new,0);
});
