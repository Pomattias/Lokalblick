import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, open, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import path from 'node:path';
import { tables, normalize, emptyData, validateData } from '../../frontend/lokaler/model.js';
import { writeWorkbook } from './workbook.js';
import { readLocalWorkbook } from './read-workbook.js';
import {upgradeData} from '../../frontend/lokaler/model-revision.js';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
const keys = Object.keys(tables);
export class ConflictError extends Error { constructor(message) { super(message); this.status = 409; } }
export class LocalStore {
 static async open({ file, mode = 'sqlite' }) {
  if (!['sqlite', 'excel'].includes(mode)) throw Error('Lagring måste vara sqlite eller excel.');
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const lockPath = file + '.lock';
  let lock;
  try { lock = await open(lockPath, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') throw Error('Datafilen används redan, eller har en kvarvarande .lock-fil efter en avbruten körning. Stäng andra appinstanser innan låset tas bort.'); throw error; }
  let store;
  try {
   await lock.writeFile(String(process.pid));
   const db = new DatabaseSync(mode === 'excel' ? ':memory:' : file);
   store = new LocalStore(db, file, mode, lock, lockPath);
   if (mode === 'sqlite') {
    const appId = db.prepare('PRAGMA application_id').get().application_id;
    const populated = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().count;
    if ((appId !== 0 && appId !== 0x4c4b4c32) || (populated && appId !== 0x4c4b4c32)) throw Error('Filen är inte den nya Lokalblick-databasen. Välj en ny tom fil; äldre databaser konverteras inte.');
   }
   const oldColumns=db.prepare('PRAGMA table_info(agreements)').all();
   const upgrading=oldColumns.some(column=>['number','annual_rent','annual_additions'].includes(column.name));
   let upgraded;
   if(upgrading){
    const data={...Object.fromEntries(keys.map(table=>[table,(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)?db.prepare('SELECT * FROM '+table).all():[]).map(row=>{
     for(const f of tables[table].fields)if(row[f.key]!=null){if(f.type==='json')row[f.key]=JSON.parse(row[f.key]);if(f.type==='boolean')row[f.key]=Boolean(row[f.key]);}return row;
    })])),workspace:Object.fromEntries(db.prepare('SELECT key,value FROM workspace').all().map(row=>[row.key,JSON.parse(row.value)]))};
    upgraded=upgradeData(data);
    // Validate first, then keep an independent SQLite backup before rebuilding.
    if(mode==='sqlite')db.prepare('VACUUM INTO ?').run(file+'.before-simplify-'+randomUUID()+'.sqlite');
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
    for(const table of [...keys].reverse())db.exec('DROP TABLE IF EXISTS '+table);
    db.exec('DROP TABLE workspace');
   }
   db.exec(schema);
   for (const [table, spec] of Object.entries(tables)) {
    const existing = new Set(db.prepare('PRAGMA table_info(' + table + ')').all().map(row => row.name));
    for (const f of spec.fields) if (!existing.has(f.key)) {
     const type = ['number','coordinate','signed'].includes(f.type) ? 'REAL' : ['integer','boolean'].includes(f.type) ? 'INTEGER' : 'TEXT';
     db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + f.key + ' ' + type + (f.type === 'ref' ? ' REFERENCES ' + f.table + '(id)' : ''));
    }
   }
   db.exec("CREATE UNIQUE INDEX IF NOT EXISTS parties_organization_number ON parties(organization_number) WHERE organization_number IS NOT NULL; CREATE UNIQUE INDEX IF NOT EXISTS evidence_annual ON cost_evidence(cost_id,year) WHERE type='annual'; CREATE UNIQUE INDEX IF NOT EXISTS evidence_invoice ON cost_evidence(cost_id,invoice_reference) WHERE type='invoice';");
   if (mode === 'sqlite') db.exec('PRAGMA application_id = 0x4c4b4c32');
   db.exec('CREATE TABLE IF NOT EXISTS store_meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL) STRICT; INSERT OR IGNORE INTO store_meta VALUES (1,0);');
   if(upgraded){
    for(const table of keys)for(const record of upgraded[table])store.insert(table,record);
    store.setWorkspace(upgraded.workspace);store.validateGraph();
    db.exec('UPDATE store_meta SET version=version+1 WHERE id=1; COMMIT; PRAGMA foreign_keys=ON;');
   }
   if (mode === 'sqlite') {
    await chmod(file, 0o600);
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
   } else {
    let bytes;
    try { bytes = await readFile(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (bytes) {
     const data = await readLocalWorkbook(bytes);
     db.exec('BEGIN');
     try {
      for (const table of keys) for (const record of data[table]) store.insert(table, normalize(table, record));
      store.setWorkspace(data.workspace || {});
      store.validateGraph();
      db.exec('COMMIT');
     } catch (error) { db.exec('ROLLBACK'); throw error; }
     store.fileHash = digest(bytes);
    } else {
     const initial = await writeWorkbook(emptyData());
     await writeFile(file, initial, { mode: 0o600, flag: 'wx' });
     store.fileHash = digest(initial);
    }
   }
   store.validateGraph();
   return store;
  } catch (error) {
   if (store) store.db.close();
   await lock.close();
   await unlink(lockPath).catch(() => {});
   throw error;
  }
 }
 constructor(db, file, mode, lock, lockPath) {
  Object.assign(this, { db, file, mode, lock, lockPath, fileHash: null });
  this.queue = Promise.resolve();
 }
 async readSnapshot() { await this.queue; return this.snapshot(); }
 snapshot() {
  return { version: this.db.prepare('SELECT version FROM store_meta WHERE id=1').get().version,
   storage: { mode: this.mode, file: path.basename(this.file) },
   data: { ...Object.fromEntries(keys.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all().map(row => { for (const f of tables[table].fields) if (row[f.key] != null) { if (f.type === 'json') row[f.key] = JSON.parse(row[f.key]); if (f.type === 'boolean') row[f.key] = Boolean(row[f.key]); } return row; })])), workspace: Object.fromEntries(this.db.prepare('SELECT key,value FROM workspace').all().map(row => [row.key,JSON.parse(row.value)])) } };
 }
 insert(table, row) {
  const fields = ['id', ...tables[table].fields.map(f => f.key)];
  this.db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...fields.map(key => this.encode(table, key, row[key])));
 }
 encode(table, key, value) { const f = tables[table].fields.find(f => f.key === key); return value == null ? null : f?.type === 'json' ? JSON.stringify(value) : f?.type === 'boolean' ? Number(value) : value; }
 setWorkspace(workspace) { this.db.exec('DELETE FROM workspace'); const insert = this.db.prepare('INSERT INTO workspace VALUES (?,?)'); for (const [key,value] of Object.entries(workspace)) insert.run(key,JSON.stringify(value)); }
 replace(input, expectedVersion) {
  const work = this.queue.then(async () => {
   if (expectedVersion !== this.snapshot().version) throw new ConflictError('Data har ändrats. Läs om före sparning.');
   const data = { ...Object.fromEntries(keys.map(table => [table,(input[table] || []).map(row => normalize(table,row))])), workspace: input.workspace || {} };
   validateData(data);
   this.db.exec('BEGIN IMMEDIATE');
   try {
    for (const table of [...keys].reverse()) this.db.exec('DELETE FROM ' + table);
    for (const table of keys) for (const record of data[table]) this.insert(table,record);
    this.setWorkspace(data.workspace);
    this.db.exec('UPDATE store_meta SET version=version+1 WHERE id=1');
    if (this.mode === 'excel') await this.persistWorkbook();
    this.db.exec('COMMIT'); return this.snapshot();
   } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  });
  this.queue = work.catch(() => {}); return work;
 }
 validateGraph() { validateData(this.snapshot().data); }

 mutate(operations, expectedVersion) {
  const work = this.queue.then(() => this.apply(operations, expectedVersion));
  this.queue = work.catch(() => {});
  return work;
 }
 async apply(operations, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== this.snapshot().version) throw new ConflictError('Data har ändrats. Uppdatera sidan innan du sparar igen.');
  if (!Array.isArray(operations) || !operations.length || operations.length > 1000) throw Error('Ange 1–1000 ändringar.');
  this.db.exec('BEGIN IMMEDIATE');
  try {
   for (const operation of operations) {
    const { table, record, action = 'save' } = operation;
    if (!Object.hasOwn(tables, table) || action !== 'save' || !record || typeof record !== 'object' || Array.isArray(record)) throw Error('Ogiltig ändring.');
    if(table==='agreements'&&!record.id)throw Error('Ange AvtalsID (avtalsnumret).');
    const row = normalize(table, record, record.id || `${tables[table].prefix}-${randomUUID()}`);
    const existing = this.db.prepare(`SELECT id FROM ${table} WHERE id=?`).get(row.id);
    if (existing && operation.create) throw new ConflictError('ID finns redan. Välj det befintliga registret eller ett annat ID.');
    if (existing) {
     const fields = tables[table].fields.map(f => f.key);
     this.db.prepare(`UPDATE ${table} SET ${fields.map(key => key + '=?').join(',')} WHERE id=?`).run(...fields.map(key => this.encode(table, key, row[key])), row.id);
    } else this.insert(table, row);
   }
   this.validateGraph();
   this.db.exec('UPDATE store_meta SET version=version+1 WHERE id=1');
   if (this.mode === 'excel') await this.persistWorkbook();
   this.db.exec('COMMIT');
   return this.snapshot();
  } catch (error) {
   this.db.exec('ROLLBACK');
   if (/FOREIGN KEY constraint failed/.test(error.message)) throw Error('En hänvisning saknar motsvarande post. Skapa fastighet, objekt, part eller person först.');
   throw error;
  }
 }
 async persistWorkbook() {
  const previous = await readFile(this.file);
  if (digest(previous) !== this.fileHash) throw new ConflictError('Excel-filen har ändrats utanför appen. Starta om appen för att läsa in filen; dina ändringar har inte skrivits över.');
  const bytes = await writeWorkbook(this.snapshot().data);
  const temporary = this.file + '.' + randomUUID() + '.tmp';
  try {
   await writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
   await writeFile(this.file + '.bak', previous, { mode: 0o600 });
   // Recheck after encoding, before replacing the local workbook.
   if (digest(await readFile(this.file)) !== this.fileHash) throw new ConflictError('Excel-filen ändrades medan du sparade. Starta om appen för att läsa den.');
   await rename(temporary, this.file);
   this.fileHash = digest(bytes);
  } finally { await unlink(temporary).catch(() => {}); }
 }
 async close() {
  await this.queue;
  this.db.close();
  await this.lock.close();
  await unlink(this.lockPath);
 }
}
