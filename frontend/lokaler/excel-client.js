import { emptyData, normalize, tables, validateData } from './model.js';
const types = [{ description: 'Lokalblick Excel-arbetsbok', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
async function hash(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join(''); }
function excel(operation, input) {
 return new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./excel-worker.js', import.meta.url), { type: 'module' });
  const timer = setTimeout(() => { worker.terminate(); reject(Error('Excel-arbetet tog längre än 30 sekunder och avbröts. Försök med en mindre arbetsbok eller databasläget.')); }, 30000);
  const finish = () => { clearTimeout(timer); worker.terminate(); };
  worker.onmessage = event => { finish(); event.data.error ? reject(Error(event.data.error)) : resolve(event.data.result); };
  worker.onerror = () => { finish(); reject(Error('Kunde inte starta Excel-läsningen. Kontrollera anslutningen och försök igen.')); };
  worker.postMessage({ operation, input });
 });
}
export class BrowserExcel {
 static supported() { return Boolean(window.showOpenFilePicker && window.showSaveFilePicker && window.isSecureContext); }
 static async connect(create = false, report = () => {}, selectedHandle = null) {
  if (!this.supported()) throw Error('Direkt filanslutning kräver Chrome eller Edge på dator. På andra enheter kan den lokala servern användas.');
  const handle = selectedHandle || (create ? await window.showSaveFilePicker({ suggestedName: 'lokalblick-lokaler.xlsx', types }) : (await window.showOpenFilePicker({ types, multiple: false }))[0]);
  report(create ? 'Skapar lokal Excel-arbetsbok…' : 'Läser och kontrollerar lokal Excel-arbetsbok…');
  if (create) {
   const file = await handle.getFile();
   if (file.size > 0) throw Error('Den valda filen innehåller redan data. Öppna den i stället, eller välj ett nytt filnamn. Ingen fil har skrivits över.');
   const bytes = await excel('write', emptyData());
   if ((await handle.getFile()).size > 0) throw Error('Filen har fått innehåll. Välj ett nytt filnamn; inget har skrivits över.');
   const stream = await handle.createWritable();
   try { await stream.write(bytes); await stream.close(); } catch (error) { await stream.abort().catch(() => {}); throw error; }
  }
  const store = new BrowserExcel(handle);
  await store.reload();
  return store;
 }
 constructor(handle) { this.handle = handle; this.version = 0; this.data = emptyData(); this.fileHash = null; this.busy = false; }
 snapshot() { return { version: this.version, data: this.data, storage: { mode: 'browser-excel', file: this.handle.name } }; }
 async reload() {
  if (this.busy) throw Error('Vänta tills sparningen är klar.');
  const file = await this.handle.getFile();
  if (file.size > 15 * 1024 * 1024) throw Error('Excel-filen är för stor. Högst 15 MB. Använd lokal databas för större filer.');
  const bytes = await file.arrayBuffer();
  const imported = await excel('read', bytes);
  const data = { ...Object.fromEntries(Object.keys(tables).map(table => [table, imported[table].map(row => normalize(table, row))])), workspace: imported.workspace || {} };
  validateData(data);
  this.data = data; this.version++; this.fileHash = await hash(bytes);
  return this.snapshot();
 }
 async replace(data, expectedVersion) {
  if (this.busy || expectedVersion !== this.version) throw Error('Data har ändrats. Läs om före sparning.');
  this.busy = true;
  try { return await this.persist(structuredClone(data)); } finally { this.busy = false; }
 }
 async persist(data) {
   validateData(data);
   const bytes = await excel('write', data);
   const previous = await (await this.handle.getFile()).arrayBuffer();
   if (await hash(previous) !== this.fileHash) throw Error('Excel-filen har ändrats utanför appen. Stäng formuläret och välj Uppdatera; filen har inte skrivits över.');
   if (bytes.byteLength > 15 * 1024 * 1024) throw Error('Arbetsboken har nått storleksgränsen 15 MB. Använd databasläget.');
   const stream = await this.handle.createWritable();
   try { await stream.write(bytes); await stream.close(); } catch (error) { await stream.abort().catch(() => {}); throw error; }
   this.data = data; this.fileHash = await hash(bytes); this.version++;
   return this.snapshot();
 }

 async save(table, record, expectedVersion, create) {
  if (this.busy || expectedVersion !== this.version) throw Error('Uppgifterna har ändrats. Stäng formuläret och uppdatera innan du sparar igen.');
  this.busy = true;
  try {
   const row = normalize(table, record, record.id || `${tables[table].prefix}-${crypto.randomUUID()}`);
   const data = structuredClone(this.data);
   const index = data[table].findIndex(item => item.id === row.id);
   if (index >= 0 && create) throw Error('ID finns redan. Välj ett annat ID.');
   if (index >= 0) data[table][index] = row; else data[table].push(row);
   return await this.persist(data);
  } finally { this.busy = false; }
 }
}
