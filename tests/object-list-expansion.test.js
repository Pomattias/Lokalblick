import test from 'node:test';
import assert from 'node:assert/strict';
import {objectList} from '../frontend/v2/view-portfolio.js';

test('Object expansion retains validity and selected agreements without leaking other objects',()=>{
  const object={id:'o"<',number:'101-01',name:'<Namn>',propertyId:'p',area:1348,start:'2024-01-01'};
  const data={properties:[{id:'p',designation:'Hamnen 4',address:'Hamnvägen 12'}]};
  const view={objects:[object],allObjects:[object],contracts:[{id:'c1',number:'101-2024',objectId:object.id},{id:'c2',number:'ANNAT',objectId:'other'}]};
  const before=JSON.stringify(view);
  const html=objectList(data,{}, {portfolioView:view});
  assert.match(html,/data-row-groups/);
  assert.match(html,/aria-expanded="false" aria-controls="objects-detail-o%22%3C"/);
  assert.match(html,/id="objects-detail-o%22%3C" hidden/);
  assert.match(html,/2024-01-01 – tills vidare/);
  assert.match(html,/101-2024/);
  assert.doesNotMatch(html,/ANNAT|<Namn>/);
  assert.match(html,/&lt;Namn&gt;/);
  assert.match(html,/data-edit-mode="edit">Redigera/);
  assert.equal(JSON.stringify(view),before);
});

test('Empty objects keep the shared empty state and correct count noun',()=>{
  const html=objectList({properties:[]},{},{portfolioView:{objects:[],allObjects:[],contracts:[]}});
  assert.match(html,/0 objekt/);
  assert.match(html,/Inga objekt i aktuellt urval/);
  assert.doesNotMatch(html,/aria-label="Fastigheter"/);
});
