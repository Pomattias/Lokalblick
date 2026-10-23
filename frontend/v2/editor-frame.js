// A fixed editing outline follows the active editor or modal without changing layout.
export function syncEditorFrame(active) {
  const body=document.body;
  let frame=document.getElementById("editor-edit-frame");
  if(active) {
    if(!frame) {
      frame=document.createElement("div");
      frame.id="editor-edit-frame";
      frame.setAttribute("aria-hidden","true");
      body.appendChild(frame);
    }
    body.classList.add("editor-frame-active");
  } else {
    body.classList.remove("editor-frame-active");
    frame?.remove();
  }
}
function activeEditableForm() {
  const editorActive=Boolean(document.querySelector("#editor-root #edit-form.editor-editing"));
  const modalActive=[...document.querySelectorAll("dialog[open] form")].some(form=>
    form.querySelector('input:not([type="hidden"]):not(:disabled),select:not(:disabled),textarea:not(:disabled)'));
  return editorActive||modalActive;
}
export function refreshEditorFrame() {
  syncEditorFrame(activeEditableForm());
}
export function observeEditorFrame(){
 if(typeof MutationObserver === "undefined" || !document.body)return null;
 const observer=new MutationObserver(refreshEditorFrame);
 observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["open"]});
 return observer;
}
