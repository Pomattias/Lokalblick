import { normalize, clone } from "./model.js";
const metadataKeys = [
  "budgetPlans",
  "indexSeries",
  "priceBaseAmounts",
  "priceBaseAmounts",
  "auditLog",
  "sourceRegistry",
  "importReview",
  "documents",
  "importMappings",
  "importFieldPreferences",
  "activityOptions",
];
export function createTransport() {
  const source = () => window.LokalblickSourceService;
  const company = () =>
    window.LokalblickDataService.mode === "company-api" ||
    window.LokalblickDataService.mode === "m365-api";
  let responsibilityBaseline;
  return {
    company,
    async load() {
      const loaded=normalize(await window.LokalblickDataService.load());responsibilityBaseline=clone(loaded);return loaded;
    },
    async save(data) {
      const payload = clone(data);
      globalThis.LokalblickBusinessModel.normalize(payload);
      globalThis.LokalblickBusinessModel.validate(payload,responsibilityBaseline);
      globalThis.LokalblickResponsibility.normalize(payload);
      globalThis.LokalblickResponsibility.validate(payload,responsibilityBaseline);
      if (company()) {
        payload.budgetData = (payload.budgetData || [])
          .filter((x) => x.id !== "lokalblick-v2-workspace")
          .concat([
            {
              id: "lokalblick-v2-workspace",
              workspace: Object.fromEntries(
                metadataKeys.map((k) => [k, payload[k]]),
              ),
            },
          ]);
      }
      const saved=normalize(await window.LokalblickDataService.save(payload));responsibilityBaseline=clone(saved);return saved;
    },
    status() {
      return company()
        ? {
            connected: true,
            mode: "api",
            dirty: false,
            fileName: "Företagets backend",
          }
        : {
            ...source().status(),
            staged: window.LokalblickDataService?.mode === "view-bridge" &&
              !source().status().connected,
          };
    },
    async write() {
      if (company()) throw Error("Denna anslutning sparas via API");
      return source().write();
    },
    async connect() {
      if (company()) throw Error("Datakällor hanteras av företagets backend");
      return normalize(await source().connect("read"));
    },
    async create(data, blank = false) {
      if (company()) throw Error("Arbetsfil hanteras av företagets backend");
      return normalize(await source().createFile(data, "readwrite", blank));
    },
    async prepareImport(onProgress) {
      return source().prepareImportWorkbook(onProgress,{multiple:true});
    },
    async importPrepared(data, selectedSheets, onProgress) {
      return source().importPreparedWorkbook(data, selectedSheets, onProgress);
    },
    async import(data, onProgress) {
      return source().importWorkbook(data, onProgress);
    },
    async enrich(data) {
      return source().enrichContracts(data);
    },
    async operational(data) {
      return source().enrichOperational(data);
    },
    async supplement(data, key) {
      return source().importSupplement(data, key);
    },
    async index(data) {
      return source().importIndexSeries(data);
    },
    async commitImport(result){
      const api=window.LokalblickDataService;
      if(!api.previewImport||!api.applyImport)throw Error('Företagsbackend behöver uppdateras för granskad import.');
      const preview=await api.previewImport({data:result.data,report:result.report,baseRevision:result.data.workspaceRevision});
      return normalize(await api.applyImport({previewId:preview.previewId}));
    },
    async refresh() {
      if (company()) {
        const r = await fetch("/api/source/refresh", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (!r.ok) throw Error("Uppdatering misslyckades");
        return normalize(await r.json());
      }
      return normalize(await source().reconnect());
    },
  };
}
