// A row can create several dependent records. Keep only a validated prefix
// when a later record fails; the caller owns matching and field interpretation.
export function createImportRow({
  data,
  tableNames,
  changes,
  reviews,
  decisions,
  selected,
  fieldMap,
}) {
  const undo = [],
    touched = new Map(),
    read = new Set(),
    held = new Set();
  let safe = null;
  const startReviews = reviews.length;
  const lengths = () =>
    Object.fromEntries(tableNames.map((table) => [table, data[table].length]));
  const savepoint = () => ({
    undo: undo.length,
    lengths: lengths(),
    changes: changes.length,
    reviews: reviews.length,
    decisions: decisions.length,
    touched: new Map([...touched].map(([table, ids]) => [table, new Set(ids)])),
    read: new Set(read),
  });
  const initial = savepoint();
  function restore(point) {
    for (const revert of undo.splice(point.undo).reverse()) revert();
    for (const table of tableNames) data[table].length = point.lengths[table];
    changes.length = point.changes;
    reviews.length = point.reviews;
    decisions.length = point.decisions;
    touched.clear();
    for (const [table, ids] of point.touched) touched.set(table, new Set(ids));
    read.clear();
    for (const index of point.read) read.add(index);
  }
  function touch(table, id) {
    if (!touched.has(table)) touched.set(table, new Set());
    touched.get(table).add(id);
  }
  function checkpoint(linkedNumbers) {
    if (![...touched.values()].some((ids) => ids.size)) return;
    const accepted = new Set(
      [...read].filter((index) => {
        const column = selected.find((column) => column.index === index),
          mapping = fieldMap[column.target];
        return (
          !held.has(index) &&
          (mapping
            ? touched.has(mapping.table) &&
              (!mapping.partyRole || !linkedNumbers.has(mapping.partyRole))
            : touched.has("contacts"))
        );
      }),
    );
    if (!accepted.size) return;
    safe = { ...savepoint(), read: accepted };
  }
  function rollback() {
    restore(safe || initial);
    if (safe)
      for (const column of selected)
        if (!read.has(column.index)) held.add(column.index);
    return Boolean(safe);
  }
  return {
    undo,
    touched,
    read,
    held,
    startReviews,
    touch,
    savepoint,
    restore,
    checkpoint,
    rollback,
  };
}
