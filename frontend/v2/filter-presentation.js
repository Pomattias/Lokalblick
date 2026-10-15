/* Pure visibility policy for the shared portfolio filters.
   A filter is displayed only where the view actually consumes scope(data,selection).
   In single-record context it can be expanded on demand without losing its values. */
export const PORTFOLIO_FILTER_VIEWS = Object.freeze([
  "overview", "map", "plan", "budget", "properties", "objects", "contracts", "activities"
]);

export function filterPresentation(view, selection = {}, contractId = "", expanded = false) {
  const supported = PORTFOLIO_FILTER_VIEWS.includes(view);
  const scopedDetail = supported && Boolean(selection.propertyId || (view === "contracts" && contractId));
  return {
    supported,
    scopedDetail,
    show: supported && (!scopedDetail || Boolean(expanded)),
    canToggle: scopedDetail
  };
}
