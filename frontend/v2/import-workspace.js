// Imported source workbooks must be cumulative even before a canonical Excel file exists.
// No external requests; unconnected sessions use the existing browser-local view bridge.
export async function retainImportedData(imported, transport, bridge, source) {
  const status = transport.status();
  if (status.connected && status.sourceKind === "migration") {
    // Migrated input files are read-only; stage additions in source memory.
    const adopted = source?.adoptViewState?.(imported);
    if (!adopted) throw Error("Importerade uppgifter kunde inte behållas i arbetsytan.");
    return { data: adopted, mode: "migration" };
  }
  if (status.connected) {
    return { data: await transport.save(imported), mode: "connected" };
  }
  // Data previously only assigned to app state would be lost on the next save
  // because LokalblickDataService still pointed at the public demo adapter.
  if (!bridge?.save || !bridge?.activate)
    throw Error("Den lokala arbetsytan är inte tillgänglig. Importen har inte tillämpats.");
  const stored = await bridge.save(imported, { source: "import-staging" });
  if (!stored)
    throw Error("Den lokala arbetsytan kunde inte sparas i webbläsaren. Importen har inte tillämpats.");
  bridge.activate();
  return { data: await transport.load(), mode: "staged" };
}
