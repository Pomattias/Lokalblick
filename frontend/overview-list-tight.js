/* Lokalblick – tight overview lists
 * Column order:
 * Fastighet → Typ → Post → Ansvarig → Status → Skapad → Kostnad (kr) → Redigera
 * Adds lightweight per-table filtering and click-to-sort headers.
 */
(function () {
  var collator = new Intl.Collator('sv', { numeric: true, sensitivity: 'base' });

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
      var result = Number.isFinite(an) && Number.isFinite(bn)
        ? an - bn
        : collator.compare(String(av), String(bv));
      return direction === 'desc' ? -result : result;
    });
    rows.forEach(function (row) { section.appendChild(row); });
  }

  function uniqueValues(section, key) {
    return Array.from(new Set(
      Array.from(section.querySelectorAll('.scope-list-row'))
        .map(function (row) { return textOf(row, key); })
        .filter(function (value) { return value && value !== '–' && value !== 'Ej tilldelad'; })
    )).sort(function (a, b) { return collator.compare(a, b); });
  }

  function optionHtml(values, placeholder) {
    return '<option value="">' + placeholder + '</option>' +
      values.map(function (value) {
        return '<option value="' + value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '">' +
          value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') +
        '</option>';
      }).join('');
  }

  function applyFilters(section) {
    var panel = section.querySelector('.scope-table-filter-panel');
    if (!panel) return;
    var q = String((panel.querySelector('[data-table-filter="q"]') || {}).value || '').trim().toLocaleLowerCase('sv');
    var type = String((panel.querySelector('[data-table-filter="typ"]') || {}).value || '');
    var responsible = String((panel.querySelector('[data-table-filter="ansvarig"]') || {}).value || '');
    var status = String((panel.querySelector('[data-table-filter="status"]') || {}).value || '');

    section.querySelectorAll('.scope-list-row').forEach(function (row) {
      var all = row.textContent.toLocaleLowerCase('sv');
      var visible =
        (!q || all.indexOf(q) !== -1) &&
        (!type || textOf(row, 'typ') === type) &&
        (!responsible || textOf(row, 'ansvarig') === responsible) &&
        (!status || textOf(row, 'status') === status);
      row.hidden = !visible;
    });
  }

  function buildFilterPanel(section) {
    var panel = document.createElement('div');
    panel.className = 'scope-table-filter-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<input class="scope-table-filter-search" data-table-filter="q" type="search" placeholder="Filtrera tabellen…">' +
      '<select data-table-filter="typ">' + optionHtml(uniqueValues(section, 'typ'), 'Alla typer') + '</select>' +
      '<select data-table-filter="ansvarig">' + optionHtml(uniqueValues(section, 'ansvarig'), 'Alla ansvariga') + '</select>' +
      '<select data-table-filter="status">' + optionHtml(uniqueValues(section, 'status'), 'Alla statusar') + '</select>' +
      '<button type="button" class="scope-table-filter-clear">Rensa</button>';

    panel.querySelectorAll('input,select').forEach(function (control) {
      control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', function () {
        applyFilters(section);
      });
    });
    panel.querySelector('.scope-table-filter-clear').addEventListener('click', function () {
      panel.querySelectorAll('input,select').forEach(function (control) { control.value = ''; });
      applyFilters(section);
    });
    return panel;
  }

  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;

    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      if (section.dataset.tableEnhanced === '1') return;
      section.dataset.tableEnhanced = '1';

      var titleEl = section.querySelector('.scope-list-title span');
      var sectionTitle = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
      var isContracts = sectionTitle === 'avtal';

      section.querySelectorAll('.scope-list-row').forEach(function (row) {
        var main = row.querySelector('.scope-list-main');
        if (!main) return;
        var title = main.querySelector('strong');
        var meta = main.querySelector('span');
        if (!title || !meta) return;

        var nodes = Array.from(meta.childNodes);
        var plain = nodes
          .filter(function (n) { return n.nodeType === 3; })
          .map(function (n) { return n.textContent.replace(/^[\s·]+|[\s·]+$/g, '').trim(); })
          .filter(Boolean);

        var propertyButton = meta.querySelector('button.scope-inline-link');
        var property = propertyButton ? propertyButton.textContent.trim() : '';
        var type = '';
        var responsible = '';

        if (isContracts) {
          type = 'Avtal';
          if (!propertyButton && plain.length > 1) {
            property = plain.length > 2 ? plain.slice(1, -1).join(' · ') : plain[1];
          }
          responsible = '–';
        } else {
          type = plain.length ? plain[0] : '';
          if (plain.length > 1) responsible = plain.slice(1).join(' · ');
        }

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

        var cells = [
          ['fastighet', property || '–', false, ''],
          ['typ', type || '–', false, ''],
          ['post', title.textContent.trim(), true, ''],
          ['ansvarig', responsible || 'Ej tilldelad', false, ''],
          ['status', status || null, false, ''],
          ['skapad', added ? added.textContent.trim() : '–', false, added ? added.textContent.trim() : ''],
          ['kostnad', costDisplay, true, Number.isFinite(costNumber) ? String(costNumber) : '']
        ];

        row.innerHTML = '';
        cells.forEach(function (cell) {
          var div = document.createElement('div');
          div.className = 'scope-tight-cell scope-tight-' + cell[0];
          if (cell[3]) div.dataset.sortValue = cell[3];
          if (cell[0] === 'status' && cell[1]) {
            div.appendChild(cell[1]);
          } else if (cell[2]) {
            var strong = document.createElement('strong');
            strong.textContent = cell[1];
            div.appendChild(strong);
          } else {
            div.textContent = cell[1];
          }
          row.appendChild(div);
        });

        var action = document.createElement('div');
        action.className = 'scope-tight-cell scope-tight-action';
        if (editButton) {
          editButton.classList.remove('inline-link','compact-link');
          editButton.classList.add('scope-row-edit');
          editButton.innerHTML = '<span class="scope-row-edit-icon" aria-hidden="true">✎</span><span class="scope-row-edit-label">Redigera</span>';
          editButton.setAttribute('aria-label', 'Redigera ' + title.textContent.trim());
          action.appendChild(editButton);
        }
        row.appendChild(action);
      });

      var header = section.querySelector('.scope-list-columns');
      if (header) {
        header.classList.remove('contract-columns');
        var columns = [
          ['fastighet','Fastighet'],
          ['typ','Typ'],
          ['post','Post'],
          ['ansvarig','Ansvarig'],
          ['status','Status'],
          ['skapad','Skapad'],
          ['kostnad','Kostnad (kr)']
        ];
        header.innerHTML = columns.map(function (column) {
          return '<button type="button" class="scope-sort-button" data-sort-key="' + column[0] + '" aria-sort="none">' +
            '<span>' + column[1] + '</span><i aria-hidden="true"></i></button>';
        }).join('') + '<span class="scope-edit-column-head">Redigera</span>';

        header.querySelectorAll('.scope-sort-button').forEach(function (button) {
          button.addEventListener('click', function () {
            var current = button.getAttribute('aria-sort');
            var direction = current === 'ascending' ? 'desc' : 'asc';
            header.querySelectorAll('.scope-sort-button').forEach(function (other) {
              other.setAttribute('aria-sort', 'none');
              other.classList.remove('ascending','descending');
            });
            button.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
            button.classList.add(direction === 'asc' ? 'ascending' : 'descending');
            sortRows(section, button.dataset.sortKey, direction);
          });
        });
      }

      var head = section.querySelector('.scope-list-head');
      if (head) {
        var filterButton = document.createElement('button');
        filterButton.type = 'button';
        filterButton.className = 'scope-table-filter-toggle';
        filterButton.setAttribute('aria-label', 'Filtrera tabellen');
        filterButton.setAttribute('aria-expanded', 'false');
        filterButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3L4 5Z"/></svg>';
        head.appendChild(filterButton);

        var panel = buildFilterPanel(section);
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
    });
  }

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();