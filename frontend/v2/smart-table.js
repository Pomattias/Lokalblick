import {COLUMN_CATALOG,COLUMN_GROUPS} from './column-catalog.js';
// Shared table interactions. Grouped bodies keep an expandable record together
// while ordinary tables retain their existing row-based behavior.
const container = table => table.closest('.compact-data-table');
const cellText = cell => cell?.querySelector('.property-mobile-meta')
  ? cell.querySelector(':scope > button')?.textContent || '' : cell?.textContent || '';
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
      normalize(cellText(row.cells[Number(input.dataset.columnFilter)])).includes(normalize(input.value)));
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
    return cell?.hasAttribute('data-sort-value') ? Number(cell.dataset.sortValue) : cellText(cell).trim();
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

}


const layoutStorageKey=table=>'lokalblick:columns:v1:'+table.dataset.listKey;
const defaultColumns={contracts:[8,0,5,9,13,14,15,17,10],properties:[0,1,2,3,4,5,6,7,8],objects:[0,1,2,3,4,5,6],activities:[0,1,2,3,4,5,6,7]};
function applyColumnLayout(table){
  if(!table.dataset.listKey)return;
  const heads=[...table.tHead.rows[0].cells];
  const count=heads.length;
  const key=layoutStorageKey(table);
  const catalog=COLUMN_CATALOG[table.dataset.listKey];
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  const initial=defaultColumns[table.dataset.listKey];
  const all=[...Array(count).keys()];
  const visible=Array.isArray(saved?.visibleIds)&&catalog? saved.visibleIds.map(id=>catalog.indexOf(id)).filter(i=>i>=0) :Array.isArray(saved?.visible)?saved.visible:initial||all;
  const order=Array.isArray(saved?.orderIds)&&catalog?saved.orderIds.map(id=>catalog.indexOf(id)).filter(i=>i>=0):Array.isArray(saved?.order)?saved.order:initial?[...initial,...all.filter(i=>!initial.includes(i))]:all;
  const widths=saved?.widthsById&&catalog?Object.fromEntries(Object.entries(saved.widthsById).map(([id,width])=>[catalog.indexOf(id),width]).filter(([i])=>i>=0)):saved?.widths||{};
  const safeOrder=[...new Set([...order,...all])].filter(i=>Number.isInteger(i)&&i>=0&&i<count);
  const visibleSet=new Set(visible.filter(i=>Number.isInteger(i)&&i>=0&&i<count));
  visibleSet.add(count-1); // Keep the record action accessible.
  const rowList=[...table.rows];
  rowList.forEach(row=>{
    if(row.hasAttribute('data-group-detail')||row.hasAttribute('data-table-empty'))return;
    const cells=[...row.cells];
    if(cells.length!==count)return;
    cells.forEach((cell,i)=>{if(!cell.hasAttribute('data-original-column'))cell.dataset.originalColumn=i;});
    safeOrder.forEach(i=>row.appendChild(cells.find(cell=>Number(cell.dataset.originalColumn)===i)));
    [...row.cells].forEach((cell,pos)=>{
      const id=Number(cell.dataset.originalColumn);
      cell.hidden=!visibleSet.has(id);
      if(!cell.closest('thead'))cell.style.display=cell.hidden?'none':'';
      cell.style.width=widths[id]?widths[id]+'px':'';
      cell.style.minWidth=widths[id]?widths[id]+'px':'';
      const sort=cell.querySelector('[data-column-sort]');
      if(sort)sort.dataset.columnSort=pos;
      const filter=cell.querySelector('[data-column-filter]');
      if(filter)filter.dataset.columnFilter=pos;
    });
  });
  table.dataset.columnLayoutApplied='true';
  let toolbar=container(table).querySelector('[data-layout-toolbar]');
  if(!toolbar){
    toolbar=document.createElement('div');
    toolbar.dataset.layoutToolbar='true';
    toolbar.className='column-layout-toolbar';
    toolbar.innerHTML='<button type="button" data-layout-toggle aria-expanded="false">Anpassa kolumner</button><div data-layout-options hidden></div>';
    container(table).querySelector('.compact-table-heading')?.appendChild(toolbar);
  }
  const options=toolbar.querySelector('[data-layout-options]');
  options.replaceChildren();
  const search=document.createElement('input');search.type='search';search.placeholder='Sök kolumn…';search.className='column-layout-search';search.setAttribute('aria-label','Sök kolumner');options.appendChild(search);
  search.addEventListener('input',()=>{for(const label of options.querySelectorAll('label'))label.hidden=!label.textContent.toLocaleLowerCase('sv').includes(search.value.toLocaleLowerCase('sv'));});
  safeOrder.forEach(i=>{
    if(i===count-1)return;
    const label=document.createElement('label');
    const checkbox=document.createElement('input');
    checkbox.type='checkbox';checkbox.checked=visibleSet.has(i);checkbox.dataset.layoutColumn=i;
    const heading=heads.find(th=>Number(th.dataset.originalColumn)===i);
    const title=heading?.querySelector('.sort-full-label')?.textContent?.trim()||heading?.getAttribute('data-label')||heading?.textContent?.trim()||'Kolumn';
    const text=document.createElement('span');
    text.textContent=title;
    label.append(text,checkbox);
    label.dataset.columnGroup=COLUMN_GROUPS[catalog?.[i]]||'Övriga uppgifter';
    options.appendChild(label);
  });
  const reset=document.createElement('button');reset.type='button';reset.dataset.layoutReset='true';reset.textContent='Återställ standard';options.appendChild(reset);
  table.tHead.rows[0].querySelectorAll('th').forEach(th=>{
    th.draggable=true;
    th.classList.add('layout-draggable');
    if(!th.querySelector('[data-column-resize]')){
      const grip=document.createElement('span');grip.dataset.columnResize='true';grip.title='Dra för att ändra kolumnbredd';grip.className='column-resize-grip';th.appendChild(grip);
    }
  });
}
function saveColumnLayout(table,patch){
  const key=layoutStorageKey(table);
  let current={};
  try{current=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
  const all=[...table.tHead.rows[0].cells].map(th=>Number(th.dataset.originalColumn));
  const defaults=defaultColumns[table.dataset.listKey]||all;
  const next={order:all,visible:current.visible||defaults,widths:current.widths||{},...patch};
  const catalog=COLUMN_CATALOG[table.dataset.listKey];
  if(catalog){next.orderIds=next.order.map(i=>catalog[i]).filter(Boolean);next.visibleIds=next.visible.map(i=>catalog[i]).filter(Boolean);next.widthsById=Object.fromEntries(Object.entries(next.widths).map(([i,w])=>[catalog[Number(i)],w]).filter(([id])=>Boolean(id)));}
  try{localStorage.setItem(key,JSON.stringify(next));}catch{}
  applyColumnLayout(table);
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
  applyColumnLayout(table);
}

export function bindSmartTables(root) {
  root.addEventListener('input', event => {
    if (event.target.matches('[data-column-filter]')) {
      const table = event.target.closest('table[data-smart-table]');
      if (table) refreshSmartTable(table);
    }
  });
  root.addEventListener('change',event=>{
    const input=event.target.closest('[data-layout-column]');
    if(!input)return;
    const table=input.closest('.compact-data-table').querySelector('table[data-list-key]');
    const visible=[...input.closest('[data-layout-options]').querySelectorAll('[data-layout-column]:checked')].map(x=>Number(x.dataset.layoutColumn));
    saveColumnLayout(table,{visible});
  });
  let dragColumn=null;
  root.addEventListener('dragstart',event=>{
    const th=event.target.closest('th.layout-draggable');
    if(!th||event.target.closest('[data-column-resize]'))return;
    dragColumn={table:th.closest('table'),index:Number(th.dataset.originalColumn)};
    event.dataTransfer.effectAllowed='move';
  });
  root.addEventListener('dragover',event=>{
    if(dragColumn&&event.target.closest('th.layout-draggable')?.closest('table')===dragColumn.table)event.preventDefault();
  });
  root.addEventListener('drop',event=>{
    const th=event.target.closest('th.layout-draggable');
    if(!dragColumn||!th||th.closest('table')!==dragColumn.table)return;
    event.preventDefault();
    const order=[...th.parentElement.cells].map(x=>Number(x.dataset.originalColumn));
    const from=order.indexOf(dragColumn.index),to=order.indexOf(Number(th.dataset.originalColumn));
    if(from>=0&&to>=0){order.splice(from,1);order.splice(to,0,dragColumn.index);saveColumnLayout(dragColumn.table,{order});}
    dragColumn=null;
  });
  root.addEventListener('dragend',()=>{dragColumn=null;});
  root.addEventListener('pointerdown',event=>{
    const grip=event.target.closest('[data-column-resize]');
    if(!grip||event.pointerType==='touch')return;
    event.preventDefault();
    const th=grip.closest('th'),table=th.closest('table'),id=Number(th.dataset.originalColumn),start=event.clientX,width=th.getBoundingClientRect().width;
    const move=e=>{th.style.width=Math.max(64,width+e.clientX-start)+'px';th.style.minWidth=th.style.width;};
    const end=e=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);
      let current={};try{current=JSON.parse(localStorage.getItem(layoutStorageKey(table))||'{}')||{};}catch{}
      saveColumnLayout(table,{widths:{...current.widths,[id]:Math.round(Math.max(64,width+e.clientX-start))}});
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});
  });
  root.addEventListener('click', event => {
    const toggleLayout=event.target.closest('[data-layout-toggle]');
    if(toggleLayout){const options=toggleLayout.nextElementSibling;options.hidden=!options.hidden;toggleLayout.setAttribute('aria-expanded',String(!options.hidden));return;}
    const reset=event.target.closest('[data-layout-reset]');
    if(reset){const table=reset.closest('.compact-data-table').querySelector('table[data-list-key]');try{localStorage.removeItem(layoutStorageKey(table));}catch{}applyColumnLayout(table);return;}

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
