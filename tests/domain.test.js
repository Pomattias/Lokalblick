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
    "services/source-service.js",
  ])
    vm.runInContext(fs.readFileSync("frontend/" + file, "utf8"), context);
  context.window.LokalblickCalculations = context.LokalblickCalculations;
  context.window.LokalblickSupplementalAdapter =
    context.LokalblickSupplementalAdapter;
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
  rentBaseIndex: 300,
  rentBaseYear: 2020,
  rentIndexPercent: 0.8,
  annualRent: 99999,
  baseAdditions: 20000,
  additionBaseIndex: 320,
  additionBaseYear: 2021,
  additionIndexPercent: 0.5,
  annualAdditions: 20000,
};
const series = [{ year: 2025, month: 10, value: 400, source: "known" }];
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
  data.indexSeries = [];
  const rows = C.budgetRows(data, 2026);
  assert.equal(rows[0].status, "Preliminär");
  assert.equal(rows[0].amount, C.annualValues(contract, 2026, 420, []).total);
});
test("different KPI series require review; duplicate indices cannot silently win", () => {
  assert.equal(
    C.component({ ...contract, rentSeriesBase: "1980" }, "rent", 2026, 0, [
      { ...series[0], seriesBase: "2020" },
    ]).status,
    "Behöver kontroll",
  );
  assert.equal(
    C.component(contract, "rent", 2026, 0, [
      ...series,
      { ...series[0], value: 401 },
    ]).status,
    "Behöver kontroll",
  );
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
test("actual XLSX bytes roundtrip model, metadata, activities and locked budget", () => {
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
    auditLog: [{ id: "log1", by: "Test", description: "x".repeat(40000) }],
    sourceRegistry: [{ id: "s1", name: "source" }],
    importReview: [{ id: "r1", field: "area", status: "pending" }],
    indexSeries: [{ ...series[0], seriesBase: "1980" }],
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
  const bytes = XLSX.write(
    svc.LokalblickSourceService.dataToWorkbook(clone(d)),
    { type: "buffer", bookType: "xlsx" },
  );
  const out = svc.LokalblickSourceService.workbookToData(
    XLSX.read(bytes, { type: "buffer" }),
  );
  assert.equal(out.contracts[0].id, "c1");
  assert.deepEqual(
    plain(out.contracts[0].provenance),
    d.contracts[0].provenance,
  );
  assert.equal(out.projects[0].budgetInvestigation, 10);
  assert.equal(out.projects[0].budgetExecution, 200);
  assert.equal(out.projects[0].budgetFurnishing, 30);
  assert.equal(out.projects[0].budgetIncluded, false);
  assert.equal(out.maintenance[0].responsiblePersonId, "person1");
  assert.equal(out.auditLog[0].description.length, 40000);
  assert.equal(out.indexSeries[0].seriesBase, "1980");
  assert.equal(out.budgetPlans[0].lines[0].sourceId, "uh1");
  assert.equal(out.budgetPlans[0].lockedBy, "Test");
  assert.equal(out.importReview.length, 1);
});
const clone = plain;
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
test("assignment and wish conversion retain identity and audit history", () => {
  const d = normalize({
    wishes: [{ id: "w1", title: "Tak", estimatedCost: 100, budgetYear: 2027 }],
  });
  assign(d, "wishes", "w1", "person1", "Test");
  moveWish(d, "w1", "maintenance", "Test");
  assert.equal(d.wishes.length, 0);
  assert.equal(d.maintenance[0].id, "w1");
  assert.equal(d.maintenance[0].cost, 100);
  assert.equal(d.assignmentChanges[0].changedBy, "Test");
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
  loaded.contracts[0].annualRent = 123456;
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
    )[0]["Årshyra"],
    123456,
  );
});
test("supplemental lists stage normalized records and require explicit property confirmation", () => {
  const svc = services(),
    data = normalize({
      isDemo: false,
      properties: [{ id: "p1", address: "Testgatan 1" }],
    });
  const schema = svc.LokalblickSourceService.schemas.find(
    (s) => s.key === "maintenance",
  );
  const w = workbook({
    Underlag: [
      ["Åtgärd", "Planår", "Kostnad", "Adress"],
      ["Tak", 2027, "100 000,50", "Testgatan 1"],
    ],
  });
  const result = svc.LokalblickSupplementalAdapter.analyze(
    w,
    data,
    schema,
    "underlag.xlsx",
  );
  assert.equal(result.data.maintenance.length, 0);
  const review = plain(result.data.importReview[0]);
  assert.equal(review.record.cost, 100000.5);
  assert.equal(review.record.propertyId, "p1");
  const d = normalize(result.data);
  resolveReview(d, review.id, "accept", "p1", "Test");
  assert.equal(d.maintenance.length, 1);
  assert.equal(d.maintenance[0].provenance.cost.source, "underlag.xlsx");
});
test("supplemental rows cannot create an unknown property or move an existing contract", () => {
  const d = normalize({
    properties: [{ id: "p1", address: "Test" }],
    contracts: [contract],
    importReview: [
      {
        id: "r1",
        kind: "record",
        collection: "maintenance",
        record: { title: "Tak", propertyId: "UNKNOWN" },
        status: "pending",
      },
    ],
  });
  assert.throws(() => resolveReview(d, "r1", "accept", "", "Test"));
  assert.equal(d.maintenance.length, 0);
});
test("actual costs aggregate once and preserve source identity", () => {
  const d = normalize({
    contracts: [contract],
    operations: [{ id: "o1", propertyId: "p1", period: 2027, actual: 10 }],
    maintenance: [{ id: "m1", propertyId: "p1", year: 2027, finalCost: 20 }],
    projects: [
      { id: "pr1", propertyId: "p1", budgetYear: 2027, finalCost: 30 },
    ],
  });
  const rows = C.actualRows(d, 2027);
  assert.equal(
    rows.reduce((sum, r) => sum + r.amount, 0),
    60,
  );
  assert.equal(rows.find((r) => r.sourceId === "m1").category, "Underhåll");
});
test("responsible scope includes individually assigned tasks and properties without contracts", () => {
  const d = normalize({
    contracts: [contract],
    properties: [
      { id: "p1", address: "Testgatan 1" },
      { id: "p2", address: "Annat" },
    ],
    maintenance: [
      {
        id: "m1",
        propertyId: "p1",
        year: 2027,
        cost: 100,
        responsiblePersonId: "person1",
      },
      {
        id: "m2",
        propertyId: "p2",
        year: 2027,
        cost: 200,
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
