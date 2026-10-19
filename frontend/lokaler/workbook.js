import { tables, emptyData, idLabels } from './model.js';
const header = field => field.type === 'ref' ? (field.key === 'predecessor_id' ? 'Tidigare ObjektID' : field.key === 'successor_id' ? 'Nytt ObjektID' : field.key === 'owner_party_id' ? 'Fastighetsägare PartID' : field.key === 'tenant_party_id' ? 'Hyresgäst PartID' : idLabels[field.table]) : field.label;
export async function writeWorkbook(data, ExcelJS) {
 const book = new ExcelJS.Workbook();
 book.creator = 'Lokalblick';
 for (const [table, spec] of Object.entries(tables)) {
  const sheet = book.addWorksheet(spec.label);
  sheet.columns = [{ header: idLabels[table], key: 'id', width: 42 }, ...spec.fields.map(f => ({ header: header(f), key: f.key, width: f.type === 'ref' ? 42 : 25 }))];
  for (const record of data[table]) {
   const row = { ...record };
   for (const f of spec.fields) if (f.values && row[f.key] != null) row[f.key] = f.values[row[f.key]];
   sheet.addRow(row);
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF216957' } };
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: spec.fields.length + 1 } };
 }
 return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function readWorkbook(buffer, ExcelJS) {
 const book = new ExcelJS.Workbook();
 await book.xlsx.load(buffer);
 const data = emptyData();
 const knownSheets = new Set(Object.values(tables).map(spec => spec.label));
 if (book.worksheets.some(sheet => !knownSheets.has(sheet.name))) throw Error('Arbetsboken innehåller okända flikar. Använd den nya Lokalblick-mallen; äldre underlag konverteras inte automatiskt.');
 for (const [table, spec] of Object.entries(tables)) {
  const sheet = book.getWorksheet(spec.label);
  if (!sheet) throw Error(`Fliken ${spec.label} saknas. Utgå från en exporterad Lokalblick-arbetsbok.`);
  if (sheet.rowCount > 50001 || sheet.columnCount > 50) throw Error('Arbetsboken är för stor. Högst 50 000 rader per tabell och 50 kolumner.');
  const fields = ['id', ...spec.fields.map(f => f.key)];
  const expected = [idLabels[table], ...spec.fields.map(header)];
  if (sheet.columnCount !== fields.length || expected.some((label, i) => sheet.getRow(1).getCell(i + 1).text !== label)) throw Error(`Kolumnerna i ${spec.label} följer inte Lokalblick-mallen.`);
  sheet.eachRow((row, index) => {
   if (index === 1 || row.values.slice(1).every(value => value == null || value === '')) return;
   const record = {};
   fields.forEach((key, i) => {
    let value = row.getCell(i + 1).value ?? null;
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    if (value !== null && typeof value === 'object') throw Error(`${spec.label}, rad ${index}: formler och komplexa celler stöds inte. Använd värden.`);
    const field = spec.fields.find(f => f.key === key);
    if (field?.values && value != null) value = Object.entries(field.values).find(([, label]) => label === value)?.[0] ?? value;
    if (value != null && !['number', 'integer'].includes(field?.type)) value = String(value);
    record[key] = value;
   });
   data[table].push(record);
  });
 }
 return data;
}
