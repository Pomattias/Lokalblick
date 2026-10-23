// Workbook schema and XLSX encoding only. No handles, permissions or writes.
// Resolve the spreadsheet library only when a workbook is actually used.
(function(root){
 root.LokalblickSourceWorkbook={create({xlsx,models=root,sourceName=()=>""}){
 const window=models;
  const MODEL_VERSION = "6";

  // Canonical business model. Calculated values are deliberately not persisted.
  const SCHEMAS = [
    { sheet:"Fastigheter", key:"properties", prefix:"FAST", columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["responsiblePersonId","_responsiblePersonId",true],["ownerPartyId","_ownerPartyId",true],["ownerResponsiblePersonId","_ownerResponsiblePersonId",true],
      ["type","Typ"],["address","Adress"],["city","Ort"],["designation","Fastighetsbeteckning"],["latitude","Latitud"],["longitude","Longitud"],["geoSource","Geokälla"],["geoConfirmedAt","Geobekräftad"],["geoConfirmedBy","Geobekräftad av"]
    ], display:["Fastighetsägare","Ansvarig hos fastighetsägaren","Ansvarig hos oss"] },
    { sheet:"Objekt",key:"objects",prefix:"OBJ",columns:[
      ["id","_id",true],["propertyId","_propertyId",true],["sourceId","_sourceId",true],
      ["number","Objektnummer"],["name","Objektnamn"],["area","Objektarea, m²"],["category","Objektkategori"],["use","Verksamhetstyp"],["unitId","Verksamhet"],
      ["employees","Anställda"],["users","Brukare"],["rooms","Rum"],["commonArea","Gemensam yta"],["apartmentArea","Lägenhetsyta"],["start","Giltigt fr.o.m."],["end","Giltigt t.o.m."],["predecessorIds","_predecessorIds",true],["comment","Kommentar"]
    ],labelAliases:{number:["Objektnr","Objektsnummer","Objektsnr"],area:["Objektarea","Objektyta"]},display:["Fastighet","Adress","Föregående objekt"] },
    { sheet:"Avtal", key:"contracts", prefix:"AVT", columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["objectId","_objectId",true],["propertyId","_propertyId",true],["responsiblePersonId","_responsiblePersonId",true],
      ["number","Avtalsnummer"],["source","Källa"],["category","Lokalkategori"],["tenantName","Hyresgäst enligt källa"],["use","Verksamhetstyp"],["businessName","Verksamhet"],["businessDescription","Verksamhetsbeskrivning"],
      ["start","Start"],["end","Slut"],["moveInDate","Inflyttning"],["moveOutDate","Utflyttning"],["comment","Kommentar"],["noticePeriodMonths","Uppsägningstid månader"],["renewalPeriodMonths","Förlängningstid månader"],["originalTerm","Ursprunglig avtalstid"],
      ["terminatedOn","Uppsagd den"],["terminationReason","Uppsägningsorsak"],
      ["baseRent","Bashyra"],["baseAdditions","Bastillägg"],["rentBaseYear","Hyra basår"],["rentBaseIndex","Hyra bastal (KPI)"],["rentIndexPercent","Hyra uppräkning %"],["additionBaseYear","Tillägg basår"],["additionBaseIndex","Tillägg bastal (KPI)"],["additionIndexPercent","Tillägg uppräkning %"],
      ["rentAdjustmentMethod","Hyra justeringsregel"],["rentAnnualPercent","Hyra fast årlig uppräkning %"],["rentMinPercent","Hyra minsta uppräkning %"],["rentMaxPercent","Hyra högsta uppräkning %"],["rentLimitBasis","Hyra min/max gäller"],
        ["additionAdjustmentMethod","Tillägg justeringsregel"],["additionAnnualPercent","Tillägg fast årlig uppräkning %"],["additionMinPercent","Tillägg minsta uppräkning %"],["additionMaxPercent","Tillägg högsta uppräkning %"],["additionLimitBasis","Tillägg min/max gäller"],
        ["annualPropertyTax","F-skatt per år"],
      ["costCenterOperations","Kstl drift"],["costCenterPremises","Kstl lokaler"],["ekotObject","Objekt i Ekot"],["contractDocumentUrl","Avtals-PDF"],["contractDocumentName","Avtalsdokument"],["contractDocumentKind","Dokumenttyp"],
      ["mediaWaste","Sopor"],["mediaElectricity","El"],["mediaWater","VA"],["mediaHeating","Värme"],["mediaHotWater","VV"],["mediaVentilation","Vent"],["mediaOutdoor","Utem."],["mediaPropertyTax","F-skatt ingår"],
      ["unitId","_unitId",true],["employees","Anställda"],["users","Brukare"],["rooms","Rum"],
      ["enrichmentSource","_enrichmentSource",true],["enrichmentSourceRow","_enrichmentSourceRow",true],["enrichmentTargetYear","_enrichmentTargetYear",true]
    ], display:["Objekt","Fastighet","Adress","Verksamhetsansvarig"] },
    { sheet:"Parter", key:"organizations", prefix:"PART", columns:[
      ["id","_id",true],["name","Part"],["type","Typ"],["ownerClass","Ägarklass"],["investmentRule","Investeringsregel"],["investmentThreshold","Investeringsgräns kr"],["rentSurchargeRate","Hyrespåslag %"]
    ]},
    { sheet:"Personer", key:"people", prefix:"P", columns:[
      ["id","_id",true],["name","Namn"],["organizationId","_organizationId",true],["unitId","_unitId",true],["role","Befattning"],["phone","Telefonnummer"],["email","E-post"]
    ], display:["Part","Område"] },
    { sheet:"Beställningar", key:"orders", prefix:"ORD", columns:[
      ["id","_id",true],["activityId","_activityId",true],["orderedByPersonId","_orderedByPersonId",true],
      ["orderedAt","Beställningsdatum"],["status","Beställningsstatus"],["supplier","Leverantör"],["orderReference","Beställningsreferens"],["orderedCost","Beställt belopp"],
      ["deliveryText","Leverans"],["completedAt","Utförd"],["finalCost","Utfall"],["paymentStatus","Betalstatus"],["paidAt","Betald"],["invoiceComment","Kommentar"],["ownerPays","Betalas av fastighetsägaren"]
    ], display:["Aktivitet","Beställd av"] },
  ];
  // New product: recurring expenses are actual business records, not legacy drift issues.
  // Yearly actuals remain structured metadata per row; the visible sheet is intentionally compact.
  SCHEMAS.push({
    sheet:"Löpande kostnader",key:"recurringCosts",prefix:"KOST",
    columns:[
      ["id","_id",true],
      ["propertyId","_propertyId",true],["contractId","_contractId",true],
      ["name","Kostnad"],["category","Kategori"],
      ["annualAmount","Årskostnad, kr"],
      ["startYear","Från år"],["endYear","Till år"]
    ],
    display:["Fastighet","Avtal"]
  });
  SCHEMAS.find(s=>s.key==='objects').columns.push(['areaType','Areatyp']);
  SCHEMAS.forEach(function(schema) { schema.fields = schema.columns.map(function(column){ return column[0]; }); });

  SCHEMAS.find(s=>s.key==='contracts').columns.push(['tenantPartyId','_tenantPartyId',true],['tenantResponsiblePersonId','_tenantResponsiblePersonId',true]);
  SCHEMAS.find(s=>s.key==='contracts').labelAliases={
    tenantName:['Hyresgäst'],use:['Användning'],category:['Lokalkategori (LEB)'],
    employees:['Antal medarbetare (viss+ heltid)','Antal medarbetare (viss + heltid)','Antal medarbetare','Antal anställda'],
    apartmentArea:['Lägenheter (yta)','Lägenhetsyta, m²'],
    contractDocumentUrl:['Länk avtal (Huvudkontrakt)','Länk till huvudkontrakt']
  };
  SCHEMAS.find(s=>s.key==='contracts').display.push('Hyresgäst','Hyresgästens kontaktperson');
  // Compatibility-only data: preserved for older imports and calculations,
  // but not written as parallel visible business sheets in model v5.
  const ACTIVITY_SCHEMA = {
    sheet:"Aktiviteter", key:"activities", prefix:"ACT",
    columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["objectId","_objectId",true],["propertyId","_propertyId",true],["contractId","_contractId",true],["responsiblePersonId","_responsiblePersonId",true],["scopeType","Hemvisttyp"],["unitId","Område"],
      ["type","Typ"],["actionKind","Åtgärdens karaktär"],["rentSurchargeStartDate","Hyrespåslag från"],["title","Aktivitet"],["description","Beskrivning"],["category","Kategori"],["status","Status"],["priority","Prioritet"],
      ["planningYear","Planår"],["planningQuarter","Kvartal",true],["planningMonth","Månad",true],["budgetCategory","Budgetkategori",true],["includeInBudget","Ta med i budget"],
      ["estimatedCost","Bedömd kostnad"],["startDate","Start"],["endDate","Slut"]
    ],
    display:["Objekt","Fastighet","Adress","Avtal","Ansvarig hos oss"]
  };
  ACTIVITY_SCHEMA.fields = ACTIVITY_SCHEMA.columns.map(function(column){ return column[0]; });

  // One set of user-facing names, shared by forms, workbook headers and mapping.
  const FRONTEND_LABELS = {
    contracts:{start:"Giltigt fr.o.m.",end:"Giltigt t.o.m.",moveInDate:"Inflyttningsdatum",moveOutDate:"Utflyttningsdatum",area:"Area, m²",noticePeriodMonths:"Uppsägningstid, månader",renewalPeriodMonths:"Förlängningstid, månader",baseRent:"Bashyra, kr/år",baseAdditions:"Tillägg, kr/år",rentBaseYear:"Basår",rentIndexPercent:"Indexuppräkning, %",additionBaseYear:"Tillägg basår",additionIndexPercent:"Indexuppräkning tillägg, %",annualPropertyTax:"Fastighetsskatt, kr/år",use:"Användning",employees:"Antal medarbetare",apartmentArea:"Lägenhetsyta, m²",contractDocumentUrl:"Länk till huvudkontrakt"},
    activities:{title:"Ärendenamn",responsiblePersonId:"Ansvarig",startDate:"Fr.o.m.",endDate:"T.o.m.",planningYear:"Planeringsår",estimatedCost:"Bedömd kostnad, kr"}
  };
  Object.assign(SCHEMAS.find(schema=>schema.key==='contracts').labelAliases,{businessName:['Namn på verksamheten','Verksamhetsnamn'],businessDescription:['Kommentar verksamhet']});
  SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema){
    schema.labelAliases=schema.labelAliases||{};
    schema.columns.forEach(function(column){
      const label=FRONTEND_LABELS[schema.key]?.[column[0]];
      if(label&&label!==column[1]){schema.labelAliases[column[0]]=[column[1],...(schema.labelAliases[column[0]]||[])];column[1]=label;}
    });
  });
  function fieldLabel(collection,field,fallback){
    return FRONTEND_LABELS[collection]?.[field] || SCHEMAS.concat([ACTIVITY_SCHEMA]).find(s=>s.key===collection)?.columns.find(c=>c[0]===field&&!c[2])?.[1] || fallback || field;
  }

    // Only new canonical Lokalblick sheets are read and written.
  const assignmentSchema={
    sheet:"Ansvar", key:"assignments",prefix:"A",
    columns:[
      ["id","_id",true],["personId","_personId",true],
      ["targetType","_targetType",true],["targetId","_targetId",true],
      ["role","Roll"],["fromDate","Från"],["toDate","Till"],
      ["allocation","Omfattning %"],["organizationId","_organizationId",true],
      ["roleKey","_roleKey",true],["shared","Delat ansvar"],["cancelled","_cancelled",true]
    ],
    display:["Person","Måltyp","Mål","Part"]
  };
  SCHEMAS.push(assignmentSchema);
  SCHEMAS.forEach(schema=>{schema.fields=schema.columns.map(col=>col[0]);});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function rowKey(row, index) {
    return row && row.id ? String(row.id) : "rad-" + (index + 1);
  }
function comparableRow(row) {
    const out = {};
    Object.keys(row || {}).sort().forEach(function(key) {
      const value = row[key];
      if (value !== undefined) out[key] = value;
    });
    return out;
  }
function diffLists(before, after, schema) {
    const oldRows = Array.isArray(before) ? before : [];
    const newRows = Array.isArray(after) ? after : [];
    const oldMap = new Map(oldRows.map(function(row, i){ return [rowKey(row,i), row]; }));
    const newMap = new Map(newRows.map(function(row, i){ return [rowKey(row,i), row]; }));
    const changes = [];

    newMap.forEach(function(row, id) {
      if (!oldMap.has(id)) {
        changes.push({ sheet:schema.sheet, key:schema.key, id:id, action:"Skapad", fields:[], before:null, after:clone(row) });
        return;
      }
      const oldRow = oldMap.get(id);
      const fields = Array.from(new Set(Object.keys(oldRow || {}).concat(Object.keys(row || {})))).filter(function(field) {
        return JSON.stringify((oldRow || {})[field] ?? null) !== JSON.stringify((row || {})[field] ?? null);
      });
      if (fields.length) {
        changes.push({ sheet:schema.sheet, key:schema.key, id:id, action:"Ändrad", fields:fields, before:clone(oldRow), after:clone(row) });
      }
    });
    oldMap.forEach(function(row, id) {
      if (!newMap.has(id)) changes.push({ sheet:schema.sheet, key:schema.key, id:id, action:"Borttagen", fields:[], before:clone(row), after:null });
    });
    return changes;
  }
function diffData(before, after) {
    let changes = [];
    SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema) {
      changes = changes.concat(diffLists((before || {})[schema.key], (after || {})[schema.key], schema));
    });
    const oldPlans = (before && before.budgetPlans) || [];
    const newPlans = (after && after.budgetPlans) || [];
    if (JSON.stringify(oldPlans) !== JSON.stringify(newPlans)) {
      changes.push({ sheet:"Budget", key:"budgetPlans", id:"budget", action:"Ändrad", fields:["budgetPlans"], before:null, after:null });
    }
    if(JSON.stringify(extraRows(before||{}))!==JSON.stringify(extraRows(after||{}))) changes.push({sheet:"Tilläggsdata",key:"metadata",id:"metadata",action:"Ändrad",fields:[],before:null,after:null});
    return changes;
  }
  function rowsFromSheet(workbook, sheet) {
    if (!workbook.Sheets[sheet]) return [];
    return xlsx().utils.sheet_to_json(workbook.Sheets[sheet], { defval:"", raw:true });
  }

  function normalizeRows(rows) {
    return rows.filter(function(row) {
      return Object.keys(row).some(function(key) { return row[key] !== "" && row[key] != null; });
    });
  }

  const READ_LABEL_ALIASES = {
    organizations:{name:["Företag","Organisation"]},
    people:{role:["Roll"],phone:["Telefon","Mobil","Mobilnummer"]},
    properties:{ownerPartyId:["_ownerOrgId"]},
    contracts:{businessPartyId:["_tenantOrgId"]}
  };
  function schemaRowsFromSheet(workbook, schema) {
    const rows = normalizeRows(rowsFromSheet(workbook, schema.sheet));
    return rows.map(function(row) {
      const out = {};
      schema.columns.forEach(function(column) {
        const field = column[0], label = column[1];
        const aliases=[...((READ_LABEL_ALIASES[schema.key]||{})[field]||[]),...(schema.labelAliases?.[field]||[])];
        if (Object.prototype.hasOwnProperty.call(row, label)) out[field] = row[label];
        else {
          const oldLabel=aliases.find(function(alias){return Object.prototype.hasOwnProperty.call(row,alias);});
          if(oldLabel)out[field]=row[oldLabel];
          else if (Object.prototype.hasOwnProperty.call(row, field)) out[field] = row[field];
          else out[field] = "";
        }
      });
      // Read historical Excel columns as INPUT only. The canonical writer no
      // longer stores any of these facts on the agreement.
      if(schema.key==='contracts'){
        out.businessName ||= row["Namn på verksamheten"]||row.businessName||row.business||'';
        out.businessDescription ||= row["Kommentar verksamhet"]||row.businessDescription||row.businessComment||'';
        if((out.area==null||out.area==='')&&(row["Area, m²"]!=null||row.Area!=null))out.area=row["Area, m²"]??row.Area;
        const apartmentArea=row['Lägenhetsyta']??row['Lägenhetsyta, m²']??row['Lägenheter (yta)'];
        if(apartmentArea!=null&&apartmentArea!=='')out.apartmentArea=apartmentArea;
      }
      (schema.display || []).forEach(function(label) {
        out["__display_" + label] = row[label] == null ? "" : row[label];
      });
      return out;
    });
  }

  function nextStableId(prefix, rows) {
    const used = new Set((rows || []).map(function(row){ return String(row.id || ""); }));
    let n = 1;
    while (used.has(prefix + "-" + String(n).padStart(4,"0"))) n++;
    return prefix + "-" + String(n).padStart(4,"0");
  }

  function ensureStableIds(data) {
    SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema) {
      const rows = data[schema.key] || [];
      rows.forEach(function(row) {
        if (!row.id) row.id = nextStableId(schema.prefix || "ID", rows);
      });
    });
  }

  function propertyDisplay(property) {
    if (!property) return "";
    return property.address || property.designation || property.id || "";
  }
  function contractDisplay(contract) {
    if (!contract) return "";
    return contract.number || contract.id || "";
  }
  function orgDisplay(org) {
    return org ? (org.name || org.id || "") : "";
  }
  function personDisplay(person) {
    return person ? (person.name || person.id || "") : "";
  }
  function unitDisplay(id) {
    return {
      VARDBO:"VÅRDBO", ORDBO:"ORDBO", MYND_STAB:"Myndighet / Stab", HOF:"Hälsa & Förebyggande"
    }[id] || id || "";
  }
  function unitIdFromDisplay(value) {
    const text = String(value || "").trim().toLowerCase();
    const pairs = {
      "vårdbo":"VARDBO","vardbo":"VARDBO","ordbo":"ORDBO",
      "myndighet / stab":"MYND_STAB","myndighet/stab":"MYND_STAB",
      "hälsa & förebyggande":"HOF","halsa & forebyggande":"HOF"
    };
    return pairs[text] || value || "";
  }

  function byDisplay(rows, value, displayFn) {
    const wanted = String(value || "").trim().toLowerCase();
    if (!wanted) return null;
    return (rows || []).find(function(row) {
      return String(displayFn(row) || "").trim().toLowerCase() === wanted ||
        String(row.id || "").trim().toLowerCase() === wanted;
    }) || null;
  }
  // Accept both older address-only display columns and newer two-column exports.
  // Do not pick a property automatically when the visible identity is ambiguous.
  function resolveDisplayedProperty(properties, designation, address) {
    const norm = x => String(x || "").trim().toLocaleLowerCase("sv");
    const name=norm(designation), street=norm(address);
    if (!name && !street) return null;
    const matches=(properties||[]).filter(function(p) {
      const nameMatches=!name || norm(p.designation)===name ||
        norm(p.address)===name || norm(p.id)===name;
      return nameMatches && (!street || norm(p.address)===street);
    });
    return matches.length===1 ? matches[0] : null;
  }

  function resolveHumanRelations(data) {
    const properties=data.properties||[], contracts=data.contracts||[], organizations=data.organizations||[], people=data.people||[], activities=data.activities||[];
    (data.properties||[]).forEach(function(row) {
      if (!row.ownerPartyId && row.__display_Fastighetsägare) { const m=byDisplay(organizations,row.__display_Fastighetsägare,orgDisplay); if(m) row.ownerPartyId=m.id; }
      if (!row.ownerResponsiblePersonId && row["__display_Ansvarig hos fastighetsägaren"]) { const m=byDisplay(people,row["__display_Ansvarig hos fastighetsägaren"],personDisplay); if(m) row.ownerResponsiblePersonId=m.id; }
      if (!row.responsiblePersonId && row["__display_Ansvarig hos oss"]) { const m=byDisplay(people,row["__display_Ansvarig hos oss"],personDisplay); if(m) row.responsiblePersonId=m.id; }
    });
    (data.objects||[]).forEach(function(row){if(!row.propertyId){const p=resolveDisplayedProperty(properties,row.__display_Fastighet,row.__display_Adress);if(p)row.propertyId=p.id;}});
    (data.contracts||[]).forEach(function(row) {
      if(!row.objectId&&row.__display_Objekt){const candidates=(data.objects||[]).filter(o=>(!row.propertyId||o.propertyId===row.propertyId)&&[o.number,o.name].includes(row.__display_Objekt));if(candidates.length===1)row.objectId=candidates[0].id;}
      if (!row.propertyId) { const m=resolveDisplayedProperty(properties,row.__display_Fastighet,row.__display_Adress); if(m) row.propertyId=m.id; }
      if (!row.businessPartyId && row.__display_Verksamhetspart) { const m=byDisplay(organizations,row.__display_Verksamhetspart,orgDisplay); if(m) row.businessPartyId=m.id; }
      if (!row.businessResponsiblePersonId && row.__display_Verksamhetsansvarig) { const m=byDisplay(people,row.__display_Verksamhetsansvarig,personDisplay); if(m) row.businessResponsiblePersonId=m.id; }
      if(!row.tenantPartyId&&(row.__display_Hyresgäst||row['__display_Hyresgäst (juridisk part)'])){const m=byDisplay(organizations,(row.__display_Hyresgäst||row['__display_Hyresgäst (juridisk part)']),orgDisplay);if(m)row.tenantPartyId=m.id;}
      if(!row.tenantResponsiblePersonId&&row['__display_Hyresgästens kontaktperson']){const m=byDisplay(people,row['__display_Hyresgästens kontaktperson'],personDisplay);if(m)row.tenantResponsiblePersonId=m.id;}
      if (!row.unitId && (row.__display_Verksamhet || row.__display_Område)) row.unitId=unitIdFromDisplay(row.__display_Verksamhet || row.__display_Område);
    });
    (data.people||[]).forEach(function(row) {
      const display=row.__display_Part || row.__display_Organisation;
      if (!row.organizationId && display) { const m=byDisplay(organizations,display,orgDisplay); if(m) row.organizationId=m.id; }
      if (!row.unitId && row.__display_Område) row.unitId=unitIdFromDisplay(row.__display_Område);
    });
    function resolveCommon(row) {
      if (!row.propertyId) { const m=resolveDisplayedProperty(properties,row.__display_Fastighet,row.__display_Adress); if(m) row.propertyId=m.id; }
      if (!row.contractId && row.__display_Avtal) { const m=byDisplay(contracts,row.__display_Avtal,contractDisplay); if(m) row.contractId=m.id; }
      const d=row["__display_Ansvarig hos oss"] || row.__display_Ansvarig;
      if (!row.responsiblePersonId && d) { const m=byDisplay(people,d,personDisplay); if(m) row.responsiblePersonId=m.id; }
    }
    ["activities","recurringCosts"].forEach(function(key) { (data[key]||[]).forEach(resolveCommon); });
    (data.orders||[]).forEach(function(row){
      if(!row.activityId && row.__display_Aktivitet){ const m=byDisplay(activities,row.__display_Aktivitet,function(x){return x.title||x.id;}); if(m) row.activityId=m.id; }
      if(!row.orderedByPersonId && row["__display_Beställd av"]){ const m=byDisplay(people,row["__display_Beställd av"],personDisplay); if(m) row.orderedByPersonId=m.id; }
    });
    function resolveRelation(row) {
      if(!row.organizationId && row.__display_Part){const m=byDisplay(organizations,row.__display_Part,orgDisplay);if(m)row.organizationId=m.id;}
      if(!row.targetType&&row.__display_Måltyp)row.targetType=({Fastighet:'property',Objekt:'object',Avtal:'contract',Aktivitet:'activity',Verksamhet:'business',Part:'organization'})[row.__display_Måltyp]||'';
      if (!row.personId && row.__display_Person) { const m=byDisplay(people,row.__display_Person,personDisplay); if(m) row.personId=m.id; }
      if (!row.targetId && row.__display_Mål) {
        const wanted=String(row.__display_Mål||"").trim().toLowerCase();
        const groups=[["property",properties,propertyDisplay],["object",data.objects||[],function(x){return x.number||x.name||x.id;}],["organization",organizations,orgDisplay],["contract",contracts,contractDisplay],["activity",data.activities||[],function(x){return x.title||x.id;}],["project",data.projects||[],function(x){return x.name||x.id;}],["maintenance",data.maintenance||[],function(x){return x.title||x.id;}],["driftIssue",data.driftIssues||[],function(x){return x.title||x.id;}],["wish",data.wishes||[],function(x){return x.title||x.id;}],["investigation",data.investigations||[],function(x){return x.title||x.id;}]];
        for (const group of groups) { if(row.targetType&&row.targetType!==group[0])continue;const m=(group[1]||[]).find(function(x){return String(group[2](x)||"").trim().toLowerCase()===wanted;}); if(m){row.targetType=group[0];row.targetId=m.id;break;} }
      }
    }
    (data.contacts||[]).forEach(resolveRelation); (data.assignments||[]).forEach(resolveRelation);
    SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema) { (data[schema.key]||[]).forEach(function(row) { Object.keys(row).filter(function(key){return key.indexOf("__display_")===0;}).forEach(function(key){delete row[key];}); }); });
  }

  function canonicalizeModel(data) {
    data=data||{};
    ["properties","objects","contracts","organizations","people","assignments","orders",
     "activities","recurringCosts","agreementItems","auditLog","sourceRegistry",
     "importReview","documents"].forEach(key=>{
       if(!Array.isArray(data[key])) data[key]=[];
     });
    // Owner names in external Excel files may resolve to real organizations.
    for(const property of data.properties){
      if(!property.ownerPartyId && String(property.owner||"").trim()){
        const name=String(property.owner).trim();
        let party=data.organizations.find(x=>x.type==="owner"&&
          String(x.name||"").toLowerCase()===name.toLowerCase());
        if(!party){
          party={id:nextStableId("PART",data.organizations),name,type:"owner",ownerClass:"Extern"};
          data.organizations.push(party);
        }
        property.ownerPartyId=party.id;
      }
      // External LEB assignments are valid input relations, not legacy tables.
      // Resolve the owner's contact directly before importing names and people.
      if(!property.ownerResponsiblePersonId && property.ownerPartyId) {
        const assignment=data.assignments.find(a=>
          a.targetType==="property" && a.targetId===property.id &&
          !a.toDate && /fastighetsförvaltare|ägar/i.test(String(a.role||"")) &&
          data.people.some(person=>person.id===a.personId &&
            person.organizationId===property.ownerPartyId));
        if(assignment)property.ownerResponsiblePersonId=assignment.personId;
      }
    }
    window.LokalblickBusinessModel?.normalize(data);
    window.LokalblickResponsibility?.normalize(data);
    return data;
  }

  const EXTRA_KEYS = ["agreementItems","indexSeries","importReview","documents","priceBaseAmounts","importFieldPreferences","importMappings","sourceRegistry","auditLog","activityOptions"];
  const RESTORE_EXTRA_KEYS = ["agreementItems","indexSeries","auditLog","sourceRegistry","importReview","documents","priceBaseAmounts","importFieldPreferences","importMappings","activityOptions"];
  function extraRows(data) {
    const rows=[];
    function add(collection,id,value){const json=JSON.stringify(value);for(let offset=0;offset<json.length;offset+=30000) rows.push({collection,id,part:offset/30000,json:json.slice(offset,offset+30000)});}
    SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema){
      const represented=new Set(schema.fields);
      (data[schema.key]||[]).forEach(function(row){
        const extras=Object.fromEntries(Object.entries(row).filter(function(entry){return !represented.has(entry[0]);}));
        if(Object.keys(extras).length)add(schema.key,String(row.id),extras);
      });
    });
    EXTRA_KEYS.forEach(function(key){if(data[key]!=null)add("workspace",key,data[key]);});
    (data.budgetPlans||[]).forEach(function(p){
      const extras=Object.fromEntries(Object.entries(p).filter(function(entry){return !["year","status","createdAt","lockedAt","lockedBy","preliminaryIndex","lockedIndexYear","lockedIndexValue","lockedIndexSource","targets","notes"].includes(entry[0]);}));
      if(Object.keys(extras).length)add("budgetPlans",String(p.year),extras);
    });
    return rows;
  }
  function restoreExtras(workbook,data){
    const grouped=new Map();
    rowsFromSheet(workbook,"Tilläggsdata").forEach(row=>{const key=String(row.Collection)+"|"+String(row.ID);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);});
    grouped.forEach(parts=>{
      parts.sort((a,b)=>Number(a.Del)-Number(b.Del));const first=parts[0],value=JSON.parse(parts.map(x=>x.JSON||"").join(""));
      if(first.Collection==="workspace"&&RESTORE_EXTRA_KEYS.includes(first.ID))data[first.ID]=value;
      else {const list=data[first.Collection];if(!Array.isArray(list))return;const row=list.find(x=>String(first.Collection==="budgetPlans"?x.year:first.Collection==="indexSeries"?x.year+"|"+x.month:x.id)===String(first.ID));if(row)Object.keys(value).filter(k=>!["__proto__","constructor","prototype","id","year"].includes(k)).forEach(k=>{row[k]=value[k];});}
    });
  }

  function workbookToData(workbook) {
    const data = { isDemo:false, sourceName:sourceName() || "Excel-källa" };
    SCHEMAS.forEach(function(schema) {
      data[schema.key] = schemaRowsFromSheet(workbook, schema);
    });
    data.activities = workbook.Sheets[ACTIVITY_SCHEMA.sheet]
      ? schemaRowsFromSheet(workbook, ACTIVITY_SCHEMA)
      : [];
    ensureStableIds(data);
    resolveHumanRelations(data);

    function budgetRows(sheet, columns) {
      const rows=normalizeRows(rowsFromSheet(workbook,sheet));
      return rows.map(function(row) {
        const out={};
        columns.forEach(function(column) {
          const field=column[0], label=column[1];
          out[field]=Object.prototype.hasOwnProperty.call(row,label) ? row[label] : (row[field] == null ? "" : row[field]);
        });
        return out;
      });
    }

    const budgetSheet = workbook.Sheets["Budget"] ? "Budget" : "Budgetplaner";
    const plans = budgetRows(budgetSheet,[["year","År"],["status","Status"],["createdAt","Skapad"],["lockedAt","Låst"],["lockedBy","Låst av"],["preliminaryIndex","Preliminärt oktoberindex"],["lockedIndexYear","Låst indexår"],["lockedIndexValue","Låst oktoberindex"],["lockedIndexSource","Indexkälla"],["targetRent","Hyra + drift"],["targetMaintenance","Underhåll"],["targetProject","Projekt"],["targetOperations","Driftkostnader"],["targetInvestigations","Utredningar"]]);
    const targets = workbook.Sheets["Budgetmål"] ? budgetRows("Budgetmål",[["year","År"],["category","Kategori"],["amount","Belopp"],["note","Kommentar"]]) : [];
    const lines = budgetRows("Budgetrader",[["year","År"],["category","Kategori"],["sub","Underkategori"],["source","Källa"],["contractId","_contractId"],["propertyId","_propertyId"],["amount","Belopp"],["sourceType","Typ"],["sourceId","_sourceId"],["status","Värdestatus"],["budgetDays","Budgetdagar"],["budgetDaysInYear","Dagar år"],["budgetFactor","Andel år"],["budgetPeriod","Budgetperiod"],["budgetFrom","Budget från"],["budgetTo","Budget till"]]);
    const indexSheet = workbook.Sheets["Index"] ? "Index" : (workbook.Sheets["KPI"] ? "KPI" : "");
    data.indexSeries = indexSheet
      ? budgetRows(indexSheet,[["year","År"],["month","Månad"],["value",indexSheet==="Index"?"Indextal":"Värde"],["seriesBase","Serie basår"],["source","Källa"]])
          .map(function(row){ return {year:Number(row.year)||0,month:Number(row.month)||10,value:Number(row.value)||0,seriesBase:String(row.seriesBase||"1980"),source:row.source||""}; })
          .filter(function(row){ return row.year && row.value; })
      : [];

    data.budgetPlans = plans.map(function(plan) {
      const year = Number(plan.year) || plan.year;
      const planTargets = {"Hyra + drift":Number(plan.targetRent)||0,"Underhåll":Number(plan.targetMaintenance)||0,"Projekt":Number(plan.targetProject)||0,"Driftkostnader":Number(plan.targetOperations)||0,"Utredningar":Number(plan.targetInvestigations)||0};
      const notes = {};
      targets.filter(function(x){ return String(x.year) === String(year); }).forEach(function(x) { if(!planTargets[x.category])planTargets[x.category]=Number(x.amount)||0;if(x.note)notes[x.category]=x.note; });
      return {
        year: year, status: plan.status || "", createdAt: plan.createdAt || "", lockedAt: plan.lockedAt || "", lockedBy: plan.lockedBy || "",
        preliminaryIndex:Number(plan.preliminaryIndex)||0,
        lockedIndexYear:Number(plan.lockedIndexYear)||0,
        lockedIndexValue:Number(plan.lockedIndexValue)||0,
        lockedIndexSource:plan.lockedIndexSource||"",
        notes: notes, targets: planTargets,
        lines: lines.filter(function(x){ return String(x.year) === String(year); }).map(function(x) {
          return {
            category:x.category || "", sub:x.sub || "", source:x.source || "",
            contractId:x.contractId || "", propertyId:x.propertyId || "", amount:Number(x.amount) || 0, sourceType:x.sourceType||"", sourceId:x.sourceId||"", status:x.status||"", budgetDays:Number(x.budgetDays)||0, budgetDaysInYear:Number(x.budgetDaysInYear)||0, budgetFactor:Number(x.budgetFactor)||0, budgetPeriod:x.budgetPeriod||"", budgetFrom:x.budgetFrom||"", budgetTo:x.budgetTo||""
          };
        })
      };
    });

    data.sourceRegistry = budgetRows("Källor",[["name","Fil"],["kind","Typ"],["rows","Rader"],["matched","Matchade"],["created","Skapade"],["review","Granska"],["importedAt","Importerad"],["sheets","Flikar"]])
      .filter(function(x){return x.name||x.kind;})
      .map(function(x){return {name:x.name||"",kind:x.kind||"",rows:Number(x.rows)||0,matched:Number(x.matched)||0,created:Number(x.created)||0,review:Number(x.review)||0,importedAt:x.importedAt||"",sheets:x.sheets||""};});
    const auditRows=budgetRows("Ändringslogg",[["id","_id"],["at","Tid"],["by","Ändrad av"],["byUserId","Användar-ID"],["actorVerified","Verifierad identitet"],["collection","Tabell"],["recordId","Post-ID"],["action","Ändring"],["field","Fält"],["from","Från"],["to","Till"]]);
    if(auditRows.length){
      const groupedAudit=new Map();
      auditRows.forEach(function(x){
        const id=x.id||("AUDIT|"+x.at+"|"+x.collection+"|"+x.recordId);
        if(!groupedAudit.has(id))groupedAudit.set(id,{id:id,at:x.at||"",by:x.by||"",byUserId:x.byUserId||"",actorVerified:x.actorVerified===true||String(x.actorVerified).toLowerCase()==="true",collection:x.collection||"",recordId:x.recordId||"",action:x.action||"",fields:[]});
        if(x.field)groupedAudit.get(id).fields.push({field:x.field,from:x.from??"",to:x.to??""});
      });
      data.auditLog=Array.from(groupedAudit.values());
    }

    restoreExtras(workbook,data);
    canonicalizeModel(data);
    ensureStableIds(data);
    if(window.LokalblickObjectModel)window.LokalblickObjectModel.normalize(data);
    return data;
  }

  function displayValue(schema, label, row, data) {
    const properties=data.properties||[],contracts=data.contracts||[],organizations=data.organizations||[],people=data.people||[],activities=data.activities||[];
    const activityProperty=function(a){if(!a)return "";if(a.propertyId)return a.propertyId;const c=contracts.find(function(x){return x.id===a.contractId;});return c&&c.propertyId||"";};
    if(label==='Föregående objekt')return (row.predecessorIds||[]).map(id=>{const o=(data.objects||[]).find(o=>o.id===id);return o?o.number||o.name||o.id:id;}).join('; ');
    if(label==='Objekt'){const object=(data.objects||[]).find(o=>o.id===row.objectId);return object?object.number||object.name||object.id:'';}
    if(label==="Fastighet"||label==="Adress"){
      const id=schema.key==="activities"?activityProperty(row):row.propertyId;
      const property=properties.find(function(x){return x.id===id;});
      return property ? (label==="Fastighet" ? property.designation||"" : property.address||"") : "";
    }
    if(label==="Avtal")return contractDisplay(contracts.find(function(x){return x.id===row.contractId;}));
    if(label==="Fastighetsägare")return orgDisplay(organizations.find(function(x){return x.id===row.ownerPartyId;}));
    if(label==='Hyresgäst')return orgDisplay(organizations.find(x=>x.id===row.tenantPartyId));
    if(label==='Hyresgästens kontaktperson')return personDisplay(people.find(x=>x.id===row.tenantResponsiblePersonId));
    if(label=="Verksamhetspart")return orgDisplay(organizations.find(function(x){return x.id===row.businessPartyId;}));
    if(label==="Part"||label==="Organisation")return orgDisplay(organizations.find(function(x){return x.id===row.organizationId;}));
    if(label=="Område"||label=="Verksamhet")return unitDisplay(row.unitId);
    if(label==="Ansvarig"||label==="Ansvarig hos oss")return personDisplay(people.find(function(x){return x.id===row.responsiblePersonId;}));
    if(label==="Ansvarig hos fastighetsägaren")return personDisplay(people.find(function(x){return x.id===row.ownerResponsiblePersonId;}));
    if(label==="Verksamhetsansvarig")return personDisplay(people.find(function(x){return x.id===row.businessResponsiblePersonId;}));
    if(label==="Aktivitet")return (activities.find(function(x){return x.id===row.activityId;})||{}).title||row.activityId||"";
    if(label==="Beställd av")return personDisplay(people.find(function(x){return x.id===row.orderedByPersonId;}));
    if(label==="Person")return personDisplay(people.find(function(x){return x.id===row.personId;}));
    if(label==="Från person")return personDisplay(people.find(function(x){return x.id===row.fromPersonId;}));
    if(label==="Till person")return personDisplay(people.find(function(x){return x.id===row.toPersonId;}));
    if(label==="Måltyp"){if(row.targetType==="property")return"Fastighet";if(row.targetType==="object")return"Objekt";if(row.targetType==="contract")return"Avtal";if(row.targetType==="organization")return"Part";if(row.targetType==="business")return"Verksamhet";if(["activity"].includes(row.targetType))return"Aktivitet";return row.targetType||"";}
    if(label==="Mål"){if(row.targetType==='object'){const o=(data.objects||[]).find(o=>o.id===row.targetId);return o?o.number||o.name||o.id:row.targetId;}if(row.targetType==='organization')return orgDisplay(organizations.find(o=>o.id===row.targetId));if(row.targetType==='business')return unitDisplay(row.targetId);const lookups=[[properties,propertyDisplay],[contracts,contractDisplay],[data.activities||[],function(x){return x.title||x.id;}],[data.projects||[],function(x){return x.name||x.id;}],[data.maintenance||[],function(x){return x.title||x.id;}],[data.driftIssues||[],function(x){return x.title||x.id;}],[data.wishes||[],function(x){return x.title||x.id;}]];for(const lookup of lookups){const found=(lookup[0]||[]).find(function(x){return x.id===row.targetId;});if(found)return lookup[1](found);}return row.targetId||"";}
    return "";
  }

  function sheetFromSchema(schema, rows, data) {
    const visible = schema.columns.filter(function(column){return !column[2];});
    const hidden = schema.columns.filter(function(column){return Boolean(column[2]);});
    const headers = visible.map(function(column){return column[1];})
      .concat(schema.display || [])
      .concat(hidden.map(function(column){return column[1];}));

    const excelRows=(rows||[]).map(function(row) {
      const out={};
      visible.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : Array.isArray(row[column[0]])?JSON.stringify(row[column[0]]):row[column[0]];});
      (schema.display||[]).forEach(function(label){out[label]=displayValue(schema,label,row,data);});
      hidden.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : Array.isArray(row[column[0]])?JSON.stringify(row[column[0]]):row[column[0]];});
      return out;
    });

    const ws=excelRows.length ? xlsx().utils.json_to_sheet(excelRows,{header:headers}) : xlsx().utils.aoa_to_sheet([headers]);
    const visibleCount=visible.length+(schema.display||[]).length;
    ws["!cols"]=headers.map(function(header,index){
      return { hidden:index>=visibleCount, wch:index>=visibleCount?14:Math.max(12,Math.min(28,String(header).length+4)) };
    });
    ws["!autofilter"]={ref:ws["!ref"] || "A1:A1"};
    return ws;
  }

  function simpleSheet(rows, columns) {
    const headers=columns.map(function(column){return column[1];});
    const excelRows=(rows||[]).map(function(row){
      const out={};
      columns.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : Array.isArray(row[column[0]])?JSON.stringify(row[column[0]]):row[column[0]];});
      return out;
    });
    const ws=excelRows.length ? xlsx().utils.json_to_sheet(excelRows,{header:headers}) : xlsx().utils.aoa_to_sheet([headers]);
    ws["!cols"]=columns.map(function(column){
      return {hidden:Boolean(column[2]),wch:column[2]?14:Math.max(12,Math.min(28,String(column[1]).length+4))};
    });
    ws["!autofilter"]={ref:ws["!ref"] || "A1:A1"};
    return ws;
  }

  function dataToWorkbook(data) {
    const canonical=canonicalizeModel(clone(data||{}));
    if(window.LokalblickObjectModel)window.LokalblickObjectModel.normalize(canonical);
    window.LokalblickObjectModel?.stripAreas(canonical);
    ensureStableIds(canonical);
    window.LokalblickAgreementItems?.strip(canonical);
    const workbook = xlsx().utils.book_new();
    const metadata = [
      ["Lokalblick modellversion", MODEL_VERSION],
      ["Skapad", new Date().toISOString()],
      ["Källa", canonical && canonical.sourceName ? canonical.sourceName : "Lokalblick Excel-källa"],
      ["Så används filen", "Synliga kolumner är för användaren. Kolumner som börjar med _ är tekniska ID:n och är dolda i Excel."],
      ["ID", "Lokalblick skapar och behåller stabila ID:n automatiskt. Ändra dem inte manuellt."]
    ];
    xlsx().utils.book_append_sheet(workbook, xlsx().utils.aoa_to_sheet(metadata), "Lokalblick");

    SCHEMAS.forEach(function(schema) {
      xlsx().utils.book_append_sheet(workbook, sheetFromSchema(schema,(canonical&&canonical[schema.key])||[],canonical), schema.sheet);
    });
    xlsx().utils.book_append_sheet(workbook, sheetFromSchema(ACTIVITY_SCHEMA, canonical.activities||[], canonical), ACTIVITY_SCHEMA.sheet);

    const plans = (canonical && canonical.budgetPlans) || [];
    xlsx().utils.book_append_sheet(workbook,simpleSheet(plans.map(function(plan){return {year:plan.year,status:plan.status||"",createdAt:plan.createdAt||"",lockedAt:plan.lockedAt||"",lockedBy:plan.lockedBy||"",preliminaryIndex:Number(plan.preliminaryIndex)||0,lockedIndexYear:Number(plan.lockedIndexYear)||0,lockedIndexValue:Number(plan.lockedIndexValue)||0,lockedIndexSource:plan.lockedIndexSource||"",targetRent:Number((plan.targets||{})["Hyra + drift"])||0,targetMaintenance:Number((plan.targets||{}).Underhåll)||0,targetProject:Number((plan.targets||{}).Projekt)||0,targetOperations:Number((plan.targets||{}).Driftkostnader)||0,targetInvestigations:Number((plan.targets||{}).Utredningar)||0};}),[["year","År"],["status","Status"],["createdAt","Skapad"],["lockedAt","Låst"],["lockedBy","Låst av"],["preliminaryIndex","Preliminärt oktoberindex"],["lockedIndexYear","Låst indexår"],["lockedIndexValue","Låst oktoberindex"],["lockedIndexSource","Indexkälla"],["targetRent","Hyra + drift"],["targetMaintenance","Underhåll"],["targetProject","Projekt"],["targetOperations","Driftkostnader"],["targetInvestigations","Utredningar"]]),"Budget");

    const lineRows=[];
    plans.forEach(function(plan) {
      (plan.lines||[]).forEach(function(line) {
        lineRows.push({
          year:plan.year,category:line.category||"",sub:line.sub||"",source:line.source||"",
          contractId:line.contractId||"",propertyId:line.propertyId||"",amount:Number(line.amount)||0,sourceType:line.sourceType||"",sourceId:line.sourceId||"",status:line.status||"",
          budgetDays:Number(line.budgetDays)||0,budgetDaysInYear:Number(line.budgetDaysInYear)||0,budgetFactor:Number(line.budgetFactor)||0,budgetPeriod:line.budgetPeriod||"",budgetFrom:line.budgetFrom||"",budgetTo:line.budgetTo||""
        });
      });
    });
    xlsx().utils.book_append_sheet(workbook,simpleSheet(lineRows,[["year","År"],["category","Kategori"],["sub","Underkategori"],["source","Källa"],["amount","Belopp"],["budgetDays","Budgetdagar"],["budgetDaysInYear","Dagar år"],["budgetFactor","Andel år"],["budgetPeriod","Budgetperiod"],["budgetFrom","Budget från"],["budgetTo","Budget till"],["contractId","_contractId",true],["propertyId","_propertyId",true],["sourceType","Typ"],["sourceId","_sourceId",true],["status","Värdestatus"]]),"Budgetrader");
    const registry=(canonical&&canonical.sourceRegistry)||[];
    xlsx().utils.book_append_sheet(workbook,simpleSheet(registry.map(function(x){return {
      name:x.name||"",kind:x.kind||"",rows:Number(x.rows)||0,matched:Number(x.matched)||0,created:Number(x.created)||0,
      review:Number(x.review)||0,importedAt:x.importedAt||"",sheets:x.sheets||""
    };}),[
      ["name","Fil"],["kind","Typ"],["rows","Rader"],["matched","Matchade"],["created","Skapade"],["review","Granska"],["importedAt","Importerad"],["sheets","Flikar"]
    ]),"Källor");
    const auditRows=[];
    (canonical.auditLog||[]).forEach(function(entry){
      const fields=(entry.fields||[]).length?entry.fields:[{field:"",from:"",to:""}];
      fields.forEach(function(field){auditRows.push({id:entry.id||"",at:entry.at||"",by:entry.by||"",byUserId:entry.byUserId||"",actorVerified:entry.actorVerified===true,collection:entry.collection||"",recordId:entry.recordId||"",action:entry.action||"",field:field.field||"",from:typeof field.from==="object"?JSON.stringify(field.from):(field.from??""),to:typeof field.to==="object"?JSON.stringify(field.to):(field.to??"")});});
    });
    xlsx().utils.book_append_sheet(workbook,simpleSheet(auditRows,[["id","_id",true],["at","Tid"],["by","Ändrad av"],["byUserId","Användar-ID"],["actorVerified","Verifierad identitet"],["collection","Tabell"],["recordId","Post-ID"],["action","Ändring"],["field","Fält"],["from","Från"],["to","Till"]]),"Ändringslogg");
    xlsx().utils.book_append_sheet(workbook,simpleSheet(extraRows(canonical),[["collection","Collection"],["id","ID"],["part","Del"],["json","JSON"]]),"Tilläggsdata");
    workbook.Workbook=workbook.Workbook||{};
    // Only the active business registers and editable budget are visible.
    // Technical sheets remain intact (and can be unhidden for audits).
    const technicalSheets=new Set(["Lokalblick","Budgetrader","Källor","Ändringslogg","Tilläggsdata"]);
    workbook.Workbook.Sheets=workbook.SheetNames.map(function(name){
      return {name:name,Hidden:technicalSheets.has(name)?1:0};
    });
    return workbook;
  }

  function validateWorkbook(workbook) {
    const canonical = workbook.Sheets["Fastigheter"] && workbook.Sheets["Avtal"];
    const migration = window.LokalblickMigrationAdapter && window.LokalblickMigrationAdapter.detect(workbook);
    if (!canonical && !migration) {
      throw new Error("Filen känns inte igen som Lokalblick-källa eller stödd migreringskälla.");
    }
    return canonical ? "canonical" : "migration";
  }

  function discoverWorkbook(workbook) {
    return workbook.SheetNames.map(function(name) {
      const rows = normalizeRows(rowsFromSheet(workbook, name));
      const fields = rows.length ? Object.keys(rows[0]) : [];
      return { name:name, rows:rows.length, fields:fields };
    });
  }


 return {SCHEMAS,ACTIVITY_SCHEMA,fieldLabel,clone,diffData,nextStableId,canonicalizeModel,workbookToData,dataToWorkbook,validateWorkbook,discoverWorkbook};
 }};
})(typeof window==="undefined"?globalThis:window);
