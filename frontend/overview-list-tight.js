/* Lokalblick – tight overview lists
 * Consistent column order:
 * Fastighet → Typ → Post → Ansvarig → Status → Tid → Tillagd
 */
(function () {
  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;

    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      var titleEl = section.querySelector('.scope-list-title span');
      var sectionTitle = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
      var isContracts = sectionTitle === 'avtal';

      var header = section.querySelector('.scope-list-columns');
      if (header && header.dataset.tightColumns !== '1') {
        header.classList.remove('contract-columns');
        header.innerHTML = [
          'Fastighet',
          'Typ',
          'Post',
          'Ansvarig',
          'Status',
          'Tid',
          'Tillagd'
        ].map(function (label) { return '<span>' + label + '</span>'; }).join('');
        header.dataset.tightColumns = '1';
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
          type = 'Avtal';
          /* Contract metadata is customer · property · area. Keep customer out of Ansvarig. */
          if (!propertyButton && plain.length > 1) {
            property = plain.length > 2 ? plain.slice(1, -1).join(' · ') : plain[1];
          }
          responsible = '–';
        } else {
          type = plain.length ? plain[0] : '';
          if (plain.length > 1) responsible = plain.slice(1).join(' · ');
        }

        var status = row.querySelector('.scope-list-status');
        var time = row.querySelector('.scope-list-time');
        var added = row.querySelector('.scope-list-added');

        var cells = [
          ['fastighet', property || '–', false],
          ['typ', type || '–', false],
          ['post', title.textContent.trim(), true],
          ['ansvarig', responsible || 'Ej tilldelad', false],
          ['status', status || null, false],
          ['tid', time ? time.textContent.trim() : '–', false],
          ['tillagd', added ? added.textContent.trim() : '–', false]
        ];

        row.innerHTML = '';
        cells.forEach(function (cell) {
          var div = document.createElement('div');
          div.className = 'scope-tight-cell scope-tight-' + cell[0];
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
        row.dataset.tightColumns = '1';
      });
    });
  }

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();