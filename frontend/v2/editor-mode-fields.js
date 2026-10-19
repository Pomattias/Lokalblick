import {isoDate} from "./date-format.js";
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
    // ISO dates are the common app format; never localize to DD/MM/YYYY.
    // Native date inputs already expose their canonical value as YYYY-MM-DD.
  }
  return (control.type==="date"?isoDate(text):text)||control.dataset?.emptyLabel||"–";
}
export function prepareEditorModeFields(form) {
  if(!form||form.dataset.collection==="activities")return 0;
  let count=0;
  form.querySelectorAll('input[name]:not([type="hidden"]),select[name],select[data-property-contract-contact],textarea[name]').forEach(control=>{
    if(control.dataset.modePrepared==="1" || control.closest("[data-editor-mode-exclude]"))return;
    if(control.type==="radio" && !control.checked)return;
    control.dataset.modePrepared="1";
    control.classList.add("editor-mode-control");
    const display=document.createElement("span");
    display.className="editor-mode-value";
    display.dataset.modeField=control.name||control.dataset.propertyContractContact||"";
    display.dataset.modeKind=control.tagName==="TEXTAREA"?"textarea":
      (control.tagName==="SELECT"&&control.multiple)?"multiselect":"field";
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
