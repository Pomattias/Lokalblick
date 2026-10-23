import test from "node:test";
import assert from "node:assert/strict";
import { handleBudgetAction } from "../frontend/v2/budget-actions.js";
import "../frontend/domain/calculations.js";
import "../frontend/domain/budget-followup.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const calculations = globalThis.LokalblickCalculations;

function workspace() {
  return {
    contracts: [],
    activities: [
      { id: "I1", type: "Projekt", planningYear: 2027, estimatedCost: 100 },
    ],
    indexSeries: [{ year: 2026, month: 10, value: 420, seriesBase: "1980" }],
    budgetPlans: [],
  };
}

function harness(initial = workspace(), confirmed = true) {
  let saved = clone(initial);
  const writes = [],
    indexLoads = [];
  const dependencies = {
    getData: () => saved,
    ui: { year: 2027 },
    // Emulate the existing mutation boundary: failed mutations never replace
    // persisted state, and successful saves replace the in-memory workspace.
    async mutation(change) {
      const next = clone(saved);
      change(next);
      saved = clone(next);
      writes.push(clone(saved));
    },
    actor: () => "Syntetisk testare",
    render() {},
    showBudgetAdjustment() {},
    async loadBudgetIndex(...args) {
      indexLoads.push(args);
    },
    calc: () => calculations,
    clone,
    confirm: () => confirmed,
  };
  return {
    data: () => saved,
    writes,
    indexLoads,
    async click(action) {
      await handleBudgetAction(
        {
          dataset: {},
          hasAttribute: (attribute) => attribute === `data-budget-${action}`,
        },
        dependencies,
      );
    },
  };
}

test("budget buttons preserve the locked baseline after source edits and a new version", async () => {
  const app = harness();
  await app.click("create");
  await app.click("lock");
  const locked = clone(app.data().budgetPlans[0]);
  assert.equal(locked.status, "Låst");
  assert.equal(locked.lines[0].amount, 100);
  assert.equal(locked.lines[0].sourceSnapshot.estimatedCost, 100);
  assert.equal(locked.lockedBy, "Syntetisk testare");
  assert.equal(locked.lockedIndexValue, 420);

  app.data().activities[0].estimatedCost = 200;
  assert.deepEqual(app.data().budgetPlans[0], locked);
  await app.click("reopen");
  const plan = app.data().budgetPlans[0];
  assert.equal(plan.status, "Arbetsbudget");
  assert.deepEqual(plan.versions[0].snapshot, locked);
  plan.lines[0].amount = 300;
  assert.equal(plan.versions[0].snapshot.lines[0].amount, 100);
  assert.deepEqual(app.indexLoads, [[2027]]);
});

test("canceling lock or reopen does not save or refresh index data", async () => {
  const initial = workspace();
  initial.budgetPlans = [{ year: 2027, status: "Arbetsbudget", lines: [] }];
  const app = harness(initial, false);
  await app.click("lock");
  await app.click("reopen");
  assert.deepEqual(app.data(), initial);
  assert.equal(app.writes.length, 0);
  assert.deepEqual(app.indexLoads, []);
});

test("invalid budget sources cannot leave a partially locked saved plan", async () => {
  const initial = workspace();
  initial.activities[0].startDate = "2027-02-30";
  initial.budgetPlans = [{ year: 2027, status: "Arbetsbudget", lines: [] }];
  const app = harness(initial);
  await assert.rejects(app.click("lock"), /ogiltiga datum/);
  assert.deepEqual(app.data(), initial);
  assert.equal(app.writes.length, 0);
});

test("resetting a scenario preserves source terms and published index observations", async () => {
  const initial = workspace();
  initial.budgetPlans = [
    { year: 2027, status: "Arbetsbudget", preliminaryIndex: 460 },
  ];
  const app = harness(initial);
  await app.click("index-reset");
  const saved = app.data(),
    plan = saved.budgetPlans[0];
  assert.equal(plan.preliminaryIndex, 0);
  assert.equal(plan.preliminaryIndexUpdatedBy, "Syntetisk testare");
  assert.ok(plan.preliminaryIndexUpdatedAt);
  assert.deepEqual(saved.activities, initial.activities);
  assert.deepEqual(saved.indexSeries, initial.indexSeries);
  assert.deepEqual(
    plan.targets,
    calculations.summarize(calculations.budgetProposal(saved, 2027)),
  );
});

test("a locked scenario cannot be reset through the button handler", async () => {
  const initial = workspace();
  initial.budgetPlans = [{ year: 2027, status: "Låst", preliminaryIndex: 460 }];
  const app = harness(initial);
  await assert.rejects(app.click("index-reset"), /ny budgetversion/);
  assert.deepEqual(app.data(), initial);
  assert.equal(app.writes.length, 0);
});

test("an explicit index refresh uses the selected year without saving business data", async () => {
  const app = harness();
  await app.click("index");
  await app.click("unrelated");
  assert.deepEqual(app.indexLoads, [[2027, true]]);
  assert.equal(app.writes.length, 0);
});
