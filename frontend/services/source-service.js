// Browser-local Excel source adapter for Lokalblick.
// The workbook is parsed and written in the browser. No raw workbook data is uploaded.
(function () {
  const DB_NAME = "lokalblick-local-sources";
  const STORE = "handles";
  const HANDLE_KEY = "excel-source";
  const MODEL_VERSION = "2";

  const SCHEMAS = [
    { sheet:"Fastigheter", key:"properties", prefix:"FAST", columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["type","Typ"],["address","Adress"],["designation","Fastighetsbeteckning"],["owner","Fastighetsägare"],["manager","Förvaltare"],["latitude","Latitud"],["longitude","Longitud"]
    ]},
    { sheet:"Avtal", key:"contracts", prefix:"AVT", columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["propertyId","_propertyId",true],["number","Avtalsnummer"],["source","Källa"],["area","Area"],["category","Lokalkategori"],["use","Verksamhet"],["start","Start"],["end","Slut"],["notice","Säg upp senast"],["annualRent","Årshyra"],["annualContractDrift","Avtalsdrift"],["unitId","_unitId",true],["tenantOrgId","_tenantOrgId",true],["ownerOrgId","_ownerOrgId",true],["employees","Anställda"],["users","Brukare"],["rooms","Rum"],["commonArea","Gemensam yta"],["apartmentArea","Lägenhetsyta"]
    ], display:["Fastighet","Hyresgäst","Fastighetsägare","Område"] },
    { sheet:"Organisationer", key:"organizations", prefix:"ORG", columns:[
      ["id","_id",true],["name","Företag"],["type","Typ"],["ownerClass","Ägarklass"]
    ]},
    { sheet:"Personer", key:"people", prefix:"P", columns:[
      ["id","_id",true],["name","Namn"],["organizationId","_organizationId",true],["unitId","_unitId",true],["role","Roll"],["email","E-post"]
    ], display:["Organisation","Område"] },
    { sheet:"Ansvar", key:"assignments", prefix:"A", columns:[
      ["id","_id",true],["personId","_personId",true],["targetType","_targetType",true],["targetId","_targetId",true],["role","Roll"],["fromDate","Från"],["toDate","Till"],["allocation","Omfattning %"]
    ], display:["Person","Mål"] },
    { sheet:"Projekt", key:"projects", prefix:"PR", columns:[
      ["id","_id",true],["propertyId","_propertyId",true],["contractId","_contractId",true],["name","Projekt"],["description","Beskrivning"],["status","Status"],["phase","Fas"],["start","Start"],["end","Slut"],["moveIn","Inflytt"],["budgetYear","Budgetår"],["budgetInvestigation","Utredning budget"],["budgetExecution","Genomförande budget"],["budgetFurnishing","Inredning budget"],["preliminaryCost","Prognos"],["planningQuarter","Kvartal"],["planningMonth","Månad"]
    ], display:["Fastighet","Avtal"] },
    { sheet:"Underhåll", key:"maintenance", prefix:"UH", columns:[
      ["id","_id",true],["propertyId","_propertyId",true],["contractId","_contractId",true],["title","Åtgärd"],["year","Planår"],["cost","Kostnad"],["priority","Prioritet"],["status","Status"],["planningQuarter","Kvartal"],["planningMonth","Månad"]
    ], display:["Fastighet","Avtal"] },
    { sheet:"Drift", key:"operations", prefix:"DR", columns:[
      ["id","_id",true],["propertyId","_propertyId",true],["contractId","_contractId",true],["period","År"],["category","Kategori"],["budget","Budget"],["actual","Utfall"]
    ], display:["Fastighet","Avtal"] },
    { sheet:"Utredningar", key:"investigations", prefix:"UTR", columns:[
      ["id","_id",true],["propertyId","_propertyId",true],["contractId","_contractId",true],["title","Utredning"],["year","År"],["cost","Kostnad"],["status","Status"]
    ], display:["Fastighet","Avtal"] },
    { sheet:"Status", key:"maintenanceStatus", prefix:"MS", columns:[
      ["id","_id",true],["contractId","_contractId",true],["propertyId","_propertyId",true],["category","Kategori"],["assessedDate","Bedömd"],["status","Status"],["priority","Prioritet"],["comment","Kommentar"],["actionNeed","Åtgärdsbehov"],["budgetYear","Budgetår"],["estimatedCost","Bedömd kostnad"],["includeInBudget","Ta med i budget"],["responsiblePersonId","_responsiblePersonId",true],["planningQuarter","Kvartal"],["planningMonth","Månad"]
    ], display:["Fastighet","Avtal","Ansvarig"] },
    { sheet:"Driftärenden", key:"driftIssues", prefix:"DI", columns:[
      ["id","_id",true],["contractId","_contractId",true],["propertyId","_propertyId",true],["category","Kategori"],["title","Ärende"],["description","Beskrivning"],["createdDate","Skapad"],["targetDate","Måldatum"],["decisionDate","Beslutsdatum"],["completedDate","Klardatum"],["status","Status"],["priority","Prioritet"],["responsiblePersonId","_responsiblePersonId",true],["budgetYear","Budgetår"],["estimatedCost","Bedömd kostnad"],["finalCost","Slutkostnad"],["includeInBudget","Ta med i budget"],["planningQuarter","Kvartal"],["planningMonth","Månad"]
    ], display:["Fastighet","Avtal","Ansvarig"] },
    { sheet:"Önskemål", key:"wishes", prefix:"W", columns:[
      ["id","_id",true],["contractId","_contractId",true],["propertyId","_propertyId",true],["category","Kategori"],["title","Önskemål"],["description","Beskrivning"],["createdDate","Skapad"],["targetDate","Måldatum"],["decisionDate","Beslutsdatum"],["completedDate","Klardatum"],["status","Status"],["responsiblePersonId","_responsiblePersonId",true],["budgetYear","Budgetår"],["budgetCategory","Budgetkategori"],["estimatedCost","Bedömd kostnad"],["finalCost","Slutkostnad"],["includeInBudget","Ta med i budget"]
    ], display:["Fastighet","Avtal","Ansvarig"] },
    { sheet:"Ansvarshistorik", key:"assignmentChanges", prefix:"AL", columns:[
      ["id","_id",true],["targetType","_targetType",true],["targetId","_targetId",true],["fromPersonId","_fromPersonId",true],["toPersonId","_toPersonId",true],["changedAt","Ändrad"],["changedBy","Ändrad av"]
    ], display:["Mål","Från person","Till person"] }
  ];

  SCHEMAS.forEach(function(schema) {
    schema.fields = schema.columns.map(function(column){ return column[0]; });
  });

  const ACTIVITY_SCHEMA = {
    sheet:"Aktiviteter",
    key:"activities",
    prefix:"ACT",
    columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["propertyId","_propertyId",true],["contractId","_contractId",true],["responsiblePersonId","_responsiblePersonId",true],
      ["type","Typ"],["title","Aktivitet"],["description","Beskrivning"],["category","Kategori"],["status","Status"],["priority","Prioritet"],
      ["planningYear","Planår"],["planningQuarter","Kvartal"],["planningMonth","Månad"],["budgetCategory","Budgetkategori"],
      ["estimatedCost","Bedömd kostnad"],["phase","Fas"],["startDate","Start"],["endDate","Slut"],
      ["orderedAt","Beställd"],["orderedBy","Beställd av"],["supplier","Leverantör"],["orderReference","Beställningsreferens"],["orderedCost","Beställningsbelopp"],
      ["deliveryText","Leverans"],["completedAt","Utförd"],["finalCost","Slutkostnad"],["paymentStatus","Betalstatus"],["paidAt","Betald"],["invoiceComment","Faktura / kommentar"],
      ["ownerPays","Betalas av fastighetsägaren"]
    ],
    display:["Fastighet","Avtal","Ansvarig"]
  };
  ACTIVITY_SCHEMA.fields = ACTIVITY_SCHEMA.columns.map(function(column){ return column[0]; });
  const LEGACY_ACTIVITY_KEYS = new Set(["projects","maintenance","investigations","driftIssues","wishes"]);

  const source = {
    handle:null,
    fileName:"",
    mode:"read",
    connected:false,
    dirty:false,
    lastRead:null,
    data:null,
    baselineData:null,
    workbook:null,
    discovered:[],
    pendingChanges:[],
    sourceKind:"canonical",
    migrationReport:null,
    writeRecoveryNeeded:false,
    lastWriteError:""
  };

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
    SCHEMAS.forEach(function(schema) {
      changes = changes.concat(diffLists((before || {})[schema.key], (after || {})[schema.key], schema));
    });
    const oldPlans = (before && before.budgetPlans) || [];
    const newPlans = (after && after.budgetPlans) || [];
    if (JSON.stringify(oldPlans) !== JSON.stringify(newPlans)) {
      changes.push({ sheet:"Budget", key:"budgetPlans", id:"budget", action:"Ändrad", fields:["budgetPlans"], before:null, after:null });
    }
    return changes;
  }

  function openDb() {
    return new Promise(function(resolve, reject) {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function() {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    });
  }

  async function rememberHandle(handle, mode) {
    if (!handle) return;
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ handle:handle, mode:mode || "read", name:handle.name || "" }, HANDLE_KEY);
    } catch (_) {}
  }

  async function forgetHandle() {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(HANDLE_KEY);
    } catch (_) {}
  }

  async function restoreRemembered() {
    try {
      const db = await openDb();
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(HANDLE_KEY);
      const saved = await new Promise(function(resolve, reject) {
        request.onsuccess = function() { resolve(request.result || null); };
        request.onerror = function() { reject(request.error); };
      });
      if (!saved || !saved.handle) return null;
      source.handle = saved.handle;
      source.fileName = saved.name || saved.handle.name || "";
      source.mode = saved.mode || "read";
      return status();
    } catch (_) { return null; }
  }

  async function permission(handle, mode, requestIt) {
    if (!handle) return "denied";
    const opts = { mode: mode === "readwrite" ? "readwrite" : "read" };
    try {
      if (handle.queryPermission && await handle.queryPermission(opts) === "granted") return "granted";
      if (requestIt && handle.requestPermission) return await handle.requestPermission(opts);
    } catch (_) {}
    return "prompt";
  }

  function isStaleHandleError(error) {
    const message = String(error && error.message || "").toLowerCase();
    return Boolean(error && error.name === "InvalidStateError") ||
      message.indexOf("state cached in an interface object") !== -1 ||
      message.indexOf("state had changed since it was read from disk") !== -1;
  }

  async function pickFreshWriteHandle() {
    if (!window.showSaveFilePicker) throw new Error("Ny filkoppling kräver Edge eller Chrome.");
    return window.showSaveFilePicker({
      suggestedName:source.fileName || "Lokalblick-data.xlsx",
      types:[{ description:"Excel-arbetsbok", accept:{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"] } }]
    });
  }

  async function writeBytes(handle, bytes) {
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (error) {
      if (writable.abort) {
        try { await writable.abort(); } catch (_) {}
      }
      throw error;
    }
  }

  function rowsFromSheet(workbook, sheet) {
    if (!workbook.Sheets[sheet]) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval:"", raw:true });
  }

  function normalizeRows(rows) {
    return rows.filter(function(row) {
      return Object.keys(row).some(function(key) { return row[key] !== "" && row[key] != null; });
    });
  }

  function schemaRowsFromSheet(workbook, schema) {
    const rows = normalizeRows(rowsFromSheet(workbook, schema.sheet));
    return rows.map(function(row) {
      const out = {};
      schema.columns.forEach(function(column) {
        const field = column[0], label = column[1];
        if (Object.prototype.hasOwnProperty.call(row, label)) out[field] = row[label];
        else if (Object.prototype.hasOwnProperty.call(row, field)) out[field] = row[field];
        else out[field] = "";
      });
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
    SCHEMAS.forEach(function(schema) {
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

  function resolveHumanRelations(data) {
    const properties=data.properties||[], contracts=data.contracts||[], organizations=data.organizations||[], people=data.people||[];

    (data.contracts||[]).forEach(function(row) {
      if (!row.propertyId && row.__display_Fastighet) {
        const match=byDisplay(properties,row.__display_Fastighet,propertyDisplay); if(match) row.propertyId=match.id;
      }
      if (!row.tenantOrgId && row.__display_Hyresgäst) {
        const match=byDisplay(organizations,row.__display_Hyresgäst,orgDisplay); if(match) row.tenantOrgId=match.id;
      }
      if (!row.ownerOrgId && row.__display_Fastighetsägare) {
        const match=byDisplay(organizations,row.__display_Fastighetsägare,orgDisplay); if(match) row.ownerOrgId=match.id;
      }
      if (!row.unitId && row.__display_Område) row.unitId=unitIdFromDisplay(row.__display_Område);
    });

    (data.people||[]).forEach(function(row) {
      if (!row.organizationId && row.__display_Organisation) {
        const match=byDisplay(organizations,row.__display_Organisation,orgDisplay); if(match) row.organizationId=match.id;
      }
      if (!row.unitId && row.__display_Område) row.unitId=unitIdFromDisplay(row.__display_Område);
    });

    function resolveCommon(row) {
      if (!row.propertyId && row.__display_Fastighet) {
        const match=byDisplay(properties,row.__display_Fastighet,propertyDisplay); if(match) row.propertyId=match.id;
      }
      if (!row.contractId && row.__display_Avtal) {
        const match=byDisplay(contracts,row.__display_Avtal,contractDisplay); if(match) row.contractId=match.id;
      }
      if (!row.responsiblePersonId && row.__display_Ansvarig) {
        const match=byDisplay(people,row.__display_Ansvarig,personDisplay); if(match) row.responsiblePersonId=match.id;
      }
    }
    ["projects","maintenance","operations","investigations","maintenanceStatus","driftIssues","wishes"].forEach(function(key) {
      (data[key]||[]).forEach(resolveCommon);
    });

    (data.assignments||[]).forEach(function(row) {
      if (!row.personId && row.__display_Person) {
        const match=byDisplay(people,row.__display_Person,personDisplay); if(match) row.personId=match.id;
      }
      if (!row.targetId && row.__display_Mål) {
        const wanted=String(row.__display_Mål||"").trim().toLowerCase();
        const groups=[
          ["property",properties,propertyDisplay],["object",contracts,contractDisplay],
          ["project",data.projects||[],function(x){return x.name||x.id;}],
          ["maintenance",data.maintenance||[],function(x){return x.title||x.id;}],
          ["driftIssue",data.driftIssues||[],function(x){return x.title||x.id;}],
          ["wish",data.wishes||[],function(x){return x.title||x.id;}]
        ];
        for (const group of groups) {
          const match=(group[1]||[]).find(function(x){return String(group[2](x)||"").trim().toLowerCase()===wanted;});
          if(match){row.targetType=group[0];row.targetId=match.id;break;}
        }
      }
    });

    SCHEMAS.forEach(function(schema) {
      (data[schema.key]||[]).forEach(function(row) {
        Object.keys(row).filter(function(key){return key.indexOf("__display_")===0;}).forEach(function(key){delete row[key];});
      });
    });
  }

  function activityRowsFromData(data) {
    const rows = [];
    function orderFields(item) {
      return {
        orderedAt:item.orderedAt||"",orderedBy:item.orderedBy||"",supplier:item.supplier||"",orderReference:item.orderReference||"",
        orderedCost:Number(item.orderedCost)||0,deliveryText:item.deliveryText||"",completedAt:item.completedAt||item.completedDate||"",
        finalCost:Number(item.finalCost)||0,paymentStatus:item.paymentStatus||"",paidAt:item.paidAt||"",invoiceComment:item.invoiceComment||"",
        sourceId:item.sourceId||"",sourceSheet:item.sourceSheet||"",sourceRow:item.sourceRow||"",ownerPays:item.ownerPays||""
      };
    }
    (data.projects||[]).forEach(function(item){
      rows.push(Object.assign({
        id:item.id,type:"Projekt",propertyId:item.propertyId||"",contractId:item.contractId||"",responsiblePersonId:item.responsiblePersonId||"",
        title:item.name||"",description:item.description||"",category:"",status:item.status||"",priority:"",
        planningYear:item.budgetYear||"",planningQuarter:item.planningQuarter||"",planningMonth:item.planningMonth||"",
        budgetCategory:"Projekt",estimatedCost:Number(item.preliminaryCost)||Number(item.budgetExecution)||0,
        phase:item.phase||"",startDate:item.start||"",endDate:item.end||""
      },orderFields(item)));
    });
    (data.maintenance||[]).forEach(function(item){
      rows.push(Object.assign({
        id:item.id,type:"Underhåll",propertyId:item.propertyId||"",contractId:item.contractId||"",responsiblePersonId:item.responsiblePersonId||"",
        title:item.title||"",description:item.description||"",category:item.category||"",status:item.status||"",priority:item.priority||"",
        planningYear:item.year||"",planningQuarter:item.planningQuarter||"",planningMonth:item.planningMonth||"",
        budgetCategory:"Underhåll",estimatedCost:Number(item.cost)||0,phase:"",startDate:"",endDate:""
      },orderFields(item)));
    });
    (data.driftIssues||[]).forEach(function(item){
      rows.push(Object.assign({
        id:item.id,type:"Drift",propertyId:item.propertyId||"",contractId:item.contractId||"",responsiblePersonId:item.responsiblePersonId||"",
        title:item.title||"",description:item.description||"",category:item.category||"",status:item.status||"",priority:item.priority||"",
        planningYear:item.budgetYear||"",planningQuarter:item.planningQuarter||"",planningMonth:item.planningMonth||"",
        budgetCategory:"Driftkostnader",estimatedCost:Number(item.estimatedCost)||0,phase:"",startDate:item.createdDate||"",endDate:item.targetDate||""
      },orderFields(item)));
    });
    (data.wishes||[]).forEach(function(item){
      rows.push(Object.assign({
        id:item.id,type:"Önskemål",propertyId:item.propertyId||"",contractId:item.contractId||"",responsiblePersonId:item.responsiblePersonId||"",
        title:item.title||"",description:item.description||"",category:item.category||"",status:item.status||"",priority:item.priority||"",
        planningYear:item.budgetYear||"",planningQuarter:item.planningQuarter||"",planningMonth:item.planningMonth||"",
        budgetCategory:item.budgetCategory||"Ej budget",estimatedCost:Number(item.estimatedCost)||0,phase:"",startDate:item.createdDate||"",endDate:item.targetDate||""
      },orderFields(item)));
    });
    (data.investigations||[]).forEach(function(item){
      rows.push(Object.assign({
        id:item.id,type:"Utredning",propertyId:item.propertyId||"",contractId:item.contractId||"",responsiblePersonId:item.responsiblePersonId||"",
        title:item.title||"",description:item.description||"",category:item.category||"",status:item.status||"",priority:item.priority||"",
        planningYear:item.year||"",planningQuarter:item.planningQuarter||"",planningMonth:item.planningMonth||"",
        budgetCategory:"Utredningar",estimatedCost:Number(item.cost)||0,phase:"",startDate:"",endDate:""
      },orderFields(item)));
    });
    return rows;
  }

  function applyActivityRows(data, rows) {
    data.activities = rows || [];
    data.projects=[];data.maintenance=[];data.investigations=[];data.driftIssues=[];data.wishes=[];
    (rows||[]).forEach(function(a){
      const order={
        orderedAt:a.orderedAt||"",orderedBy:a.orderedBy||"",supplier:a.supplier||"",orderReference:a.orderReference||"",
        orderedCost:Number(a.orderedCost)||0,deliveryText:a.deliveryText||"",completedAt:a.completedAt||"",
        finalCost:Number(a.finalCost)||0,paymentStatus:a.paymentStatus||"",paidAt:a.paidAt||"",invoiceComment:a.invoiceComment||"",
        sourceId:a.sourceId||"",sourceSheet:a.sourceSheet||"",sourceRow:a.sourceRow||"",ownerPays:a.ownerPays||""
      };
      if(a.type==="Projekt") {
        data.projects.push(Object.assign({
          id:a.id,propertyId:a.propertyId||"",contractId:a.contractId||"",responsiblePersonId:a.responsiblePersonId||"",
          name:a.title||"",description:a.description||"",status:a.status||"Planerad",phase:a.phase||"Förstudie",
          start:a.startDate||"",end:a.endDate||"",moveIn:"",budgetYear:a.planningYear||"",
          budgetInvestigation:0,budgetExecution:Number(a.estimatedCost)||0,budgetFurnishing:0,preliminaryCost:Number(a.estimatedCost)||0,
          planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||""
        },order));
      } else if(a.type==="Underhåll") {
        data.maintenance.push(Object.assign({
          id:a.id,propertyId:a.propertyId||"",contractId:a.contractId||"",responsiblePersonId:a.responsiblePersonId||"",
          title:a.title||"",description:a.description||"",category:a.category||"",year:a.planningYear||"",cost:Number(a.estimatedCost)||0,
          priority:a.priority||"",status:a.status||"Identifierad",planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||""
        },order));
      } else if(a.type==="Drift") {
        data.driftIssues.push(Object.assign({
          id:a.id,contractId:a.contractId||"",propertyId:a.propertyId||"",category:a.category||"Övrigt",title:a.title||"",
          description:a.description||"",createdDate:a.startDate||"",targetDate:a.endDate||"",decisionDate:"",
          completedDate:a.completedAt||"",status:a.status||"Nytt",priority:a.priority||"",responsiblePersonId:a.responsiblePersonId||"",
          budgetYear:a.planningYear||"",estimatedCost:Number(a.estimatedCost)||0,finalCost:Number(a.finalCost)||0,
          includeInBudget:"Ja",planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||""
        },order));
      } else if(a.type==="Önskemål") {
        data.wishes.push(Object.assign({
          id:a.id,contractId:a.contractId||"",propertyId:a.propertyId||"",category:a.category||"Övrigt",title:a.title||"",
          description:a.description||"",createdDate:a.startDate||"",targetDate:a.endDate||"",decisionDate:"",
          completedDate:a.completedAt||"",status:a.status||"Nytt",responsiblePersonId:a.responsiblePersonId||"",
          budgetYear:a.planningYear||"",budgetCategory:a.budgetCategory||"Ej budget",estimatedCost:Number(a.estimatedCost)||0,
          finalCost:Number(a.finalCost)||0,includeInBudget:"Ja"
        },order));
      } else if(a.type==="Utredning") {
        data.investigations.push(Object.assign({
          id:a.id,propertyId:a.propertyId||"",contractId:a.contractId||"",responsiblePersonId:a.responsiblePersonId||"",
          title:a.title||"",description:a.description||"",year:a.planningYear||"",cost:Number(a.estimatedCost)||0,status:a.status||"Planerad"
        },order));
      }
    });
  }

  function workbookToData(workbook) {
    const data = { isDemo:false, sourceName:source.fileName || "Excel-källa" };
    SCHEMAS.forEach(function(schema) {
      data[schema.key] = schemaRowsFromSheet(workbook, schema);
    });
    if (workbook.Sheets[ACTIVITY_SCHEMA.sheet]) {
      const activityRows = schemaRowsFromSheet(workbook, ACTIVITY_SCHEMA);
      applyActivityRows(data, activityRows);
    } else {
      data.activities = activityRowsFromData(data);
    }
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

    const plans = budgetRows("Budgetplaner",[["year","År"],["status","Status"],["createdAt","Skapad"],["lockedAt","Låst"]]);
    const targets = budgetRows("Budgetmål",[["year","År"],["category","Kategori"],["amount","Belopp"],["note","Kommentar"]]);
    const lines = budgetRows("Budgetrader",[["year","År"],["category","Kategori"],["sub","Underkategori"],["source","Källa"],["contractId","_contractId"],["propertyId","_propertyId"],["amount","Belopp"]]);

    data.budgetPlans = plans.map(function(plan) {
      const year = Number(plan.year) || plan.year;
      const planTargets = {};
      const notes = {};
      targets.filter(function(x){ return String(x.year) === String(year); }).forEach(function(x) {
        planTargets[x.category] = Number(x.amount) || 0;
        if (x.note) notes[x.category] = x.note;
      });
      return {
        year: year, status: plan.status || "", createdAt: plan.createdAt || "", lockedAt: plan.lockedAt || "",
        notes: notes, targets: planTargets,
        lines: lines.filter(function(x){ return String(x.year) === String(year); }).map(function(x) {
          return {
            category:x.category || "", sub:x.sub || "", source:x.source || "",
            contractId:x.contractId || "", propertyId:x.propertyId || "", amount:Number(x.amount) || 0
          };
        })
      };
    });
    return data;
  }

  function displayValue(schema, label, row, data) {
    const properties=data.properties||[], contracts=data.contracts||[], organizations=data.organizations||[], people=data.people||[];
    if (label==="Fastighet") return propertyDisplay(properties.find(function(x){return x.id===row.propertyId;}));
    if (label==="Avtal") return contractDisplay(contracts.find(function(x){return x.id===row.contractId;}));
    if (label==="Hyresgäst") return orgDisplay(organizations.find(function(x){return x.id===row.tenantOrgId;}));
    if (label==="Fastighetsägare") return orgDisplay(organizations.find(function(x){return x.id===row.ownerOrgId;})) || row.owner || "";
    if (label==="Organisation") return orgDisplay(organizations.find(function(x){return x.id===row.organizationId;}));
    if (label==="Område") return unitDisplay(row.unitId);
    if (label==="Ansvarig") return personDisplay(people.find(function(x){return x.id===row.responsiblePersonId;}));
    if (label==="Person") return personDisplay(people.find(function(x){return x.id===row.personId;}));
    if (label==="Från person") return personDisplay(people.find(function(x){return x.id===row.fromPersonId;}));
    if (label==="Till person") return personDisplay(people.find(function(x){return x.id===row.toPersonId;}));
    if (label==="Mål") {
      const lookups=[
        [properties,propertyDisplay],[contracts,contractDisplay],
        [data.projects||[],function(x){return x.name||x.id;}],[data.maintenance||[],function(x){return x.title||x.id;}],
        [data.driftIssues||[],function(x){return x.title||x.id;}],[data.wishes||[],function(x){return x.title||x.id;}]
      ];
      for (const lookup of lookups) {
        const found=(lookup[0]||[]).find(function(x){return x.id===row.targetId;});
        if(found) return lookup[1](found);
      }
      return row.targetId || "";
    }
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
      visible.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : row[column[0]];});
      (schema.display||[]).forEach(function(label){out[label]=displayValue(schema,label,row,data);});
      hidden.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : row[column[0]];});
      return out;
    });

    const ws=excelRows.length ? XLSX.utils.json_to_sheet(excelRows,{header:headers}) : XLSX.utils.aoa_to_sheet([headers]);
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
      columns.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : row[column[0]];});
      return out;
    });
    const ws=excelRows.length ? XLSX.utils.json_to_sheet(excelRows,{header:headers}) : XLSX.utils.aoa_to_sheet([headers]);
    ws["!cols"]=columns.map(function(column){
      return {hidden:Boolean(column[2]),wch:column[2]?14:Math.max(12,Math.min(28,String(column[1]).length+4))};
    });
    ws["!autofilter"]={ref:ws["!ref"] || "A1:A1"};
    return ws;
  }

  function dataToWorkbook(data) {
    ensureStableIds(data);
    const workbook = XLSX.utils.book_new();
    const metadata = [
      ["Lokalblick modellversion", MODEL_VERSION],
      ["Skapad", new Date().toISOString()],
      ["Källa", data && data.sourceName ? data.sourceName : "Lokalblick Excel-källa"],
      ["Så används filen", "Synliga kolumner är för användaren. Kolumner som börjar med _ är tekniska ID:n och är dolda i Excel."],
      ["ID", "Lokalblick skapar och behåller stabila ID:n automatiskt. Ändra dem inte manuellt."]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadata), "Lokalblick");

    SCHEMAS.filter(function(schema){return !LEGACY_ACTIVITY_KEYS.has(schema.key);}).forEach(function(schema) {
      XLSX.utils.book_append_sheet(workbook, sheetFromSchema(schema,(data&&data[schema.key])||[],data), schema.sheet);
    });
    const activities = activityRowsFromData(data || {});
    XLSX.utils.book_append_sheet(workbook, sheetFromSchema(ACTIVITY_SCHEMA, activities, data || {}), ACTIVITY_SCHEMA.sheet);

    const plans = (data && data.budgetPlans) || [];
    XLSX.utils.book_append_sheet(workbook, simpleSheet(plans.map(function(plan) {
      return {year:plan.year,status:plan.status||"",createdAt:plan.createdAt||"",lockedAt:plan.lockedAt||""};
    }),[["year","År"],["status","Status"],["createdAt","Skapad"],["lockedAt","Låst"]]),"Budgetplaner");

    const targetRows=[], lineRows=[];
    plans.forEach(function(plan) {
      Object.keys(plan.targets||{}).forEach(function(category) {
        targetRows.push({year:plan.year,category:category,amount:plan.targets[category],note:(plan.notes||{})[category]||""});
      });
      (plan.lines||[]).forEach(function(line) {
        lineRows.push({
          year:plan.year,category:line.category||"",sub:line.sub||"",source:line.source||"",
          contractId:line.contractId||"",propertyId:line.propertyId||"",amount:Number(line.amount)||0
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook,simpleSheet(targetRows,[["year","År"],["category","Kategori"],["amount","Belopp"],["note","Kommentar"]]),"Budgetmål");
    XLSX.utils.book_append_sheet(workbook,simpleSheet(lineRows,[["year","År"],["category","Kategori"],["sub","Underkategori"],["source","Källa"],["amount","Belopp"],["contractId","_contractId",true],["propertyId","_propertyId",true]]),"Budgetrader");
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

  async function readHandle(handle, mode, requestIt) {
    const wanted = mode === "readwrite" ? "readwrite" : "read";
    const access = await permission(handle, wanted, requestIt);
    if (access !== "granted") throw new Error("Åtkomst till filen godkändes inte.");
    const file = await handle.getFile();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type:"array", cellDates:false });
    const kind = validateWorkbook(workbook);
    source.handle = handle;
    source.fileName = file.name || handle.name || "Excel-källa.xlsx";
    source.sourceKind = kind;
    source.mode = kind === "migration" ? "read" : (mode === "readwrite" ? "readwrite" : "read");
    source.workbook = workbook;
    if (kind === "migration") {
      const migrated = window.LokalblickMigrationAdapter.migrate(workbook, source.fileName);
      source.data = migrated.data;
      source.migrationReport = migrated.report;
    } else {
      source.data = workbookToData(workbook);
      source.migrationReport = null;
    }
    source.baselineData = clone(source.data);
    source.connected = true;
    source.dirty = false;
    source.pendingChanges = [];
    source.lastRead = new Date();
    source.discovered = discoverWorkbook(workbook);
    await rememberHandle(handle, source.mode);
    activateAdapter();
    return clone(source.data);
  }

  async function connect(mode) {
    if (!window.showOpenFilePicker) throw new Error("Beständig lokal filkoppling kräver Edge eller Chrome. Du kan fortfarande importera via en vanlig filväljare senare.");
    const handles = await window.showOpenFilePicker({
      multiple:false,
      types:[{ description:"Excel-arbetsbok", accept:{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"] } }]
    });
    return readHandle(handles[0], mode || "read", true);
  }

  async function reconnect() {
    if (!source.handle) throw new Error("Ingen tidigare filkoppling finns.");
    return readHandle(source.handle, source.mode, true);
  }

  async function createFile(data, mode, blank) {
    if (!window.showSaveFilePicker) throw new Error("Val av sparplats kräver Edge eller Chrome.");
    const handle = await window.showSaveFilePicker({
      suggestedName:"Lokalblick-data.xlsx",
      types:[{ description:"Excel-arbetsbok", accept:{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"] } }]
    });
    const base = blank ? {
      isDemo:false, sourceName:handle.name || "Lokalblick-data.xlsx",
      properties:[], contracts:[], organizations:[], people:[], assignments:[], activities:[], projects:[], maintenance:[],
      operations:[], investigations:[], maintenanceStatus:[], driftIssues:[], wishes:[], budgetPlans:[], assignmentChanges:[]
    } : clone(data || {});
    base.isDemo = false;
    base.sourceName = handle.name || "Lokalblick-data.xlsx";
    const workbook = dataToWorkbook(base);
    const bytes = XLSX.write(workbook, { bookType:"xlsx", type:"array" });
    await writeBytes(handle, bytes);
    source.handle = handle;
    source.fileName = handle.name || "Lokalblick-data.xlsx";
    source.mode = mode === "readwrite" ? "readwrite" : "read";
    source.sourceKind = "canonical";
    source.migrationReport = null;
    source.workbook = workbook;
    source.data = base;
    source.baselineData = clone(base);
    source.connected = true;
    source.dirty = false;
    source.pendingChanges = [];
    source.lastRead = new Date();
    source.discovered = discoverWorkbook(workbook);
    await rememberHandle(handle, source.mode);
    activateAdapter();
    return clone(base);
  }

  function activateAdapter() {
    window.LokalblickDataService = {
      mode:"local-excel",
      async load() { return clone(source.data || {}); },
      async save(data) {
        const next = clone(data);
        next.isDemo = false;
        next.sourceName = source.fileName || "Excel-källa";
        source.pendingChanges = diffData(source.baselineData || {}, next);
        source.data = next;
        source.dirty = source.pendingChanges.length > 0;
        return clone(source.data);
      },
      async reset() { return clone(source.data || {}); }
    };
  }

  async function write() {
    if (!source.connected || !source.handle || !source.data) throw new Error("Ingen Excel-källa är ansluten.");
    if (source.sourceKind === "migration") throw new Error("Migreringskällan skrivs inte om. Skapa först en ny Lokalblick-fil under Datakällor.");
    if (source.mode !== "readwrite") throw new Error("Källan är ansluten som läsbar. Byt till Läs + skriv först.");

    let handle = source.handle;
    if (source.writeRecoveryNeeded) {
      handle = await pickFreshWriteHandle();
      const access = await permission(handle, "readwrite", true);
      if (access !== "granted") throw new Error("Skrivåtkomst godkändes inte.");
    } else {
      const access = await permission(handle, "readwrite", true);
      if (access !== "granted") throw new Error("Skrivåtkomst godkändes inte.");
    }

    const workbook = dataToWorkbook(source.data);
    const bytes = XLSX.write(workbook, { bookType:"xlsx", type:"array" });

    try {
      await writeBytes(handle, bytes);
    } catch (error) {
      source.lastWriteError = error && error.message ? error.message : String(error);
      if (isStaleHandleError(error)) {
        source.writeRecoveryNeeded = true;
        const friendly = new Error("Filkopplingen behöver förnyas. Dina ändringar ligger kvar i Lokalblick. Klicka på Spara till Excel igen och välj samma fil.");
        friendly.code = "LOKALBLICK_RESELECT_WRITE";
        throw friendly;
      }
      throw error;
    }

    source.handle = handle;
    source.fileName = handle.name || source.fileName || "Lokalblick-data.xlsx";
    source.workbook = workbook;
    source.baselineData = clone(source.data);
    source.dirty = false;
    source.pendingChanges = [];
    source.writeRecoveryNeeded = false;
    source.lastWriteError = "";
    source.lastRead = new Date();
    source.discovered = discoverWorkbook(workbook);
    await rememberHandle(handle, source.mode);
    return status();
  }

  async function setMode(mode) {
    const next = mode === "readwrite" ? "readwrite" : "read";
    if (next === "readwrite" && source.sourceKind === "migration") {
      throw new Error("Migreringskällan är skrivskyddad. Skapa en ny Lokalblick-fil för fortsatt arbete.");
    }
    if (next === "readwrite" && source.handle) {
      const access = await permission(source.handle, "readwrite", true);
      if (access !== "granted") throw new Error("Skrivåtkomst godkändes inte.");
    }
    source.mode = next;
    await rememberHandle(source.handle, next);
    return status();
  }

  async function disconnect() {
    source.handle = null;
    source.fileName = "";
    source.connected = false;
    source.dirty = false;
    source.lastRead = null;
    source.data = null;
    source.baselineData = null;
    source.workbook = null;
    source.discovered = [];
    source.pendingChanges = [];
    source.sourceKind = "canonical";
    source.migrationReport = null;
    source.writeRecoveryNeeded = false;
    source.lastWriteError = "";
    await forgetHandle();
    if (window.LokalblickDemoDataService) window.LokalblickDataService = window.LokalblickDemoDataService;
    return window.LokalblickDataService.load();
  }

  function status() {
    return {
      connected:source.connected,
      remembered:Boolean(source.handle),
      fileName:source.fileName,
      mode:source.mode,
      dirty:source.dirty,
      lastRead:source.lastRead,
      discovered:clone(source.discovered || []),
      pendingChanges:clone(source.pendingChanges || []),
      sourceKind:source.sourceKind || "canonical",
      migrationReport:clone(source.migrationReport || null),
      writeRecoveryNeeded:Boolean(source.writeRecoveryNeeded),
      lastWriteError:source.lastWriteError || ""
    };
  }

  window.LokalblickSourceService = {
    schemas:SCHEMAS.concat([ACTIVITY_SCHEMA]),
    connect:connect,
    reconnect:reconnect,
    createFile:createFile,
    write:write,
    setMode:setMode,
    disconnect:disconnect,
    status:status,
    restoreRemembered:restoreRemembered
  };
})();