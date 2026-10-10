(function(root) {
  const copy = x => JSON.parse(JSON.stringify(x));
  const actionTypes = new Set(['activity','project','maintenance','investigation','maintenanceStatus','driftIssue','wish']);
  function collection(row) { return row.sourceType==='contract'?'contracts':row.sourceType==='operation'?'operations':actionTypes.has(row.sourceType)?'activities':null; }
  function key(row) { return [actionTypes.has(row.sourceType)?'activity':row.sourceType || 'legacy',row.sourceId || row.contractId || row.source,row.category,row.sourceType ? '' : row.sub || ''].join('|'); }
  function record(data,row) { const col=collection(row); return col ? (data[col]||[]).find(x=>String(x.id)===String(row.sourceId)) : null; }
  function finalCost(data,row,year) {
    if(row.sourceType==='contract') return null;
    let item=record(data,row);
    if(!item) {
      const deleted=(data.auditLog||[]).slice().reverse().find(h=>h.collection===collection(row) && String(h.recordId)===String(row.sourceId) && h.action==='Raderad');
      if(deleted)item=Object.fromEntries((deleted.fields||[]).map(f=>[f.field,f.from]));
    }
    if(!item)return null;
    if(row.sourceType==='activity') {
      const orders=(data.orders||[]).filter(x=>String(x.activityId)===String(item.id));
      if(orders.length) {
        const completed=orders.filter(x=>Number(x.finalCost)||x.completedAt||/faktura|betald|klar/i.test(x.paymentStatus||''));
        if(completed.length) return completed.reduce((sum,x)=>sum+(Number(x.finalCost)||0),0);
        return null;
      }
    }
    const value=item.finalCosts?.[year]?.[row.category];
    if(value != null) return Number(value);
    if(item.finalCostConfirmed || item.completedDate || item.completedAt || /^(Utförd|Klar|Klart)$/.test(item.status||'')) return Number(item.finalCost)||0;
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
  function history(data,plan,row) {
    const events=[],rowKey=key(row),matches=line=>key(line)===rowKey||key(line)===row.baselineKey;
    const fields=(before,after)=>{before=before?{...before,included:before.included!==false}:before;after=after?{...after,included:after.included!==false}:after;return ['amount','included','category','source','timing'].filter(field=>JSON.stringify(before?.[field])!==JSON.stringify(after?.[field])).map(field=>({field,from:before?.[field],to:after?.[field]}));};
    const versions=plan.versions||[];
    versions.forEach((version,i)=>{
      const before=(version.snapshot?.lines||[]).find(matches),after=((versions[i+1]?.snapshot||plan).lines||[]).find(matches);
      if(!before&&!after)return;
      const changes=fields(before,after);
      if(changes.length)events.push({at:version.at,by:version.by,reason:version.reason,action:'Budgetpost justerad',fields:changes});
    });
    const col=collection(row);
    for(const event of data.auditLog||[]) {
      if(event.collection===col&&String(event.recordId)===String(row.sourceId))events.push({...event,action:'Källobjekt · '+event.action});
      if(event.collection!=='budgetPlans'||String(event.recordId)!==String(plan.year))continue;
      const lineField=(event.fields||[]).find(f=>f.field==='lines');
      if(!lineField)continue;
      const before=(Array.isArray(lineField.from)?lineField.from:[]).find(matches),after=(Array.isArray(lineField.to)?lineField.to:[]).find(matches);
      if(!before&&!after)continue;
      const changes=fields(before,after);
      if(changes.length&&!events.some(e=>e.action==='Budgetpost justerad'&&JSON.stringify(e.fields)===JSON.stringify(changes)))events.push({...event,action:before?'Budgetpost justerad':'Budgetpost sparad',fields:changes});
    }
    return events.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
  }
  function setRowAdjustment(plan,line,amount,included,actor,reason,at=new Date().toISOString()) {
    if(!Number.isFinite(Number(amount)))throw Error('Ogiltigt budgetbelopp');
    plan.rowAdjustments ||= {};
    const base=Number(line.baseAmount??(Number(line.amount)-Number(line.manualAdjustmentAmount||0)-Number(line.adjustmentAmount||0)))||0;
    plan.rowAdjustments[key(line)]={amount:Number(amount)-base-Number(line.adjustmentAmount||0),included,by:actor,reason,at};
    line.baseAmount=base;line.manualAdjustmentAmount=plan.rowAdjustments[key(line)].amount;
    line.amount=Number(amount);line.included=included;
  }
  function beginVersion(plan,reason,actor,at=new Date().toISOString()) {
    if(plan.status!=='Låst')throw Error('Budgeten är redan en arbetsbudget');
    revise(plan,'danger',reason,actor,at);
    plan.status='Arbetsbudget';
    plan.adjustments ||= {};
    plan.versionStartedAt=at;
    plan.versionStartedBy=actor;
  }
  root.LokalblickBudgetFollowup={key,record,finalCost,compare,revise,beginVersion,history,setRowAdjustment};
})(typeof window==='undefined'?globalThis:window);
