import './vendor/exceljs.min.js';
import { readWorkbook, writeWorkbook } from './workbook.js';
self.onmessage = async event => {
 try {
  const { operation, input } = event.data;
  const result = operation === 'read' ? await readWorkbook(input, self.ExcelJS) : await writeWorkbook(input, self.ExcelJS);
  self.postMessage({ result }, result instanceof Uint8Array ? [result.buffer] : []);
 } catch (error) { self.postMessage({ error: error.message }); }
};
