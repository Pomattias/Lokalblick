import { tables, idLabels, roles, statuses, priorities, emptyData, today, active, find, title, propertyId, directContacts, coordinator, propertySummary } from './model.js';
import { demoData } from './demo.js';
import { BrowserExcel } from './excel-client.js';
const app = document.querySelector('#app');
const detail = document.querySelector('#detail');
const editor = document.querySelector('#editor');
const views = ['properties', 'objects', 'agreements', 'issues', 'orders', 'people', 'parties'];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const num = value => value == null ? '–' : new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(value);
const money = value => value == null ? '–' : `${num(value)} kr`;
const range = row => `${row.valid_from || 'Ej angivet'} – ${row.valid_to || 'Ej angivet'}`;
const path = (table, id) => `#${table}${id ? '/' + encodeURIComponent(id) : ''}`;
const link = (table, row, text = title(row)) => row ? `<a href="${path(table, row.id)}">${esc(text)}</a>` : '–';
const button = (action, text, attrs = '') => `<button type="button" data-action="${action}" ${attrs}>${text}</button>`;
const fold = (label, content) => `<details class="fold"><summary>${esc(label)}</summary><div>${content}</div></details>`;
const row = (label, value) => `<div class="detail-row"><span>${esc(label)}</span><span>${value ?? '–'}</span></div>`;
const fact = (label, value) => `<div class="fact"><small>${esc(label)}</small>${value}</div>`;
const chip = (value, labels) => `<span class="chip ${esc(value)}">${esc(labels[value] || value)}</span>`;
const attrs = (table, id = '') => `data-table="${table}" data-id="${esc(id)}"`;
const targetKeys = { properties: 'property_id', agreements: 'agreement_id', issues: 'issue_id', orders: 'order_id' };
let snapshot = { version: 0, data: emptyData(), storage: { mode: 'sqlite' } }, data = snapshot.data, demo = false;
let browserStore = null;
let view = 'properties', expanded = new Set(), editing = null, noticeTimer;
const filters = { q: '', property: '', sort: 'name', history: false, date: today(), status: '' };
function notice(message, persistent = false) { const node = document.querySelector('#notice'); node.textContent = message; clearTimeout(noticeTimer); if (!persistent) noticeTimer = setTimeout(() => { node.textContent = ''; }, 7000); }
function setSnapshot(value) { snapshot = value; data = value.data; }
async function load() {
 if (browserStore) return setSnapshot(await browserStore.reload());
 if (new URLSearchParams(location.search).get('demo') === '1' || !['127.0.0.1', 'localhost'].includes(location.hostname)) { demo = true; return setSnapshot({ version: 0, data: demoData(), storage: { mode: 'demo' } }); }
 const response = await fetch('/api/lokaler', { cache: 'no-store' });
 if (response.status === 404) { demo = true; return setSnapshot({ version: 0, data: demoData(), storage: { mode: 'demo' } }); }
 if (!response.ok) throw Error('Kunde inte öppna den lokala lagringen. Kontrollera att appens server körs.');
 setSnapshot(await response.json());
}
function propertyContext(table, record) {
 const property = find(data, 'properties', propertyId(data, table, record));
 const object = record.object_id && find(data, 'objects', record.object_id);
 return [property && table !== 'properties' ? link('properties', property, `${property.name}${property.address ? ' · ' + property.address : ''}`) : '', object && table !== 'objects' ? link('objects', object) : ''].filter(Boolean).join(' › ');
}
function options(table, selected, placeholder = 'Välj…') {
 return `<option value="">${esc(placeholder)}</option>` + data[table].map(item => `<option value="${esc(item.id)}" ${item.id === selected ? 'selected' : ''}>${esc(title(item))}${table === 'objects' ? ' · ' + esc(find(data, 'properties', item.property_id)?.name || '') : ''}</option>`).join('');
}
function contactRows(table, record, showInherited = true) {
 const direct = directContacts(data, table, record.id, filters.date);
 const assigned = coordinator(data, table, record, filters.date);
 const contactLine = (item, history = false) => {
  const person = find(data, 'people', item.person_id);
  return `<div class="contact"><div>${link('people', person)}<small>${esc(roles[item.role])}${history ? ' · ' + esc(range(item)) : ''}</small></div><div>${button('edit', 'Ändra', attrs('contacts', item.id))}</div></div>`;
 };
 const inherited = showInherited && assigned?.inherited ? `<div class="contact"><div>${link('people', assigned.person)}<small>Samordnare via ${assigned.via === 'issues' ? 'ärendet' : 'fastigheten'}</small></div></div>` : '';
 const history = data.contacts.filter(item => item[targetKeys[table]] === record.id && !active(item, filters.date));
 const historyBlock = history.length ? fold(`Historik och kommande kopplingar (${history.length})`, history.map(item => contactLine(item, true)).join('')) : '';
 return `<section class="section"><div class="section-heading"><h3>Kontaktpersoner</h3>${button('contact', 'Koppla person', attrs(table, record.id))}</div>${direct.map(item => contactLine(item)).join('')}${inherited}${!direct.length && !inherited ? '<p class="help">' + (!showInherited && assigned ? 'Samordnaren ärvs. Ingen egen koppling behövs.' : 'Ingen aktuell kontaktperson.') + '</p>' : ''}${historyBlock}</section>`;
}
function objectLines(objects) {
 return objects.map(object => {
  const agreements = data.agreements.filter(item => item.object_id === object.id && active(item, filters.date));
  return `<div class="object-line"><div>${link('objects', object)}${agreements.length ? agreements.map(agreement => `<span class="sub">${link('agreements', agreement, 'Avtal ' + agreement.number)} · ${esc(title(find(data, 'parties', agreement.tenant_party_id)))}</span>`).join('') : '<span class="sub">Inget aktuellt avtal</span>'}</div><div class="values">${num(object.area)} m²${agreements.length ? '<br>' + money(agreements.reduce((sum, agreement) => sum + (agreement.annual_rent || 0), 0)) + '/år' : ''}</div></div>`;
 }).join('');
}
function issueLines(issues) {
 return issues.map(issue => `<div class="object-line"><div>${link('issues', issue, issue.title)}</div><div>${chip(issue.status, statuses)} ${chip(issue.priority, priorities)}</div></div>`).join('') || '<p class="help">Inga öppna ärenden.</p>';
}
function filteredRows() {
 return data[view].filter(record => {
  if (!filters.history && ['objects', 'agreements'].includes(view) && !active(record, filters.date)) return false;
  if (!filters.history && ['issues', 'orders'].includes(view) && record.status === 'done') return false;
  if (filters.property && !['people', 'parties'].includes(view) && propertyId(data, view, record) !== filters.property) return false;
  if (filters.status && ['issues', 'orders'].includes(view) && record.status !== filters.status) return false;
  const property = find(data, 'properties', propertyId(data, view, record));
  const tenant = record.tenant_party_id && find(data, 'parties', record.tenant_party_id);
  return [title(record), record.id, record.address, record.popular_name, property?.name, property?.address, tenant?.name, record.email, record.description].filter(Boolean).join(' ').toLocaleLowerCase('sv').includes(filters.q.toLocaleLowerCase('sv'));
 }).sort((a, b) => {
  if (filters.sort === 'area') return (view === 'properties' ? propertySummary(data, b.id, filters.date).area - propertySummary(data, a.id, filters.date).area : (b.area ?? find(data, 'objects', b.object_id)?.area ?? -1) - (a.area ?? find(data, 'objects', a.object_id)?.area ?? -1));
  if (filters.sort === 'rent') return (view === 'properties' ? propertySummary(data, b.id, filters.date).annualRent - propertySummary(data, a.id, filters.date).annualRent : (b.annual_rent ?? -1) - (a.annual_rent ?? -1));
  return title(a).localeCompare(title(b), 'sv', { numeric: true });
 });
}
function tableContent(records) {
 let headers, body;
 if (view === 'properties') {
  headers = '<th>Fastighet</th><th class="number">Yta, m²</th><th class="number mobile-hide">Årshyra</th><th class="number desktop">Lägenheter</th><th class="number mobile-hide">Öppna ärenden</th>';
  body = records.map(record => {
   const summary = propertySummary(data, record.id, filters.date);
   return `<tbody><tr><td><div class="cell-main">${button('expand', expanded.has(record.id) ? '−' : '+', `class="icon" data-id="${esc(record.id)}" aria-label="${expanded.has(record.id) ? 'Dölj' : 'Visa'} objekt för ${esc(record.name)}" aria-expanded="${expanded.has(record.id)}"`)}<div class="name">${link('properties', record)}<span class="sub">${esc([record.popular_name, record.address].filter(Boolean).join(' · '))}</span></div></div></td><td class="number">${num(summary.area)}${summary.missingArea ? '<span class="sub">Uppgift saknas</span>' : ''}</td><td class="number mobile-hide">${money(summary.annualRent)}</td><td class="number desktop">${num(summary.apartments)}</td><td class="number mobile-hide">${summary.openIssues.length}</td></tr>${expanded.has(record.id) ? `<tr class="expanded"><td colspan="5">${objectLines(summary.objects) || '<p class="help">Inga aktuella objekt.</p>'}</td></tr>` : ''}</tbody>`;
  }).join('');
 } else if (view === 'objects') {
  headers = '<th>Objekt</th><th class="mobile-hide">Fastighet</th><th class="number">Yta, m²</th><th class="number desktop">Lägenheter</th><th class="mobile-hide">Avtal / hyresgäst</th>';
  body = '<tbody>' + records.map(record => {
   const agreement = data.agreements.find(item => item.object_id === record.id && active(item, filters.date));
   return `<tr><td class="name">${link(view, record)}<span class="sub">${esc(record.id)}</span></td><td class="mobile-hide">${link('properties', find(data, 'properties', record.property_id))}</td><td class="number">${num(record.area)}</td><td class="number desktop">${num(record.apartment_count)}</td><td class="mobile-hide">${agreement ? link('agreements', agreement) + '<span class="sub">' + esc(title(find(data, 'parties', agreement.tenant_party_id))) + '</span>' : '–'}</td></tr>`;
  }).join('') + '</tbody>';
 } else if (view === 'agreements') {
  headers = '<th>Fastighet / avtal</th><th class="mobile-hide">Hyresgäst</th><th class="number">Årshyra</th><th class="number mobile-hide">Yta, m²</th><th class="number desktop">kr/m²/år</th><th class="desktop">Hyrestid</th>';
  body = '<tbody>' + records.map(record => {
   const object = find(data, 'objects', record.object_id), property = find(data, 'properties', object?.property_id);
   return `<tr><td><div class="name">${link('properties', property)}</div><span class="sub">${link(view, record, 'Avtal ' + record.number)} · ${esc(object?.name)}</span></td><td class="mobile-hide">${esc(title(find(data, 'parties', record.tenant_party_id)))}</td><td class="number">${money(record.annual_rent)}</td><td class="number mobile-hide">${num(object?.area)}</td><td class="number desktop">${num(object?.area > 0 && record.annual_rent != null ? record.annual_rent / object.area : null)}</td><td class="desktop">${esc(range(record))}</td></tr>`;
  }).join('') + '</tbody>';
 } else if (['issues', 'orders'].includes(view)) {
  headers = `<th>${view === 'issues' ? 'Ärende' : 'Beställning'}</th><th>Status</th><th class="mobile-hide">Samordnare</th><th class="number desktop">${view === 'issues' ? 'Beräknad kostnad' : 'Belopp'}</th>`;
  body = '<tbody>' + records.map(record => {
   const assigned = coordinator(data, view, record, filters.date);
   return `<tr><td class="name">${link(view, record)}<span class="sub">${esc(title(find(data, 'properties', propertyId(data, view, record))))}</span></td><td>${chip(record.status, statuses)}${record.priority ? '<span class="sub">' + chip(record.priority, priorities) + '</span>' : ''}</td><td class="mobile-hide">${esc(title(assigned?.person))}${assigned?.inherited ? '<span class="sub">Ärvd koppling</span>' : ''}</td><td class="number desktop">${money(record.estimated_cost ?? record.amount)}</td></tr>`;
  }).join('') + '</tbody>';
 } else {
  headers = '<th>Namn</th>' + (view === 'people' ? '<th class="mobile-hide">E-post</th><th class="mobile-hide">Telefon</th>' : '');
  body = '<tbody>' + records.map(record => `<tr><td class="name">${link(view, record)}</td>${view === 'people' ? `<td class="mobile-hide">${esc(record.email || '–')}</td><td class="mobile-hide">${esc(record.phone || '–')}</td>` : ''}</tr>`).join('') + '</tbody>';
 }
 return `<table><thead><tr>${headers}</tr></thead>${body}</table>`;
}
function renderRows() {
 const records = filteredRows();
 document.querySelector('#count').textContent = `${records.length} av ${data[view].length} ${tables[view].label.toLocaleLowerCase('sv')}`;
 document.querySelector('#rows').innerHTML = records.length ? tableContent(records) : `<div class="empty"><h3>${data[view].length ? 'Inga träffar' : 'Börja med ' + tables[view].label.toLocaleLowerCase('sv')}</h3><p>${data[view].length ? 'Prova en annan sökning eller justera filtren.' : 'Skapa en post med knappen uppe till höger.'}</p>${data[view].length ? button('clear', 'Rensa filter') : ''}</div>`;
 const stats = document.querySelector('#stats');
 if (view === 'properties') {
  const totals = records.reduce((sum, record) => { const item = propertySummary(data, record.id, filters.date); return { area: sum.area + item.area, rent: sum.rent + item.annualRent, objects: sum.objects + item.objects.length, issues: sum.issues + item.openIssues.length }; }, { area: 0, rent: 0, objects: 0, issues: 0 });
  stats.innerHTML = `<div><strong>${num(totals.area)} m²</strong>Aktuell yta</div><div><strong>${money(totals.rent)}</strong>Årshyra</div><div><strong>${totals.objects}</strong>Objekt</div><div><strong>${totals.issues}</strong>Öppna ärenden</div>`;
 } else stats.innerHTML = '';
}
function renderShell() {
 app.innerHTML = `<aside class="sidebar"><a class="brand" href="#properties">Lokalblick<small>Lokaler</small></a><nav aria-label="Huvudmeny">${views.map(table => `<a href="${path(table)}" ${view === table ? 'aria-current="page"' : ''}>${tables[table].label}</a>`).join('')}<a href="#storage" ${view === 'storage' ? 'aria-current="page"' : ''}>Lagring</a></nav><div class="storage"><strong>${demo ? 'Demonstration' : ['excel', 'browser-excel'].includes(snapshot.storage.mode) ? 'Lokal Excel-fil' : 'Lokal databas'}</strong>${esc(snapshot.storage.file || 'Syntetiska exempel · sparas inte')}<br>Ingen molnlagring</div></aside><main>${demo ? `<div class="demo-note">Fiktivt exempel. Anslut en lokal arbetsbok för att registrera egna uppgifter.<div class="actions">${button('open-excel', 'Öppna Excel')}${button('new-excel', 'Skapa Excel', 'class="primary"')}</div></div>` : ''}<div id="content"></div></main>`;
 if (view === 'storage') return renderStorage();
 document.querySelector('#content').innerHTML = `<header class="page-heading"><h1>${tables[view].label}</h1><div class="actions">${button('reload', 'Uppdatera')}${button('create', 'Ny ' + tables[view].singular.toLocaleLowerCase('sv'), `class="primary" ${attrs(view)}`)}</div></header><div class="overview" id="stats"></div><div class="filters"><input type="search" name="q" aria-label="Sök" placeholder="Sök ${tables[view].label.toLocaleLowerCase('sv')}…" value="${esc(filters.q)}">${!['people', 'parties'].includes(view) ? `<select name="property" aria-label="Filtrera på fastighet">${options('properties', filters.property, 'Alla fastigheter')}</select>` : ''}<select name="sort" aria-label="Sortering"><option value="name">Namn A–Ö</option>${['properties', 'objects', 'agreements'].includes(view) ? '<option value="area">Störst yta</option>' : ''}${['properties', 'agreements'].includes(view) ? '<option value="rent">Högst årshyra</option>' : ''}</select>${['issues', 'orders'].includes(view) ? `<select name="status" aria-label="Status"><option value="">Alla statusar</option>${Object.entries(tables[view].fields.find(f => f.key === 'status').values).map(([value, text]) => `<option value="${value}" ${filters.status === value ? 'selected' : ''}>${text}</option>`).join('')}</select>` : ''}${!['people', 'parties'].includes(view) ? `<label>Per datum <input type="date" name="date" aria-label="Visa per datum" value="${filters.date}" required></label>` : ''}${['objects', 'agreements', 'issues', 'orders'].includes(view) ? `<label><input type="checkbox" name="history" ${filters.history ? 'checked' : ''}>Visa historik</label>` : ''}</div><div class="count" id="count"></div><div class="list" id="rows"></div>`;
 document.querySelector('[name=sort]').value = filters.sort;
 renderRows();
}
function renderStorage() {
 document.querySelector('#content').innerHTML = `<header class="page-heading"><h1>Lagring</h1></header><section class="storage-panel"><h3>${demo ? 'Lokala data i Excel eller databas' : ['excel', 'browser-excel'].includes(snapshot.storage.mode) ? 'Excel är arbetsfilen' : 'Databasen är arbetsfilen'}</h3><p>${demo ? 'Öppna eller skapa en lokal Excel-arbetsbok direkt här. Innehållet stannar i webbläsaren och filen på din dator. Direkt filåtkomst kräver Chrome eller Edge på dator.' : `Alla ändringar sparas lokalt i <strong>${esc(snapshot.storage.file)}</strong>.`}</p><p>Fastigheter, objekt, avtal och personer finns i egna tabeller. Personkopplingar innehåller ID:n och perioder. Yta och antal lägenheter finns bara på objektet.</p><ul><li>Starta databasläge med <code>npm run lokaler</code>.</li><li>Starta Excel-läge med <code>npm run lokaler:excel</code>.</li><li>Öppna den lokala adressen som visas i terminalen.</li><li>För att redigera Excel manuellt: stäng appen, spara arbetsboken och starta appen igen.</li></ul><div class="actions">${button('open-excel', 'Öppna Excel')}${button('new-excel', 'Skapa Excel')}${browserStore ? button('export-excel', 'Hämta Excel-kopia') : !demo ? '<a class="download" href="/api/lokaler/workbook">Hämta Excel-kopia / mall</a>' : ''}</div><p class="help">Excel direkt i webbläsaren kräver att arbetsboken öppnas igen efter omladdning. Hämta egna säkerhetskopior regelbundet. En Excel-kopia ändrar inte lagringsläge. Ange önskad arbetsfil och lagring när appen startas. Läs startguiden i projektet för filval och säkerhetskopiering.</p></section>`;
}
function detailBody(table, record) {
 if (table === 'properties') {
  const summary = propertySummary(data, record.id, filters.date);
  const historic = data.objects.filter(object => object.property_id === record.id && !active(object, filters.date));
  return `<section class="section"><div class="facts">${fact('Yta', num(summary.area) + ' m²')}${fact('Årshyra', money(summary.annualRent))}${fact('Lägenheter', num(summary.apartments))}</div>${summary.missingArea ? '<p class="help">Yta saknas för ' + summary.missingArea + ' objekt. Summan är ofullständig.</p>' : ''}${record.popular_name ? row('Populärnamn', esc(record.popular_name)) : ''}${record.address ? row('Adress', esc(record.address)) : ''}${row('Fastighetsägare', link('parties', find(data, 'parties', record.owner_party_id)))}</section><section class="section"><div class="section-heading"><h3>Objekt och avtal · ${summary.objects.length}</h3>${button('child', 'Nytt objekt', `${attrs('objects')} data-parent="${esc(record.id)}"`)}</div>${objectLines(summary.objects) || '<p class="help">Inga aktuella objekt.</p>'}${historic.length ? fold('Tidigare och kommande objekt', objectLines(historic)) : ''}</section>${contactRows(table, record)}<section class="section"><div class="section-heading"><h3>Ärenden · ${summary.openIssues.length} öppna</h3>${button('child', 'Nytt ärende', `${attrs('issues')} data-parent="${esc(record.id)}" data-parent-kind="properties"`)}</div>${issueLines(summary.openIssues)}</section>`;
 }
 if (table === 'objects') {
  const agreements = data.agreements.filter(item => item.object_id === record.id);
  const current = agreements.filter(item => active(item, filters.date)), historic = agreements.filter(item => !active(item, filters.date));
  const agreementLine = agreement => `<div class="object-line"><div>${link('agreements', agreement, 'Avtal ' + agreement.number)}<span class="sub">${esc(title(find(data, 'parties', agreement.tenant_party_id)))}</span></div><div class="values">${money(agreement.annual_rent)}/år<br>${esc(range(agreement))}</div></div>`;
  const changes = data.object_links.filter(item => item.predecessor_id === record.id || item.successor_id === record.id);
  return `<section class="section"><div class="facts">${fact('Yta', num(record.area) + ' m²')}${fact('Lägenheter', num(record.apartment_count))}</div>${row('Giltighetstid', esc(range(record)))}</section><section class="section"><div class="section-heading"><h3>Avtal</h3>${button('child', 'Nytt avtal', `${attrs('agreements')} data-parent="${esc(record.id)}"`)}</div>${current.map(agreementLine).join('') || '<p class="help">Inget aktuellt avtal.</p>'}${historic.length ? fold('Tidigare och kommande avtal', historic.map(agreementLine).join('')) : ''}</section><section class="section"><div class="section-heading"><h3>Ärenden</h3>${button('child', 'Nytt ärende', `${attrs('issues')} data-parent="${esc(record.id)}" data-parent-kind="objects"`)}</div>${issueLines(data.issues.filter(item => item.object_id === record.id && item.status !== 'done'))}</section>${fold('Delning och sammanslagning', `<p class="help">Avsluta tidigare objekt och skapa nya med egna ID:n och startdatum. Koppla sedan föregångare och efterföljare.</p>${changes.map(item => row('Objektförändring', link('objects', find(data, 'objects', item.predecessor_id)) + ' → ' + link('objects', find(data, 'objects', item.successor_id)))).join('')}${button('child', 'Koppla objektförändring', `${attrs('object_links')} data-parent="${esc(record.id)}"`)}`)}`;
 }
 if (table === 'agreements') {
  const object = find(data, 'objects', record.object_id);
  return `<section class="section">${row('Hyresgäst', link('parties', find(data, 'parties', record.tenant_party_id)))}</section><section class="section"><h3>Hyra och yta</h3><div class="facts">${fact('Årshyra', money(record.annual_rent))}${fact('Yta från objektet', num(object?.area) + ' m²')}${fact('kr/m²/år', num(object?.area > 0 && record.annual_rent != null ? record.annual_rent / object.area : null))}</div></section><section class="section">${row('Hyrestid', esc(range(record)))}</section>${fold('Fler avtalsuppgifter', tables.agreements.fields.filter(f => !['object_id', 'number', 'tenant_party_id', 'annual_rent', 'valid_from', 'valid_to'].includes(f.key) && record[f.key] != null).map(f => row(f.label, f.type === 'url' ? `<a href="${esc(record[f.key])}" target="_blank" rel="noopener noreferrer">Öppna dokument</a>` : esc(record[f.key]))).join('') || '<p class="help">Inga fler uppgifter.</p>')}${contactRows(table, record)}${fold('Ärenden på objektet', issueLines(data.issues.filter(issue => issue.object_id === record.object_id && issue.status !== 'done')))}`;
 }
 if (table === 'issues' || table === 'orders') {
  const assigned = coordinator(data, table, record, filters.date);
  return `<section class="section">${chip(record.status, statuses)} ${record.priority ? chip(record.priority, priorities) : ''}${record.description ? '<p class="description">' + esc(record.description) + '</p>' : ''}</section><section class="section"><div class="facts">${fact(table === 'issues' ? 'Beräknad kostnad' : 'Belopp', money(record.estimated_cost ?? record.amount))}${fact('Samordnare', link('people', assigned?.person) + (assigned?.inherited ? '<small>Via ' + (assigned.via === 'issues' ? 'ärendet' : 'fastigheten') + '</small>' : ''))}</div></section>${table === 'issues' ? `<section class="section">${row('Tidplan', esc(`${record.planned_from || 'Ej angivet'} – ${record.planned_to || 'Ej angivet'}`))}${record.notes ? '<h3>Noteringar</h3><p class="description">' + esc(record.notes) + '</p>' : ''}</section><section class="section"><div class="section-heading"><h3>Beställningar</h3>${button('child', 'Ny beställning', `${attrs('orders')} data-parent="${esc(record.id)}"`)}</div>${data.orders.filter(order => order.issue_id === record.id).map(order => row('Beställning', link('orders', order) + ' · ' + money(order.amount))).join('') || '<p class="help">Inga beställningar.</p>'}</section>` : row('Ärende', link('issues', find(data, 'issues', record.issue_id)))}${fold('Personkopplingar', contactRows(table, record, false))}`;
 }
 if (table === 'people') {
  const connections = data.contacts.filter(item => item.person_id === record.id);
  const contactLine = item => {
   const entry = Object.entries(targetKeys).find(([, key]) => item[key]);
   return `<div class="contact"><div>${link(entry[0], find(data, entry[0], item[entry[1]]))}<small>${esc(roles[item.role])} · ${esc(range(item))}</small></div>${button('edit', 'Ändra', attrs('contacts', item.id))}</div>`;
  };
  return `<section class="section">${record.email ? row('E-post', `<a href="mailto:${esc(record.email)}">${esc(record.email)}</a>`) : ''}${record.phone ? row('Telefon', esc(record.phone)) : ''}</section><section class="section"><div class="section-heading"><h3>Aktuella personkopplingar</h3>${button('person-contact', 'Ny koppling', `data-id="${esc(record.id)}"`)}</div>${connections.filter(item => active(item, filters.date)).map(contactLine).join('') || '<p class="help">Inga aktuella kopplingar.</p>'}</section>${connections.some(item => !active(item, filters.date)) ? fold('Historik och kommande kopplingar', connections.filter(item => !active(item, filters.date)).map(contactLine).join('')) : ''}`;
 }
 if (table === 'parties') return `<section class="section">${row('Fastigheter', data.properties.filter(item => item.owner_party_id === record.id).map(item => link('properties', item)).join(', ') || '–')}${row('Aktuella avtal', data.agreements.filter(item => item.tenant_party_id === record.id && active(item, filters.date)).map(item => link('agreements', item)).join(', ') || '–')}</section>`;
 return '';
}
function openDetail(table, record) {
 if (!record) { notice('Posten finns inte.'); return; }
 const heading = table === 'agreements' ? 'Avtal ' + record.number : title(record);
 detail.innerHTML = `<header class="dialog-heading">${propertyContext(table, record) ? `<div class="context">${propertyContext(table, record)}</div>` : ''}<div class="dialog-title"><h2 id="detail-title">${esc(heading)}</h2><div class="actions">${button('edit', 'Redigera', attrs(table, record.id))}${button('close-detail', 'Stäng')}</div></div></header><div class="detail-body">${detailBody(table, record)}${fold('Registeruppgifter', row(idLabels[table], esc(record.id)))}</div>`;
 if (!detail.open) detail.showModal();
 detail.scrollTop = 0;
}
function route() {
 const [requested, rawId] = location.hash.slice(1).split('/');
 const nextView = [...views, 'storage'].includes(requested) ? requested : 'properties';
 if (nextView !== view) { filters.q = ''; filters.status = ''; }
 view = nextView;
 if (!['area', 'rent'].includes(filters.sort) || !['properties', 'objects', 'agreements'].includes(view)) filters.sort = 'name';
 if (view === 'objects' && filters.sort === 'rent') filters.sort = 'name';
 renderShell();
 if (rawId && view !== 'storage') {
  let id; try { id = decodeURIComponent(rawId); } catch { notice('Ogiltig länk.'); return; }
  openDetail(view, find(data, view, id));
 } else if (detail.open) detail.close();
}
function fieldControl(field, value) {
 const required = field.required ? 'required' : '';
 if (field.type === 'ref') return `<select name="${field.key}" ${required}>${options(field.table, value)}</select>`;
 if (field.type === 'select') return `<select name="${field.key}" ${required}>${Object.entries(field.values).map(([key, text]) => `<option value="${key}" ${value === key ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
 if (field.type === 'textarea') return `<textarea name="${field.key}" ${required}>${esc(value)}</textarea>`;
 return `<input name="${field.key}" type="${['number', 'integer'].includes(field.type) ? 'number' : field.type}" value="${esc(value)}" ${['number', 'integer'].includes(field.type) ? `min="0" step="${field.type === 'integer' ? '1' : 'any'}"` : ''} ${required}>`;
}
function openEditor(table, record = {}, defaults = {}) {
 if (demo) { notice('Öppna eller skapa en lokal Excel-fil för att registrera egna uppgifter.'); return; }
 const spec = tables[table], isNew = !record.id;
 editing = { table, record: { ...record, ...defaults }, version: snapshot.version, isNew };
 renderForm();
 if (!editor.open) editor.showModal();
}
function renderForm() {
 const { table, record, isNew } = editing;
 const spec = tables[table];
 let special = '', fields = spec.fields;
 if (table === 'issues') {
  const kind = record.object_id ? 'objects' : 'properties';
  special = `<label>Kopplas till<select name="target_kind"><option value="properties" ${kind === 'properties' ? 'selected' : ''}>Fastighet</option><option value="objects" ${kind === 'objects' ? 'selected' : ''}>Objekt</option></select></label><label>Välj ${kind === 'objects' ? 'objekt' : 'fastighet'}<select name="target_id" required>${options(kind, record.object_id || record.property_id)}</select></label>`;
  fields = fields.filter(f => !['property_id', 'object_id'].includes(f.key));
 }
 if (table === 'contacts') {
  const role = record.role || 'coordinator';
  const allowed = role === 'owner' ? ['properties'] : ['tenant', 'business'].includes(role) ? ['agreements'] : Object.keys(targetKeys);
  const selected = allowed.find(kind => record[targetKeys[kind]]) || allowed[0];
  special = `<label>Kopplas till<select name="target_kind">${allowed.map(kind => `<option value="${kind}" ${kind === selected ? 'selected' : ''}>${esc(tables[kind].singular)}</option>`).join('')}</select></label><label>Välj ${tables[selected].singular.toLocaleLowerCase('sv')}<select name="target_id" required>${options(selected, record[targetKeys[selected]])}</select></label>`;
  fields = fields.filter(f => !Object.values(targetKeys).includes(f.key));
 }
 editor.innerHTML = `<header class="dialog-heading"><div class="dialog-title"><h2 id="editor-title">${isNew ? 'Ny' : 'Redigera'} ${spec.singular.toLocaleLowerCase('sv')}</h2><div class="actions">${button('close-editor', 'Avbryt')}</div></div></header><form id="record-form" class="form-body"><div class="form-grid">${fields.map(field => `<label class="${field.type === 'textarea' ? 'wide' : ''}">${esc(field.label)}${fieldControl(field, record[field.key] ?? field.default ?? (field.key === 'role' ? 'coordinator' : ''))}</label>`).join('')}${special}</div>${table === 'objects' ? '<p class="form-info">Yta och antal lägenheter lagras enbart här. Lämna datum tomma när giltighetstiden saknas.</p>' : ''}${table === 'contacts' ? '<p class="form-info">Lämna en egen samordnarkoppling tom för att ärva samordnaren från ärendet eller fastigheten. Avsluta tidigare period före ett byte.</p>' : ''}${table === 'agreements' ? '<p class="form-info">Yta hämtas från objektet. Avtalsnumret bevaras exakt, även skiljetecken.</p>' : ''}${isNew ? fold('Ange eget ID (valfritt)', `<label class="help">Lämna tomt för automatiskt ID<input name="custom_id" aria-label="Eget ID" value="${esc(record.custom_id)}" maxlength="100"></label>`) : ''}<p class="error" role="alert" id="form-error"></p><div class="form-footer">${button('close-editor', 'Avbryt')}<button type="submit" class="primary">Spara</button></div></form>`;
}
function readForm() {
 const input = Object.fromEntries(new FormData(document.querySelector('#record-form')));
 const { target_kind, target_id, custom_id, ...record } = input;
 if (editing.table === 'issues') {
  record.property_id = target_kind === 'properties' ? target_id : null;
  record.object_id = target_kind === 'objects' ? target_id : null;
 }
 if (editing.table === 'contacts') {
  for (const key of Object.values(targetKeys)) record[key] = null;
  record[targetKeys[target_kind]] = target_id;
 }
 record.id = editing.record.id || custom_id || undefined;
 return record;
}
async function save(event) {
 event.preventDefault();
 const form = event.target;
 if (form.id !== 'record-form') return;
 const record = readForm();
 form.querySelector('[type=submit]').disabled = true;
 form.querySelector('[type=submit]').textContent = 'Sparar…';
 document.querySelector('#form-error').textContent = '';
 try {
  let result;
  if (browserStore) result = await browserStore.save(editing.table, record, editing.version, editing.isNew);
  else {
  const response = await fetch('/api/lokaler/changes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: editing.version, operations: [{ table: editing.table, record, create: editing.isNew }] }) });
  result = await response.json();
  if (!response.ok) throw Error(result.error || 'Kunde inte spara.');
  }
  setSnapshot(result); editor.close(); route(); notice('Sparat lokalt.');
 } catch (error) { document.querySelector('#form-error').textContent = error.message; form.querySelector('[type=submit]').disabled = false; form.querySelector('[type=submit]').textContent = 'Spara'; }
}
async function action(event) {
 const element = event.target.closest('[data-action]');
 if (!element) return;
 const { action, table, id, parent, parentKind } = element.dataset;
 if (action === 'open-excel' || action === 'new-excel') {
  try {
   const connected = await BrowserExcel.connect(action === 'new-excel', message => notice(message, true));
   browserStore = connected; demo = false; setSnapshot(connected.snapshot());
   Object.assign(filters, { q: '', property: '', status: '', history: false });
   expanded.clear(); if (detail.open) detail.close(); location.hash = '#properties'; route();
   notice('Lokal Excel ansluten. Uppgifterna lämnar inte din dator.');
  } catch (error) { if (error.name !== 'AbortError') notice(error.message); }
  return;
 }
 if (action === 'export-excel' && browserStore) {
  try {
   const file = await browserStore.handle.getFile();
   const url = URL.createObjectURL(file), anchor = document.createElement('a');
   anchor.href = url; anchor.download = file.name; anchor.click();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notice(error.message); }
  return;
 }

 if (action === 'expand') { expanded.has(id) ? expanded.delete(id) : expanded.add(id); return renderRows(); }
 if (action === 'close-detail') { detail.close(); location.hash = path(view); return; }
 if (action === 'close-editor') return editor.close();
 if (action === 'create') return openEditor(table);
 if (action === 'edit') return openEditor(table, find(data, table, id));
 if (action === 'contact') return openEditor('contacts', {}, { [targetKeys[table]]: id, role: 'coordinator' });
 if (action === 'person-contact') return openEditor('contacts', {}, { person_id: id, role: 'coordinator' });
 if (action === 'child') {
  const defaults = table === 'objects' ? { property_id: parent } : table === 'agreements' ? { object_id: parent } : table === 'orders' ? { issue_id: parent } : table === 'object_links' ? { predecessor_id: parent } : { [parentKind === 'objects' ? 'object_id' : 'property_id']: parent };
  return openEditor(table, {}, defaults);
 }
 if (action === 'clear') { Object.assign(filters, { q: '', property: '', status: '', history: false, date: today() }); return renderShell(); }
 if (action === 'reload') {
  try { await load(); route(); notice('Uppgifterna är uppdaterade.'); } catch (error) { notice(error.message); }
 }
}
document.addEventListener('click', action);
document.addEventListener('submit', save);
document.addEventListener('input', event => {
 if (event.target.matches('.filters [name=q]')) { filters.q = event.target.value; renderRows(); }
});
document.addEventListener('change', event => {
 const field = event.target;
 if (field.closest('.filters')) {
  if (field.name === 'date' && !field.value) { field.value = filters.date; return; }
  filters[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  renderRows();
 }
 if (field.closest('#record-form') && ['target_kind', 'role'].includes(field.name)) {
  const values = readForm();
  const customId = document.querySelector('[name=custom_id]')?.value;
  if (field.name === 'target_kind') {
   for (const key of Object.values(targetKeys)) if (key in values) values[key] = null;
   if (editing.table === 'issues') values.object_id = field.value === 'objects' ? '__new__' : null;
   else values[targetKeys[field.value]] = '__new__';
  }
  editing.record = { ...editing.record, ...values, custom_id: customId, id: editing.record.id };
  renderForm();
 }
});
detail.addEventListener('cancel', event => { event.preventDefault(); detail.close(); location.hash = path(view); });
window.addEventListener('hashchange', route);
try { await load(); route(); } catch (error) {
 app.innerHTML = `<main><section class="inline-error"><h1>Kunde inte öppna lokala data</h1><p>${esc(error.message)}</p><p>Starta med <code>npm run lokaler</code> eller <code>npm run lokaler:excel</code> och öppna adressen i terminalen.</p>${button('reload', 'Försök igen')} <a href="?demo=1">Visa fiktivt exempel</a></section></main>`;
}
