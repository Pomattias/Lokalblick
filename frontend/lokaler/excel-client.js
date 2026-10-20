import { emptyData, normalize, tables, validateData } from './model.js';
const types = [{ description: 'Lokalblick Excel-arbetsbok', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }];
async function hash(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(value => value.toString(16).padStart(2, '0')).join(''); }
function excel(operation, input) {
 return new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./excel-worker.js', import.meta.url), { type: 'module' });
  let settled = false;
  const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve(result); };
  const timer = setTimeout(() => finish(Error('Excel-arbetet tog längre än 30 sekunder och avbröts. Försök med en mindre arbetsbok eller databasläget.')), 30000);
  worker.onmessage = event => finish(event.data.error ? Error(event.data.error) : null, event.data.result);
  worker.onerror = event => { event.preventDefault?.(); finish(Error('Excel-arbetet kunde inte slutföras. Försök igen.')); };
  worker.onmessageerror = () => finish(Error('Excel-resultatet kunde inte läsas. Försök igen.'));
  try { worker.postMessage({ operation, input }); } catch (error) { finish(error); }
 });
}
async function writeFile(handle, bytes, verify) {
 let stream;
 try { stream = await handle.createWritable({ mode: 'exclusive' }); }
 catch (error) { if (error.name === 'NoModificationAllowedError') throw Error('Excel-filen kan vara låst eller skrivskyddad. Stäng andra redigerare och försök igen.'); throw error; }
 try { await verify(); await stream.write(bytes); await stream.close(); }
 catch (error) { await stream.abort().catch(() => {}); throw error; }
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
   await writeFile(handle, bytes, async () => { if ((await handle.getFile()).size > 0) throw Error('Filen har fått innehåll. Välj ett nytt filnamn; inget har skrivits över.'); });
  }
  const store = new BrowserExcel(handle);
  await store.reload();
  return store;
 }
 constructor(handle) { this.handle = handle; this.version = 0; this.data = emptyData(); this.fileHash = null; this.busy = false; }
 snapshot() { return { version: this.version, data: this.data, storage: { mode: 'browser-excel', file: this.handle.name } }; }
 async #withLock(expectedVersion, operation) {
  if (this.busy) throw Error('En filåtgärd pågår. Vänta tills den är klar.');
  if (expectedVersion !== this.version) throw Error('Uppgifterna har ändrats. Läs om innan du sparar igen.');
  this.busy = true;
  try { return await operation(); } finally { this.busy = false; }
 }
 reload() { return this.#withLock(this.version, async () => {
  const file = await this.handle.getFile();
  if (file.size > 15 * 1024 * 1024) throw Error('Excel-filen är för stor. Högst 15 MB. Använd lokal databas för större filer.');
  const bytes = await file.arrayBuffer();
  const imported = await excel('read', bytes);
  const data = { ...Object.fromEntries(Object.keys(tables).map(table => [table, imported[table].map(row => normalize(table, row))])), workspace: imported.workspace || {} };
  validateData(data);
  const fileHash = await hash(bytes);
  this.data = data; this.version++; this.fileHash = fileHash;
  return this.snapshot();
 }); }
 replace(data, expectedVersion) { return this.#withLock(expectedVersion, () => this.#persist(structuredClone(data))); }
 async #persist(data) {
   validateData(data);
   const bytes = await excel('write', data);
   if (bytes.byteLength > 15 * 1024 * 1024) throw Error('Arbetsboken har nått storleksgränsen 15 MB. Använd databasläget.');
   const fileHash = await hash(bytes);
   await writeFile(this.handle, bytes, async () => {
    const previous = await (await this.handle.getFile()).arrayBuffer();
    if (await hash(previous) !== this.fileHash) throw Error('Excel-filen har ändrats utanför appen. Stäng formuläret och välj Uppdatera; filen har inte skrivits över.');
   });
   this.data = data; this.fileHash = fileHash; this.version++;
   return this.snapshot();
 }

 save(table, record, expectedVersion, create) { return this.#withLock(expectedVersion, async () => {
   if(table==='agreements'&&!record.id)throw Error('Ange AvtalsID (avtalsnumret).');
   const row = normalize(table, record, record.id || `${tables[table].prefix}-${crypto.randomUUID()}`);
   const data = structuredClone(this.data);
   const index = data[table].findIndex(item => item.id === row.id);
   if (index >= 0 && create) throw Error('ID finns redan. Välj ett annat ID.');
   if (index >= 0) data[table][index] = row; else data[table].push(row);
   return this.#persist(data);
 }); }
}
