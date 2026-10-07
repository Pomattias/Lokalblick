(function(root) {
  const copy = x => JSON.parse(JSON.stringify(x));
  const collections = {contract:'contracts',project:'projects',maintenance:'maintenance',operation:'operations',investigation:'investigations',maintenanceStatus:'maintenanceStatus',driftIssue:'driftIssues',wish:'wishes'};
  function key(row) { return [row.sourceType || 'legacy',row.sourceId || row.contractId || row.source,row.category,row.sourceType ? '' : row.sub || ''].join('|'); }
  function record(data,row) { return (data[collections[row.sourceType]]||[]).find(x=>String(x.id)===String(row.sourceId)); }
  function finalCost(data,row,year) {
    if(row.sourceType==='contract') return null;
    let item=record(data,row);
    if(!item) {
      const deleted=(data.auditLog||[]).slice().reverse().find(h=>h.collection===collections[row.sourceType] && String(h.recordId)===String(row.sourceId) && h.action==='Raderad');
      if(deleted)item=Object.fromEntries((deleted.fields||[]).map(f=>[f.field,f.from]));
    }
    if(!item)return null;
    const value=item.finalCosts?.[year]?.[row.category];
    if(value != null) return Number(value);
    // Projects can have two budget categories; never count one final cost twice.
    if(row.sourceType!=='project' && (item.finalCostConfirmed || item.completedDate || item.completedAt || /^(Utförd|Klar|Klart)$/.test(item.status||''))) return Number(item.finalCost)||0;
    return null;
  }
  function compare(data,baseline,live,year) {
    const before=new Map(baseline.filter(x=>x.included!==false).map(x=>{
      const originalKey=key(x);
      if(!x.sourceType) {
        const candidates=live.filter(r=>r.category===x.category && String(r.contractId||'')===String(x.contractId||'') && r.source===x.source);
        if(candidates.length===1) return [key(candidates[0]),{...x,sourceType:candidates[0].sourceType,sourceId:candidates[0].sourceId,baselineKey:originalKey}];
      }
      return [originalKey,{...x,baselineKey:originalKey}];
    }));
    const after=new Map(live.map(x=>[key(x),x]));
    return [...new Set([...before.keys(),...after.keys()])].map(id=>{
      const b=before.get(id), a=after.get(id), row=a||b, final=finalCost(data,row,year);
      const forecast=final===null ? Number(a?.amount)||0 : final;
      return {...row,workStatus:record(data,row)?.status||"",baselineKey:b?.baselineKey,budget:b?Number(b.amount)||0:null,forecast,finalCost:final,change:b&&!b.sourceType?'Behöver kontroll · äldre budgetrad':!b?'Ny · ej budgeterad':!a?'Utgår · finns i budget':Number(b.amount)!==forecast||(b.timing!=null&&b.timing!==a.timing)?'Ändrad':'Oförändrad',active:!!a};
    });
  }
  function revise(plan,confirmation,reason,actor,at=new Date().toISOString()) {
    if(plan.status==='Låst' && confirmation!=='danger') throw new Error('Skriv danger för att ändra låst budget.');
    if(!String(reason).trim())throw new Error('Ange varför budgeten ändras.');
    const snapshot=copy(plan); delete snapshot.versions;
    plan.versions=plan.versions||[];
    plan.versions.push({at,by:actor,reason:reason.trim(),snapshot});
    plan.revisionReason=reason.trim();plan.revisedBy=actor;plan.revisedAt=at;
  }
  root.LokalblickBudgetFollowup={key,record,finalCost,compare,revise};
})(typeof window==='undefined'?globalThis:window);
