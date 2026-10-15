/* Unified read/edit presentation for every non-issue editor.
   Both modes use the same section DOM and row wrappers; only the field representation changes.
   This adds no new data fields and never substitutes disabled controls into FormData. */
export function editorDisplayValue(control) {
  if(!control)return "–";
  let text="";
  if(control.tagName==="SELECT"){
    const selected=Array.from(control.selectedOptions||[]);
    text=selected.filter(option=>option.value!=="").map(option=>option.textContent.trim()).join(", ");
  } else if(control.type==="checkbox"){
    text=control.checked?"Ja":"Nej";
  } else if(control.type==="radio"){
    text=control.checked?String(control.value||"Ja"):"";
  } else {
    text=String(control.value??"").trim();
    // Use the native ISO date text without duplicating a separate year label.
    if(control.type==="date" && /^\d{4}-\d{2}-\d{2}$/.test(text)){
      const [y,m,d]=text.split("-");
      text=d+"/"+m+"/"+y;
    }
  }
  return text||"–";
}
export function prepareEditorModeFields(form) {
  if(!form||form.dataset.collection==="activities")return 0;
  let count=0;
  form.querySelectorAll('input[name]:not([type="hidden"]),select[name],textarea[name]').forEach(control=>{
    if(control.dataset.modePrepared==="1" || control.closest("[data-editor-mode-exclude]"))return;
    if(control.type==="radio" && !control.checked)return;
    control.dataset.modePrepared="1";
    control.classList.add("editor-mode-control");
    const display=document.createElement("span");
    display.className="editor-mode-value";
    display.dataset.modeField=control.name;
    display.dataset.modeKind=control.tagName==="TEXTAREA"?"textarea":"field";
    // The read-mode value must remain accessible when the native control is hidden.
    display.setAttribute("aria-label",control.getAttribute("aria-label")||control.name||"Värde");
    display.textContent=editorDisplayValue(control);
    control.insertAdjacentElement("afterend",display);
    count++;
  });
  return count;
}
export function refreshEditorModeFields(form) {
  if(!form || form.dataset.collection==="activities")return;
  form.querySelectorAll(".editor-mode-control").forEach(control=>{
    const display=control.nextElementSibling;
    if(display?.classList.contains("editor-mode-value"))
      display.textContent=editorDisplayValue(control);
  });
}
