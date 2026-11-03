// Narrow, opt-in/year-aware rent recovery for the guided v2 import only.
// Generic and explicitly saved exclusions are never changed silently.
import {retargetColumn} from './import-engine.js';
import {assignAgreementItemKeys} from './import-matching.js';

const normalize=value=>String(value??'').toLocaleLowerCase('sv').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const yearOf=header=>{
 const matched=/^(?:hyra|arshyra)(20\d{2})(?:kr)?$/.exec(normalize(header));
 return matched?Number(matched[1]):null;
};
const usefulNumber=column=>(column.samples||column.examples||[])
 .some(v=>typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&
  /^\s*[\d\s.,]+\s*$/.test(v)&&v.trim()!=='');

export function prepareGuidedRentColumns(workbook,profiles,XLSX){
 const changed=[];
 for(const profile of profiles||[]){
  if(profile.mappingRow||['recurringCosts','costEvidence'].includes(profile.primaryTable))continue;
  const available=profile.columns.filter(c=>yearOf(c.header)&&c.filled&&usefulNumber(c));
  if(!available.length)continue;
  const latest=Math.max(...available.map(c=>yearOf(c.header)));
  for(const column of available.filter(c=>yearOf(c.header)===latest)){
   if(column.target==='agreementItems.reportedAmount'){
    column.itemType='base';column.reportedRentYear=latest;continue;
   }
   // The guided UI temporarily excludes columns it cannot confidently map.
   // A year-labelled monetary column is now safe as a *reported* annual
   // amount, not base rent. Recover only those automatic exclusions.
   // Explicit/saved exclusions remain opt-in via the review button.
   const automaticallySkipped=column.target==='@ignore'&&
    column.matchSource==='guided-excluded'&&column.excludedTarget==='@unmapped';
   const unmapped=column.target==='@unmapped'&&!column.approved&&
    ['unmatched','alias'].includes(column.matchSource);
   if(!automaticallySkipped&&!unmapped)continue;
   retargetColumn(workbook,profile,column,'agreementItems.reportedAmount',XLSX);
   column.itemType='base';column.reportedRentYear=latest;
   column.matchSource='guided-rent';column.approved=true;column.collection='agreementItems';
   changed.push({sheet:profile.name,header:column.header,year:latest});
  }
  assignAgreementItemKeys(profile);
 }
 return changed;
}
