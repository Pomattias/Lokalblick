// Corrections belong to the review draft. Never change the source workbook/file.
export const importCellKey=(profile,row,column,source='Excel')=>JSON.stringify([profile.fileName||source,profile.name,row,column.index,column.target]);
export function editedImportWorkbook(workbook,profiles,edits={},fileName='Excel',XLSX){
 let out=workbook;const copied=new Set();
 for(const edit of Object.values(edits)){
  const profile=profiles.find(p=>(p.fileName||fileName)===edit.source&&p.name===edit.sheet),column=profile?.columns.find(c=>c.index===edit.index&&c.target===edit.target&&!c.target.startsWith('@'));
  if(!column||!Number.isSafeInteger(edit.row)||edit.row<(profile.dataStartRow??profile.headerRow)+1||!['string','number','boolean'].includes(typeof edit.value))continue;
  const name=profile.sheetKey||profile.name,sheet=workbook.Sheets[name];if(!sheet)continue;
  if(out===workbook)out={...workbook,Sheets:{...workbook.Sheets}};
  if(!copied.has(name)){out.Sheets[name]={...sheet};copied.add(name);}
  const address=XLSX.utils.encode_cell({r:edit.row-1,c:(profile.startColumn||0)+column.index});
  out.Sheets[name][address]={t:typeof edit.value==='number'?'n':typeof edit.value==='boolean'?'b':'s',v:edit.value,__importEdit:{originalValue:sheet[address]?.v??''}};
 }
 return out;
}
