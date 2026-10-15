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
  const seriesBase = (value) => {const text=String(value||"").trim().toLowerCase();return text.match(/^(\d{4})(?:\s*=\s*100)?$/)?.[1]||text;};
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
  // Explicit contractual rules; absent method preserves legacy KPI exactly.
  // Base amount applies in baseYear+1; later years apply each annual adjustment.
  function contractualComponent(c,kind,year,assumption,series,opts) {
    const p=kind==="addition"?"addition":"rent",method=String(c[p+"AdjustmentMethod"]||"kpi");
    if(method==="kpi")return null;
    const base=number(c[kind==="addition"?"baseAdditions":"baseRent"]);
    const sourceAmount=number(kind==="addition"?c.annualAdditions:c.annualRent);
    const baseYear=number(c[p+"BaseYear"]),target=Number(year);
    const basis=seriesBase(c[p+"SeriesBase"])||"1980";
    const bastal=number(c[p+"BaseIndex"])||number(october(series,baseYear,basis)?.value);
    const share=normalizedShare(c[p+"IndexPercent"]),shareSet=c[p+"IndexPercent"]!==""&&c[p+"IndexPercent"]!=null;
    const pct=c[p+"AnnualPercent"],mn=c[p+"MinPercent"],mx=c[p+"MaxPercent"];
    const min=mn===""||mn==null?null:Number(mn),max=mx===""||mx==null?null:Number(mx);
    const limitBasis=String(c[p+"LimitBasis"]||"rent");
    const valid=n=>n!==""&&n!=null&&Number.isFinite(Number(n))&&Number(n)>-100&&Number(n)<=1000;
    let calculated=false,preliminary=false,usedIndex=0,amount=base,reason="",source="";
    if(method==="none"){calculated=base>0;source="Avtalat utan uppräkning";if(!calculated)reason="Basbelopp saknas";}
    else if(method==="fixed"){
      calculated=base>0&&baseYear>0&&target>=baseYear+1&&target-baseYear<=150&&valid(pct);
      source="Avtalad fast årlig procent";
      if(calculated){
        amount=base*Math.pow(1+Number(pct)/100,target-baseYear-1);
        if(!Number.isFinite(amount)){calculated=false;reason="Avtalad uppräkning ger ett ogiltigt belopp";}
      }
      else reason="Basbelopp, basår eller avtalad procentsats saknas";
    }else if(method==="kpi-limited"){
      calculated=base>0&&baseYear>0&&bastal>0&&target>=baseYear+1&&target-baseYear<=150&&
        shareSet&&share>=0&&share<=1&&(min!==null||max!==null)&&
        (min===null||valid(mn))&&(max===null||valid(mx))&&
        (min===null||max===null||min<=max)&&["rent","index"].includes(limitBasis);
      source="Avtalat KPI med min/max";
      if(!calculated)reason="Kontrollera basår, bastal, indexandel och avtalad min/max";
      for(let y=baseYear+2;calculated&&y<=target;y++){
        const prev=y-2===baseYear?bastal:number(october(series,y-2,basis)?.value);
        const row=october(series,y-1,basis);
        const confirmed=row&&!row.preliminary&&!/prelim|prognos/i.test(row.source||"")?number(row.value):0;
        const last=y===target;
        const current=last?(number(assumption)||confirmed||
          (opts.scenario===true?budgetIndex({indexSeries:series},y,0,basis).value:0)||number(row?.value)):confirmed;
        const conflict=k=>new Set((series||[]).filter(x=>Number(x.year)===k&&
          (Number(x.month)===10||String(x.period||"").toLowerCase()==="oktober")&&
          (!x.seriesBase||seriesBase(x.seriesBase)===basis)).map(x=>number(x.value))).size>1;
        if(!prev||!current||conflict(y-2)||conflict(y-1)){
          calculated=false;reason="KPI oktober saknas eller är motstridigt för "+(y-2)+"–"+(y-1);
          break;
        }
        const kpiPct=(current/prev-1)*100;
        const rate=limitBasis==="index"?
          Math.min(max??Infinity,Math.max(min??-Infinity,kpiPct))*share:
          Math.min(max??Infinity,Math.max(min??-Infinity,kpiPct*share));
        amount*=1+rate/100;
        if(c[p+"Floor"]!==false)amount=Math.max(base,amount);
        if(last){usedIndex=current;preliminary=number(assumption)>0||!confirmed;}
      }
      if(calculated&&target===baseYear+1)usedIndex=bastal;
    }else reason="Okänd avtalad hyresjustering";
    if(!calculated)amount=sourceAmount;
    const basedOn=method==="fixed"?["Fast ökning "+pct+" % per år"]:
      method==="none"?["Ingen uppräkning"]:
      ["Indexandel "+share*100+" %","Min "+(min===null?"–":min+" %"),
       "Max "+(max===null?"–":max+" %"),
       limitBasis==="index"?"Gräns för KPI-förändring":"Gräns för hyresökning"];
    return {amount,calculated,preliminary,knownIndex:preliminary?0:usedIndex,
      usedIndex,indexYear:target-1,sourceAmount,base,baseYear,bastal,share,seriesBase:basis,
      status:!calculated?"Behöver kontroll":preliminary?"Preliminär":"Beräknad",
      reason,source,basedOn,method,annualPercent:method==="fixed"?Number(pct):null,
      minPercent:min,maxPercent:max,limitBasis};
  }
  function component(c, kind, year, preliminaryIndex, series, options={}) {
    // Manual CPI is ONLY an explicit budget scenario input.
    // Ordinary lease calculations never consume scenario assumptions.
    const scenario=options.scenario===true;
    const scenarioIndex=scenario?number(preliminaryIndex):0;
    const agreed=contractualComponent(c,kind,year,scenarioIndex,series,options);
    if(agreed)return agreed;
    const prefix = kind === "addition" ? "addition" : "rent";
    const base = number(kind === "addition" ? c.baseAdditions : c.baseRent);
    // Indexed supplements are contractual additions. Utility/operating expenses
    // are separate recurringCosts and never flow into this amount.
    const sourceAmount = number(kind === "addition" ? c.annualAdditions : c.annualRent);
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
    const ownIndex=scenarioIndex;
    // Only a budget scenario may override an already confirmed October figure.
    // Outside the scenario, the contractual rent always uses published CPI.
    const recentMonths=(series||[]).filter(x=>Number(x.year)===indexYear &&
      Number(x.month)>=1 && Number(x.month)<10 && number(x.value)>0 &&
      (!x.seriesBase || seriesBase(x.seriesBase)===basisSeries))
      .sort((a,b)=>Number(b.month)-Number(a.month));
    const latestMonth=recentMonths[0];
    const contradictoryMonth=latestMonth && new Set(recentMonths.filter(x=>Number(x.month)===Number(latestMonth.month))
      .map(x=>number(x.value))).size>1;
    const latestMonthlyIndex=contradictoryMonth?0:number(latestMonth?.value);
    const mayForecast=scenario;
    const budgetFallback=mayForecast ? budgetIndex({indexSeries:series},year,0,basisSeries).value : 0;
    const usedIndex=ownIndex||knownIndex||number(row?.value)||
      (mayForecast?latestMonthlyIndex||budgetFallback:0);
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
    // A contractual 0 % index share means the base amount is the annual amount.
    // Such contracts must not depend on the presence of historical October CPI.
    const unindexed = base > 0 && validShare && share === 0;
    const calculated = unindexed || (
      base > 0 && baseYear > 0 && bastal > 0 && usedIndex > 0 &&
      validShare && !incompatible && !conflicting
    );
    const amount = unindexed ? base : calculated
      ? indexedAmount(base, bastal, share, usedIndex, c[prefix + "Floor"] !== false)
      : sourceAmount;
    const preliminary = calculated && !unindexed && (ownIndex>0 || !knownIndex);
    const missingRentInput = kind !== "addition" && base <= 0 && sourceAmount <= 0;
    const needsReview = missingRentInput ||
      (share > 0 && (incompatible || conflicting || contradictoryMonth)) ||
      (base > 0 && !calculated);
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
      reason: share > 0 && incompatible
        ? "KPI-seriernas bas skiljer sig"
        : share > 0 && conflicting
          ? "Motstridiga oktoberindex"
          : share > 0 && contradictoryMonth
            ? "Motstridiga månadsindex"
          : missingRentInput
            ? "Bashyra saknas"
            : base > 0 && !validShare
              ? "Indexandel saknas eller är ogiltig"
              : needsReview
                ? "Basår, bastal eller oktoberindex saknas"
                : "",
      source: unindexed
        ? "Avtalad bashyra / bastillägg (0 % index)"
        : calculated
          ? (preliminary
              ? (!row && latestMonthlyIndex && usedIndex===latestMonthlyIndex
                  ? "Senast kända KPI " + indexYear + "-" + String(latestMonth.month).padStart(2,"0")
                  : "Preliminärt oktoberindex")
              : row?.source || "SCB KPI")
          : c.provenance?.[kind === "addition" ? "annualAdditions" : "annualRent"]
              ?.source || c.enrichmentSource || c.source || "Källvärde",
      basedOn: unindexed
        ? [kind === "addition" ? "Bastillägg" : "Bashyra", "Indexandel 0 % – ingen uppräkning"]
        : calculated
          ? [
              kind === "addition" ? "Bastillägg" : "Bashyra",
              "Basår " + baseYear,
              "KPI oktober " + baseYear + " = " + bastal,
              "Indexandel " + Math.round(share*10000)/100 + " %",
              (!row && latestMonthlyIndex && usedIndex===latestMonthlyIndex
                ? "KPI " + indexYear + "-" + String(latestMonth.month).padStart(2,"0")
                : "KPI oktober " + indexYear) + " = " + usedIndex,
            ]
          : [],
    };
  }
  function annualValues(c, year, preliminaryIndex, series, options={}) {
    const rent = component(c, "rent", year, preliminaryIndex, series, options),
      addition = component(c, "addition", year, preliminaryIndex, series, options);
    const tax = number(c.annualPropertyTax);
    return {
      rent,
      addition,
      tax,
      total: rent.amount + addition.amount + tax,
    };
  }
  // Derived display value, not a property field.
  function propertyAnnualCost(data, propertyId, year) {
    const result={rent:0,addition:0,tax:0,annualCost:0,activeContracts:0,needsReview:0,preliminary:0};
    (data.contracts||[]).filter(c=>c.propertyId===propertyId).forEach(c=>{
      const period=budgetPeriod(c,year);
      if (!period.days) return;
      const v=annualValues(c,year,0,data.indexSeries);
      result.rent+=v.rent.amount*period.factor;
      result.addition+=v.addition.amount*period.factor;
       result.tax+=v.tax*period.factor;
      result.activeContracts++;
      if ([v.rent,v.addition].some(x=>x.status==="Behöver kontroll")) result.needsReview++;
      if ([v.rent,v.addition].some(x=>x.preliminary)) result.preliminary++;
    });
    result.annualCost=result.rent+result.addition+result.tax;
    return result;
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
  // Show rolling contractual deadlines without mutating the imported dates.
  // Do not assume renewal if either notice or renewal terms are unavailable.
  function projectedContractTerm(contract, asOf = new Date()) {
    const initial=validDate(contract?.end);
    if (!initial) return {end:"",noticeBy:"",nextEnd:"",renewals:0};
    const notice=contract?.noticePeriodMonths == null || contract.noticePeriodMonths===""
      ? NaN : Number(contract.noticePeriodMonths);
    const renewal=contract?.renewalPeriodMonths == null || contract.renewalPeriodMonths===""
      ? NaN : Number(contract.renewalPeriodMonths);
    const today=asOf instanceof Date ? asOf : validDate(asOf);
    const reference=today&&Number.isFinite(today.getTime()) ? today : new Date();
    const iso=value=>value.toISOString().slice(0,10);
    const shift=(value,months)=>{
      const lastOfMonth=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+1,0)).getUTCDate();
      const target=new Date(Date.UTC(value.getUTCFullYear(),value.getUTCMonth()+months,1));
      const lastTarget=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
      target.setUTCDate(value.getUTCDate()===lastOfMonth?lastTarget:Math.min(value.getUTCDate(),lastTarget));
      return target;
    };
    if (!Number.isInteger(notice)||notice<0)
      return {end:iso(initial),noticeBy:"",nextEnd:"",renewals:0};
    let end=initial,renewals=0;
    if(Number.isInteger(renewal)&&renewal>0){
      while(reference>shift(end,-notice)&&renewals<240){
        end=shift(end,renewal);
        renewals++;
      }
    }
    return {
      end:iso(end),
      noticeBy:iso(shift(end,-notice)),
      nextEnd:Number.isInteger(renewal)&&renewal>0?iso(shift(end,renewal)):"",
      renewals,
    };
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
    const text=String(value).slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return null;
    const date = new Date(text + "T00:00:00Z");
    return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===text ? date : null;
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

    if ((startValue&&!start)||(endValue&&!end)||(start && end && end < start))
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
  // Classification is independent from funding. Existing activities without an
  // explicit assessment retain their legacy category until assessed.
  function activityEconomics(data, activity, year) {
    const contract=(data.contracts||[]).find(c=>c.id===activity.contractId);
    const property=(data.properties||[]).find(p=>p.id===(activity.propertyId||(data.objects||[]).find(o=>o.id===activity.objectId)?.propertyId||contract?.propertyId));
    const owner=(data.organizations||[]).find(o=>o.id===property?.ownerPartyId);
    const ownerName=String(owner?.name||"").toLocaleLowerCase("sv").trim();
    const special=owner?.investmentRule==="stadsfastigheter" ||
      (!owner?.investmentRule && ownerName.includes("stadsfastigheter"));
    const ownerLimit=Number(owner?.investmentThreshold);
    const pbb=Number((data.priceBaseAmounts||[]).find(p=>Number(p.year)===Number(year))?.amount);
    const threshold=special
      ? (Number.isFinite(ownerLimit)&&ownerLimit>0?ownerLimit:200000)
      : (Number.isFinite(pbb)&&pbb>0?pbb/2:null);
    const amount=number(activity.estimatedCost);
    const enhancing=activity.actionKind==="value_enhancing" || activity.standardEnhancing===true;
    const assessed=activity.actionKind==="like_for_like" || activity.actionKind==="value_enhancing" ||
      typeof activity.standardEnhancing==="boolean";
    const kind=!assessed?"unassessed":threshold==null?"missing_base_amount":
      special?(amount>threshold?"investment":"operating"):
      (enhancing&&amount>threshold?"investment":"operating");
    const rate=Number.isFinite(Number(owner?.rentSurchargeRate)) && owner?.rentSurchargeRate!=="" &&
      owner?.rentSurchargeRate!=null?Number(owner.rentSurchargeRate):7.5;
    const rentFinanced=special&&kind==="investment";
    return {kind,threshold,special,ownerId:owner?.id||"",rate,annualRentAddition:rentFinanced?amount*rate/100:0,
      rentFinanced,rentStartDate:activity.rentSurchargeStartDate||""};
  }
  const budgetIncluded = (x) =>
    x?.budgetIncluded !== false && x?.includeInBudget !== "Nej" &&
    x?.financingMethod !== "rent_supplement" && x?.project2027RentSurcharge !== true;
  function activityPlannedInYear(activity, year) {
    const targetYear = number(year);
    const allocations = Array.isArray(activity?.yearAllocations) ? activity.yearAllocations : [];
    if (allocations.some(row => Number(row.year) === targetYear)) return true;
    const startValue = activity?.startDate, endValue = activity?.endDate;
    const start = startValue ? validDate(startValue) : null;
    const end = endValue ? validDate(endValue) : null;
    if ((startValue && !start) || (endValue && !end)) return false;
    if (start || end) {
      const first = start ? start.getUTCFullYear() : end.getUTCFullYear();
      const last = end ? end.getUTCFullYear() : start.getUTCFullYear();
      return targetYear >= first && targetYear <= last;
    }
    const plannedYear = number(activity?.planningYear);
    if (plannedYear) return plannedYear === targetYear;
    return number(activity?.["budgetAmount" + targetYear]) > 0;
  }

  function activityBudgetAmount(activity, year) {
    const targetYear = number(year);
    const allocations = Array.isArray(activity?.yearAllocations) ? activity.yearAllocations : [];
    // Year allocations are authoritative, including an explicitly budgeted zero.
    const entry = allocations.find(row => Number(row.year) === targetYear);
    if (entry) return Math.max(0, number(entry.amount));
    // Never repeat the same legacy estimate over several years.
    const start = activity?.startDate ? validDate(activity.startDate) : null;
    const end = activity?.endDate ? validDate(activity.endDate) : null;
    if((activity?.startDate&&!start)||(activity?.endDate&&!end)||(start&&end&&end<start))return 0;
    const firstYear = start?.getUTCFullYear(), lastYear = end?.getUTCFullYear();
    const spansYears = Boolean(firstYear && lastYear && firstYear !== lastYear);
    const explicit = number(activity?.["budgetAmount" + targetYear]);
    if (explicit > 0) return explicit;
    if (start && end && end >= start) {
      const first=start.getUTCFullYear()*12+start.getUTCMonth(),last=end.getUTCFullYear()*12+end.getUTCMonth();
      const months=Math.max(0,Math.min(last,targetYear*12+11)-Math.max(first,targetYear*12)+1);
      return number(activity?.estimatedCost)*months/(last-first+1);
    }
    if (spansYears) return 0;
    if (number(activity?.planningYear) && number(activity.planningYear) !== targetYear) return 0;
    return number(activity?.estimatedCost);
  }

  // Last confirmed CPI, not an October prediction. Reuse the built-in SCB October
  // series only as a fallback when the connected index file has no newer data.
  function latestKnownKpi(data, year, preferredBase="1980") {
    const targetYear=number(year)-1,base=seriesBase(preferredBase)||"1980";
    const rows=((data&&data.indexSeries)||[]).filter(x=>{
      const y=Number(x.year),m=Number(x.month)||(/oktober/i.test(x.period||"")?10:0);
      return Number.isInteger(y)&&Number.isInteger(m)&&m>=1&&m<=12&&
        (y<targetYear||(y===targetYear&&m<=10))&&number(x.value)>0&&
        (!x.seriesBase||seriesBase(x.seriesBase)===base)&&
        !x.preliminary&&!/prelim|prognos/i.test(x.source||"");
    }).map(x=>({...x,month:Number(x.month)||10}));
    if(base==="1980"){
      // Defaults stop at the last published year in this embedded reference table.
      const fallback=defaultOctober(Math.min(targetYear,2025));
      if(fallback&&!rows.some(x=>Number(x.year)===Number(fallback.year)&&Number(x.month)===10))
        rows.push(fallback);
    }
    rows.sort((a,b)=>Number(b.year)-Number(a.year)||Number(b.month)-Number(a.month));
    const latest=rows[0];
    if(!latest)return {value:0,year:0,month:0,source:"",status:"Saknas"};
    const clash=rows.filter(x=>Number(x.year)===Number(latest.year)&&Number(x.month)===Number(latest.month));
    if(new Set(clash.map(x=>number(x.value))).size>1)
      return {value:0,year:Number(latest.year),month:Number(latest.month),source:"Motstridiga KPI-uppgifter",status:"Behöver kontroll"};
    return {value:number(latest.value),year:Number(latest.year),month:Number(latest.month),
      source:latest.source||"SCB KPI",status:"Fastställd"};
  }
  function budgetIndex(data, year, preliminaryIndex, preferredBase="1980", options={}) {
    const indexYear=number(year)-1;
    preferredBase=seriesBase(preferredBase)||"1980";
    const entries=((data&&data.indexSeries)||[]).filter(x=>Number(x.year)===indexYear&&number(x.value)>0&&
      (!x.seriesBase||seriesBase(x.seriesBase)===preferredBase));
    const octoberEntries=entries.filter(x=>Number(x.month)===10||String(x.period||"").toLowerCase()==="oktober");
    if(new Set(octoberEntries.map(x=>number(x.value))).size>1)
      return {year:indexYear,month:10,value:0,source:"Motstridiga oktoberindex",status:"Behöver kontroll"};
    const row=october((data&&data.indexSeries)||[],indexYear,preferredBase);
    if(row?.seriesBase&&seriesBase(row.seriesBase)!==preferredBase)
      return {year:indexYear,month:10,value:0,source:"KPI-seriernas bas skiljer sig",status:"Behöver kontroll"};
    const own=options.scenario===true?number(preliminaryIndex):0;
    if(own>0)return {year:indexYear,month:10,value:own,source:"Budgetscenario · eget KPI",status:"Preliminär"};
    const known=row&&!row.preliminary&&!/prelim|prognos/i.test(row.source||"")?number(row.value):0;
    if(known)return {year:indexYear,month:10,value:known,source:row.source||"SCB KPI",status:"Fastställd"};
    const latest=latestKnownKpi(data,year,preferredBase);
    if(latest.status==="Behöver kontroll")return {year:indexYear,month:latest.month,value:0,source:latest.source,status:"Behöver kontroll"};
    return {year:indexYear,month:latest.month,value:latest.value,
      source:latest.value?"Senast kända KPI ("+latest.year+"-"+String(latest.month).padStart(2,"0")+")":"",
      status:latest.value?"Preliminär":"Saknas"};
  }

  function budgetScenarioIndex(data,year,preliminaryIndex,preferredBase="1980"){
    return budgetIndex(data,year,preliminaryIndex,preferredBase,{scenario:true});
  }

  function budgetGroup(row) { return row.category==='Hyra + drift'?'Hyra':row.category==='Projekt'?'Investering':'Drift'; }
  function budgetRowKey(row) {return [row.sourceType||'legacy',row.sourceId||row.contractId||row.source,row.category,row.sourceType?'':row.sub||''].join('|');}
  function budgetProposal(data,year,{strict=false}={}) {
    if(strict){
      if((data.contracts||[]).some(c=>budgetPeriod(c,year).invalid))throw Error('Budgeten innehåller ett avtal med ogiltiga datum');
      if((data.activities||[]).some(a=>budgetIncluded(a)&&((a.startDate&&!validDate(a.startDate))||(a.endDate&&!validDate(a.endDate))||(a.startDate&&a.endDate&&a.endDate<a.startDate))))throw Error('Budgeten innehåller en aktivitet med ogiltiga datum');
    }
    const rows=budgetScenarioRows(data,year).map(row=>({...row,baseAmount:row.amount,adjustmentAmount:0,budgetGroup:budgetGroup(row)}));
    const plan=(data.budgetPlans||[]).find(p=>Number(p.year)===Number(year));
    for(const row of rows){const override=plan?.rowAdjustments?.[budgetRowKey(row)];if(override)row.included=override.included!==false;}
    for(const group of ['Hyra','Investering','Drift']) {
      const members=rows.filter(r=>r.budgetGroup===group&&r.included!==false),total=members.reduce((n,r)=>n+r.baseAmount,0);
      const adjustment=number(plan?.adjustments?.[group]);
      if(adjustment&&!total){if(strict)throw Error('Justering för '+group+' saknar objekt att fördelas på');continue;}
      let remaining=adjustment;
      members.forEach((r,i)=>{r.adjustmentAmount=i===members.length-1?remaining:Math.round(adjustment*r.baseAmount/total*100)/100;remaining-=r.adjustmentAmount;r.amount=r.baseAmount+r.adjustmentAmount;});
    }
    for(const row of rows) {
      const override=plan?.rowAdjustments?.[budgetRowKey(row)];
      const saved=(plan?.lines||[]).find(line=>budgetRowKey(line)===budgetRowKey(row));
      row.manualAdjustmentAmount=override?number(override.amount):saved?.baseAmount!=null?number(saved.amount)-number(saved.baseAmount)-number(saved.adjustmentAmount):0;
      if(!override&&saved?.included===false)row.included=false;
      row.amount+=row.manualAdjustmentAmount;
    }
    if(strict&&rows.some(r=>r.included!==false&&r.status==='Behöver kontroll'))throw Error('Kontrollera hyresvillkor och index innan budgeten låses');
    for(const line of (plan?.lines||[]).filter(line=>line.sourceType==='manual'))rows.push({...line,baseAmount:line.baseAmount??line.amount,budgetGroup:budgetGroup(line)});
    return rows;
  }
  function budgetRows(data, year, contracts, properties, options={}) {
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
          propertyId:x.propertyId||(data.objects||[]).find(o=>o.id===x.objectId)?.propertyId||contract?.propertyId||(data.objects||[]).find(o=>o.id===contract?.objectId)?.propertyId||"",
          objectId:x.objectId||contract?.objectId||"",
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
      const v = annualValues(c, year, options.scenario===true?plan?.preliminaryIndex:0, data.indexSeries, {scenario:options.scenario===true});
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
          activityPlannedInYear(x, year) &&
          budgetIncluded(x) &&
          x.status !== "Avslaget",
      )
      .forEach((x) => {
        const economics = activityEconomics(data,x,year);
        if (economics.rentFinanced) return;
        let category = economics.kind==="investment" ? "Projekt" :
          economics.kind==="operating" ? "Driftkostnader" :
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
            activityBudgetAmount(x, year),
            "activity",
            x.title,
          );
      });

    // The same recurring cost contributes to each year in its active period.
    // Its scope is either one property or one agreement, never both.
    (data.recurringCosts || [])
      .filter((x) => root.LokalblickRecurringCosts.annualBudget(x, year) > 0)
      .forEach((x) =>
        add(x, "Driftkostnader", root.LokalblickRecurringCosts.annualBudget(x, year), "recurringCost", x.name),
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
  // Budget proposals and live what-if views use this explicit projection.
  // Operational listings and contract summaries must call budgetRows instead.
  function budgetScenarioRows(data,year,contracts,properties){
    return budgetRows(data,year,contracts,properties,{scenario:true});
  }
  function summarize(rows) {
    return rows.reduce((out, x) => {
      out[x.category] = (out[x.category] || 0) + number(x.amount);
      return out;
    }, {});
  }
  function actualRows(data, year, contracts) {
    const ids = new Set((contracts || data.contracts || []).map((c) => c.id)),
      pids = new Set(contracts
        ? contracts.map(c => c.propertyId || (data.objects || []).find(o => o.id === c.objectId)?.propertyId).filter(Boolean)
        : [
            ...(data.properties || []).map(p => p.id),
            ...(data.contracts || []).map(c => c.propertyId || (data.objects || []).find(o => o.id === c.objectId)?.propertyId).filter(Boolean),
          ]);
    const rows = [];
    (data.recurringCosts || [])
      .filter((x) => (x.contractId ? ids.has(x.contractId) : pids.has(x.propertyId)))
      .forEach((x) => {
        const amount = root.LokalblickRecurringCosts.annualActual(x, year);
        if (amount) rows.push({
          category: "Driftkostnader",
          amount,
          sourceId: x.id,
          sourceType: "recurringCost",
        });
      });
    (data.orders || []).forEach((order) => {
      const activity=(data.activities||[]).find((x)=>x.id===order.activityId);
      if(!activity || !activityPlannedInYear(activity, year)) return;
      const propertyId=activity.propertyId || (data.contracts||[]).find((c)=>c.id===activity.contractId)?.propertyId || "";
      if(activity.contractId ? !ids.has(activity.contractId) : !pids.has(propertyId)) return;
      const category=activity.budgetCategory || {Projekt:"Projekt",Underhåll:"Underhåll",Drift:"Driftkostnader",Utredning:"Utredningar"}[activity.type];
      const amount=number(order.finalCost);
      if(category && category!=="Ej budget" && amount) rows.push({category,amount,sourceId:activity.id,orderId:order.id});
    });
    (data.activities || []).filter((x)=>!(data.orders||[]).some((o)=>o.activityId===x.id)).filter((x)=>activityPlannedInYear(x,year)&&(x.contractId?ids.has(x.contractId):pids.has(x.propertyId))).forEach((x)=>{const category=x.budgetCategory||{Projekt:"Projekt",Underhåll:"Underhåll",Drift:"Driftkostnader",Utredning:"Utredningar"}[x.type];const amount=number(x.finalCost);if(category&&category!=="Ej budget"&&amount)rows.push({category,amount,sourceId:x.id});});
    return rows;
  }
  root.LokalblickCalculations = {
    october,
    defaultOctober,
    defaultOctoberSeries:()=>Object.entries(DEFAULT_OCTOBER_1980).map(([year,value])=>({year:Number(year),month:10,value,seriesBase:"1980",source:"SCB KPI · fastställt oktober"})),
    indexedAmount,
    component,
    annualValues,
    propertyAnnualCost,
    noticeDate,
    projectedContractTerm,
    yearFactor,
    budgetPeriod,
    budgetYearFactor,
    activityPlannedInYear,
    activityBudgetAmount,
    activityEconomics,
    budgetRowKey,
    budgetGroup,
    budgetProposal,
    budgetIndex,
    budgetScenarioIndex,
    budgetScenarioRows,
    latestKnownKpi,
    budgetRows,
    actualRows,
    summarize,
  };
})(globalThis);
