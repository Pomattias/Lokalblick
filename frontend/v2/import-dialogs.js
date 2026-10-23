// Import selection, missing-city questions and progress display. No persistence.
import {esc} from "./view-format.js";
export function createImportDialogs({sourceService,actor}){
function importCountLabel(counts = {}) {
  const parts = [];
  if (counts.properties != null) parts.push("Fastigheter " + counts.properties);
  if (counts.contracts != null) parts.push("Avtal " + counts.contracts);
  if (counts.activities != null) parts.push("Ärenden " + counts.activities);
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
          `<label class="import-sheet"><input type="checkbox" data-import-sheet value="${esc(sheet.name)}" ${sheet.recommended ? "checked" : ""}><span><strong>${esc(sheet.sheetName||sheet.name)}</strong><small>${esc(sheet.fileName||"")} · ${esc(sheet.kind || "Övrig flik")} · ${sheet.rows??0} datarader</small>${sheet.financialColumns?.length?`<small>Hyreskolumner: ${esc(sheet.financialColumns.join(", "))}</small>`:""}</span></label>`,
      )
      .join("");
    d.innerHTML = `<div class="import-dialog-head"><div><span class="eyebrow">EXCELIMPORT</span><h2>Välj flikar att läsa</h2><p><strong>${esc(prepared.fileName)}</strong></p></div></div><p>Lokalblick har hittat ${(prepared.sheets || []).length} flikar. Flikar som känns igen på namn eller avtals- och hyreskolumner är förvalda. Välj de flikar som hör ihop. Vi tolkar kolumnerna och sammanför fastigheter, objekt och avtal innan något sparas.</p><div class="import-sheet-tools"><button type="button" data-import-select="recommended">Föreslagna</button><button type="button" data-import-select="all">Markera alla</button><button type="button" data-import-select="none">Avmarkera alla</button></div><div class="import-sheet-list">${rows}</div><div class="actions import-dialog-actions"><button type="button" data-import-cancel>Avbryt</button><button type="button" class="primary-action" data-import-start>Tolka och koppla underlagen</button></div>`;
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
  const service = sourceService();
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
return {chooseImportSheets,askMissingCity,showImportProgress,updateImportProgress};
}
