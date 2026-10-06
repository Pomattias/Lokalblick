/* Lokalblick – tight overview lists
 * Dense one-row lists with explicit columns.
 * Every column can be sorted and filtered independently.
 */
(function () {
  var sortState = new WeakMap();
  var filterState = new WeakMap();

  var columns = [
    { key: 'property', label: 'Fastighet / Adress' },
    { key: 'type', label: 'Typ' },
    { key: 'post', label: 'Post' },
    { key: 'responsible', label: 'Ansvarig' },
    { key: 'status', label: 'Status' },
    { key: 'created', label: 'Skapad' },
    { key: 'cost', label: 'Kostnad', numeric: true },
    { key: 'action', label: '', action: true }
  ];

  function clean(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function plainText(el) {
    return el ? clean(el.textContent) : '';
  }

  function extractRow(row, isContracts) {
    var main = row.querySelector('.scope-list-main');
    if (!main) return null;

    var title = main.querySelector('strong');
    var meta = main.querySelector('span');
    var propertyButton = meta && meta.querySelector('button.scope-inline-link');
    var status = row.querySelector('.scope-list-status');
    var created = row.querySelector('.scope-list-added');
    var value = row.querySelector('.scope-list-value');
    var valueStrong = value && value.querySelector('strong');
    var edit = value && value.querySelector('.compact-link');

    var nodes = meta ? Array.from(meta.childNodes) : [];
    var plain = nodes
      .filter(function (n) { return n.nodeType === 3; })
      .map(function (n) { return clean(n.textContent.replace(/^[·\s]+|[·\s]+$/g, '')); })
      .filter(Boolean);

    var property = propertyButton ? plainText(propertyButton) : '';
    var type = '';
    var responsible = '';

    if (isContracts) {
      /* Contract rows currently expose customer + property + area.
       * The common list deliberately uses one consistent schema; contract
       * responsibility is not inferred from customer data and remains blank
       * until a responsible person is available in the source model.
       */
      if (!property && plain.length > 1) property = plain[1];
    } else {
      type = plain[0] || '';
      if (!property && propertyButton) property = plainText(propertyButton);
      if (plain.length > 1) {
        responsible = plain.slice(1).filter(function (x) {
          return !property || x !== property;
        }).join(' · ');
      }
    }

    var post = plainText(title) || '–';
    var createdText = plainText(created) || '–';
    var costText = plainText(valueStrong) || '–';

    var data = {
      property: property || '–',
      type: isContracts ? 'Avtal' : (type || '–'),
      post: post,
      responsible: isContracts ? '–' : (responsible || 'Ej tilldelad'),
      status: plainText(status) || '–',
      created: createdText,
      cost: costText,
      costNumber: parseNumber(costText),
      edit: edit
    };

    return data;
  }

  function parseNumber(value) {
    var text = clean(value).replace(/[^0-9,-]/g, '').replace(/\s/g, '');
    if (!text) return 0;
    if (text.indexOf(',') >= 0 && text.indexOf('.') >= 0) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (text.indexOf(',') >= 0) {
      text = text.replace(',', '.');
    }
    return Number(text) || 0;
  }

  function makeHeader(section, isContracts) {
    var existing = section.querySelector('.scope-list-columns');
    if (existing && existing.dataset.filterHeader === '1') return existing;

    if (existing) existing.remove();

    var header = document.createElement('div');
    header.className = 'scope-list-columns scope-list-sort-filter';
    header.dataset.filterHeader = '1';

    columns.forEach(function (column) {
      var cell = document.createElement('div');
      cell.className = 'scope-list-column' + (column.action ? ' action' : '');
      cell.dataset.column = column.key;

      if (!column.action) {
        var top = document.createElement('div');
        top.className = 'scope-list-column-top';

        var sort = document.createElement('button');
        sort.type = 'button';
        sort.className = 'scope-list-sort';
        sort.dataset.scopeSort = column.key;
        sort.setAttribute('aria-label', 'Sortera på ' + column.label);
        sort.innerHTML = '<span>' + column.label + '</span><b class="scope-sort-indicator">↕</b>';
        top.appendChild(sort);

        var filter = document.createElement('input');
        filter.type = 'search';
        filter.className = 'scope-list-filter';
        filter.dataset.scopeFilter = column.key;
        filter.placeholder = 'Filtrera…';
        filter.setAttribute('aria-label', 'Filtrera ' + column.label);
        filter.autocomplete = 'off';
        top.appendChild(filter);

        cell.appendChild(top);
      }
      header.appendChild(cell);
    });

    section.insertBefore(header, section.querySelector('.scope-list-row'));
    return header;
  }

  function readFilters(section) {
    var filters = filterState.get(section) || {};
    section.querySelectorAll('[data-scope-filter]').forEach(function (input) {
      filters[input.dataset.scopeFilter] = clean(input.value).toLowerCase();
    });
    filterState.set(section, filters);
    return filters;
  }

  function applySection(section) {
    var titleEl = section.querySelector('.scope-list-title span');
    var isContracts = titleEl && clean(titleEl.textContent).toLowerCase() === 'avtal';
    var header = makeHeader(section, isContracts);
    var filters = readFilters(section);
    var state = sortState.get(section) || { key: 'property', dir: 1 };

    var rows = Array.from(section.querySelectorAll('.scope-list-row'))
      .map(function (row) {
        var data = extractRow(row, isContracts);
        if (!data) return null;
        row.__scopeData = data;
        return { row: row, data: data };
      })
      .filter(Boolean);

    rows.forEach(function (item) {
      var visible = columns.every(function (column) {
        if (column.action) return true;
        var needle = filters[column.key];
        if (!needle) return true;
        return clean(item.data[column.key]).toLowerCase().includes(needle);
      });
      item.row.hidden = !visible;
    });

    var key = state.key;
    rows.sort(function (a, b) {
      var av = key === 'cost' ? a.data.costNumber : clean(a.data[key]).toLowerCase();
      var bv = key === 'cost' ? b.data.costNumber : clean(b.data[key]).toLowerCase();
      if (key === 'cost') return (av - bv) * state.dir;
      return av.localeCompare(bv, 'sv', { numeric: true, sensitivity: 'base' }) * state.dir;
    });

    rows.forEach(function (item) { section.appendChild(item.row); });

    header.querySelectorAll('[data-scope-sort]').forEach(function (button) {
      var active = button.dataset.scopeSort === state.key;
      button.classList.toggle('active', active);
      var indicator = button.querySelector('.scope-sort-indicator');
      if (indicator) indicator.textContent = active ? (state.dir === 1 ? '↑' : '↓') : '↕';
    });
  }

  function bindSection(section) {
    if (section.dataset.sortFilterBound !== '1') {
      section.dataset.sortFilterBound = '1';
      section.addEventListener('click', function (event) {
        var button = event.target.closest('[data-scope-sort]');
        if (!button || !section.contains(button)) return;
        var state = sortState.get(section) || { key: 'property', dir: 1 };
        var key = button.dataset.scopeSort;
        state.dir = state.key === key ? state.dir * -1 : 1;
        state.key = key;
        sortState.set(section, state);
        applySection(section);
      });
      section.addEventListener('input', function (event) {
        var input = event.target.closest('[data-scope-filter]');
        if (!input || !section.contains(input)) return;
        var filters = filterState.get(section) || {};
        filters[input.dataset.scopeFilter] = clean(input.value).toLowerCase();
        filterState.set(section, filters);
        applySection(section);
      });
    }
  }

  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;

    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      bindSection(section);
      applySection(section);
    });
  }

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();