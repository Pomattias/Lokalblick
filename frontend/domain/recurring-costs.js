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
    return (!has(row.startYear) || current >= Number(row.startYear)) &&
      (!has(row.endYear) || current <= Number(row.endYear));
  }
  function annualBudget(row, budgetYear) {
    return inYear(row, budgetYear) ? Number(row.annualAmount) || 0 : 0;
  }
  function annualActual(row, budgetYear) {
    if (!inYear(row, budgetYear)) return 0;
    return Number((row.actuals || []).find(a => a.year === Number(budgetYear))?.amount) || 0;
  }
  function propertyId(row, data) {
    return row.propertyId || (data.contracts || []).find(c => c.id === row.contractId)?.propertyId ||
      (data.objects || []).find(o => o.id === (data.contracts || []).find(c => c.id === row.contractId)?.objectId)?.propertyId || "";
  }
  root.LokalblickRecurringCosts = Object.freeze({
    validateCost, validateCosts, inYear, annualBudget, annualActual, propertyId
  });
})(globalThis);
