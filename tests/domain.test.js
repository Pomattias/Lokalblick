import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import XLSX from "xlsx";
import "../frontend/domain/calculations.js";
import "../frontend/domain/documents.js";
import {
  normalize,
  scope,
  responsible,
  assign,
  moveWish,
  resolveReview,
} from "../frontend/v2/model.js";
const C = globalThis.LokalblickCalculations;
function services() {
  const context = vm.createContext({
    window: {},
    crypto: webcrypto,
    XLSX,
    console,
    Date,
    Map,
    Set,
    URL,
    Uint8Array,
    TextDecoder,
    localStorage: {
      removeItem() {},
      getItem() {
        return null;
      },
      setItem() {},
    },
  });
  for (const file of [
    "domain/calculations.js",
    "domain/supplemental-adapter.js",
    "data/demo-data.js",
    "services/data-service.js",
    "services/migration-adapter.js",
    "services/contract-enrichment-adapter.js",
    "services/operational-enrichment-adapter.js",
    "services/source-service.js",
  ])
    vm.runInContext(fs.readFileSync("frontend/" + file, "utf8"), context);
  context.window.LokalblickCalculations = context.LokalblickCalculations;
  context.window.LokalblickSupplementalAdapter =
    context.LokalblickSupplementalAdapter;
  context.window.LokalblickOperationalEnrichmentAdapter =
    context.LokalblickOperationalEnrichmentAdapter;
  return context.window;
}
const workbook = (entries) => {
  const w = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(entries))
    XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(rows), name);
  return w;
};
const plain = (x) => JSON.parse(JSON.stringify(x));
const contract = {
  id: "c1",
  number: "A-1",
  propertyId: "p1",
  baseRent: 100000,
  rentBaseYear: 2020,
  rentIndexPercent: 0.8,
  baseAdditions: 20000,
  additionBaseYear: 2021,
  additionIndexPercent: 0.5,
};
const series = [
  { year: 2020, month: 10, value: 300, source: "known" },
  { year: 2021, month: 10, value: 320, source: "known" },
  { year: 2025, month: 10, value: 400, source: "known" },
];
const currentIndex = series.find((x) => x.year === 2025);
test("rent and addition have independent index basis and shares", () => {
  const v = C.annualValues(contract, 2026, 0, series);
  assert.equal(v.rent.amount, 100000 * (1 + 0.8 * (400 / 300 - 1)));
  assert.equal(v.addition.amount, 22500);
  assert.equal(v.rent.indexYear, 2025);
  assert.equal(v.rent.status, "Beräknad");
});
test("zero index share is valid and decreasing index preserves floor", () => {
  assert.equal(
    C.component({ ...contract, rentIndexPercent: 0 }, "rent", 2026, 0, series)
      .amount,
    100000,
  );
  assert.equal(C.indexedAmount(100, 200, 0.5, 100), 100);
  assert.equal(C.indexedAmount(100, 200, 0.5, 100, false), 75);
});
test("only October may supply the annual index", () => {
  assert.equal(C.october([{ year: 2025, month: 9, value: 400 }], 2025), null);
  assert.equal(
    C.component(contract, "rent", 2026, 0, [
      { year: 2025, month: 9, value: 400 },
    ]).status,
    "Behöver kontroll",
  );
});
test("known index takes precedence over preliminary budget index", () => {
  const data = normalize({
    isDemo: false,
    contracts: [contract],
    indexSeries: series,
    budgetPlans: [{ year: 2026, preliminaryIndex: 420 }],
  });
  assert.equal(C.budgetRows(data, 2026)[0].status, "Beräknad");
  data.indexSeries = series.filter((x) => x.year !== 2025);
  const rows = C.budgetRows(data, 2026);
  assert.equal(rows[0].status, "Preliminär");
  assert.equal(
    rows[0].amount,
    C.annualValues(contract, 2026, 420, data.indexSeries).total,
  );
});
test("different KPI series require review; duplicate indices cannot silently win", () => {
  assert.equal(
    C.component({ ...contract, rentSeriesBase: "1980" }, "rent", 2026, 0, [
      { ...currentIndex, seriesBase: "2020" },
    ]).status,
    "Behöver kontroll",
  );
  assert.equal(
    C.component(contract, "rent", 2026, 0, [
      ...series,
      { ...currentIndex, value: 401 },
    ]).status,
    "Behöver kontroll",
  );
});
test("notice date is derived from contract end and notice months", () => {
  assert.equal(
    C.noticeDate({ end: "2027-12-31", noticePeriodMonths: 9 }),
    "2027-03-31",
  );
  assert.equal(
    C.noticeDate({ end: "2027-05-31", noticePeriodMonths: 3 }),
    "2027-02-28",
  );
  assert.equal(C.noticeDate({ end: "2027-12-31" }), "");
});
test("day periodization includes leap year and end date", () => {
  assert.equal(
    C.yearFactor({ start: "2024-01-01", end: "2024-12-31" }, 2024),
    1,
  );
  assert.equal(
    C.yearFactor({ start: "2024-02-29", end: "2024-02-29" }, 2024),
    1 / 366,
  );
  assert.equal(C.yearFactor({ end: "2023-12-31" }, 2024), 0);
});
test("real INT/EXT parser keeps several contracts per property and blank numbers", () => {
  const svc = services(),
    w = workbook({
      INT: [
        [
          "Förvaltningsobjekt",
          "Avtalsnummer",
          "Gatuadress",
          "Area",
          "Användning",
        ],
        ["P-1", "A-1", "Testgatan 1", 100, "Boende"],
        ["P-1", "A-2", "Testgatan 1", 200, "Boende"],
        ["P-1", "", "Testgatan 1", 300, "Boende"],
        ["P-1", "", "Testgatan 1", 400, "Boende"],
      ],
      EXT: [
        ["Förvaltningsobjekt", "Avtalsnummer", "Adress", "Area"],
        ["P-2", "B-1", "Exempelgatan 2", 50],
      ],
      Lokallista: [
        ["Förvaltningsobjekt", "Avtalsnummer", "Gatuadress"],
        ["WRONG", "WRONG", "Fel"],
      ],
    });
  const d = svc.LokalblickMigrationAdapter.migrate(w, "synthetic.xlsx").data;
  assert.equal(d.contracts.length, 5);
  assert.equal(d.properties.length, 2);
  assert.equal(new Set(d.contracts.map((c) => c.id)).size, 5);
  assert.equal(d.contracts.filter((c) => !c.number).length, 2);
  assert.ok(!d.contracts.find((c) => c.number === "WRONG"));
});
test("secondary exact matching is unique and scored matches are review only", () => {
  const svc = services(),
    data = {
      contracts: [contract],
      properties: [{ id: "p1", address: "Testgatan 1" }],
    };
  const adapter = svc.LokalblickContractEnrichmentAdapter;
  assert.equal(
    adapter.matchContract(data, { number: "A-1" }).contract.id,
    "c1",
  );
  assert.equal(
    adapter.matchContract(
      { ...data, contracts: [contract, { ...contract, id: "c2" }] },
      { number: "A-1" },
    ).contract,
    null,
  );
  assert.equal(
    adapter.matchContract(data, {
      number: "",
      address: "Testgatan 1",
      area: 100,
      use: "Boende",
    }).contract,
    null,
  );
});
test("two sources create conflict and do not overwrite source values", () => {
  const svc = services(),
    data = normalize({
      isDemo: false,
      contracts: [{ ...contract, area: 100 }],
      properties: [{ id: "p1", address: "Testgatan 1" }],
    });
  const w = workbook({
    Avtal: [
      [
        "Fastighetsbeteckning",
        "Adress",
        "Avtalsnummer",
        "Verksamhet",
        "Hyresvärd",
        "kvm",
        "Grundhyra",
      ],
      ["TEST", "Testgatan 1", "A-1", "Boende", "Ägare", 110, 200000],
    ],
  });
  const result = svc.LokalblickContractEnrichmentAdapter.enrich(
    w,
    data,
    "second.xlsx",
  );
  assert.equal(result.data.contracts[0].baseRent, 100000);
  assert.equal(result.data.contracts[0].area, 100);
  assert.ok(result.data.importReview.some((x) => x.field === "baseRent"));
  assert.ok(result.data.importReview.some((x) => x.field === "area"));
  assert.equal(result.data.contracts[0].provenance.area.source, "INT/EXT");
});
test("actual XLSX bytes roundtrip keeps one activity model, responsibility and locked budget", () => {
  const svc = services();
  const d = normalize({
    isDemo: false,
    properties: [
      { id: "p1", address: "Testgatan 1", responsiblePersonId: "person1" },
    ],
    contracts: [
      {
        ...contract,
        area: 406,
        provenance: { area: { value: 406, source: "EXT", row: 2 } },
        contractDocumentUrl: "https://example.test/A-1.pdf",
      },
    ],
    people: [{ id: "person1", name: "Testperson" }],
    projects: [
      {
        id: "pr1",
        propertyId: "p1",
        contractId: "c1",
        name: "Testprojekt",
        budgetYear: 2026,
        budgetInvestigation: 10,
        budgetExecution: 200,
        budgetFurnishing: 30,
        responsiblePersonId: "person1",
        budgetIncluded: false,
      },
    ],
    maintenance: [
      {
        id: "uh1",
        propertyId: "p1",
        title: "Tak",
        year: 2026,
        cost: 300,
        responsiblePersonId: "person1",
      },
    ],
    operations: [
      { id: "op1", propertyId: "p1", period: 2026, category: "El", budget: 100, actual: 90 },
    ],
    maintenanceStatus: [
      { id: "ms1", propertyId: "p1", category: "Ytskikt", status: "Bra" },
    ],
    auditLog: [{
      id: "log1",
      at: "2026-10-07T10:00:00.000Z",
      by: "Test",
      collection: "activities",
      recordId: "uh1",
      action: "Ändrad",
      fields: [{ field: "estimatedCost", from: 200, to: 300 }],
    }],
    sourceRegistry: [{ id: "s1", name: "source", kind: "test" }],
    importReview: [{ id: "r1", field: "area", status: "pending" }],
    indexSeries: series.map((x) => ({ ...x, seriesBase: "1980" })),
    budgetPlans: [
      {
        year: 2026,
        status: "Låst",
        lockedBy: "Test",
        targets: { Underhåll: 300 },
        lines: [
          {
            category: "Underhåll",
            amount: 300,
            sourceType: "maintenance",
            sourceId: "uh1",
            propertyId: "p1",
            source: "Tak",
          },
        ],
      },
    ],
  });
  assert.equal(d.projects.length, 0);
  assert.equal(d.maintenance.length, 0);
  assert.equal(d.activities.length, 3);
  const bytes = XLSX.write(
    svc.LokalblickSourceService.dataToWorkbook(clone(d)),
    { type: "buffer", bookType: "xlsx" },
  );
  const workbookOut = XLSX.read(bytes, { type: "buffer" });
  assert.ok(workbookOut.Sheets.Aktiviteter);
  assert.equal(Boolean(workbookOut.Sheets.Projekt), false);
  assert.equal(Boolean(workbookOut.Sheets.Underhåll), false);
  assert.equal(Boolean(workbookOut.Sheets.Ansvar), false);
  assert.equal(Boolean(workbookOut.Sheets.Kostnader), false);
  assert.equal(Boolean(workbookOut.Sheets.Status), false);
  const out = svc.LokalblickSourceService.workbookToData(workbookOut);
  assert.equal(out.contracts[0].id, "c1");
  assert.deepEqual(
    plain(out.contracts[0].provenance),
    d.contracts[0].provenance,
  );
  const project = out.activities.find((x) => x.id === "pr1");
  const investigation = out.activities.find((x) => x.id === "MIG-UTR|pr1");
  const maintenance = out.activities.find((x) => x.id === "uh1");
  assert.equal(Object.hasOwn(project, "investigationCost"), false);
  assert.equal(project.estimatedCost, 230);
  assert.equal(investigation.type, "Utredning");
  assert.equal(investigation.estimatedCost, 10);
  assert.equal(project.responsiblePersonId, "person1");
  assert.equal(project.includeInBudget, "Nej");
  assert.equal(Object.hasOwn(project, "budgetIncluded"), false);
  assert.equal(maintenance.responsiblePersonId, "person1");
  assert.equal(out.properties[0].responsiblePersonId, "person1");
  assert.equal(out.operations[0].actual, 90);
  assert.equal(out.maintenanceStatus[0].status, "Bra");
  assert.equal(out.auditLog[0].action, "Ändrad");
  assert.equal(out.auditLog[0].fields[0].field, "estimatedCost");
  assert.equal(out.indexSeries[0].seriesBase, "1980");
  assert.equal(out.budgetPlans[0].lines[0].sourceId, "uh1");
  assert.equal(out.budgetPlans[0].lines[0].sourceType, "activity");
  assert.equal(out.budgetPlans[0].lockedBy, "Test");
  assert.equal(out.importReview.length, 1);
});
test("metadata-only edits contribute to pending changes", () => {
  const svc = services();
  const d = normalize({ isDemo: false });
  assert.ok(
    svc.LokalblickSourceService.diffData(d, {
      ...d,
      importReview: [{ id: "r1" }],
    }).some((x) => x.sheet === "Tilläggsdata"),
  );
});
test("non-demo normalization never inserts demo data; multi-contract scope stays coherent", () => {
  assert.equal(normalize({ isDemo: false }).properties.length, 0);
  const d = normalize({
    contracts: [contract, { ...contract, id: "c2", number: "A-2" }],
    properties: [{ id: "p1", address: "Test" }],
    maintenance: [{ id: "m1", contractId: "c2" }],
  });
  const v = scope(d, { propertyId: "p1" });
  assert.equal(v.contracts.length, 2);
  assert.equal(v.items.length, 1);
});
test("responsibility is stored directly and wish conversion keeps the same activity", () => {
  const d = normalize({
    activities: [
      {
        id: "w1",
        type: "Önskemål",
        title: "Tak",
        estimatedCost: 100,
        planningYear: 2027,
        budgetCategory: "Ej budget",
      },
    ],
  });
  assign(d, "activities", "w1", "person1", "Test");
  assert.equal(d.activities[0].responsiblePersonId, "person1");
  assert.equal(responsible(d, "activities", d.activities[0]), "person1");
  assert.equal(d.assignments.length, 0);
  moveWish(d, "w1", "Underhåll", "Test");
  assert.equal(d.activities.length, 1);
  assert.equal(d.activities[0].id, "w1");
  assert.equal(d.activities[0].type, "Underhåll");
  assert.equal(d.activities[0].budgetCategory, "Underhåll");
  assert.equal(d.activities[0].estimatedCost, 100);
  assert.ok(d.auditLog.length >= 2);
});
test("review requires an existing contract and keeps source provenance", () => {
  const d = normalize({
    contracts: [contract],
    importReview: [
      {
        id: "r1",
        kind: "conflict",
        contractId: "c1",
        field: "area",
        current: 100,
        proposed: 406,
        source: "EXT2",
        status: "pending",
      },
    ],
  });
  resolveReview(d, "r1", "accept", "", "Test");
  assert.equal(d.contracts[0].area, 406);
  assert.equal(d.contracts[0].provenance.area.source, "EXT2");
  assert.equal(d.importReview[0].status, "accepted");
  assert.throws(() => resolveReview(d, "r1", "accept", "", "Test"));
});
test("document resolver separates URL, local, filename, embedded and unsafe references", () => {
  const D = globalThis.LokalblickDocuments;
  assert.equal(
    D.resolve({ reference: "https://example.test/file.pdf" }).status,
    "ready",
  );
  assert.equal(D.resolve({ reference: "C:\\test\\file.pdf" }).status, "local");
  assert.equal(D.resolve({ reference: "A-1.pdf" }).status, "filename");
  assert.equal(D.resolve({ reference: "embedded://1" }).status, "reconnect");
  assert.equal(
    D.resolve({ reference: "javascript:alert(1)" }).status,
    "blocked",
  );
  assert.equal(D.match({ name: "A-1.pdf" }, [contract]).contractId, "c1");
});
test("failed Excel write keeps pending changes and baseline until retry succeeds", async () => {
  const svc = services(),
    api = svc.LokalblickSourceService,
    d = normalize({
      isDemo: false,
      properties: [{ id: "p1", address: "Test" }],
      contracts: [contract],
    });
  let bytes = XLSX.write(api.dataToWorkbook(clone(d)), {
      type: "array",
      bookType: "xlsx",
    }),
    fail = true;
  const handle = {
    name: "Lokalblick-data.xlsx",
    queryPermission: async () => "granted",
    getFile: async () => ({
      name: "Lokalblick-data.xlsx",
      arrayBuffer: async () => bytes,
    }),
    createWritable: async () => ({
      write: async (next) => {
        if (fail)
          throw Object.assign(Error("being used by another process"), {
            name: "NotAllowedError",
          });
        bytes = next;
      },
      close: async () => {},
      abort: async () => {},
    }),
  };
  svc.showOpenFilePicker = async () => [handle];
  svc.showSaveFilePicker = async () => handle;
  const loaded = await api.connect("readwrite");
  loaded.contracts[0].baseRent = 123456;
  await svc.LokalblickDataService.save(loaded);
  assert.equal(api.status().dirty, true);
  await assert.rejects(api.write());
  assert.equal(api.status().dirty, true);
  assert.ok(api.status().pendingChanges.length > 0);
  fail = false;
  await api.write();
  assert.equal(api.status().dirty, false);
  assert.equal(api.status().pendingChanges.length, 0);
  assert.equal(
    XLSX.utils.sheet_to_json(
      XLSX.read(bytes, { type: "array" }).Sheets.Avtal,
    )[0]["Bashyra"],
    123456,
  );
});
test("supplemental lists stage canonical activities and require property confirmation", () => {
  const svc = services(),
    data = normalize({
      isDemo: false,
      properties: [{ id: "p1", address: "Testgatan 1" }],
    });
  const schema = svc.LokalblickSourceService.schemas.find(
    (s) => s.key === "activities",
  );
  const w = workbook({
    Underlag: [
      ["Åtgärd", "Planår", "Kostnad", "Adress", "Typ"],
      ["Tak", 2027, "100 000,50", "Testgatan 1", "Underhåll"],
    ],
  });
  const result = svc.LokalblickSupplementalAdapter.analyze(
    w,
    data,
    schema,
    "underlag.xlsx",
  );
  assert.equal(result.data.activities.length, 0);
  const review = plain(result.data.importReview[0]);
  assert.equal(review.record.estimatedCost, 100000.5);
  assert.equal(review.record.propertyId, "p1");
  const d = normalize(result.data);
  resolveReview(d, review.id, "accept", "p1", "Test");
  assert.equal(d.activities.length, 1);
  assert.equal(d.activities[0].type, "Underhåll");
  assert.equal(
    d.activities[0].provenance.estimatedCost.source,
    "underlag.xlsx",
  );
});
test("Excel import trims phantom formatted rows before adapters read the sheet", async () => {
  const svc = services();
  const sourceWorkbook = workbook({
    SF: [
      ["Förvaltningsobjekt", "Avtalsnummer", "Gatuadress"],
      ...Array.from({ length: 109 }, (_, index) => [
        "OBJ-" + (index + 1),
        "A-" + (index + 1),
        "Testgatan " + (index + 1),
      ]),
    ],
  });
  sourceWorkbook.Sheets.SF["!ref"] = "A1:Z1048576";
  const bytes = XLSX.write(sourceWorkbook, { type: "array", bookType: "xlsx" });
  svc.showOpenFilePicker = async () => [
    {
      name: "phantom.xlsx",
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      getFile: async () => ({
        name: "phantom.xlsx",
        arrayBuffer: async () => bytes,
      }),
    },
  ];
  await svc.LokalblickSourceService.prepareImportWorkbook();
  const progress = [];
  const result = await svc.LokalblickSourceService.importPreparedWorkbook(
    normalize({ isDemo: false }),
    ["SF"],
    (x) => progress.push(plain(x)),
  );
  const parsed = progress.find((x) => x.stage === "parsed-sheets");
  assert.equal(parsed.sheets[0].rows, 110);
  assert.equal(result.report.sheets[0], "SF");
});
test("prepared Excel import lists sheets and imports only selected sheets with progress", async () => {
  const svc = services();
  const api = svc.LokalblickSourceService;
  const sourceWorkbook = workbook({
    SF: [
      [
        "Förvaltningsobjekt",
        "Avtalsnummer",
        "Gatuadress",
        "Kundtyp avtal",
        "Area",
        "Lokalkategori",
        "Användning",
      ],
      ["OBJ-1", "12345", "Testgatan 1", "Fastighets AB", 500, "Kontor", "Vårdbo"],
    ],
    Fastighetslista: [
      ["Benämning", "Postadress", "Fastighetsägare", "Förvaltare", "Objekt. nr"],
      ["Testhuset", "Testgatan 1", "Fastighets AB", "Lisa Förvaltare", "OBJ-1"],
    ],
    Noteringar: [["Fri text"], ["Ska inte läsas"]],
  });
  const bytes = XLSX.write(sourceWorkbook, { type: "array", bookType: "xlsx" });
  svc.showOpenFilePicker = async () => [
    {
      name: "underlag.xlsx",
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      getFile: async () => ({
        name: "underlag.xlsx",
        arrayBuffer: async () => bytes,
      }),
    },
  ];
  const progress = [];
  const prepared = await api.prepareImportWorkbook((x) => progress.push(plain(x)));
  assert.deepEqual(
    prepared.sheets.map((x) => x.name),
    ["SF", "Fastighetslista", "Noteringar"],
  );
  assert.equal(prepared.sheets.find((x) => x.name === "SF").recommended, true);
  assert.equal(
    prepared.sheets.find((x) => x.name === "Noteringar").recommended,
    false,
  );
  const result = await api.importPreparedWorkbook(
    normalize({ isDemo: false }),
    ["SF"],
    (x) => progress.push(plain(x)),
  );
  assert.deepEqual(result.report.sheets, ["SF"]);
  assert.equal(result.data.properties.length, 1);
  assert.equal(result.data.contracts.length, 1);
  assert.equal(
    result.data.people.some((x) => x.name === "Lisa Förvaltare"),
    false,
  );
  assert.ok(progress.some((x) => x.stage === "parsed-sheets"));
  assert.ok(
    progress.some(
      (x) =>
        x.stage === "core-done" &&
        x.counts?.properties === 1 &&
        x.counts?.contracts === 1,
    ),
  );
});
test("unified Excel import seeds empty property and contract data before enrichment", () => {
  const svc = services();
  const firstWorkbook = workbook({
    SF: [
      [
        "Förvaltningsobjekt",
        "Avtalsnummer",
        "Gatuadress",
        "Kundtyp avtal",
        "Area",
        "Lokalkategori",
        "Användning",
        "Aktuellt giltigt t.o.m.",
        "Fastighetsförvaltare",
      ],
      [
        "OBJ-1",
        "12345",
        "Testgatan 1",
        "Fastighets AB",
        500,
        "Kontor",
        "Vårdbo",
        "2030-12-31",
        "FF01 Lisa Förvaltare",
      ],
    ],
  });
  const first = svc.LokalblickSourceService.analyzeImportWorkbook(
    firstWorkbook,
    normalize({ isDemo: false }),
    "SF.xlsx",
  );
  assert.equal(first.data.properties.length, 1);
  assert.equal(first.data.contracts.length, 1);
  assert.equal(first.data.contracts[0].propertyId, first.data.properties[0].id);
  assert.equal(first.data.properties[0].ownerResponsiblePersonId, first.data.people[0].id);
  assert.ok(first.data.auditLog.some((x) => x.collection === "properties"));
  assert.ok(first.data.sourceRegistry.some((x) => x.kind === "core-import"));

  const secondWorkbook = workbook({
    EXT: [
      [
        "Förvaltningsobjekt",
        "Avtalsnummer",
        "Gatuadress",
        "Kundtyp avtal",
        "Area",
        "Lokalkategori",
        "Användning",
        "Aktuellt giltigt t.o.m.",
      ],
      [
        "OBJ-1",
        "67890",
        "Testgatan 1",
        "Fastighets AB",
        300,
        "Kontor",
        "Ordbo",
        "2032-12-31",
      ],
    ],
  });
  const second = svc.LokalblickSourceService.analyzeImportWorkbook(
    secondWorkbook,
    first.data,
    "EXT.xlsx",
  );
  assert.equal(second.data.properties.length, 1);
  assert.equal(second.data.contracts.length, 2);
  assert.deepEqual(
    second.data.contracts.map((x) => x.number).sort(),
    ["12345", "67890"],
  );

  const changedWorkbook = workbook({
    EXT: [
      [
        "Förvaltningsobjekt",
        "Avtalsnummer",
        "Gatuadress",
        "Kundtyp avtal",
        "Area",
        "Lokalkategori",
        "Användning",
        "Aktuellt giltigt t.o.m.",
      ],
      [
        "OBJ-1",
        "12345",
        "Testgatan 1",
        "Fastighets AB",
        510,
        "Kontor",
        "Vårdbo",
        "2030-12-31",
      ],
    ],
  });
  const changed = svc.LokalblickSourceService.analyzeImportWorkbook(
    changedWorkbook,
    second.data,
    "EXT-update.xlsx",
  );
  assert.equal(changed.data.properties.length, 1);
  assert.equal(changed.data.contracts.length, 2);
  assert.equal(
    changed.data.contracts.find((x) => x.number === "12345").area,
    500,
  );
  const areaConflict = changed.data.importReview.find(
    (x) => x.field === "area" && Number(x.proposed) === 510,
  );
  assert.ok(areaConflict);
  assert.equal(areaConflict.collection, "contracts");
  assert.equal(
    areaConflict.recordId,
    changed.data.contracts.find((x) => x.number === "12345").id,
  );
  assert.equal(areaConflict.entity, "Avtal");
  assert.equal(areaConflict.currentSource, "SF");
  assert.equal(
    changed.data.importReview.some((x) => x.field === "source"),
    false,
  );
});
test("legacy core conflict can still resolve against the registered record", () => {
  const data = normalize({
    isDemo: false,
    properties: [
      {
        id: "PROP|INH0234",
        sourceId: "INH0234",
        address: "LUNDAVÄGEN 6",
      },
    ],
    importReview: [
      {
        id: "legacy-conflict",
        kind: "operational-conflict",
        source: "Fastighetslista II.xlsx",
        sheet: "Fastighetslista",
        row: 58,
        entity: "Fastighet",
        recordId: "PROP|INH0233",
        field: "sourceId",
        current: "INH0234",
        proposed: "INH0233",
        status: "pending",
      },
    ],
  });
  resolveReview(data, "legacy-conflict", "accept", "", "Test");
  assert.equal(data.properties[0].sourceId, "INH0233");
  assert.equal(data.importReview[0].status, "accepted");
  assert.equal(data.auditLog.length, 1);
});
test("operational enrichment writes explicit responsibilities and orders without duplicate reimport", () => {
  const svc = services(),
    base = normalize({
      isDemo: false,
      properties: [
        { id: "1081", address: "Västanväg 119A-C", designation: "Gräset 2" },
        { id: "INH0443", address: "Von Troils väg 8B", designation: "Byrådirektören 4" },
      ],
      contracts: [
        { id: "c1081", propertyId: "1081", number: "SF1081-001-4" },
        { id: "c443", propertyId: "INH0443", number: "42001 7010 02" },
      ],
      organizations: [{ id: "ORG-OUR", name: "Vår organisation", type: "our" }],
    });
  const w = workbook({
    Lokalbestånd: [
      [],
      [],
      ["Verksamhetstyp", "Verksamhet", "Objektsnummer / Förvaltningsobjekt", "Benämning", "Adress", "Fastighetsbeteckning", "Antal medarbetare (viss+ heltid)", "Fastighetsägare", "Lokalkategori (LEB)", "Lokalyta (kvm)", "Avtalsnummer"],
      ["SÄBO", "VÅRDBO", "1081", "Annetorpsgården", "Västanväg 119A-C", "Gräset 2", 39, "Stadsfastigheter", "ÄBO", 1714, "SF1081-001-4"],
    ],
    Fastighetslista: [
      ["Benämning", "Postadress", "Fastighetsägare", "Förvaltare", "Email (förvaltare)", "Fastighetsbeteckning", "Objekt. nr"],
      ["Annetorpsgården", "Västanväg 119A-C", "Stadsfastigheter", "Sacha Kozarovski", "sacha.kozarovski@malmo.se", "Gräset 2", "1081"],
    ],
    Årshjul: [
      ["Verksamhet", "Namn på verksamheten", "Adress", "Vad ska göras", "Drift eller investering", "Ansvarig", "Uppskattat pris investering exkl moms, tkr", "Budget 2027, tkr", "Januari"],
      ["VÅRDBO", "Annetorpsgården", "Västanväg 119", "Nytt skalskydd", "Investering", "Omid", 300, 300, "X"],
    ],
    Beställningar: [
      [],
      ["Beställningsdatum", "Beställt av", "Produktnamn/beskrivning", "Verksamhet", "Leverantör", "Pris investering", "Status (Enbart beställt eller klart)", "Reqs"],
      ["2026-01-10", "Omid", "Nytt skalskydd", "Annetorpsgården", "Leverantör AB", 166512, "Klart", "REQ-1"],
    ],
  });
  const first = svc.LokalblickOperationalEnrichmentAdapter.enrich(
    w,
    base,
    "hvo.xlsx",
  ).data;
  const manager = first.people.find((p) => p.email === "sacha.kozarovski@malmo.se");
  const omid = first.people.find((p) => p.name === "Omid");
  const activity = first.activities.find((x) => x.title === "Nytt skalskydd");
  assert.ok(manager);
  assert.equal(omid.provisional, true);
  assert.equal(
    first.properties.find((x) => x.id === "1081").ownerResponsiblePersonId,
    manager.id,
  );
  assert.equal(activity.responsiblePersonId, omid.id);
  assert.equal(Object.hasOwn(activity, "orderedCost"), false);
  const order = first.orders.find((x) => x.activityId === activity.id);
  assert.equal(order.orderedByPersonId, omid.id);
  assert.equal(order.orderedCost, 166512);
  const counts = {
    people: first.people.length,
    orders: first.orders.length,
    activities: first.activities.length,
  };
  const second = svc.LokalblickOperationalEnrichmentAdapter.enrich(
    w,
    first,
    "hvo.xlsx",
  ).data;
  assert.equal(second.people.length, counts.people);
  assert.equal(second.orders.length, counts.orders);
  assert.equal(second.activities.length, counts.activities);
  assert.equal(
    second.sourceRegistry.filter(
      (x) => x.kind === "operational-enrichment" && x.name === "hvo.xlsx",
    ).length,
    1,
  );
});
test("Lokalblick workbook exposes human source sheet and hides technical extras", () => {
  const svc = services();
  const w = svc.LokalblickSourceService.dataToWorkbook(normalize({
    isDemo: false,
    sourceRegistry: [{ id: "s1", name: "underlag.xlsx", kind: "operational-enrichment", rows: 10, matched: 8, created: 2, review: 1 }],
  }));
  assert.ok(w.Sheets["Källor"]);
  assert.ok(w.Sheets["Ändringslogg"]);
  assert.ok(w.Sheets["Parter"]);
  assert.ok(w.Sheets["Beställningar"]);
  assert.ok(w.Sheets["Budget"]);
  assert.ok(w.Sheets["Budgetrader"]);
  assert.equal(Boolean(w.Sheets["Kontakter"]), false);
  assert.ok(w.Sheets["Tilläggsdata"]);
  const meta = (w.Workbook?.Sheets || []).find((x) => x.name === "Tilläggsdata");
  const audit = (w.Workbook?.Sheets || []).find((x) => x.name === "Ändringslogg");
  assert.equal(meta?.Hidden, 1);
  assert.notEqual(audit?.Hidden, 1);
});

test("supplemental activities cannot create an unknown property or move a contract", () => {
  const d = normalize({
    properties: [{ id: "p1", address: "Test" }],
    contracts: [contract],
    importReview: [
      {
        id: "r1",
        kind: "record",
        collection: "activities",
        record: {
          type: "Underhåll",
          title: "Tak",
          propertyId: "UNKNOWN",
        },
        status: "pending",
      },
    ],
  });
  assert.throws(() => resolveReview(d, "r1", "accept", "", "Test"));
  assert.equal(d.activities.length, 0);
});
test("actual costs aggregate once from operations and activities", () => {
  const d = normalize({
    contracts: [contract],
    operations: [{ id: "o1", propertyId: "p1", period: 2027, actual: 10 }],
    activities: [
      {
        id: "m1",
        type: "Underhåll",
        propertyId: "p1",
        planningYear: 2027,
        budgetCategory: "Underhåll",
        finalCost: 20,
      },
      {
        id: "pr1",
        type: "Projekt",
        propertyId: "p1",
        planningYear: 2027,
        budgetCategory: "Projekt",
        finalCost: 30,
      },
    ],
  });
  const rows = C.actualRows(d, 2027);
  assert.equal(
    rows.reduce((sum, r) => sum + r.amount, 0),
    60,
  );
  assert.equal(rows.find((r) => r.sourceId === "m1").category, "Underhåll");
});
test("responsible scope uses direct property and activity responsibility", () => {
  const d = normalize({
    contracts: [contract],
    properties: [
      { id: "p1", address: "Testgatan 1" },
      { id: "p2", address: "Annat" },
    ],
    activities: [
      {
        id: "m1",
        type: "Underhåll",
        propertyId: "p1",
        planningYear: 2027,
        estimatedCost: 100,
        budgetCategory: "Underhåll",
        responsiblePersonId: "person1",
      },
      {
        id: "m2",
        type: "Underhåll",
        propertyId: "p2",
        planningYear: 2027,
        estimatedCost: 200,
        budgetCategory: "Underhåll",
        responsiblePersonId: "person1",
      },
    ],
  });
  const v = scope(d, { person: "person1" });
  assert.equal(v.properties.length, 2);
  assert.equal(v.items.length, 2);
  assert.equal(
    C.budgetRows(d, 2027, v.contracts, v.properties)
      .filter((r) => r.category === "Underhåll")
      .reduce((sum, r) => sum + r.amount, 0),
    300,
  );
});
