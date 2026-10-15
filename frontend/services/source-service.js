// Browser-local Excel source adapter for Lokalblick.
// The workbook is parsed and written in the browser. No raw workbook data is uploaded.
(function () {
  const DB_NAME = "lokalblick-local-sources";
  const STORE = "handles";
  const HANDLE_KEY = "excel-source";
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
      ["number","Objektnummer"],["name","Objektnamn"],["area","Objektarea, m²"],["category","Objektkategori"],["use","Verksamhetstyp"],["businessName","Namn på verksamheten"],["unitId","Verksamhet"],
      ["employees","Anställda"],["users","Brukare"],["rooms","Rum"],["commonArea","Gemensam yta"],["apartmentArea","Lägenhetsyta"],["start","Giltigt fr.o.m."],["end","Giltigt t.o.m."],["predecessorIds","_predecessorIds",true],["comment","Kommentar"]
    ],labelAliases:{number:["Objektnr","Objektsnummer","Objektsnr"],area:["Objektarea","Objektyta"]},display:["Fastighet","Adress","Föregående objekt"] },
    { sheet:"Avtal", key:"contracts", prefix:"AVT", columns:[
      ["id","_id",true],["sourceId","_sourceId",true],["sourceSheet","_sourceSheet",true],["sourceRow","_sourceRow",true],
      ["objectId","_objectId",true],["propertyId","_propertyId",true],["businessPartyId","_businessPartyId",true],["businessResponsiblePersonId","_businessResponsiblePersonId",true],["responsiblePersonId","_responsiblePersonId",true],
      ["number","Avtalsnummer"],["source","Källa"],["area","Area"],["category","Lokalkategori"],["tenantName","Hyresgäst enligt källa"],["use","Verksamhetstyp"],["businessName","Namn på verksamheten"],
      ["start","Start"],["end","Slut"],["moveInDate","Inflyttning"],["moveOutDate","Utflyttning"],["comment","Kommentar"],["noticePeriodMonths","Uppsägningstid månader"],["renewalPeriodMonths","Förlängningstid månader"],["originalTerm","Ursprunglig avtalstid"],
      ["baseRent","Bashyra"],["baseAdditions","Bastillägg"],["rentBaseYear","Hyra basår"],["rentBaseIndex","Hyra bastal (KPI)"],["rentIndexPercent","Hyra uppräkning %"],["additionBaseYear","Tillägg basår"],["additionBaseIndex","Tillägg bastal (KPI)"],["additionIndexPercent","Tillägg uppräkning %"],
      ["rentAdjustmentMethod","Hyra justeringsregel"],["rentAnnualPercent","Hyra fast årlig uppräkning %"],["rentMinPercent","Hyra minsta uppräkning %"],["rentMaxPercent","Hyra högsta uppräkning %"],["rentLimitBasis","Hyra min/max gäller"],
        ["additionAdjustmentMethod","Tillägg justeringsregel"],["additionAnnualPercent","Tillägg fast årlig uppräkning %"],["additionMinPercent","Tillägg minsta uppräkning %"],["additionMaxPercent","Tillägg högsta uppräkning %"],["additionLimitBasis","Tillägg min/max gäller"],
        ["annualContractDrift","Media per år"],["annualPropertyTax","F-skatt per år"],
      ["costCenterOperations","Kstl drift"],["costCenterPremises","Kstl lokaler"],["ekotObject","Objekt i Ekot"],["contractDocumentUrl","Avtals-PDF"],["contractDocumentName","Avtalsdokument"],["contractDocumentKind","Dokumenttyp"],
      ["mediaWaste","Sopor"],["mediaElectricity","El"],["mediaWater","VA"],["mediaHeating","Värme"],["mediaHotWater","VV"],["mediaVentilation","Vent"],["mediaOutdoor","Utem."],["mediaPropertyTax","F-skatt ingår"],
      ["unitId","_unitId",true],["employees","Anställda"],["users","Brukare"],["rooms","Rum"],["commonArea","Gemensam yta"],["apartmentArea","Lägenhetsyta"],
      ["enrichmentSource","_enrichmentSource",true],["enrichmentSourceRow","_enrichmentSourceRow",true],["enrichmentTargetYear","_enrichmentTargetYear",true]
    ], display:["Objekt","Fastighet","Adress","Verksamhet","Verksamhetsansvarig"] },
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
  SCHEMAS.push({sheet:'Verksamheter',key:'businesses',prefix:'BUS',columns:[['id','_id',true],['sourceId','Källans verksamhets-ID'],['name','Verksamhetsnamn'],['type','Verksamhetstyp'],['unitId','Organisatorisk tillhörighet'],['organizationId','_organizationId',true],['status','Status'],['businessResponsiblePersonId','_businessResponsiblePersonId',true]],display:['Part','Verksamhetsansvarig']},
   {sheet:'AvtalVerksamhet',key:'contractBusinesses',prefix:'CB',columns:[['id','_id',true],['contractId','_contractId',true],['businessId','_businessId',true],['fromDate','Giltigt fr.o.m.'],['toDate','Giltigt t.o.m.'],['usedArea','Nyttjad area, m²'],['costSharePercent','Kostnadsandel, %'],['cancelled','_cancelled',true]],display:['Avtal','Verksamhet']});
  SCHEMAS.find(s=>s.key==='objects').columns.push(['areaType','Areatyp']);
  SCHEMAS.forEach(function(schema) { schema.fields = schema.columns.map(function(column){ return column[0]; }); });

  SCHEMAS.find(s=>s.key==='contracts').columns.push(['tenantPartyId','_tenantPartyId',true],['tenantResponsiblePersonId','_tenantResponsiblePersonId',true]);
  SCHEMAS.find(s=>s.key==='contracts').labelAliases={tenantName:['Hyresgäst']};
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
      ["estimatedCost","Bedömd kostnad"],["phase","Fas"],["startDate","Start"],["endDate","Slut"]
    ],
    display:["Objekt","Fastighet","Adress","Avtal","Ansvarig hos oss"]
  };
  ACTIVITY_SCHEMA.fields = ACTIVITY_SCHEMA.columns.map(function(column){ return column[0]; });

  // One set of user-facing names, shared by forms, workbook headers and mapping.
  const FRONTEND_LABELS = {
    contracts:{start:"Giltigt fr.o.m.",end:"Giltigt t.o.m.",moveInDate:"Inflyttningsdatum",moveOutDate:"Utflyttningsdatum",area:"Area, m²",noticePeriodMonths:"Uppsägningstid, månader",renewalPeriodMonths:"Förlängningstid, månader",baseRent:"Bashyra, kr/år",baseAdditions:"Tillägg, kr/år",rentBaseYear:"Basår",rentIndexPercent:"Indexuppräkning, %",additionBaseYear:"Tillägg basår",additionIndexPercent:"Indexuppräkning tillägg, %",annualPropertyTax:"Fastighetsskatt, kr/år"},
    activities:{title:"Ärendenamn",responsiblePersonId:"Ansvarig",startDate:"Fr.o.m.",endDate:"T.o.m.",planningYear:"Planeringsår",estimatedCost:"Bedömd kostnad, kr"}
  };
  SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema){
    schema.labelAliases=schema.labelAliases||{};
    schema.columns.forEach(function(column){
      const label=FRONTEND_LABELS[schema.key]?.[column[0]];
      if(label&&label!==column[1]){schema.labelAliases[column[0]]=[column[1]];column[1]=label;}
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
    enrichmentReport:null,
    enrichmentFileName:"",
    operationalReports:[],
    operationalFileNames:[],
    indexReport:null,
    indexFileName:"",
    writeRecoveryNeeded:false,
    lastWriteError:"",
    pendingImport:null
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

  async function resumeRemembered() {
    const restored = await restoreRemembered();
    if (!restored || !source.handle) return restored;
    const wanted = source.mode === "readwrite" ? "readwrite" : "read";
    const access = await permission(source.handle, wanted, false);
    if (access !== "granted") return status();
    try {
      await readHandle(source.handle, source.mode, false);
      return status();
    } catch (_) {
      return status();
    }
  }

  function adoptViewState(data) {
    if (!source.connected || !source.baselineData) return null;
    const next = clone(data || {});
    next.isDemo = false;
    next.sourceName = source.fileName || next.sourceName || "Excel-källa";
    canonicalizeModel(next);
    source.data = next;
    source.pendingChanges = diffData(source.baselineData || {}, next);
    source.dirty = source.pendingChanges.length > 0;
    activateAdapter();
    return clone(source.data);
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

  function isBlockedWriteError(error) {
    const message = String(error && error.message || "").toLowerCase();
    return Boolean(error && error.name === "NoModificationAllowedError") ||
      message.indexOf("being used by another process") !== -1 ||
      message.indexOf("could not be modified") !== -1;
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
    (data.contractBusinesses||[]).forEach(function(row){if(!row.contractId&&row.__display_Avtal){const m=byDisplay(contracts,row.__display_Avtal,contractDisplay);if(m)row.contractId=m.id;}if(!row.businessId&&row.__display_Verksamhet){const hits=(data.businesses||[]).filter(b=>String(b.name).trim()===String(row.__display_Verksamhet).trim());if(hits.length===1)row.businessId=hits[0].id;}});
    (data.contacts||[]).forEach(resolveRelation); (data.assignments||[]).forEach(resolveRelation);
    SCHEMAS.concat([ACTIVITY_SCHEMA]).forEach(function(schema) { (data[schema.key]||[]).forEach(function(row) { Object.keys(row).filter(function(key){return key.indexOf("__display_")===0;}).forEach(function(key){delete row[key];}); }); });
  }

  function canonicalizeModel(data) {
    data=data||{};
    ["properties","objects","contracts","organizations","people","assignments","orders",
     "activities","recurringCosts","auditLog","sourceRegistry",
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

  const EXTRA_KEYS = ["businesses","contractBusinesses","assignments","indexSeries","importReview","documents","priceBaseAmounts","importFieldPreferences","importMappings","sourceRegistry","auditLog","activityOptions"];
  const RESTORE_EXTRA_KEYS = ["indexSeries","auditLog","sourceRegistry","importReview","documents","priceBaseAmounts","importFieldPreferences","importMappings","activityOptions"];
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
    const data = { isDemo:false, sourceName:source.fileName || "Excel-källa" };
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
    if(label==='Verksamhet'&&schema.key==='contractBusinesses'){const b=(data.businesses||[]).find(b=>b.id===row.businessId);return b?.name||row.businessId||'';}
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
      columns.forEach(function(column){out[column[1]]=row[column[0]] == null ? "" : Array.isArray(row[column[0]])?JSON.stringify(row[column[0]]):row[column[0]];});
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
    const canonical=canonicalizeModel(clone(data||{}));
    if(window.LokalblickObjectModel)window.LokalblickObjectModel.normalize(canonical);
    ensureStableIds(canonical);
    const workbook = XLSX.utils.book_new();
    const metadata = [
      ["Lokalblick modellversion", MODEL_VERSION],
      ["Skapad", new Date().toISOString()],
      ["Källa", canonical && canonical.sourceName ? canonical.sourceName : "Lokalblick Excel-källa"],
      ["Så används filen", "Synliga kolumner är för användaren. Kolumner som börjar med _ är tekniska ID:n och är dolda i Excel."],
      ["ID", "Lokalblick skapar och behåller stabila ID:n automatiskt. Ändra dem inte manuellt."]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadata), "Lokalblick");

    SCHEMAS.forEach(function(schema) {
      XLSX.utils.book_append_sheet(workbook, sheetFromSchema(schema,(canonical&&canonical[schema.key])||[],canonical), schema.sheet);
    });
    XLSX.utils.book_append_sheet(workbook, sheetFromSchema(ACTIVITY_SCHEMA, canonical.activities||[], canonical), ACTIVITY_SCHEMA.sheet);

    const plans = (canonical && canonical.budgetPlans) || [];
    XLSX.utils.book_append_sheet(workbook,simpleSheet(plans.map(function(plan){return {year:plan.year,status:plan.status||"",createdAt:plan.createdAt||"",lockedAt:plan.lockedAt||"",lockedBy:plan.lockedBy||"",preliminaryIndex:Number(plan.preliminaryIndex)||0,lockedIndexYear:Number(plan.lockedIndexYear)||0,lockedIndexValue:Number(plan.lockedIndexValue)||0,lockedIndexSource:plan.lockedIndexSource||"",targetRent:Number((plan.targets||{})["Hyra + drift"])||0,targetMaintenance:Number((plan.targets||{}).Underhåll)||0,targetProject:Number((plan.targets||{}).Projekt)||0,targetOperations:Number((plan.targets||{}).Driftkostnader)||0,targetInvestigations:Number((plan.targets||{}).Utredningar)||0};}),[["year","År"],["status","Status"],["createdAt","Skapad"],["lockedAt","Låst"],["lockedBy","Låst av"],["preliminaryIndex","Preliminärt oktoberindex"],["lockedIndexYear","Låst indexår"],["lockedIndexValue","Låst oktoberindex"],["lockedIndexSource","Indexkälla"],["targetRent","Hyra + drift"],["targetMaintenance","Underhåll"],["targetProject","Projekt"],["targetOperations","Driftkostnader"],["targetInvestigations","Utredningar"]]),"Budget");

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
    XLSX.utils.book_append_sheet(workbook,simpleSheet(lineRows,[["year","År"],["category","Kategori"],["sub","Underkategori"],["source","Källa"],["amount","Belopp"],["budgetDays","Budgetdagar"],["budgetDaysInYear","Dagar år"],["budgetFactor","Andel år"],["budgetPeriod","Budgetperiod"],["budgetFrom","Budget från"],["budgetTo","Budget till"],["contractId","_contractId",true],["propertyId","_propertyId",true],["sourceType","Typ"],["sourceId","_sourceId",true],["status","Värdestatus"]]),"Budgetrader");
    const registry=(canonical&&canonical.sourceRegistry)||[];
    XLSX.utils.book_append_sheet(workbook,simpleSheet(registry.map(function(x){return {
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
    XLSX.utils.book_append_sheet(workbook,simpleSheet(auditRows,[["id","_id",true],["at","Tid"],["by","Ändrad av"],["byUserId","Användar-ID"],["actorVerified","Verifierad identitet"],["collection","Tabell"],["recordId","Post-ID"],["action","Ändring"],["field","Fält"],["from","Från"],["to","Till"]]),"Ändringslogg");
    XLSX.utils.book_append_sheet(workbook,simpleSheet(extraRows(canonical),[["collection","Collection"],["id","ID"],["part","Del"],["json","JSON"]]),"Tilläggsdata");
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
    source.writeRecoveryNeeded = false;
    source.lastWriteError = "";
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
      properties:[], contracts:[], organizations:[], people:[], orders:[], activities:[],
      recurringCosts:[],  budgetPlans:[], auditLog:[], sourceRegistry:[], importReview:[], documents:[], indexSeries:[]
    } : clone(data || {});
    base.isDemo = false;
    base.sourceName = handle.name || "Lokalblick-data.xlsx";
    canonicalizeModel(base);
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
    source.writeRecoveryNeeded = false;
    source.lastWriteError = "";
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
        window.LokalblickBusinessModel?.normalize(next);
        window.LokalblickBusinessModel?.validate(next,source.data);
        window.LokalblickResponsibility?.normalize(next);
        window.LokalblickResponsibility?.validate(next,source.data);
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
      if (isBlockedWriteError(error)) {
        source.writeRecoveryNeeded = true;
        const friendly = new Error("Excel-filen är låst för skrivning. Stäng filen i Excel och låt eventuell synkning bli klar. Klicka sedan på Spara till Excel igen.");
        friendly.code = "LOKALBLICK_FILE_LOCKED";
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

  function emitImportProgress(onProgress, payload) {
    if (typeof onProgress !== "function") return;
    try { onProgress(payload); } catch (_) {}
  }
  function yieldImportUi() {
    return new Promise(function(resolve){ setTimeout(resolve, 0); });
  }
  function importSheetRole(name) {
    const n=String(name||"").trim().toLowerCase();
    if (["sf","int","ext","lokallista"].includes(n)) return {kind:"Fastigheter & avtal",recommended:true};
    if (n==="lokalbestånd") return {kind:"Avtal & verksamhet",recommended:true};
    if (n==="fastighetslista") return {kind:"Fastighetsberikning",recommended:true};
    if (n==="2027") return {kind:"Projektplan 2027",recommended:true};
    if (n==="årshjul" || n==="arshjul") return {kind:"Aktiviteter",recommended:true};
    if (n==="beställningar" || n==="bestallningar") return {kind:"Beställningar",recommended:true};
    if (/kpi|index/.test(n)) return {kind:"KPI / index",recommended:true};
    if (["fastigheter","avtal","parter","personer","aktiviteter","kostnader","status"].includes(n))
      return {kind:"Lokalblick-data",recommended:true};
    return {kind:"Övrig flik",recommended:false};
  }
  function isCanonicalDataWorkbook(workbook) {
    const names=new Set(workbook?.SheetNames||[]);
    return names.has("Lokalblick") && names.has("Fastigheter") && names.has("Avtal");
  }
  function preventCanonicalAsEnrichment(workbook) {
    if(isCanonicalDataWorkbook(workbook))
      throw new Error("Detta är en Lokalblick-datafil. Välj Anslut Lokalblick-data i stället för Läs in Excel. Den kontrollen hindrar att arbetsfilen importeras som dubbla grunduppgifter.");
  }
  async function prepareImportWorkbook(onProgress, options={}) {
    source.pendingImport=null;
    emitImportProgress(onProgress,{stage:"choose",message:"Välj Excel-underlag…"});
    let files;
    if(window.showOpenFilePicker){
      const handles=await window.showOpenFilePicker({multiple:Boolean(options.multiple),types:[{description:"Excelkälla till Lokalblick",accept:{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"]}}]});
      files=[];
      for(const handle of handles){
        if(await permission(handle,"read",true)!=="granted")throw new Error("Läsåtkomst till filen godkändes inte.");
        files.push(await handle.getFile());
      }
    }else{
      files=await new Promise((resolve,reject)=>{
        const input=document.createElement("input");input.type="file";input.accept=".xlsx";input.multiple=Boolean(options.multiple);input.hidden=true;document.body.append(input);
        input.onchange=()=>{const chosen=Array.from(input.files||[]);input.remove();if(chosen.length)resolve(chosen);else {const e=Error("Importen avbröts");e.name="AbortError";reject(e);}};
        input.oncancel=()=>{input.remove();const e=Error("Importen avbröts");e.name="AbortError";reject(e);};input.click();
      });
    }
    if(!files.length){const e=Error("Importen avbröts");e.name="AbortError";throw e;}
    const underlag=[],sheets=[];
    for(const [fi,file] of files.entries()){
      emitImportProgress(onProgress,{stage:"read",message:"Läser "+file.name+"…"});
      const buffer=await file.arrayBuffer();await yieldImportUi();
      const overview=XLSX.read(buffer,{type:"array",bookSheets:true,bookProps:true});preventCanonicalAsEnrichment(overview);
      const own=(overview.SheetNames||[]).map((name,index)=>({name:files.length===1?name:"F"+fi+"S"+index,sheetName:name,fileName:file.name,index,...importSheetRole(name)}));
      underlag.push({fileName:file.name||"Excelimport.xlsx",buffer,sheets:own});sheets.push(...own);
    }
    const fileName=underlag.map(f=>f.fileName).join(", ");
    source.pendingImport={fileName,buffer:underlag.length===1?underlag[0].buffer:null,files:underlag,sheets};
    emitImportProgress(onProgress,{stage:"ready",message:sheets.length+" flikar i "+underlag.length+" filer hittades.",fileName,sheets});
    return {fileName,fileCount:underlag.length,sheets:clone(sheets)};
  }
  function meaningfulSheetInfo(sheet) {
    if(!sheet) return {ref:"",rows:0,cells:0};
    let minRow=Infinity,maxRow=-1,minCol=Infinity,maxCol=-1;
    const rows=new Set();
    let cells=0;
    Object.keys(sheet).forEach(function(address){
      if(address[0]==="!") return;
      const cell=sheet[address];
      if(!cell) return;
      const value=cell.v;
      const meaningful=cell.f || (value!==undefined && value!==null && String(value).trim()!=="");
      if(!meaningful) return;
      let pos;
      try { pos=XLSX.utils.decode_cell(address); } catch (_) { return; }
      minRow=Math.min(minRow,pos.r);maxRow=Math.max(maxRow,pos.r);
      minCol=Math.min(minCol,pos.c);maxCol=Math.max(maxCol,pos.c);
      rows.add(pos.r);cells++;
    });
    if(maxRow<0) return {ref:"",rows:0,cells:0};
    return {
      ref:XLSX.utils.encode_range({s:{r:minRow,c:minCol},e:{r:maxRow,c:maxCol}}),
      rows:rows.size,
      cells:cells
    };
  }
  function trimSheetToContent(sheet) {
    const info=meaningfulSheetInfo(sheet);
    if(info.ref) sheet["!ref"]=info.ref;
    else delete sheet["!ref"];
    return info;
  }
  function selectedImportWorkbook(buffer, selectedSheets) {
    const wanted=new Set(selectedSheets||[]);
    const workbook=XLSX.read(buffer,{type:"array",cellDates:false,cellNF:true,sheets:selectedSheets});
    workbook.SheetNames=(workbook.SheetNames||[]).filter(function(name){return wanted.has(name) && workbook.Sheets[name];});
    const filtered={};
    workbook.SheetNames.forEach(function(name){
      const sheet=workbook.Sheets[name];
      trimSheetToContent(sheet);
      filtered[name]=sheet;
    });
    workbook.Sheets=filtered;
    return workbook;
  }
  function sheetRowCount(workbook,name) {
    return meaningfulSheetInfo(workbook.Sheets[name]).rows;
  }
  function importProgressCounts(data, extra) {
    return Object.assign({
      properties:(data.properties||[]).length,
      contracts:(data.contracts||[]).length,
      activities:(data.activities||[]).length,
      review:(data.importReview||[]).filter(function(x){return x.status==="pending";}).length
    },extra||{});
  }

  async function readSecondaryWorkbook(description) {
    if (!window.showOpenFilePicker) throw new Error("Excelimport kräver Edge eller Chrome med lokal filåtkomst.");
    const handles = await window.showOpenFilePicker({
      multiple:false,
      types:[{ description:description || "Excel-arbetsbok", accept:{ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":[".xlsx"] } }]
    });
    const handle=handles[0];
    const access=await permission(handle,"read",true);
    if(access!=="granted") throw new Error("Läsåtkomst till filen godkändes inte.");
    const file=await handle.getFile();
    const buffer=await file.arrayBuffer();
    return {file:file,buffer:buffer,workbook:XLSX.read(buffer,{type:"array",cellDates:false})};
  }


  function cityImportStatus(data) {
    const properties=(data&&data.properties)||[];
    const missing=properties.filter(function(property){
      return String(property.address||"").trim() && !String(property.city||"").trim();
    });
    const knownCities=Array.from(new Set(properties.map(function(property){
      return String(property.city||"").trim();
    }).filter(Boolean))).sort(function(a,b){return a.localeCompare(b,"sv");});
    return {
      missingIds:missing.map(function(property){return property.id;}),
      missingCount:missing.length,
      knownCities:knownCities
    };
  }

  function applyCityToProperties(data,propertyIds,city,by) {
    const value=String(city||"").trim();
    if(!value) return data;
    canonicalizeModel(data);
    const wanted=new Set(propertyIds||[]);
    const at=new Date().toISOString();
    data.auditLog=Array.isArray(data.auditLog)?data.auditLog:[];
    (data.properties||[]).forEach(function(property,index){
      if(!wanted.has(property.id) || String(property.city||"").trim()) return;
      const before=property.city||"";
      property.city=value;
      property.provenance=property.provenance||{};
      property.provenance.city={
        source:"Komplettering vid import",
        value:value,
        confirmedBy:by||"Import",
        at:at
      };
      data.auditLog.push({
        id:"city|"+at+"|"+index,
        at:at,
        by:by||"Import",
        collection:"properties",
        recordId:property.id,
        action:"Ändrad",
        fields:[{field:"city",from:before,to:value}]
      });
    });
    return data;
  }

  function importNorm(value) {
    return String(value == null ? "" : value).trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9åäö]+/g," ").replace(/\s+/g," ").trim();
  }
  function importAddress(value) { return importNorm(value).replace(/\s+/g,""); }
  function hasImportValue(value) { return value !== "" && value != null; }
  function sameImportValue(a,b) {
    if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
    return importNorm(a) === importNorm(b);
  }
  function nextImportReviewId(data) {
    let n=(data.importReview||[]).length+1,id="";
    do { id="review:import:"+n++; } while((data.importReview||[]).some(function(x){return x.id===id;}));
    return id;
  }
  function importConflict(data,fileName,collection,entity,target,row,field,current,proposed) {
    if (!hasImportValue(current) || !hasImportValue(proposed) || sameImportValue(current,proposed)) return;
    data.importReview=data.importReview||[];
    const currentProvenance=(target.provenance||{})[field]||{};
    data.importReview.push({
      id:nextImportReviewId(data),kind:"operational-conflict",source:fileName||"Excelimport",
      sheet:row.sourceSheet||"",row:row.sourceRow||"",collection:collection,entity:entity,
      recordId:target.id||"",incomingRecordId:row.id||"",field:field,current:current,proposed:proposed,
      currentSource:currentProvenance.source||target.sourceSheet||"Lokalblick-data",
      currentSheet:currentProvenance.sheet||target.sourceSheet||"",
      currentRow:currentProvenance.row||target.sourceRow||"",
      recordLabel:entity==="Fastighet"
        ? [target.address,target.designation,target.sourceId].filter(Boolean).join(" · ")
        : [target.number,target.businessName||target.use].filter(Boolean).join(" · "),
      status:"pending"
    });
  }
  function mergePrimaryData(base,incoming,fileName) {
    canonicalizeModel(base); canonicalizeModel(incoming);
    ["properties","contracts","organizations","people","sourceRegistry","importReview","auditLog"].forEach(function(key){if(!Array.isArray(base[key]))base[key]=[];});
    const report={profile:"Grunddata",fileName:fileName||"",sheets:[],counts:{propertiesCreated:0,propertiesUpdated:0,contractsCreated:0,contractsUpdated:0,organizationsCreated:0,peopleCreated:0,conflicts:0}};
    const initialReviews=base.importReview.length;
    const orgMap=new Map(),personMap=new Map(),propertyMap=new Map();

    (incoming.organizations||[]).forEach(function(org){
      let found=base.organizations.find(function(x){return x.id===org.id;});
      if(!found)found=base.organizations.find(function(x){return importNorm(x.name)===importNorm(org.name)&&importNorm(x.type)===importNorm(org.type);});
      if(!found){
        found=clone(org);
        if(base.organizations.some(function(x){return x.id===found.id;}))found.id=nextStableId("PART",base.organizations);
        base.organizations.push(found);report.counts.organizationsCreated++;
      } else {
        ["name","type","ownerClass"].forEach(function(field){if(!hasImportValue(found[field])&&hasImportValue(org[field]))found[field]=org[field];});
      }
      orgMap.set(org.id,found.id);
    });

    const primaryPersonIds=new Set();
    (incoming.properties||[]).forEach(function(row){
      if(row.ownerResponsiblePersonId)primaryPersonIds.add(row.ownerResponsiblePersonId);
      if(row.responsiblePersonId)primaryPersonIds.add(row.responsiblePersonId);
    });
    (incoming.contracts||[]).forEach(function(row){
      if(row.businessResponsiblePersonId)primaryPersonIds.add(row.businessResponsiblePersonId);
    });

    (incoming.people||[]).filter(function(person){return primaryPersonIds.has(person.id);}).forEach(function(person){
      const mappedOrg=orgMap.get(person.organizationId)||person.organizationId||"";
      let found=base.people.find(function(x){return x.id===person.id;});
      if(!found&&person.email)found=base.people.find(function(x){return importNorm(x.email)===importNorm(person.email);});
      if(!found&&person.sourceId)found=base.people.find(function(x){return x.sourceId&&String(x.sourceId)===String(person.sourceId);});
      if(!found)found=base.people.find(function(x){return importNorm(x.name)===importNorm(person.name)&&String(x.organizationId||"")===String(mappedOrg||"");});
      if(!found){
        found=clone(person);found.organizationId=mappedOrg;
        if(base.people.some(function(x){return x.id===found.id;}))found.id=nextStableId("P",base.people);
        base.people.push(found);report.counts.peopleCreated++;
      } else {
        ["name","role","phone","email","sourceId","unitId"].forEach(function(field){if(!hasImportValue(found[field])&&hasImportValue(person[field]))found[field]=person[field];});
        if(!found.organizationId&&mappedOrg)found.organizationId=mappedOrg;
      }
      personMap.set(person.id,found.id);
    });

    function mergeFields(target,row,fields,collection,entity) {
      let changed=false;
      fields.forEach(function(field){
        const proposed=row[field];
        if(!hasImportValue(proposed))return;
        if(!hasImportValue(target[field])){target[field]=proposed;changed=true;return;}
        if(!sameImportValue(target[field],proposed)){
          const key=[collection,field,fileName].map(x=>String(x||"").trim().toLocaleLowerCase("sv")).join("|");
          const rule=(base.importFieldPreferences||{})[key];
          if(rule==="reject"&&!["id","sourceId","propertyId","contractId"].includes(field))return;
          if(rule==="accept"&&target.provenance?.[field]?.source!=="manual"&&!["id","sourceId","propertyId","contractId"].includes(field)){
            target[field]=proposed;target.provenance||={};
            target.provenance[field]={source:fileName,sheet:row.sourceSheet||"",row:row.sourceRow||"",value:proposed,confirmedBy:"Källprioritet"};
            changed=true;return;
          }
          importConflict(base,fileName,collection,entity,target,row,field,target[field],proposed);
        }
      });
      return changed;
    }

    (incoming.properties||[]).forEach(function(row){
      const mapped=clone(row);
      if(mapped.ownerPartyId)mapped.ownerPartyId=orgMap.get(mapped.ownerPartyId)||mapped.ownerPartyId;
      if(mapped.ownerResponsiblePersonId)mapped.ownerResponsiblePersonId=personMap.get(mapped.ownerResponsiblePersonId)||mapped.ownerResponsiblePersonId;
      if(mapped.responsiblePersonId)mapped.responsiblePersonId=personMap.get(mapped.responsiblePersonId)||mapped.responsiblePersonId;
      const incomingSourceId=String(mapped.sourceId||"").trim();
      const compatibleIdentity=function(property){
        if(!incomingSourceId) return true;
        const existingSourceId=String(property.sourceId||"").trim();
        return !existingSourceId || existingSourceId===incomingSourceId;
      };
      let found=incomingSourceId?base.properties.find(function(x){return x.sourceId&&String(x.sourceId)===incomingSourceId;}):null;
      if(!found&&mapped.id){
        const byId=base.properties.find(function(x){return x.id===mapped.id;});
        if(byId&&compatibleIdentity(byId))found=byId;
      }
      if(!found&&mapped.address){
        const key=importAddress(mapped.address);
        const hits=base.properties.filter(function(x){return compatibleIdentity(x)&&key&&importAddress(x.address)===key;});
        if(hits.length===1)found=hits[0];
      }
      if(!found&&mapped.designation){
        const hits=base.properties.filter(function(x){
          return compatibleIdentity(x)&&importNorm(x.designation)===importNorm(mapped.designation);
        });
        if(hits.length===1)found=hits[0];
      }
      if(!found){
        if(base.properties.some(function(x){return x.id===mapped.id;}))mapped.id=nextStableId("FAST",base.properties);
        base.properties.push(mapped);found=mapped;report.counts.propertiesCreated++;
      } else if(mergeFields(found,mapped,["sourceId","address","city","designation","type","ownerPartyId","ownerResponsiblePersonId","responsiblePersonId","latitude","longitude","unitId"],"properties","Fastighet")) {
        report.counts.propertiesUpdated++;
      }
      propertyMap.set(row.id,found.id);
    });

    const objectMap=new Map();base.objects=base.objects||[];
    (incoming.objects||[]).forEach(function(row){
      const mapped=clone(row);mapped.propertyId=propertyMap.get(mapped.propertyId)||mapped.propertyId;
      let found=base.objects.find(o=>o.id===mapped.id);
      if(!found&&mapped.number){const hits=base.objects.filter(o=>o.propertyId===mapped.propertyId&&String(o.number)===String(mapped.number));if(hits.length===1)found=hits[0];}
      if(!found&&!mapped.number&&mapped.migrationSourceContractId){
        const sourceContract=incoming.contracts.find(c=>c.id===mapped.migrationSourceContractId),number=String(sourceContract?.number||'').replace(/\s/g,'').toUpperCase();
        const matches=base.contracts.filter(c=>number&&c.propertyId===mapped.propertyId&&String(c.number||'').replace(/\s/g,'').toUpperCase()===number);
        if(matches.length===1)found=base.objects.find(o=>o.id===matches[0].objectId);
      }
      if(!found){base.objects.push(mapped);found=mapped;report.counts.objectsCreated=(report.counts.objectsCreated||0)+1;}
      else mergeFields(found,mapped,['number','name','area','category','use','businessName','unitId','employees','users','rooms','commonArea','apartmentArea','start','end','comment'],'objects','Objekt');
      objectMap.set(row.id,found.id);
    });

    function contractNumber(value){return String(value||"").replace(/\s+/g,"").toUpperCase();}
    (incoming.contracts||[]).forEach(function(row){
      const mapped=clone(row);
      mapped.propertyId=propertyMap.get(mapped.propertyId)||mapped.propertyId||"";
      if(mapped.objectId)mapped.objectId=objectMap.get(mapped.objectId)||mapped.objectId;
      if(mapped.businessPartyId)mapped.businessPartyId=orgMap.get(mapped.businessPartyId)||mapped.businessPartyId;
      if(mapped.businessResponsiblePersonId)mapped.businessResponsiblePersonId=personMap.get(mapped.businessResponsiblePersonId)||mapped.businessResponsiblePersonId;
      const number=contractNumber(mapped.number||mapped.sourceId);
      let found=null;
      if(number){
        const hits=base.contracts.filter(function(x){return contractNumber(x.number||x.sourceId)===number;});
        if(hits.length===1)found=hits[0];
        else if(hits.length>1&&mapped.propertyId)found=hits.find(function(x){return x.propertyId===mapped.propertyId;})||null;
      }
      if(!found&&mapped.id)found=base.contracts.find(function(x){return x.id===mapped.id;});
      if(!found){
        if(base.contracts.some(function(x){return x.id===mapped.id;}))mapped.id=nextStableId("AVT",base.contracts);
        base.contracts.push(mapped);found=mapped;report.counts.contractsCreated++;
      } else if(mergeFields(found,mapped,[
        "sourceId","objectId","propertyId","number","area","category","tenantName","use","businessPartyId","businessName","businessResponsiblePersonId",
        "start","end","noticePeriodMonths","renewalPeriodMonths","originalTerm","baseRent","baseAdditions","rentBaseYear","rentBaseIndex","rentIndexPercent","rentSeriesBase",
        "additionBaseYear","additionBaseIndex","additionIndexPercent","additionSeriesBase","rentAdjustmentMethod","rentAnnualPercent","rentMinPercent","rentMaxPercent","rentLimitBasis","additionAdjustmentMethod","additionAnnualPercent","additionMinPercent","additionMaxPercent","additionLimitBasis","annualContractDrift","annualPropertyTax","costCenterOperations","costCenterPremises","ekotObject",
        "contractDocumentUrl","contractDocumentName","contractDocumentKind","unitId","employees","users","rooms","commonArea","apartmentArea"
      ],"contracts","Avtal")) {
        report.counts.contractsUpdated++;
      }
    });

    report.counts.conflicts=base.importReview.length-initialReviews;
    const sourceSheets=Array.from(new Set((incoming.properties||[]).concat(incoming.contracts||[]).map(function(x){return x.sourceSheet||"";}).filter(Boolean)));
    report.sheets=sourceSheets;
    base.sourceRegistry=(base.sourceRegistry||[]).filter(function(x){return !(x.kind==="core-import"&&x.name===(fileName||""));});
    base.sourceRegistry.push({
      id:"source:core:"+String(fileName||"Excel").replace(/[^a-z0-9]+/gi,"-").toLowerCase(),
      name:fileName||"Excelimport",kind:"core-import",importedAt:new Date().toISOString(),
      rows:(incoming.properties||[]).length+(incoming.contracts||[]).length,
      matched:report.counts.propertiesUpdated+report.counts.contractsUpdated,
      created:report.counts.propertiesCreated+report.counts.contractsCreated,
      review:report.counts.conflicts,sheets:sourceSheets.join(", ")
    });
    return report;
  }

  function appendImportAudit(before,after,fileName) {
    after.auditLog=Array.isArray(after.auditLog)?after.auditLog:[];
    const existingImports=after.auditLog.slice((before.auditLog||[]).length).filter(x=>x.action==="Importerad");
    const at=new Date().toISOString();
    diffData(before,after).forEach(function(change,index){
      if(change.key==="metadata"||existingImports.some(x=>x.collection===change.key&&x.recordId===change.id))return;
      const fields=(change.fields||[]).map(function(field){
        return {field:field,from:change.before?change.before[field]:"",to:change.after?change.after[field]:""};
      });
      after.auditLog.push({
        id:"import|"+at+"|"+index,at:at,by:"Excelimport · "+(fileName||"källa"),
        collection:change.key||"",recordId:change.id||"",action:change.action||"Importerad",fields:fields
      });
    });
  }

  function analyzeImportWorkbook(workbook,baseData,fileName,arrayBuffer) {
    preventCanonicalAsEnrichment(workbook);
    let data=clone(baseData||{});
    canonicalizeModel(data);
    const before=clone(data);
    const report={
      profile:"Lokalblick import v1",fileName:fileName||"",sheets:(workbook.SheetNames||[]).slice(),stages:[],
      counts:{propertiesBefore:(data.properties||[]).length,contractsBefore:(data.contracts||[]).length,propertiesAfter:0,contractsAfter:0,activitiesAfter:0,review:0},
      warnings:[]
    };
    let recognized=false;

    if(window.LokalblickMigrationAdapter&&window.LokalblickMigrationAdapter.detect(workbook)){
      const migrated=window.LokalblickMigrationAdapter.migrate(workbook,fileName||"Excelimport");
      const primary=clone(migrated.data||{});
      canonicalizeModel(primary);
      const beforeCore=clone(data);
      const coreReport=mergePrimaryData(data,primary,fileName);
      if(window.LokalblickImportRules)data=window.LokalblickImportRules.reconcile(beforeCore,{data,report:coreReport},workbook,fileName||"Excelimport",SCHEMAS.concat([ACTIVITY_SCHEMA])).data;
      report.stages.push(coreReport);recognized=true;
      (migrated.report&&migrated.report.warnings||[]).forEach(function(x){if(report.warnings.indexOf(x)<0)report.warnings.push(x);});
    }

    if(window.LokalblickOperationalEnrichmentAdapter&&window.LokalblickOperationalEnrichmentAdapter.detect(workbook)){
      const operational=window.LokalblickOperationalEnrichmentAdapter.enrich(workbook,data,fileName||"Excelimport");
      data=operational.data;report.stages.push(operational.report);recognized=true;
    }

    if(window.LokalblickProject2027Adapter&&window.LokalblickProject2027Adapter.detect(workbook)){
      const activities=window.LokalblickProject2027Adapter.enrich(workbook,data,fileName||"Excelimport");
      data=activities.data;report.stages.push(activities.report);recognized=true;
    }

    if(window.LokalblickContractEnrichmentAdapter&&window.LokalblickContractEnrichmentAdapter.detect(workbook)&&(data.contracts||[]).length){
      const contracts=window.LokalblickContractEnrichmentAdapter.enrich(workbook,data,fileName||"Excelimport",arrayBuffer);
      data=contracts.data;report.stages.push(contracts.report);recognized=true;
    }

    if(window.LokalblickContractEnrichmentAdapter){
      const series=window.LokalblickContractEnrichmentAdapter.parseIndexWorkbook(workbook,fileName||"Excelimport");
      if(series.length){
        const indexed=window.LokalblickContractEnrichmentAdapter.applyIndexSeries(data,series,fileName||"Excelimport");
        data=indexed.data;report.stages.push({profile:"KPI",fileName:fileName||"",counts:{sourceRows:series.length,recalculated:indexed.report.recalculated||0},warnings:indexed.report.warnings||[]});recognized=true;
      }
    }

    if(!recognized)throw new Error("Filen innehåller inga flikar som Lokalblick känner igen ännu.");
    canonicalizeModel(data);
    appendImportAudit(before,data,fileName);
    report.counts.propertiesAfter=(data.properties||[]).length;
    report.counts.contractsAfter=(data.contracts||[]).length;
    report.counts.activitiesAfter=(data.activities||[]).length;
    report.counts.review=(data.importReview||[]).filter(function(x){return x.status==="pending";}).length;
    data.lastImportReport=clone(report);
    return {data:data,report:report};
  }

  async function analyzeImportWorkbookAsync(workbook,baseData,fileName,arrayBuffer,onProgress) {
    preventCanonicalAsEnrichment(workbook);
    let data=clone(baseData||{});
    canonicalizeModel(data);
    const before=clone(data);
    const report={
      profile:"Lokalblick import v1",fileName:fileName||"",sheets:(workbook.SheetNames||[]).slice(),stages:[],
      counts:{propertiesBefore:(data.properties||[]).length,contractsBefore:(data.contracts||[]).length,propertiesAfter:0,contractsAfter:0,activitiesAfter:0,review:0},
      warnings:[]
    };
    let recognized=false;
    const totalStages=4, stageRows=Object.fromEntries((workbook.SheetNames||[]).map(function(name){return [name,sheetRowCount(workbook,name)];}));
    emitImportProgress(onProgress,{stage:"parsed",step:0,totalSteps:totalStages,message:"Flikarna är lästa.",sheets:(workbook.SheetNames||[]).map(function(name){return {name:name,rows:stageRows[name]};}),counts:importProgressCounts(data)});
    await yieldImportUi();

    if(window.LokalblickMigrationAdapter&&window.LokalblickMigrationAdapter.detect(workbook)){
      emitImportProgress(onProgress,{stage:"core",step:1,totalSteps:totalStages,message:"Tolkar fastigheter och avtal…",counts:importProgressCounts(data)});
      await yieldImportUi();
      const migrated=window.LokalblickMigrationAdapter.migrate(workbook,fileName||"Excelimport");
      const primary=clone(migrated.data||{});
      canonicalizeModel(primary);
      const beforeCore=clone(data);
      const coreReport=mergePrimaryData(data,primary,fileName);
      if(window.LokalblickImportRules)data=window.LokalblickImportRules.reconcile(beforeCore,{data,report:coreReport},workbook,fileName||"Excelimport",SCHEMAS.concat([ACTIVITY_SCHEMA])).data;
      report.stages.push(coreReport);recognized=true;
      (migrated.report&&migrated.report.warnings||[]).forEach(function(x){if(report.warnings.indexOf(x)<0)report.warnings.push(x);});
      emitImportProgress(onProgress,{stage:"core-done",step:1,totalSteps:totalStages,message:"Grunddata klar.",counts:importProgressCounts(data,{
        matched:(coreReport.counts.propertiesUpdated||0)+(coreReport.counts.contractsUpdated||0),
        created:(coreReport.counts.propertiesCreated||0)+(coreReport.counts.contractsCreated||0)
      })});
      await yieldImportUi();
    }

    if(window.LokalblickOperationalEnrichmentAdapter&&window.LokalblickOperationalEnrichmentAdapter.detect(workbook)){
      emitImportProgress(onProgress,{stage:"operational",step:2,totalSteps:totalStages,message:"Tolkar fastighetsdata, aktiviteter och beställningar…",counts:importProgressCounts(data)});
      await yieldImportUi();
      const operational=window.LokalblickOperationalEnrichmentAdapter.enrich(workbook,data,fileName||"Excelimport");
      data=operational.data;report.stages.push(operational.report);recognized=true;
      const oc=operational.report&&operational.report.counts||{};
      emitImportProgress(onProgress,{stage:"operational-done",step:2,totalSteps:totalStages,message:"Berikning klar.",counts:importProgressCounts(data,{
        matched:(oc.propertiesMatched||0)+(oc.contractsMatched||0)+(oc.ordersMatched||0),
        created:(oc.activitiesCreated||0)+(oc.ordersCreated||0)+(oc.peopleCreated||0)
      })});
      await yieldImportUi();
    }

    if(window.LokalblickProject2027Adapter&&window.LokalblickProject2027Adapter.detect(workbook)){
      const activities=window.LokalblickProject2027Adapter.enrich(workbook,data,fileName||"Excelimport");
      data=activities.data;report.stages.push(activities.report);recognized=true;
    }

    if(window.LokalblickContractEnrichmentAdapter&&window.LokalblickContractEnrichmentAdapter.detect(workbook)&&(data.contracts||[]).length){
      emitImportProgress(onProgress,{stage:"contracts",step:3,totalSteps:totalStages,message:"Tolkar avtalsvillkor och dokumentlänkar…",counts:importProgressCounts(data)});
      await yieldImportUi();
      const contracts=window.LokalblickContractEnrichmentAdapter.enrich(workbook,data,fileName||"Excelimport",arrayBuffer);
      data=contracts.data;report.stages.push(contracts.report);recognized=true;
      const cc=contracts.report&&contracts.report.counts||{};
      emitImportProgress(onProgress,{stage:"contracts-done",step:3,totalSteps:totalStages,message:"Avtalsberikning klar.",counts:importProgressCounts(data,{matched:cc.matched||0})});
      await yieldImportUi();
    }

    if(window.LokalblickContractEnrichmentAdapter){
      emitImportProgress(onProgress,{stage:"index",step:4,totalSteps:totalStages,message:"Kontrollerar KPI / index…",counts:importProgressCounts(data)});
      await yieldImportUi();
      const series=window.LokalblickContractEnrichmentAdapter.parseIndexWorkbook(workbook,fileName||"Excelimport");
      if(series.length){
        const indexed=window.LokalblickContractEnrichmentAdapter.applyIndexSeries(data,series,fileName||"Excelimport");
        data=indexed.data;report.stages.push({profile:"KPI",fileName:fileName||"",counts:{sourceRows:series.length,recalculated:indexed.report.recalculated||0},warnings:indexed.report.warnings||[]});recognized=true;
      }
    }

    if(!recognized)throw new Error("De markerade flikarna innehåller ingen information som Lokalblick känner igen ännu.");
    canonicalizeModel(data);
    appendImportAudit(before,data,fileName);
    report.counts.propertiesAfter=(data.properties||[]).length;
    report.counts.contractsAfter=(data.contracts||[]).length;
    report.counts.activitiesAfter=(data.activities||[]).length;
    report.counts.review=(data.importReview||[]).filter(function(x){return x.status==="pending";}).length;
    data.lastImportReport=clone(report);
    emitImportProgress(onProgress,{stage:"done",step:totalStages,totalSteps:totalStages,message:"Importen är klar.",counts:importProgressCounts(data)});
    return {data:data,report:report};
  }

  async function importPreparedSources(data,selectedSheets,onProgress){
    const pending=source.pendingImport,engine=await import('./import-engine.js');
    const sources=pending.files.map(file=>{const chosen=file.sheets.filter(s=>selectedSheets.includes(s.name));if(!chosen.length)return null;const workbook=engine.readImportSource(file,chosen.map(s=>s.sheetName),XLSX);workbook.__importSources=(pending.importSources||[]).filter(s=>s.fileName===file.fileName);return {file,workbook};}).filter(Boolean);
    let output=clone(data||{});canonicalizeModel(output);const before=clone(output),stages=[];
    // Establish every core table before resolving complements from any file.
    for(const {file,workbook} of sources)if(window.LokalblickMigrationAdapter?.detect(workbook)){
      const primary=window.LokalblickMigrationAdapter.migrate(workbook,file.fileName).data,beforeCore=clone(output);canonicalizeModel(primary);
      const report=mergePrimaryData(output,primary,file.fileName);stages.push(report);
      if(window.LokalblickImportRules)output=window.LokalblickImportRules.reconcile(beforeCore,{data:output,report},workbook,file.fileName,SCHEMAS.concat([ACTIVITY_SCHEMA])).data;
    }
    const adapters=[window.LokalblickOperationalEnrichmentAdapter,window.LokalblickProject2027Adapter,window.LokalblickContractEnrichmentAdapter];
    const unknown=sources.filter(({workbook})=>!window.LokalblickMigrationAdapter?.detect(workbook)&&!adapters.some(a=>a?.detect(workbook))&&!(window.LokalblickContractEnrichmentAdapter?.parseIndexWorkbook(workbook,'')||[]).length);
    if(unknown.length){
      const combined=await engine.combineImportSources(unknown.map(s=>s.file),selectedSheets,XLSX),schemas=SCHEMAS.concat([ACTIVITY_SCHEMA]);
      const profiles=engine.profileWorkbook(combined.workbook,schemas,XLSX,output.importMappings||[]);
      const result=engine.prepareMappedImport(combined.workbook,profiles,output,{schemas,fileName:unknown.map(s=>s.file.fileName).join(', '),fingerprint:combined.fingerprint,actor:'Excelimport'},XLSX);output=result.data;stages.push(result.report);canonicalizeModel(output);
    }
    for(const adapter of adapters)for(const {file,workbook} of sources)if(adapter?.detect(workbook)){
      if(adapter===window.LokalblickContractEnrichmentAdapter&&!output.contracts.length)continue;
      const result=adapter.enrich(workbook,output,file.fileName,file.buffer);output=result.data;stages.push(result.report);canonicalizeModel(output);
      emitImportProgress(onProgress,{stage:'enrich',message:'Kopplar '+file.fileName+'…',counts:importProgressCounts(output)});await yieldImportUi();
    }
    for(const {file,workbook} of sources){
      const index=window.LokalblickContractEnrichmentAdapter?.parseIndexWorkbook(workbook,file.fileName)||[];
      if(index.length)output=window.LokalblickContractEnrichmentAdapter.applyIndexSeries(output,index,file.fileName).data;

    }
    canonicalizeModel(output);appendImportAudit(before,output,pending.fileName);source.pendingImport=null;
    return {data:output,report:{profile:'Samlad Excelimport',fileName:pending.fileName,stages,commonRules:true,changes:stages.flatMap(s=>s.changes||[]),counts:{propertiesAfter:output.properties.length,objectsAfter:output.objects.length,contractsAfter:output.contracts.length,activitiesAfter:output.activities.length,review:output.importReview.filter(x=>x.status==='pending').length}}};
  }

  async function importPreparedWorkbook(data,selectedSheets,onProgress) {
    if(!source.pendingImport) throw new Error("Välj Excel-filen på nytt.");
    if(source.pendingImport.files?.length>1)return importPreparedSources(data,selectedSheets,onProgress);
    const selected=(selectedSheets||[]).filter(function(name){return source.pendingImport.sheets.some(function(x){return x.name===name;});});
    if(!selected.length) throw new Error("Markera minst en flik att läsa in.");
    emitImportProgress(onProgress,{stage:"parse",message:"Läser "+selected.length+" markerade flikar…",selectedSheets:selected});
    await yieldImportUi();
    const selectionKey=JSON.stringify([...selected].sort());
    const workbook=source.pendingImport.preparedWorkbooks?.get(selectionKey)||selectedImportWorkbook(source.pendingImport.buffer,selected);
    workbook.__importSources=source.pendingImport.importSources||[];
    emitImportProgress(onProgress,{
      stage:"parsed-sheets",message:"Markerade flikar lästa.",
      sheets:selected.map(function(name){return {name:name,rows:sheetRowCount(workbook,name)};})
    });
    await yieldImportUi();
    const result=await analyzeImportWorkbookAsync(workbook,clone(data||source.data||{}),source.pendingImport.fileName,source.pendingImport.buffer,onProgress);
    source.operationalReports=source.operationalReports||[];
    source.operationalReports.push(clone(result.report));
    source.operationalFileNames=source.operationalFileNames||[];
    source.operationalFileNames.push(source.pendingImport.fileName||"");
    source.pendingImport=null;
    return {data:clone(result.data),report:clone(result.report)};
  }

  async function importWorkbook(data,onProgress) {
    const prepared=await prepareImportWorkbook(onProgress);
    const selected=prepared.sheets.filter(function(x){return x.recommended;}).map(function(x){return x.name;});
    return importPreparedWorkbook(data,selected.length?selected:prepared.sheets.map(function(x){return x.name;}),onProgress);
  }

  async function enrichContracts(data) {
    if(!window.LokalblickContractEnrichmentAdapter) throw new Error("Avtalsadaptern är inte tillgänglig.");
    const picked=await readSecondaryWorkbook("Avtalsregister för berikning");
    const result=window.LokalblickContractEnrichmentAdapter.enrich(picked.workbook,clone(data||source.data||{}),picked.file.name,picked.buffer);
    source.enrichmentReport=clone(result.report||null);
    source.enrichmentFileName=picked.file.name||"";
    return {data:clone(result.data),report:clone(result.report)};
  }

  async function enrichOperational(data) {
    if(!window.LokalblickOperationalEnrichmentAdapter) throw new Error("Den operativa berikningsadaptern är inte tillgänglig.");
    const picked=await readSecondaryWorkbook("Fastighets-, person- och åtgärdsberikning");
    const result=window.LokalblickOperationalEnrichmentAdapter.enrich(picked.workbook,clone(data||source.data||{}),picked.file.name);
    source.operationalReports=source.operationalReports||[];
    source.operationalFileNames=source.operationalFileNames||[];
    source.operationalReports.push(clone(result.report||null));
    source.operationalFileNames.push(picked.file.name||"");
    return {data:clone(result.data),report:clone(result.report)};
  }

  async function importIndexSeries(data) {
    if(!window.LokalblickContractEnrichmentAdapter) throw new Error("Indexadaptern är inte tillgänglig.");
    const picked=await readSecondaryWorkbook("KPI / indexserie");
    const series=window.LokalblickContractEnrichmentAdapter.parseIndexWorkbook(picked.workbook,picked.file.name);
    if(!series.length) throw new Error("Ingen KPI-serie hittades. Filen behöver kolumner för År och Oktober/KPI/Indextal.");
    const result=window.LokalblickContractEnrichmentAdapter.applyIndexSeries(clone(data||source.data||{}),series,picked.file.name);
    source.indexReport=clone(result.report||null);
    source.indexFileName=picked.file.name||"";
    return {data:clone(result.data),report:clone(result.report)};
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
    source.enrichmentReport = null;
    source.enrichmentFileName = "";
    source.operationalReports = [];
    source.operationalFileNames = [];
    source.indexReport = null;
    source.indexFileName = "";
    source.writeRecoveryNeeded = false;
    source.lastWriteError = "";
    source.pendingImport = null;
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
      enrichmentReport:clone(source.enrichmentReport || null),
      enrichmentFileName:source.enrichmentFileName || "",
      operationalReports:clone(source.operationalReports || []),
      operationalFileNames:clone(source.operationalFileNames || []),
      indexReport:clone(source.indexReport || null),
      indexFileName:source.indexFileName || "",
      writeRecoveryNeeded:Boolean(source.writeRecoveryNeeded),
      lastWriteError:source.lastWriteError || ""
    };
  }

  window.LokalblickSourceService = {
    fieldLabel:fieldLabel,
    schemas:SCHEMAS.concat([ACTIVITY_SCHEMA]),
    workbookToData:workbookToData,
    dataToWorkbook:dataToWorkbook,
    isCanonicalDataWorkbook:isCanonicalDataWorkbook,
    canonicalizeModel:canonicalizeModel,
    diffData:diffData,
    connect:connect,
    reconnect:reconnect,
    createFile:createFile,
    cityImportStatus:cityImportStatus,
    applyCityToProperties:applyCityToProperties,
    prepareImportWorkbook:prepareImportWorkbook,
    discardPreparedImport(){source.pendingImport=null;},
    async prepareMapping(data, selectedSheets) {
      if(!source.pendingImport)throw Error("Välj Excel-filen på nytt.");
      const engine=await import('./import-engine.js');
      const pending=source.pendingImport;
      const combined=await engine.combineImportSources(pending.files||[{fileName:pending.fileName,buffer:pending.buffer,sheets:pending.sheets}],selectedSheets,XLSX);
      const workbook=combined.workbook;pending.importSources=workbook.__importSources;
      if(pending.files?.length===1){
        const names=pending.files[0].sheets.filter(s=>selectedSheets.includes(s.name)).map(s=>s.sheetName||s.name);
        pending.preparedWorkbooks ||= new Map();
        pending.preparedWorkbooks.set(JSON.stringify([...selectedSheets].sort()),engine.readImportSource(pending.files[0],names,XLSX));
      }
      return {workbook,profiles:engine.profileWorkbook(workbook,this.schemas,XLSX,data?.importMappings||[]),
        fingerprint:combined.fingerprint,fileName:pending.fileName,fileCount:pending.files?.length||1,
        known:workbook.__importSources.some(s=>{const single={SheetNames:[s.sheetName],Sheets:{[s.sheetName]:workbook.Sheets[s.sheetKey]}};return Boolean(window.LokalblickMigrationAdapter?.detect(single)||window.LokalblickOperationalEnrichmentAdapter?.detect(single)||window.LokalblickProject2027Adapter?.detect(single)||window.LokalblickContractEnrichmentAdapter?.detect(single));})};
    },
    importPreparedWorkbook:importPreparedWorkbook,
    importWorkbook:importWorkbook,
    analyzeImportWorkbook:analyzeImportWorkbook,
    enrichContracts:enrichContracts,
    enrichOperational:enrichOperational,
    importIndexSeries:importIndexSeries,
    async importSupplement(data,key){
      const schema=SCHEMAS.concat([ACTIVITY_SCHEMA]).find(function(s){return s.key===key;});
      if(!schema||!["activities","recurringCosts"].includes(key))throw new Error("Denna kompletterande källa stöds inte.");
      const picked=await readSecondaryWorkbook(schema.sheet);
      return window.LokalblickSupplementalAdapter.analyze(picked.workbook,data,schema,picked.file.name);
    },
    write:write,
    setMode:setMode,
    disconnect:disconnect,
    status:status,
    restoreRemembered:restoreRemembered,
    resumeRemembered:resumeRemembered,
    adoptViewState:adoptViewState
  };
})();
