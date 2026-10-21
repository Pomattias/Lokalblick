// The number is independent of location: linking or moving a case never renames it.
export function nextIssueId(records,settings) {
 let sequence=Number.isSafeInteger(settings.issueSequence)?Math.max(0,settings.issueSequence):0;
 const ids=new Set(records.map(row=>row.id));
 for(const id of ids){const match=/^ÄR-(\d+)$/.exec(id);if(match)sequence=Math.max(sequence,Number(match[1]));}
 let id;do{if(!Number.isSafeInteger(sequence+1))throw Error('Ärendenummerserien är full.');id='ÄR-'+String(++sequence).padStart(6,'0');}while(ids.has(id));
 settings.issueSequence=sequence;return id;
}
export const issueNeedsLink=issue=>!issue.propertyId&&!issue.objectId&&!issue.contractId&&!(issue.scopeType==='unit'&&issue.unitId)&&issue.scopeType!=='general';
