// Browser-local Excel source adapter for Lokalblick.
// The workbook is parsed and written in the browser. No raw workbook data is uploaded.
(function () {
  const DB_NAME = "lokalblick-local-sources";
  const STORE = "handles";
  const HANDLE_KEY = "excel-source";
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

  const {
    SCHEMAS,ACTIVITY_SCHEMA,fieldLabel,clone,diffData,nextStableId,
    canonicalizeModel,workbookToData,dataToWorkbook,validateWorkbook,discoverWorkbook
  }=window.LokalblickSourceWorkbook.create({
    xlsx:()=>XLSX,models:window,sourceName:()=>source.fileName
  });

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
        window.LokalblickObjectModel?.normalize(next);
        window.LokalblickBusinessModel?.normalize(next);
        window.LokalblickBusinessModel?.validate(next,source.data);
        window.LokalblickResponsibility?.normalize(next);
        window.LokalblickResponsibility?.validate(next,source.data);
        window.LokalblickObjectModel?.stripAreas(next);
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
    const {financialSheetHint}=await import('./import-matching.js'),{importSchemas}=await import('../lokaler/import-model.js');
    const underlag=[],sheets=[];
    for(const [fi,file] of files.entries()){
      emitImportProgress(onProgress,{stage:"read",message:"Läser "+file.name+"…"});
      const buffer=await file.arrayBuffer();await yieldImportUi();
      const overview=XLSX.read(buffer,{type:"array",cellDates:false,cellNF:true});preventCanonicalAsEnrichment(overview);
      const own=(overview.SheetNames||[]).map((name,index)=>{
        const info=meaningfulSheetInfo(overview.Sheets[name]),named=importSheetRole(name);
        const role=named.recommended?named:financialSheetHint(overview.Sheets[name],name,info.ref,importSchemas,XLSX)||named;
        return {name:files.length===1?name:"F"+fi+"S"+index,sheetName:name,fileName:file.name,index,rows:Math.max(0,info.rows-1),...role};
      });
      underlag.push({fileName:file.name||"Excelimport.xlsx",buffer,workbook:overview,sheets:own});sheets.push(...own);
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
    // External LEB rows can carry object facts on a contract. Establish the
    // object before merging so area differences are reviewed on their owner.
    window.LokalblickObjectModel?.normalize(base);
    window.LokalblickObjectModel?.normalize(incoming);
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
      if(!found){base.objects.push(mapped);found=mapped;report.counts.objectsCreated=(report.counts.objectsCreated||0)+1;}
      else mergeFields(found,mapped,['number','name','area','category','use','unitId','employees','users','rooms','commonArea','apartmentArea','start','end','comment'],'objects','Objekt');
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
        "sourceId","objectId","propertyId","number","category","tenantName","use","businessPartyId","businessName","businessDescription","businessResponsiblePersonId",
        "start","end","noticePeriodMonths","renewalPeriodMonths","originalTerm","baseRent","baseAdditions","rentBaseYear","rentBaseIndex","rentIndexPercent","rentSeriesBase",
        "additionBaseYear","additionBaseIndex","additionIndexPercent","additionSeriesBase","rentAdjustmentMethod","rentAnnualPercent","rentMinPercent","rentMaxPercent","rentLimitBasis","additionAdjustmentMethod","additionAnnualPercent","additionMinPercent","additionMaxPercent","additionLimitBasis","annualPropertyTax","costCenterOperations","costCenterPremises","ekotObject",
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
    connectHandle:readHandle,
    reconnect:reconnect,
    createFile:createFile,
    cityImportStatus:cityImportStatus,
    applyCityToProperties:applyCityToProperties,
    prepareImportWorkbook:prepareImportWorkbook,
    discardPreparedImport(){source.pendingImport=null;},
    async prepareMapping(data, selectedSheets, options={}) {
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
      return {workbook,profiles:engine.profileWorkbook(workbook,options.schemas||this.schemas,XLSX,data?.importMappings||[],{...options,referenceData:data}),
        fingerprint:combined.fingerprint,fileName:pending.fileName,fileCount:pending.files?.length||1};
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
