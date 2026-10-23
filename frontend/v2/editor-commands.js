// Record navigation and editor mode commands. Saving is owned by app mutation.
import { activityChoices } from "./activity-options.js";
export function handleEditorCommand(
  b,
  {
    editor,
    data,
    openEditor,
    closeEditor,
    setEditorReadMode,
    hasUnsavedEditorChanges,
    refreshPropertyMap,
  },
) {
  if (b.dataset.contextRecord) {
    openEditor(
      b.dataset.contextRecord,
      b.dataset.id,
      {},
      { fromCurrent: !!editor, tab: b.dataset.contextTargetTab },
    );
    return true;
  }
  if (b.hasAttribute("data-context-back")) {
    const previous = editor?.trail?.at(-1);
    if (!previous) return true;
    openEditor(
      previous.col,
      previous.id,
      {},
      { ...previous, trail: editor.trail.slice(0, -1) },
    );
    return true;
  }
  if (b.dataset.contextTab && editor?.workspace) {
    editor.workspace.setTab(b.dataset.contextTab);
    refreshPropertyMap(b.dataset.contextTab);
    return true;
  }
  if (b.hasAttribute("data-context-show-all") && editor?.workspace) {
    editor.workspace.apply("all", !editor.workspace.state.all);
    return true;
  }
  if (b.hasAttribute("data-context-new-issue") && editor) {
    const home =
      editor.col === "contracts"
        ? { scopeType: "contract", contractId: editor.id }
        : editor.col === "objects"
          ? { scopeType: "object", objectId: editor.id }
          : { scopeType: "property", propertyId: editor.id };
    openEditor(
      "activities",
      "",
      {
        ...home,
        status: activityChoices(data, "status")[0]?.value || "Nytt",
        planningYear: new Date().getFullYear(),
        includeInBudget: "Ja",
        budgetCategory: "Ej budget",
      },
      { fromCurrent: true },
    );
    return true;
  }
  if (b.hasAttribute("data-editor-activate")) {
    if (!editor) return true;
    // Unlock in place without moving the page or opening the iOS keyboard.
    setEditorReadMode(false);
    return true;
  }
  if (b.hasAttribute("data-editor-undo")) {
    if (!editor) return true;
    if (!hasUnsavedEditorChanges()) {
      // Undo is always a path back to exactly the same read layout.
      setEditorReadMode(true);
      return true;
    }
    const {
      col,
      id,
      defaults,
      trail,
      selection: recordSelection,
      source,
      returnFocus,
    } = editor;
    const saved = editor.workspace?.capture();
    closeEditor({ force: true });
    openEditor(col, id, defaults, {
      trail,
      selection: recordSelection,
      source,
      returnFocus,
      saved,
    });
    return true;
  }
  if (b.hasAttribute("data-edit")) {
    openEditor(
      b.dataset.edit,
      b.dataset.id,
      {},
      { editing: b.dataset.editMode === "edit" },
    );
    return true;
  }
  if (b.hasAttribute("data-editor-close")) {
    closeEditor();
    return true;
  }
  if (b.dataset.editorTab) {
    document
      .querySelectorAll("[data-editor-section]")
      .forEach(
        (s) => (s.hidden = s.dataset.editorSection !== b.dataset.editorTab),
      );
    document
      .querySelectorAll("[data-editor-tab]")
      .forEach((x) => x.classList.toggle("active", x === b));

    return true;
  }
  return false;
}
