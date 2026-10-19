import { workspaceKeys } from './view-fields.js';
// One model is used by the local SQL store, Excel store and user interface.
export const roles = { owner: 'Fastighetsägarens kontakt', coordinator: 'Vår ansvarige', tenant: 'Hyresgästens kontakt' };
export const statuses = { open: 'Öppet', ongoing: 'Pågår', done: 'Klart', draft: 'Utkast', ordered: 'Beställd' };
export const priorities = { low: 'Låg', normal: 'Normal', high: 'Hög' };
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
export const tables = {
 parties: { label: 'Parter', singular: 'Part', prefix: 'PAR', fields: [field('name', 'Namn', 'text', { required: true })] },
 people: { label: 'Personer', singular: 'Person', prefix: 'PER', fields: [field('name', 'Namn', 'text', { required: true }), field('email', 'E-post', 'email'), field('phone', 'Telefon', 'tel')] },
 properties: { label: 'Fastigheter', singular: 'Fastighet', prefix: 'FAS', fields: [field('name', 'Fastighetsnamn', 'text', { required: true }), field('popular_name', 'Populärnamn'), field('address', 'Adress'), field('owner_party_id', 'Fastighetsägare', 'ref', { table: 'parties' })] },
 objects: { label: 'Objekt', singular: 'Objekt', prefix: 'OBJ', fields: [field('property_id', 'Fastighet', 'ref', { table: 'properties', required: true }), field('area', 'Yta, m²', 'number'), field('apartment_count', 'Antal lägenheter', 'integer'), field('valid_from', 'Giltigt fr.o.m.', 'date'), field('valid_to', 'Giltigt t.o.m.', 'date')] },
 agreements: { label: 'Avtal', singular: 'Avtal', prefix: 'AVT', fields: [field('object_id', 'Objekt', 'ref', { table: 'objects', required: true }), field('tenant_party_id', 'Hyresgäst', 'ref', { table: 'parties' }), field('annual_rent', 'Årshyra, kr', 'number'), field('valid_from', 'Hyrestid fr.o.m.', 'date'), field('valid_to', 'Hyrestid t.o.m.', 'date'), field('terminated_on', 'Uppsagd den', 'date'), field('termination_reason', 'Uppsägningsorsak'), field('usage', 'Användning'), field('business', 'Verksamhet', 'textarea'), field('workplace_count', 'Antal arbetsplatser', 'integer'), field('hub_count', 'Antal hubbplatser', 'integer'), field('eb_category', 'Lokalkategori (EB)'), field('main_contract_url', 'Länk huvudkontrakt', 'url')] },
 issues: { label: 'Ärenden', singular: 'Ärende', prefix: 'ARE', fields: [field('title', 'Namn', 'text', { required: true }), field('description', 'Beskrivning', 'textarea'), field('property_id', 'Fastighet', 'ref', { table: 'properties' }), field('object_id', 'Objekt', 'ref', { table: 'objects' }), field('status', 'Status', 'select', { values: { open: 'Öppet', ongoing: 'Pågår', done: 'Klart' }, default: 'open' }), field('priority', 'Prioritet', 'select', { values: priorities, default: 'normal' }), field('estimated_cost', 'Beräknad kostnad, kr', 'number'), field('planned_from', 'Tidplan fr.o.m.', 'date'), field('planned_to', 'Tidplan t.o.m.', 'date'), field('notes', 'Noteringar', 'textarea')] },
 orders: { label: 'Beställningar', singular: 'Beställning', prefix: 'BES', fields: [field('issue_id', 'Ärende', 'ref', { table: 'issues', required: true }), field('title', 'Namn', 'text', { required: true }), field('amount', 'Belopp, kr', 'number'), field('status', 'Status', 'select', { values: { draft: 'Utkast', ordered: 'Beställd', done: 'Klart' }, default: 'draft' })] },
 contacts: { label: 'Personkopplingar', singular: 'Personkoppling', prefix: 'KOP', fields: [field('person_id', 'Person', 'ref', { table: 'people', required: true }), field('role', 'Roll', 'select', { values: roles, required: true }), field('property_id', 'Fastighet', 'ref', { table: 'properties' }), field('agreement_id', 'Avtal', 'ref', { table: 'agreements' }), field('issue_id', 'Ärende', 'ref', { table: 'issues' }), field('order_id', 'Beställning', 'ref', { table: 'orders' }), field('valid_from', 'Giltigt fr.o.m.', 'date'), field('valid_to', 'Giltigt t.o.m.', 'date')] },
 object_links: { label: 'Objektförändringar', singular: 'Objektförändring', prefix: 'AND', fields: [field('predecessor_id', 'Tidigare objekt', 'ref', { table: 'objects', required: true }), field('successor_id', 'Nytt objekt', 'ref', { table: 'objects', required: true })] }
};
// Explicit additions preserve the existing overview, map and financial terms.
const additions = {
 parties: [['kind','Typ'],['owner_class','Ägarklass']],
 people: [['party_id','Part','ref',{table:'parties'}],['job_title','Befattning']],
 properties: [['city','Ort'],['latitude','Latitud','coordinate'],['longitude','Longitud','coordinate']],
 objects: [['apartment_area','Lägenhetsyta, m²','number'],['common_area','Gemensam yta, m²','number'],['category','Objektkategori']],
 agreements: [['annual_additions','Bastillägg, kr/år','number'],['annual_property_tax','Fastighetsskatt, kr/år','number'],['rent_base_year','Hyra basår','integer'],['rent_base_index','Hyra bastal KPI','number'],['rent_index_percent','Hyra indexandel, %','number'],['rent_adjustment_method','Hyra justeringsregel'],['rent_annual_percent','Hyra årlig uppräkning, %','number'],['rent_min_percent','Hyra minsta uppräkning, %','number'],['rent_max_percent','Hyra högsta uppräkning, %','number'],['rent_limit_basis','Hyra min/max gäller'],['addition_base_year','Tillägg basår','integer'],['addition_base_index','Tillägg bastal KPI','number'],['addition_index_percent','Tillägg indexandel, %','number'],['addition_adjustment_method','Tillägg justeringsregel'],['addition_annual_percent','Tillägg årlig uppräkning, %','number'],['addition_min_percent','Tillägg minsta uppräkning, %','number'],['addition_max_percent','Tillägg högsta uppräkning, %','number'],['addition_limit_basis','Tillägg min/max gäller'],['notice_months','Uppsägningstid, månader','integer'],['renewal_months','Förlängningstid, månader','integer'],['notice_by','Säg upp senast','date'],['move_in','Inflyttning','date'],['move_out','Utflyttning','date'],['comment','Kommentar']],
 issues: [['kind','Typ'],['category','Kategori'],['final_cost','Slutkostnad','number'],['ordered_cost','Beställd kostnad','number'],['planning_year','Planeringsår','integer'],['planning_quarter','Planeringskvartal','integer'],['planning_month','Planeringsmånad','integer'],['include_in_budget','Ingår i budget'],['budget_category','Budgetkategori'],['value_increasing','Värdehöjande','boolean'],['journal','Journal','json']],
 orders: [['ordered_by','Beställd av','ref',{table:'people'}],['ordered_at','Beställd datum','date'],['final_cost','Slutkostnad','number'],['supplier','Leverantör']]
};
additions.parties.push(['investment_rule','Investeringsregel'],['investment_threshold','Investeringsgräns, kr','number'],['rent_surcharge_rate','Hyrespåslag, %','number']);
additions.issues.push(['action_kind','Åtgärdens karaktär'],['standard_enhancing','Standardhöjande','boolean'],['rent_surcharge_start','Hyrespåslag från','date'],['unit_id','Organisatorisk tillhörighet']);
additions.orders.push(['reference','Beställningsreferens'],['delivery','Leverans'],['completed_at','Utförd','date'],['payment_status','Betalstatus'],['paid_at','Betald','date'],['invoice_comment','Fakturakommentar'],['owner_pays','Betalas av fastighetsägaren']);
additions.contacts = [['cancelled','Makulerad','boolean',{default:false}]];
for (const [table, fields] of Object.entries(additions)) tables[table].fields.push(...fields.map(args => field(...args)));
export const idLabels = { parties: 'PartID', people: 'PersonID', properties: 'FastighetsID', objects: 'ObjektID', agreements: 'AvtalsID', issues: 'ÄrendeID', orders: 'BeställningsID', contacts: 'KopplingsID', object_links: 'FörändringsID' };
export const emptyData = () => ({ ...Object.fromEntries(Object.keys(tables).map(key => [key, []])), workspace: {} });
export const today = () => new Date().toLocaleDateString('sv-SE');
export const active = (row, date = today()) => !row.cancelled && (!row.valid_from || row.valid_from <= date) && (!row.valid_to || row.valid_to >= date);
export const find = (data, table, id) => data[table]?.find(row => row.id === id);
export const title = (row) => row?.name || row?.title || row?.number || row?.id || '–';
export const propertyId = (data, table, row) => {
 if (!row) return null;
 if (table === 'properties') return row.id;
 if (row.property_id) return row.property_id;
 if (row.object_id) return find(data, 'objects', row.object_id)?.property_id;
 if (row.issue_id) return propertyId(data, 'issues', find(data, 'issues', row.issue_id));
 if (row.agreement_id) return propertyId(data, 'agreements', find(data, 'agreements', row.agreement_id));
 return null;
};
const targetKey = { properties: 'property_id', agreements: 'agreement_id', issues: 'issue_id', orders: 'order_id' };
export const directContacts = (data, table, id, date = today()) => data.contacts.filter(row => row[targetKey[table]] === id && active(row, date));
export function coordinator(data, table, row, date = today(), visited = new Set()) {
 if (!row || visited.has(`${table}:${row.id}`)) return null;
 visited.add(`${table}:${row.id}`);
 const link = directContacts(data, table, row.id, date).find(item => item.role === 'coordinator');
 if (link) return { person: find(data, 'people', link.person_id), link, inherited: false, via: table };
 if (table === 'orders') {
  const inherited = coordinator(data, 'issues', find(data, 'issues', row.issue_id), date, visited);
  return inherited ? { ...inherited, inherited: true } : null;
 }
 if (table !== 'properties') {
  const inherited = coordinator(data, 'properties', find(data, 'properties', propertyId(data, table, row)), date, visited);
  return inherited ? { ...inherited, inherited: true } : null;
 }
 return null;
}
export function propertySummary(data, id, date = today()) {
 const objects = data.objects.filter(row => row.property_id === id && active(row, date));
 const ids = new Set(objects.map(row => row.id));
 const agreements = data.agreements.filter(row => ids.has(row.object_id) && active(row, date));
 return { objects, agreements,
  area: objects.reduce((sum, row) => sum + (row.area ?? 0), 0), missingArea: objects.filter(row => row.area == null).length,
  apartments: objects.reduce((sum, row) => sum + (row.apartment_count ?? 0), 0),
  annualRent: agreements.reduce((sum, row) => sum + (row.annual_rent ?? 0), 0),
  openIssues: data.issues.filter(row => propertyId(data, 'issues', row) === id && row.status !== 'done') };
}
export function normalize(table, input, id) {
 const spec = tables[table];
 if (!spec) throw Error('Okänd tabell.');
 const allowed = new Set(['id', ...spec.fields.map(field => field.key)]);
 for (const key of Object.keys(input)) if (!allowed.has(key)) throw Error(`Fältet ${key} finns inte i ${spec.label}.`);
 const output = { id: id || input.id };
 if (typeof output.id !== 'string' || !/^[^\u0000-\u001f\u007f]{1,100}$/u.test(output.id)) throw Error('ID måste vara 1–100 tecken utan kontrolltecken.');
 for (const f of spec.fields) {
  let value = input[f.key] ?? f.default ?? null;
  if (typeof value === 'string') value = value.trim() || null;
  if (f.required && value == null) throw Error(`${f.label} måste fyllas i.`);
  if (value != null) {
   if (f.type === 'json') {
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { throw Error(f.label + ' måste vara giltig JSON.'); } }
    if (!Array.isArray(value)) throw Error(f.label + ' måste vara en lista.');
   } else if (f.type === 'boolean') { value = value === true || value === 1 || value === 'Ja';
   } else if (['number', 'integer', 'coordinate'].includes(f.type)) {
    if (typeof value === 'string') value = Number(value.replace(/\s/g, '').replace(',', '.'));
    if (typeof value !== 'number' || !Number.isFinite(value) || (f.type !== 'coordinate' && value < 0) || (f.type === 'integer' && !Number.isInteger(value))) throw Error(`${f.label} måste vara ett positivt tal eller noll.`);
   } else {
    if (typeof value !== 'string' || value.length > 20000) throw Error(`${f.label} måste vara text, högst 20 000 tecken.`);
    if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)) throw Error(`${f.label} måste vara ett giltigt datum.`);
    if (f.type === 'select' && !Object.hasOwn(f.values, value)) throw Error(`Ogiltigt värde för ${f.label}.`);
    if (f.type === 'url' && !/^https?:\/\//i.test(value)) throw Error(`${f.label} måste börja med https:// eller http://.`);
   }
  }
  output[f.key] = value;
 }
 if (table === 'properties' && (output.latitude != null && Math.abs(output.latitude) > 90 || output.longitude != null && Math.abs(output.longitude) > 180)) throw Error('Ogiltiga koordinater.');
 if (output.valid_from && output.valid_to && output.valid_from > output.valid_to) throw Error('Slutdatum kan inte vara före startdatum.');
 if (output.planned_from && output.planned_to && output.planned_from > output.planned_to) throw Error('Tidplanens slutdatum kan inte vara före startdatum.');
 if (table === 'issues' && ['property_id', 'object_id'].filter(key => output[key]).length !== 1) throw Error('Välj antingen Fastighet eller Objekt för ärendet.');
 if (table === 'contacts') {
  if (['property_id', 'agreement_id', 'issue_id', 'order_id'].filter(key => output[key]).length !== 1) throw Error('Välj exakt en koppling för personen.');
  if (output.role === 'owner' && !output.property_id) throw Error('Fastighetsägarens kontakt kopplas till fastigheten.');
  if (output.role === 'tenant' && !output.agreement_id) throw Error('Hyresgästens kontakt kopplas till avtalet.');
 }
 return output;
}

// Shared validation for SQL and browser Excel. Derived values are never stored.
export function validateData(data) {
 for (const key of Object.keys(data.workspace || {})) if (!workspaceKeys.includes(key)) throw Error('Okänt arbetsytefält: ' + key);
 const indexes = {};
 for (const [table, spec] of Object.entries(tables)) {
  if (!Array.isArray(data[table])) throw Error(`Tabellen ${spec.label} saknas.`);
  indexes[table] = new Map();
  for (const row of data[table]) {
   normalize(table, row);
   if (indexes[table].has(row.id)) throw Error(`${spec.label}: ID ${row.id} finns flera gånger.`);
   indexes[table].set(row.id, row);
  }
 }
 for (const [table, spec] of Object.entries(tables)) for (const record of data[table]) {
  for (const f of spec.fields) if (f.type === 'ref' && record[f.key] != null && !indexes[f.table].has(record[f.key])) throw Error(`${spec.label}: ${f.label} hänvisar till ett ID som saknas (${record[f.key]}).`);
 }
 const unique = (rows, key, label) => {
  const values = new Set();
  for (const row of rows) {
   const value = key(row); if (value == null) continue;
   if (values.has(value)) throw Error(`${label} finns flera gånger.`);
   values.add(value);
  }
 };
 unique(data.parties, row => row.name.toLocaleLowerCase('sv'), 'Partens namn');
 unique(data.people, row => row.email?.toLocaleLowerCase('sv'), 'E-postadressen');
 unique(data.object_links, row => JSON.stringify([row.predecessor_id, row.successor_id]), 'Objektförändringen');
 const periods = (rows, grouping, message) => {
  const groups = new Map();
  for (const row of rows) { const key = grouping(row); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  for (const group of groups.values()) {
   group.sort((a, b) => (a.valid_from || '').localeCompare(b.valid_from || ''));
   for (let i = 1; i < group.length; i++) if ((group[i].valid_from || '') <= (group[i - 1].valid_to || '9999-12-31')) throw Error(message);
  }
 };
 periods(data.agreements, row => row.object_id, 'Objektet har redan ett avtal under perioden.');
 periods(data.contacts.filter(row=>!row.cancelled), row => JSON.stringify([row.role, row.property_id, row.agreement_id, row.issue_id, row.order_id, row.role === 'coordinator' ? null : row.person_id]), 'Personkopplingen överlappar en befintlig koppling. Avsluta den tidigare perioden först.');
 for (const agreement of data.agreements) {
  const object = indexes.objects.get(agreement.object_id);
  if (object.valid_from && (!agreement.valid_from || agreement.valid_from < object.valid_from) || object.valid_to && (!agreement.valid_to || agreement.valid_to > object.valid_to)) throw Error('Avtalets period måste rymmas inom objektets giltighetstid.');
 }
 for (const change of data.object_links) {
  const before = indexes.objects.get(change.predecessor_id), after = indexes.objects.get(change.successor_id);
  if (before.id === after.id) throw Error('Ett objekt kan inte ersätta sig självt.');
  if (before.property_id !== after.property_id) throw Error('Delade eller sammanslagna objekt måste tillhöra samma fastighet.');
  if (!before.valid_to || !after.valid_from || before.valid_to >= after.valid_from) throw Error('Tidigare objekt måste ha slutdatum före det nya objektets startdatum.');
 }
 return data;
}
