// View transitions change UI state; they never save business data.
export const labels = {
  overview: "Översikt",
  properties: "Fastigheter",
  objects: "Objekt",
  maintenance: "Underhåll",
  contracts: "Avtal",
  activities: "Ärenden",
  plan: "Planera",
  budget: "Budget",
  map: "Karta",
  sources: "Datakällor",
  people: "Parter",
  settings: "Inställningar",
  more: "Mer",
  datamodel: "Datamodell",
};
export async function handleNavigation(
  b,
  {
    ui,
    selection,
    clearPlanning,
    render,
    openEditor,
    loadBudgetIndex,
    loadOfficialPriceBase,
  },
) {
  if (b.dataset.view) {
    clearPlanning();
    ui.view = b.dataset.view;
    ui.showScopedFilters = false;
    if (ui.view === "properties") ui.perspective = "Fastigheter";
    if (ui.view === "contracts") ui.perspective = "Avtal";
    if (ui.view === "activities") ui.perspective = "Ärenden";
    ui.contractId = "";
    if (ui.view === "settings") ui.settingsYear = new Date().getFullYear();
    render();
    if (ui.view === "budget") await loadBudgetIndex(ui.year);
    if (ui.view === "settings")
      await loadOfficialPriceBase(ui.settingsYear, { automatic: true });

    return true;
  }
  if (b.dataset.property && ui.view !== "budget") {
    openEditor("properties", b.dataset.property);
    return true;
  }
  if (b.dataset.property) {
    selection.propertyId = b.dataset.property;
    ui.showScopedFilters = false;
    ui.perspective = "Avtal";
    ui.view = "contracts";
    render();

    return true;
  }
  if (b.hasAttribute("data-toggle-global-filters")) {
    ui.showScopedFilters = !ui.showScopedFilters;
    render();
    return true;
  }
  if (b.hasAttribute("data-clear-property")) {
    selection.propertyId = "";
    ui.showScopedFilters = false;
    ui.contractId = "";
    render();

    return true;
  }
  if (b.dataset.perspective) {
    clearPlanning();
    ui.perspective = b.dataset.perspective;
    ui.contractId = "";
    render();

    return true;
  }
  if (b.dataset.issueType) {
    ui.issueType = b.dataset.issueType;
    render();
    return true;
  }
  if (b.dataset.openContract && ui.view !== "budget") {
    openEditor("contracts", b.dataset.openContract);
    return true;
  }
  if (b.dataset.openContract) {
    ui.showScopedFilters = false;
    ui.contractId =
      ui.contractId === b.dataset.openContract ? "" : b.dataset.openContract;
    render();

    return true;
  }
  return false;
}
