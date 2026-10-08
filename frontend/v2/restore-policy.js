// Restore only meaningful, attributable user workspaces.
// Never let an old demo snapshot or an empty browser cache mask the bundled demo.
// A connected Excel file takes precedence over browser snapshots from another file.
export function hasWorkspaceRecords(data) {
  if (!data || typeof data!=="object") return false;
  return ["properties","contracts","activities","organizations","people","orders",
    "operations","maintenanceStatus","sourceRegistry","importReview","budgetPlans"]
    .some(key=>Array.isArray(data[key]) && data[key].length>0);
}
export function shouldRestoreViewSnapshot(saved, context={}) {
  const data=saved?.data;
  if(!data || data.isDemo || !hasWorkspaceRecords(data)) return false;
  const mode=String(context.mode||"");
  if(["company-api","m365-api"].includes(mode))return false;
  if(context.connected){
    // Do not apply data from a different workbook to the connected Excel source.
    return saved.meta?.sourceMode === "local-excel" &&
      Boolean(saved.meta?.fileName) &&
      saved.meta.fileName === context.fileName;
  }
  return ["demo","view-bridge"].includes(mode);
}
