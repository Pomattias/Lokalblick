// Safeguard for the visible v2 guided import. Read-only detection:
// an agreement cell containing multiple IDs never becomes one false ID.
// The correction is held in the preview draft, not written to the workbook.
const text=v=>String(v??'').trim();
const header=v=>text(v).toLocaleLowerCase('sv').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const multi=v=>{
 const value=text(v);
 return /[;,\r\n]/.test(value)&&value.split(/[;,\r\n]/).filter(s=>text(s)).length>1;
};
export function guardMultipleAgreementNumbers(prepared,profiles,XLSX){
 const issues=[],edits={};
 for(const profile of profiles||[]){
  const sheet=prepared.workbook?.Sheets?.[profile.sheetKey||profile.name];
  if(!sheet)continue;
  const columns=(profile.columns||[]).filter(c=>
   /^contracts\.(?:id|number|sourceId)$/.test(c.target)&&
   /^(?:avtalsnummer|avtalsnr|avtalsid|kontraktsnummer|kontraktsnr)$/.test(header(c.header)));
  if(!columns.length)continue;
  const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true});
  for(let i=profile.headerIndex+1;i<matrix.length;i++)for(const column of columns){
   const value=matrix[i]?.[column.index];
   if(!multi(value))continue;
   const row=profile.headerRow+(i-profile.headerIndex),source=profile.fileName||prepared.fileName;
   const edit={source,sheet:profile.name,row,index:column.index,target:column.target,value:''};
   edits[JSON.stringify([source,profile.name,row,column.index,column.target])]=edit;
   issues.push({sheet:profile.name,row,field:column.header,value:text(value),
    message:'Raden innehåller flera avtalsnummer i samma cell. Dela upp dem i flera rader i Excel-filen så kan vi importera dem. Övriga säkra uppgifter påverkas inte.'});
  }
 }
 return {issues,edits};
}
