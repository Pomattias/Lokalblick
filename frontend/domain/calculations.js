/* Shared pure calculation engine. Inputs are canonical records, never DOM/state. */
(function (root) {
  const number = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // SCB KPI, fastställda oktoberindextal, 1980=100. These public reference
  // values make normal lease calculations independent of a separate KPI import.
  // Imported index rows still take precedence when present.
  const DEFAULT_OCTOBER_1980 = Object.freeze({
    1980:104.20,1981:115.00,1982:124.60,1983:135.60,1984:145.50,
    1985:155.50,1986:161.90,1987:170.10,1988:180.20,1989:191.80,
    1990:213.40,1991:230.10,1992:235.10,1993:245.20,1994:251.00,
    1995:256.90,1996:255.90,1997:259.60,1998:257.30,1999:259.70,
    2000:262.60,2001:269.10,2002:275.40,2003:278.90,2004:281.00,
    2005:282.40,2006:286.07,2007:293.85,2008:305.56,2009:301.11,
    2010:305.57,2011:313.42,2012:314.59,2013:314.40,2014:314.02,
    2015:314.29,2016:318.00,2017:323.38,2018:330.72,2019:336.04,
    2020:336.97,2021:346.44,2022:384.04,2023:409.07,2024:415.51,
    2025:419.35
  });
  const seriesBase = (value) => String(value || "").replace(/[^0-9]/g, "");
  function defaultOctober(year) {
    const value=DEFAULT_OCTOBER_1980[Number(year)];
    return value
      ? {year:Number(year),month:10,value,seriesBase:"1980",source:"SCB KPI · fastställt oktober"}
      : null;
  }
  function october(series, year, preferredBase) {
    const targetYear=Number(year), preferred=seriesBase(preferredBase);
    let rows = (series || []).filter(
      (x) =>
        Number(x.year) === targetYear &&
        (Number(x.month) === 10 ||
          String(x.period || "").toLowerCase() === "oktober"),
    );
    if(preferred){
      const matching=rows.filter((x)=>{
        const base=seriesBase(x.seriesBase);
        return !base || base===preferred;
      });
      if(matching.length) rows=matching;
    }
    if(rows.length){
      const values=new Set(rows.map((x)=>number(x.value)));
      if(values.size!==1) return null;
      return rows[0];
    }
    if(!preferred || preferred==="1980") return defaultOctober(targetYear);
    return null;
  }
  function indexedAmount(base, basis, share, index, floor = true) {
    base = number(base);
    basis = number(basis);
    share = number(share);
    index = number(index);
    if (base < 0 || basis <= 0 || index <= 0 || share < 0 || share > 1)
      return 0;
    const amount = base * (1 + share * (index / basis - 1));
    return floor ? Math.max(base, amount) : amount;
  }
  function normalizedShare(value) {
    const raw=number(value);
    if(raw>1&&raw<=100) return raw/100;
    return raw;
  }
  function component(c, kind, year, preliminaryIndex, series) {
    const prefix = kind === "addition" ? "addition" : "rent";
    const base = number(kind === "addition" ? c.baseAdditions : c.baseRent);
    const sourceAmount = number(
      kind === "addition" ? c.annualAdditions : c.annualRent,
    );
    const baseYear=number(c[prefix+"BaseYear"]);
    const explicitBaseIndex=number(c[prefix+"BaseIndex"]);
    const requestedSeriesBase=seriesBase(c[prefix+"SeriesBase"]) || "1980";
    const basisRow=explicitBaseIndex ? null : october(series,baseYear,requestedSeriesBase);
    const basisSeries=seriesBase(c[prefix+"SeriesBase"] || basisRow?.seriesBase) || requestedSeriesBase;
    const indexYear = number(year) - 1;
    const row = october(series,indexYear,basisSeries);
    const knownIndex =
      row && !row.preliminary && !/prelim|prognos/i.test(row.source || "")
        ? number(row.value)
        : 0;
    const usedIndex =
      knownIndex || number(preliminaryIndex) || number(row?.value);
    const bastal = explicitBaseIndex || number(basisRow?.value);
    const rawShare = c[prefix + "IndexPercent"];
    const share = normalizedShare(rawShare);
    const validShare =
      rawShare !== "" && rawShare != null && share >= 0 && share <= 1;
    const incompatible = Boolean(
      basisSeries &&
        row?.seriesBase &&
        seriesBase(row.seriesBase) &&
        basisSeries !== seriesBase(row.seriesBase),
    );
    const comparableRows=(series||[]).filter((x)=>{
      const baseCode=seriesBase(x.seriesBase);
      return Number(x.year)===indexYear &&
        (Number(x.month)===10||String(x.period||"").toLowerCase()==="oktober") &&
        (!baseCode||baseCode===basisSeries);
    });
    const conflicting = new Set(comparableRows.map((x)=>number(x.value))).size > 1;
    const calculated =
      base > 0 &&
      baseYear > 0 &&
      bastal > 0 &&
      usedIndex > 0 &&
      validShare &&
      !incompatible &&
      !conflicting;
    const amount = calculated
      ? indexedAmount(
          base,
          bastal,
          share,
          usedIndex,
          c[prefix + "Floor"] !== false,
        )
      : sourceAmount;
    const preliminary = calculated && !knownIndex;
    const missingRentInput = kind !== "addition" && base <= 0 && sourceAmount <= 0;
    const needsReview =
      incompatible || conflicting || missingRentInput || (base > 0 && !calculated);
    return {
      amount,
      calculated,
      preliminary,
      knownIndex,
      usedIndex,
      indexYear,
      sourceAmount,
      base,
      baseYear,
      bastal,
      share,
      seriesBase:basisSeries,
      status: needsReview
        ? "Behöver kontroll"
        : preliminary
          ? "Preliminär"
          : calculated
            ? "Beräknad"
            : "Källvärde",
      reason: incompatible
        ? "KPI-seriernas bas skiljer sig"
        : conflicting
          ? "Motstridiga oktoberindex"
          : missingRentInput
            ? "Bashyra saknas"
            : needsReview
              ? "Bashyra, basår, indexandel eller oktoberindex saknas"
              : "",
      source: calculated
        ? (row?.source || "SCB KPI")
        : c.provenance?.[kind === "addition" ? "annualAdditions" : "annualRent"]
            ?.source ||
          c.enrichmentSource ||
          c.source ||
          "Källvärde",
      basedOn: calculated
        ? [
            kind === "addition" ? "Bastillägg" : "Bashyra",
            "Basår " + baseYear,
            "KPI oktober " + baseYear + " = " + bastal,
            "Indexandel " + Math.round(share*10000)/100 + " %",
            "KPI oktober " + indexYear + " = " + usedIndex,
          ]
        : [],
    };
  }
  function annualValues(c, year, preliminaryIndex, series) {
    const rent = component(c, "rent", year, preliminaryIndex, series),
      addition = component(c, "addition", year, preliminaryIndex, series);
    const media = number(c.annualContractDrift),
      tax = number(c.annualPropertyTax);
    return {
      rent,
      addition,
      media,
      tax,
      total: rent.amount + addition.amount + media + tax,
    };
  }
  function noticeDate(c) {
    if (!c?.end || !Number(c.noticePeriodMonths)) return "";
    const end = new Date(c.end + "T00:00:00Z");
    if (!Number.isFinite(end.getTime())) return "";
    const day=end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth()-Number(c.noticePeriodMonths));
    const maxDay=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();
    end.setUTCDate(Math.min(day,maxDay));
    return end.toISOString().slice(0,10);
  }
  function yearFactor(c, year) {
    const from = Date.UTC(Number(year), 0, 1),
      to = Date.UTC(Number(year) + 1, 0, 1);
    const start = c.start ? Date.parse(c.start + "T00:00:00Z") : from;
    const end = c.end ? Date.parse(c.end + "T00:00:00Z") + 86400000 : to;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      return 0;
    return Math.max(0, Math.min(end, to) - Math.max(start, from)) / (to - from);
  }
  function validDate(value) {
    if (!value) return null;
    const date = new Date(String(value).slice(0, 10) + "T00:00:00Z");
    return Number.isFinite(date.getTime()) ? date : null;
  }
  function budgetPeriod(c, year) {
    const budgetYear = Number(year);
    const dayMs = 86400000;
    const empty = {
      days:0,
      daysInYear:0,
      factor:0,
      from:"",
      to:"",
      startField:"",
      endField:"",
      label:"0 dagar"
    };
    if (!Number.isFinite(budgetYear)) return empty;

    // Actual occupancy wins over legal contract dates for budget purposes.
    const startValue = c?.moveInDate || c?.start || "";
    const endValue = c?.moveOutDate || c?.end || "";
    const start = validDate(startValue);
    const end = validDate(endValue);
    const yearStart = new Date(Date.UTC(budgetYear, 0, 1));
    const nextYear = new Date(Date.UTC(budgetYear + 1, 0, 1));
    const daysInYear = Math.round((nextYear - yearStart) / dayMs);

    if (start && end && end < start)
      return {
        ...empty,
        daysInYear,
        from:startValue,
        to:endValue,
        startField:c?.moveInDate ? "moveInDate" : (c?.start ? "start" : ""),
        endField:c?.moveOutDate ? "moveOutDate" : (c?.end ? "end" : ""),
        invalid:true
      };

    const effectiveStart =
      start && start > yearStart ? start : yearStart;
    const endExclusive =
      end ? new Date(end.getTime() + dayMs) : nextYear;
    const effectiveEnd =
      endExclusive < nextYear ? endExclusive : nextYear;

    if (effectiveEnd <= yearStart || effectiveStart >= nextYear || effectiveEnd <= effectiveStart)
      return {
        ...empty,
        daysInYear,
        from:startValue,
        to:endValue,
        startField:c?.moveInDate ? "moveInDate" : (c?.start ? "start" : ""),
        endField:c?.moveOutDate ? "moveOutDate" : (c?.end ? "end" : ""),
        label:"0/" + daysInYear
      };

    const days = Math.round((effectiveEnd - effectiveStart) / dayMs);
    return {
      days,
      daysInYear,
      factor: days / daysInYear,
      from: startValue,
      to: endValue,
      startField: c?.moveInDate ? "moveInDate" : (c?.start ? "start" : ""),
      endField: c?.moveOutDate ? "moveOutDate" : (c?.end ? "end" : ""),
      label: days + "/" + daysInYear
    };
  }
  function budgetYearFactor(c, year) {
    return budgetPeriod(c, year).factor;
  }
  const budgetIncluded = (x) =>
    x?.budgetIncluded !== false && x?.includeInBudget !== "Nej";
  function budgetIndex(data, year, preliminaryIndex) {
    const indexYear = number(year) - 1;
    const row = october((data && data.indexSeries) || [], indexYear, "1980");
    const known =
      row && !row.preliminary && !/prelim|prognos/i.test(row.source || "")
        ? number(row.value)
        : 0;
    if (known)
      return {
        year:indexYear,
        value:known,
        source:row.source || "SCB KPI",
        status:"Fastställd"
      };
    const preliminary = number(preliminaryIndex);
    return {
      year:indexYear,
      value:preliminary,
      source:preliminary ? "Preliminärt budgetindex" : "",
      status:preliminary ? "Preliminär" : "Saknas"
    };
  }

  function budgetRows(data, year, contracts, properties) {
    const rows = [],
      plan = (data.budgetPlans || []).find(
        (p) => Number(p.year) === Number(year),
      );
    const add = (x, category, amount, type, label, status, meta) => {
      const force = Boolean(meta && meta.force);
      if (amount > 0 || force) {
        const contract=x.contractId?(data.contracts||[]).find((c)=>c.id===x.contractId):null;
        rows.push(Object.assign({
          category,
          source:label||x.title||x.name||x.category||x.id,
          sub:label||x.title||x.category||"",
          amount,
          propertyId:x.propertyId||contract?.propertyId||"",
          contractId:x.contractId||"",
          sourceType:type,
          sourceId:x.id,
          status:status||"Källvärde"
        }, meta || {}));
      }
    };
    (data.contracts || []).forEach((c) => {
      const period = budgetPeriod(c, year);
      if (!period.days) return;
      const v = annualValues(c, year, plan?.preliminaryIndex, data.indexSeries);
      const status = [v.rent, v.addition].some((x) => x.status === "Behöver kontroll")
        ? "Behöver kontroll"
        : [v.rent, v.addition].some((x) => x.preliminary)
          ? "Preliminär"
          : [v.rent, v.addition].some((x) => x.calculated)
            ? "Beräknad"
            : "Källvärde";
      add(
        c,
        "Hyra + drift",
        v.total * period.factor,
        "contract",
        c.number || c.id,
        status,
        {
          force: status === "Behöver kontroll",
          budgetDays: period.days,
          budgetDaysInYear: period.daysInYear,
          budgetFactor: period.factor,
          budgetPeriod: period.label,
          budgetFrom: period.from,
          budgetTo: period.to
        },
      );
    });

    (data.activities || [])
      .filter(
        (x) =>
          number(x.planningYear) === number(year) &&
          budgetIncluded(x) &&
          x.status !== "Avslaget",
      )
      .forEach((x) => {
        let category =
          x.budgetCategory ||
          {
            Projekt: "Projekt",
            Underhåll: "Underhåll",
            Drift: "Driftkostnader",
            Utredning: "Utredningar",
          }[x.type] ||
          "Ej budget";
        if (x.type === "Önskemål" && category === "Ej budget") return;
        if (x.type === "Drift" && x.status === "Klar") return;
        if (category !== "Ej budget")
          add(
            x,
            category,
            number(x.estimatedCost),
            "activity",
            x.title,
          );
      });

    (data.operations || [])
      .filter((x) => number(x.period) === number(year) && budgetIncluded(x))
      .forEach((x) =>
        add(x, "Driftkostnader", number(x.budget), "operation"),
      );

    // Frozen/manual budget rows belong to the locked baseline, never to live forecast.
    if (!Array.isArray(contracts)) return rows;
    const ids = new Set(contracts.map((x) => x.id)),
      pids = new Set(
        properties
          ? properties.map((x) => x.id)
          : contracts.map((x) => x.propertyId),
      );
    return rows.filter((x) =>
      x.contractId ? ids.has(x.contractId) : pids.has(x.propertyId),
    );
  }
  function summarize(rows) {
    return rows.reduce((out, x) => {
      out[x.category] = (out[x.category] || 0) + number(x.amount);
      return out;
    }, {});
  }
  function actualRows(data, year, contracts) {
    const ids = new Set((contracts || data.contracts || []).map((c) => c.id)),
      pids = new Set(
        (contracts || data.contracts || []).map((c) => c.propertyId),
      );
    const rows = [];
    (data.operations || [])
      .filter(
        (x) =>
          number(x.period) === number(year) &&
          (x.contractId ? ids.has(x.contractId) : pids.has(x.propertyId)),
      )
      .forEach((x) => {
        const amount = number(x.actual);
        if (amount)
          rows.push({
            category: "Driftkostnader",
            amount,
            sourceId: x.id,
          });
      });
    (data.orders || []).forEach((order) => {
      const activity=(data.activities||[]).find((x)=>x.id===order.activityId);
      if(!activity || number(activity.planningYear)!==number(year)) return;
      const propertyId=activity.propertyId || (data.contracts||[]).find((c)=>c.id===activity.contractId)?.propertyId || "";
      if(activity.contractId ? !ids.has(activity.contractId) : !pids.has(propertyId)) return;
      const category=activity.budgetCategory || {Projekt:"Projekt",Underhåll:"Underhåll",Drift:"Driftkostnader",Utredning:"Utredningar"}[activity.type];
      const amount=number(order.finalCost);
      if(category && category!=="Ej budget" && amount) rows.push({category,amount,sourceId:activity.id,orderId:order.id});
    });
    (data.activities || []).filter((x)=>!(data.orders||[]).some((o)=>o.activityId===x.id)).filter((x)=>number(x.planningYear)===number(year)&&(x.contractId?ids.has(x.contractId):pids.has(x.propertyId))).forEach((x)=>{const category=x.budgetCategory||{Projekt:"Projekt",Underhåll:"Underhåll",Drift:"Driftkostnader",Utredning:"Utredningar"}[x.type];const amount=number(x.finalCost);if(category&&category!=="Ej budget"&&amount)rows.push({category,amount,sourceId:x.id});});
    return rows;
  }
  root.LokalblickCalculations = {
    october,
    defaultOctober,
    defaultOctoberSeries:()=>Object.entries(DEFAULT_OCTOBER_1980).map(([year,value])=>({year:Number(year),month:10,value,seriesBase:"1980",source:"SCB KPI · fastställt oktober"})),
    indexedAmount,
    component,
    annualValues,
    noticeDate,
    yearFactor,
    budgetPeriod,
    budgetYearFactor,
    budgetIndex,
    budgetRows,
    actualRows,
    summarize,
  };
})(globalThis);
