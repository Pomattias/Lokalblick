// Secondary contract enrichment adapter for Lokalblick.
// Keeps INT/EXT (or the canonical Lokalblick workbook) as the contract identity source.
// The enrichment workbook is read-only and may only enrich already existing contracts.
(function () {
  function text(v){ return String(v == null ? "" : v).replace(/\u00a0/g," ").trim(); }
  function norm(v){
    return text(v).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9åäö]+/g," ")
      .replace(/\s+/g," ").trim();
  }
  function compact(v){ return norm(v).replace(/\s+/g,""); }
  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function num(v){
    if(typeof v==="number") return Number.isFinite(v)?v:0;
    var s=text(v).replace(/\s/g,"").replace(/kr|sek/gi,"").replace(/%/g,"");
    if(!s) return 0;
    if(s.indexOf(",")>=0 && s.indexOf(".")>=0) s=s.replace(/\./g,"").replace(",",".");
    else if(s.indexOf(",")>=0) s=s.replace(",",".");
    var n=Number(s.replace(/[^0-9+\-.]/g,""));
    return Number.isFinite(n)?n:0;
  }
  function percent(v){
    var n=num(v);
    if(!n) return 0;
    return n > 1 ? n/100 : n;
  }
  function excelDate(v){
    if(!v) return "";
    if(v instanceof Date) return v.toISOString().slice(0,10);
    if(typeof v==="number" && v>20000 && v<80000){
      return new Date(Math.round((v-25569)*86400*1000)).toISOString().slice(0,10);
    }
    var s=text(v);
    if(!s || /tillsv|tillsvidare/i.test(s)) return "";
    var m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if(m) return m[1]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0");
    return s;
  }
  function yesNo(v){
    var s=norm(v);
    if(!s) return "";
    if(/^(ja|j|yes|1|x)$/.test(s)) return "Ja";
    if(/^(nej|n|no|0)$/.test(s)) return "Nej";
    return text(v);
  }
  function hash(value){
    var h=2166136261,s=String(value||"");
    for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
    return (h>>>0).toString(36).toUpperCase();
  }
  function matrix(workbook,name){
    var sheet=workbook.Sheets[name];
    return sheet ? XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true}) : [];
  }
  function normalizedHeader(v){ return norm(v); }
  function headerIndex(row){
    var map={};
    (row||[]).forEach(function(v,i){
      var key=normalizedHeader(v);
      if(!key) return;
      if(!map[key]) map[key]=[];
      map[key].push(i);
    });
    return map;
  }
  function findCol(headers, aliases, occurrence){
    occurrence=Number(occurrence)||0;
    for(var a=0;a<aliases.length;a++){
      var hits=headers[normalizedHeader(aliases[a])]||[];
      if(hits.length>occurrence) return hits[occurrence];
      if(hits.length && occurrence===0) return hits[0];
    }
    return -1;
  }
  function findRegexCol(row, regex, occurrence){
    occurrence=Number(occurrence)||0;
    var hits=[];
    (row||[]).forEach(function(v,i){ if(regex.test(norm(v))) hits.push(i); });
    return hits.length>occurrence ? hits[occurrence] : -1;
  }
  function cell(row,headers,aliases,occurrence){
    var i=findCol(headers,aliases,occurrence);
    return i>=0 ? row[i] : "";
  }
  function valueAt(row,index){ return index>=0 ? row[index] : ""; }
  function detectHeader(workbook){
    var best=null;
    (workbook.SheetNames||[]).forEach(function(name){
      var data=matrix(workbook,name);
      for(var r=0;r<Math.min(data.length,12);r++){
        var h=headerIndex(data[r]);
        var score=0;
        [
          ["FASTIGHETSBETECKNING","Fastighetsbeteckning"],
          ["Adress"],["Avtalsnummer"],["VERKSAMHET","Verksamhet"],
          ["Avtalstyp"],["Hyresvärd"],["Fr.o.m.","From"],["kvm","Area"]
        ].forEach(function(aliases){ if(findCol(h,aliases)>=0) score++; });
        if(score>=6 && (!best || score>best.score)) best={sheet:name,row:r,headers:h,headerRow:data[r],score:score};
      }
    });
    return best;
  }
  function detect(workbook){ return Boolean(detectHeader(workbook)); }

  function ensureOrg(data,name,type){
    var label=text(name); if(!label) return "";
    data.organizations=Array.isArray(data.organizations)?data.organizations:[];
    var existing=data.organizations.find(function(o){return norm(o.name)===norm(label) && o.type===type;});
    if(existing) return existing.id;
    var id="ORG|"+hash(type+"|"+label);
    data.organizations.push({id:id,name:label,type:type,ownerClass:type==="owner"?"Extern":""});
    return id;
  }
  function unitId(v){
    var s=norm(v);
    if(s==="ordbo") return "ORDBO";
    if(s==="hof" || s.indexOf("halsa")>=0) return "HOF";
    if(s.indexOf("sabo")>=0 || s.indexOf("sabo")>=0 || s.indexOf("vardbo")>=0) return "VARDBO";
    if(s.indexOf("mynd")>=0 || s.indexOf("stab")>=0) return "MYND_STAB";
    return "";
  }
  function propertyForRow(data,designation,address){
    var d=norm(designation),a=compact(address);
    var byDesignation=d ? (data.properties||[]).filter(function(p){return norm(p.designation)===d;}) : [];
    if(byDesignation.length===1) return {property:byDesignation[0],strength:"designation"};
    var byAddress=a ? (data.properties||[]).filter(function(p){
      var pa=compact(p.address);
      return pa && (pa===a || pa.indexOf(a)>=0 || a.indexOf(pa)>=0);
    }) : [];
    if(byAddress.length===1) return {property:byAddress[0],strength:"address"};
    return {property:null,strength:""};
  }
  function normalizeContractNo(v){ return text(v).replace(/\s/g,"").toUpperCase(); }
  function scoreContract(data, contract, rowData){
    var score=0, reasons=[];
    var property=(data.properties||[]).find(function(p){return p.id===contract.propertyId;});
    if(rowData.designation && property && norm(property.designation)===norm(rowData.designation)){score+=40;reasons.push("fastighetsbeteckning");}
    if(rowData.address && property){
      var a=compact(rowData.address),pa=compact(property.address);
      if(a&&pa&&(a===pa||a.indexOf(pa)>=0||pa.indexOf(a)>=0)){score+=30;reasons.push("adress");}
    }
    if(rowData.start && contract.start && rowData.start===contract.start){score+=15;reasons.push("start");}
    if(rowData.use && contract.use && norm(rowData.use)===norm(contract.use)){score+=8;reasons.push("verksamhet");}
    if(rowData.category && contract.category && norm(rowData.category)===norm(contract.category)){score+=5;reasons.push("avtalstyp");}
    if(rowData.area && contract.area){
      var delta=Math.abs(Number(rowData.area)-Number(contract.area));
      if(delta<=1){score+=8;reasons.push("area");}
      else if(delta<=Math.max(5,Number(contract.area)*0.03)){score+=4;reasons.push("area nära");}
    }
    return {score:score,reasons:reasons};
  }
  function matchContract(data,rowData){
    var number=normalizeContractNo(rowData.number);
    if(number){
      var exact=(data.contracts||[]).filter(function(c){return normalizeContractNo(c.number||c.sourceId)===number;});
      if(exact.length===1) return {contract:exact[0],method:"Avtalsnummer",score:100,reasons:["avtalsnummer"]};
      if(exact.length>1) return {contract:null,method:"Avtalsnummer",score:100,ambiguous:true,candidates:exact.map(function(c){return c.id;})};
    }
    var propertyMatch=propertyForRow(data,rowData.designation,rowData.address);
    var candidates=(data.contracts||[]).filter(function(c){return !propertyMatch.property || c.propertyId===propertyMatch.property.id;});
    var scored=candidates.map(function(c){
      var result=scoreContract(data,c,rowData);
      return {contract:c,score:result.score,reasons:result.reasons};
    }).sort(function(a,b){return b.score-a.score;});
    if(!scored.length || scored[0].score<55) return {contract:null,method:"Poäng",score:scored.length?scored[0].score:0,candidates:scored.slice(0,3).map(function(x){return x.contract.id;})};
    if(scored[1] && scored[1].score>=scored[0].score-8) return {contract:null,method:"Poäng",score:scored[0].score,ambiguous:true,candidates:scored.slice(0,3).map(function(x){return x.contract.id;})};
    return {contract:scored[0].contract,method:"Poäng",score:scored[0].score,reasons:scored[0].reasons};
  }

  function indexValue(series,year){
    year=Number(year)||0;
    var rows=(series||[]).filter(function(x){return Number(x.year)===year;});
    if(!rows.length) return 0;
    var october=rows.find(function(x){return Number(x.month)===10 || norm(x.period)==="oktober";});
    return Number((october||rows[0]).value)||0;
  }
  function indexedAmount(baseAmount,baseIndex,indexShare,currentIndex){
    baseAmount=Number(baseAmount)||0;baseIndex=Number(baseIndex)||0;indexShare=Number(indexShare)||0;currentIndex=Number(currentIndex)||0;
    if(!baseAmount || !baseIndex || !currentIndex) return 0;
    return baseAmount * (1 + indexShare * ((currentIndex/baseIndex)-1));
  }
  function toleranceDiff(actual,calculated){
    actual=Number(actual)||0;calculated=Number(calculated)||0;
    if(!actual||!calculated) return 0;
    return actual-calculated;
  }

  function parseIndexWorkbook(workbook,fileName){
    var rows=[];
    (workbook.SheetNames||[]).forEach(function(name){
      var data=matrix(workbook,name);
      if(!data.length) return;
      for(var hr=0;hr<Math.min(data.length,10);hr++){
        var h=headerIndex(data[hr]);
        var yearCol=findCol(h,["År","Ar","Year"]);
        var valueCol=findCol(h,["Oktober","KPI oktober","Indextal","Index","Bastal","KPI"]);
        if(yearCol<0 || valueCol<0) continue;
        for(var r=hr+1;r<data.length;r++){
          var year=Number(valueAt(data[r],yearCol))||0;
          var value=num(valueAt(data[r],valueCol));
          if(year>=1900 && year<=2200 && value) rows.push({year:year,month:10,value:value,source:fileName||name});
        }
        if(rows.length) return;
      }
    });
    var map=new Map();
    rows.forEach(function(x){map.set(String(x.year)+"|"+String(x.month),x);});
    return Array.from(map.values()).sort(function(a,b){return a.year-b.year;});
  }

  function findFinancialColumns(headerRow,headers){
    var rentCurrent=findRegexCol(headerRow,/^hyra 20\d\d$/,0);
    var targetYear=0;
    if(rentCurrent>=0){
      var m=norm(headerRow[rentCurrent]).match(/(20\d\d)/);
      if(m) targetYear=Number(m[1]);
    }
    var genericBaseYear=findCol(headers,["Basår","Basar"],0);
    var genericBaseYear2=findCol(headers,["Basår","Basar"],1);
    var genericBaseIndex=findCol(headers,["Bastal","Basindex","Bas index"],0);
    var genericBaseIndex2=findCol(headers,["Bastal","Basindex","Bas index"],1);
    var genericShare=findCol(headers,["Index procent","Indexprocent","Index %"],0);
    var genericShare2=findCol(headers,["Index procent","Indexprocent","Index %"],1);
    return {
      targetYear:targetYear,
      rentCurrent:rentCurrent,
      baseRent:findCol(headers,["Grundhyra","Bashyra"]),
      baseAddition:findCol(headers,["Tillägg","Tillagg"],0),
      currentAddition:findCol(headers,["Tillägg","Tillagg"],1),
      currentTax:findCol(headers,["F-skatt","F skatt","Fastighetsskatt"],0),
      rentPerSqm:findCol(headers,["Hyra (kr/kvm)","Hyra kr/kvm","Kr/kvm"]),
      rentBaseYear:(findCol(headers,["Hyra basår","Hyra basar","Basår hyra","Basar hyra"])>=0?findCol(headers,["Hyra basår","Hyra basar","Basår hyra","Basar hyra"]):genericBaseYear),
      rentBaseIndex:(findCol(headers,["Hyra bastal","Bastal hyra","Hyra basindex"])>=0?findCol(headers,["Hyra bastal","Bastal hyra","Hyra basindex"]):genericBaseIndex),
      rentShare:(findCol(headers,["Hyra index procent","Index procent hyra","Hyra index %"])>=0?findCol(headers,["Hyra index procent","Index procent hyra","Hyra index %"]):genericShare),
      additionBaseYear:(findCol(headers,["Tillägg basår","Tillagg basar","Basår tillägg","Basar tillagg"])>=0?findCol(headers,["Tillägg basår","Tillagg basar","Basår tillägg","Basar tillagg"]):(genericBaseYear2>=0?genericBaseYear2:genericBaseYear)),
      additionBaseIndex:(findCol(headers,["Tillägg bastal","Tillagg bastal","Bastal tillägg","Bastal tillagg"])>=0?findCol(headers,["Tillägg bastal","Tillagg bastal","Bastal tillägg","Bastal tillagg"]):(genericBaseIndex2>=0?genericBaseIndex2:genericBaseIndex)),
      additionShare:(findCol(headers,["Tillägg index procent","Tillagg index procent","Index procent tillägg","Index procent tillagg"])>=0?findCol(headers,["Tillägg index procent","Tillagg index procent","Index procent tillägg","Index procent tillagg"]):(genericShare2>=0?genericShare2:genericShare))
    };
  }

  function parseRows(workbook,hit){
    var data=matrix(workbook,hit.sheet),headers=hit.headers,headerRow=hit.headerRow;
    var finance=findFinancialColumns(headerRow,headers);
    return data.slice(hit.row+1).map(function(row,offset){
      var designation=text(cell(row,headers,["FASTIGHETSBETECKNING","Fastighetsbeteckning"]));
      var address=text(cell(row,headers,["Adress","Gatuadress"]));
      var number=text(cell(row,headers,["Avtalsnummer","Avtal"]));
      var use=text(cell(row,headers,["VERKSAMHET","Verksamhet"]));
      var category=text(cell(row,headers,["Avtalstyp","Avtalstyp"]));
      var baseRent=num(valueAt(row,finance.baseRent));
      var baseAddition=num(valueAt(row,finance.baseAddition));
      var annualRent=num(valueAt(row,finance.rentCurrent));
      var annualAddition=num(valueAt(row,finance.currentAddition));
      return {
        sourceRow:hit.row+2+offset,
        designation:designation,address:address,number:number,
        comment:text(cell(row,headers,["Kommentar"])),use:use,department:text(cell(row,headers,["AVDELNING","Avdelning"])),
        category:category,landlord:text(cell(row,headers,["Hyresvärd","Hyresvard"])),
        start:excelDate(cell(row,headers,["Fr.o.m.","Fr o m","Start"])),
        end:excelDate(cell(row,headers,["T.o.m.","T o m","Slut"])),
        notice:excelDate(cell(row,headers,["Sägs upp senast","Sags upp senast"])),
        noticePeriodMonths:num(cell(row,headers,["Uppsägningstid månader","Uppsagningstid månader","Uppsägningstid"])),
        renewalPeriodMonths:num(cell(row,headers,["Förlängningstid månader","Forlangningstid månader","Förlängningstid"])),
        area:num(cell(row,headers,["kvm","Area"])),
        costCenterOperations:text(cell(row,headers,["Kstl drift","Kostnadsställe drift"])),
        costCenterPremises:text(cell(row,headers,["Kstl lokaler","Kostnadsställe lokaler"])),
        ekotObject:text(cell(row,headers,["Objekt i Ekot","Ekot objekt"])),
        originalTerm:text(cell(row,headers,["Ursprungliga avtalstid","Ursprunglig avtalstid"])),
        baseRent:baseRent,baseAdditions:baseAddition,annualRent:annualRent,annualAdditions:annualAddition,
        annualPropertyTax:num(valueAt(row,finance.currentTax)),rentPerSqm:num(valueAt(row,finance.rentPerSqm)),
        rentBaseYear:num(valueAt(row,finance.rentBaseYear)),rentBaseIndex:num(valueAt(row,finance.rentBaseIndex)),rentIndexPercent:percent(valueAt(row,finance.rentShare)),
        additionBaseYear:num(valueAt(row,finance.additionBaseYear)),additionBaseIndex:num(valueAt(row,finance.additionBaseIndex)),additionIndexPercent:percent(valueAt(row,finance.additionShare)),
        targetYear:finance.targetYear,
        mediaWaste:yesNo(cell(row,headers,["Sopor"])),mediaElectricity:yesNo(cell(row,headers,["El"])),
        mediaWater:yesNo(cell(row,headers,["VA","Vatten"])),mediaHeating:yesNo(cell(row,headers,["Värme","Varme"])),
        mediaHotWater:yesNo(cell(row,headers,["VV","Varmvatten"])),mediaVentilation:yesNo(cell(row,headers,["Vent","Ventilation"])),
        mediaOutdoor:yesNo(cell(row,headers,["Utem.","Utemiljö","Utemiljo"])),mediaPropertyTax:yesNo(cell(row,headers,["f-skatt","F skatt media"],1))
      };
    }).filter(function(r){
      // Skip total/summary rows and entirely empty rows.
      return Boolean(r.designation || r.address || r.number || r.use) && !( !r.designation && !r.address && !r.number );
    });
  }

  function setIfBlank(target,key,value){
    if(value==="" || value==null || value===0) return;
    if(target[key]==="" || target[key]==null || target[key]===0) target[key]=value;
  }
  function enrich(workbook,baseData,fileName){
    var hit=detectHeader(workbook);
    if(!hit) throw new Error("Avtalsfilen känns inte igen. Kontrollera att rubriker som Fastighetsbeteckning, Adress, Avtalsnummer, Verksamhet och Hyresvärd finns.");
    var data=clone(baseData||{});
    data.contracts=Array.isArray(data.contracts)?data.contracts:[];
    data.properties=Array.isArray(data.properties)?data.properties:[];
    data.organizations=Array.isArray(data.organizations)?data.organizations:[];
    data.indexSeries=Array.isArray(data.indexSeries)?data.indexSeries:[];
    var rows=parseRows(workbook,hit);
    var report={
      profile:"Avtalsberikning v1",fileName:fileName||"",sheet:hit.sheet,sourceRows:rows.length,
      matched:[],needsReview:[],unmatched:[],discrepancies:[],warnings:[],reconciliation:{}
    };

    rows.forEach(function(r){
      var match=matchContract(data,r);
      if(!match.contract){
        var entry={sourceRow:r.sourceRow,number:r.number,designation:r.designation,address:r.address,score:match.score||0,candidates:match.candidates||[]};
        if(match.ambiguous) report.needsReview.push(entry); else report.unmatched.push(entry);
        return;
      }
      var c=match.contract;
      var property=(data.properties||[]).find(function(p){return p.id===c.propertyId;});
      if(r.area && c.area && Math.abs(Number(r.area)-Number(c.area))>Math.max(1,Number(c.area)*0.01)){
        report.discrepancies.push({contractId:c.id,field:"area",primary:c.area,enrichment:r.area,sourceRow:r.sourceRow});
      }
      if(r.start && c.start && r.start!==c.start) report.discrepancies.push({contractId:c.id,field:"start",primary:c.start,enrichment:r.start,sourceRow:r.sourceRow});
      if(r.end && c.end && r.end!==c.end) report.discrepancies.push({contractId:c.id,field:"end",primary:c.end,enrichment:r.end,sourceRow:r.sourceRow});

      // Identity / core terms: INT/EXT remains authoritative. Only fill blanks.
      setIfBlank(c,"number",r.number); setIfBlank(c,"area",r.area); setIfBlank(c,"category",r.category);
      setIfBlank(c,"use",r.use); setIfBlank(c,"start",r.start); setIfBlank(c,"end",r.end); setIfBlank(c,"notice",r.notice);
      setIfBlank(c,"unitId",unitId(r.department));
      if(property){
        setIfBlank(property,"designation",r.designation); setIfBlank(property,"address",r.address);
        setIfBlank(property,"owner",r.landlord);
      }
      if(r.landlord){
        var ownerId=ensureOrg(data,r.landlord,"owner");
        setIfBlank(c,"ownerOrgId",ownerId);
      }

      // Enrichment-owned fields may be refreshed from the enrichment source.
      var values={
        comment:r.comment,noticePeriodMonths:r.noticePeriodMonths,renewalPeriodMonths:r.renewalPeriodMonths,
        costCenterOperations:r.costCenterOperations,costCenterPremises:r.costCenterPremises,ekotObject:r.ekotObject,originalTerm:r.originalTerm,
        baseRent:r.baseRent,baseAdditions:r.baseAdditions,annualRent:r.annualRent,annualAdditions:r.annualAdditions,
        annualPropertyTax:r.annualPropertyTax,rentPerSqm:r.rentPerSqm,
        rentBaseYear:r.rentBaseYear,rentBaseIndex:r.rentBaseIndex,rentIndexPercent:r.rentIndexPercent,
        additionBaseYear:r.additionBaseYear,additionBaseIndex:r.additionBaseIndex,additionIndexPercent:r.additionIndexPercent,
        mediaWaste:r.mediaWaste,mediaElectricity:r.mediaElectricity,mediaWater:r.mediaWater,mediaHeating:r.mediaHeating,
        mediaHotWater:r.mediaHotWater,mediaVentilation:r.mediaVentilation,mediaOutdoor:r.mediaOutdoor,mediaPropertyTax:r.mediaPropertyTax,
        enrichmentSource:fileName||"",enrichmentSourceRow:r.sourceRow,enrichmentTargetYear:r.targetYear||0
      };
      Object.keys(values).forEach(function(key){ if(values[key]!=="" && values[key]!=null && values[key]!==0) c[key]=values[key]; });

      var targetYear=Number(r.targetYear)||0;
      var currentIndex=targetYear ? indexValue(data.indexSeries,targetYear) : 0;
      var rentBaseIndex=Number(r.rentBaseIndex)||indexValue(data.indexSeries,r.rentBaseYear);
      var additionBaseIndex=Number(r.additionBaseIndex)||indexValue(data.indexSeries,r.additionBaseYear);
      if(rentBaseIndex && !c.rentBaseIndex) c.rentBaseIndex=rentBaseIndex;
      if(additionBaseIndex && !c.additionBaseIndex) c.additionBaseIndex=additionBaseIndex;
      if(targetYear && currentIndex){
        if(r.baseRent && rentBaseIndex){
          c.calculatedAnnualRent=Math.round(indexedAmount(r.baseRent,rentBaseIndex,r.rentIndexPercent,currentIndex));
          c.rentIndexCurrent=currentIndex;
          c.rentCalculationYear=targetYear;
          c.rentCalculationVariance=Math.round(toleranceDiff(r.annualRent,c.calculatedAnnualRent));
        }
        if(r.baseAdditions && additionBaseIndex){
          c.calculatedAnnualAdditions=Math.round(indexedAmount(r.baseAdditions,additionBaseIndex,r.additionIndexPercent,currentIndex));
          c.additionIndexCurrent=currentIndex;
          c.additionCalculationYear=targetYear;
          c.additionCalculationVariance=Math.round(toleranceDiff(r.annualAdditions,c.calculatedAnnualAdditions));
        }
      } else if(targetYear && (rentBaseIndex || additionBaseIndex || r.rentBaseYear || r.additionBaseYear)) {
        report.warnings.push("KPI oktober "+targetYear+" saknas för indexberäkning.");
      }

      report.matched.push({sourceRow:r.sourceRow,contractId:c.id,number:c.number||"",method:match.method,score:match.score,reasons:match.reasons||[]});
    });

    report.counts={
      sourceRows:rows.length,matched:report.matched.length,needsReview:report.needsReview.length,
      unmatched:report.unmatched.length,discrepancies:report.discrepancies.length
    };
    report.warnings=Array.from(new Set(report.warnings));
    data.contractEnrichmentReport=clone(report);
    return {data:data,report:report};
  }

  function applyIndexSeries(baseData,series,fileName){
    var data=clone(baseData||{});
    data.indexSeries=series.slice();
    var recalculated=0,missing=0;
    (data.contracts||[]).forEach(function(c){
      var year=Number(c.enrichmentTargetYear)||0;
      if(!year) return;
      var current=indexValue(series,year);
      if(!current){missing++;return;}
      var rentBase=Number(c.rentBaseIndex)||indexValue(series,c.rentBaseYear);
      var additionBase=Number(c.additionBaseIndex)||indexValue(series,c.additionBaseYear);
      if(rentBase && !Number(c.rentBaseIndex)) c.rentBaseIndex=rentBase;
      if(additionBase && !Number(c.additionBaseIndex)) c.additionBaseIndex=additionBase;
      if(Number(c.baseRent)&&rentBase){
        c.calculatedAnnualRent=Math.round(indexedAmount(c.baseRent,rentBase,c.rentIndexPercent,current));
        c.rentIndexCurrent=current;c.rentCalculationYear=year;
        c.rentCalculationVariance=Math.round(toleranceDiff(c.annualRent,c.calculatedAnnualRent));recalculated++;
      }
      if(Number(c.baseAdditions)&&additionBase){
        c.calculatedAnnualAdditions=Math.round(indexedAmount(c.baseAdditions,additionBase,c.additionIndexPercent,current));
        c.additionIndexCurrent=current;c.additionCalculationYear=year;
        c.additionCalculationVariance=Math.round(toleranceDiff(c.annualAdditions,c.calculatedAnnualAdditions));recalculated++;
      }
    });
    data.indexSourceName=fileName||"KPI";
    return {data:data,report:{fileName:fileName||"",rows:series.length,recalculated:recalculated,missing:missing}};
  }

  window.LokalblickContractEnrichmentAdapter={
    id:"contract-enrichment-v1",
    label:"Avtalsberikning",
    detect:detect,
    enrich:enrich,
    parseIndexWorkbook:parseIndexWorkbook,
    applyIndexSeries:applyIndexSeries,
    indexedAmount:indexedAmount
  };
})();