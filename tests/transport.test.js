import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LokalblickRepository } from "../backend/company/data-repository.js";
import { createLokalblickServer } from "../backend/company/server.js";
import { createTransport } from "../frontend/v2/transport.js";
import { normalize } from "../frontend/v2/model.js";
import "../frontend/domain/calculations.js";
test("V2 API save persists budget, review, provenance and audit across backend restart", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lokalblick-v2-test-"));
  const dataPath = path.join(dir, "store.json");
  const sourceAdapter = {
    loadCore: async () => ({
      properties: [{ id: "p1", address: "Testgatan 1" }],
      contracts: [
        {
          id: "c1",
          number: "A-1",
          propertyId: "p1",
          area: 100,
          originalValidFrom: "2020-01-01",
          currentValidTo: "2030-12-31",
        },
      ],
    }),
    loadCoordinates: async () => [],
  };
  const repository = await new LokalblickRepository({
    sourceAdapter,
    dataPath,
  }).initialize();
  const server = createLokalblickServer(repository, { port: 0 });
  await new Promise((r) => server.on("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  globalThis.window = {
    LokalblickDataService: {
      mode: "company-api",
      load: async () => {
        const r = await fetch(base + "/api/bootstrap");
        assert.equal(r.status, 200);
        return r.json();
      },
      save: async (data) => {
        const r = await fetch(base + "/api/workspace", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        assert.equal(r.status, 200);
        return r.json();
      },
    },
  };
  try {
    const transport = createTransport();
    const data = await transport.load();
    assert.equal(data.contracts[0].end, "2030-12-31");
    data.contracts[0].annualRent = 123456;
    data.contracts[0].provenance = {
      annualRent: { source: "Test", value: 123456 },
    };
    data.people = [
      { id: "person1", name: "Intern ansvarig", role: "Lokalstrateg" },
      { id: "person2", name: "Extern förvaltare", role: "Fastighetsförvaltare" },
    ];
    data.properties[0].responsiblePersonId = "person1";
    data.activities = [
      {
        id: "act1",
        type: "Underhåll",
        title: "Tak",
        propertyId: "p1",
        responsiblePersonId: "person1",
        planningYear: 2027,
        budgetCategory: "Underhåll",
        estimatedCost: 500,
      },
    ];
    data.contacts = [
      {
        id: "contact1",
        personId: "person2",
        targetType: "property",
        targetId: "p1",
        role: "Fastighetsförvaltare",
      },
    ];
    data.budgetPlans = [
      { year: 2027, status: "Låst", targets: { Underhåll: 500 }, lines: [] },
    ];
    data.importReview = [{ id: "r1", status: "pending" }];
    data.auditLog = [{ id: "a1", by: "Test" }];
    await transport.save(data);
    const restarted = await new LokalblickRepository({
      sourceAdapter,
      dataPath,
    }).initialize();
    const out = normalize(await restarted.bootstrap());
    assert.equal(out.contracts[0].annualRent, 123456);
    assert.equal(out.budgetPlans[0].status, "Låst");
    assert.equal(out.importReview[0].id, "r1");
    assert.equal(out.auditLog[0].by, "Test");
    assert.equal(out.contracts[0].provenance.annualRent.source, "Test");
    assert.equal(out.properties[0].responsiblePersonId, "person1");
    assert.equal(out.activities[0].responsiblePersonId, "person1");
    assert.equal(out.activities[0].title, "Tak");
    assert.equal(out.contacts[0].role, "Fastighetsförvaltare");
    assert.equal(out.assignments.length, 0);
  } finally {
    await new Promise((r) => server.close(r));
    await fs.rm(dir, { recursive: true, force: true });
    delete globalThis.window;
  }
});
test("locked budget baseline and adjustments remain unchanged by live activity forecast", () => {
  const d = normalize({
    contracts: [{ id: "c1", propertyId: "p1", annualRent: 100 }],
    properties: [{ id: "p1", address: "Testgatan 1" }],
    activities: [
      {
        id: "m1",
        type: "Underhåll",
        propertyId: "p1",
        planningYear: 2027,
        estimatedCost: 200,
        budgetCategory: "Underhåll",
      },
    ],
    budgetPlans: [
      {
        year: 2027,
        status: "Låst",
        targets: { Underhåll: 250 },
        lines: [
          {
            category: "Underhåll",
            amount: 200,
            sourceType: "activity",
            sourceId: "m1",
          },
        ],
      },
    ],
  });
  const before = JSON.stringify(d.budgetPlans);
  d.activities[0].estimatedCost = 300;
  const rows = globalThis.LokalblickCalculations.budgetRows(d, 2027);
  assert.equal(rows.find((x) => x.sourceId === "m1").amount, 300);
  assert.equal(JSON.stringify(d.budgetPlans), before);
});
