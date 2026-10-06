/* Lokalblick – tight overview lists.
 * Activities:
 * Fastighet → Typ → Post → Ansvarig → Status → Skapad → Kostnad (kr) → Redigera
 * Contracts:
 * Fastighet → Adress → Avtal → kvm → Hyra → Tillägg → kr/kvm → Avtal t.o.m. → Uppsägning → Redigera
 */
(function () {
  var collator = new Intl.Collator('sv', { numeric: true, sensitivity: 'base' });
  var numberFormat = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 });

  function textOf(row, key) {
    var cell = row.querySelector('.scope-tight-' + key);
    return cell ? cell.textContent.trim() : '';
  }

  function sortValueOf(row, key) {
    var cell = row.querySelector('.scope-tight-' + key);
    if (!cell) return '';
    return cell.dataset.sortValue != null && cell.dataset.sortValue !== ''
      ? cell.dataset.sortValue
      : cell.textContent.trim();
  }

  function sortRows(section, key, direction) {
    var rows = Array.from(section.querySelectorAll('.scope-list-row'));
    rows.sort(function (a, b) {
      var av = sortValueOf(a, key);
      var bv = sortValueOf(b, key);
      if (!av && bv) return 1;
      if (av && !bv) return -1;

      var an = Number(av);
      var bn = Number(bv);
      var numeric = av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn);
      var result = numeric ? an - bn : collator.compare(String(av), String(bv));
      return direction === 'desc' ? -result : result;
    });
    rows.forEach(function (row) { section.appendChild(row); });
  }

  function uniqueValues(section, key) {
    return Array.from(new Set(
      Array.from(section.querySelectorAll('.scope-list-row'))
        .map(function (row) { return textOf(row, key); })
        .filter(function (value) {
          return value && value !== '–' && value !== 'Ej tilldelad';
        })
    )).sort(function (a, b) { return collator.compare(a, b); });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function optionHtml(values, placeholder) {
    return '<option value="">' + escapeHtml(placeholder) + '</option>' +
      values.map(function (value) {
        return '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>';
      }).join('');
  }

  function applyFilters(section) {
    var panel = section.querySelector('.scope-table-filter-panel');
    if (!panel) return;

    var qControl = panel.querySelector('[data-table-filter="q"]');
    var q = String(qControl ? qControl.value : '').trim().toLocaleLowerCase('sv');
    var keyed = Array.from(panel.querySelectorAll('select[data-table-filter]')).map(function (control) {
      return { key: control.dataset.tableFilter, value: String(control.value || '') };
    });

    section.querySelectorAll('.scope-list-row').forEach(function (row) {
      var visible = !q || row.textContent.toLocaleLowerCase('sv').indexOf(q) !== -1;
      keyed.forEach(function (filter) {
        if (filter.value && textOf(row, filter.key) !== filter.value) visible = false;
      });
      row.hidden = !visible;
    });
  }

  function buildFilterPanel(section, isContracts) {
    var panel = document.createElement('div');
    panel.className = 'scope-table-filter-panel' + (isContracts ? ' contract-filter-panel' : '');
    panel.hidden = true;

    if (isContracts) {
      panel.innerHTML =
        '<input class="scope-table-filter-search" data-table-filter="q" type="search" placeholder="Filtrera avtal…">' +
        '<select data-table-filter="fastighet">' + optionHtml(uniqueValues(section, 'fastighet'), 'Alla fastigheter') + '</select>' +
        '<select data-table-filter="avtaltom">' + optionHtml(uniqueValues(section, 'avtaltom'), 'Alla slutdatum') + '</select>' +
        '<button type="button" class="scope-table-filter-clear">Rensa</button>';
    } else {
      panel.innerHTML =
        '<input class="scope-table-filter-search" data-table-filter="q" type="search" placeholder="Filtrera tabellen…">' +
        '<select data-table-filter="typ">' + optionHtml(uniqueValues(section, 'typ'), 'Alla typer') + '</select>' +
        '<select data-table-filter="ansvarig">' + optionHtml(uniqueValues(section, 'ansvarig'), 'Alla ansvariga') + '</select>' +
        '<select data-table-filter="status">' + optionHtml(uniqueValues(section, 'status'), 'Alla statusar') + '</select>' +
        '<button type="button" class="scope-table-filter-clear">Rensa</button>';
    }

    panel.querySelectorAll('input,select').forEach(function (control) {
      control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', function () {
        applyFilters(section);
      });
    });

    var clear = panel.querySelector('.scope-table-filter-clear');
    if (clear) {
      clear.addEventListener('click', function () {
        panel.querySelectorAll('input,select').forEach(function (control) { control.value = ''; });
        applyFilters(section);
      });
    }
    return panel;
  }

  function appendCell(row, key, value, strong, sortValue) {
    var div = document.createElement('div');
    div.className = 'scope-tight-cell scope-tight-' + key;
    if (sortValue !== undefined && sortValue !== null && sortValue !== '') {
      div.dataset.sortValue = String(sortValue);
    }
    if (strong) {
      var strongEl = document.createElement('strong');
      strongEl.textContent = value;
      div.appendChild(strongEl);
    } else if (value && value.nodeType) {
      div.appendChild(value);
    } else {
      div.textContent = value;
    }
    row.appendChild(div);
  }

  function appendEditCell(row, editButton, label) {
    var action = document.createElement('div');
    action.className = 'scope-tight-cell scope-tight-action';
    if (editButton) {
      editButton.classList.remove('inline-link', 'compact-link');
      editButton.classList.add('scope-row-edit');
      editButton.innerHTML =
        '<span class="scope-row-edit-icon" aria-hidden="true">✎</span>' +
        '<span class="scope-row-edit-label">Redigera</span>';
      editButton.setAttribute('aria-label', label || 'Redigera post');
      action.appendChild(editButton);
    }
    row.appendChild(action);
  }

  function enhanceContractRow(row) {
    var value = row.querySelector('.scope-list-value');
    var editButton = value ? value.querySelector('[data-edit-type][data-edit-id]') : null;

    var area = Number(row.dataset.contractArea) || 0;
    var rent = Number(row.dataset.contractRent) || 0;
    var additions = Number(row.dataset.contractAdditions) || 0;
    var rentSqm = Number(row.dataset.contractRentSqm) || 0;
    var contractNumber = row.dataset.contractNumber || '';

    row.innerHTML = '';
    appendCell(row, 'fastighet', row.dataset.contractDesignation || '–', false);
    appendCell(row, 'adress', row.dataset.contractAddress || '–', false);
    appendCell(row, 'avtal', contractNumber || '–', true);
    appendCell(row, 'kvm', area ? numberFormat.format(area) : '–', false, area || '');
    appendCell(row, 'hyra', rent ? numberFormat.format(rent) : '–', true, rent || '');
    appendCell(row, 'tillagg', additions ? numberFormat.format(additions) : '–', true, additions || '');
    appendCell(row, 'krkvm', rentSqm ? numberFormat.format(rentSqm) : '–', true, rentSqm || '');
    appendCell(row, 'avtaltom', row.dataset.contractEnd || 'Tillsv.', false, row.dataset.contractEnd || '9999-12-31');
    appendCell(row, 'uppsagning', row.dataset.contractNotice || '–', false, row.dataset.contractNotice || '9999-12-31');
    appendEditCell(row, editButton, 'Redigera avtal ' + contractNumber);
  }

  function enhanceActivityRow(row) {
    var main = row.querySelector('.scope-list-main');
    if (!main) return;
    var title = main.querySelector('strong');
    var meta = main.querySelector('span');
    if (!title || !meta) return;

    var nodes = Array.from(meta.childNodes);
    var plain = nodes
      .filter(function (node) { return node.nodeType === 3; })
      .map(function (node) {
        return node.textContent.replace(/^[\s·]+|[\s·]+$/g, '').trim();
      })
      .filter(Boolean);

    var propertyButton = meta.querySelector('button.scope-inline-link');
    var property = propertyButton ? propertyButton.textContent.trim() : '';
    var type = plain.length ? plain[0] : '';
    var responsible = plain.length > 1 ? plain.slice(1).join(' · ') : '';

    var status = row.querySelector('.scope-list-status');
    var added = row.querySelector('.scope-list-added');
    var value = row.querySelector('.scope-list-value');
    var editButton = value ? value.querySelector('[data-edit-type][data-edit-id]') : null;
    var valueStrong = value ? value.querySelector('strong') : null;
    var rawCost = valueStrong ? valueStrong.textContent.trim() : '';
    var costDisplay = rawCost
      ? rawCost.replace(/\s*kr(?:\s*\/\s*år)?\s*$/i, '').trim()
      : '–';
    var costNumber = rawCost
      ? Number(rawCost.replace(/\s/g, '').replace(/kr(?:\/år)?/gi, '').replace(/[^0-9,.-]/g, '').replace(',', '.'))
      : NaN;

    row.innerHTML = '';
    appendCell(row, 'fastighet', property || '–', false);
    appendCell(row, 'typ', type || '–', false);
    appendCell(row, 'post', title.textContent.trim(), true);
    appendCell(row, 'ansvarig', responsible || 'Ej tilldelad', false);
    appendCell(row, 'status', status || document.createTextNode('–'), false);
    appendCell(row, 'skapad', added ? added.textContent.trim() : '–', false, added ? added.textContent.trim() : '');
    appendCell(row, 'kostnad', costDisplay, true, Number.isFinite(costNumber) ? costNumber : '');
    appendEditCell(row, editButton, 'Redigera ' + title.textContent.trim());
  }

  function headerColumns(isContracts) {
    return isContracts ? [
      ['fastighet', 'Fastighet'],
      ['adress', 'Adress'],
      ['avtal', 'Avtal'],
      ['kvm', 'kvm'],
      ['hyra', 'Hyra'],
      ['tillagg', 'Tillägg'],
      ['krkvm', 'kr/kvm'],
      ['avtaltom', 'Avtal t.o.m.'],
      ['uppsagning', 'Uppsägning']
    ] : [
      ['fastighet', 'Fastighet'],
      ['typ', 'Typ'],
      ['post', 'Post'],
      ['ansvarig', 'Ansvarig'],
      ['status', 'Status'],
      ['skapad', 'Skapad'],
      ['kostnad', 'Kostnad (kr)']
    ];
  }

  function enhanceHeader(section, isContracts) {
    var header = section.querySelector('.scope-list-columns');
    if (!header) return null;

    header.classList.toggle('contract-columns', isContracts);
    header.innerHTML = headerColumns(isContracts).map(function (column) {
      return '<button type="button" class="scope-sort-button" data-sort-key="' + column[0] + '" aria-sort="none">' +
        '<span>' + column[1] + '</span><i aria-hidden="true"></i></button>';
    }).join('') + '<span class="scope-edit-column-head">Redigera</span>';

    header.querySelectorAll('.scope-sort-button').forEach(function (button) {
      button.addEventListener('click', function () {
        var current = button.getAttribute('aria-sort');
        var direction = current === 'ascending' ? 'desc' : 'asc';
        header.querySelectorAll('.scope-sort-button').forEach(function (other) {
          other.setAttribute('aria-sort', 'none');
          other.classList.remove('ascending', 'descending');
        });
        button.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
        button.classList.add(direction === 'asc' ? 'ascending' : 'descending');
        sortRows(section, button.dataset.sortKey, direction);
      });
    });
    return header;
  }

  function enhanceSection(section) {
    if (section.dataset.tableEnhanced === '1') return;
    section.dataset.tableEnhanced = '1';

    var titleEl = section.querySelector('.scope-list-title span');
    var isContracts = Boolean(section.classList.contains('contract-scope-section')) ||
      Boolean(titleEl && titleEl.textContent.trim().toLowerCase() === 'avtal');

    section.querySelectorAll('.scope-list-row').forEach(function (row) {
      if (isContracts) enhanceContractRow(row);
      else enhanceActivityRow(row);
    });

    var header = enhanceHeader(section, isContracts);
    var head = section.querySelector('.scope-list-head');
    if (!head) return;

    var filterButton = document.createElement('button');
    filterButton.type = 'button';
    filterButton.className = 'scope-table-filter-toggle';
    filterButton.setAttribute('aria-label', 'Filtrera tabellen');
    filterButton.setAttribute('aria-expanded', 'false');
    filterButton.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3L4 5Z"/></svg>';
    head.appendChild(filterButton);

    var panel = buildFilterPanel(section, isContracts);
    if (header) header.insertAdjacentElement('afterend', panel);
    else head.insertAdjacentElement('afterend', panel);

    filterButton.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      filterButton.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      filterButton.classList.toggle('active', !panel.hidden);
      if (!panel.hidden) {
        var search = panel.querySelector('input');
        if (search) search.focus();
      }
    });
  }

  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;
    root.querySelectorAll('.scope-list-section').forEach(enhanceSection);
  }

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
