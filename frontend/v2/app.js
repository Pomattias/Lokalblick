import {labels,handleNavigation} from "./navigation.js";
import {handleEditorCommand} from "./editor-commands.js";
import {createImportDialogs} from "./import-dialogs.js";
import {syncEditorFrame,refreshEditorFrame,observeEditorFrame} from "./editor-frame.js";
import {handleBudgetAction} from './budget-actions.js';
import {openItemDialog,openPropertyCostDialog,openEvidenceDialog,propertyCostsPanel} from './finance-ui.js';
import {maintenancePage,mountMaintenance,maintenanceIssueContext,mountMaintenanceCompletion} from './maintenance-ui.js';
import {nextIssueId} from '../lokaler/issue-identity.js';
import {prepareMaintenanceCompletion} from '../lokaler/maintenance.js';
import {projectFinance,applyContractFinanceEdit,applyLegacyCostEdit,adoptAgreementItems,projectStoredAgreementItems,validateAgreementItems} from '../lokaler/finance-view.js';
import { createCleanEvaluator } from '../lokaler/import-worker-client.js';
import { importSchemas } from '../lokaler/import-model.js';
import {applyLinkedPartyNumber,refreshPartyNumber} from './party-fields.js';
import {bindEditActions,decorateEditActions} from './edit-actions.js';
import {mountCompactIssue,compactIssueJournal,toggleIssueText} from "./compact-issue.js";
import {portfolioScope} from "./portfolio-context.js";
import {propertyPopup} from "./context-ui.js";
import {mountWorkspace,recordBreadcrumb} from "./record-workspace.js";
import {bindSmartTables, readSmartTableState, restoreSmartTableState} from "./smart-table.js";
import {isoDateTime} from "./date-format.js";
import {recurringCostPanel,openRecurringCostDialog} from "./recurring-costs-ui.js";
import {activityJournalHtml,appendActivityNote} from "./activity-journal.js";
import {editorSnapshot,editorHasUnsavedChanges} from "./editor-safety.js";
import {prepareEditorModeFields,refreshEditorModeFields} from "./editor-mode-fields.js";
import {relationshipView,bindRelationshipView} from "./relationships.js";
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
import {activityChoices,changeActivityOption,normalizeActivityOptions} from "./activity-options.js";
import {activityOptionSettings} from "./activity-option-settings.js";
import { filterPresentation } from "./filter-presentation.js";
import {
  esc,
  money,
  filters,
  summary,
  overview,
  dashboard,
  planning,
  budget,
  objectList,
  sources,
  economicSettings,
  organization,
  calc,
  categories,
  units,
  reviewCandidateChoices,
} from "./views.js";
import { editorHtml, readEditor } from "./editor.js";
import { previewImport } from "./import-mapping.js";
import { fieldHistory,recordHistory } from "./field-history.js";
import { planActivityPeriod, planningMonthHeader, planningMonthButtons } from "./planning-visual.js";
import { attachPropertyMap, updatePropertyOwnerContacts } from "./property-editor.js";
import { contextPersonSelect, newPersonDefaults, personFormHtml,
  updatedPersonRecord, refreshPropertyPersonSelectors } from "./property-person-dialog.js";
const transport = createTransport(),
  content = document.querySelector("#content"),
  filterArea = document.querySelector("#filters");
let data,
  editor = null,
  propertyMapCleanup = null,
  pendingPlanSelection = null,
  busy = false,
  switchingView = false;
bindSmartTables(document);
const listTableStates=new Map();
let mapViewState;
let mapScopeKey;
const searches={properties:"",objects:"",contracts:"",activities:""};
const issueFilters={status:"open",person:""};
const maintenanceState={propertyId:'',objectId:'',inspectionId:'',historical:false,q:'',filter:'all',open:[]};
const isPortfolioView=()=>["properties","objects","contracts","activities","map"].includes(ui.view);
const portfolioLocal=()=>({view:ui.view==="map"?"properties":ui.view,q:searches[ui.view==="map"?"properties":ui.view]||"",...(ui.view==="activities"?{...issueFilters,type:ui.issueType}:{})});
const recordSource=()=>ui.view==="activities"?{}:isPortfolioView()?portfolioLocal():{};
const selection = { unit: "", owner: "", person: "", q: "", propertyId: "" };
const ui = {
  view: "overview",
  perspective: "Fastigheter",
  dashboardMode: "",
  issueType: "Alla",
  year: new Date().getFullYear() + 1,
  settingsYear: new Date().getFullYear(),
  contractId: "",
  showScopedFilters: false,
  unassigned: false,
  unassignedHome: false,
  planningMode: "list",
  timelineSpan: 1,
};

bindEditActions(document,()=>ui.view!=="budget");
const actor = () =>
  data.currentUser?.name ||
  data.currentUser?.displayName ||
  data.currentUser?.email ||
  (data.isDemo ? "Demoanvändare" : "Okänd användare");
const {chooseImportSheets,askMissingCity,showImportProgress,updateImportProgress}=createImportDialogs({sourceService:()=>globalThis.LokalblickSourceService,actor});
function requireActorIdentity(){
  if(!data.isDemo&&!data.currentUser?.name&&!data.currentUser?.displayName&&!data.currentUser?.email){
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
  const collection={contract:'contracts',activity:'activities',order:'orders',recurringCost:'recurringCosts'}[type]||type;
  const entries=collection==='properties'?recordHistory(data,collection,String(id)).slice().reverse():data.auditLog.slice().reverse().filter(h=>!collection||(h.collection===collection&&String(h.recordId)===String(id)));
  const d=document.createElement('dialog');d.className='followup-dialog';
  d.innerHTML='<h2>Ändringshistorik</h2>'+(entries.length?'':'<p>Ingen sparad ändringshistorik för detta objekt.</p>')+entries.map(h=>'<article><strong>'+esc(h.action)+' · '+esc(h.collection)+' · '+esc(h.recordId)+'</strong><p>'+esc(h.by)+' · '+esc(isoDateTime(h.at))+'</p><ul>'+(h.fields||[]).map(f=>'<li>'+esc(f.label||f.field)+': '+esc(typeof f.from==='object'?JSON.stringify(f.from):f.from)+' → '+esc(typeof f.to==='object'?JSON.stringify(f.to):f.to)+'</li>').join('')+'</ul></article>').join('')+'<form method="dialog"><button>Stäng</button></form>';
  document.body.append(d);d.onclose=()=>d.remove();d.showModal();
}
function showBudgetHistory(year,row) {
  const plan=data.budgetPlans.find(p=>Number(p.year)===Number(year));
  const entries=globalThis.LokalblickBudgetFollowup.history(data,plan,row);
  const captions={amount:'Budgetbelopp',included:'Ingår i budget',category:'Kategori',source:'Benämning',timing:'Tidplan'};
  const format=(field,value)=>value==null?'—':field==='amount'?money(value):field==='included'?(value===false?'Nej':'Ja'):typeof value==='object'?JSON.stringify(value):String(value);
  const dialog=document.createElement('dialog');dialog.className='followup-dialog';
  dialog.innerHTML=`<h2>Budgethistorik ${year}</h2><p>${esc(row.source||row.sub||row.category)}</p>${entries.length?entries.map(entry=>`<article><strong>${esc(entry.action)}</strong><p>${esc(entry.by||'Ej angivet')} · ${esc(entry.at?isoDateTime(entry.at):'Datum saknas')}</p>${entry.reason?`<p>${esc(entry.reason)}</p>`:''}<ul>${(entry.fields||[]).map(field=>`<li>${esc(captions[field.field]||field.label||field.field)}: ${esc(format(field.field,field.from))} → ${esc(format(field.field,field.to))}</li>`).join('')}</ul></article>`).join(''):'<p>Ingen sparad ändringshistorik för denna budgetpost.</p>'}<form method="dialog"><button>Stäng</button></form>`;
  document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
}
/* Read-only immediate budget projection. Preserve input focus and do not save per keystroke. */
function previewBudgetIndex(field) {
  if (ui.view!=="budget" || !field?.isConnected) return;
  const status=content.querySelector("[data-budget-index-live]");
  if (!status) return;
  const raw=field.value.trim(),value=raw===""?0:Number(raw);
  if(!Number.isFinite(value)||value<0||(raw!==""&&value===0)){
    field.setAttribute("aria-invalid","true");
    const original=document.createElement("template");
    original.innerHTML=budget(data,selection,ui);
    for(const selector of ["[data-budget-totals]",".budget-category-cards","[data-budget-rent-compare]","[data-budget-index-used]"]) {
      const live=content.querySelector(selector),unchanged=original.content.querySelector(selector);
      if(live&&unchanged)live.replaceWith(unchanged);
    }
    status.textContent="Ange ett positivt indextal eller lämna tomt för senast kända KPI.";
    return;
  }
  field.removeAttribute("aria-invalid");
  const plan=data.budgetPlans.find(p=>Number(p.year)===ui.year);
  if(plan?.status==="Låst")return;
  const draft={...data,budgetPlans:[...data.budgetPlans.filter(p=>Number(p.year)!==ui.year),
    {...(plan||{}),year:ui.year,status:"Arbetsbudget",preliminaryIndex:value}]};
  const temporary=document.createElement("template");
  temporary.innerHTML=budget(draft,selection,ui);
  for(const selector of ["[data-budget-totals]",".budget-category-cards","[data-budget-rent-compare]","[data-budget-index-used]"]) {
    const live=content.querySelector(selector),updated=temporary.content.querySelector(selector);
    if(live&&updated)live.replaceWith(updated);
  }
  status.textContent="Förhandsvisning · sparas när du lämnar fältet.";
}
function bindBudget(){
  const before=clone(data),hasScope=()=>Boolean(Object.values(selection).some(Boolean));
  globalThis.LokalblickBudgetUI.bind({state:data,esc,money,clone,selectedBudgetYear:ui.year,budgetPlan:y=>data.budgetPlans.find(p=>Number(p.year)===Number(y)),hasPortfolioScope:hasScope,portfolioScopeContracts:()=>scope(data,selection).contracts,budgetRowsForContracts:(rows,contracts)=>rows.filter(r=>r.contractId?contracts.some(c=>c.id===r.contractId):scope(data,selection).properties.some(p=>p.id===r.propertyId)),budgetProposal:y=>calc().budgetProposal(data,y),budgetRows:y=>calc().budgetRows(data,y,hasScope()?scope(data,selection).contracts:undefined,hasScope()?scope(data,selection).properties:undefined),canEdit,currentActorLabel:actor,requireActorIdentity,render,showHistory,showBudgetHistory,budgetCategories:()=>categories,saveState:async()=>{
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
      if(!d.cleanModel){p.geoSource = "manual";p.geoConfirmedAt = new Date().toISOString();p.geoConfirmedBy = actor();}
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
          if (!source || !target || target.geoSource === "manual" || target.address !== source.address || target.city !== source.city || data.cleanModel&&target.latitude!=null&&target.longitude!=null&&(target.latitude!==source.latitude||target.longitude!==source.longitude)) continue;
          target.latitude = item.latitude;
          target.longitude = item.longitude;
          if(!data.cleanModel)target.geoSource = "openrouteservice";
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
        if (!result || current.geoSource === "manual" || current.address !== result.address || current.city !== result.city || data.cleanModel&&current.latitude!=null&&current.longitude!=null&&(current.latitude!==result.latitude||current.longitude!==result.longitude)) continue;
        if (Number.isFinite(Number(result.latitude)) && result.latitude != null &&
            Number.isFinite(Number(result.longitude)) && result.longitude != null) {
          current.latitude = result.latitude;
          current.longitude = result.longitude;
          if(!data.cleanModel)current.geoSource = "openrouteservice";
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
  transport.leaveClean?.();
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
  ui.issueType="Alla";
  ui.contractId="";
  render();
  notice("Syntetisk demodata återställd. Inga Excel-filer har ändrats.");
}
// Keep the original action nodes (and their delegated click handlers) when
// the filtered view is rebuilt. Only record-level controls remain inside cards.
function resetViewActionPlacement() {
  const actions=document.querySelector("#view-global-actions");
  const fallback=document.querySelector("#view-actions-fallback");
  fallback.appendChild(actions);
  [...actions.children].forEach(node=>{
    if(node.id!=="add" && node.id!=="save")node.remove();
  });
}
function placeViewActions() {
  const actions=document.querySelector("#view-global-actions");
  const fallback=document.querySelector("#view-actions-fallback");
  const actionSelectors={
    plan:".plan-mobile-actions [data-new-issue]",
    objects:".section-title > [data-new-object]",
    people:".section-title > div > [data-edit][data-id='']"
  };
  if(actionSelectors[ui.view]){
    content.querySelectorAll(actionSelectors[ui.view]).forEach(button=>actions.appendChild(button));
  }
  const slot=filterArea.querySelector(".ui-filter-actions-slot");
  (slot||fallback).appendChild(actions);
  const visible=[...actions.querySelectorAll("button")].some(button=>!button.hidden);
  actions.hidden=!visible;
  fallback.hidden=Boolean(slot)||!visible;
}
function render() {
  for(const table of content.querySelectorAll("table[data-list-key]"))listTableStates.set(table.dataset.listKey,readSmartTableState(table));
  resetViewActionPlacement();
  document.body.dataset.view=ui.view;
  const filterState=filterPresentation(ui.view,selection,ui.contractId,ui.showScopedFilters);
  const contextElement=document.querySelector("#context");
  contextElement.classList.toggle("has-selection",filterState.scopedDetail);
  document.querySelector("#history").onclick=()=>showHistory();
  const demoButton=document.querySelector("#demo");
  if (demoButton) {
    demoButton.hidden=transport.company();
    demoButton.textContent=data.isDemo?"Återställ demo":"Visa demo";
    demoButton.onclick=()=>run(switchToDemo);
  }
  const previousMapView=globalThis.LokalblickMapService?.getView?.();
  if(previousMapView)mapViewState=previousMapView;
  globalThis.LokalblickMapService?.destroy();
  document.querySelector("#title").textContent = labels[ui.view];
  document.querySelectorAll("[data-view]").forEach((x) => {
    const active=x.dataset.view===ui.view || (x.dataset.view==="more" && ["properties","objects","contracts","activities","maintenance","sources","people","settings","datamodel"].includes(ui.view));
    x.classList.toggle("active", active);
    x.setAttribute(
      "aria-current",
      active ? "page" : "false",
    );
  });
  const local=portfolioLocal();
  const portfolioView=isPortfolioView()?portfolioScope(data,selection,local):null;
  const viewUi=portfolioView?{...ui,portfolioView}:ui;
  const searchLabels={properties:'Sök fastigheter eller avtal',map:'Sök fastigheter eller avtal',contracts:'Sök avtal eller hyresgäst',objects:'Sök objekt, fastighet eller avtal',activities:'Sök ärenden'};
  filterArea.innerHTML = filterState.show ? filters(data, portfolioView?{...selection,q:local.q}:selection, ui.view === "overview" ? ui.dashboardMode : undefined,
    portfolioView?{personLabel:'Fastighetsansvarig',searchLabel:searchLabels[ui.view],searchView:local.view,placeholder:searchLabels[ui.view],contextFilters:ui.view==="activities"?[
      {key:'type',caption:'Typ',selected:ui.issueType,items:[{id:'Alla',label:'Alla typer'},...[...new Set([...activityChoices(data,'type').map(row=>row.value),...(data.activities||[]).map(row=>row.type).filter(Boolean)])].map(value=>({id:value,label:value}))]},
      {key:'status',caption:'Status',selected:issueFilters.status,items:[{id:'open',label:'Öppna'},{id:'all',label:'Alla statusar'},{id:'closed',label:'Avslutade'},{id:'unlinked',label:'Att koppla'}]},
      {key:'person',caption:'Ärendeansvarig',selected:issueFilters.person,items:data.people.map(row=>({id:row.id,label:row.name}))}
    ]:[]}:{}) : "";
  filterArea.hidden = !filterState.show;
  document.querySelector("#summary").innerHTML = ["sources", "people", "settings", "more", "datamodel", "maintenance"].includes(
    ui.view,
  )
    ? ""
    : summary(
        data,
        selection,
        ui.view === "budget" || ui.view === "plan"
          ? ui.year
          : new Date().getFullYear(),
        viewUi,
      );
  const st = transport.status();
  document.querySelector("#source-label").textContent = data.isDemo
    ? "Syntetisk demo"
    : st.fileName || data.sourceName || "Ansluten data";
  const needsNewWorkbook = st.staged || (st.sourceKind === "migration" && st.dirty);
  document.querySelector("#save").hidden = transport.company() || (!st.dirty && !st.staged);
  document.querySelector("#save").textContent = needsNewWorkbook
    ? "Spara som Lokalblick-data" : `Spara till Excel (${st.pendingChanges?.length || 0})`;
  const scopeLabel = selection.propertyId
    ? esc(data.properties.find((p) => p.id === selection.propertyId)?.address || selection.propertyId)
    : "Avtalsdetalj";
  contextElement.innerHTML = filterState.scopedDetail
    ? `${selection.propertyId ? '<button type="button" data-clear-property>Hela urvalet</button>' : ""}<span>${scopeLabel}</span><button type="button" data-toggle-global-filters aria-expanded="${filterState.show}">${filterState.show ? "Dölj filter" : "Visa filter"}</button>`
    : "";
  if (ui.view === "overview")
    content.innerHTML = dashboard(data, selection, new Date().getFullYear(), ui.dashboardMode);
  if (["properties","contracts","activities"].includes(ui.view)) {
    const perspective={properties:"Fastigheter",contracts:"Avtal",activities:"Ärenden"}[ui.view];
    content.innerHTML = overview(data, selection, {
      ...viewUi,
      hideIssueTypeButtons:true,
      perspective,
      hidePerspectiveTabs:true,
      year:new Date().getFullYear(),
    });
  }
  if(ui.view==='objects')content.innerHTML=objectList(data,selection,viewUi);
  content.onclick=null;content.onchange=null;
  if(ui.view==='maintenance'){
    content.innerHTML=maintenancePage(data,maintenanceState,canEdit()&&Boolean(data.cleanModel||data.isDemo));
    mountMaintenance(content,{data:()=>data,state:maintenanceState,editable:canEdit()&&Boolean(data.cleanModel||data.isDemo),mutate:mutation,notify:notice,openRecord:openEditor});
  }
  for(const table of content.querySelectorAll("table[data-list-key]"))restoreSmartTableState(table,listTableStates.get(table.dataset.listKey));
  if (ui.view === "plan") content.innerHTML = planning(data, selection, ui);
  if (ui.view === "budget") content.innerHTML = budget(data, selection, ui) + recurringCostPanel(data, ui.year, scope(data, selection), canEdit());
  if (ui.view === "budget") bindBudget();
  if (ui.view === "sources") content.innerHTML = sources(data, transport);
  if (ui.view === "datamodel") { content.innerHTML = relationshipView(data); bindRelationshipView(data); }
  if (ui.view === "settings") content.innerHTML = activityOptionSettings(data)+economicSettings(data, ui);
  if (ui.view === "people") content.innerHTML = organization(data);
  if (ui.view === "more") content.innerHTML = `<div class="more-menu"><h2>Vyer och verktyg</h2>${["properties","objects","contracts","activities","maintenance","sources","datamodel","people","settings"].map(view=>`<button data-view="${view}">${labels[view]}</button>`).join('')}<button data-tool="history">Historik</button>${!transport.company()?`<button data-tool="demo">${esc(demoButton.textContent)}</button>`:''}<small>${esc(document.querySelector('#source-label').textContent)}</small></div>`;
  if (ui.view === "map") {
    content.innerHTML =
      '<div class="section-title map-heading"><h2>Fastigheter i aktuellt urval</h2></div><div id="property-map" aria-label="Fastigheter på karta"></div><p class="map-help">Välj en markör för avtal, nyckeltal och öppna ärenden. Välj sedan en länk för detaljer.</p>';
    const points = portfolioView.properties.filter(
        (p) =>
          p.latitude !== "" &&
          p.longitude !== "" &&
          p.latitude != null &&
          p.longitude != null &&
          Number.isFinite(Number(p.latitude)) &&
          Number.isFinite(Number(p.longitude)),
      )
      .map((p) => ({ ...p, popupHtml: propertyPopup(data,p,selection,local,new Date().getFullYear(),portfolioView) }));
    const nextScopeKey=JSON.stringify({...selection,q:local.q});
    if(mapScopeKey!==nextScopeKey)mapViewState=null;
    mapScopeKey=nextScopeKey;
    try {
      globalThis.LokalblickMapService.render({
        elementId: "property-map",
        points,
        interactivePopups:true,
        initialView:mapViewState,
      });
    } catch (error) {
      notice("Kartan kunde inte laddas: " + error.message, true);
    }
  }
  if (!canEdit())
    content
      .querySelectorAll(
        "[data-edit],[data-new-object],[data-new-issue],[data-plan-month],[data-activity-home],[data-activity-year-amount],[data-assign],[data-quarter],[data-move],[data-review],[data-priority-apply],[data-priority-remove],[data-adjust],[data-preliminary],[data-budget-adjust],[data-budget-reopen],[data-budget-create],[data-budget-lock]",
      )
      .forEach((x) => {if(!(isPortfolioView()&&x.matches("[data-edit][data-id]")&&x.dataset.id))x.disabled = true;});
  // New budget controls share the same edit permission as the existing planning controls.
  if(!canEdit()) content.querySelectorAll("[data-plan-budget-include],[data-plan-rent-start]")
    .forEach(x=>x.disabled=true);
  document.querySelector("#add").hidden =
    !canEdit() || !["properties","contracts","activities"].includes(ui.view);
  document.querySelector("#add").textContent =
    ui.view==="activities" ? "Nytt ärende" : "Lägg till";
  placeViewActions();
  if(ui.view!=="budget"){
    decorateEditActions(document);
    if(!canEdit())content.querySelectorAll("[data-edit-mode=edit]").forEach(button=>button.disabled=true);
  }
}
async function mutation(change, { automatic = false, manualPositionIds = [], responsibilityDate, refresh = true } = {}) {
  if (busy) throw Error("En ändring sparas redan");
  if (!canEdit()) throw Error("Denna anslutning är skrivskyddad");
  if (!automatic) requireActorIdentity();
  const before = clone(data);
  busy = true;
  try {
    change(data);
    if(data.cleanModel)projectFinance(data);else projectStoredAgreementItems(data);
    validateAgreementItems(data);
    globalThis.LokalblickObjectModel.applyAreaChanges(before,data);
    globalThis.LokalblickObjectModel.projectAreas(data);
    if(!automatic)globalThis.LokalblickResponsibility.applyChanges(before,data,{actor:actor(),fromDate:responsibilityDate||globalThis.LokalblickResponsibility.today()});
    globalThis.LokalblickBusinessModel.normalize(data);
    globalThis.LokalblickBusinessModel.validate(data,before);
    globalThis.LokalblickObjectModel.normalize(data);
    if(data.objects.length)globalThis.LokalblickObjectModel.validate(data);
    const previousLocations = new Map((before.properties || []).map(p => [String(p.id), String(p.address || "") + "|" + String(p.city || "")]));
    const locationChanged = (data.properties || []).some(p => previousLocations.get(String(p.id)) !== (String(p.address || "") + "|" + String(p.city || "")));
    if (locationChanged && !data.isDemo && globalThis.LokalblickGeocodingService) {
      const stale = (data.properties || []).filter(p => previousLocations.get(String(p.id)) !== (String(p.address || "") + "|" + String(p.city || "")));
      // Coordinates from the old address must never appear at a new address.
      const needsGeocoding=stale.filter(p=>!manualPositionIds.includes(String(p.id)));
      needsGeocoding.forEach(p => { p.latitude = null; p.longitude = null; });
      if (needsGeocoding.length) await globalThis.LokalblickGeocodingService.enrichData(data);
    }
    captureChanges(before);
    data = await transport.save(data);
    notice(
      transport.company()
        ? "Sparat till backend"
        : transport.status().dirty
          ? "Ändring registrerad – spara till Excel när du är klar."
          : transport.cleanActive()?"Sparat i lokal datamodell":"Demodata sparad",
    );
    if(refresh)render();
  } catch (error) {
    data = before;
    throw error;
  } finally {
    busy = false;
  }
}
function showBudgetAdjustment(group) {
  const year=ui.year,plan=data.budgetPlans.find(p=>Number(p.year)===year);
  const dialog=document.createElement('dialog');dialog.className='followup-dialog';
  dialog.innerHTML=`<form><h2>Justera ${esc(group.toLowerCase())} ${year}</h2><p>Justeringen fördelas på objekten efter deras årsbelopp.</p>${plan?.status==='Låst'?'<p>Du skapar en ny arbetsbudget. Den tidigare låsta versionen sparas i budgethistoriken.</p>':''}<label>Justering i kr (+/−)<input name="amount" type="number" step="0.01" required value="${Number(plan?.adjustments?.[group])||0}"></label><p role="alert" data-error></p><div class="actions"><button type="button" data-cancel>Avbryt</button><button class="primary-action" type="submit">Spara justering</button></div></form>`;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const button=dialog.querySelector('[type=submit]');button.disabled=true;
    try {
      const amount=Number(dialog.querySelector('[name=amount]').value);
      if(!Number.isFinite(amount))throw Error('Ange ett belopp i kronor');
      await mutation(d=>{
        let p=d.budgetPlans.find(x=>Number(x.year)===year);
        if(!p){p={year,status:'Arbetsbudget',createdAt:new Date().toISOString(),preliminaryIndex:0,adjustments:{},lines:[],notes:{}};d.budgetPlans.push(p);}
        if(p.status==='Låst')globalThis.LokalblickBudgetFollowup.beginVersion(p,'Ny budgetversion · justering '+group,actor());
        p.adjustments ||= {};p.adjustments[group]=amount;
        p.targets=calc().summarize(calc().budgetProposal(d,year,{strict:true}));
      });dialog.close();
    }catch(error){dialog.querySelector('[data-error]').textContent=error.message;button.disabled=false;}
  };
  document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
}
const loadedBudgetIndexYears=new Set();
async function loadBudgetIndex(year,force=false) {
  const indexYear=Number(year)-1;
  if(indexYear<2025||(!force&&loadedBudgetIndexYears.has(indexYear)))return;
  loadedBudgetIndexYears.add(indexYear);
  try {
    const response=await fetch('/api/budget-index?year='+indexYear,{cache:'no-store'});
    if(!response.ok)throw Error('KPI kunde inte hämtas');
    const payload=await response.json();
    if(!Array.isArray(payload.rows)||!payload.rows.length)throw Error('KPI saknas');
    await mutation(d=>{
      d.indexSeries ||= [];
      for(const row of payload.rows) {
        const i=d.indexSeries.findIndex(x=>Number(x.year)===row.year&&Number(x.month)===row.month&&String(x.seriesBase||'1980')==='1980');
        if(i<0)d.indexSeries.push(row);else if(!d.indexSeries[i].source||/SCB/.test(d.indexSeries[i].source))d.indexSeries[i]=row;
      }
    },{automatic:true});
  } catch(error){notice('Automatisk KPI-hämtning misslyckades. Befintlig indexserie används; saknat index markeras.');}
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
function editorForm(){return document.querySelector("#editor-root #edit-form");}
function hasUnsavedEditorChanges(){
  return !!editor && editorHasUnsavedChanges(editorForm(),editor.initialSnapshot);
}
/* Render the editing outline as a REAL fixed DOM overlay on <body>.
   A pseudo-element on #editor-root can be clipped/hidden by fixed iOS drawers. */

// The green editing perimeter follows EVERY active editable form, including
// cost/person modals. It is a fixed overlay and never changes page geometry.

// Observe only dialog entry/exit and editor nodes; the frame itself is idempotent.
observeEditorFrame();

function setEditorReadMode(readOnly){
  const form=editorForm();
  if(!form||!editor||!editor.id)return;
  editor.readOnly=Boolean(readOnly)||!canEdit();
  // Prepare the text counterparts once; keep all original form controls mounted.
  if(editor.col!=="activities"){
    prepareEditorModeFields(form);
    if(editor.readOnly)refreshEditorModeFields(form);
  }
  form.classList.toggle("editor-readonly",editor.readOnly);
  form.classList.toggle("editor-editing",!editor.readOnly);
  // Same fixed perimeter on desktop/iPhone; never resize the actual editor.
  syncEditorFrame(!editor.readOnly);
  if(editor.col==="activities"){
    // Same cards and grid in both modes. Only reveal/hide the control in each slot.
    form.querySelectorAll(".issue-mode-field").forEach(slot=>{
      const value=slot.querySelector(".issue-field-value");
      const control=slot.querySelector(".issue-field-control");
      if(value)value.hidden=!editor.readOnly;
      if(control)control.hidden=editor.readOnly;
    });
    const title=form.querySelector(".issue-title-heading");
    const titleControl=form.querySelector(".issue-edit-title");
    if(title)title.hidden=!editor.readOnly;
    if(titleControl)titleControl.hidden=editor.readOnly;
    form.querySelectorAll(".issue-history-card").forEach(card=>{
      const value=card.querySelector(".issue-history-value");
      if(value)value.hidden=!editor.readOnly;
      card.querySelectorAll(".issue-history-edit").forEach(control=>control.hidden=editor.readOnly);
      const indicator=card.querySelector(".journal-cost-enhancing");
      if(indicator)indicator.hidden=!editor.readOnly;
    });
    const save=form.querySelector("[data-issue-save]");
    const undo=form.querySelector("[data-editor-undo]");
    if(save)save.hidden=editor.readOnly;
    if(undo)undo.hidden=editor.readOnly;
  }
  for(const field of form.querySelectorAll("input, select, textarea, button")){
    if(!canEdit()&&field.matches("[data-activity-journal-note],[data-activity-journal-save]")){field.disabled=true;continue;}
    if(field.matches("[data-context-record],[data-context-back],[data-maintenance-record],[data-maint-inspection]")||field.closest?.(".context-tabs,.context-breadcrumb,.context-scope,[data-context-panel=contracts],[data-context-panel=issues]")){
      if(field.matches("[data-context-tab],[data-context-record],[data-context-back],[data-context-show-all],[data-maintenance-record],[data-maint-inspection]"))field.disabled=!editor.readOnly;
      if(field.matches("[data-context-new-issue]"))field.disabled=!canEdit();
      continue;
    }
    if(field.closest?.('[data-maint-completion]')){field.disabled=editor.readOnly||field.closest('[data-maint-completion]').hidden;continue;}
    if(field.matches("[data-cost-year]")){field.disabled=!editor.readOnly;continue;}
    if(field.matches("[data-item-new],[data-item-edit],[data-cost-new],[data-cost-edit],[data-cost-evidence]")){field.disabled=!canEdit();continue;}
    if(field.matches("[data-activity-journal-note],[data-activity-journal-save],[data-issue-expand],[data-editor-close],[data-editor-activate],[data-editor-tab]"))continue;
    if(field.dataset.editorOriginalDisabled===undefined)
      field.dataset.editorOriginalDisabled=field.disabled?"true":"false";
    field.disabled=editor.readOnly || field.dataset.editorOriginalDisabled==="true";
  }
  const activate=form.querySelector("[data-editor-activate]");
  if(activate){
    // Reserve the header action's footprint so switching modes cannot move "Stäng".
    activate.hidden=false;
    activate.disabled=!canEdit();
    activate.classList.toggle("editor-activate-placeholder",!editor.readOnly);
    activate.setAttribute("aria-hidden",editor.readOnly?"false":"true");
    activate.tabIndex=editor.readOnly?0:-1;
  }
  const footer=form.querySelector(".editor-actions");
  if(footer)footer.hidden=editor.readOnly;
  updateEditorActions();
}
function updateEditorActions(){
  const form=editorForm();
  if(!editor||!form)return;
  const dirty=hasUnsavedEditorChanges();
  if(editor.readOnly){
    const footer=form.querySelector(".editor-actions");
    if(footer)footer.hidden=true;
    return;
  }
  const status=form.querySelector("[data-editor-save-status]");
  if(status){
    status.textContent=dirty?"Osparade ändringar":"Inga osparade ändringar";
    status.dataset.dirty=dirty?"true":"false";
  }
  const undo=form.querySelector("[data-editor-undo]");
  if(undo)undo.disabled=false; // Always allow returning to Visa without changing layout.
  const save=form.querySelector('.issue-heading-actions button[type="submit"], .editor-actions button[type="submit"]');
  if(save)save.disabled=!dirty&&!!editor.id;
}
function closeEditor({force=false}={}){
  if(editor&&!force&&hasUnsavedEditorChanges()&&!window.confirm("Du har osparade ändringar. Stäng utan att spara och kasta ändringarna?"))return false;
  const returnFocus = editor?.propertyListFocus;
  const origin=editor?.returnFocus;
  if (propertyMapCleanup) {
    propertyMapCleanup();
    propertyMapCleanup = null;
  }
  const root=document.querySelector("#editor-root");
  syncEditorFrame(false);
  editor = null;
  if(root)root.innerHTML = "";
  document.body.classList.remove("editing");
  if (returnFocus && ui.view === "properties") {
    [...content.querySelectorAll('.property-list [data-edit]')]
      .find(button => button.dataset.edit === returnFocus.collection && button.dataset.id === returnFocus.id)
      ?.focus({preventScroll:true});
  }
  if(origin?.isConnected)origin.focus({preventScroll:true});
  return true;
}

function currentFormPlanning(form) {
  const base=editor?.col==="activities"?editor.record:{};
  return {...base,
    startDate:form.querySelector('[name="startDate"]')?.value||"",
    endDate:form.querySelector('[name="endDate"]')?.value||"",
    planningYear:Number(form.querySelector('[name="planningYear"]')?.value)||Number(base.planningYear)||new Date().getFullYear()
  };
}
function redrawFormPlanning(form) {
  const planner=form?.querySelector("[data-issue-planner]");
  if(!planner)return;
  const draft=currentFormPlanning(form);
  const year=draft.planningYear,span=Number(planner.dataset.planSpan)===3?3:1;
  const columns=12*span;
  planner.querySelectorAll(".timeline-track").forEach(el=>el.style.setProperty("--timeline-columns",String(columns)));
  const content=planner.querySelector(".issue-plan-content");
  if(content)content.style.minWidth=span===3?"1080px":"520px";
  planner.querySelector(".timeline-plan-header").innerHTML=planningMonthHeader(year,span);
  planner.querySelector(".timeline-plan-months").innerHTML=planningMonthButtons(draft,year,span,"form");
  planner.querySelectorAll("[data-issue-plan-span]").forEach(el=>{
    const active=Number(el.dataset.issuePlanSpan)===span;
    el.classList.toggle("active",active);
    el.setAttribute("aria-pressed",String(active));
  });
  const text=planner.querySelector("[data-plan-hint]");
  if(text)text.textContent="Välj startmånad och därefter slutmånad. Perioden sparas med ärendet.";
}
function openEditor(col, id, defaults = {}, navigation = {}) {
  if (!canEdit() && (!id||!["properties","objects","contracts","activities"].includes(col)||ui.view==="budget")) return;
  const previous=editor;
  const trail=navigation.trail|| (navigation.fromCurrent&&previous?[...(previous.trail||[]),{
    col:previous.col,id:previous.id,selection:previous.selection,source:previous.source,
    saved:previous.workspace?.capture()||{scroll:document.querySelector("#editor-root .editor")?.scrollTop||0},propertyListFocus:previous.propertyListFocus,returnFocus:previous.returnFocus
  }]:[]);
  const returnFocus=navigation.returnFocus||previous?.returnFocus||document.activeElement;
  const propertyListFocus=navigation.propertyListFocus||previous?.propertyListFocus||
    (document.activeElement?.closest('.property-list')?{collection:col,id}:null);
  if(editor&&!closeEditor())return;
  pendingPlanSelection=null;
  const result = editorHtml(data, col, id, transport.company(), defaults,{portfolio:ui.view!=="budget"});
  editor = { col, id, defaults:clone(defaults), record: result.record,trail,
    selection:clone(navigation.selection||previous?.selection||selection),
    source:clone(navigation.source||previous?.source||recordSource()),returnFocus,propertyListFocus };
  const root = document.querySelector("#editor-root");
  root.innerHTML = result.html;
  // New records open immediately in editing mode; existing records open in Visa.
  syncEditorFrame(!id);
  const typeSelect=root.querySelector('[data-assignment-type]');
  if(typeSelect)typeSelect.onchange=()=>{
    const type=typeSelect.value,collection=globalThis.LokalblickResponsibility.types[type];
    const items=data[collection]||[];
    root.querySelector('[data-assignment-target]').innerHTML='<option value="">Välj post</option>'+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.number||x.title||x.designation||x.id)}</option>`).join('');
  };
  root.querySelector('#edit-form')?.insertAdjacentHTML('beforeend',fieldHistory(data,col,result.record,ui.view!=='budget'&&col==='activities'?importSchemas:globalThis.LokalblickSourceService.schemas));
  const form=root.querySelector("#edit-form");
  // New property/object/contract forms previously had no edit-state class,
  // so the perimeter disappeared when the observer refreshed the DOM.
  if(form&&!id)form.classList.add("editor-editing");
  if(form&&id&&!form.querySelector("[data-editor-activate]")){
    const closeButton=form.querySelector("[data-editor-close]");
    if(closeButton){
      const editButton=document.createElement("button");
      editButton.type="button";
      editButton.dataset.editorActivate="";
      editButton.className="editor-activate";
      editButton.textContent="Redigera";
      closeButton.before(editButton);
    }
  }
  const footer=form?.querySelector(".editor-actions");
  if(footer){
    const save=footer.querySelector('button[type="submit"]');
    const undo=save?document.createElement("button"):null;
    if(save){
      undo.type="button";
      undo.dataset.editorUndo="";
      undo.textContent="Ångra";
      save.before(undo);
    }
    const status=document.createElement("span");
    status.className="editor-save-status";
    status.dataset.editorSaveStatus="";
    status.setAttribute("role","status");
    if(col==="activities"&&form.querySelector(".issue-heading-actions")){
      // The same header holds actions in both modes; move the original buttons.
      const controls=form.querySelector(".issue-heading-actions");
      if(save)controls.prepend(undo,save);
      controls.appendChild(status);
    } else footer.prepend(status);
  }
  if(form&&ui.view!=="budget"){
    editor.workspace=mountWorkspace(root,{data:()=>data,collection:col,id,selection:editor.selection,source:editor.source,canEdit:canEdit(),showMaintenance:ui.view!=='budget',saved:navigation.saved});
    if(navigation.tab||navigation.editing)editor.workspace?.setTab(navigation.tab||'info');
    form.querySelector(':scope > .section-title')?.insertAdjacentHTML('beforebegin',recordBreadcrumb(data,col,result.record,trail));
  }
  if(col==="activities"&&ui.view!=="budget"){
    mountCompactIssue(root,{isNew:!id,issue:result.record});
    mountMaintenanceCompletion(form,data,result.record);
    form.querySelector('.issue-main-section')?.insertAdjacentHTML('afterend',maintenanceIssueContext(data,id));
  }
  if(form){
    if(col!=="activities")prepareEditorModeFields(form);
    editor.initialSnapshot=editorSnapshot(form);
    root.addEventListener("input",updateEditorActions);
    root.addEventListener("change",updateEditorActions);
    updateEditorActions();
    if(id)setEditorReadMode(!(navigation.editing&&ui.view!=="budget"));
  }
  document.body.classList.add("editing");
  if (col === "properties"&&(!editor.workspace||editor.workspace.state.tab==="info")) {
    propertyMapCleanup = attachPropertyMap(root, data, result.record, globalThis.LokalblickMapService);
  }
  if(navigation.saved&&!editor.workspace)root.querySelector('.editor').scrollTop=navigation.saved.scroll||0;
  // Preserve scroll and keyboard state when opening any existing record.
}
function openPropertyPersonDialog(button) {
  if (!editor || editor.col !== "properties") return;
  const kind=button.dataset.personNew || button.dataset.personEdit;
  if (!["owner","our","contract"].includes(kind)) return;
  const contractId=button.dataset.contractId || "";
  const root=document.querySelector("#editor-root");
  const select=contextPersonSelect(root,kind,contractId);
  if (!select) return;
  const creating=Boolean(button.dataset.personNew);
  const existing=creating ? null : data.people.find(person=>person.id===select.value);
  if (!creating && !existing) throw Error("Välj först en person att redigera.");
  const original=existing || newPersonDefaults(root,data,kind,contractId);
  const dialog=document.createElement("dialog");
  dialog.className="property-person-dialog";
  dialog.innerHTML=personFormHtml(original,creating,data);
  document.body.append(dialog);
  dialog.addEventListener("close",()=>dialog.remove(),{once:true});
  dialog.querySelectorAll("[data-person-dialog-close]").forEach(b=>b.onclick=()=>dialog.close());
  const form=dialog.querySelector("#property-person-form");
  form.addEventListener("submit",event=>{
    event.preventDefault();
    run(async()=>{
      const next=updatedPersonRecord(original,new FormData(form));
      const email=String(next.email||"").trim().toLocaleLowerCase("sv");
      if (email && data.people.some(p=>p.id!==next.id &&
          String(p.email||"").trim().toLocaleLowerCase("sv")===email))
        throw Error("Det finns redan en person med den e-postadressen. Välj den befintliga personen i stället.");
      if (creating) next.id=crypto.randomUUID();
      await mutation(d=>{
        if (creating) d.people.push(next);
        else {
          const i=d.people.findIndex(p=>p.id===next.id);
          if (i<0) throw Error("Personen finns inte längre.");
          d.people[i]={...d.people[i],name:next.name,role:next.role,phone:next.phone,email:next.email,organizationId:next.organizationId};
        }
      });
      refreshPropertyPersonSelectors(root,data,{kind,contractId,id:next.id});
      dialog.close();
      notice("Person sparad i personregistret. Kontaktkopplingen sparas när du sparar Fastighet.");
    });
  });
  dialog.showModal();
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
  if (["connect", "refresh", "blank", "new-clean"].includes(action) && !approveReplace())
    return;
  let result;
  if(action === "new-clean")data=await transport.startClean();
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
      updateImportProgress(progressDialog,{message:"Läser valda kolumner och föreslår fält…"});
      await new Promise(resolve=>setTimeout(resolve,0));
      const cleanImport = !transport.company() && (data.isDemo || transport.cleanActive());
      const mappingPrepared = await globalThis.LokalblickSourceService.prepareMapping(base, selectedSheets,{reviewed:true,...(cleanImport?{schemas:importSchemas}:{})});
      if(progressDialog?.open)progressDialog.close();
      progressDialog?.remove();progressDialog=null;
      result = await previewImport(mappingPrepared, base,
        cleanImport?importSchemas:globalThis.LokalblickSourceService.schemas, actor(),
        cleanImport?createCleanEvaluator(mappingPrepared.workbook,transport.canonical(),{fileName:mappingPrepared.fileName,actor:data.isDemo?'Excelimport':actor()}):null);

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
      }

      const cityWarning = cityResult.skipped
        ? " " + cityResult.skipped + " fastigheter saknar fortfarande ort och geokodas inte förrän ort kompletterats."
        : "";
      progressDialog = showImportProgress(prepared.fileName, selectedSheets);
      progressDialog.querySelector('h2').textContent="Sparar import";
      progressDialog.querySelector('.import-progress-hint').textContent="Resultatet sparas i arbetsytan. Exceloriginalet ändras inte.";
      updateImportProgress(progressDialog,{message:"Sparar godkända uppgifter och kopplingar…"});
      await new Promise(resolve=>setTimeout(resolve,0));
      const retained = result.clean?{data:await transport.cleanImport(result),mode:transport.status().connected?'connected':'staged'}:transport.company()?{data:await transport.commitImport(result),mode:"connected"}:await retainImportedData(
        result.data, transport,
        globalThis.LokalblickViewBridge,
        globalThis.LokalblickSourceService,
      );
      data = normalize(retained.data);
      notice(
        "Excel inläst från " + selectedSheets.length + " flik(ar). " +
        (retained.mode === "connected"
          ? "Resultatet är inläst i arbetsytan."
          : "All tidigare inläst data ligger kvar. Välj Spara som Lokalblick-data när du är klar.") +
        " Granska eventuella konflikter." + cityWarning,
      );
    } finally {
      if (progressDialog?.open) progressDialog.close();
      globalThis.LokalblickSourceService?.discardPreparedImport?.();
      progressDialog?.remove();
      busy = false;
    }
    startGeoEnrichment();
  } else if (["enrich", "operational", "index", "supplement"].includes(action)) {
    result = await transport[action](
      data,
      document.querySelector("#supplement-kind")?.value,
    );
    data = transport.company()?await transport.commitImport(result):await transport.save(result.data);
    notice(
      "Underlaget läst. Granska matchningar och konflikter innan du sparar arbetsfilen.",
    );
  } else notice("Datakopplingen uppdaterad");
  data = normalize(data);
  selection.propertyId = "";
  ui.contractId = "";
  render();
}
document.addEventListener("keydown", event => {
  if (event.key!=="Enter" && event.key!==" ")return;
  const target=event.target.closest("svg [data-dashboard-group],svg [data-dashboard-property]");
  if(!target)return;
  event.preventDefault();
  target.dispatchEvent(new MouseEvent("click",{bubbles:true}));
});
document.addEventListener("click", (event) =>
  run(async () => {
    const group=event.target.closest("[data-dashboard-group]");
    const property=event.target.closest("[data-dashboard-property]");
    if (ui.view==="overview" && property?.dataset.dashboardProperty) {
      openEditor("properties",property.dataset.dashboardProperty); return;
    }
    if (ui.view==="overview" && group?.dataset.dashboardGroup) {
      const mode=group.dataset.dashboardGroupMode;
      if(["person","unit","owner"].includes(mode)) {
        ui.dashboardMode=mode;
        for(const key of ["person","unit","owner"])selection[key]=key===mode?group.dataset.dashboardGroup:"";
        render(); return;
      }
    }
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    if(b.dataset.maintInspection){
      const inspection=data.inspections.find(row=>row.id===b.dataset.maintInspection);if(!inspection||!closeEditor())return;
      maintenanceState.objectId=inspection.objectId||'';maintenanceState.propertyId=inspection.propertyId||data.objects.find(row=>row.id===inspection.objectId)?.propertyId||'';
      maintenanceState.inspectionId=inspection.id;maintenanceState.historical=true;maintenanceState.q='';maintenanceState.filter='all';maintenanceState.open=b.dataset.spaceId?[b.dataset.spaceId]:[];ui.view='maintenance';render();return;
    }
    if(b.dataset.maintenanceRecord){
      if(!closeEditor())return;
      maintenanceState.objectId=b.dataset.maintenanceRecord==='objects'?b.dataset.id:'';
      maintenanceState.propertyId=maintenanceState.objectId?data.objects.find(row=>row.id===maintenanceState.objectId)?.propertyId||'':b.dataset.id;
      maintenanceState.inspectionId='';maintenanceState.historical=false;maintenanceState.q='';maintenanceState.open=[];maintenanceState.filter='all';ui.view='maintenance';render();return;
    }
    if(b.hasAttribute("data-issue-expand")){toggleIssueText(b);return;}
    if(handleEditorCommand(b,{editor,data,openEditor,closeEditor,setEditorReadMode,hasUnsavedEditorChanges,refreshPropertyMap:tab=>{
      if(propertyMapCleanup){propertyMapCleanup();propertyMapCleanup=null;}
      if(editor.col==="properties"&&tab==="info")propertyMapCleanup=attachPropertyMap(document.querySelector("#editor-root"),data,editor.record,globalThis.LokalblickMapService);
    }}))return;

    if (b.hasAttribute("data-dashboard-mode")) {
      const next=b.dataset.dashboardMode;
      if(!["person","unit","owner"].includes(next))return;
      ui.dashboardMode=ui.dashboardMode===next?"":next;
      for(const key of ["person","unit","owner"])selection[key]="";
      render(); return;
    }
    if (b.hasAttribute("data-dashboard-clear")) {
      for(const key of ["person","unit","owner"])selection[key]="";
      render(); return;
    }
    if (b.hasAttribute("data-activity-journal-save")) {
      const id=b.dataset.activityId;
      if(!editor||editor.col!=="activities"||String(editor.id)!==String(id))throw Error("Öppna ärendet på nytt.");
      const noteField=b.closest(".activity-journal")?.querySelector("[data-activity-journal-note]");
      const note=noteField?.value||"";
      if(!String(note).trim())throw Error("Skriv en notering innan du sparar.");
      if(note.trim().length>5000)throw Error("Noteringen är för lång (max 5 000 tecken).");
      if(editorSnapshot(editorForm())!==editor.initialSnapshot)
        throw Error("Du har även osparade fältändringar. Välj Spara ärende för att spara både noteringen och ändringarna tillsammans.");
      await mutation(d=>{
        appendActivityNote(d,id,note,{
          name:actor(),
          id:d.currentUser?.id||d.currentUser?.userId||"",
          verified:false // The existing app cannot prove a user's identity from a typed name.
        });
      });
      const panel=document.querySelector("#edit-form .activity-journal");
      if(panel)panel.outerHTML=activityJournalHtml(data,id,{editable:true});
      compactIssueJournal(editorForm());
      if(editor?.id)setEditorReadMode(editor.readOnly);
      updateEditorActions();
      return;
    }
    if (b.hasAttribute("data-open-activity-journal")) {
      const id=b.dataset.openActivityJournal;
      openEditor("activities",id);
      const journal=document.querySelector("#edit-form #activity-journal");
      if(journal){
        const compose=journal.querySelector('.issue-note-compose');
        if(compose)compose.open=true;
        journal.scrollIntoView({behavior:"smooth",block:"nearest"});
        journal.querySelector("[data-activity-journal-note]")?.focus({preventScroll:true});
      }
      return;
    }

    if (b.hasAttribute("data-plan-month")) {
      if(!canEdit())throw Error("Datakällan är skrivskyddad.");
      const id=b.dataset.planIssue,key=b.dataset.planMonth;
      if(!pendingPlanSelection || pendingPlanSelection.id!==id){
        pendingPlanSelection={id,start:key};
        content.querySelectorAll("[data-plan-month].is-pending").forEach(button=>button.classList.remove("is-pending"));
        b.classList.add("is-pending");
        const hint=content.querySelector(".planning-timeline-help");
        if(hint)hint.textContent="Startmånad "+key+" vald. Klicka på slutmånaden i samma ärenderad för att spara perioden.";
        return;
      }
      const first=pendingPlanSelection.start;
      pendingPlanSelection=null;
      await mutation(d=>{
        const item=(d.activities||[]).find(a=>String(a.id)===String(id));
        if(!item)throw Error("Ärendet finns inte längre.");
        const before=clone(item),next=planActivityPeriod(item,first,key);
        Object.assign(item,{startDate:next.startDate,endDate:next.endDate,planningYear:next.planningYear,
          planningMonths:next.planningMonths,planningMonth:next.planningMonth,planningQuarter:next.planningQuarter});
        audit(d,"activities",item.id,before,item,actor());
      });
      return;
    }
    if (b.hasAttribute("data-issue-plan-span")) {
      const planner=b.closest("[data-issue-planner]");
      if(planner){
        planner.dataset.planSpan=b.dataset.issuePlanSpan==="3"?"3":"1";
        const form=planner.closest("form");
        delete form.dataset.pendingPlanMonth;
        redrawFormPlanning(form);
      }
      return;
    }
    if (b.hasAttribute("data-form-plan-month")) {
      const form=b.closest('form[data-collection="activities"]');
      if(!form)return;
      const key=b.dataset.formPlanMonth;
      if(!form.dataset.pendingPlanMonth){
        form.dataset.pendingPlanMonth=key;
        b.classList.add("is-pending");
        const hint=form.querySelector("[data-plan-hint]");
        if(hint)hint.textContent="Startmånad "+key+" vald. Välj slutmånad för att uppdatera datumen.";
        return;
      }
      const first=form.dataset.pendingPlanMonth;
      delete form.dataset.pendingPlanMonth;
      const draft=planActivityPeriod(currentFormPlanning(form),first,key);
      form.querySelector('[name="startDate"]').value=draft.startDate;
      form.querySelector('[name="endDate"]').value=draft.endDate;
      form.querySelector('[name="planningYear"]').value=String(draft.planningYear);
      form.dataset.planChanged="true";
      redrawFormPlanning(form);
      updateEditorActions();
      return;
    }
    if(b.dataset.optionAction){
      const kind=b.dataset.optionKind,action=b.dataset.optionAction,name=b.dataset.optionName||"";
      const section=b.closest("[data-activity-option-kind]");
      const newName=section?.querySelector('[data-option-new="'+kind+'"]')?.value?.trim()||"";
      const type=section?.querySelector('[data-option-new-scope="'+kind+'"]')?.value||"";
      const found=normalizeActivityOptions(data.activityOptions)[kind]?.find(x=>x.name===name);
      if(action==="delete"&&!confirm('Ta bort "'+name+'"? Alternativet får inte användas av något ärende.'))return;
      await mutation(d=>{
        const before={values:clone(normalizeActivityOptions(d.activityOptions)[kind])};
        changeActivityOption(d,{kind,action,name,newName,type,active:!found?.active,direction:Number(b.dataset.optionDirection)||1});
        audit(d,"activityOptions",kind,before,{values:d.activityOptions[kind]},actor());
      });
      return;
    }
    if (b.dataset.tool) document.getElementById(b.dataset.tool)?.click();
    if(await handleNavigation(b,{ui,selection,clearPlanning:()=>{pendingPlanSelection=null;},render,openEditor,loadBudgetIndex,loadOfficialPriceBase}))return;

    if (b.hasAttribute("data-new-issue")) {
      const type = activityChoices(data,"type").some(x=>x.value===ui.issueType) ? ui.issueType : "";
      openEditor("activities","",{
        type,
        title:"",
        status:activityChoices(data,"status").some(x=>x.value==="Nytt")?"Nytt":activityChoices(data,"status")[0]?.value||"",
        planningYear:ui.year,
        budgetCategory:{Projekt:"Projekt",Underhåll:"Underhåll",Drift:"Driftkostnader",Önskemål:"Ej budget"}[type]||"Ej budget",
        includeInBudget:type==="Önskemål"?"Nej":"Ja",
        propertyId:selection.propertyId||"",
      });
      return;
    }

    if (b.hasAttribute("data-close-contract")) {
      ui.contractId = "";
      render();
    }
    if (b.hasAttribute("data-person-new") || b.hasAttribute("data-person-edit")) {
      openPropertyPersonDialog(b);
      return;
    }
    if(b.hasAttribute("data-new-object"))openEditor("objects","",{propertyId:selection.propertyId||"",start:"",end:"",predecessorIds:[]});
    if(b.dataset.objectContract){openEditor("contracts",b.dataset.objectContract);return;}
    if(b.matches('[data-item-new],[data-item-edit],[data-cost-new],[data-cost-edit],[data-cost-evidence]')){
      if(!canEdit())throw Error('Denna anslutning är skrivskyddad');
      if(hasUnsavedEditorChanges())throw Error('Spara eller ångra formuläret först.');
      const col=editor?.col,id=editor?.id,saved=editor?.workspace?.capture(),financeYear=Number(b.closest('[data-cost-panel]')?.dataset.costPanelYear)||new Date().getFullYear();
      const save=collection=>async next=>{await mutation(d=>{if(collection==='agreementItems')adoptAgreementItems(d,next.contractId);const rows=d[collection]||(d[collection]=[]),index=rows.findIndex(x=>x.id===next.id);if(index<0)rows.push(next);else rows[index]=next;});if(col&&id){openEditor(col,id,{}, {saved});if(col==='properties'){const panel=editorForm()?.querySelector('[data-cost-panel]');if(panel){panel.outerHTML=propertyCostsPanel(data,id,financeYear);setEditorReadMode(true);}}}};
      if(b.matches('[data-item-new],[data-item-edit]'))openItemDialog(data,b.dataset.itemNew||b.dataset.itemContract,b.dataset.itemEdit,save('agreementItems'));
      else if(b.hasAttribute('data-cost-evidence'))openEvidenceDialog(data,b.dataset.costEvidence,financeYear,save('costEvidence'));
      else openPropertyCostDialog(data,b.dataset.costEdit,b.dataset.costNew,financeYear,save('recurringCosts'));
      return;
    }
    if (b.hasAttribute("data-new-recurring-cost") || b.hasAttribute("data-recurring-cost")) {
      if (!canEdit()) throw Error("Denna anslutning är skrivskyddad");
      openRecurringCostDialog(data, b.dataset.recurringCost || "", ui.year, selection.propertyId,
        next => mutation(d => {
          if(d.cleanModel)applyLegacyCostEdit(d,next,ui.year);
          else {const rows=d.recurringCosts||(d.recurringCosts=[]),index=rows.findIndex(x=>x.id===next.id);if(index<0)rows.push(next);else rows[index]=next;}
          globalThis.LokalblickRecurringCosts.validateCosts(d);
        }));
      return;
    }

    if (b.dataset.planningMode) {
      pendingPlanSelection=null;
      ui.planningMode = b.dataset.planningMode === "timeline" ? "timeline" : "list";
      render();
      return;
    }
    if (b.dataset.timelineSpan) {
      pendingPlanSelection=null;
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
      const card=b.closest(".review");
      const target=card?.querySelector('input[data-review-target]:checked')?.value
        ||card?.querySelector('select[data-review-target]')?.value||"";
      const item=(data.importReview||[]).find(x=>x.id===b.dataset.review);
      if(b.dataset.decision==="accept"&&
        ["match","property-match","activity-property","record","mapped-identity"].includes(item?.kind)&&!target)
        throw Error("Välj först en relevant post. Du kan också söka på adress eller avtalsnummer.");
      await mutation(d=>resolveReview(d,b.dataset.review,b.dataset.decision,target,actor()));
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
      const col = ui.view === "contracts" ? "contracts" :
        ui.view === "properties" ? "properties" : "activities";
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
              type: activityChoices(data,"type").some(x=>x.value===ui.issueType) ? ui.issueType : "",
              budgetCategory: {Projekt:"Projekt",Underhåll:"Underhåll",Drift:"Driftkostnader",Önskemål:"Ej budget"}[ui.issueType]||"Ej budget",
              includeInBudget:ui.issueType==="Önskemål"?"Nej":"Ja",
              status: activityChoices(data,"status").some(x=>x.value==="Nytt")?"Nytt":activityChoices(data,"status")[0]?.value||"",
              planningYear: ui.year,
              propertyId: selection.propertyId || "",
            }
          : {},
      );
    }
    await handleBudgetAction(b,{getData:()=>data,ui,mutation,actor,render,
      showBudgetAdjustment,loadBudgetIndex,calc,clone});
  }),
);
document.addEventListener("input",event=>{
  if(event.target.matches("[data-review-search]")) {
    const input=event.target;
    const item=(data?.importReview||[]).find(x=>x.id===input.dataset.reviewSearch);
    const result=[...document.querySelectorAll("[data-review-search-results]")]
      .find(x=>x.dataset.reviewSearchResults===input.dataset.reviewSearch);
    if(item&&result)result.innerHTML=input.value.trim().length<2
      ? "<small>Ange minst två tecken för att söka.</small>"
      : reviewCandidateChoices(data,item,input.value);
    return;
  }
});
document.addEventListener("change", (event) =>
  run(async () => {
    const x = event.target;
    if(x.hasAttribute('data-cost-year')){x.closest('[data-cost-panel]').outerHTML=propertyCostsPanel(data,x.dataset.costYear,Number(x.value));setEditorReadMode(editor.readOnly);return;}
    if(x.dataset.optionScope!==undefined){
      const kind=x.dataset.optionKind,name=x.dataset.optionName;
      await mutation(d=>{
        const previous={values:clone(normalizeActivityOptions(d.activityOptions)[kind])};
        changeActivityOption(d,{kind,action:"scope",name,type:x.value});
        audit(d,"activityOptions",kind,previous,{values:d.activityOptions[kind]},actor());
      });
      return;
    }
    if(x.name==="type"&&x.closest('form[data-collection="activities"]')){
      const form=x.closest("form"),category=form.querySelector('[name="category"]');
      if(category){
        const old=category.value;
        const items=activityChoices(data,"category",{type:x.value,current:old});
        category.innerHTML='<option value="">Välj kategori</option>'+items.map(c=>'<option value="'+esc(c.value)+'"'+(c.value===old?' selected':'')+'>'+esc(c.label)+'</option>').join("");
      }
      updateEditorActions();
      return;
    }
    if (x.matches('select[data-contract-rule]')) {
      const area=x.closest(".contract-section,.contract-additions");
      const method=x.value;
      area?.querySelectorAll('[data-rule-for="'+x.dataset.contractRule+'"]').forEach(node=>{
        const role=node.dataset.ruleShow;
        node.hidden=!(role==="kpi"&&["kpi","kpi-limited"].includes(method)||
          role==="fixed"&&method==="fixed"||role==="limits"&&method==="kpi-limited");
      });
      updateEditorActions();
      return;
    }
    if (x.closest('form[data-collection="activities"]') && ["startDate","endDate","planningYear"].includes(x.name)) {
      delete x.closest("form").dataset.pendingPlanMonth;
      redrawFormPlanning(x.closest("form"));
      return;
    }
    if(x.name==='tenantPartyId'&&x.form?.getAttribute('id')==='edit-form')refreshPartyNumber(x.form,data,'tenantPartyId');
    if (x.hasAttribute("data-owner-select")) {
      refreshPartyNumber(x.form,data,'ownerPartyId');
      updatePropertyOwnerContacts(document.querySelector("#editor-root"), data);
      refreshPropertyPersonSelectors(document.querySelector("#editor-root"), data);
      return;
    }
    if (x.hasAttribute("data-property-person-select")) {
      const edit=x.closest('.property-person-field,.property-person-inline')?.querySelector("[data-person-edit]");
      if (edit) edit.disabled=!x.value;
      return;
    }
    if (x.hasAttribute("data-plan-budget-include") || x.hasAttribute("data-plan-rent-start")) {
      const isBudget=x.hasAttribute("data-plan-budget-include");
      const id=isBudget?x.dataset.planBudgetInclude:x.dataset.planRentStart;
      if(isBudget && !["Ja","Nej"].includes(x.value))throw Error("Ogiltigt budgetval.");
      if(!isBudget && x.value && !/^\d{4}-\d{2}-\d{2}$/.test(x.value))throw Error("Ange ett giltigt startdatum.");
      await mutation(d=>{
        const activity=(d.activities||[]).find(a=>String(a.id)===String(id));
        if(!activity)throw Error("Ärendet finns inte längre.");
        if(isBudget)activity.includeInBudget=x.value;
        else activity.rentSurchargeStartDate=x.value;
      });
      const panel=document.querySelector(".plan-budget-settings");
      if(panel)panel.open=true;
      return;
    }
    if (x.dataset.contextFilter&&editor?.workspace) {editor.workspace.apply(x.dataset.contextFilter,x.value);return;}
    if (x.dataset.portfolioIssue) {if(x.dataset.portfolioIssue==='type')ui.issueType=x.value||'Alla';else issueFilters[x.dataset.portfolioIssue]=x.value||(x.dataset.portfolioIssue==='status'?'open':'');render();return;}
    if(x.dataset.portfolioSearchView){
      const sourceView=x.dataset.portfolioSearchView;
      searches[sourceView]=x.value;
      selection.q=x.value;
      // A native change may arrive while its old view is being removed on blur.
      // Defer replacement and retain the query's original working view.
      if(isPortfolioView()&&portfolioLocal().view===sourceView)queueMicrotask(()=>run(render));
      return;
    }
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
      await loadBudgetIndex(ui.year);
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
        if (!activity) throw Error(ui.view==="budget"?"Aktiviteten saknas":"Ärendet saknas");
        const year = Number(x.dataset.allocationYear);
        if (!Number.isInteger(year) || year < 2000 || year > 2200) throw Error("Ogiltigt budgetår");

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
    if (x.hasAttribute("data-preliminary")) {
      if(x.dataset.skipResetChange==="1"){delete x.dataset.skipResetChange;return;}
      await mutation(d=>{
        let plan=d.budgetPlans.find(p=>Number(p.year)===ui.year);
        if(plan?.status==='Låst')throw Error('Skapa en ny budgetversion först');
        const raw=x.value.trim(),value=raw===''?0:Number(raw);
        if(!Number.isFinite(value)||value<0||(raw!==''&&value===0))throw Error('Ange ett positivt index eller lämna tomt');
        if(!plan){plan={year:ui.year,status:'Arbetsbudget',createdAt:new Date().toISOString(),adjustments:{},lines:[],notes:{}};d.budgetPlans.push(plan);}
        plan.preliminaryIndex=value;
        plan.preliminaryIndexUpdatedAt=new Date().toISOString();plan.preliminaryIndexUpdatedBy=actor();
        plan.targets=calc().summarize(calc().budgetProposal(d,ui.year));
      });
      return;
    }
    if (x.dataset.adjust)
      await mutation((d) => {
        const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!plan || plan.status === "Låst") throw Error("Budgeten är låst");
        plan.adjustments ||= {};
        plan.adjustments[x.dataset.adjust]=Number(x.value)||0;
        plan.targets=calc().summarize(calc().budgetProposal(d,ui.year,{strict:true}));
      });
  }),
);
// Tapping reset must not first persist the unfinished input on blur.
document.addEventListener("pointerdown",event=>{
  if(!event.target.closest?.("[data-budget-index-reset]"))return;
  const field=content.querySelector("[data-preliminary]");
  if(field)field.dataset.skipResetChange="1";
},true);
document.addEventListener("input",event=>{
  const field=event.target.closest?.("[data-preliminary]");
  if(!field||ui.view!=="budget")return;
  try{previewBudgetIndex(field);}
  catch(error){
    const label=content.querySelector("[data-budget-index-live]");
    if(label)label.textContent="Förhandsberäkningen kunde inte visas: "+error.message;
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.getAttribute("id") !== "edit-form") return;
  event.preventDefault();
  run(async () => {
    if(editor?.readOnly)throw Error(ui.view==="budget"?"Tryck på Redigera innan du ändrar och sparar.":"Aktivera redigering med pennan innan du sparar.");
    const next = readEditor(event.target, editor.record),
      col = editor.col,
      id = editor.id,
      contractContactChanges = col === "properties"
        ? [...event.target.querySelectorAll("[data-property-contract-contact]")].map(select=>({
          contractId:select.dataset.propertyContractContact,personId:select.value
        })) : [],
      manualPositionSelected = col === "properties" && event.target.dataset.manualGeoSelected === "1";
    if (col==="activities" && (event.target.dataset.planChanged==="true" ||
        String(next.startDate||"")!==String(editor.record.startDate||"") ||
        String(next.endDate||"")!==String(editor.record.endDate||""))) {
      next.planningMonths=[];
      next.planningMonth=null;
      next.planningQuarter=null;
    }
    if (manualPositionSelected && !data.cleanModel) {
      next.geoSource="manual";
      next.geoConfirmedAt=new Date().toISOString();
      next.geoConfirmedBy=actor();
    }
    if(col==='activities'&&ui.view!=='budget')prepareMaintenanceCompletion(data,next,editor.record);
    if(col==='contracts'&&!next.objectId)throw Error('Välj vilket objekt avtalet tillhör');
    if(col==='contracts'){delete next.area;delete next.apartmentArea;delete next.commonArea;delete next.objectAreaManaged;delete next.business;delete next.businessComment;}
    const noteDraft=col==="activities"?String(event.target.querySelector("[data-activity-journal-note]")?.value||"").trim():"";
    await mutation((d) => {
      applyLinkedPartyNumber(d,col,next,actor());
      if (!id) {
        next.id = col==='activities'&&ui.view!=='budget'?nextIssueId(d.activities,d.settings ||= {}):d.cleanModel&&['contracts','objects'].includes(col)?String(next.id||'').trim():crypto.randomUUID();
        if(!next.id)throw Error(col==='contracts'?'Ange AvtalsID (avtalsnumret).':'Ange ObjektID.');
        if(d[col].some(row=>row.id===next.id))throw Error('ID finns redan. Välj den befintliga posten.');
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
      if(col==='contracts'&&(d.cleanModel||Array.isArray(editor.record.items))&&ui.view==='budget')applyContractFinanceEdit(d,editor.record,next);
      if (col === "properties" && id) {
        contractContactChanges.forEach(({contractId,personId})=>{
          const contract=d.contracts.find(x=>x.id===contractId && x.propertyId===id);
          if (!contract) throw Error("Ett avtalsobjekt saknas. Läs om fastigheten och försök igen.");
          if (personId && !d.people.some(p=>p.id===personId)) throw Error("Vald person saknas i personregistret.");
          contract.tenantResponsiblePersonId=personId || "";
        });
      }
      // Saving the case also saves any unsent note in the same transaction.
      if(noteDraft)appendActivityNote(d,next.id,noteDraft,{
        name:actor(),id:d.currentUser?.id||d.currentUser?.userId||"",verified:false
      });
    }, { responsibilityDate:event.target.elements.namedItem('responsibilityChangeDate')?.value,manualPositionIds:manualPositionSelected && id ? [String(id)] : [] });
    closeEditor({force:true});
  });
});
window.addEventListener("beforeunload", (event) => {
  if (!switchingView && (hasPending() || hasUnsavedEditorChanges())) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !document.querySelector(".property-person-dialog[open]")) closeEditor();
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
