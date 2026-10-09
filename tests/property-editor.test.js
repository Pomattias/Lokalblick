import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { renderPropertyEditor, attachPropertyMap, updatePropertyOwnerContacts } from "../frontend/v2/property-editor.js";
import { readEditor } from "../frontend/v2/editor.js";

const data={
  isDemo:true,
  properties:[
    {id:"p1",designation:"Hamnen 4",address:"Hamnvägen 12",city:"Malmö",
      ownerPartyId:"owner",ownerResponsiblePersonId:"ownerPerson",responsiblePersonId:"ourPerson"},
    {id:"p2",designation:"Centrum 4",address:"Exempelgatan",city:"Malmö",latitude:55.6,longitude:13.01}
  ],
  organizations:[
    {id:"owner",name:"Stadsfastigheter",type:"owner"},
    {id:"owner2",name:"Andra ägaren",type:"owner"},
    {id:"our",name:"Vår organisation",type:"our"}
  ],
  people:[
    {id:"ownerPerson",name:"Ägarkontakt",organizationId:"owner"},
    {id:"ownerPerson2",name:"Andra ägarkontakten",organizationId:"owner2"},
    {id:"ourPerson",name:"Vår kontakt",organizationId:"our"},
    {id:"business",name:"Verksamhetschef",unitId:"VARDBO"}
  ],
  contracts:[{id:"a1",number:"A-100",propertyId:"p1",unitId:"VARDBO",businessResponsiblePersonId:"business"}]
};

test("Fastighet is a single editor, no tabs or geocode administration fields",()=>{
  const html=renderPropertyEditor(data,data.properties[0],"p1");
  assert.match(html,/<h2 id="editor-title">Fastighet<\/h2>/);
  assert.match(html,/name="designation"/);
  assert.match(html,/name="ownerPartyId"/);
  assert.match(html,/name="ownerResponsiblePersonId"/);
  assert.match(html,/name="responsiblePersonId"/);
  assert.match(html,/Ägarkontakt/);
  assert.match(html,/Vår kontakt/);
  assert.match(html,/Verksamhetschef/);
  assert.match(html,/Vårdbo · A-100/);
  assert.match(html,/id="property-editor-map"/);
  assert.doesNotMatch(html,/data-editor-tab|data-editor-section|>Tidplan<|>Relationer</);
  assert.doesNotMatch(html,/name="(?:type|geoSource|geoConfirmedAt|geoConfirmedBy)"/);
  assert.doesNotMatch(html,/name="latitude"/);
  assert.doesNotMatch(html,/name="longitude"/);
});

test("existing coordinates are included; map selection is pending until save",()=>{
  const existing={...data.properties[0],latitude:55.6098,longitude:13.0105};
  const html=renderPropertyEditor(data,existing,"p1");
  assert.match(html,/name="latitude" value="55.6098"/);
  assert.match(html,/name="longitude" value="13.0105"/);

  const fields={
    "#property-editor-map":{},
    '[data-property-coordinates]':{textContent:""},
    '[data-property-coordinate-status]':{textContent:""},
    '[data-property-lat]':{name:"",value:""},
    '[data-property-lng]':{name:"",value:""},
    "#edit-form":{dataset:{}}
  };
  let requested=null, destroyed=false;
  const root={querySelector(selector){return fields[selector];}};
  const fakeMap={createAuxiliary(opts){requested=opts;return {destroy(){destroyed=true;}};}};
  const cleanup=attachPropertyMap(root,data,data.properties[0],fakeMap);
  assert.equal(requested.selectedPosition,null);
  assert.equal(fields['[data-property-lat]'].name,"");
  assert.equal(requested.fallbackCenter.latitude,55.6);
  requested.onSelectPosition({latitude:55.612345,longitude:13.123456});
  assert.equal(fields['[data-property-lat]'].name,"latitude");
  assert.equal(fields['[data-property-lat]'].value,"55.612345");
  assert.equal(fields['[data-property-lng]'].name,"longitude");
  assert.equal(fields['[data-property-lng]'].value,"13.123456");
  assert.equal(fields["#edit-form"].dataset.manualGeoSelected,"1");
  assert.match(fields['[data-property-coordinates]'].textContent,/55.612345/);
  cleanup();
  assert.equal(destroyed,true);
});

test("property fields save without removing other imported data",()=>{
  const original=globalThis.FormData;
  globalThis.FormData=class{
    forEach(cb){
      cb("Ängen 2","designation");
      cb("owner","ownerPartyId");
      cb("ownerPerson","ownerResponsiblePersonId");
      cb("ourPerson","responsiblePersonId");
      cb("55.6","latitude");
      cb("13.0","longitude");
    }
  };
  try{
    const old={...data.properties[0],type:"Intern",geoSource:"openrouteservice"};
    const next=readEditor({dataset:{collection:"properties"}},old);
    assert.equal(next.designation,"Ängen 2");
    assert.equal(next.latitude,55.6);
    assert.equal(next.longitude,13);
    assert.equal(next.ownerResponsiblePersonId,"ownerPerson");
    assert.equal(next.responsiblePersonId,"ourPerson");
    assert.equal(next.type,"Intern");
  } finally{globalThis.FormData=original;}
});

test("owner contacts select is filtered to that owner",()=>{
  const contacts={innerHTML:"",value:"ownerPerson"};
  const owner={value:"owner2"};
  const root={querySelector:selector=>{
    if(selector==="[data-owner-select]")return owner;
    if(selector==="[data-owner-contact]")return contacts;
    return null;
  }};
  updatePropertyOwnerContacts(root,data);
  assert.match(contacts.innerHTML,/Andra ägarkontakten/);
  assert.doesNotMatch(contacts.innerHTML,/>Ägarkontakt</);
  assert.equal(contacts.value,"");
});

test("auxiliary map does not destroy the underlying portfolio map",()=>{
  const context=vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync("frontend/services/map-service.js","utf8"),context);
  const service=context.window.LokalblickMapService;
  const live=new Set();
  const destroyed=[];
  const adapter={
    create:options=>{const handle={id:options.elementId};live.add(handle);return handle;},
    destroy:handle=>{live.delete(handle);destroyed.push(handle.id);},
    invalidateSize:()=>{}
  };
  service.configure(adapter);
  service.render({elementId:"portfolio-map"});
  const aux=service.createAuxiliary({elementId:"property-editor-map"});
  assert.deepEqual([...live].map(x=>x.id).sort(),["portfolio-map","property-editor-map"]);
  aux.destroy();
  assert.deepEqual([...live].map(x=>x.id),["portfolio-map"]);
  assert.deepEqual(destroyed,["property-editor-map"]);
  service.destroy();
  assert.deepEqual(destroyed,["property-editor-map","portfolio-map"]);
});
