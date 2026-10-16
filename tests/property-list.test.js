import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../frontend/v2/model.js';
import {overview} from '../frontend/v2/views.js';
import '../frontend/domain/calculations.js';

const selection = {propertyId:'', unit:'', owner:'', person:'', q:''};
const render = (data, s = selection) => overview(data,s,{perspective:'Fastigheter',year:2026,contractId:''});
function sample() {
  return normalize({
    properties:[{id:'p',designation:'Hamnen 2',address:'Kajgatan 14',responsiblePersonId:'old'}],
    people:[{id:'old',name:'Tidigare ansvarig'},{id:'one',name:'Anna'},{id:'two',name:'Johan'}],
    contracts:[{id:'c1',propertyId:'p',number:'AVT-1',unitId:'VARDBO',area:100,baseRent:100000,rentIndexPercent:0},
      {id:'c2',propertyId:'p',number:'AVT-2',unitId:'ORDBO',area:500,baseRent:200000,rentIndexPercent:0}],
    assignments:[
      {id:'a0',targetType:'property',targetId:'p',roleKey:'our',personId:'old',toDate:'2020-01-01'},
      {id:'a1',targetType:'property',targetId:'p',roleKey:'our',personId:'one',shared:true},
      {id:'a2',targetType:'property',targetId:'p',roleKey:'our',personId:'two',shared:true},
    ],
  });
}

test('expanded property uses current shared responsibility without old assignments or data mutation', () => {
  const data = sample(), before = JSON.stringify(data), html = render(data);
  assert.match(html,/Anna, Johan/);
  assert.doesNotMatch(html,/Tidigare ansvarig/);
  assert.match(html,/data-edit="contracts" data-id="c1"/);
  assert.match(html,/data-edit="contracts" data-id="c2"/);
  assert.match(html,/data-sort-value="600"/);
  assert.match(html,/Vår ansvarige för avtalet<\/dt><dd>Anna, Johan<\/dd>/);
  assert.equal(JSON.stringify(data),before);
});

test('expanded contracts follow the existing selection and disclose a partial result', () => {
  const data = sample(), html = render(data,{...selection,unit:'VARDBO'});
  assert.match(html,/1 av 2 i aktuellt urval/);
  assert.match(html,/data-edit="contracts" data-id="c1"/);
  assert.doesNotMatch(html,/data-edit="contracts" data-id="c2"/);
  assert.match(html,/data-sort-value="100"/);
});

test('empty and unlinked properties have useful text and escaped record identifiers', () => {
  const data = normalize({properties:[{id:'p"<',designation:'<Fastighet>',address:''}]});
  const html = render(data);
  assert.match(html,/Inga avtal kopplade till fastigheten/);
  assert.match(html,/Adress saknas/);
  assert.match(html,/&lt;Fastighet&gt;/);
  assert.match(html,/data-row-group="p&quot;&lt;"/);
  assert.doesNotMatch(html,/<Fastighet>/);
  assert.match(render(data,{...selection,q:'finns inte'}),/data-table-empty><tr>/);
});
