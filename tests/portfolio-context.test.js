import test from 'node:test';
import assert from 'node:assert/strict';
import {normalize,scope} from '../frontend/v2/model.js';
import {portfolioScope,recordContext,isOpenIssue,rentalTotals} from '../frontend/v2/portfolio-context.js';
import {propertyPopup} from '../frontend/v2/context-ui.js';
import '../frontend/domain/calculations.js';

function fixture(){return normalize({
  properties:[{id:'p',designation:'Hamnen',address:'Kajgatan 1',responsiblePersonId:'old'},{id:'p2',designation:'Centrum'}],
  objects:[{id:'o',propertyId:'p',number:'101',unitId:'VARDBO'},{id:'o2',propertyId:'p',number:'102',unitId:'ORDBO'}],
  people:[{id:'a',name:'Anna'},{id:'b',name:'Bo'},{id:'old',name:'Tidigare'}],
  organizations:[{id:'tenant',name:'Vård <AB>'}],
  contracts:[{id:'c',propertyId:'p',objectId:'o',number:'A-1',tenantPartyId:'tenant',area:100,baseRent:100000,rentIndexPercent:0},
    {id:'c2',propertyId:'p',objectId:'o2',number:'A-2',area:200,baseRent:400000,rentIndexPercent:0}],
  assignments:[{id:'a1',targetType:'property',targetId:'p',roleKey:'our',personId:'a',shared:true},
    {id:'a2',targetType:'property',targetId:'p',roleKey:'our',personId:'b',shared:true}],
  activities:[{id:'i',title:'Ventilation',contractId:'c',objectId:'o',propertyId:'p',responsiblePersonId:'b',status:'Pågår'},
    {id:'i2',title:'Tak',propertyId:'p',status:'Nytt'},
    {id:'i3',title:'El',objectId:'o',status:'Nytt'},
    {id:'i4',title:'Avslutad',contractId:'c',status:'Utförd'},
    {id:'i5',title:'Andra avtalet',contractId:'c2',status:'Nytt'}]
});}

test('portfolio scope uses property responsibility, selected contracts and tenant register without changing Budget scope',()=>{
  const data=fixture(),before=JSON.stringify(data),legacy=scope(data,{unit:'VARDBO',q:'A-1'});
  const view=portfolioScope(data,{person:'a',unit:'VARDBO'},{q:'Vård <AB>'});
  assert.deepEqual(view.contracts.map(row=>row.id),['c']);
  assert.deepEqual(view.properties.map(row=>row.id),['p']);
  assert.deepEqual(rentalTotals(data,view.contracts,2026),{rent:100000,area:100,needsReview:0,preliminary:0,rentPerSqm:1000});
  assert.deepEqual(portfolioScope(data,{person:'b'}).properties.map(row=>row.id),['p']);
  assert.deepEqual(portfolioScope(data,{person:'old'}).properties,[]);
  assert.deepEqual(scope(data,{unit:'VARDBO',q:'A-1'}),legacy);
  assert.equal(JSON.stringify(data),before);
});

test('most specific home wins, common issues stay separate, record counts never duplicate',()=>{
  const data=fixture(),context=recordContext(data,'properties','p',{unit:'VARDBO'});
  assert.deepEqual(context.primary.map(row=>row.id),['i','i3','i4']);
  assert.deepEqual(context.common.map(row=>row.id),['i2']);
  assert.equal(context.issues.filter(isOpenIssue).length,3);
  assert.equal(context.contracts.length,1);assert.equal(context.totalContracts,2);
  assert.equal(recordContext(data,'properties','p',{unit:'VARDBO'},{},true).contracts.length,2);
  const contract=recordContext(data,'contracts','c');
  assert.deepEqual(contract.issues.map(row=>row.id),['i','i3','i4','i2']);
  assert.ok(!contract.issues.some(row=>row.id==='i5'));
});

test('issue search and responsibility are local; closed and open statuses remain distinct',()=>{
  const data=fixture();
  assert.deepEqual(portfolioScope(data,{person:'a'},{view:'activities',q:'Vent',person:'b'}).items.map(item=>item.record.id),['i']);
  assert.deepEqual(portfolioScope(data,{}, {view:'activities',status:'closed'}).items.map(item=>item.record.id),['i4']);
  for(const status of ['Utförd','Avslutad','Stängd','Makulerad','Avbruten','Avslaget'])assert.equal(isOpenIssue({status}),false);
  assert.equal(isOpenIssue({status:'Inväntar svar'}),true);
});

test('map popup follows selection, links real records and escapes names',()=>{
  const data=fixture(),html=propertyPopup(data,data.properties[0],{unit:'VARDBO'},{},2026);
  assert.match(html,/1 av 2 avtal i urvalet/);
  assert.match(html,/Vård &lt;AB&gt;/);
  assert.match(html,/Årshyra\/m²/);
  assert.match(html,/Öppna ärenden \(3\)/);
  assert.match(html,/data-context-record="properties" data-id="p"/);
  assert.match(html,/data-context-record="contracts" data-id="c"/);
  assert.match(html,/data-context-record="activities" data-id="i"/);
  assert.doesNotMatch(html,/data-id="i4"|data-id="c2"/);
  assert.equal(rentalTotals(data,[{...data.contracts[0],area:0}],2026).rentPerSqm,null);
});

test('current portfolio counts one period per object and keeps historical issue homes',()=>{
  const data=fixture(),year=Number(globalThis.LokalblickResponsibility.today().slice(0,4));
  data.contracts[0].start=(year-1)+'-01-01';data.contracts[0].end=(year+1)+'-12-31';
  data.contracts.push({...data.contracts[0],id:'past',number:'Tidigare',start:(year-4)+'-01-01',end:(year-2)+'-12-31'},
    {...data.contracts[0],id:'future',number:'Kommande',start:(year+2)+'-01-01',end:(year+4)+'-12-31'});
  data.activities.push({id:'old-open',title:'Kvarstående fel',contractId:'past',status:'Pågår'});
  const before=JSON.stringify(data),legacy=scope(data,{}),view=portfolioScope(data,{unit:'VARDBO'});
  assert.deepEqual(view.contracts.map(row=>row.id),['c']);
  assert.equal(view.allContracts.length,3);
  assert.equal(rentalTotals(data,view.contracts,year).area,100);
  assert.ok(view.items.some(item=>item.record.id==='old-open'));
  const property=recordContext(data,'properties','p',{unit:'VARDBO'});
  assert.ok(property.issues.some(issue=>issue.id==='old-open'));
  const object=recordContext(data,'objects','o');
  assert.equal(object.property.id,'p');assert.equal(object.object.id,'o');
  assert.equal(object.contracts.length,1);assert.equal(object.allContracts.length,3);
  assert.ok(!object.primary.some(issue=>issue.id==='i5'));
  assert.deepEqual(scope(data,{}),legacy);assert.equal(JSON.stringify(data),before);
});

test('ended objects do not inflate current totals; undated contracts remain discoverable',()=>{
  const data=fixture(),year=Number(globalThis.LokalblickResponsibility.today().slice(0,4));
  data.objects[0].end=(year-1)+'-12-31';
  const view=portfolioScope(data);
  assert.deepEqual(view.contracts.map(row=>row.id),['c2']);
  assert.equal(view.allContracts.length,2);
  assert.ok(recordContext(data,'properties','p').issues.some(issue=>issue.id==='i'));
  assert.equal(recordContext(data,'contracts','c').allContracts[0].id,'c');
});
