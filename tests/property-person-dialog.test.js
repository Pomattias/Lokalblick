import test from "node:test";
import assert from "node:assert/strict";
import {
  contextPersonSelect,newPersonDefaults,personFormHtml,
  updatedPersonRecord,refreshPropertyPersonSelectors,
} from "../frontend/v2/property-person-dialog.js";
import {renderPropertyEditor} from "../frontend/v2/property-editor.js";

const data={
  isDemo:true,
  properties:[{id:"p1",designation:"Hamnen 4",address:"Hamnvägen 12",ownerPartyId:"owner",
    ownerResponsiblePersonId:"ownerPerson",responsiblePersonId:"ourPerson"}],
  contracts:[{id:"c1",number:"AV-101",propertyId:"p1",unitId:"VARDBO",businessResponsiblePersonId:"businessPerson"}],
  organizations:[
    {id:"owner",name:"Stadsfastigheter",type:"owner"},
    {id:"owner2",name:"En annan ägare",type:"owner"},
    {id:"our",name:"Vår organisation",type:"our"},
    {id:"tenant",name:"Verksamhet",type:"tenant"}
  ],
  people:[
    {id:"ownerPerson",name:"Ägarkontakt",organizationId:"owner"},
    {id:"owner2Person",name:"Alternativ ägarkontakt",organizationId:"owner2"},
    {id:"ourPerson",name:"Vår person",organizationId:"our"},
    {id:"businessPerson",name:"Verksamhetschef",organizationId:"tenant",unitId:"VARDBO",role:"Verksamhetsansvarig"}
  ],
};

test("fastighet offers person actions and business contacts without direct global deletion",()=>{
  const html=renderPropertyEditor(data,data.properties[0],"p1");
  assert.match(html,/data-person-new="owner"/);
  assert.match(html,/data-person-edit="our"/);
  assert.match(html,/data-property-contract-contact="c1"/);
  assert.match(html,/data-person-new="contract" data-contract-id="c1"/);
  assert.match(html,/Verksamhetschef/);
  assert.match(html,/Ej kopplad/);
  assert.doesNotMatch(html,/data-person-delete/);
  assert.doesNotMatch(html,/data-editor-tab/);
});

test("new person defaults match correct responsibility level",()=>{
  const root={querySelector:key=>key==='[data-owner-select]'?{value:"owner"}:null};
  assert.equal(newPersonDefaults(root,data,"owner").organizationId,"owner");
  assert.equal(newPersonDefaults(root,data,"our").organizationId,"our");
  assert.equal(newPersonDefaults(root,data,"contract","c1").unitId,"VARDBO");
  assert.equal(newPersonDefaults(root,data,"contract","c1").organizationId,"tenant");
  assert.throws(()=>newPersonDefaults({querySelector:()=>({value:""})},data,"owner"),/Välj fastighetsägare/);
});

test("editing person keeps identity, scopes and prevents invalid details",()=>{
  const changed=updatedPersonRecord(data.people[3],new Map([
    ["name","   Eva Svensson "],["role","Verksamhetschef"],
    ["phone"," +46 70 123 45 67 "],["email","eva@example.se"]
  ]));
  assert.equal(changed.id,"businessPerson");
  assert.equal(changed.unitId,"VARDBO");
  assert.equal(changed.name,"Eva Svensson");
  assert.equal(changed.email,"eva@example.se");
  assert.equal(changed.phone,"+46 70 123 45 67");
  assert.throws(()=>updatedPersonRecord({},new Map([["name",""]])),/Ange personens namn/);
  assert.throws(()=>updatedPersonRecord({},new Map([["name","Test"],["email","fel"]])),/giltig e-post/);
});

test("person form escapes source text and explains global edit effects",()=>{
  const html=personFormHtml({name:'<b>"hej"</b>',role:"Kontaktperson",email:""},false);
  assert.match(html,/&lt;b&gt;&quot;hej&quot;&lt;\/b&gt;/);
  assert.match(html,/gäller på alla fastigheter och avtal/);
  assert.match(html,/type="email"/);
  assert.match(html,/name="phone" type="tel"/);
  assert.match(html,/Telefonnummer/);
});

test("context selection resolves business person without mutating the contract",()=>{
  const contractSelect={dataset:{propertyContractContact:"c1"},value:"businessPerson"};
  const root={
    querySelector:()=>null,
    querySelectorAll:key=>key==='[data-property-contract-contact]'?[contractSelect]:[]
  };
  assert.equal(contextPersonSelect(root,"contract","c1"),contractSelect);
  assert.equal(data.contracts[0].businessResponsiblePersonId,"businessPerson");
});

test("refreshing a role select updates linked person names and enables editing",()=>{
  let selected="ownerPerson";
  const edit={disabled:false};
  const selector={
    dataset:{propertyPersonSelect:"owner"},
    get value(){return selected;},
    set value(v){selected=v;},
    innerHTML:"",
    closest:()=>({querySelector:()=>edit}),
  };
  const root={
    querySelector:key=>key==='[data-owner-select]'?{value:"owner"}:null,
    querySelectorAll:()=>[selector],
  };
  const modified={...data,people:data.people.map(p=>p.id==="ownerPerson"?{...p,name:"Nytt namn"}:p)};
  refreshPropertyPersonSelectors(root,modified);
  assert.match(selector.innerHTML,/Nytt namn/);
  assert.doesNotMatch(selector.innerHTML,/Alternativ ägarkontakt/);
  assert.equal(selector.value,"ownerPerson");
  assert.equal(edit.disabled,false);
});

test("phone is optional text, never a number, and length is checked",()=>{
 const person=updatedPersonRecord({id:"p1",phone:"old"},new Map([["name","Eva"],["phone","+46 (0)40 123 456"]]));
 assert.equal(person.phone,"+46 (0)40 123 456");
 const none=updatedPersonRecord({id:"p1",phone:"old"},new Map([["name","Eva"]]));
 assert.equal(none.phone,"");
 assert.throws(()=>updatedPersonRecord({id:"p1"},new Map([["name","Eva"],["phone","x".repeat(51)]])),/för långa/);
});
