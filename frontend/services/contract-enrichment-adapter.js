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
  function worksheetCell(workbook,sheetName,rowIndex,colIndex){
    if(colIndex<0 || rowIndex<0) return null;
    var sheet=workbook.Sheets[sheetName];
    if(!sheet || !XLSX || !XLSX.utils || !XLSX.utils.encode_cell) return null;
    return sheet[XLSX.utils.encode_cell({r:rowIndex,c:colIndex})] || null;
  }
  function formulaHyperlink(cell){
    var f=cell&&cell.f?String(cell.f):"";
    if(!f) return "";
    var m=f.match(/HYPERLINK\s*\(\s*["']([^"']+)["']/i);
    return m ? m[1] : "";
  }
  function hyperlinkTarget(cell){
    if(!cell) return "";
    if(cell.l && cell.l.Target) return text(cell.l.Target);
    return text(formulaHyperlink(cell));
  }
  function contractPdfLink(workbook,hit,rowIndex,rowData){
    var number=normalizeContractNo(rowData.number);
    var numberCol=findCol(hit.headers,["Avtalsnummer","Avtal"]);
    var direct=hyperlinkTarget(worksheetCell(workbook,hit.sheet,rowIndex,numberCol));
    if(direct) return direct;

    var preferred=[];
    (hit.headerRow||[]).forEach(function(v,i){
      var h=norm(v);
      if(/pdf|lank|länk|hyresavtal|avtalsdokument|dokument|avtalsfil/.test(h)) preferred.push(i);
    });
    for(var p=0;p<preferred.length;p++){
      var preferredTarget=hyperlinkTarget(worksheetCell(workbook,hit.sheet,rowIndex,preferred[p]));
      if(preferredTarget) return preferredTarget;
    }

    var sheet=workbook.Sheets[hit.sheet];
    var width=(hit.headerRow||[]).length;
    var fallback="";
    for(var col=0;col<width;col++){
      var target=hyperlinkTarget(worksheetCell(workbook,hit.sheet,rowIndex,col));
      if(!target) continue;
      if(!fallback) fallback=target;
      if(number){
        var decoded="";
        try{decoded=decodeURIComponent(target);}catch(_){decoded=target;}
        var tail=decoded.split(/[\\/]/).pop()||"";
        var fileStem=normalizeContractNo(tail.replace(/\.pdf(?:[?#].*)?$/i,""));
        if(fileStem===number || fileStem.indexOf(number)>=0 || number.indexOf(fileStem)>=0) return target;
      }
    }
    return fallback;
  }

  function documentKey(v){
    var s=text(v);
    try{s=decodeURIComponent(s);}catch(_){}
    s=(s.split(/[\\/]/).pop()||s).replace(/[?#].*$/,"");
    return s.replace(/\.pdf$/i,"").replace(/[^a-z0-9åäö]/gi,"").toUpperCase();
  }
  function candidateName(v){
    var s=text(v);
    try{s=decodeURIComponent(s);}catch(_){}
    return (s.split(/[\\/]/).pop()||s).replace(/[?#].*$/,"");
  }
  function scanRelationshipTargets(zip){
    var out=[];
    Object.keys(zip||{}).forEach(function(path){
      if(!/\.rels$/i.test(path)) return;
      var xml="";
      try{xml=fflate.strFromU8(zip[path]);}catch(_){return;}
      var re=/<Relationship\b([^>]+?)\/?>/gi,m;
      while((m=re.exec(xml))){
        var attrs=m[1]||"";
        var tm=attrs.match(/\bTarget="([^"]+)"/i);
        if(!tm) continue;
        var mm=attrs.match(/\bTargetMode="([^"]+)"/i);
        var typ=attrs.match(/\bType="([^"]+)"/i);
        var target=tm[1].replace(/&amp;/g,"&");
        var external=Boolean(mm&&/external/i.test(mm[1]));
        var type=typ?typ[1]:"";
        if(external || /\.pdf(?:[?#].*)?$/i.test(target) || /hyperlink|oleObject/i.test(type)){
          out.push({target:target,name:candidateName(target),key:documentKey(target),kind:external?"linked":"relationship",source:path});
        }
      }
    });
    return out;
  }
  function pdfNamesFromBinary(bytes){
    var values=[],ascii="";
    function add(s){
      s=String(s||"").trim();
      if(/\.pdf\b/i.test(s)&&values.indexOf(s)<0) values.push(s);
    }
    for(var i=0;i<bytes.length;i++){
      var b=bytes[i];
      if(b>=32&&b<=126) ascii+=String.fromCharCode(b);
      else { if(ascii.length>=5) add(ascii); ascii=""; }
    }
    if(ascii.length>=5) add(ascii);
    var wide="";
    for(var j=0;j+1<bytes.length;j+=2){
      var code=bytes[j]|(bytes[j+1]<<8);
      if(code>=32&&code<=126) wide+=String.fromCharCode(code);
      else { if(wide.length>=5) add(wide); wide=""; }
    }
    if(wide.length>=5) add(wide);
    return values.map(candidateName).filter(Boolean);
  }
  function rawPdfBytes(bytes){
    var start=-1,end=-1;
    for(var i=0;i+4<bytes.length;i++){
      if(bytes[i]===37&&bytes[i+1]===80&&bytes[i+2]===68&&bytes[i+3]===70&&bytes[i+4]===45){start=i;break;}
    }
    if(start<0) return null;
    for(var j=bytes.length-5;j>=start;j--){
      if(bytes[j]===37&&bytes[j+1]===37&&bytes[j+2]===69&&bytes[j+3]===79&&bytes[j+4]===70){end=j+5;break;}
    }
    return bytes.slice(start,end>0?end:bytes.length);
  }
  function scanWorkbookDocuments(arrayBuffer){
    var result={linked:[],embedded:[],all:[]};
    if(!arrayBuffer || !window.fflate) return result;
    var zip;
    try{zip=fflate.unzipSync(new Uint8Array(arrayBuffer));}catch(_){return result;}
    scanRelationshipTargets(zip).forEach(function(item){
      if(item.key){result.linked.push(item);result.all.push(item);}
    });
    Object.keys(zip).filter(function(path){return /^xl\/embeddings\/.+\.bin$/i.test(path);}).forEach(function(path){
      var bytes=zip[path],names=pdfNamesFromBinary(bytes),pdf=rawPdfBytes(bytes);
      names.forEach(function(name){
        var key=documentKey(name);
        if(!key) return;
        var item={target:"",name:name,key:key,kind:"embedded",source:path,hasPdfBytes:Boolean(pdf)};
        result.embedded.push(item);result.all.push(item);
        if(pdf){
          window.LokalblickContractDocumentCache=window.LokalblickContractDocumentCache||{};
          try{window.LokalblickContractDocumentCache[key]=URL.createObjectURL(new Blob([pdf],{type:"application/pdf"}));}catch(_){}
        }
      });
    });
    return result;
  }
  function findWorkbookDocument(catalog,number){
    var key=documentKey(number);
    if(!key) return null;
    var all=(catalog&&catalog.all)||[];
    var exact=all.filter(function(x){return x.key===key;});
    if(exact.length) return exact[0];
    var near=all.filter(function(x){return x.key&&x.key.length>=6&&key.length>=6&&(x.key.indexOf(key)>=0||key.indexOf(x.key)>=0);});
    return near.length===1?near[0]:null;
  }
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
    const result=window.LokalblickAddressMatch.matchProperty(data.properties||[],{designation,address});
    return {property:result.property,strength:result.method,candidates:result.candidates.map(x=>x.id)};
  }
  function matchContract(data,rowData){
    return window.LokalblickAddressMatch.matchContract(data,rowData);
  }

  function indexValue(series,year){ return Number(window.LokalblickCalculations.october(series,year)?.value)||0; }
  function indexedAmount(baseAmount,baseIndex,indexShare,currentIndex){ return window.LokalblickCalculations.indexedAmount(baseAmount,baseIndex,indexShare,currentIndex); }
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
    // Keep conflicting imported October values for validation. Silently replacing
    // one value with another could otherwise produce an incorrect annual rent.
    var map=new Map();
    rows.forEach(function(x){map.set(String(x.year)+"|"+String(x.month)+"|"+String(x.value),x);});
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
      var worksheetRow=hit.row+1+offset;
      var documentUrl=contractPdfLink(workbook,hit,worksheetRow,{number:number});
      return {
        sourceRow:hit.row+2+offset,
        designation:designation,address:address,number:number,documentUrl:documentUrl,
        comment:text(cell(row,headers,["Kommentar"])),use:use,department:text(cell(row,headers,["AVDELNING","Avdelning"])),
        category:category,landlord:text(cell(row,headers,["Hyresvärd","Hyresvard"])),
        start:excelDate(cell(row,headers,["Fr.o.m.","Fr o m","Start","Startdatum","Avtalsstart","Giltigt fr.o.m.","Giltigt from"])),
        end:excelDate(cell(row,headers,["T.o.m.","T o m","Slut","Slutdatum","Avtalsslut","Giltigt t.o.m.","Giltigt tom","Aktuellt giltigt t.o.m."])),
        moveInDate:excelDate(cell(row,headers,["Inflyttning","Inflyttningsdatum","Tillträde","Tillträdesdatum"])),
        moveOutDate:excelDate(cell(row,headers,["Utflyttning","Utflyttningsdatum","Avflyttning","Avflyttningsdatum"])),
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
  function enrich(workbook,baseData,fileName,arrayBuffer){
    var hit=detectHeader(workbook);
    if(!hit) throw new Error("Avtalsfilen känns inte igen. Kontrollera att rubriker som Fastighetsbeteckning, Adress, Avtalsnummer, Verksamhet och Hyresvärd finns.");
    var data=clone(baseData||{});
    data.contracts=Array.isArray(data.contracts)?data.contracts:[];
    data.properties=Array.isArray(data.properties)?data.properties:[];
    data.organizations=Array.isArray(data.organizations)?data.organizations:[];
    data.indexSeries=Array.isArray(data.indexSeries)?data.indexSeries:[];
    var rows=parseRows(workbook,hit);
    var documentCatalog=scanWorkbookDocuments(arrayBuffer);
    var report={
      profile:"Avtalsberikning v1",fileName:fileName||"",sheet:hit.sheet,sourceRows:rows.length,
      matched:[],needsReview:[],unmatched:[],discrepancies:[],warnings:[],reconciliation:{}
    };

    rows.forEach(function(r){
      if(!r.documentUrl && r.number){
        var workbookDocument=findWorkbookDocument(documentCatalog,r.number);
        if(workbookDocument){
          r.documentUrl=workbookDocument.target || ("embedded://"+workbookDocument.key);
          r.documentName=workbookDocument.name || "";
          r.documentKind=workbookDocument.kind || "";
        }
      }
      var match=matchContract(data,r);
      if(!match.contract){
        var entry={sourceRow:r.sourceRow,number:r.number,designation:r.designation,address:r.address,score:match.score||0,candidates:match.candidates||[]};
        if(match.ambiguous) report.needsReview.push(entry); else report.unmatched.push(entry);
        return;
      }
      var c=match.contract;
      var before=clone(c);
      var property=(data.properties||[]).find(function(p){return p.id===c.propertyId;});
      if(r.area && c.area && Math.abs(Number(r.area)-Number(c.area))>Math.max(1,Number(c.area)*0.01)){
        report.discrepancies.push({contractId:c.id,field:"area",primary:c.area,enrichment:r.area,sourceRow:r.sourceRow});
      }
      if(r.start && c.start && r.start!==c.start) report.discrepancies.push({contractId:c.id,field:"start",primary:c.start,enrichment:r.start,sourceRow:r.sourceRow});
      if(r.end && c.end && r.end!==c.end) report.discrepancies.push({contractId:c.id,field:"end",primary:c.end,enrichment:r.end,sourceRow:r.sourceRow});
      if(r.moveInDate && c.moveInDate && r.moveInDate!==c.moveInDate) report.discrepancies.push({contractId:c.id,field:"moveInDate",primary:c.moveInDate,enrichment:r.moveInDate,sourceRow:r.sourceRow});
      if(r.moveOutDate && c.moveOutDate && r.moveOutDate!==c.moveOutDate) report.discrepancies.push({contractId:c.id,field:"moveOutDate",primary:c.moveOutDate,enrichment:r.moveOutDate,sourceRow:r.sourceRow});

      // Identity / core terms: INT/EXT remains authoritative. Only fill blanks.
      setIfBlank(c,"number",r.number); setIfBlank(c,"area",r.area); setIfBlank(c,"category",r.category);
      setIfBlank(c,"use",r.use); setIfBlank(c,"start",r.start); setIfBlank(c,"end",r.end);
      setIfBlank(c,"moveInDate",r.moveInDate); setIfBlank(c,"moveOutDate",r.moveOutDate); setIfBlank(c,"notice",r.notice);
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
        contractDocumentUrl:r.documentUrl||"",
        contractDocumentName:r.documentName || (r.documentUrl ? ((function(url){try{return decodeURIComponent(String(url).split(/[\\/]/).pop()||"");}catch(_){return String(url).split(/[\\/]/).pop()||"";}})(r.documentUrl)) : ""),
        contractDocumentKind:r.documentKind||"",
        enrichmentSource:fileName||"",enrichmentSourceRow:r.sourceRow,enrichmentTargetYear:r.targetYear||0
      };
      Object.keys(values).forEach(function(key){
        if(values[key]==="" || values[key]==null || values[key]===0)return;
        if(!/^enrichment/.test(key) && c[key]!=="" && c[key]!=null && c[key]!==0 && c[key]!==values[key]) {
          const rule=(data.importFieldPreferences||{})[["contracts",key,fileName||hit.sheet].map(x=>String(x||"").trim().toLocaleLowerCase("sv")).join("|")];
          if(rule==="reject")return;
          if(rule!=="accept"){report.discrepancies.push({contractId:c.id,field:key,primary:c[key],enrichment:values[key],sourceRow:r.sourceRow});return;}
        }
        c[key]=values[key];
      });

      var targetYear=Number(c.enrichmentTargetYear)||Number(r.targetYear)||new Date().getFullYear();
      ["rent","addition"].forEach(function(kind){
        var result=window.LokalblickCalculations.component(c,kind,targetYear,0,data.indexSeries);
        c[kind+"CalculationStatus"]=result.status;
        if(result.calculated){c[kind==="rent"?"calculatedAnnualRent":"calculatedAnnualAdditions"]=Math.round(result.amount);c[kind+"IndexCurrent"]=result.usedIndex;c[kind+"IndexYear"]=result.indexYear;c[kind+"CalculationYear"]=targetYear;}
        if(result.reason)report.warnings.push(result.reason+" · "+(c.number||c.id));
      });

      c.provenance=c.provenance||{};
      Object.keys(c).filter(function(k){return k!=="provenance" && JSON.stringify(c[k])!==JSON.stringify(before[k]);}).forEach(function(k){c.provenance[k]={source:/^calculated/.test(k)?"calculated":fileName||hit.sheet,sheet:hit.sheet,row:r.sourceRow,value:c[k]};});
      ["number","area","start","end","moveInDate","moveOutDate","use"].forEach(function(k){if(!c.provenance[k] && c[k])c.provenance[k]={source:c.source||c.sourceSheet||"INT/EXT",sheet:c.sourceSheet||"",row:c.sourceRow||"",value:c[k]};});
      report.matched.push({sourceRow:r.sourceRow,contractId:c.id,number:c.number||"",method:match.method,score:match.score,reasons:match.reasons||[]});
    });

    report.counts={
      sourceRows:rows.length,matched:report.matched.length,needsReview:report.needsReview.length,
      unmatched:report.unmatched.length,discrepancies:report.discrepancies.length,
      documents:report.matched.reduce(function(sum,item){
        var contract=data.contracts.find(function(c){return c.id===item.contractId;});
        return sum+(contract&&contract.contractDocumentUrl?1:0);
      },0),
      linkedDocuments:report.matched.reduce(function(sum,item){
        var contract=data.contracts.find(function(c){return c.id===item.contractId;});
        return sum+(contract&&contract.contractDocumentUrl&&!/^embedded:\/\//i.test(contract.contractDocumentUrl)?1:0);
      },0),
      embeddedDocuments:report.matched.reduce(function(sum,item){
        var contract=data.contracts.find(function(c){return c.id===item.contractId;});
        return sum+(contract&&/^embedded:\/\//i.test(contract.contractDocumentUrl||"")?1:0);
      },0),
      workbookDocumentCandidates:(documentCatalog.all||[]).length
    };
    report.warnings=Array.from(new Set(report.warnings));
    data.sourceRegistry=data.sourceRegistry||[];
    data.sourceRegistry.push({id:"source:"+(data.sourceRegistry.length+1),name:fileName||hit.sheet,kind:"contract-enrichment",importedAt:new Date().toISOString(),rows:rows.length});
    data.importReview=data.importReview||[];
    report.needsReview.concat(report.unmatched).forEach(function(item){data.importReview.push({id:"review:"+(data.importReview.length+1),kind:"match",source:fileName||hit.sheet,sheet:hit.sheet,row:item.sourceRow,candidates:item.candidates||[],record:rows.find(function(x){return x.sourceRow===item.sourceRow;}),status:"pending"});});
    report.discrepancies.forEach(function(item){data.importReview.push({id:"review:"+(data.importReview.length+1),kind:"conflict",source:fileName||hit.sheet,sheet:hit.sheet,row:item.sourceRow,contractId:item.contractId,field:item.field,current:item.primary,proposed:item.enrichment,status:"pending"});});
    data.contractEnrichmentReport=clone(report);
    return {data:data,report:report};
  }

  function applyIndexSeries(baseData,series,fileName){
    var data=clone(baseData||{});data.indexSeries=series.slice();var recalculated=0,missing=0;
    (data.contracts||[]).forEach(function(c){
      var year=Number(c.enrichmentTargetYear)||new Date().getFullYear();
      ["rent","addition"].forEach(function(kind){var result=window.LokalblickCalculations.component(c,kind,year,0,series);c[kind+"CalculationStatus"]=result.status;
        if(result.calculated){c[kind==="rent"?"calculatedAnnualRent":"calculatedAnnualAdditions"]=Math.round(result.amount);c[kind+"IndexYear"]=result.indexYear;c[kind+"CalculationYear"]=year;recalculated++;}else if(result.base)missing++;
      });
    });
    data.indexSourceName=fileName||"KPI";
    return {data:data,report:{recalculated:recalculated,missing:missing,sourceRows:series.length,warnings:missing?["Oktoberindex eller avtalsvillkor saknas för vissa komponenter."]:[]}};
  }

  window.LokalblickContractEnrichmentAdapter={
    id:"contract-enrichment-v1",
    label:"Avtalsberikning",
    detect:detect,
    enrich:enrich,
    parseIndexWorkbook:parseIndexWorkbook,
    applyIndexSeries:applyIndexSeries,
    parseRows:parseRows,
    detectHeader:detectHeader,
    matchContract:matchContract,
    indexedAmount:indexedAmount
  };
})();