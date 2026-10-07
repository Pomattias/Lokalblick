/* Shared pure calculation engine. Inputs are canonical records, never DOM/state. */
(function (root) {
  const number = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  function october(series, year) {
    const rows = (series || []).filter(
      (x) =>
        Number(x.year) === Number(year) &&
        (Number(x.month) === 10 ||
          String(x.period || "").toLowerCase() === "oktober"),
    );
    if (
      !rows.length ||
      rows.some((x) => number(x.value) !== number(rows[0].value))
    )
      return null;
    return rows[0];
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
  function component(c, kind, year, preliminaryIndex, series) {
    const prefix = kind === "addition" ? "addition" : "rent";
    const base = number(kind === "addition" ? c.baseAdditions : c.baseRent);
    const sourceAmount = number(
      kind === "addition" ? c.annualAdditions : c.annualRent,
    );
    const indexYear = number(year) - 1,
      row = october(series, indexYear);
    const knownIndex =
      row && !row.preliminary && !/prelim|prognos/i.test(row.source || "")
        ? number(row.value)
        : 0;
    const usedIndex =
      knownIndex || number(preliminaryIndex) || number(row?.value);
    const basisRow = october(series, c[prefix + "BaseYear"]);
    const bastal = number(basisRow?.value);
    const rawShare = c[prefix + "IndexPercent"];
    const share = number(rawShare),
      validShare =
        rawShare !== "" && rawShare != null && share >= 0 && share <= 1;
    const basisSeries = c[prefix + "SeriesBase"] || basisRow?.seriesBase;
    const incompatible = Boolean(
      basisSeries &&
        row?.seriesBase &&
        String(basisSeries) !== String(row.seriesBase),
    );
    const conflicting =
      new Set(
        (series || [])
          .filter((x) => Number(x.year) === indexYear && Number(x.month) === 10)
          .map((x) => number(x.value)),
      ).size > 1;
    const calculated =
      base > 0 &&
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
    const needsReview =
      incompatible || conflicting || (base > 0 && !calculated);
    return {
      amount,
      calculated,
      preliminary,
      knownIndex,
      usedIndex,
      indexYear,
      sourceAmount,
      base,
      bastal,
      share,
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
          : needsReview
            ? "Bastal, indexandel eller oktoberindex saknas"
            : "",
      source: calculated
        ? "calculated"
        : c.provenance?.[kind === "addition" ? "annualAdditions" : "annualRent"]
            ?.source ||
          c.enrichmentSource ||
          c.source ||
          "Källvärde",
      basedOn: calculated
        ? [
            kind === "addition" ? "Grundtillägg" : "Grundhyra",
            "Bastal",
            "Indexandel",
            "KPI oktober " + indexYear,
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
  const budgetIncluded = (x) =>
    x?.budgetIncluded !== false && x?.includeInBudget !== "Nej";
  function budgetRows(data, year, contracts, properties) {
    const rows = [],
      plan = (data.budgetPlans || []).find(
        (p) => Number(p.year) === Number(year),
      );
    const add = (x, category, amount, type, label, status) => {
      if (amount > 0) {
        const contract=x.contractId?(data.contracts||[]).find((c)=>c.id===x.contractId):null;
        rows.push({category,source:label||x.title||x.name||x.category||x.id,sub:label||x.title||x.category||"",amount,propertyId:x.propertyId||contract?.propertyId||"",contractId:x.contractId||"",sourceType:type,sourceId:x.id,status:status||"Källvärde"});
      }
    };
    (data.contracts || []).forEach((c) => {
      const v = annualValues(c, year, plan?.preliminaryIndex, data.indexSeries);
      add(
        c,
        "Hyra + drift",
        v.total * yearFactor(c, year),
        "contract",
        c.number || c.id,
        [v.rent, v.addition].some((x) => x.status === "Behöver kontroll")
          ? "Behöver kontroll"
          : [v.rent, v.addition].some((x) => x.preliminary)
            ? "Preliminär"
            : [v.rent, v.addition].some((x) => x.calculated)
              ? "Beräknad"
              : "Källvärde",
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

    rows.push(
      ...(plan?.lines || [])
        .filter((r) => r.sourceType === "manual" && r.included !== false)
        .map((r) => ({ ...r })),
    );
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
    indexedAmount,
    component,
    annualValues,
    noticeDate,
    yearFactor,
    budgetRows,
    actualRows,
    summarize,
  };
})(globalThis);
