import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {filters} from "../frontend/v2/views.js";

test("global filters reserve an action slot beside search without changing its data binding", () => {
  const html=filters({contracts:[],properties:[],people:[],organizations:[]},{
    person:"",unit:"",owner:"",q:"Hamnen"
  });
  assert.match(html, /class="ui-search-action-row"/);
  assert.match(html, /class="ui-filter-actions-slot"/);
  assert.match(html, /data-filter="q" type="search"/);
  assert.match(html, /value="Hamnen"/);
});

test("persistent action buttons remain unique and outside the obsolete top header", () => {
  const html=readFileSync(new URL("../frontend/v2/index.html",import.meta.url),"utf8");
  assert.equal((html.match(/id="add"/g)||[]).length,1);
  assert.equal((html.match(/id="save"/g)||[]).length,1);
  assert.match(html, /id="view-global-actions"/);
  assert.ok(html.indexOf('id="view-global-actions"')>html.indexOf('id="filters"'));
  assert.ok(html.indexOf('id="add"')<html.indexOf('id="notice"'));
});

class FakeNode {
  constructor(id="",hidden=false){this.id=id;this.hidden=hidden;this.parent=null;this.children=[];}
  appendChild(child){child.remove();this.children.push(child);child.parent=this;}
  remove(){if(!this.parent)return;this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  querySelectorAll(selector){return selector==="button"?this.children:[];}
}

test("actions survive rerender and move to the search row or context fallback", () => {
  const js=readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
  const start=js.indexOf("// Keep the original action nodes");
  const end=js.indexOf("function render() {",start);
  assert.ok(start>=0&&end>start,"Toolbar placement helpers must exist");
  const fallback=new FakeNode("fallback"),toolbar=new FakeNode("toolbar");
  const add=new FakeNode("add"),save=new FakeNode("save",true),slot=new FakeNode("slot");
  fallback.appendChild(toolbar);toolbar.appendChild(save);toolbar.appendChild(add);
  let withFilter=true,view="properties",local=[],lastSelector="";
  const document={
    querySelector(selector){
      if(selector==="#view-global-actions")return toolbar;
      if(selector==="#view-actions-fallback")return fallback;
      throw Error("Unexpected document selector "+selector);
    }
  };
  const content={
    querySelectorAll(selector){lastSelector=selector;return local;}
  };
  const filterArea={querySelector(){return withFilter?slot:null;}};
  const ui={get view(){return view;}};
  const helpers=new Function("document","content","filterArea","ui",
    js.slice(start,end)+";return {resetViewActionPlacement,placeViewActions};"
  )(document,content,filterArea,ui);
  helpers.resetViewActionPlacement();helpers.placeViewActions();
  assert.equal(toolbar.parent,slot);
  assert.equal(toolbar.hidden,false);
  helpers.resetViewActionPlacement();
  assert.equal(toolbar.parent,fallback);
  assert.deepEqual(toolbar.children.map(x=>x.id),["save","add"]);

  view="plan";local=[new FakeNode("new-issue")];
  helpers.placeViewActions();
  assert.match(lastSelector,/data-new-issue/);
  assert.equal(local[0].parent,toolbar);
  helpers.resetViewActionPlacement();
  assert.deepEqual(toolbar.children.map(x=>x.id),["save","add"]);

  view="objects";withFilter=false;local=[new FakeNode("new-object")];
  helpers.placeViewActions();
  assert.match(lastSelector,/data-new-object/);
  assert.equal(toolbar.parent,fallback);
  assert.equal(fallback.hidden,false);
  assert.equal(local[0].parent,toolbar);

  helpers.resetViewActionPlacement();
  view="people";local=[new FakeNode("person"),new FakeNode("organization"),new FakeNode("assignment")];
  helpers.placeViewActions();
  assert.match(lastSelector,/data-edit/);
  assert.equal(toolbar.children.length,5);
});
