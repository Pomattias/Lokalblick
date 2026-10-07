// Migration adapter for existing HVOF Excel workbooks.
// Reads legacy workbook structures into Lokalblick's canonical data model.
// Legacy files are migration inputs only: write-back is intentionally disabled.
(function () {
  const MONTHS = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];

  function clone(v){ return JSON.parse(JSON.stringify(v)); }
  function text(v){ return String(v == null ? "" : v).trim(); }
  function norm(v){
    return text(v).toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/\b(gatan|gata|vagen|vägen|vag|v.)\b/g,function(m){ return m; })
      .replace(/[^a-z0-9åäö]+/g," ")
      .replace(/\s+/g," ").trim();
  }
  function compactAddress(v){
    return norm(v).replace(/\s+/g,"").replace(/(a|b|c|d)$/,"");
  }
  function hash(value){
    let h=2166136261;
    const s=String(value||"");
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
    return (h>>>0).toString(36).toUpperCase();
  }
  function num(v){
    if(typeof v==="number") return Number.isFinite(v)?v:0;
    const s=text(v).replace(/\s/g,"").replace(/kr|tkr|mkr/gi,"").replace(/\./g,"").replace(",",".");
    const n=Number(s); return Number.isFinite(n)?n:0;
  }
  function excelDate(v){
    if(!v) return "";
    if(v instanceof Date) return v.toISOString().slice(0,10);
    if(typeof v==="number" && v>20000 && v<80000){
      const utc=Math.round((v-25569)*86400*1000);
      return new Date(utc).toISOString().slice(0,10);
    }
    const s=text(v);
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return s;
  }
  function matrix(workbook,name){
    const sheet=workbook.Sheets[name];
    return sheet ? XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true}) : [];
  }
  function headerMap(row){
    const map={};
    (row||[]).forEach(function(value,index){
      const key=norm(value);
      if(!key) return;
      if(!map[key]) map[key]=[];
      map[key].push(index);
    });
    return map;
  }
  function col(headers, aliases, occurrence){
    for(const alias of aliases){
      const hits=headers[norm(alias)]||[];
      if(hits.length) return hits[Math.min(Number(occurrence)||0,hits.length-1)];
    }
    return -1;
  }
  function cell(row,headers,aliases,occurrence){
    const i=col(headers,aliases,occurrence);
    return i>=0 ? row[i] : "";
  }
  function rows(workbook,name,headerRow){
    const data=matrix(workbook,name);
    if(!data.length) return [];
    const index=Number(headerRow)||0;
    const headers=headerMap(data[index]||[]);
    return data.slice(index+1).map(function(row,rowOffset){
      return {row:row,headers:headers,sourceRow:index+2+rowOffset,sourceSheet:name};
    }).filter(function(item){
      return item.row.some(function(v){return text(v)!=="";});
    });
  }
  function isHvof(workbook){
    const names=new Set(workbook.SheetNames||[]);
    // Varje känd flik får läsas separat. Det gör att SF/INT, EXT och senare
    // berikningsfiler kan matas in i valfri ordning utan att kräva en komplett arbetsbok.
    const hasCore=["INT","SF","EXT","Lokallista"].some(function(name){return names.has(name);});
    const hasEnrichment=["Lokalbestånd","Fastighetslista","Årshjul","Beställningar"].some(function(name){return names.has(name);});
    return hasCore || hasEnrichment;
  }
  function unitId(v){
    const s=norm(v);
    if(s==="ordbo") return "ORDBO";
    if(s==="hof" || s.includes("halsa") || s.includes("hälsa")) return "HOF";
    if(s.includes("vardbo") || s.includes("vårdbo") || s.includes("sabo") || s.includes("säbo")) return "VARDBO";
    if(s.includes("mynd")) return "MYND_STAB";
    return "";
  }
  function parseManager(raw){
    const s=text(raw);
    const m=s.match(/^([A-ZÅÄÖ0-9]{3,})\s+(.+)$/);
    return m ? {sourceId:m[1],name:m[2].trim()} : {sourceId:"",name:s};
  }
  function ensureOrg(data,name,type,ownerClass){
    const label=text(name); if(!label) return "";
    const existing=data.organizations.find(function(o){return norm(o.name)===norm(label) && o.type===type;});
    if(existing) return existing.id;
    const id="ORG|"+hash(type+"|"+label);
    data.organizations.push({id:id,name:label,type:type,ownerClass:ownerClass||""});
    return id;
  }
  function ensurePerson(data,name,unit,role,sourceId,email,organizationId){
    const label=text(name); if(!label) return "";
    const existing=data.people.find(function(p){
      return (sourceId && p.sourceId===sourceId) || (norm(p.name)===norm(label) && (!organizationId || p.organizationId===organizationId));
    });
    if(existing){
      if(email && !existing.email) existing.email=text(email);
      if(unit && !existing.unitId) existing.unitId=unit;
      return existing.id;
    }
    const id="P|"+hash((sourceId||label)+"|"+(organizationId||""));
    data.people.push({id:id,name:label,organizationId:organizationId||"ORG-OUR",unitId:unit||"",role:role||"",email:text(email),sourceId:sourceId||""});
    return id;
  }
  function ensureProperty(data,sourceId,address,extra){
    const sid=text(sourceId), adr=text(address);
    let property=sid ? data.properties.find(function(p){return p.sourceId===sid;}) : null;
    // Finns ett objekts-ID är det identiteten. En annan post med annat objekts-ID
    // får aldrig slås ihop bara för att adressen råkar vara samma.
    if(!property && adr && !sid){
      const key=compactAddress(adr);
      property=data.properties.find(function(p){return !p.sourceId && compactAddress(p.address)===key;});
    }
    if(!property){
      const stable=sid || ("ADDR-"+hash(compactAddress(adr)));
      property={id:"PROP|"+stable,sourceId:sid,address:adr,designation:"",type:"Fastighet",owner:"",manager:"",latitude:"",longitude:"",sourceSheet:"",sourceRow:"",migrationState:sid?"matched":"needs_review"};
      data.properties.push(property);
    }
    Object.keys(extra||{}).forEach(function(k){ if(extra[k]!=="" && extra[k]!=null) property[k]=extra[k]; });
    return property;
  }
  function ensureContract(data,number,property,extra){
    const contractNo=text(number);
    let c=data.contracts.find(function(x){return x.number===contractNo && contractNo && x.propertyId===(property?property.id:"") && x.sourceSheet===(extra||{}).sourceSheet && x.sourceRow===(extra||{}).sourceRow;});
    if(!c){
      const fallback=[property&&property.id,(extra||{}).sourceSheet,(extra||{}).sourceRow,(extra||{}).use,(extra||{}).area].filter(Boolean).join("|") || "contract";
      c={id:"AVT|"+(contractNo ? contractNo+(data.contracts.some(function(x){return x.number===contractNo;})?"|"+hash((property&&property.id)+"|"+(extra||{}).sourceSheet+"|"+(extra||{}).sourceRow):"") : hash(fallback)),sourceId:contractNo,propertyId:property?property.id:"",number:contractNo,source:"",area:0,category:"",use:"",start:"",end:"",notice:"",annualRent:0,annualContractDrift:0,unitId:"",tenantOrgId:"",ownerOrgId:"",employees:0,users:0,rooms:0,commonArea:0,apartmentArea:0,sourceSheet:"",sourceRow:""};
      data.contracts.push(c);
    }
    Object.keys(extra||{}).forEach(function(k){ if(extra[k]!=="" && extra[k]!=null) c[k]=extra[k]; });
    return c;
  }
  function addressParts(value){
    const raw=norm(value);
    const match=raw.match(/^(.*?)(\d+)(.*)$/);
    return match
      ? {street:compactAddress(match[1]),number:Number(match[2]),tail:compactAddress(match[3])}
      : {street:compactAddress(raw),number:null,tail:""};
  }
  function compatibleAddress(a,b){
    const aa=addressParts(a),bb=addressParts(b);
    if(!aa.street||!bb.street||aa.street!==bb.street) return false;
    if(aa.number!=null&&bb.number!=null&&aa.number!==bb.number) return false;
    return true;
  }
  function propertyByAddress(data,address){
    const key=compactAddress(address);
    if(!key) return null;
    let exact=data.properties.find(function(p){return compactAddress(p.address)===key;});
    if(exact) return exact;
    const hits=data.properties.filter(function(p){return compatibleAddress(address,p.address);});
    return hits.length===1 ? hits[0] : null;
  }
  function propertyByUse(data,value){
    const wanted=norm(value); if(!wanted) return null;
    const c=data.contracts.find(function(contract){
      return norm(contract.use)===wanted || norm(contract.use).includes(wanted) || wanted.includes(norm(contract.use));
    });
    return c ? data.properties.find(function(p){return p.id===c.propertyId;}) : null;
  }
  function contractForProperty(data,property){
    if(!property) return null;
    return data.contracts.find(function(c){return c.propertyId===property.id;}) || null;
  }
  function activityId(type,address,title){
    return "ACT|"+String(type||"GEN").slice(0,3).toUpperCase()+"|"+hash(norm(address)+"|"+norm(title));
  }
  function ensureActivity(data,row){
    let existing=data.activities.find(function(a){return a.id===row.id;});
    if(!existing){ existing=row; data.activities.push(existing); }
    return existing;
  }
  function tokenScore(a,b){
    const aa=new Set(norm(a).split(" ").filter(function(x){return x.length>2;}));
    const bb=new Set(norm(b).split(" ").filter(function(x){return x.length>2;}));
    if(!aa.size || !bb.size) return 0;
    let common=0; aa.forEach(function(x){if(bb.has(x)) common++;});
    return common/Math.max(aa.size,bb.size);
  }
  function applyActivityCompatibility(data){
    data.projects=[]; data.maintenance=[]; data.driftIssues=[]; data.wishes=[]; data.investigations=[];
    (data.activities||[]).forEach(function(a){
      const commonOrder={
        orderedAt:a.orderedAt||"",orderedBy:a.orderedBy||"",supplier:a.supplier||"",orderReference:a.orderReference||"",
        orderedCost:Number(a.orderedCost)||0,deliveryText:a.deliveryText||"",completedAt:a.completedAt||"",
        finalCost:Number(a.finalCost)||0,paymentStatus:a.paymentStatus||"",paidAt:a.paidAt||"",invoiceComment:a.invoiceComment||"",
        sourceId:a.sourceId||"",sourceSheet:a.sourceSheet||"",sourceRow:a.sourceRow||""
      };
      if(a.type==="Projekt"){
        data.projects.push(Object.assign({
          id:a.id,propertyId:a.propertyId||"",contractId:a.contractId||"",name:a.title||"",description:a.description||"",
          status:a.status||"Planerad",phase:a.phase||"Förstudie",start:a.startDate||"",end:a.endDate||"",moveIn:"",
          budgetYear:a.planningYear||"",budgetInvestigation:0,budgetExecution:Number(a.estimatedCost)||0,budgetFurnishing:0,
          preliminaryCost:Number(a.estimatedCost)||0,planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||""
        },commonOrder));
      } else if(a.type==="Underhåll"){
        data.maintenance.push(Object.assign({
          id:a.id,propertyId:a.propertyId||"",contractId:a.contractId||"",title:a.title||"",year:a.planningYear||"",
          cost:Number(a.estimatedCost)||0,priority:a.priority||"",status:a.status||"Identifierad",
          planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||""
        },commonOrder));
      } else if(a.type==="Drift"){
        data.driftIssues.push(Object.assign({
          id:a.id,contractId:a.contractId||"",propertyId:a.propertyId||"",category:a.category||"Övrigt",title:a.title||"",
          description:a.description||"",createdDate:a.createdDate||"",targetDate:a.targetDate||"",decisionDate:"",
          completedDate:a.completedAt||"",status:a.status||"Nytt",priority:a.priority||"",responsiblePersonId:a.responsiblePersonId||"",
          budgetYear:a.planningYear||"",estimatedCost:Number(a.estimatedCost)||0,finalCost:Number(a.finalCost)||0,
          includeInBudget:"Ja",planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||""
        },commonOrder));
      } else if(a.type==="Önskemål"){
        data.wishes.push(Object.assign({
          id:a.id,contractId:a.contractId||"",propertyId:a.propertyId||"",category:a.category||"Övrigt",title:a.title||"",
          description:a.description||"",createdDate:a.createdDate||"",targetDate:a.targetDate||"",decisionDate:"",
          completedDate:a.completedAt||"",status:a.status||"Nytt",responsiblePersonId:a.responsiblePersonId||"",
          budgetYear:a.planningYear||"",budgetCategory:a.budgetCategory||"Ej budget",estimatedCost:Number(a.estimatedCost)||0,
          finalCost:Number(a.finalCost)||0,includeInBudget:"Ja"
        },commonOrder));
      } else if(a.type==="Utredning"){
        data.investigations.push(Object.assign({
          id:a.id,propertyId:a.propertyId||"",contractId:a.contractId||"",title:a.title||"",year:a.planningYear||"",
          cost:Number(a.estimatedCost)||0,status:a.status||"Planerad"
        },commonOrder));
      }
    });
  }

  function migrate(workbook,fileName){
    const data={
      isDemo:false,sourceName:fileName||"Migrerad Excel",
      properties:[],contracts:[],organizations:[],people:[],assignments:[],
      activities:[],projects:[],maintenance:[],operations:[],investigations:[],maintenanceStatus:[],driftIssues:[],wishes:[],
      budgetPlans:[],assignmentChanges:[]
    };
    ensureOrg(data,"Vår organisation","our","");
    const report={profile:"HVOF v1",sourceKind:"migration",warnings:[],unmatchedOrders:[],provisionalProperties:[],counts:{}};

    // Primary identity: INT/SF + EXT. Lokallista is only a legacy fallback.
    let localRows=rows(workbook,"INT",0).concat(rows(workbook,"SF",0)).concat(rows(workbook,"EXT",0));
    if(!localRows.length) localRows=rows(workbook,"Lokallista",0);
    localRows.forEach(function(item){
      const r=item.row,h=item.headers;
      const sourceObject=text(cell(r,h,["Förvaltningsobjekt"]));
      const number=text(cell(r,h,["Avtalsnummer"]));
      const address=text(cell(r,h,["Gatuadress","Adress"]));
      const city=text(cell(r,h,["Ort","Postort","Stad"]));
      if(!sourceObject && !number && !address) return;
      const rawOwner=text(cell(r,h,["Kundtyp avtal","Lev.namn"]));
      const ownerName=rawOwner && norm(rawOwner)!=="intern" ? rawOwner : "Stadsfastigheter";
      const ownerOrgId=ensureOrg(data,ownerName,"owner",norm(rawOwner)==="intern"?"Intern":"Extern");
      const manager=parseManager(cell(r,h,["Fastighetsförvaltare","Handläggare (id)"]));
      const managerId=manager.name ? ensurePerson(data,manager.name,"","Fastighetsförvaltare",manager.sourceId,"",ownerOrgId) : "";
      const costCenter=text(cell(r,h,["Kostnadsställe","Fast.bet."]));
      const designation=/[A-Za-zÅÄÖåäö]/.test(costCenter) ? costCenter : "";
      const sourceSheet=item.sourceSheet||"Lokallista";
      const property=ensureProperty(data,sourceObject,address,{
        city:city,designation:designation,owner:ownerName,manager:manager.name||"",sourceSheet:sourceSheet,sourceRow:item.sourceRow
      });
      const sourceType=sourceSheet==="EXT" ? "EXT" : (sourceSheet==="INT" || sourceSheet==="SF") ? "INT" : (/^INH/i.test(sourceObject) ? "EXT" : "INT");
      ensureContract(data,number,property,{
        source:sourceType,area:num(cell(r,h,["Area"])),category:text(cell(r,h,["Lokalkategori"])),
        use:text(cell(r,h,["Användning"])),end:excelDate(cell(r,h,["Aktuellt giltigt t.o.m."])),
        notice:excelDate(cell(r,h,["Säg upp senast"])),ownerOrgId:ownerOrgId,sourceSheet:sourceSheet,sourceRow:item.sourceRow
      });
      if(managerId && !data.assignments.some(function(a){return a.personId===managerId && a.targetId===property.id;})){
        data.assignments.push({id:"A|"+hash(managerId+"|"+property.id),personId:managerId,targetType:"property",targetId:property.id,role:"Fastighetsförvaltare",fromDate:"",toDate:"",allocation:0});
      }
    });

    // Enrichment: Fastighetslista.
    rows(workbook,"Fastighetslista",0).forEach(function(item){
      const r=item.row,h=item.headers;
      const address=text(cell(r,h,["Postadress"]));
      const city=text(cell(r,h,["Ort","Postort","Stad"]));
      const sourceId=text(cell(r,h,["Objekt. nr","Objekt nr"]));
      if(!address && !sourceId) return;
      let property=sourceId ? data.properties.find(function(p){return p.sourceId===sourceId;}) : null;
      // Med objekts-ID får adress inte koppla raden till ett annat objekt.
      if(!property && !sourceId) property=propertyByAddress(data,address);
      if(!property){
        property=ensureProperty(data,sourceId,address,{migrationState:"needs_review"});
        report.provisionalProperties.push({address:address,sourceRow:item.sourceRow,reason:"Ingen säker matchning mot Lokallista"});
      }
      const ownerName=text(cell(r,h,["Fastighetsägare"],0));
      const ownerPhone=text(cell(r,h,["Fastighetsägare"],1));
      const ownerOrgId=ownerName ? ensureOrg(data,ownerName,"owner","") : "";
      const managerName=text(cell(r,h,["Förvaltare"]));
      const managerEmail=text(cell(r,h,["Email (förvaltare)"]));
      const managerId=managerName ? ensurePerson(data,managerName,unitId(cell(r,h,["Avd"])),"Fastighetsförvaltare","",managerEmail,ownerOrgId||"") : "";
      property.address=address||property.address;
      property.city=city||property.city||"";
      property.designation=text(cell(r,h,["Fastighetsbeteckning"]))||property.designation;
      property.owner=ownerName||property.owner;
      property.ownerPhone=ownerPhone||property.ownerPhone||"";
      property.manager=managerName||property.manager;
      property.managerPhone=text(cell(r,h,["Förvaltare nr."]))||property.managerPhone||"";
      property.managerEmail=managerEmail||property.managerEmail||"";
      property.ownerEmail=text(cell(r,h,["Email (Hyresvärd) Kontakt/Felanmälan"]))||property.ownerEmail||"";
      property.maintenanceBoundary=text(cell(r,h,["Gränsdragningslist underhåll"]))||property.maintenanceBoundary||"";
      property.unitId=unitId(cell(r,h,["Avd"]))||property.unitId||"";
      property.sourceSheet="Fastighetslista";
      if(managerId && !data.assignments.some(function(a){return a.personId===managerId && a.targetId===property.id;})){
        data.assignments.push({id:"A|"+hash(managerId+"|"+property.id),personId:managerId,targetType:"property",targetId:property.id,role:"Fastighetsförvaltare",fromDate:"",toDate:"",allocation:0});
      }
      const related=data.contracts.filter(function(c){return c.propertyId===property.id;});
      related.forEach(function(c){
        if(!c.unitId) c.unitId=property.unitId||"";
        if(ownerOrgId) c.ownerOrgId=ownerOrgId;
      });
    });

    // Planning source: Årshjul -> canonical activities.
    rows(workbook,"Årshjul",0).forEach(function(item){
      const r=item.row,h=item.headers;
      const address=text(cell(r,h,["Adress"]));
      const title=text(cell(r,h,["Vad ska göras"]));
      if(!address && !title) return;
      let property=propertyByAddress(data,address);
      if(!property){
        property=ensureProperty(data,"",address,{migrationState:"needs_review",sourceSheet:"Årshjul",sourceRow:item.sourceRow});
        report.provisionalProperties.push({address:address,sourceRow:item.sourceRow,reason:"Fastighet skapad från Årshjul"});
      }
      const contract=contractForProperty(data,property);
      const rawType=norm(cell(r,h,["Drift eller investering"]));
      const type=rawType.includes("invest") ? "Projekt" : rawType.includes("drift") ? "Drift" : "Önskemål";
      const responsibleName=text(cell(r,h,["Ansvarig"]));
      const responsibleId=responsibleName ? ensurePerson(data,responsibleName,property.unitId||"","Ansvarig","","","ORG-OUR") : "";
      const driftCost=num(cell(r,h,["Uppskattat pris drift exkl moms, tkr"]))*1000;
      const investCost=num(cell(r,h,["Uppskattat pris investering exkl moms, tkr"]))*1000;
      const budget=num(cell(r,h,["Budget 2027, tkr"]))*1000;
      let month="";
      MONTHS.some(function(name,index){
        if(text(cell(r,h,[name]))){month=index+1;return true;} return false;
      });
      const activity=ensureActivity(data,{
        id:activityId(type,address,title),type:type,propertyId:property.id,contractId:contract?contract.id:"",
        title:title,description:[text(cell(r,h,["Kommentar"])),text(cell(r,h,["Sanelas kommentarer"]))].filter(Boolean).join(" · "),
        category:text(cell(r,h,["Kluster"])),status:text(cell(r,h,["Klart"])) ? "Klar" : "Planerad",
        priority:text(cell(r,h,["Prio ","Prio"])),responsiblePersonId:responsibleId,
        planningYear:budget?2027:"",planningQuarter:month?Math.ceil(month/3):"",planningMonth:month||"",
        budgetCategory:type==="Projekt"?"Projekt":type==="Drift"?"Driftkostnader":"Ej budget",
        estimatedCost:investCost||driftCost||budget,ownerPays:text(cell(r,h,["Betalas av fastighetsägaren"])),
        finalCost:num(cell(r,h,["Slutlig faktura"])),orderedAt:"",orderedBy:"",supplier:"",orderReference:"",orderedCost:0,
        deliveryText:"",completedAt:"",paymentStatus:"",paidAt:"",invoiceComment:"",
        sourceId:"ÅR|"+item.sourceRow,sourceSheet:"Årshjul",sourceRow:item.sourceRow,createdDate:"",targetDate:""
      });
      if(responsibleId && !data.assignments.some(function(a){return a.personId===responsibleId && a.targetId===activity.id;})){
        data.assignments.push({id:"A|"+hash(responsibleId+"|"+activity.id),personId:responsibleId,targetType:type==="Projekt"?"project":type==="Drift"?"driftIssue":"wish",targetId:activity.id,role:"Ansvarig",fromDate:"",toDate:"",allocation:0});
      }
    });

    // Beställningar confirm order/completion/payment state on an existing activity.
    rows(workbook,"Beställningar",1).forEach(function(item){
      const r=item.row,h=item.headers;
      const description=text(cell(r,h,["Produktnamn/beskrivning"]));
      const verksamhet=text(cell(r,h,["Verksamhet"]));
      if(!description && !verksamhet) return;
      let property=propertyByAddress(data,verksamhet) || propertyByUse(data,verksamhet);
      const candidates=(data.activities||[]).filter(function(a){return !property || a.propertyId===property.id;});
      let best=null,bestScore=0;
      candidates.forEach(function(a){
        let score=tokenScore(description,a.title)*0.75;
        if(property && a.propertyId===property.id) score+=0.25;
        if(score>bestScore){bestScore=score;best=a;}
      });
      if(!best || bestScore<0.42){
        report.unmatchedOrders.push({sourceRow:item.sourceRow,verksamhet:verksamhet,description:description,reason:"Ingen säker aktivitetsträff"});
        return;
      }
      best.orderedAt=excelDate(cell(r,h,["Beställningsdatum"]));
      best.orderedBy=text(cell(r,h,["Beställt av"]));
      best.supplier=text(cell(r,h,["Leverantör"]));
      best.orderedCost=num(cell(r,h,["Pris investering"])) || num(cell(r,h,["Pris drift & underhåll"]));
      best.deliveryText=text(cell(r,h,["Leveransdatum"]));
      best.orderReference=text(cell(r,h,["Reqs","Diarienr"]));
      const orderStatus=text(cell(r,h,["Status (Enbart beställt eller klart)"]));
      if(/klart/i.test(orderStatus)) best.status="Klar";
      else if(/best/i.test(orderStatus)) best.status="Beställt";
      const comment=text(cell(r,h,["Kommentarer"]));
      best.invoiceComment=comment;
      if(/betald|betalat|betalad/i.test(comment)) best.paymentStatus="Betald";
      else if(/faktura/i.test(comment)) best.paymentStatus="Faktura inkommen";
      if(best.status==="Klar" && !best.completedAt) best.completedAt=best.deliveryText;
      best.orderSourceSheet="Beställningar";
      best.orderSourceRow=item.sourceRow;
      best.orderMatchScore=Math.round(bestScore*100);
    });

    applyActivityCompatibility(data);
    report.counts={
      properties:data.properties.length,contracts:data.contracts.length,activities:data.activities.length,
      projects:data.projects.length,maintenance:data.maintenance.length,drift:data.driftIssues.length,wishes:data.wishes.length,
      people:data.people.length,unmatchedOrders:report.unmatchedOrders.length,provisionalProperties:report.provisionalProperties.length
    };
    if(report.unmatchedOrders.length) report.warnings.push(report.unmatchedOrders.length+" beställningar kunde inte kopplas säkert till en aktivitet.");
    if(report.provisionalProperties.length) report.warnings.push(report.provisionalProperties.length+" fastigheter behöver kontrolleras efter migrering.");
    data.migrationReport=clone(report);
    return {data:data,report:report};
  }

  window.LokalblickMigrationAdapter={
    id:"hvof-v1",
    label:"HVOF befintlig Excel",
    detect:isHvof,
    migrate:migrate
  };
})();