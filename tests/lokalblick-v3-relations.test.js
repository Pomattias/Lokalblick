import test from 'node:test';
import assert from 'node:assert/strict';
import {isVisibleAt,relatedRecords,assignmentHistory} from '../frontend/v3/relations.js';
import {indexedBaseAmount,indexPreview} from '../frontend/v3/budget-index.js';
test('only currently valid objects and agreement versions appear until history is requested',()=>{
 const old={currentVersion:null},active={currentVersion:{valid_from:'2026-01-01'}};
 assert.equal(isVisibleAt('objects',old,'2026-10-27',false),false);
 assert.equal(isVisibleAt('objects',old,'2026-10-27',true),true);
 assert.equal(isVisibleAt('objects',active,'2026-10-27',false),true);
 const ended={original_start_on:'2021-01-01',currentVersion:{period_status:'ended'}};
 const valid={original_start_on:'2021-01-01',currentVersion:{period_status:'current'}};
 const future={original_start_on:'2027-01-01',currentVersion:null};
 assert.equal(isVisibleAt('agreements',ended,'2026-10-27'),false);
 assert.equal(isVisibleAt('agreements',valid,'2026-10-27'),true);
 assert.equal(isVisibleAt('agreements',future,'2026-10-27'),false);
 assert.equal(isVisibleAt('agreements',ended,'2026-10-27',true),true);
});
test('related cards derive links from property, object and agreement foreign keys',()=>{
 const s={
  properties:[{id:'p',name:'Fastigheten'}],objects:[{id:'o',property_id:'p',object_number:'101',currentVersion:{area:240}}],
  agreements:[{id:'a',object_id:'o',agreement_number:'2026-001',currentVersion:{period_status:'current'}}],
  issues:[{id:'i',object_id:'o',resolved_property_id:'p',title:'Byt fönster'}],
  orders:[{id:'r',issue_id:'i',title:'Fönsterinstallation'}],recurringCosts:[],budgets:[],spaces:[],buildingParts:[],costEvidence:[],budgetLines:[],inspectionPoints:[],inspections:[],
  stakeholderAssignments:[],parties:[],people:[]
 };
 const html=relatedRecords('properties',s.properties[0],s);
 assert.match(html,/data-jump-view="objects"/);
 assert.match(html,/data-jump-view="agreements"/);
 assert.match(html,/data-jump-view="issues"/);
 assert.match(html,/2026-001/);
 const object=relatedRecords('objects',s.objects[0],s);
 assert.match(object,/Fastigheten/);
 assert.match(object,/Byt fönster/);
 const agreement=relatedRecords('agreements',s.agreements[0],s);
 assert.match(agreement,/Objekt 101/);
 const issue=relatedRecords('issues',s.issues[0],s);
 assert.match(issue,/Fönsterinstallation/);
});
test('assignment history derives party and person without storing inherited assignments',()=>{
 const s={stakeholderAssignments:[{id:'r',property_id:'p',role_code:'owner_contact',party_id:'party',person_id:'person',valid_from:'2020-01-01',valid_to:null}],
  people:[{id:'person',name:'Anna'}],parties:[{id:'party',name:'Hus AB'}]};
 const html=assignmentHistory('properties',{id:'p'},s);
 assert.match(html,/Hus AB \/ Anna/);
 assert.match(html,/Kontakt- och ansvarshistorik/);
});
test('KPI budget preview requires contractual base index and preserves non-indexed rent',()=>{
 const indexed={base_amount:100000,base_index:400,index_share:0.7,adjustment_method:'kpi',floor:1};
 assert.equal(indexedBaseAmount(indexed,440),107000);
 assert.equal(indexedBaseAmount({...indexed,base_index:null},440),null);
 const p=indexPreview([{...indexed,valid_from:'2020-01-01'},
  {base_amount:20000,adjustment_method:'none',valid_from:'2020-01-01'},
  {base_amount:999,adjustment_method:'kpi-limited',valid_from:'2020-01-01'}],440,2027);
 assert.equal(p.total,127000);assert.equal(p.selected,2);assert.equal(p.unable,1);
});
