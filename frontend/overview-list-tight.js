/* Lokalblick – tight overview lists + perspective filters
 * Summary/tabs remain light and compact; the choices only filter the lists below.
 */
(function () {
  var FILTER_ORDER = ['overview', 'contracts', 'project', 'maintenance', 'drift', 'wish'];
  var FILTER_LABELS = {
    overview: 'Översikt',
    contracts: 'Avtal',
    project: 'Projekt',
    maintenance: 'Underhåll',
    drift: 'Drift',
    wish: 'Önskemål'
  };
  var activeFilter = 'overview';

  function sectionKey(section) {
    var title = section.querySelector('.scope-list-title span');
    var text = title ? title.textContent.trim().toLowerCase() : '';
    if (text === 'övriga behov') text = 'önskemål';
    if (text === 'avtal') return 'contracts';
    if (text === 'projekt') return 'project';
    if (text === 'underhåll') return 'maintenance';
    if (text === 'drift') return 'drift';
    if (text === 'önskemål') return 'wish';
    return '';
  }

  function reorderAndRenameSections(root) {
    var container = root.querySelector('.scope-all-sections');
    if (!container) return;
    var sections = Array.from(container.querySelectorAll(':scope > .scope-list-section'));
    sections.forEach(function (section) {
      var key = sectionKey(section);
      if (key === 'wish') {
        var title = section.querySelector('.scope-list-title span');
        if (title) title.textContent = FILTER_LABELS.wish;
      }
    });
    var order = { contracts: 0, project: 1, maintenance: 2, drift: 3, wish: 4 };
    sections.sort(function (a, b) {
      return (order[sectionKey(a)] ?? 99) - (order[sectionKey(b)] ?? 99);
    });
    var changed = sections.some(function (section, index) { return container.children[index] !== section; });
    if (changed) sections.forEach(function (section) { container.appendChild(section); });
  }

  function propertyFallback(root) {
    var buttons = Array.from(root.querySelectorAll('.scope-inline-link'));
    if (buttons.length) return buttons[0].textContent.trim();
    return '–';
  }

  function tightenRows(root) {
    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      var isContracts = sectionKey(section) === 'contracts';
      var fallbackProperty = propertyFallback(section);
      section.querySelectorAll('.scope-list-row').forEach(function (row) {
        if (row.dataset.tightColumns === '2') return;
        var main = row.querySelector('.scope-list-main');
        if (!main) return;
        var title = main.querySelector('strong');
        var meta = main.querySelector('span');
        if (!title || !meta) return;

        var propertyButton = meta.querySelector('.scope-inline-link');
        var property = propertyButton ? propertyButton.textContent.trim() : fallbackProperty;
        var textNodes = Array.from(meta.childNodes).filter(function (n) { return n.nodeType === 3; })
          .map(function (n) { return n.textContent.replace(/^[\s·]+|[\s·]+$/g, '').trim(); })
          .filter(Boolean);

        var type = isContracts ? 'Avtal' : (textNodes[0] || '–');
        var responsible = isContracts ? (textNodes[0] || '–') : (textNodes.slice(1).join(' · ') || 'Ej tilldelad');
        var status = row.querySelector('.scope-list-status');
        var created = row.querySelector('.scope-list-added');
        var value = row.querySelector('.scope-list-value');
        var cost = value ? value.querySelector('strong') : null;
        var edit = value ? value.querySelector('.compact-link') : null;

        row.innerHTML = '';
        [
          ['fastighet', property],
          ['typ', type],
          ['post', title.textContent.trim(), true],
          ['ansvarig', responsible],
          ['status', status, false, true],
          ['skapad', created ? created.textContent.trim() : '–'],
          ['kostnad', cost ? cost.textContent.trim() : '–', false, false, true],
          ['action', edit, false, true]
        ].forEach(function (cell) {
          var div = document.createElement('div');
          div.className = 'scope-tight-cell scope-tight-' + cell[0];
          if (cell[3] && cell[1]) div.appendChild(cell[1]);
          else if (cell[2]) { var strong = document.createElement('strong'); strong.textContent = cell[1]; div.appendChild(strong); }
          else if (cell[4]) { var strongCost = document.createElement('strong'); strongCost.textContent = cell[1]; div.appendChild(strongCost); }
          else div.textContent = cell[1] || '–';
          row.appendChild(div);
        });
        row.dataset.tightColumns = '2';
      });
    });
  }

  function updateHeaders(root) {
    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      var header = section.querySelector('.scope-list-columns');
      if (!header) return;
      ['Fastighet / adress', 'Typ', 'Post', 'Ansvarig', 'Status', 'Skapad', 'Kostnad', ''].forEach(function (label, i) {
        if (header.children[i]) header.children[i].textContent = label;
      });
      header.dataset.tightHeader = '1';
    });
  }

  function filterSections(root) {
    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      var key = sectionKey(section);
      section.hidden = activeFilter !== 'overview' && key !== activeFilter;
    });
  }

  function updateFilterButtons(root) {
    var bar = document.getElementById('portfolio-content-tabs');
    if (!bar) return;
    var buttons = Array.from(bar.querySelectorAll('.view-choice'));
    var byKey = {};
    buttons.forEach(function (button) {
      var key = button.getAttribute('data-portfolio-section');
      if (key) byKey[key] = button;
    });
    FILTER_ORDER.forEach(function (key) {
      var button = byKey[key];
      if (!button) return;
      button.classList.toggle('active', key === activeFilter);
      button.setAttribute('aria-selected', key === activeFilter ? 'true' : 'false');
      var span = button.querySelector('span');
      if (span) span.textContent = FILTER_LABELS[key];
      button.title = 'Filtrera till ' + FILTER_LABELS[key].toLowerCase();
    });
    if (byKey.properties) byKey.properties.hidden = true;
    var tabBar = bar.querySelector('.view-choice-bar');
    if (tabBar) {
      var ordered = FILTER_ORDER.map(function (key) { return byKey[key]; }).filter(Boolean);
      var tabChanged = ordered.some(function (button, index) { return tabBar.children[index] !== button; });
      if (tabChanged) ordered.forEach(function (button) { tabBar.appendChild(button); });
    }
  }

  function setFilter(key) {
    if (FILTER_ORDER.indexOf(key) < 0) return;
    activeFilter = key;
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;
    reorderAndRenameSections(root);
    tightenRows(root);
    updateHeaders(root);
    filterSections(root);
    updateFilterButtons(root);
  }

  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;
    reorderAndRenameSections(root);
    tightenRows(root);
    updateHeaders(root);
    filterSections(root);
    updateFilterButtons(root);
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('#portfolio-content-tabs .view-choice') : null;
    if (!button || button.hidden) return;
    var key = button.getAttribute('data-portfolio-section');
    if (FILTER_ORDER.indexOf(key) < 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setFilter(key);
  }, true);

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();