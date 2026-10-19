import ExcelJS from 'exceljs';
import { readWorkbook as read, writeWorkbook as write } from '../../frontend/lokaler/workbook.js';
export const readWorkbook = bytes => read(bytes, ExcelJS);
export const writeWorkbook = async data => Buffer.from(await write(data, ExcelJS));
