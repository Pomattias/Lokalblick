import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { LocalCompanySourceAdapter, parseLebWorkbook } from "../src/adapters/local-company-source-adapter.js";
import { LokalblickRepository } from "../src/data-repository.js";
import { createLokalblickServer, DEFAULT_HOST, DEFAULT_PORT, validateHost } from "../src/server.js";

const sfHeaders = [
  "Förvaltningsobjekt", "Avtalsnummer", "Kostnadsställe", "Gatuadress", "Kundtyp avtal",
  "Area", "Avtalstyp", "Ursprungligt giltigt fr.o.m.", "Aktuellt giltigt t.o.m.",
  "Förlängningstid", "Uppsägningstid", "Uppsagd den", "Uppsägningsorsak",
  "Säg upp senast", "Lokalkategori", "Användning", "Fastighetsförvaltare"
];
const extHeaders = [
  "Förvaltningsobjekt", "Avtalsnummer", "Fast.bet.", "Adress", "Lev.namn", "Area",
  "Avtalstyp", "Ursprungligt giltigt t.o.m.", "Aktuellt giltigt t.o.m.",
  "Förlängningstid", "Uppsägningstid", "Uppsagd den", "Uppsägningsorsak",
  "Säg upp senast", "Lokalkategori", "Användning", "Handläggare (id)"
];

function row(headers, values) {
  return headers.map((header) => values[header] ?? null);
}

function syntheticWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sf = workbook.addWorksheet("SF");
  sf.addRow(sfHeaders);
  sf.addRow(row(sfHeaders, {
    "Förvaltningsobjekt": "PROP-1", "Avtalsnummer": "SF-100", "Gatuadress": "Testgata 1",
    "Ursprungligt giltigt fr.o.m.": "2020-01-01", "Aktuellt giltigt t.o.m.": "2030-12-31", Area: 100
  }));
  sf.addRow(row(sfHeaders, {
    "Förvaltningsobjekt": "PROP-1", "Avtalsnummer": "SF-101", "Gatuadress": "Testgata 1",
    "Ursprungligt giltigt fr.o.m.": "2021-01-01", "Aktuellt giltigt t.o.m.": "2031-12-31", Area: 200
  }));
  const ext = workbook.addWorksheet("EXT");
  ext.addRow(extHeaders);
  ext.addRow(row(extHeaders, {
    "Förvaltningsobjekt": "PROP-2", "Avtalsnummer": "EXT-200", "Fast.bet.": "BLOCK-2",
    Adress: "Exempelvägen 2", "Lev.namn": "Syntetisk ägare",
    "Ursprungligt giltigt t.o.m.": "2022-12-31", "Aktuellt giltigt t.o.m.": "2032-12-31", Area: 300
  }));
  return workbook;
}

async function tempDirectory() {
  return fs.mkdtemp(path.join(os.tmpdir(), "lokalblick-test-"));
}

test("parses SF and EXT semantics with stable non-address identifiers", () => {
  const parsed = parseLebWorkbook(syntheticWorkbook());
  assert.equal(parsed.sourceCounts.sfRows, 2);
  assert.equal(parsed.sourceCounts.extRows, 1);
  assert.deepEqual(parsed.properties.map((property) => property.id), ["PROP-1", "PROP-2"]);
  assert.equal(parsed.contracts[0].id, "SF|PROP-1|SF-100");
  assert.equal(parsed.contracts[0].contractId, "SF|PROP-1|SF-100");
  assert.equal(parsed.contracts[1].id, "SF|PROP-1|SF-101");
  assert.equal(parsed.contracts[2].id, "EXT|PROP-2|EXT-200");
  assert.equal(parsed.contracts[0].originalValidFrom, "2020-01-01");
  assert.equal(parsed.contracts[0].originalValidTo, null);
  assert.equal(parsed.contracts[2].originalValidFrom, null);
  assert.equal(parsed.contracts[2].originalValidTo, "2022-12-31");
  assert.ok(parsed.contracts.every((contract) => !contract.id.includes("Testgata") && !contract.id.includes("Exempelvägen")));
});

test("inspects required worksheets and returns row counts without workbook data", async (t) => {
  const directory = await tempDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "synthetic.xlsx");
  await syntheticWorkbook().xlsx.writeFile(file);
  const adapter = new LocalCompanySourceAdapter({ lebPath: file });
  assert.deepEqual(await adapter.status(await adapter.loadCore()), {
    sourceType: "local-company",
    fileFound: true,
    sfRowCount: 2,
    extRowCount: 1,
    propertyCount: 2,
    contractCount: 3,
    lastModified: (await fs.stat(file)).mtime.toISOString()
  });
});

test("persists CRUD, coordinates, and overlays across refresh and repository restart", async (t) => {
  const directory = await tempDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const dataPath = path.join(directory, "company-data.json");
  let core = {
    ...parseLebWorkbook(syntheticWorkbook()),
    properties: parseLebWorkbook(syntheticWorkbook()).properties.map((property) => ({ ...property, latitude: undefined, longitude: undefined }))
  };
  const adapter = {
    loadCore: async () => structuredClone(core),
    loadCoordinates: async () => [{ id: "PROP-1", propertyId: "PROP-1", latitude: 59.1, longitude: 18.2 }],
    status: async () => ({ sourceType: "local-company", fileFound: true, sfRowCount: 2, extRowCount: 1, propertyCount: 2, contractCount: 3, lastModified: "2026-01-01T00:00:00.000Z" })
  };
  let repository = await new LokalblickRepository({ sourceAdapter: adapter, dataPath }).initialize();
  const person = await repository.create("people", { id: "P-TEST", name: "Syntetisk person" });
  assert.equal((await repository.get("people", person.id)).name, "Syntetisk person");
  await repository.update("people", person.id, { role: "Testroll" });
  assert.equal((await repository.get("people", person.id)).role, "Testroll");
  await repository.create("projects", { id: "PR-TEST", name: "Syntetiskt projekt" });
  await repository.saveWorkspace({
    properties: [{ id: "PROP-1", address: "förfalskad", latitude: 60, longitude: 19, note: "Syntetisk komplettering" }],
    contracts: [{ ...core.contracts[0], annualRent: 1234, address: "förfalskad" }]
  });
  assert.equal((await repository.bootstrap()).properties.find((item) => item.id === "PROP-1").latitude, 60);
  assert.equal((await repository.bootstrap()).properties.find((item) => item.id === "PROP-1").note, "Syntetisk komplettering");
  assert.equal((await repository.bootstrap()).properties.find((item) => item.id === "PROP-2").latitude, undefined);
  assert.equal((await repository.get("contracts", "SF|PROP-1|SF-100")).address, "Testgata 1");
  assert.equal((await repository.get("contracts", "SF|PROP-1|SF-100")).annualRent, 1234);
  assert.equal(await repository.delete("contracts", "SF|PROP-1|SF-100"), true);
  assert.equal(await repository.delete("people", person.id), true);
  await repository.refreshSource();
  assert.deepEqual((await repository.bootstrap()).contracts.map((contract) => contract.id), [
    "SF|PROP-1|SF-101",
    "EXT|PROP-2|EXT-200"
  ]);
  core = parseLebWorkbook(syntheticWorkbook());
  repository = await new LokalblickRepository({ sourceAdapter: adapter, dataPath }).initialize();
  const workspace = await repository.bootstrap();
  assert.equal(workspace.projects[0].name, "Syntetiskt projekt");
  assert.equal(workspace.properties.find((property) => property.id === "PROP-1").latitude, 60);
  assert.deepEqual(workspace.contracts.map((contract) => contract.id), ["SF|PROP-1|SF-101", "EXT|PROP-2|EXT-200"]);
  assert.equal(await repository.get("people", person.id), null);
});

test("workspace rejects invalid data and LEB core cannot be updated", async (t) => {
  const directory = await tempDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const source = parseLebWorkbook(syntheticWorkbook());
  const repository = await new LokalblickRepository({
    sourceAdapter: { loadCore: async () => source, loadCoordinates: async () => [] },
    dataPath: path.join(directory, "data.json")
  }).initialize();
  await assert.rejects(repository.create("unknown", {}), RangeError);
  await assert.rejects(repository.create("people", { path: "local-file" }), TypeError);
  await assert.rejects(repository.saveWorkspace({ people: "invalid" }), TypeError);
  await assert.rejects(repository.update("contracts", source.contracts[0].id, { address: "changed" }), RangeError);
  assert.equal((await repository.get("contracts", source.contracts[0].id)).address, "Testgata 1");
});

test("server allows loopback only and exposes a redacted source status", async (t) => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
  assert.equal(DEFAULT_PORT, 8787);
  assert.doesNotThrow(() => validateHost("127.0.0.1"));
  assert.doesNotThrow(() => validateHost("localhost"));
  assert.doesNotThrow(() => validateHost("::1"));
  assert.throws(() => validateHost("0.0.0.0"), { code: "UNSAFE_HOST" });
  const directory = await tempDirectory();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repository = await new LokalblickRepository({
    dataPath: path.join(directory, "data.json"),
    sourceAdapter: {
      loadCore: async () => ({ properties: [], contracts: [] }),
      loadCoordinates: async () => [],
      status: async () => ({
        sourceType: "local-company", fileFound: true, sfRowCount: 2, extRowCount: 3,
        propertyCount: 4, contractCount: 5, lastModified: "2026-01-01T00:00:00.000Z",
        address: "SENSITIVE SYNTHETIC ADDRESS", personName: "PRIVATE", filePath: "SENSITIVE PATH"
      })
    }
  }).initialize();
  const server = createLokalblickServer(repository, { port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const statusResponse = await fetch(`${base}/api/source/status`);
  const status = await statusResponse.json();
  assert.deepEqual(Object.keys(status).sort(), [
    "contractCount", "extRowCount", "fileFound", "lastModified", "propertyCount", "sfRowCount", "sourceType"
  ]);
  assert.equal(JSON.stringify(status).includes("SENSITIVE"), false);
  const saved = await fetch(`${base}/api/workspace`, {
    method: "PATCH",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ people: [{ id: "API-PERSON", name: "Syntetisk API-person" }] })
  });
  assert.equal(saved.status, 200);
  assert.equal((await (await fetch(`${base}/api/bootstrap`)).json()).people[0].id, "API-PERSON");
  const crossOrigin = await fetch(`${base}/api/people`, {
    method: "POST",
    headers: { Origin: "http://attacker.invalid:8787", "Content-Type": "application/json" },
    body: JSON.stringify({ id: "CROSS-ORIGIN", name: "blocked" })
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal(await repository.get("people", "CROSS-ORIGIN"), null);
  const runtimeScript = await (await fetch(`${base}/services/data-service.js`)).text();
  assert.match(runtimeScript, /api\/workspace/);
  assert.doesNotMatch(runtimeScript, /localStorage|indexedDB/);
});
