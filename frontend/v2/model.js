export const collections = [
  "properties",
  "contracts",
  "organizations",
  "people",
  "assignments",
  "activities",
  "projects",
  "maintenance",
  "operations",
  "investigations",
  "maintenanceStatus",
  "driftIssues",
  "wishes",
  "budgetPlans",
  "assignmentChanges",
  "auditLog",
  "indexSeries",
  "sourceRegistry",
  "importReview",
  "documents",
];
export const kinds = {
  projects: "Projekt",
  maintenance: "Underhåll",
  maintenanceStatus: "Status",
  driftIssues: "Drift",
  wishes: "Önskemål",
  investigations: "Utredning",
  operations: "Driftkostnad",
};
export const clone = (x) => JSON.parse(JSON.stringify(x));
export function normalize(data) {
  const out = clone(data || {});
  const metadata = (out.budgetData || []).find(
    (x) => x.id === "lokalblick-v2-workspace",
  );
  if (metadata) Object.assign(out, metadata.workspace);
  collections.forEach((k) => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  out.contracts.forEach((c) => {
    c.start = c.start ?? c.originalValidFrom ?? "";
    c.end = c.end ?? c.currentValidTo ?? "";
    c.notice = c.notice ?? c.noticeBy ?? "";
  });
  return out;
}
export function activities(data) {
  return Object.entries(kinds).flatMap(([collection, label]) =>
    (data[collection] || []).map((record) => ({
      collection,
      label,
      record,
      propertyId:
        record.propertyId ||
        data.contracts.find((c) => c.id === record.contractId)?.propertyId ||
        "",
      title: record.title || record.name || record.category || record.id,
      cost:
        Number(
          record.estimatedCost ??
            record.cost ??
            record.preliminaryCost ??
            record.budget,
        ) || 0,
    })),
  );
}
function legacyAssignmentType(collection) {
  return {
    properties: "property",
    contracts: "object",
    projects: "project",
    maintenance: "maintenance",
    maintenanceStatus: "maintenanceStatus",
    driftIssues: "driftIssue",
    wishes: "wish",
    investigations: "investigation",
    operations: "operation",
  }[collection] || collection;
}
function canonicalAssignmentType(collection) {
  return Object.prototype.hasOwnProperty.call(kinds, collection)
    ? "activity"
    : legacyAssignmentType(collection);
}
export function responsible(data, collection, record) {
  const canonical = canonicalAssignmentType(collection);
  const legacy = legacyAssignmentType(collection);
  const matches = (data.assignments || []).filter(
    (a) =>
      a.targetId === record.id &&
      !a.toDate &&
      (a.targetType === canonical || a.targetType === legacy),
  );
  const assigned =
    matches.find((a) => a.role === "Ansvarig") || matches[0];
  return assigned?.personId || record.responsiblePersonId || "";
}
export function scope(data, selection) {
  const allItems = activities(data);
  const contracts = data.contracts.filter((c) => {
    const p = data.properties.find((x) => x.id === c.propertyId) || {};
    return (
      (!selection.propertyId || c.propertyId === selection.propertyId) &&
      (!selection.unit || c.unitId === selection.unit) &&
      (!selection.owner || (c.ownerOrgId || p.owner) === selection.owner) &&
      (!selection.person ||
        responsible(data, "contracts", c) === selection.person ||
        responsible(data, "properties", p) === selection.person ||
        allItems.some(
          (x) =>
            (x.record.contractId === c.id ||
              (!x.record.contractId && x.propertyId === c.propertyId)) &&
            responsible(data, x.collection, x.record) === selection.person,
        )) &&
      (!selection.q ||
        [c.number, c.use, p.address, p.designation]
          .join(" ")
          .toLocaleLowerCase("sv")
          .includes(selection.q.toLocaleLowerCase("sv")))
    );
  });
  const cids = new Set(contracts.map((x) => x.id)),
    pids = new Set(contracts.map((x) => x.propertyId));
  // Properties with no contracts remain visible when no contract-level filter excludes them.
  const properties = data.properties.filter(
    (p) =>
      pids.has(p.id) ||
      (!data.contracts.some((c) => c.propertyId === p.id) &&
        (!selection.propertyId || p.id === selection.propertyId) &&
        !selection.unit &&
        (!selection.owner || p.owner === selection.owner) &&
        (!selection.person ||
          responsible(data, "properties", p) === selection.person ||
          allItems.some(
            (x) =>
              x.propertyId === p.id &&
              responsible(data, x.collection, x.record) === selection.person,
          )) &&
        (!selection.q ||
          [p.address, p.designation]
            .join(" ")
            .toLocaleLowerCase("sv")
            .includes(selection.q.toLocaleLowerCase("sv")))),
  );
  properties.forEach((p) => pids.add(p.id));
  const items = activities(data).filter((x) =>
    x.record.contractId
      ? cids.has(x.record.contractId)
      : pids.has(x.propertyId),
  );
  return { contracts, properties, items };
}
export function audit(data, collection, id, before, after, actor) {
  const at = new Date().toISOString();
  data.auditLog.push({
    id: crypto.randomUUID(),
    at,
    by: actor,
    collection,
    recordId: id,
    action: !Object.keys(before).length ? "Skapad" : !Object.keys(after).length ? "Raderad" : "Ändrad",
    fields: [...new Set([...Object.keys(before),...Object.keys(after)])]
      .filter((k) => !["versions","createdAt","createdBy","updatedAt","updatedBy"].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => ({ field: k, from: before[k] ?? "", to: after[k] ?? "" })),
  });
}
export function assign(data, collection, id, person, actor) {
  const record = data[collection].find((x) => x.id === id);
  if (!record) throw Error("Posten finns inte");
  const old = responsible(data, collection, record);
  if (old === person) return;
  const at = new Date().toISOString();
  const type = canonicalAssignmentType(collection);
  const legacy = legacyAssignmentType(collection);
  data.assignments
    .filter(
      (a) =>
        a.targetId === id &&
        !a.toDate &&
        (a.targetType === type || a.targetType === legacy),
    )
    .forEach((a) => {
      a.toDate = at.slice(0, 10);
    });
  if (person)
    data.assignments.push({
      id: crypto.randomUUID(),
      personId: person,
      targetType: type,
      targetId: id,
      role: "Ansvarig",
      fromDate: at.slice(0, 10),
      toDate: "",
    });
  data.assignmentChanges.push({
    id: crypto.randomUUID(),
    targetType: type,
    targetId: id,
    fromPersonId: old,
    toPersonId: person,
    changedAt: at,
    changedBy: actor,
  });
}
export function moveWish(data, id, target, actor) {
  if (!["maintenance", "driftIssues"].includes(target))
    throw Error("Ogiltig målsamling");
  const i = data.wishes.findIndex((x) => x.id === id);
  if (i < 0) throw Error("Önskemålet saknas");
  const wish = data.wishes[i];
  const record = {
    ...wish,
    originWishId: id,
    year: Number(wish.budgetYear) || new Date().getFullYear() + 1,
    cost: Number(wish.estimatedCost) || 0,
    includeInBudget: "Ja",
    status: "Planerad",
  };
  data.assignments
    .filter((a) => a.targetType === "wish" && a.targetId === id)
    .forEach((a) => {
      a.targetType = "activity";
    });
  data[target].push(record);
  data.wishes.splice(i, 1);
  data.auditLog.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    by: actor,
    collection: target,
    recordId: id,
    action: "Flyttad från önskemål",
    fields: [],
  });
}
export function resolveReview(data, id, decision, targetId, actor) {
  const item = data.importReview.find((x) => x.id === id);
  if (!item || item.status !== "pending")
    throw Error("Förslaget är redan hanterat");

  if (item.kind === "person") {
    const person = data.people.find((x) => x.id === item.personId);
    if (decision === "accept" && person) {
      person.identityStatus = person.provisional
        ? "reviewed-provisional"
        : "confirmed";
    }
    if (decision === "reject" && person?.provisional) {
      data.assignments = data.assignments.filter(
        (a) => a.personId !== person.id,
      );
      data.people = data.people.filter((x) => x.id !== person.id);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "property-match") {
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "activity-property") {
    if (decision === "accept") {
      if (!data.properties.some((p) => p.id === targetId))
        throw Error("Välj en befintlig fastighet");
      const record = data[item.collection]?.find(
        (x) => x.id === item.recordId,
      );
      if (!record) throw Error("Aktiviteten finns inte");
      const before = clone(record);
      record.propertyId = targetId;
      record.provenance = record.provenance || {};
      record.provenance.propertyId = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value: targetId,
        confirmedBy: actor,
      };
      audit(data, item.collection, record.id, before, record, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "operational-conflict") {
    if (decision === "accept") {
      const record = data[item.collection]?.find(
        (x) => x.id === item.recordId,
      );
      if (!record) throw Error("Posten finns inte");
      const before = clone(record);
      record[item.field] = item.proposed;
      record.provenance = record.provenance || {};
      record.provenance[item.field] = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value: item.proposed,
        confirmedBy: actor,
      };
      audit(data, item.collection, record.id, before, record, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (decision === "accept" && item.kind === "record") {
    const allowed = [
      "projects",
      "maintenance",
      "operations",
      "investigations",
      "maintenanceStatus",
      "driftIssues",
      "wishes",
    ];
    if (!allowed.includes(item.collection)) throw Error("Ogiltig importtyp");
    const existing = data[item.collection].find((r) => r.id === item.recordId);
    const record = clone(item.record);
    record.id = existing?.id || crypto.randomUUID();
    record.propertyId = targetId || record.propertyId;
    if (!data.properties.some((p) => p.id === record.propertyId))
      throw Error("Välj en befintlig fastighet");
    if (
      record.contractId &&
      !data.contracts.some(
        (c) => c.id === record.contractId && c.propertyId === record.propertyId,
      )
    )
      throw Error("Avtalet tillhör en annan fastighet");
    record.provenance = existing?.provenance || {};
    Object.keys(record)
      .filter((k) => k !== "provenance")
      .forEach((k) => {
        record.provenance[k] = {
          source: item.source,
          sheet: item.sheet,
          row: item.row,
          value: record[k],
          confirmedBy: actor,
        };
      });
    if (existing) {
      const before = clone(existing);
      Object.assign(existing, record);
      audit(data, item.collection, record.id, before, existing, actor);
    } else {
      data[item.collection].push(record);
      audit(data, item.collection, record.id, {}, record, actor);
    }
    item.status = "accepted";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }
  if (decision === "accept") {
    const contract = data.contracts.find(
      (x) => x.id === (item.contractId || targetId),
    );
    if (!contract) throw Error("Välj ett befintligt avtal");
    const before = clone(contract);
    contract.provenance = contract.provenance || {};
    const apply = (key, value) => {
      contract[key] = value;
      contract.provenance[key] = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value,
        confirmedBy: actor,
      };
    };
    if (item.kind === "conflict") {
      if (["hyresberäkning", "tilläggsberäkning"].includes(item.field))
        throw Error("Beräkningsavvikelsen måste kontrolleras i avtalet");
      apply(item.field, item.proposed);
    } else {
      Object.entries(item.record || {})
        .filter(
          ([k, v]) =>
            ![
              "id",
              "number",
              "sourceRow",
              "designation",
              "address",
              "targetYear",
              "landlord",
              "department",
            ].includes(k) &&
            v !== "" &&
            v != null &&
            v !== 0,
        )
        .forEach(([k, v]) => {
          const key =
            {
              documentUrl: "contractDocumentUrl",
              documentName: "contractDocumentName",
              documentKind: "contractDocumentKind",
            }[k] || k;
          if (
            contract[key] == null ||
            contract[key] === "" ||
            contract[key] === 0
          )
            apply(key, v);
          else if (contract[key] !== v)
            data.importReview.push({
              id: crypto.randomUUID(),
              kind: "conflict",
              source: item.source,
              sheet: item.sheet,
              row: item.row,
              contractId: contract.id,
              field: key,
              current: contract[key],
              proposed: v,
              status: "pending",
            });
        });
    }
    audit(data, "contracts", contract.id, before, contract, actor);
    item.contractId = contract.id;
  }
  item.status = decision === "accept" ? "accepted" : "rejected";
  item.resolvedBy = actor;
  item.resolvedAt = new Date().toISOString();
}
