// Browser-local Excel source adapter for Lokalblick.
// The workbook is parsed and written in the browser. No raw workbook data is uploaded.
(function () {
  const DB_NAME = "lokalblick-local-sources";
  const STORE = "handles";
  const HANDLE_KEY = "excel-source";
  const MODEL_VERSION = "1";

  const SCHEMAS = [
    { sheet:"Fastigheter", key:"properties", fields:["id","type","address","designation","owner","manager","latitude","longitude"] },
    { sheet:"Avtal", key:"contracts", fields:["id","propertyId","number","source","area","category","use","start","end","notice","annualRent","annualContractDrift","unitId","tenantOrgId","ownerOrgId","employees","users","rooms","commonArea","apartmentArea"] },
    { sheet:"Organisationer", key:"organizations", fields:["id","name","type","ownerClass"] },
    { sheet:"Personer", key:"people", fields:["id","name","organizationId","unitId","role","email"] },
    { sheet:"Ansvar", key:"assignments", fields:["id","personId","targetType","targetId","role","fromDate","toDate","allocation"] },
    { sheet:"Projekt", key:"projects", fields:["id","propertyId","contractId","name","description","status","phase","start","end","moveIn","budgetYear","budgetInvestigation","budgetExecution","budgetFurnishing","preliminaryCost","planningQuarter","planningMonth"] },
    { sheet:"Underhåll", key:"maintenance", fields:["id","propertyId","contractId","title","year","cost","priority","status","planningQuarter","planningMonth"] },
    { sheet:"Drift", key:"operations", fields:["id","propertyId","contractId","period","category","budget","actual"] },
    { sheet:"Utredningar", key:"investigations", fields:["id","propertyId","contractId","title","year","cost","status"] },
    { sheet:"Status", key:"maintenanceStatus", fields:["id","contractId","propertyId","category","assessedDate","status","priority","comment","actionNeed","budgetYear","estimatedCost","includeInBudget","responsiblePersonId","planningQuarter","planningMonth"] },
    { sheet:"Driftärenden", key:"driftIssues", fields:["id","contractId","propertyId","category","title","description","createdDate","targetDate","decisionDate","completedDate","status","priority","responsiblePersonId","budgetYear","estimatedCost","finalCost","includeInBudget","planningQuarter","planningMonth"] },
    { sheet:"Önskemål", key:"wishes", fields:["id","contractId","propertyId","category","title","description","createdDate","targetDate","decisionDate","completedDate","status","responsiblePersonId","budgetYear","budgetCategory","estimatedCost","finalCost","includeInBudget"] },
    { sheet:"Ansvarshistorik", key:"assignmentChanges", fields:["id","targetType","targetId","fromPersonId","toPersonId","changedAt","changedBy"] }
  ];

  const source = {
    handle:null,
    fileName:"",
    mode:"read",
    connected:false,
    dirty:false,
    lastRead:null,
    data:null,
    workbook:null,
    discovered:[],
    pendingChanges:[]
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

  function rowsFromSheet(workbook, sheet) {
    if (!workbook.Sheets[sheet]) return [];
    return XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval:"", raw:true });
  }

  function normalizeRows(rows) {
    return rows.filter(function(row) {
      return Object.keys(row).some(function(key) { return row[key] !== "" && row[key] != null; });
    });
  }

  function workbookToData(workbook) {
    const data = { isDemo:false, sourceName:source.fileName || "Excel-källa" };
    SCHEMAS.forEach(function(schema) {
      data[schema.key] = normalizeRows(rowsFromSheet(workbook, schema.sheet));
    });

    const plans = normalizeRows(rowsFromSheet(workbook, "Budgetplaner"));
    const targets = normalizeRows(rowsFromSheet(workbook, "Budgetmål"));
    const lines = normalizeRows(rowsFromSheet(workbook, "Budgetrader"));
    data.budgetPlans = plans.map(function(plan) {
      const year = Number(plan.year) || plan.year;
      const planTargets = {};
      const notes = {};
      targets.filter(function(x){ return String(x.year) === String(year); }).forEach(function(x) {
        planTargets[x.category] = Number(x.amount) || 0;
        if (x.note) notes[x.category] = x.note;
      });
      return {
        year: year,
        status: plan.status || "",
        createdAt: plan.createdAt || "",
        lockedAt: plan.lockedAt || "",
        notes: notes,
        targets: planTargets,
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

  function sheetFromRows(rows, fields) {
    const safeRows = (rows || []).map(function(row) {
      const out = {};
      fields.forEach(function(field) { out[field] = row[field] == null ? "" : row[field]; });
      return out;
    });
    if (safeRows.length) return XLSX.utils.json_to_sheet(safeRows, { header:fields });
    return XLSX.utils.aoa_to_sheet([fields]);
  }

  function dataToWorkbook(data) {
    const workbook = XLSX.utils.book_new();
    const metadata = [
      ["Lokalblick modellversion", MODEL_VERSION],
      ["Skapad", new Date().toISOString()],
      ["Källa", data && data.sourceName ? data.sourceName : "Lokalblick Excel-källa"],
      ["Princip", "Stabila ID:n används för relationer och säker återkoppling"]
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metadata), "Lokalblick");

    SCHEMAS.forEach(function(schema) {
      XLSX.utils.book_append_sheet(workbook, sheetFromRows((data && data[schema.key]) || [], schema.fields), schema.sheet);
    });

    const plans = (data && data.budgetPlans) || [];
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(plans.map(function(plan) {
      return { year:plan.year, status:plan.status || "", createdAt:plan.createdAt || "", lockedAt:plan.lockedAt || "" };
    }), ["year","status","createdAt","lockedAt"]), "Budgetplaner");

    const targetRows = [];
    const lineRows = [];
    plans.forEach(function(plan) {
      Object.keys(plan.targets || {}).forEach(function(category) {
        targetRows.push({ year:plan.year, category:category, amount:plan.targets[category], note:(plan.notes || {})[category] || "" });
      });
      (plan.lines || []).forEach(function(line) {
        lineRows.push({
          year:plan.year, category:line.category || "", sub:line.sub || "", source:line.source || "",
          contractId:line.contractId || "", propertyId:line.propertyId || "", amount:Number(line.amount) || 0
        });
      });
    });
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(targetRows, ["year","category","amount","note"]), "Budgetmål");
    XLSX.utils.book_append_sheet(workbook, sheetFromRows(lineRows, ["year","category","sub","source","contractId","propertyId","amount"]), "Budgetrader");
    return workbook;
  }

  function validateWorkbook(workbook) {
    const required = ["Fastigheter","Avtal"];
    const missing = required.filter(function(name){ return !workbook.Sheets[name]; });
    if (missing.length) throw new Error("Filen saknar obligatoriska tabeller: " + missing.join(", ") + ". Skapa gärna en Lokalblick Excel-källa först.");
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
    validateWorkbook(workbook);
    source.handle = handle;
    source.fileName = file.name || handle.name || "Excel-källa.xlsx";
    source.mode = mode === "readwrite" ? "readwrite" : "read";
    source.workbook = workbook;
    source.data = workbookToData(workbook);
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
      properties:[], contracts:[], organizations:[], people:[], assignments:[], projects:[], maintenance:[],
      operations:[], investigations:[], maintenanceStatus:[], driftIssues:[], wishes:[], budgetPlans:[], assignmentChanges:[]
    } : clone(data || {});
    base.isDemo = false;
    base.sourceName = handle.name || "Lokalblick-data.xlsx";
    const workbook = dataToWorkbook(base);
    const bytes = XLSX.write(workbook, { bookType:"xlsx", type:"array" });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    source.handle = handle;
    source.fileName = handle.name || "Lokalblick-data.xlsx";
    source.mode = mode === "readwrite" ? "readwrite" : "read";
    source.workbook = workbook;
    source.data = base;
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
        source.pendingChanges = diffData(source.data || {}, next);
        source.data = next;
        source.dirty = source.pendingChanges.length > 0;
        return clone(source.data);
      },
      async reset() { return clone(source.data || {}); }
    };
  }

  async function write() {
    if (!source.connected || !source.handle || !source.data) throw new Error("Ingen Excel-källa är ansluten.");
    if (source.mode !== "readwrite") throw new Error("Källan är ansluten som läsbar. Byt till Läs + skriv först.");
    const access = await permission(source.handle, "readwrite", true);
    if (access !== "granted") throw new Error("Skrivåtkomst godkändes inte.");
    const workbook = dataToWorkbook(source.data);
    const bytes = XLSX.write(workbook, { bookType:"xlsx", type:"array" });
    const writable = await source.handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    source.workbook = workbook;
    source.dirty = false;
    source.pendingChanges = [];
    source.lastRead = new Date();
    source.discovered = discoverWorkbook(workbook);
    return status();
  }

  async function setMode(mode) {
    const next = mode === "readwrite" ? "readwrite" : "read";
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
    source.workbook = null;
    source.discovered = [];
    source.pendingChanges = [];
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
      pendingChanges:clone(source.pendingChanges || [])
    };
  }

  window.LokalblickSourceService = {
    schemas:SCHEMAS,
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