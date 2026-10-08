// Import of the 2027 project planning worksheet. No properties/contracts are created.
// Source identities and uncertain matches are retained for review, never guessed.
(function(root) {
  const clean = v => String(v == null ? "" : v).replace(/\u00a0/g," ").trim();
  const key = v => clean(v).toLocaleLowerCase("sv").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");
  const hash = value => { let h=2166136261; for(const c of String(value)) { h ^= c.charCodeAt(0); h=Math.imul(h,16777619); } return (h>>>0).toString(36).toUpperCase(); };
  const num = value => { if(value==null || clean(value)==="") return null; const n=Number(clean(value).replace(/\s/g,"").replace(",",".")); return Number.isFinite(n)?n:null; };
  const year=2027;
  const sheetName="2027";
  function parse(workbook) {
    const sheet=workbook?.Sheets?.[sheetName];
    if(!sheet || !root.XLSX) return null;
    const rows=root.XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true});
    const headers=(rows[0]||[]).map(key);
    if(!["projektnamn","namnpaverksamheten","budget","innehall"].every(k=>headers.includes(k))) return null;
    const get=(row,name)=>row[headers.indexOf(key(name))];
    return rows.slice(1).map((row,i)=>({row:i+2, get:n=>get(row,n)}))
      .filter(x=>clean(x.get("Projektnamn")) || clean(x.get("Innehåll")));
  }
  function detect(workbook) { return Boolean(parse(workbook)); }
  function enrich(workbook,original,fileName) {
    const incoming=parse(workbook);
    if(!incoming) throw Error("Projekt 2027 har inte förväntade kolumner.");
    const data=JSON.parse(JSON.stringify(original||{}));
    for(const k of ["activities","properties","contracts","people","sourceRegistry","importReview"]) if(!Array.isArray(data[k])) data[k]=[];
    const source=clean(fileName)||"Projekt 2027.xlsx";
    const counts={sourceRows:0,activitiesCreated:0,activitiesUpdated:0,possibleDuplicates:0,needsReview:0,withoutHome:0,unmappedPeople:0};
    const notes=[];
    const review=(kind,row,message,record) => {
      const signature="PROJECT2027|"+source+"|"+row+"|"+kind;
      if(data.importReview.some(x=>x._signature===signature && x.status==="pending")) return;
      data.importReview.push({id:"review:"+hash(signature),_signature:signature,kind:"project-2027-"+kind,
        source,sheet:sheetName,row,status:"pending",record,message});
      counts.needsReview++;
    };
    const matches=x=>data.properties.filter(p=>key(p.address)===key(x) && key(x));
    const unitValue=x=>({vardbo:"VARDBO",sabo:"VARDBO",ordbo:"ORDBO",hof:"HOF",myndighet:"MYND_STAB"})[key(x)]||"";
    for(const line of incoming) {
      const get=line.get, title=clean(get("Projektnamn")),category=clean(get("Innehåll"));
      if(!title || key(title)==="ejangivet") continue;
      counts.sourceRows++;
      const address=clean(get("Adress")), business=clean(get("Namn på verksamheten"));
      const activityKey="PROJ2027|"+hash([key(business),key(address),key(category),key(title)].join("|"));
      const srcId="PROJECT2027|"+activityKey;
      const existingSource=data.activities.find(a=>a.project2027SourceId===srcId);
      const sameSourceRow=data.activities.filter(a=>a.sourceSheet===sheetName &&
        Number(a.sourceRow)===line.row && a.project2027SourceId && a.project2027SourceFile===source);
      if(!existingSource && sameSourceRow.length) {
        review("changed-row",line.row,
          "En tidigare importerad aktivitet finns på samma källrad men identiteten har ändrats. Granska innan en ny aktivitet skapas.",
          {title,category,address,business,previous:sameSourceRow.map(a=>({id:a.id,title:a.title,category:a.category}))});
        counts.possibleDuplicates++;
        continue;
      }
      const pMatches=matches(address);
      let property=pMatches.length===1?pMatches[0]:null;
      const cMatches=property?data.contracts.filter(c=>c.propertyId===property.id &&
        business && [c.businessName,c.use].some(x=>key(x)===key(business))):[];
      const contract=cMatches.length===1?cMatches[0]:null;
      const unit=unitValue(get("Verksamhet"));
      const home=contract?"contract:"+contract.id:property?"property:"+property.id:unit?"unit:"+unit:"";
      const similar=data.activities.filter(a=>!a.project2027SourceId && key(a.title)===key(title) &&
        ((contract && a.contractId===contract.id) || (property && (a.propertyId===property.id ||
        data.contracts.some(c=>c.id===a.contractId && c.propertyId===property.id))) ||
        (!property && !a.propertyId && !a.contractId && key(a.category)===key(category))));
      if(!existingSource && similar.length) {
        counts.possibleDuplicates++;
        review("duplicate",line.row,"Möjlig befintlig aktivitet. Koppla eller skapa separat i granskningen.",{
          title,category,address,business,candidates:similar.map(a=>({id:a.id,title:a.title,propertyId:a.propertyId,contractId:a.contractId}))});
        continue;
      }
      let item=existingSource;
      if(!item) {
        item={id:"ACT|"+hash(srcId),title,category,type:"Projekt",status:"Planerad",planningYear:year,
          project2027SourceId:srcId,project2027SourceFile:source,sourceId:srcId,sourceSheet:sheetName,sourceRow:line.row,
          propertyId:contract?"":property?.id||"",contractId:contract?.id||"",
          unitId:home.startsWith("unit:")?unit:"",scopeType:home.split(":")[0]||"",
          provenance:{},comments:[]};
        if(data.activities.some(a=>a.id===item.id)) { review("identity",line.row,"Aktivitets-ID finns redan för en annan källa.",{title}); continue; }
        data.activities.push(item);counts.activitiesCreated++;
      } else counts.activitiesUpdated++;
      if(!item.category) item.category=category;
      if(!item.title) item.title=title;
      if(!item.planningYear)item.planningYear=year;
      if(!item.propertyId && !item.contractId && !item.unitId && home) {
        if(contract){item.contractId=contract.id;item.scopeType="contract";}
        else if(property){item.propertyId=property.id;item.scopeType="property";}
        else if(unit){item.unitId=unit;item.scopeType="unit";}
      }
      if(!item.propertyId && !item.contractId && !item.unitId && item.scopeType!=="general") counts.withoutHome++;
      const priority=num(get("Prio"));
      if([1,2,3].includes(priority) && !item.priority) item.priority=priority;
      item.cluster=item.cluster||clean(get("Kluster"));
      item.standardEnhancing=item.standardEnhancing??Boolean(clean(get("Standardhöjande")));
      item.financingMethod=item.financingMethod||(clean(get("Betalas som hyrespåslag"))?"rent_supplement":"unverified");
      // The workbook does not declare whether monetary cells are SEK or thousands.
      // Never push unverified source amounts into estimatedCost or budgetRows.
      item.project2027BudgetRaw=num(get("Budget"));
      item.project2027DriftRaw=num(get("Budget Drift"));
      item.project2027InvestmentRaw=num(get("Budget Inv."));
      item.project2027BudgetUnit="unverified";
      item.project2027RentImpactRaw=num(get("Årshyra"));
      item.project2027CostType=clean(get("Drift eller investering"));
      item.project2027RentSurcharge=Boolean(clean(get("Betalas som hyrespåslag")));
      item.project2027SourceAddress=address;
      item.project2027SourceBusiness=business;
      item.project2027ImportedAt=new Date().toISOString();
      item.includeInBudget=item.project2027RentSurcharge?"Nej":(item.includeInBudget||"Nej");
      item.project2027ResponsibleSource=clean(get("Ansvarig"));
      const people=data.people.filter(p=>key(p.name)===key(item.project2027ResponsibleSource) && key(p.name));
      if(!item.responsiblePersonId && people.length===1) item.responsiblePersonId=people[0].id;
      else if(item.project2027ResponsibleSource && !item.responsiblePersonId) counts.unmappedPeople++;
      for(const field of ["Kommentar","Sanelas kommentarer"]) {
        const body=clean(get(field));
        if(!body) continue;
        const commentId="COMMENT|"+hash(srcId+"|"+field+"|"+body);
        if(!item.comments.some(c=>c.id===commentId))item.comments.push({
          id:commentId,text:body,createdAt:null,source,sourceSheet:sheetName,sourceRow:line.row,sourceColumn:field
        });
      }
      const months=["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
      const m=months.map((name,i)=>clean(get(name))?i+1:null).filter(Boolean);
      if(m.length && !(item.planningMonths||[]).length)item.planningMonths=m;
    }
    const existingCount=(data.importReview||[]).filter(x=>x.status==="pending"&&x.source===source).length;
    data.sourceRegistry=data.sourceRegistry.filter(s=>!(s.kind==="project-2027"&&s.name===source));
    data.sourceRegistry.push({id:"source:project-2027:"+hash(source),name:source,kind:"project-2027",sheets:sheetName,
      rows:counts.sourceRows,created:counts.activitiesCreated,matched:counts.activitiesUpdated,review:existingCount,
      importedAt:new Date().toISOString()});
    const report={profile:"Projekt 2027 – säker aktivitetsberikning",fileName:source,sheets:[sheetName],counts,
      warnings:["Beloppsenheten måste bekräftas innan budgetpåverkan kan aktiveras.",
      "Möjliga dubbletter skapas inte automatiskt.","Kommentarer utan datum får inget påhittat datum."]};
    data.project2027ImportReport=report;
    return {data,report};
  }
  root.LokalblickProject2027Adapter={id:"project-2027-v1",detect,enrich};
})(globalThis);
