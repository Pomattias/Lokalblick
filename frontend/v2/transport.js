import { normalize, clone } from "./model.js";
const metadataKeys = [
  "budgetPlans",
  "indexSeries",
  "auditLog",
  "sourceRegistry",
  "importReview",
  "documents",
];
export function createTransport() {
  const source = () => window.LokalblickSourceService;
  const company = () =>
    window.LokalblickDataService.mode === "company-api" ||
    window.LokalblickDataService.mode === "m365-api";
  return {
    company,
    async load() {
      return normalize(await window.LokalblickDataService.load());
    },
    async save(data) {
      const payload = clone(data);
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
      return normalize(await window.LokalblickDataService.save(payload));
    },
    status() {
      return company()
        ? {
            connected: true,
            mode: "api",
            dirty: false,
            fileName: "Företagets backend",
          }
        : source().status();
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
      if (company())
        throw Error("Excelimport kräver en backendadapter i företagsläget");
      return source().prepareImportWorkbook(onProgress);
    },
    async importPrepared(data, selectedSheets, onProgress) {
      if (company())
        throw Error("Excelimport kräver en backendadapter i företagsläget");
      return source().importPreparedWorkbook(data, selectedSheets, onProgress);
    },
    async import(data, onProgress) {
      if (company())
        throw Error("Excelimport kräver en backendadapter i företagsläget");
      return source().importWorkbook(data, onProgress);
    },
    async enrich(data) {
      if (company())
        throw Error("Berikning kräver en backendadapter i företagsläget");
      return source().enrichContracts(data);
    },
    async operational(data) {
      if (company())
        throw Error("Operativ berikning kräver en backendadapter i företagsläget");
      return source().enrichOperational(data);
    },
    async supplement(data, key) {
      if (company())
        throw Error("Import kräver en backendadapter i företagsläget");
      return source().importSupplement(data, key);
    },
    async index(data) {
      if (company())
        throw Error("Indeximport kräver en backendadapter i företagsläget");
      return source().importIndexSeries(data);
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
