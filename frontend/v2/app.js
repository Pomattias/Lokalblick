import {
  collections,
  normalize,
  clone,
  scope,
  audit,
  assign,
  setActivityHome,
  moveWish,
  resolveReview,
  bulkReviewDecision,
  clearSourcePreference,
} from "./model.js";
import { createTransport } from "./transport.js";
import { retainImportedData } from "./import-workspace.js";
import { shouldRestoreViewSnapshot } from "./restore-policy.js";
import {
  esc,
  money,
  filters,
  summary,
  overview,
  planning,
  budget,
  sources,
  economicSettings,
  organization,
  calc,
  categories,
} from "./views.js";
import { editorHtml, readEditor } from "./editor.js";
const transport = createTransport(),
  content = document.querySelector("#content"),
  filterArea = document.querySelector("#filters");
let data,
  editor = null,
  busy = false,
  switchingView = false;
const selection = { unit: "", owner: "", person: "", q: "", propertyId: "" };
const ui = {
  view: "overview",
  perspective: "Fastigheter",
  year: new Date().getFullYear() + 1,
  settingsYear: new Date().getFullYear(),
  contractId: "",
  unassigned: false,
  unassignedHome: false,
  planningMode: "list",
  timelineSpan: 1,
};
const labels = {
  overview: "Översikt",
  contracts: "Avtal",
  plan: "Planera",
  budget: "Budget",
  map: "Karta",
  sources: "Datakällor",
  people: "Parter",
  settings: "Inställningar",
};
const actor = () =>
  data.currentUser?.name ||
  data.currentUser?.displayName ||
  data.currentUser?.email ||
  (data.isDemo ? "Demoanvändare" : "Okänd användare");
function requireActorIdentity(){
  if(!data.isDemo&&!data.currentUser?.name&&!data.currentUser?.email){
    const name=prompt('Ange ditt namn för ändringshistoriken (själv angivet namn):');
    if(!name?.trim())throw Error('Namn krävs för att spara ändringar.');
    data.currentUser={...data.currentUser,name:name.trim(),identitySource:'self-declared'};
  }
}
function captureChanges(before){
  const logged=new Set(data.auditLog.slice(before.auditLog.length).map(h=>h.collection+'|'+h.recordId));
  for(const col of collections.filter(c=>!['auditLog','indexSeries','importReview','sourceRegistry','documents'].includes(c))){
    const id=r=>String(col==='budgetPlans'?r.year:r.id),old=new Map(before[col].map(r=>[id(r),r])),next=new Map(data[col].map(r=>[id(r),r]));
    for(const key of new Set([...old.keys(),...next.keys()])){
      const a=old.get(key)||{},b=next.get(key)||{};
      if(JSON.stringify(a)===JSON.stringify(b)||logged.has(col+'|'+key))continue;
      audit(data,col,key,a,b,actor());
    }
  }
}
function showHistory(type='',id=''){
  const collection={contract:'contracts',activity:'activities',order:'orders',operation:'operations',maintenanceStatus:'maintenanceStatus'}[type]||type;
  const entries=data.auditLog.slice().reverse().filter(h=>!collection||(h.collection===collection&&String(h.recordId)===String(id)));
  const d=document.createElement('dialog');d.className='followup-dialog';
  d.innerHTML='<h2>Ändringshistorik</h2>'+entries.map(h=>'<article><strong>'+esc(h.action)+' · '+esc(h.collection)+' · '+esc(h.recordId)+'</strong><p>'+esc(h.by)+' · '+esc(new Date(h.at).toLocaleString('sv-SE'))+'</p><ul>'+(h.fields||[]).map(f=>'<li>'+esc(f.label||f.field)+': '+esc(typeof f.from==='object'?JSON.stringify(f.from):f.from)+' → '+esc(typeof f.to==='object'?JSON.stringify(f.to):f.to)+'</li>').join('')+'</ul></article>').join('')+'<form method="dialog"><button>Stäng</button></form>';
  document.body.append(d);d.onclose=()=>d.remove();d.showModal();
}
function bindBudget(){
  const before=clone(data),hasScope=()=>Boolean(Object.values(selection).some(Boolean));
  globalThis.LokalblickBudgetUI.bind({state:data,esc,money,clone,selectedBudgetYear:ui.year,budgetPlan:y=>data.budgetPlans.find(p=>Number(p.year)===Number(y)),hasPortfolioScope:hasScope,portfolioScopeContracts:()=>scope(data,selection).contracts,budgetRowsForContracts:(rows,contracts)=>rows.filter(r=>r.contractId?contracts.some(c=>c.id===r.contractId):scope(data,selection).properties.some(p=>p.id===r.propertyId)),budgetRows:y=>calc().budgetRows(data,y,hasScope()?scope(data,selection).contracts:undefined,hasScope()?scope(data,selection).properties:undefined),canEdit,currentActorLabel:actor,requireActorIdentity,render,showHistory,budgetCategories:()=>categories,saveState:async()=>{
    if(busy||!canEdit())throw Error('Ändringen kan inte sparas nu.');
    busy=true;try{requireActorIdentity();captureChanges(before);data=await transport.save(data);}catch(e){data=before;throw e;}finally{busy=false;}
  }});
}
function notice(message, error = false) {
  const node = document.querySelector("#notice");
  node.textContent = message;
  node.className = error ? "notice error" : "notice";
}
let manualGeoDialog = null;
function validGeoPosition(p) {
  return p.latitude !== "" && p.longitude !== "" && p.latitude != null && p.longitude != null &&
    Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude));
}
function openGeoPlacement(id) {
  const property = data.properties.find(p => String(p.id) === String(id));
  if (!property) return;
  if (!globalThis.L) throw Error("Kartan kunde inte laddas.");
  if (manualGeoDialog?.open) manualGeoDialog.close();
  const dialog = document.createElement("dialog");
  dialog.className = "followup-dialog geo-placement-dialog";
  dialog.innerHTML = '<div class="geo-placement-head"><div><h2>Placera fastighet på kartan</h2><p>' +
    esc([property.address, property.city].filter(Boolean).join(", ") || property.designation || property.id) +
    '</p></div><button type="button" data-geo-close aria-label="Stäng">Stäng</button></div>' +
    '<p>Klicka på rätt byggnad eller dra markören. Positionen blir inte sparad förrän du bekräftar.</p>' +
    '<div class="geo-placement-map" id="geo-placement-map"></div>' +
    '<div class="geo-placement-footer"><span data-geo-coordinates>Välj en position på kartan</span>' +
    '<div class="actions"><button type="button" data-geo-close>Avbryt</button><button type="button" data-geo-confirm disabled>Bekräfta position</button></div></div>';
  document.body.append(dialog);
  manualGeoDialog = dialog;
  dialog.showModal();
  const center = validGeoPosition(property) ? [Number(property.latitude), Number(property.longitude)] :
    [55.605, 13.0038];
  const map = L.map(dialog.querySelector("#geo-placement-map")).setView(center, validGeoPosition(property) ? 17 : 10);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 20, subdomains: "abcd", attribution: "&copy; OpenStreetMap &copy; CARTO"
  }).addTo(map);
  let selected = validGeoPosition(property) ? center : null;
  let marker = selected ? L.marker(selected,{draggable:true}).addTo(map) : null;
  function setPoint(latlng) {
    selected = [latlng.lat, latlng.lng];
    if (!marker) {
      marker = L.marker(selected,{draggable:true}).addTo(map);
      marker.on("dragend", () => setPoint(marker.getLatLng()));
    } else marker.setLatLng(selected);
    dialog.querySelector("[data-geo-coordinates]").textContent =
      selected[0].toFixed(6) + ", " + selected[1].toFixed(6);
    dialog.querySelector("[data-geo-confirm]").disabled = false;
  }
  if (marker) marker.on("dragend", () => setPoint(marker.getLatLng()));
  map.on("click", e => setPoint(e.latlng));
  const close = () => dialog.close();
  dialog.querySelectorAll("[data-geo-close]").forEach(b => b.onclick = close);
  dialog.querySelector("[data-geo-confirm]").onclick = () => run(async () => {
    if (!selected || geoRunning && !data) return;
    await mutation(d => {
      const p = d.properties.find(x => String(x.id) === String(id));
      if (!p) throw Error("Fastigheten finns inte längre.");
      p.latitude = selected[0];
      p.longitude = selected[1];
      p.geoSource = "manual";
      p.geoConfirmedAt = new Date().toISOString();
      p.geoConfirmedBy = actor();
    });
    close();
    notice("Positionen är bekräftad. Välj Spara till Excel för att behålla den i Lokalblick-data.");
  });
  dialog.addEventListener("close", () => {
    map.remove();
    dialog.remove();
    if (manualGeoDialog === dialog) manualGeoDialog = null;
  }, {once:true});
  setTimeout(() => map.invalidateSize(), 0);
}

let geoRunning = false;
function geoProgressMessage(p) {
  return "Geodata: " + p.processed + " av " + p.pending + " adresser behandlade · " +
    p.matched + " matchade · " + p.review + " granska · " + p.notFound + " utan träff.";
}
function startGeoEnrichment() {
  const service = globalThis.LokalblickGeocodingService;
  if (geoRunning || !service || !data || data.isDemo) return;
  const eligible = data.properties.filter(p => p.id && p.address && p.city && p.geoSource !== "manual" &&
    (p.latitude == null || p.latitude === "" || p.longitude == null || p.longitude === ""));
  if (!eligible.length) return;
  geoRunning = true;
  const snapshot = { isDemo: false, properties: eligible.map(p => ({...p})) };
  notice("Importen är klar. Geokodning pågår – du kan arbeta vidare i Lokalblick medan " +
    eligible.length + " adresser behandlas. Låt fliken vara öppen.");
  Promise.resolve().then(async () => {
    try {
      await service.enrichData(snapshot, progress => {
        for (const item of progress.results || []) {
          if (item.status !== "matched" || item.latitude == null || item.longitude == null) continue;
          const source = snapshot.properties.find(p => String(p.id) === String(item.id));
          const target = data.properties.find(p => String(p.id) === String(item.id));
          if (!source || !target || target.geoSource === "manual" || target.address !== source.address || target.city !== source.city) continue;
          target.latitude = item.latitude;
          target.longitude = item.longitude;
          target.geoSource = "openrouteservice";
          source.latitude = item.latitude;
          source.longitude = item.longitude;
        }
        if (ui.view === "map") {
          const points = scope(data, selection).properties.filter(p =>
            p.latitude != null && p.longitude != null && p.latitude !== "" && p.longitude !== "" &&
            Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))
          ).map(p => ({...p, popupHtml: esc(p.address)}));
          globalThis.LokalblickMapService?.update(points);
        }
        notice(geoProgressMessage(progress) + " Du kan arbeta vidare medan kartan fylls på; låt fliken vara öppen.");
      });
      const byId = new Map(snapshot.properties.map(p => [String(p.id), p]));
      for (const current of data.properties) {
        const result = byId.get(String(current.id));
        if (!result || current.geoSource === "manual" || current.address !== result.address || current.city !== result.city) continue;
        if (Number.isFinite(Number(result.latitude)) && result.latitude != null &&
            Number.isFinite(Number(result.longitude)) && result.longitude != null) {
          current.latitude = result.latitude;
          current.longitude = result.longitude;
          current.geoSource = "openrouteservice";
        }
      }
      data = await transport.save(data);
      const st = globalThis.LokalblickGeocodingStatus || {};
      notice(st.available
        ? "Geokodning klar: " + (st.matched || 0) + " matchade, " + (st.review || 0) +
          " behöver granskas, " + (st.notFound || 0) + " utan träff." +
          (transport.status().dirty ? " Välj Spara till Excel för att behålla koordinaterna." : "")
        : "Geokodningen kunde inte slutföras: " + (st.message || "Okänt fel."));
      render();
    } catch (error) {
      notice("Geokodningen kunde inte slutföras: " + error.message, true);
    } finally {
      geoRunning = false;
    }
  });
}
function exportPendingReviews() {
  const pending = (data.importReview || []).filter(item => item.status === "pending");
  if (!pending.length) { notice("Det finns inga öppna granskningsfel att exportera."); return; }
  const report = {
    format: "lokalblick-review-report",
    version: 1,
    exportedAt: new Date().toISOString(),
    note: "Diagnostik av importkonflikter. Innehåller uppgifter ur källfilerna; granska innan delning.",
    counts: { pending: pending.length, byKind: {} },
    sources: (data.sourceRegistry || []).map(({name,kind,sheets,rows,matched,created,review,importedAt}) =>
      ({name,kind,sheets,rows,matched,created,review,importedAt})),
    reviews: pending.map(item => ({
      ...item,
      // Keep enough source context for diagnosing field mapping and matching.
      registeredRecord: (() => {
        const collection = item.collection || (item.entity === "Fastighet" ? "properties" : item.entity === "Avtal" ? "contracts" : "");
        const rows = Array.isArray(data[collection]) ? data[collection] : [];
        const record = rows.find(x => String(x.id) === String(item.recordId));
        if (!record) return null;
        const {id,sourceId,sourceSheet,sourceRow,address,city,designation,number,propertyId,area} = record;
        return {id,sourceId,sourceSheet,sourceRow,address,city,designation,number,propertyId,area};
      })()
    }))
  };
  for (const item of pending) report.counts.byKind[item.kind || "unknown"] =
    (report.counts.byKind[item.kind || "unknown"] || 0) + 1;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:"application/json;charset=utf-8"}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "lokalblick-granskningsfel-" + new Date().toISOString().slice(0,10) + ".json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice(pending.length + " granskningsfel exporterade till JSON. Granska filen innan den delas.");
}
function importCountLabel(counts = {}) {
  const parts = [];
  if (counts.properties != null) parts.push("Fastigheter " + counts.properties);
  if (counts.contracts != null) parts.push("Avtal " + counts.contracts);
  if (counts.activities != null) parts.push("Aktiviteter " + counts.activities);
  if (counts.matched != null) parts.push("Träffar " + counts.matched);
  if (counts.created != null) parts.push("Skapat " + counts.created);
  if (counts.review != null) parts.push("Granska " + counts.review);
  return parts.join(" · ");
}
function chooseImportSheets(prepared) {
  return new Promise((resolve, reject) => {
    const d = document.createElement("dialog");
    d.className = "followup-dialog import-dialog";
    const rows = (prepared.sheets || [])
      .map(
        (sheet, index) =>
          `<label class="import-sheet"><input type="checkbox" data-import-sheet value="${esc(sheet.name)}" ${sheet.recommended ? "checked" : ""}><span><strong>${esc(sheet.name)}</strong><small>${esc(sheet.kind || "Övrig flik")}</small></span></label>`,
      )
      .join("");
    d.innerHTML = `<div class="import-dialog-head"><div><span class="eyebrow">EXCELIMPORT</span><h2>Välj flikar att läsa</h2><p><strong>${esc(prepared.fileName)}</strong></p></div></div><p>Lokalblick har hittat ${(prepared.sheets || []).length} flikar. Kända flikar är förvalda. Markera en eller flera flikar.</p><div class="import-sheet-tools"><button type="button" data-import-select="recommended">Föreslagna</button><button type="button" data-import-select="all">Markera alla</button><button type="button" data-import-select="none">Avmarkera alla</button></div><div class="import-sheet-list">${rows}</div><div class="actions import-dialog-actions"><button type="button" data-import-cancel>Avbryt</button><button type="button" class="primary-action" data-import-start>Läs markerade flikar</button></div>`;
    document.body.append(d);
    const closeWithAbort = () => {
      if (d.open) d.close();
      const error = new Error("Importen avbröts");
      error.name = "AbortError";
      reject(error);
    };
    d.querySelector("[data-import-cancel]").onclick = closeWithAbort;
    d.querySelectorAll("[data-import-select]").forEach((button) => {
      button.onclick = () => {
        const mode = button.dataset.importSelect;
        d.querySelectorAll("[data-import-sheet]").forEach((input, index) => {
          input.checked =
            mode === "all"
              ? true
              : mode === "none"
                ? false
                : Boolean(prepared.sheets[index]?.recommended);
        });
      };
    });
    d.querySelector("[data-import-start]").onclick = () => {
      const selected = [...d.querySelectorAll("[data-import-sheet]:checked")].map(
        (input) => input.value,
      );
      if (!selected.length) {
        const button = d.querySelector("[data-import-start]");
        button.textContent = "Markera minst en flik";
        return;
      }
      d.close();
      resolve(selected);
    };
    d.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeWithAbort();
    });
    d.addEventListener("close", () => d.remove(), { once: true });
    d.showModal();
  });
}
function askMissingCity(importData) {
  const service = globalThis.LokalblickSourceService;
  const status = service?.cityImportStatus?.(importData) || {
    missingIds: [],
    missingCount: 0,
    knownCities: [],
  };
  if (!status.missingCount)
    return Promise.resolve({ data: importData, filled: 0, skipped: 0 });

  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.className = "followup-dialog import-dialog city-dialog";
    const suggested =
      status.knownCities.length === 1 ? status.knownCities[0] : "";
    const knownText =
      status.knownCities.length === 1
        ? `Övriga fastigheter har orten <strong>${esc(suggested)}</strong>. Om de saknade också ligger där kan du använda samma ort.`
        : status.knownCities.length > 1
          ? `Det finns redan flera orter i materialet: ${status.knownCities.map(esc).join(", ")}.`
          : "Ingen ort kunde hämtas från den importerade filen.";
    d.innerHTML = `<div class="import-dialog-head"><div><span class="eyebrow">DATKVALITET</span><h2>Ort saknas</h2></div></div><p>Ort saknas för <strong>${status.missingCount} fastigheter</strong>. Finns alla dessa i samma ort?</p><p>${knownText}</p><label class="city-input">Ort<input type="text" data-city-value value="${esc(suggested)}" placeholder="Ange ort"></label><p><small>För framtida importer kan du lägga till en kolumn <strong>Ort</strong>, <strong>Postort</strong> eller <strong>Stad</strong> i Excel-filen. Lokalblick sparar orten i Lokalblick-data när du anger den här.</small></p><div class="actions import-dialog-actions"><button type="button" data-city-skip>Inte samma ort – komplettera senare</button><button type="button" class="primary-action" data-city-apply>Använd ort för alla ${status.missingCount}</button></div>`;
    document.body.append(d);
    const finish = (result) => {
      if (d.open) d.close();
      resolve(result);
    };
    d.querySelector("[data-city-skip]").onclick = () =>
      finish({ data: importData, filled: 0, skipped: status.missingCount });
    d.querySelector("[data-city-apply]").onclick = () => {
      const input = d.querySelector("[data-city-value]");
      const city = String(input?.value || "").trim();
      if (!city) {
        input?.focus();
        return;
      }
      const updated = service.applyCityToProperties(
        importData,
        status.missingIds,
        city,
        actor(),
      );
      finish({
        data: updated,
        filled: status.missingCount,
        skipped: 0,
        city,
      });
    };
    d.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish({ data: importData, filled: 0, skipped: status.missingCount });
    });
    d.addEventListener("close", () => d.remove(), { once: true });
    d.showModal();
    d.querySelector("[data-city-value]")?.focus();
  });
}

function showImportProgress(fileName, selectedSheets) {
  const d = document.createElement("dialog");
  d.className = "followup-dialog import-dialog import-progress-dialog";
  d.innerHTML = `<div class="import-dialog-head"><div><span class="eyebrow">EXCELIMPORT</span><h2>Läser och tolkar data</h2><p><strong>${esc(fileName)}</strong></p></div><span class="import-spinner" aria-hidden="true"></span></div><div class="import-progress-track"><span data-import-progress-bar></span></div><strong data-import-progress-message>Förbereder import…</strong><small data-import-progress-counts></small><div class="import-progress-sheets">${selectedSheets.map((name) => `<span data-import-progress-sheet="${esc(name)}">${esc(name)}</span>`).join("")}</div><p class="import-progress-hint">Importen förbereds. Därefter arbetar geokodningen vidare utan att låsa sidan.</p>`;
  document.body.append(d);
  d.showModal();
  return d;
}
function updateImportProgress(dialog, progress = {}) {
  if (!dialog?.isConnected) return;
  const message = dialog.querySelector("[data-import-progress-message]");
  const counts = dialog.querySelector("[data-import-progress-counts]");
  const bar = dialog.querySelector("[data-import-progress-bar]");
  if (message && progress.message) message.textContent = progress.message;
  if (counts) counts.textContent = importCountLabel(progress.counts);
  if (bar) {
    const total = Number(progress.totalSteps) || 0;
    const step = Number(progress.step) || 0;
    const percent = total ? Math.max(4, Math.min(100, Math.round((step / total) * 100))) : 8;
    bar.style.width = percent + "%";
  }
  (progress.sheets || []).forEach((sheet) => {
    const node = [...dialog.querySelectorAll("[data-import-progress-sheet]")].find(
      (x) => x.dataset.importProgressSheet === sheet.name,
    );
    if (node && sheet.rows != null) node.textContent = sheet.name + " · " + sheet.rows + " rader";
  });
}
function canEdit() {
  const st = transport.status();
  if (st.sourceKind === "migration") return false;
  if (data.isDemo || st.staged || (!transport.company() && st.connected)) return true;
  const user = data.currentUser;
  return (
    transport.company() &&
    (!user ||
      user.canEdit ||
      user.isAdmin ||
      /admin|edit/i.test(user.role || ""))
  );
}
async function switchToDemo() {
  if (transport.company()) throw Error("Demoläge är inte tillgängligt i företagets API-läge.");
  const status=transport.status(),isDemo=Boolean(data?.isDemo);
  const promptText=isDemo
    ? "Återställ den syntetiska demodatan till ursprungsläget?"
    : status.dirty || status.staged
      ? "Du har osparad data i arbetsytan. Vill du lämna den och visa demot? Spara först för att inte förlora ändringarna."
      : status.connected
        ? "Koppla bort den anslutna Excel-filen och visa syntetisk demodata? Excel-filen på disken påverkas inte."
        : "Visa syntetisk demodata i stället för den nuvarande arbetsytan?";
  if (!window.confirm(promptText)) return;
  if(status.connected)await globalThis.LokalblickSourceService.disconnect();
  await globalThis.LokalblickViewBridge?.clear?.();
  const demo=globalThis.LokalblickDemoDataService;
  if(!demo?.reset)throw Error("Den syntetiska demotjänsten kunde inte hittas.");
  globalThis.LokalblickDataService=demo;
  data=normalize(await demo.reset());
  if(!data.properties.length || !data.contracts.length)
    throw Error("Demodata kunde inte laddas. Kontrollera att demo-data.js finns.");
  Object.assign(selection,{unit:"",owner:"",person:"",q:"",propertyId:""});
  ui.view="overview";
  ui.perspective="Fastigheter";
  ui.contractId="";
  render();
  notice("Syntetisk demodata återställd. Inga Excel-filer har ändrats.");
}
function render() {
  document.querySelector("#history").onclick=()=>showHistory();
  const demoButton=document.querySelector("#demo");
  if (demoButton) {
    demoButton.hidden=transport.company();
    demoButton.textContent=data.isDemo?"Återställ demo":"Visa demo";
    demoButton.onclick=()=>run(switchToDemo);
  }
  globalThis.LokalblickMapService?.destroy();
  document.querySelector("#title").textContent = labels[ui.view];
  document.querySelectorAll("[data-view]").forEach((x) => {
    x.classList.toggle("active", x.dataset.view === ui.view);
    x.setAttribute(
      "aria-current",
      x.dataset.view === ui.view ? "page" : "false",
    );
  });
  filterArea.innerHTML = filters(data, selection);
  document.querySelector("#summary").innerHTML = ["sources", "people", "settings"].includes(
    ui.view,
  )
    ? ""
    : summary(
        data,
        selection,
        ui.view === "budget" || ui.view === "plan"
          ? ui.year
          : new Date().getFullYear(),
        ui,
      );
  const st = transport.status();
  document.querySelector("#source-label").textContent = data.isDemo
    ? "Syntetisk demo"
    : st.fileName || data.sourceName || "Ansluten data";
  const needsNewWorkbook = st.staged || (st.sourceKind === "migration" && st.dirty);
  document.querySelector("#save").hidden = transport.company() || (!st.dirty && !st.staged);
  document.querySelector("#save").textContent = needsNewWorkbook
    ? "Spara som Lokalblick-data" : `Spara till Excel (${st.pendingChanges?.length || 0})`;
  document.querySelector("#context").innerHTML = selection.propertyId
    ? `<button data-clear-property>Hela urvalet</button><span>${esc(data.properties.find((p) => p.id === selection.propertyId)?.address || selection.propertyId)}</span>`
    : "<span>Portfölj</span>";
  filterArea.hidden = ["sources", "people", "settings"].includes(ui.view);
  if (ui.view === "overview")
    content.innerHTML = overview(data, selection, {
      ...ui,
      year: new Date().getFullYear(),
    });
  if (ui.view === "contracts")
    content.innerHTML = overview(data, selection, {
      ...ui,
      perspective: "Avtal",
      year: new Date().getFullYear(),
    });
  if (ui.view === "plan") content.innerHTML = planning(data, selection, ui);
  if (ui.view === "budget") content.innerHTML = budget(data, selection, ui);
  if (ui.view === "budget") bindBudget();
  if (ui.view === "sources") content.innerHTML = sources(data, transport);
  if (ui.view === "settings") content.innerHTML = economicSettings(data, ui);
  if (ui.view === "people") content.innerHTML = organization(data);
  if (ui.view === "map") {
    content.innerHTML =
      '<div class="section-title"><h2>Fastigheter i aktuellt urval</h2></div><div id="property-map"></div><p>Välj en fastighet på kartan för att öppna dess detaljer.</p>';
    const points = scope(data, selection)
      .properties.filter(
        (p) =>
          p.latitude !== "" &&
          p.longitude !== "" &&
          p.latitude != null &&
          p.longitude != null &&
          Number.isFinite(Number(p.latitude)) &&
          Number.isFinite(Number(p.longitude)),
      )
      .map((p) => ({ ...p, popupHtml: esc(p.address) }));
    try {
      globalThis.LokalblickMapService.render({
        elementId: "property-map",
        points,
        onPointClick: (p) => {
          selection.propertyId = p.id;
          ui.view = "overview";
          render();
        },
      });
    } catch (error) {
      notice("Kartan kunde inte laddas: " + error.message, true);
    }
  }
  if (!canEdit())
    content
      .querySelectorAll(
        "[data-edit],[data-activity-home],[data-activity-year-amount],[data-assign],[data-quarter],[data-move],[data-review],[data-priority-apply],[data-priority-remove],[data-adjust],[data-preliminary],[data-budget-create],[data-budget-lock]",
      )
      .forEach((x) => (x.disabled = true));
  document.querySelector("#add").hidden =
    !canEdit() || !["overview", "contracts"].includes(ui.view);
}
async function mutation(change, { automatic = false } = {}) {
  if (busy) throw Error("En ändring sparas redan");
  if (!canEdit()) throw Error("Denna anslutning är skrivskyddad");
  if (!automatic) requireActorIdentity();
  const before = clone(data);
  busy = true;
  try {
    change(data);
    const previousLocations = new Map((before.properties || []).map(p => [String(p.id), String(p.address || "") + "|" + String(p.city || "")]));
    const locationChanged = (data.properties || []).some(p => previousLocations.get(String(p.id)) !== (String(p.address || "") + "|" + String(p.city || "")));
    if (locationChanged && !data.isDemo && globalThis.LokalblickGeocodingService) {
      const stale = (data.properties || []).filter(p => previousLocations.get(String(p.id)) !== (String(p.address || "") + "|" + String(p.city || "")));
      // Coordinates from the old address must never appear at a new address.
      stale.forEach(p => { p.latitude = null; p.longitude = null; });
      await globalThis.LokalblickGeocodingService.enrichData(data);
    }
    captureChanges(before);
    data = await transport.save(data);
    notice(
      transport.company()
        ? "Sparat till backend"
        : transport.status().dirty
          ? "Ändring registrerad – spara till Excel när du är klar."
          : "Demodata sparad",
    );
    render();
  } catch (error) {
    data = before;
    throw error;
  } finally {
    busy = false;
  }
}
async function loadOfficialPriceBase(year, { automatic = false } = {}) {
  if (!Number.isInteger(year) || year < 1960 || year > 2200) throw Error("Ogiltigt år för prisbasbelopp.");
  if (automatic && (data.priceBaseAmounts || []).some(p => Number(p.year) === year && Number(p.amount) > 0))
    return; // Preserve existing manual and previously verified annual values.
  if (!canEdit()) {
    if (!automatic) throw Error("Datakällan är skrivskyddad.");
    return;
  }
  if ((data.budgetPlans || []).some(p => Number(p.year) === year && p.status === "Låst")) {
    if (!automatic) throw Error("Budgetåret är låst. Prisbasbeloppet kan inte skrivas över.");
    return;
  }
  const response = await fetch("/api/price-base?year=" + encodeURIComponent(year), { cache: "no-store" });
  const responseText = await response.text();
  let official;
  try {
    official = JSON.parse(responseText);
  } catch {
    throw Error("SCB-hämtningen misslyckades: Vercel gav inte ett JSON-svar (HTTP " + response.status + ").");
  }
  if (!response.ok) throw Error(String(official.error || "SCB-hämtningen misslyckades") +
    (official.detail ? " · " + official.detail : ""));
  if (Number(official.year) !== year || !Number.isInteger(Number(official.amount)) ||
      Number(official.amount) < 1000 || Number(official.amount) > 200000)
    throw Error("SCB skickade ett ogiltigt prisbasbelopp.");
  await mutation(d => {
    if ((d.budgetPlans || []).some(p => Number(p.year) === year && p.status === "Låst"))
      throw Error("Budgetåret har låsts under hämtningen.");
    d.priceBaseAmounts = d.priceBaseAmounts || [];
    const existing = d.priceBaseAmounts.find(p => Number(p.year) === year);
    if (automatic && existing && Number(existing.amount) > 0) return;
    const value = {
      year, amount: Number(official.amount), source: official.source, sourceUrl: official.sourceUrl,
      retrievedAt: official.retrievedAt, updatedAt: new Date().toISOString(),
      updatedBy: automatic ? "SCB · automatisk inläsning" : actor()
    };
    if (existing) Object.assign(existing, value);
    else d.priceBaseAmounts.push(value);
  }, { automatic });
}
async function run(fn) {
  try {
    await fn();
  } catch (error) {
    if (error.name !== "AbortError") notice(error.message, true);
  }
}
function closeEditor() {
  document.querySelector("#editor-root").innerHTML = "";
  editor = null;
  document.body.classList.remove("editing");
}
function openEditor(col, id, defaults = {}) {
  if (!canEdit()) return;
  const result = editorHtml(data, col, id, transport.company(), defaults);
  editor = { col, id, record: result.record };
  document.querySelector("#editor-root").innerHTML = result.html;
  document.body.classList.add("editing");
  document.querySelector("#editor-root input, #editor-root select")?.focus();
}
function hasPending() {
  const st=transport.status();
  return st.dirty || st.staged;
}
function approveReplace() {
  return (
    !hasPending() ||
    confirm(
      "Det finns osparade ändringar. Vill du lämna dem och läsa en annan fil?",
    )
  );
}
async function sourceAction(action) {
  if (["connect", "refresh", "blank"].includes(action) && !approveReplace())
    return;
  let result;
  if (action === "connect") {
    data = await transport.connect();
    await globalThis.LokalblickViewBridge?.clear?.();
  }
  if (action === "create" || action === "blank") {
    data = await transport.create(data, action === "blank");
    await globalThis.LokalblickViewBridge?.clear?.();
  }
  if (action === "refresh") data = await transport.refresh();
  if (action === "import") {
    if (busy) throw Error("En import pågår redan");
    busy = true;
    let progressDialog = null;
    try {
      const base = data.isDemo ? { isDemo:false, sourceName:"Excelimport" } : data;
      notice("Öppnar Excel och läser fliklistan…");
      const prepared = await transport.prepareImport((progress) => {
        if (progress.message) notice(progress.message);
      });
      const selectedSheets = await chooseImportSheets(prepared);
      progressDialog = showImportProgress(prepared.fileName, selectedSheets);
      result = await transport.importPrepared(base, selectedSheets, (progress) => {
        updateImportProgress(progressDialog, progress);
        if (progress.message) notice(progress.message + (progress.counts ? " " + importCountLabel(progress.counts) : ""));
      });

      const missingCity =
        globalThis.LokalblickSourceService?.cityImportStatus?.(result.data)
          ?.missingCount || 0;
      let cityResult = { data: result.data, filled: 0, skipped: 0 };
      if (missingCity) {
        if (progressDialog?.open) progressDialog.close();
        progressDialog?.remove();
        progressDialog = null;
        cityResult = await askMissingCity(result.data);
        result.data = cityResult.data;
        progressDialog = showImportProgress(prepared.fileName, selectedSheets);
      }

      const cityWarning = cityResult.skipped
        ? " " + cityResult.skipped + " fastigheter saknar fortfarande ort och geokodas inte förrän ort kompletterats."
        : "";
      const retained = await retainImportedData(
        result.data, transport,
        globalThis.LokalblickViewBridge,
        globalThis.LokalblickSourceService,
      );
      data = normalize(retained.data);
      notice(
        "Excel inläst från " + selectedSheets.length + " flik(ar). " +
        (retained.mode === "connected"
          ? "Resultatet har lagts till i arbetsfilens osparade ändringar."
          : "All tidigare inläst data ligger kvar. Välj Spara som Lokalblick-data när du är klar.") +
        " Granska eventuella konflikter." + cityWarning,
      );
    } finally {
      if (progressDialog?.open) progressDialog.close();
      progressDialog?.remove();
      busy = false;
    }
    startGeoEnrichment();
  } else if (["enrich", "operational", "index", "supplement"].includes(action)) {
    result = await transport[action](
      data,
      document.querySelector("#supplement-kind")?.value,
    );
    data = await transport.save(result.data);
    notice(
      "Underlaget läst. Granska matchningar och konflikter innan du sparar arbetsfilen.",
    );
  } else notice("Datakopplingen uppdaterad");
  data = normalize(data);
  selection.propertyId = "";
  ui.contractId = "";
  render();
}
document.addEventListener("click", (event) =>
  run(async () => {
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.view) {
      ui.view = b.dataset.view;
      ui.contractId = "";
      if (ui.view === "settings") ui.settingsYear = new Date().getFullYear();
      render();
      if (ui.view === "settings") await loadOfficialPriceBase(ui.settingsYear, { automatic: true });
    }
    if (b.dataset.property) {
      selection.propertyId = b.dataset.property;
      ui.perspective = "Avtal";
      ui.view = "overview";
      render();
    }
    if (b.hasAttribute("data-clear-property")) {
      selection.propertyId = "";
      ui.contractId = "";
      render();
    }
    if (b.dataset.perspective) {
      ui.perspective = b.dataset.perspective;
      ui.contractId = "";
      render();
    }
    if (b.dataset.openContract) {
      ui.contractId =
        ui.contractId === b.dataset.openContract ? "" : b.dataset.openContract;
      render();
    }
    if (b.hasAttribute("data-close-contract")) {
      ui.contractId = "";
      render();
    }
    if (b.hasAttribute("data-edit")) openEditor(b.dataset.edit, b.dataset.id);
    if (b.hasAttribute("data-editor-close")) closeEditor();
    if (b.dataset.editorTab) {
      document
        .querySelectorAll("[data-editor-section]")
        .forEach(
          (s) => (s.hidden = s.dataset.editorSection !== b.dataset.editorTab),
        );
      document
        .querySelectorAll("[data-editor-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
    }
    if (b.dataset.planningMode) {
      ui.planningMode = b.dataset.planningMode === "timeline" ? "timeline" : "list";
      render();
      return;
    }
    if (b.dataset.timelineSpan) {
      ui.timelineSpan = b.dataset.timelineSpan === "3" ? 3 : 1;
      render();
      return;
    }
    if (b.dataset.priceBaseOfficial) {
      await loadOfficialPriceBase(Number(b.dataset.priceBaseOfficial));
      return;
    }
    if (b.hasAttribute("data-unassigned")) {
      ui.unassigned = !ui.unassigned;
      render();
    }
    if (b.hasAttribute("data-unassigned-home")) {
      ui.unassignedHome = !ui.unassignedHome;
      if (ui.unassignedHome) ui.unassigned = false;
      render();
    }
    if (b.dataset.move)
      await mutation((d) => moveWish(d, b.dataset.id, b.dataset.move, actor()));
    if (b.dataset.priorityApply) {
      const values=JSON.parse(decodeURIComponent(b.dataset.priorityApply));
      if(!Array.isArray(values)||values.length!==3)throw Error("Källvalet är ogiltigt.");
      const [collection,field,source]=values;
      const select=[...content.querySelectorAll("[data-priority-choice]")].find(x=>x.dataset.priorityChoice===b.dataset.priorityApply);
      const decision=select?.value;
      if(!["accept","reject"].includes(decision))throw Error("Välj först vilken källa som ska gälla.");
      const count=data.importReview.filter(x=>x.status==="pending"&&x.field===field&&x.source===source&&(x.collection||(x.kind==="conflict"?"contracts":""))===collection).length;
      if(!window.confirm(`Tillämpa ${decision==="accept"?source:"tidigare registrerade data"} för ${count} konflikter i fältet ${field}? Regeln gäller även vid senare importer från denna fil.`))return;
      let applied=0;
      await mutation(d=>{applied=bulkReviewDecision(d,{collection,field,source},decision,actor());});
      notice(`${applied} konflikter lösta för ${field}. Källprioriteten är sparad.`);
      return;
    }
    if(b.dataset.priorityRemove){
      const key=decodeURIComponent(b.dataset.priorityRemove);
      await mutation(d=>clearSourcePreference(d,key));
      notice("Källprioriteten är borttagen. Redan godkänd data är oförändrad.");
      return;
    }
    if (b.dataset.review) {
      const target = document.querySelector(
        `[data-review-target="${CSS.escape(b.dataset.review)}"]`,
      )?.value;
      await mutation((d) =>
        resolveReview(d, b.dataset.review, b.dataset.decision, target, actor()),
      );
    }
    if (b.dataset.geoPlace) openGeoPlacement(b.dataset.geoPlace);
    if (b.hasAttribute("data-geo-retry")) startGeoEnrichment();
    if (b.hasAttribute("data-export-reviews")) exportPendingReviews();
    if (b.dataset.source) await sourceAction(b.dataset.source);
    if (b.id === "save") {
      const st=transport.status();
      if (st.staged || st.sourceKind === "migration") {
        await sourceAction("create");
        return;
      }
      if (st.mode !== "readwrite")
        await globalThis.LokalblickSourceService.setMode("readwrite");
      await transport.write();
      notice("Sparat till Excel");
      render();
    }
    if (b.id === "add") {
      const col =
        ui.view === "contracts" || ui.perspective === "Avtal"
          ? "contracts"
          : ui.perspective === "Fastigheter"
            ? "properties"
            : "activities";
      if (
        (col === "contracts" && !data.isDemo) ||
        (transport.company() && col === "properties")
      ) {
        notice(
          "Avtalsidentitet hämtas från INT/EXT. Importera underlaget under Datakällor.",
        );
        return;
      }
      openEditor(
        col,
        "",
        col === "activities"
          ? {
              type: ui.perspective,
              budgetCategory:
                ui.perspective === "Projekt"
                  ? "Projekt"
                  : ui.perspective === "Underhåll"
                    ? "Underhåll"
                    : ui.perspective === "Drift"
                      ? "Driftkostnader"
                      : "Ej budget",
              status: ui.perspective === "Önskemål" ? "Nytt" : "Planerad",
              propertyId: selection.propertyId || "",
            }
          : {},
      );
    }
    if (b.hasAttribute("data-budget-create"))
      await mutation((d) => {
        const live = calc().budgetRows(d, ui.year);
        d.budgetPlans.push({
          year: ui.year,
          status: "Arbetsbudget",
          createdAt: new Date().toISOString(),
          preliminaryIndex: 0,
          lines: [],
          targets: calc().summarize(live),
          notes: {},
        });
      });
    if (b.hasAttribute("data-budget-lock") && confirm('Lås budget '+ui.year+' som baslinje?'))
      await mutation((d) => {
        const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!plan || plan.status === "Låst") return;
        const live = calc().budgetRows(d, ui.year);
        const liveTotals = calc().summarize(live);
        const adjustments = categories
          .map((category) => ({
            category,
            amount: Number(plan.targets?.[category] ?? liveTotals[category] ?? 0) - Number(liveTotals[category] || 0),
          }))
          .filter((line) => line.amount !== 0)
          .map((line, index) => ({
            category: line.category,
            sub: "Budgetjustering",
            source: "Budgetjustering",
            amount: line.amount,
            propertyId: "",
            contractId: "",
            sourceType: "manual",
            sourceId: "BUDGET-ADJ|" + ui.year + "|" + index,
            status: "Låst",
            included: true,
          }));
        const lockedIndex = calc().budgetIndex(
          d,
          ui.year,
          plan.preliminaryIndex,
        );
        plan.lines = live.concat(adjustments);
        plan.lockedIndexYear = lockedIndex.year;
        plan.lockedIndexValue = lockedIndex.value;
        plan.lockedIndexSource = lockedIndex.source;
        plan.status = "Låst";
        plan.lockedAt = new Date().toISOString();
        plan.lockedBy = actor();
      });
  }),
);
// V1-style table interaction acts on existing DOM rows, without changing source data.
function refreshSmartTable(table) {
  const inputs=[...table.querySelectorAll("[data-column-filter]")];
  const tbody=table.tBodies[0];
  if(!tbody)return;
  const rows=[...tbody.rows].filter(row=>!row.querySelector(".empty"));
  const normalize=value=>String(value||"").toLocaleLowerCase("sv").trim();
  rows.forEach(row=>{
    row.hidden=!inputs.every(input=>!normalize(input.value) ||
      normalize(row.cells[Number(input.dataset.columnFilter)]?.textContent).includes(normalize(input.value)));
  });
}
document.addEventListener("input",event=>{
  if(!event.target.matches("[data-column-filter]"))return;
  const table=event.target.closest("table[data-smart-table]");
  if(table)refreshSmartTable(table);
});
document.addEventListener("click",event=>{
  const toggle=event.target.closest("[data-toggle-column-filters]");
  if(toggle){
    const filterRow=toggle.closest(".compact-data-table")?.querySelector(".column-filters");
    if(filterRow){filterRow.hidden=!filterRow.hidden;toggle.setAttribute("aria-expanded",String(!filterRow.hidden));}
    return;
  }
  const sort=event.target.closest("[data-column-sort]");
  if(!sort)return;
  const table=sort.closest("table[data-smart-table]");
  if(!table?.tBodies[0])return;
  const index=Number(sort.dataset.columnSort), dir=sort.dataset.direction==="asc"?"desc":"asc";
  table.querySelectorAll("[data-column-sort]").forEach(b=>{b.dataset.direction="";b.removeAttribute("aria-sort");});
  sort.dataset.direction=dir;
  sort.closest("th")?.setAttribute("aria-sort",dir==="asc"?"ascending":"descending");
  const collator=new Intl.Collator("sv-SE",{numeric:true,sensitivity:"base"});
  const tbody=table.tBodies[0];
  [...tbody.rows].filter(row=>!row.querySelector(".empty")).sort((a,b)=>{
    const av=a.cells[index]?.textContent?.trim()||"", bv=b.cells[index]?.textContent?.trim()||"";
    return (dir==="asc"?1:-1)*collator.compare(av,bv);
  }).forEach(row=>tbody.appendChild(row));
});
document.addEventListener("change", (event) =>
  run(async () => {
    const x = event.target;
    if (x.dataset.filter) {
      selection[x.dataset.filter] = x.value;
      render();
      return;
    }
    if (x.dataset.settingsYear) {
      ui.settingsYear = Math.max(1960, Math.min(2200, Number(x.value) || new Date().getFullYear()));
      render();
      if (ui.settingsYear === new Date().getFullYear())
        await loadOfficialPriceBase(ui.settingsYear, { automatic: true });
      return;
    }
    if (x.hasAttribute("data-year")) {
      ui.year = Math.max(2000, Math.min(2200, Number(x.value) || ui.year));
      render();
      return;
    }
    if (x.dataset.priceBaseYear) {
      const year = Number(x.dataset.priceBaseYear);
      const amount = Number(x.value);
      if (!Number.isInteger(year) || !Number.isFinite(amount) || amount <= 0) throw Error("Ange giltigt prisbasbelopp");
      await mutation(d => {
        if ((d.budgetPlans||[]).some(p=>Number(p.year)===year&&p.status==="Låst"))
          throw Error("Året är låst. Prisbasbeloppet får inte ändras här.");
        d.priceBaseAmounts = d.priceBaseAmounts || [];
        const record = d.priceBaseAmounts.find(p=>Number(p.year)===year);
        if (record) Object.assign(record,{amount,source:"Manuellt justerat",sourceUrl:"",updatedBy:actor(),updatedAt:new Date().toISOString()});
        else d.priceBaseAmounts.push({year,amount,source:"Manuellt angivet",updatedBy:actor(),updatedAt:new Date().toISOString()});
      });
      return;
    }
    if (x.dataset.activityYearAmount) {
      await mutation(d => {
        const activity = d.activities.find(a => String(a.id) === String(x.dataset.activityYearAmount));
        if (!activity) throw Error("Aktiviteten saknas");
        const year = Number(x.dataset.allocationYear);
        if (!Number.isInteger(year) || year < 2000 || year > 2200) throw Error("Ogiltigt budgetår");
        if ((d.budgetPlans || []).some(p => Number(p.year) === year && p.status === "Låst"))
          throw Error("Budgetåret är låst. Ändringar ska göras i ny prognos.");
        const raw = String(x.value || "").trim();
        const amount = raw === "" ? null : Number(raw);
        if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw Error("Ange ett giltigt belopp");
        const before = clone(activity);
        const entries = Array.isArray(activity.yearAllocations) ? activity.yearAllocations : [];
        activity.yearAllocations = entries.filter(entry => Number(entry.year) !== year);
        if (amount !== null) activity.yearAllocations.push({year, amount});
        activity.yearAllocations.sort((a,b)=>Number(a.year)-Number(b.year));
        audit(d, "activities", activity.id, before, activity, actor());
      });
      return;
    }
    if (x.dataset.activityHome) {
      await mutation(d => setActivityHome(d, x.dataset.activityHome, x.value, actor()));
      return;
    }
    if (x.dataset.assign)
      await mutation((d) =>
        assign(d, x.dataset.assign, x.dataset.id, x.value, actor()),
      );
    if (x.dataset.quarter)
      await mutation((d) => {
        const record = d[x.dataset.quarter].find((r) => r.id === x.dataset.id),
          before = clone(record);
        record.planningQuarter = x.value ? Number(x.value) : null;
        record.planningMonth = null;
        audit(d, x.dataset.quarter, record.id, before, record, actor());
      });
    if (x.hasAttribute("data-preliminary"))
      await mutation((d) => {
        const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!plan || plan.status === "Låst") throw Error("Budgeten är låst");
        const previous = calc().summarize(calc().budgetRows(d, ui.year)),
          adjust = Object.fromEntries(
            categories.map((k) => [
              k,
              (Number(plan.targets[k]) || 0) - (previous[k] || 0),
            ]),
          );
        plan.preliminaryIndex = Math.max(0, Number(x.value) || 0);
        const amounts = calc().summarize(calc().budgetRows(d, ui.year));
        categories.forEach(
          (k) => (plan.targets[k] = (amounts[k] || 0) + adjust[k]),
        );
      });
    if (x.dataset.adjust)
      await mutation((d) => {
        const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!plan || plan.status === "Låst") throw Error("Budgeten är låst");
        plan.targets[x.dataset.adjust] =
          (calc().summarize(calc().budgetRows(d, ui.year))[x.dataset.adjust] || 0) +
          Number(x.value);
      });
  }),
);
document.addEventListener("submit", (event) => {
  if (event.target.id !== "edit-form") return;
  event.preventDefault();
  run(async () => {
    const next = readEditor(event.target, editor.record),
      col = editor.col,
      id = editor.id;
    await mutation((d) => {
      if (!id) {
        next.id = crypto.randomUUID();
        next.propertyId = next.propertyId || selection.propertyId;
        d[col].push(next);
        audit(d, col, next.id, {}, next, actor());
      } else {
        const index = d[col].findIndex((x) => x.id === id),
          before = clone(d[col][index]);
        next.provenance = next.provenance || {};
        Object.keys(next)
          .filter(
            (k) =>
              k !== "provenance" &&
              JSON.stringify(next[k]) !== JSON.stringify(before[k]),
          )
          .forEach((k) => {
            next.provenance[k] = {
              source: "manual",
              value: next[k],
              confirmedBy: actor(),
              at: new Date().toISOString(),
            };
          });
        d[col][index] = next;
        audit(d, col, id, before, next, actor());
      }
    });
    closeEditor();
  });
});
window.addEventListener("beforeunload", (event) => {
  if (!switchingView && (hasPending() || editor)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeEditor();
});
async function restoreSharedViewState() {
  const bridge=globalThis.LokalblickViewBridge;
  if(!bridge)return false;
  const saved=await bridge.load();
  const source=globalThis.LokalblickSourceService;
  const st=source?.status?.()||{};
  const mode=globalThis.LokalblickDataService?.mode||"demo";
  if(!shouldRestoreViewSnapshot(saved,{
    mode,connected:st.connected,fileName:st.fileName
  }))return false;
  if(st.connected && source?.adoptViewState)
    return Boolean(source.adoptViewState(saved.data));
  bridge.activate();
  return true;
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-ui-version]");
  if (!link || !data) return;
  event.preventDefault();
  run(async () => {
    switchingView = true;
    await globalThis.LokalblickViewBridge?.save(data, {
      from: "v2",
      sourceMode: globalThis.LokalblickDataService?.mode || "",
      fileName: globalThis.LokalblickSourceService?.status?.().fileName || "",
    });
    location.href = link.href;
  });
});
async function init() {
  try {
    if (!transport.company()) {
      if (globalThis.LokalblickSourceService.resumeRemembered)
        await globalThis.LokalblickSourceService.resumeRemembered();
      else
        await globalThis.LokalblickSourceService.restoreRemembered();
    }
    await restoreSharedViewState();
    data = await transport.load();
    if (data.isDemo && (!data.properties.length || !data.contracts.length)) {
      // Repair a corrupt/empty demo cache without touching imported workspaces.
      const demo=globalThis.LokalblickDemoDataService;
      if (!demo?.reset) throw Error("Demodata saknas.");
      data=normalize(await demo.reset());
    }
    // A successful geocode is part of the canonical property model. Stage it in
    // the connected Excel source; the user confirms the physical file write.
    const geo = globalThis.LokalblickGeocodingStatus;
    if (!data.isDemo && geo?.matched > 0) {
      data = await transport.save(data);
    }
    render();
    if (ui.view === "settings") await run(() => loadOfficialPriceBase(ui.settingsYear, { automatic: true }));
    if (geo && !data.isDemo) {
      notice(geo.available
        ? "Geodata: " + (geo.matched || 0) + " matchade, " + (geo.review || 0) + " behöver granskas, " + (geo.notFound || 0) + " saknar träff." +
          (transport.status().dirty ? " Välj Spara till Excel för att behålla koordinaterna i Lokalblick-data." : "")
        : (geo.message || "Geokodningen är inte tillgänglig."), !geo.available);
    } else notice("");
  } catch (error) {
    notice("Kunde inte läsa data: " + error.message, true);
  }
}
init();
