/* Lokalblick – tight overview lists
 * Dense, scan-friendly one-row records with a consistent column order.
 * Fastighet/Adress → Typ → Post → Ansvarig → Status → Skapad → Kostnad → Redigera
 */
(function () {
  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;

    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      var titleEl = section.querySelector('.scope-list-title span');
      var sectionTitle = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
      var isContracts = sectionTitle === 'avtal';

      /* Keep every list header in exactly the same order. */
      var header = section.querySelector('.scope-list-columns');
      if (header) {
        header.classList.remove('contract-columns');
        header.innerHTML = [
          'Fastighet / adress',
          'Typ',
          'Post',
          'Ansvarig',
          'Status',
          'Skapad',
          'Kostnad',
          ''
        ].map(function (label) { return '<span>' + label + '</span>'; }).join('');
      }

      section.querySelectorAll('.scope-list-row').forEach(function (row) {
        if (row.dataset.tightColumns === '1') return;
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
          /* Contracts do not expose a type/responsible field in the compact source row. */
          type = 'Avtal';
          responsible = '–';
          if (!propertyButton && plain.length > 1) property = plain[1];
        } else {
          type = plain.length ? plain[0] : '';
          if (plain.length > 1) responsible = plain.slice(1).join(' · ');
        }

        var status = row.querySelector('.scope-list-status');
        var added = row.querySelector('.scope-list-added');
        var value = row.querySelector('.scope-list-value');
        var valueStrong = value ? value.querySelector('strong') : null;
        var edit = value ? value.querySelector('.compact-link') : null;

        var cells = [
          ['fastighet', property || '–', false],
          ['typ', type || '–', false],
          ['post', title.textContent.trim(), true],
          ['ansvarig', responsible || 'Ej tilldelad', false],
          ['status', status || null, false],
          ['skapad', added ? added.textContent.trim() : '–', false],
          ['kostnad', valueStrong ? valueStrong.textContent.trim() : '–', true],
          ['action', edit || null, false]
        ];

        row.innerHTML = '';
        cells.forEach(function (cell) {
          var div = document.createElement('div');
          div.className = 'scope-tight-cell scope-tight-' + cell[0];
          if (cell[0] === 'status' && cell[1]) {
            div.appendChild(cell[1]);
          } else if (cell[0] === 'action' && cell[1]) {
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
        row.dataset.tightColumns = '1';
      });
    });
  }

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();