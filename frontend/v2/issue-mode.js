// Only visual mode switching for the single shared issue DOM.
// These nodes remain mounted so the same fields, cards and position
// are kept in view and edit, including journal, cost and dates.
export function applyIssueViewMode(form,readOnly){
  const view=Boolean(readOnly);
  form.querySelectorAll(".issue-mode-field").forEach(slot=>{
    const value=slot.querySelector(".issue-field-value");
    const control=slot.querySelector(".issue-field-control");
    if(value)value.hidden=!view;
    if(control)control.hidden=view;
  });
  const title=form.querySelector(".issue-title-heading");
  const titleControl=form.querySelector(".issue-edit-title");
  if(title)title.hidden=!view;
  if(titleControl)titleControl.hidden=view;
  form.querySelectorAll(".issue-history-card").forEach(card=>{
    const value=card.querySelector(".issue-history-value");
    if(value)value.hidden=!view;
    card.querySelectorAll(".issue-history-edit").forEach(control=>control.hidden=view);
    const indicator=card.querySelector(".journal-cost-enhancing");
    if(indicator)indicator.hidden=!view;
  });
  const save=form.querySelector("[data-issue-save]");
  const undo=form.querySelector("[data-editor-undo]");
  if(save)save.hidden=view;
  if(undo)undo.hidden=view;
}
