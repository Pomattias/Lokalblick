// Shared table interactions. Grouped bodies keep an expandable record together
// while ordinary tables retain their existing row-based behavior.
const container = table => table.closest('.compact-data-table');
const grouped = table => table.hasAttribute('data-row-groups');
const entries = table => grouped(table)
  ? [...table.tBodies].filter(body => body.hasAttribute('data-row-group'))
    .map(body => ({node:body, row:body.rows[0]}))
  : [...(table.tBodies[0]?.rows || [])].filter(row => !row.querySelector('.empty'))
    .map(row => ({node:row, row}));

export function refreshSmartTable(table) {
  const inputs = [...table.querySelectorAll('[data-column-filter]')];
  const normalize = value => String(value || '').toLocaleLowerCase('sv').trim();
  const records = entries(table);
  for (const {node, row} of records) {
    node.hidden = !inputs.every(input => !normalize(input.value) ||
      normalize(row.cells[Number(input.dataset.columnFilter)]?.textContent).includes(normalize(input.value)));
  }
  if (!grouped(table)&&!table.dataset.listKey) return;
  const visible = records.filter(({node}) => !node.hidden).length;
  const count = container(table).querySelector('[data-table-count]');
  const noun=table.dataset.tableNoun||'fastigheter';
  if (count) count.textContent = visible === records.length
    ? `${visible} ${noun}` : `${visible} av ${records.length} ${noun}`;
  table.querySelector('[data-table-empty]').hidden = visible > 0;
}

export function sortSmartTable(table, index, direction) {
  const collator = new Intl.Collator('sv-SE', {numeric:true, sensitivity:'base'});
  const value = row => {
    const cell = row.cells[index];
    return cell?.hasAttribute('data-sort-value') ? Number(cell.dataset.sortValue) : cell?.textContent?.trim() || '';
  };
  const records = entries(table).sort((a, b) => {
    const av = value(a.row), bv = value(b.row);
    return (direction === 'asc' ? 1 : -1) *
      (typeof av === 'number' && typeof bv === 'number' ? av - bv : collator.compare(av, bv));
  });
  const target = grouped(table) ? table : table.tBodies[0];
  if (!target) return;
  records.forEach(({node}) => target.appendChild(node));
  table.querySelectorAll('[data-column-sort]').forEach(button => {
    button.dataset.direction = '';
    button.closest('th').removeAttribute('aria-sort');
  });
  const button = table.querySelector(`[data-column-sort="${index}"]`);
  if (button) {
    button.dataset.direction = direction;
    button.closest('th').setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
  }
  const mobileSort = container(table)?.querySelector('[data-table-sort]');
  if (mobileSort) mobileSort.value = `${index}:${direction}`;
}

function setExpanded(body, expanded) {
  const button = body.querySelector('[data-row-toggle]');
  button.setAttribute('aria-expanded', String(expanded));
  body.querySelector('[data-group-detail]').hidden = !expanded;
}

export function readSmartTableState(table) {
  const button = table.querySelector('[data-column-sort][data-direction="asc"], [data-column-sort][data-direction="desc"]');
  return {
    sortIndex:button ? Number(button.dataset.columnSort) : 0,
    sortDirection:button?.dataset.direction || 'asc',
    filters:[...table.querySelectorAll('[data-column-filter]')].map(input => input.value),
    filtersOpen:!table.querySelector('.column-filters').hidden,
    expanded:[...table.tBodies].filter(body => body.querySelector('[data-row-toggle]')?.getAttribute('aria-expanded') === 'true')
      .map(body => body.dataset.rowGroup),
  };
}

export function restoreSmartTableState(table, state = {}) {
  table.querySelectorAll('[data-column-filter]').forEach((input, index) => { input.value = state.filters?.[index] || ''; });
  table.querySelector('.column-filters').hidden = !state.filtersOpen;
  container(table).querySelector('[data-toggle-column-filters]').setAttribute('aria-expanded', String(Boolean(state.filtersOpen)));
  for (const body of table.tBodies) {
    if (body.hasAttribute('data-row-group')) setExpanded(body, Boolean(state.expanded?.includes(body.dataset.rowGroup)));
  }
  sortSmartTable(table, state.sortIndex ?? 0, state.sortDirection || 'asc');
  refreshSmartTable(table);
}

export function bindSmartTables(root) {
  root.addEventListener('input', event => {
    if (event.target.matches('[data-column-filter]')) {
      const table = event.target.closest('table[data-smart-table]');
      if (table) refreshSmartTable(table);
    }
  });
  root.addEventListener('change', event => {
    if (!event.target.matches('[data-table-sort]')) return;
    const table = event.target.closest('.compact-data-table')?.querySelector('table[data-smart-table]');
    const [index, direction] = event.target.value.split(':');
    if (table) sortSmartTable(table, Number(index), direction);
  });
  root.addEventListener('click', event => {
    const toggle = event.target.closest('[data-toggle-column-filters]');
    if (toggle) {
      const row = toggle.closest('.compact-data-table')?.querySelector('.column-filters');
      if (row) { row.hidden = !row.hidden; toggle.setAttribute('aria-expanded', String(!row.hidden)); }
      return;
    }
    const expand = event.target.closest('[data-row-toggle]');
    if (expand) {
      setExpanded(expand.closest('tbody'), expand.getAttribute('aria-expanded') !== 'true');
      return;
    }
    const sort = event.target.closest('[data-column-sort]');
    if (sort) {
      const table = sort.closest('table[data-smart-table]');
      if (table) sortSmartTable(table, Number(sort.dataset.columnSort), sort.dataset.direction === 'asc' ? 'desc' : 'asc');
    }
  });
}
