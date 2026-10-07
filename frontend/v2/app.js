import {
  collections,
  normalize,
  clone,
  scope,
  audit,
  assign,
  moveWish,
  resolveReview,
} from "./model.js";
import { createTransport } from "./transport.js";
import {
  esc,
  money,
  filters,
  summary,
  overview,
  planning,
  budget,
  sources,
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
  busy = false;
const selection = { unit: "", owner: "", person: "", q: "", propertyId: "" };
const ui = {
  view: "overview",
  perspective: "Fastigheter",
  year: new Date().getFullYear() + 1,
  contractId: "",
  unassigned: false,
};
const labels = {
  overview: "Översikt",
  contracts: "Avtal",
  plan: "Planera",
  budget: "Budget",
  map: "Karta",
  sources: "Datakällor",
  people: "Parter",
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
function canEdit() {
  const st = transport.status();
  if (st.sourceKind === "migration") return false;
  if (data.isDemo || (!transport.company() && st.connected)) return true;
  const user = data.currentUser;
  return (
    transport.company() &&
    (!user ||
      user.canEdit ||
      user.isAdmin ||
      /admin|edit/i.test(user.role || ""))
  );
}
function render() {
  document.querySelector("#history").onclick=()=>showHistory();
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
  document.querySelector("#summary").innerHTML = ["sources", "people"].includes(
    ui.view,
  )
    ? ""
    : summary(
        data,
        selection,
        ui.view === "budget" || ui.view === "plan"
          ? ui.year
          : new Date().getFullYear(),
      );
  const st = transport.status();
  document.querySelector("#source-label").textContent = data.isDemo
    ? "Syntetisk demo"
    : st.fileName || data.sourceName || "Ansluten data";
  document.querySelector("#save").hidden = transport.company() || !st.dirty;
  document.querySelector("#save").textContent =
    `Spara till Excel (${st.pendingChanges?.length || 0})`;
  document.querySelector("#context").innerHTML = selection.propertyId
    ? `<button data-clear-property>Hela urvalet</button><span>${esc(data.properties.find((p) => p.id === selection.propertyId)?.address || selection.propertyId)}</span>`
    : "<span>Portfölj</span>";
  filterArea.hidden = ["sources", "people"].includes(ui.view);
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
        "[data-edit],[data-assign],[data-quarter],[data-move],[data-review],[data-adjust],[data-preliminary],[data-budget-create],[data-budget-lock]",
      )
      .forEach((x) => (x.disabled = true));
  document.querySelector("#add").hidden =
    !canEdit() || !["overview", "contracts"].includes(ui.view);
}
async function mutation(change) {
  if (busy) throw Error("En ändring sparas redan");
  if (!canEdit()) throw Error("Denna anslutning är skrivskyddad");
  requireActorIdentity();
  const before = clone(data);
  busy = true;
  try {
    change(data);
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
  return transport.status().dirty;
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
  if (action === "connect") data = await transport.connect();
  if (action === "create" || action === "blank")
    data = await transport.create(data, action === "blank");
  if (action === "refresh") data = await transport.refresh();
  if (["enrich", "operational", "index", "supplement"].includes(action)) {
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
      render();
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
    if (b.hasAttribute("data-unassigned")) {
      ui.unassigned = !ui.unassigned;
      render();
    }
    if (b.dataset.move)
      await mutation((d) => moveWish(d, b.dataset.id, b.dataset.move, actor()));
    if (b.dataset.review) {
      const target = document.querySelector(
        `[data-review-target="${CSS.escape(b.dataset.review)}"]`,
      )?.value;
      await mutation((d) =>
        resolveReview(d, b.dataset.review, b.dataset.decision, target, actor()),
      );
    }
    if (b.dataset.source) await sourceAction(b.dataset.source);
    if (b.id === "save") {
      if (transport.status().mode !== "readwrite")
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
        const lines = calc().budgetRows(d, ui.year);
        d.budgetPlans.push({
          year: ui.year,
          status: "Arbetsbudget",
          createdAt: new Date().toISOString(),
          preliminaryIndex: 0,
          lines,
          targets: calc().summarize(lines),
          notes: {},
        });
      });
    if (b.hasAttribute("data-budget-lock") && confirm('Lås budget '+ui.year+' som baslinje?'))
      await mutation((d) => {
        const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!plan || plan.status === "Låst") return;
        plan.status = "Låst";
        plan.lockedAt = new Date().toISOString();
        plan.lockedBy = actor();
      });
  }),
);
document.addEventListener("change", (event) =>
  run(async () => {
    const x = event.target;
    if (x.dataset.filter) {
      selection[x.dataset.filter] = x.value;
      render();
      return;
    }
    if (x.hasAttribute("data-year")) {
      ui.year = Math.max(2000, Math.min(2200, Number(x.value) || ui.year));
      render();
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
        const previous = calc().summarize(plan.lines),
          adjust = Object.fromEntries(
            categories.map((k) => [
              k,
              (Number(plan.targets[k]) || 0) - (previous[k] || 0),
            ]),
          );
        plan.preliminaryIndex = Math.max(0, Number(x.value) || 0);
        plan.lines = calc().budgetRows(d, ui.year);
        const amounts = calc().summarize(plan.lines);
        categories.forEach(
          (k) => (plan.targets[k] = (amounts[k] || 0) + adjust[k]),
        );
      });
    if (x.dataset.adjust)
      await mutation((d) => {
        const plan = d.budgetPlans.find((p) => Number(p.year) === ui.year);
        if (!plan || plan.status === "Låst") throw Error("Budgeten är låst");
        plan.targets[x.dataset.adjust] =
          (calc().summarize(plan.lines)[x.dataset.adjust] || 0) +
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
  if (hasPending() || editor) {
    event.preventDefault();
    event.returnValue = "";
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeEditor();
});
async function init() {
  try {
    if (!transport.company())
      await globalThis.LokalblickSourceService.restoreRemembered();
    data = await transport.load();
    render();
    notice("");
  } catch (error) {
    notice("Kunde inte läsa data: " + error.message, true);
  }
}
init();
