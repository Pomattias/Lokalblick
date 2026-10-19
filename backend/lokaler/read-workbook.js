import { Worker } from 'node:worker_threads';
export function readLocalWorkbook(bytes) {
 if (bytes.length > 15 * 1024 * 1024) throw Error('Excel-filen är för stor. Högst 15 MB. Använd databas för större datamängder.');
 return new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./workbook-worker.mjs', import.meta.url), { workerData: bytes, resourceLimits: { maxOldGenerationSizeMb: 256 } });
  const timer = setTimeout(() => { worker.terminate(); reject(Error('Excel-läsningen tog längre än 30 sekunder och avbröts. Filen har inte ändrats.')); }, 30000);
  const finish = () => { clearTimeout(timer); worker.terminate(); };
  worker.once('message', result => { finish(); result.error ? reject(Error(result.error)) : resolve(result.data); });
  worker.once('error', error => { finish(); reject(Error('Kunde inte läsa Excel-filen: ' + error.message)); });
  worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(Error('Excel-läsningen avbröts. Filen har inte ändrats.')); });
 });
}
