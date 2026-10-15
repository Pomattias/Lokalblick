import test from "node:test";
import assert from "node:assert/strict";
import "../frontend/domain/calculations.js";
import {buildPortfolioInsights,portfolioDashboard} from "../frontend/v2/portfolio-dashboard.js";
import {filters,summary} from "../frontend/v2/views.js";

const data={
  properties:[{id:"p1",address:"Gatan 1",ownerPartyId:"o1",responsiblePersonId:"a"},{id:"p2",address:"Gatan 2",ownerPartyId:"o2",responsiblePersonId:"b"}],
  contracts:[
    {id:"c1",propertyId:"p1",unitId:"VARDBO",area:100,baseRent:100000,rentIndexPercent:0,baseAdditions:0,additionIndexPercent:0},
    {id:"c2",propertyId:"p2",unitId:"ORDBO",area:100,baseRent:200000,rentIndexPercent:0,baseAdditions:0,additionIndexPercent:0}
  ],
  activities:[
    {id:"i1",type:"Projekt",propertyId:"p1",responsiblePersonId:"b",estimatedCost:350000},
    {id:"i2",type:"Underhåll",propertyId:"p2",responsiblePersonId:"a",estimatedCost:60000}
  ],
  objects:[],organizations:[{id:"o1",name:"Ägare Ett"},{id:"o2",name:"Ägare Två"}],
  people:[{id:"a",name:"Anna"},{id:"b",name:"Bo"}],indexSeries:[]
};
const selection={unit:"",person:"",owner:"",propertyId:"",q:""};
test("overall dashboard has no active lens but splits rent by business and activities by type",()=>{
 const html=portfolioDashboard(data,selection,2026);
 assert.match(html,/Hela lokalbeståndet/);
 assert.match(html,/Årshyra per verksamhet/);
 assert.match(html,/Aktiviteter per typ/);
 assert.match(html,/data-dashboard-group="VARDBO"/);
 assert.match(html,/data-view="properties"/);
 assert.match(html,/dashboard-bar-row/);
 const controls=filters(data,selection,"");
 assert.match(controls,/data-dashboard-mode="person"/);
 assert.match(controls,/aria-pressed="false"/);
 assert.doesNotMatch(controls,/data-filter="person"/);
});
test("all dimensions partition the same contract rent and group activities by their own responsibility",()=>{
 const total=buildPortfolioInsights(data,selection,2026);
 assert.equal(total.rent,300000);
 for(const mode of ["unit","person","owner"]){
   const a=buildPortfolioInsights(data,selection,2026,mode);
   assert.equal(a.groups.reduce((sum,x)=>sum+x.rent,0),a.rent);
   assert.equal(a.groups.reduce((sum,x)=>sum+x.activities,0),a.view.items.length);
   assert.equal(a.groups.length,2);
 }
 const persons=buildPortfolioInsights(data,selection,2026,"person");
 assert.equal(persons.groups.find(x=>x.name==="Anna").rent,100000);
 assert.equal(persons.groups.find(x=>x.name==="Anna").activities,1);
 assert.equal(persons.groups.find(x=>x.name==="Bo").activities,1);
 assert.match(summary(data,selection,2026,{view:"overview",dashboardMode:"person"}),/Avtalad yta/);
});
test("drill-down respects scope and moves from group to property",()=>{
 const scoped=buildPortfolioInsights(data,{...selection,unit:"VARDBO"},2026,"unit");
 assert.equal(scoped.rent,100000);
 assert.equal(scoped.selected,true);
 assert.equal(scoped.breakdown.length,1);
 assert.equal(scoped.breakdown[0].key,"p1");
 const html=portfolioDashboard(data,{...selection,unit:"VARDBO"},2026,"unit");
 assert.match(html,/Årshyra per fastighet/);
 assert.match(html,/data-dashboard-property="p1"/);
 assert.match(html,/data-dashboard-clear/);
});
test("renders data without modifying source records and leaves ordinary dropdown filters intact",()=>{
 const before=JSON.stringify(data);
 for(const mode of ["","unit","person","owner"])portfolioDashboard(data,selection,2026,mode);
 assert.equal(JSON.stringify(data),before);
 const controls=filters(data,selection);
 assert.match(controls,/data-filter="unit"/);
 assert.match(controls,/data-filter="person"/);
});

test("main dashboard reports kronor, agreement counts, floor area and activity totals",()=>{
 const html=summary(data,selection,2026,{view:"overview",dashboardMode:""}).replaceAll("\u00a0"," ");
 for(const text of ["Årshyra 2026","Avtal","Avtalad yta","200 m²","Aktiviteter · kr","Aktiviteter · antal","Fastigheter","410 000 kr"])assert.ok(html.includes(text),text);
 for(const lens of ["","person","unit","owner"]){
   const result=buildPortfolioInsights(data,selection,2026,lens);
   assert.equal(result.activityCost,410000);
   assert.equal(result.groups.reduce((n,g)=>n+g.cost,0),410000);
   assert.equal(result.groups.reduce((n,g)=>n+g.contracts,0),2);
   assert.equal(result.groups.reduce((n,g)=>n+g.area,0),200);
   const markup=portfolioDashboard(data,selection,2026,lens);
   assert.match(markup,/kr och antal/);
   assert.match(markup,/Visa avtal/);
   assert.match(markup,/m²/);
 }
});
