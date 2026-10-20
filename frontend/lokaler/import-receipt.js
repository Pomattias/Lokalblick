// Import metadata only: no source cell values or duplicate business records.
// Refresh the same receipt after the user's value choices, before persistence.
export function refreshImportReceipt(result){
 const source=result.clean.workspace.sourceRegistry.find(row=>row.kind==='clean-import'&&row.name===result.report.sourceName);
 if(!source?.receipt)return;
 const receipt=source.receipt,ids=new Set(result.report.reviewIds||[]);
 receipt.tables=structuredClone(result.report.tables);
 receipt.reviewIds=[...ids];
 const pending=result.clean.workspace.importReview.filter(row=>ids.has(row.id)&&row.status==='pending');
 const occurrences=new Map(),key=at=>JSON.stringify([at.source,at.sheet,at.columnIndex??at.index]);
 for(const review of pending)for(const at of review.occurrences||[review]){const id=key(at);if(!occurrences.has(id))occurrences.set(id,new Set());occurrences.get(id).add(at.row);}
 for(const column of receipt.columns){
  column.review=occurrences.get(key(column))?.size||0;
 }
}
