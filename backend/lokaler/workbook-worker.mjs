import { parentPort, workerData } from 'node:worker_threads';
import { readWorkbook } from './workbook.js';
try { parentPort.postMessage({ data: await readWorkbook(Buffer.from(workerData)) }); }
catch (error) { parentPort.postMessage({ error: error.message }); }
