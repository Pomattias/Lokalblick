// Track explicit form values independently of the editor's view/edit mode.
// Disabled fields stay in the snapshot, so unlocking a case is never interpreted as a change.
export function editorSnapshot(form){
 if(!form)return "";
 const values=[...form.querySelectorAll("input[name], select[name], textarea[name]")].map(el=>{
   const type=String(el.type||"").toLowerCase();
   const value=el.tagName==="SELECT"&&el.multiple
     ? [...el.selectedOptions].map(x=>x.value)
     : ["checkbox","radio"].includes(type) ? (el.checked?el.value:null) : el.value;
   return [el.name,value];
 });
 return JSON.stringify({values,manualGeoSelected:form.dataset.manualGeoSelected||""});
}
export function editorHasUnsavedChanges(form,initial){
 if(!form)return false;
 const draft=String(form.querySelector("[data-activity-journal-note]")?.value||"").trim();
 return editorSnapshot(form)!==initial || draft.length>0;
}
