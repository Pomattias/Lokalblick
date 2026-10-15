import test from "node:test";
import assert from "node:assert/strict";
import { activities, scope, setActivityHome } from "../frontend/v2/model.js";

function example() {
  return {
    properties: [
      { id: "p1", address: "Exempelvägen 1", unitId: "VARDBO" },
      { id: "p2", address: "Exempelvägen 2", unitId: "ORDBO" },
    ],
    contracts: [
      { id: "c1", number: "1001", propertyId: "p1", unitId: "VARDBO", businessName: "A" },
      { id: "c2", number: "1002", propertyId: "p1", unitId: "", businessName: "B" },
    ],
    activities: [{ id: "a1", title: "Kontroll av installation", estimatedCost: 2500 }],
    people: [],
    organizations: [],
    auditLog: [],
  };
}

test("activity can be assigned to one of several contracts in the same property", () => {
  const data = example();
  setActivityHome(data, "a1", "contract:c2", "Testperson");
  const activity = data.activities[0];
  assert.equal(activity.contractId, "c2");
  assert.equal(activity.scopeType, "contract");
  assert.equal(activity.propertyId, "");
  assert.equal(activities(data)[0].propertyId, "p1");
  assert.equal(scope(data, { propertyId: "p1" }).items.length, 1);
  assert.equal(scope(data, { propertyId: "p2" }).items.length, 0);
  assert.equal(scope(data, { unit: "VARDBO" }).items.length, 1);
  assert.equal(scope(data, { unit: "ORDBO" }).items.length, 0);
  assert.equal(data.auditLog.length, 1);
});

test("switching to a property clears the previous contract", () => {
  const data = example();
  setActivityHome(data, "a1", "contract:c1", "Testperson");
  setActivityHome(data, "a1", "property:p2", "Testperson");
  assert.deepEqual(
    [data.activities[0].contractId, data.activities[0].propertyId, data.activities[0].scopeType],
    ["", "p2", "property"]
  );
  assert.equal(scope(data, { propertyId: "p1" }).items.length, 0);
  assert.equal(scope(data, { propertyId: "p2" }).items.length, 1);
});

test("area and general activities have no stale property or contract link", () => {
  const data = example();
  setActivityHome(data, "a1", "contract:c1", "Testperson");
  setActivityHome(data, "a1", "unit:ORDBO", "Testperson");
  assert.equal(data.activities[0].contractId, "");
  assert.equal(data.activities[0].propertyId, "");
  assert.equal(scope(data, { unit: "ORDBO" }).items.length, 1);
  setActivityHome(data, "a1", "general", "Testperson");
  assert.equal(data.activities[0].unitId, "");
  assert.equal(data.activities[0].scopeType, "general");
  assert.equal(scope(data, {}).items.length, 1);
});

test("unknown contract is rejected without changing the activity", () => {
  const data = example();
  assert.throws(() => setActivityHome(data, "a1", "contract:does-not-exist", "Testperson"), /Avtalet saknas/);
  assert.equal(data.activities[0].contractId, undefined);
  assert.equal(data.auditLog.length, 0);
});

test("selecting the same home again does not duplicate the audit entry", () => {
  const data = example();
  setActivityHome(data, "a1", "contract:c1", "Testperson");
  setActivityHome(data, "a1", "contract:c1", "Testperson");
  assert.equal(data.auditLog.length, 1);
});
