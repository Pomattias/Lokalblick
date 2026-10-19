import { workspaceKeys } from './view-fields.js';
import { tables, emptyData, idLabels } from './model.js';
import {upgradeData,retiredFields} from './model-revision.js';
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
   for (const f of spec.fields) { if (f.type === 'json' && row[f.key] != null) row[f.key] = JSON.stringify(row[f.key]); if (f.type === 'boolean' && row[f.key] != null) row[f.key] = row[f.key] ? 'Ja' : 'Nej'; }
   sheet.addRow(row);
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF216957' } };
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: spec.fields.length + 1 } };
 }
 const workspace = book.addWorksheet('Arbetsyta'); workspace.addRow(['Nyckel','Del','JSON']);
 for (const [key,value] of Object.entries(data.workspace || {})) { const json = JSON.stringify(value); let start=0,part=0;while(start<json.length){let end=Math.min(start+30000,json.length);if(end<json.length&&/[\uD800-\uDBFF]/.test(json[end-1]))end--;workspace.addRow([key,part++,json.slice(start,end)]);start=end;} }
 return new Uint8Array(await book.xlsx.writeBuffer());
}
export async function readWorkbook(buffer, ExcelJS) {
 const book = new ExcelJS.Workbook();
 await book.xlsx.load(buffer);
 const data = emptyData();
 const knownSheets = new Set([...Object.values(tables).map(spec => spec.label),'Arbetsyta']);
 if (book.worksheets.some(sheet => !knownSheets.has(sheet.name))) throw Error('Arbetsboken innehåller okända flikar. Använd den nya Lokalblick-mallen; äldre underlag konverteras inte automatiskt.');
 for (const [table, spec] of Object.entries(tables)) {
  const sheet = book.getWorksheet(spec.label);
  if (!sheet) throw Error(`Fliken ${spec.label} saknas. Utgå från en exporterad Lokalblick-arbetsbok.`);
  if (sheet.rowCount > 50001 || sheet.columnCount > 50) throw Error('Arbetsboken är för stor. Högst 50 000 rader per tabell och 50 kolumner.');
  const retired=Object.entries(retiredFields[table]||{});
  const fields = ['id', ...spec.fields.map(f => f.key),...retired.map(([key])=>key)];
  const expected = [idLabels[table], ...spec.fields.map(header),...retired.map(([,label])=>label)];
  const headers = sheet.getRow(1).values.slice(1).map(String);
  if (new Set(headers).size !== headers.length || headers.some(h => !expected.includes(h)) || !headers.includes(idLabels[table]) || spec.fields.some(f => f.required && !headers.includes(header(f)))) throw Error(`Kolumnerna i ${spec.label} följer inte Lokalblick-mallen.`);
  sheet.eachRow((row, index) => {
   if (index === 1 || row.values.slice(1).every(value => value == null || value === '')) return;
   const record = {};
   fields.forEach((key, i) => {
    const cellIndex = headers.indexOf(expected[i]);
    let value = cellIndex < 0 ? null : row.getCell(cellIndex + 1).value ?? null;
    if (value instanceof Date) value = value.toISOString().slice(0, 10);
    if (value !== null && typeof value === 'object') throw Error(`${spec.label}, rad ${index}: formler och komplexa celler stöds inte. Använd värden.`);
    const field = spec.fields.find(f => f.key === key);
    if (field?.type === 'json' && value != null) value = JSON.parse(value);
    if (field?.type === 'boolean' && value != null) value = value === 'Ja' || value === true;
    if (field?.values && value != null) value = Object.entries(field.values).find(([, label]) => label === value)?.[0] ?? value;
    if(table==='contacts'&&key==='role')value=({Samordnare:'coordinator','Verksamhetens kontakt':'business'})[value]||value;
    if (value != null && !['number', 'integer', 'coordinate','json','boolean'].includes(field?.type)) value = String(value);
    record[key] = value;
   });
   data[table].push(record);
  });
 }
 const meta = book.getWorksheet('Arbetsyta'), chunks = new Map();
 meta?.eachRow((row,index) => { if(index===1)return; const key=row.getCell(1).text;if(!workspaceKeys.includes(key))throw Error('Okänt arbetsytefält: '+key); const part=row.getCell(2).value; const value=row.getCell(3).value; if(!Number.isInteger(part)||part<0||typeof value!=='string')throw Error('Ogiltig arbetsytemetadata.'); if(!chunks.has(key))chunks.set(key,[]); if(chunks.get(key)[part] != null)throw Error('Dubbel arbetsytedel.'); chunks.get(key)[part]=value; });
 for(const [key,parts] of chunks) data.workspace[key]=JSON.parse(parts.join(''));
 return upgradeData(data);
}
