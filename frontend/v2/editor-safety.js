// Track only explicit form values. No autosave, and note drafts remain separate until Save.
export function editorSnapshot(form){
 if(!form)return "";
 const values=[...new FormData(form).entries()].map(([key,value])=>[key,String(value)]);
 return JSON.stringify({values,manualGeoSelected:form.dataset.manualGeoSelected||""});
}
export function editorHasUnsavedChanges(form,initial){
 if(!form)return false;
 const draft=String(form.querySelector("[data-activity-journal-note]")?.value||"").trim();
 return editorSnapshot(form)!==initial || draft.length>0;
}
