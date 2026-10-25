import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyData,normalize} from '../frontend/lokaler/model.js';
import {importPeopleHtml} from '../frontend/v2/import-people.js';

function fixture(){
 const data=emptyData();
 for(const [id,name]of [['A','Fiktiva fastigheter AB'],['B','Annat bolag AB'],['OUR','Vår organisation']])data.parties.push(normalize('parties',{id,name}));
 for(const [id,party_id]of [['P','A'],['Q','OUR']])data.people.push(normalize('people',{id,name:'Person Testsson',party_id}));
 for(let i=0;i<101;i++){
  const property=normalize('properties',{id:'F'+i,name:'TESTET '+i,owner_party_id:i===100?'B':'A'});data.properties.push(property);
  data.contacts.push(normalize('contacts',{id:'C'+i,person_id:'P',role:'owner',property_id:property.id}));
 }
 data.contacts.push(normalize('contacts',{id:'OUR-CONTACT',person_id:'Q',role:'coordinator',property_id:'F0'}));
 return {clean:data,report:{sourceRows:[{records:{people:['P','Q'],contacts:data.contacts.map(c=>c.id)}}]}};
}
test('the person overview shows each person once and lists company names without link columns or counts',()=>{
 const r=fixture(),html=importPeopleHtml(r,emptyData(),{editing:new Set(['P'])});assert.equal((html.match(/data-person-row=/g)||[]).length,2);
 assert.match(html,/2 personer/);assert.match(html,/Bolag \/ organisation/);assert.match(html,/Annat bolag AB, Fiktiva fastigheter AB/);assert.match(html,/Vår organisation/);
 assert.doesNotMatch(html,/Roll här|Kopplas till|Inväntar vald koppling|personkopplingar|102 kopplingar|data-contact-role|data-contact-target/);
 assert.equal((html.match(/data-person-key="name"/g)||[]).length,1,'Only one name editor per person');
 const found=importPeopleHtml(r,emptyData(),{query:'Annat bolag'});assert.equal((found.match(/data-person-row=/g)||[]).length,1);
});
test('the company fallback follows owner representation and never infers employment from a coordinator role',()=>{
 const r=fixture();r.clean.people.forEach(p=>p.party_id=null);const html=importPeopleHtml(r,emptyData());
 const owner=html.slice(html.indexOf('data-person-row="P"'),html.indexOf('data-person-row="Q"')),coordinator=html.slice(html.indexOf('data-person-row="Q"'));
 assert.match(owner,/Fiktiva fastigheter AB/);assert.doesNotMatch(coordinator,/Fiktiva fastigheter AB|Annat bolag AB/);
});
test('person filtering, paging, import status and edits apply to people rather than relationships',()=>{
 const r=fixture(),base=structuredClone(r.clean);base.people[0].email='old@example.test';
 const html=importPeopleHtml(r,base,{limit:1,query:'',approved:{clean:base},edits:{people:{P:{name:'Rättad person'}}}});assert.equal((html.match(/data-person-row=/g)||[]).length,1);assert.match(html,/Uppdateras/);assert.match(html,/Visar 1 av 2 personer/);assert.match(html,/data-people-more/);assert.match(html,/Rättad person/);
 const skipped=importPeopleHtml(r,base,{approved:{clean:{people:[]}}});assert.equal((skipped.match(/Läses inte in/g)||[]).length,2);
});
