import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const script=fs.readFileSync(new URL("../frontend/v2/app.js",import.meta.url),"utf8");
const editorCode=script.slice(script.indexOf("function closeEditor() {"),script.indexOf("function openPropertyPersonDialog("));
assert.ok(editorCode.includes("function openEditor("),"Find shared modal lifecycle.");

function setup({failRender=false,failFocus=false,failMapCleanup=false}={}) {
  const classes=new Set();
  const root={
    html:"",
    get innerHTML(){return this.html;},
    set innerHTML(value){this.html=value;},
    replaceChildren(){this.html="";},
    querySelector(){return {focus(){if(failFocus)throw Error("Focus failed");}}}
  };
  const document={
    body:{classList:{add:key=>classes.add(key),remove:key=>classes.delete(key)}},
    querySelector:sel=>sel==="#editor-root"?root:null,
  };
  const factory=new Function("document","canEdit","editorHtml","data","transport","attachPropertyMap","globalThis","console",
    "let editor=null,propertyMapCleanup=null;\n"+editorCode+
    "\nreturn {openEditor,closeEditor,isEditing:()=>Boolean(editor)}");
  const handlers=factory(document,()=>true,
    (data,col,id)=>{
      if(failRender)throw Error("Render failed");
      return {record:{id},html:'<aside class="editor">'+col+'</aside>'};
    },{}, {company:()=>false},()=>()=>{if(failMapCleanup)throw Error("Map cleanup failed");},
    {LokalblickMapService:{}}, {warn:()=>{}});
  return {root,classes,...handlers};
}

test("all editors open and close without leaving a blocked body",()=>{
  for(const type of ["activities","contracts","properties"]) {
    const ui=setup();
    ui.openEditor(type,"sample");
    assert.equal(ui.isEditing(),true,type);
    assert.equal(ui.classes.has("editing"),true,type);
    assert.match(ui.root.innerHTML,new RegExp(type));
    ui.closeEditor();
    assert.equal(ui.isEditing(),false,type);
    assert.equal(ui.classes.has("editing"),false,type);
    assert.equal(ui.root.innerHTML,"",type);
  }
});

test("render failure does not leave edit overlay or global lock",()=>{
  const ui=setup({failRender:true});
  assert.throws(()=>ui.openEditor("activities","sample"),/Kunde inte öppna formuläret/);
  assert.equal(ui.classes.has("editing"),false);
  assert.equal(ui.root.innerHTML,"");
});

test("focus failure rolls back a partially mounted modal",()=>{
  const ui=setup({failFocus:true});
  assert.throws(()=>ui.openEditor("contracts","sample"),/Kunde inte öppna formuläret/);
  assert.equal(ui.isEditing(),false);
  assert.equal(ui.classes.has("editing"),false);
  assert.equal(ui.root.innerHTML,"");
});

test("map provider cleanup error cannot leave whole application blocked",()=>{
  const ui=setup({failMapCleanup:true});
  ui.openEditor("properties","sample");
  ui.closeEditor();
  assert.equal(ui.isEditing(),false);
  assert.equal(ui.classes.has("editing"),false);
  assert.equal(ui.root.innerHTML,"");
});

test("page does not rely on global pointer-events disable for modal state",()=>{
  const styles=fs.readFileSync(new URL("../frontend/v2/styles.css",import.meta.url),"utf8");
  assert.doesNotMatch(styles,/\.editing main,\s*\.editing \.sidebar\s*\{\s*pointer-events:\s*none/);
  assert.match(script,/closest\("#editor-root \.editor-backdrop"\)/);
});
