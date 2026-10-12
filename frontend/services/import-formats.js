// Conservative local interpretation. Identity columns never become numbers or dates.
export const dateField=field=>/^(start|end|.*Date|orderedAt|paidAt|completedAt)$/.test(field);
export const numberField=field=>/^(area|baseRent|baseAdditions|annual|employees|users|rooms|commonArea|apartmentArea|latitude|longitude|estimatedCost|orderedCost|finalCost|planningYear|planningQuarter|planningMonth|budgetYear|budgetInvestigation|budgetExecution|budgetFurnishing|preliminaryCost|investmentThreshold|rentSurchargeRate|cost|year|period|actual|budget|allocation|noticePeriod|renewalPeriod|rentBase|additionBase|rentIndexPercent|additionIndexPercent)/.test(field);
const identityField=field=>/^(id|.*Id|number|orderReference|phone|email|ekotObject|costCenter.*)$/.test(field);
const currencyField=field=>/^(baseRent|baseAdditions|annual.*|estimatedCost|orderedCost|finalCost|investmentThreshold|cost|preliminaryCost|budget|budgetInvestigation|budgetExecution|budgetFurnishing|actual)$/.test(field);
const currencyHint=text=>/\b(?:kr|sek|tkr|mkr)\b|hyra|kostnad|belopp/i.test(text);
const moneyScale=(value,header)=>typeof value==='string'&&/kr|sek|kronor/i.test(value)?1:/\bmkr\b/i.test(header)?1000000:/\btkr\b|tusen\s*(?:kr|kronor)/i.test(header)?1000:1;
export function parseNumber(value) {
 if(typeof value==='number'&&Number.isFinite(value))return value;
 let s=String(value??'').trim(),negative=false;
 if(/^\(.*\)$/.test(s)){negative=true;s=s.slice(1,-1);}
 s=s.replace(/\u2212/g,'-').replace(/\s|\u00a0/g,'');
 const scale=/mkr(?:\/(?:år|ar|mån|man))?$/i.test(s)?1000000:/tkr(?:\/(?:år|ar|mån|man))?$/i.test(s)?1000:1;
 s=s.replace(/(?:SEK|mkr|tkr|kr|kronor|%|månader|mån|manader|man)(?:\/(?:år|ar|mån|man))?$/i,'');
 if(/-$/.test(s)){negative=true;s=s.slice(0,-1);}
 if(!/^[+-]?\d[\d.,]*$/.test(s))throw Error('Ogiltigt tal');
 if(s.includes(',')&&s.includes('.')){const decimal=s.lastIndexOf(',')>s.lastIndexOf('.')?',':'.';s=s.split(decimal===','?'.':',').join('').replace(decimal,'.');}
 else if(s.includes(',')){if((s.match(/,/g)||[]).length>1){if(!/^[+-]?\d{1,3}(,\d{3})+$/.test(s))throw Error('Ogiltigt tal');s=s.replace(/,/g,'');}else s=s.replace(',','.');}
 else if((s.match(/\./g)||[]).length>1){if(!/^[+-]?\d{1,3}(\.\d{3})+$/.test(s))throw Error('Ogiltigt tal');s=s.replace(/\./g,'');}
 const n=Number(s)*scale;if(!Number.isFinite(n))throw Error('Ogiltigt tal');return negative?-Math.abs(n):n;
}
function iso(y,m,d){const dt=new Date(Date.UTC(y,m-1,d));if(y<1900||y>2200||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)throw Error('Ogiltigt datum');return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
export function parseDate(value,XLSX,date1904=false) {
 if(value instanceof Date)return iso(value.getUTCFullYear(),value.getUTCMonth()+1,value.getUTCDate());
 if(typeof value==='number'){const d=XLSX.SSF.parse_date_code(value,{date1904});if(!d)throw Error('Ogiltigt datum');return iso(d.y,d.m,d.d);}
 const s=String(value??'').trim();let match=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T]00:00(?::00)?(?:\.000)?Z?)?$/);
 if(match)return iso(+match[1],+match[2],+match[3]);
 match=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(match)return iso(+match[3],+match[2],+match[1]);
 if(/^\d{8}$/.test(s))return iso(+s.slice(0,4),+s.slice(4,6),+s.slice(6,8));
 throw Error('Ogiltigt eller tvetydigt datum');
}
export function interpretCell(cell,column,XLSX) {
 let value=cell?.v??'',field=column.target?.split('.')[1]||'';
 if(/DocumentUrl$/.test(field))return cell?.l?.Target||value;
 if(column.transform==='text'||identityField(field))return typeof value==='number'&&/^0{2,}$/.test(cell.z||'')?XLSX.utils.format_cell({...cell,t:cell.t||'n'}):String(value);
 if(!field){if(column.format?.type==='date')return parseDate(value,XLSX,column.date1904);if(['currency','number'].includes(column.format?.type))return parseNumber(value)*(column.format.type==='currency'?moneyScale(value,column.header||''):1);return String(value);}
 if(dateField(field))return parseDate(value,XLSX,column.date1904);
 if(numberField(field)){
  const header=column.header||'';const n=parseNumber(value);
  let multiplier=moneyScale(value,header);
  if(column.transform==='thousands')multiplier=1000;
  if(currencyField(field)&&(column.transform==='monthly'||/månadshyra|manadshyra|kr\s*\/\s*mån/i.test(header)))multiplier*=12;
  if(/Percent$|^rentSurchargeRate$/.test(field)&&typeof value==='number'&&cell.z?.includes('%'))return n*100;
  return n*multiplier;
 }
 return String(value);
}
export function profileFormat(cells,column,XLSX) {
 const field=column.target?.split('.')[1]||'',values=cells.filter(c=>c?.v!==''&&c?.v!=null);
 const identityHint=!field&&/(?:^id$|nummer|(?:^|[ _])id$|kod|telefon|postnr)/i.test(column.header||'');
 let type=identityField(field)||identityHint?'text':dateField(field)?'date':numberField(field)?(currencyField(field)?'currency':'number'):field?'text':null;
 if(!type&&values.length){
  const dateHint=/datum|fr[. ]?o[. ]?m|t[. ]?o[. ]?m/i.test(column.header||'');
  const dateLike=c=>c.t==='d'||XLSX.SSF.is_date?.(c.z||'')||typeof c.v==='string'&&/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})$/.test(c.v.trim());
  if(values.every(dateLike)||dateHint&&values.every(c=>typeof c.v==='number'))type='date';
  else if(values.every(c=>{try{parseNumber(c.v);return true;}catch{return false;}}))type=currencyHint(column.header||'')||values.some(c=>currencyHint(c.z||String(c.v)))?'currency':'number';
 }
 type ||= 'text';
 let invalid=0;for(const c of values){try{if(type==='date')parseDate(c.v,XLSX,column.date1904);else if(['currency','number'].includes(type))parseNumber(c.v);}catch{invalid++;}}
 return {type,label:{date:'Datum',currency:'Kronor',number:'Tal',text:'Text'}[type],invalid,checked:values.length};
}
// Available to classic source interpreters after module initialization.
globalThis.LokalblickImportFormats={parseNumber,parseDate,interpretCell,dateField,numberField};
if(globalThis.window)globalThis.window.LokalblickImportFormats=globalThis.LokalblickImportFormats;
