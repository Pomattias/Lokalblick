/* Lokalblick – tight overview lists
 * Keeps the summary chips prominent and turns the lists below into dense,
 * scan-friendly one-row records with explicit columns.
 */
(function () {
  function enhance() {
    var root = document.getElementById('portfolio-overview-content');
    if (!root) return;

    root.querySelectorAll('.scope-list-section').forEach(function (section) {
      var titleEl = section.querySelector('.scope-list-title span');
      var sectionTitle = titleEl ? titleEl.textContent.trim().toLowerCase() : '';
      var isContracts = sectionTitle === 'avtal';

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
        var customer = '';
        var responsible = '';
        var area = '';

        if (isContracts) {
          customer = plain.length ? plain[0] : '';
          area = plain.length > 1 ? plain[plain.length - 1] : '';
          if (!propertyButton && plain.length > 1) property = plain.slice(1, -1).join(' · ');
        } else {
          type = plain.length ? plain[0] : '';
          if (plain.length > 1) responsible = plain.slice(1).join(' · ');
        }

        var status = row.querySelector('.scope-list-status');
        var time = row.querySelector('.scope-list-time');
        var value = row.querySelector('.scope-list-value');
        var valueStrong = value ? value.querySelector('strong') : null;
        var edit = value ? value.querySelector('.compact-link') : null;

        var cells = [
          ['post', title.textContent.trim(), false, true],
          [isContracts ? 'kund' : 'typ', isContracts ? customer : type, false, false],
          ['fastighet', property || '–', false, false],
          [isContracts ? 'area' : 'ansvarig', isContracts ? (area || '–') : (responsible || 'Ej tilldelad'), false, false],
          ['status', status ? status.innerHTML : '–', true, false],
          ['tid', time ? time.textContent.trim() : '–', false, false],
          ['kostnad', valueStrong ? valueStrong.textContent.trim() : '–', false, true],
          ['action', edit ? edit.outerHTML : '', true, false]
        ];

        row.innerHTML = cells.map(function (cell) {
          var cls = 'scope-tight-cell scope-tight-' + cell[0];
          var content = cell[2] ? cell[1] : escapeHtml(cell[1]);
          if (cell[3]) content = '<strong>' + content + '</strong>';
          return '<div class="' + cls + '">' + content + '</div>';
        }).join('');
        row.dataset.tightColumns = '1';
      });
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (ch) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch];
    });
  }

  enhance();
  var observer = new MutationObserver(function () { enhance(); });
  observer.observe(document.body, { childList: true, subtree: true });
})();
