// Canonical recurring expenses. One owner (property OR contract), one cost identity.
// Source adapters/persistence may use Excel, private files or approved database APIs.
// This module deliberately does not read or write a storage provider.
(function(root) {
  "use strict";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const yr = value => Number.isInteger(value) && value >= 1900 && value <= 9999;
  const has = value => value !== undefined && value !== null && value !== "";
  const year = value => has(value) ? Number(value) : null;
  function validateCost(row, data) {
    if (!row || typeof row.id !== "string" || !row.id.trim())
      throw new TypeError("Kostnad behöver ett unikt ID.");
    if (!String(row.name || "").trim())
      throw new TypeError("Ange namn för löpande kostnad.");
    const contractId = String(row.contractId || "").trim();
    const propertyId = String(row.propertyId || "").trim();
    if (Boolean(contractId) === Boolean(propertyId))
      throw new TypeError("Kostnaden ska tillhöra antingen fastighet eller avtal.");
    if (propertyId && !(data.properties || []).some(p => p.id === propertyId))
      throw new TypeError("Kostnadens fastighet saknas.");
    if (contractId && !(data.contracts || []).some(c => c.id === contractId))
      throw new TypeError("Kostnadens avtal saknas.");
    if (!finite(row.annualAmount) || row.annualAmount < 0)
      throw new TypeError("Årskostnad ska anges i kronor och får inte vara negativ.");
    const start = year(row.startYear), end = year(row.endYear);
    if ((start !== null && !yr(start)) || (end !== null && !yr(end)) || (start !== null && end !== null && end < start))
      throw new TypeError("Ogiltig giltighetsperiod för löpande kostnad.");
    if (row.actuals !== undefined && !Array.isArray(row.actuals))
      throw new TypeError("Utfall måste vara en lista per år.");
    const seen = new Set();
    for (const actual of row.actuals || []) {
      if (!yr(actual.year) || !finite(actual.amount) || seen.has(actual.year))
        throw new TypeError("Utfall behöver unikt år och giltigt belopp.");
      if ((start !== null && actual.year < start) || (end !== null && actual.year > end))
        throw new TypeError("Utfall ligger utanför kostnadens giltighetsperiod.");
      seen.add(actual.year);
    }
    return row;
  }
  function validateCosts(data) {
    const ids = new Set();
    for (const row of data.recurringCosts || []) {
      validateCost(row, data);
      if (ids.has(row.id)) throw new TypeError("Samma löpande kostnad förekommer flera gånger.");
      ids.add(row.id);
    }
    return data;
  }
  function inYear(row, yearValue) {
    const current = Number(yearValue);
    if (!yr(current)) return false;
    if(row.start||row.end)return (!row.start||row.start<=current+"-12-31")&&(!row.end||row.end>=current+"-01-01");
    return (!has(row.startYear) || current >= Number(row.startYear)) &&
      (!has(row.endYear) || current <= Number(row.endYear));
  }
  function annualBudget(row, budgetYear) {
    if(!inYear(row,budgetYear))return 0;
    if(row.start||row.end){const from=Date.UTC(Number(budgetYear),0,1),to=Date.UTC(Number(budgetYear)+1,0,1);return (Number(row.annualAmount)||0)*Math.max(0,Math.min(to,row.end?Date.parse(row.end+'T00:00:00Z')+86400000:to)-Math.max(from,row.start?Date.parse(row.start+'T00:00:00Z'):from))/(to-from);}
    return Number(row.annualAmount)||0;
  }
  function annualActual(row, budgetYear) {
    if (!inYear(row, budgetYear)) return 0;
    return Number((row.actuals || []).find(a => a.year === Number(budgetYear))?.amount) || 0;
  }
  function propertyId(row, data) {
    return row.propertyId || (data.contracts || []).find(c => c.id === row.contractId)?.propertyId ||
      (data.objects || []).find(o => o.id === (data.contracts || []).find(c => c.id === row.contractId)?.objectId)?.propertyId || "";
  }
  const dayMs=86400000;
  const stamp=value=>Date.parse(value+'T00:00:00Z');
  function evidenceActual(cost,evidence,yearValue){
    const current=Number(yearValue),from=Date.UTC(current,0,1),to=Date.UTC(current+1,0,1);
    const rows=evidence.filter(row=>row.costId===cost.id);
    const annual=rows.find(row=>row.type==='annual'&&Number(row.year)===current);
    const invoices=rows.filter(row=>row.type==='invoice'&&stamp(row.start)<to&&stamp(row.end)+dayMs>from);
    const invoiceAmount=invoices.reduce((sum,row)=>{
      const start=stamp(row.start),end=stamp(row.end)+dayMs;
      return sum+Number(row.amount)*(Math.min(end,to)-Math.max(start,from))/(end-start);
    },0);
    if(annual&&annual.selected!==false)return {amount:Number(annual.amount),complete:true,source:'annual',invoiceAmount,invoiceCount:invoices.length};
    const expectedFrom=Math.max(from,cost.start?stamp(cost.start):from),expectedTo=Math.min(to,cost.end?stamp(cost.end)+dayMs:to);
    let covered=expectedFrom;
    for(const row of [...invoices].sort((a,b)=>a.start.localeCompare(b.start))){const start=Math.max(expectedFrom,stamp(row.start)),end=Math.min(expectedTo,stamp(row.end)+dayMs);if(start>covered)break;covered=Math.max(covered,end);}
    const complete=(cost.invoiceCompleteYears||[]).includes(current)&&invoices.length>0&&covered>=expectedTo;
    return {amount:invoiceAmount,complete,source:complete?'invoices':'incomplete',invoiceAmount,invoiceCount:invoices.length};
  }
  function categoryActual(data,property,category,yearValue){
    const costs=(data.recurringCosts||[]).filter(row=>row.propertyId===property&&row.category===category&&inYear(row,yearValue));
    const rows=costs.map(cost=>({cost,...evidenceActual(cost,data.costEvidence||[],yearValue)}));
    return {rows,amount:rows.reduce((sum,row)=>sum+row.amount,0),complete:rows.length>0&&rows.every(row=>row.complete)};
  }
  root.LokalblickRecurringCosts = Object.freeze({
    validateCost, validateCosts, inYear, annualBudget, annualActual, propertyId,evidenceActual,categoryActual
  });
})(globalThis);
