export const collections = [
  "properties",
  "contracts",
  "organizations",
  "people",
  "contacts",
  "activities",
  "operations",
  "maintenanceStatus",
  "budgetPlans",
  "auditLog",
  "indexSeries",
  "sourceRegistry",
  "importReview",
  "documents",
];
export const kinds = {
  activities: "Aktivitet",
  operations: "Kostnad",
  maintenanceStatus: "Status",
};
export const clone = (x) => JSON.parse(JSON.stringify(x));

const legacyCollections = [
  "assignments",
  "projects",
  "maintenance",
  "investigations",
  "driftIssues",
  "wishes",
  "assignmentChanges",
];

function legacyExtras(item) {
  return {
    includeInBudget:
      item.includeInBudget || (item.budgetIncluded === false ? "Nej" : "Ja"),
    finalCosts: item.finalCosts || undefined,
    finalCostConfirmed: Boolean(item.finalCostConfirmed),
    provenance: clone(item.provenance || {}),
    createdAt: item.createdAt || "",
    createdBy: item.createdBy || "",
    updatedAt: item.updatedAt || "",
    updatedBy: item.updatedBy || "",
  };
}
function orderFields(item) {
  return {
    orderedAt: item.orderedAt || "",
    orderedBy: item.orderedBy || "",
    orderedByPersonId: item.orderedByPersonId || "",
    supplier: item.supplier || "",
    orderReference: item.orderReference || "",
    orderedCost: Number(item.orderedCost) || 0,
    deliveryText: item.deliveryText || "",
    completedAt: item.completedAt || item.completedDate || "",
    finalCost: Number(item.finalCost) || 0,
    paymentStatus: item.paymentStatus || "",
    paidAt: item.paidAt || "",
    invoiceComment: item.invoiceComment || "",
    sourceId: item.sourceId || "",
    sourceSheet: item.sourceSheet || "",
    sourceRow: item.sourceRow || "",
    ownerPays: item.ownerPays || "",
  };
}
function legacyActivities(out) {
  const rows = [];
  const push = (activity) => {
    if (!activity?.id || rows.some((x) => x.id === activity.id)) return;
    rows.push(activity);
  };
  (out.projects || []).forEach((item) => {
    const execution = Number(item.budgetExecution) || 0;
    const furnishing = Number(item.budgetFurnishing) || 0;
    push({
      ...legacyExtras(item),
      id: item.id,
      type: "Projekt",
      propertyId: item.propertyId || "",
      contractId: item.contractId || "",
      responsiblePersonId: item.responsiblePersonId || "",
      title: item.name || "",
      description: item.description || "",
      category: "",
      status: item.status || "",
      priority: "",
      planningYear: item.budgetYear || "",
      planningQuarter: item.planningQuarter || "",
      planningMonth: item.planningMonth || "",
      budgetCategory: "Projekt",
      estimatedCost:
        execution + furnishing || Number(item.preliminaryCost) || 0,
      investigationCost: Number(item.budgetInvestigation) || 0,
      phase: item.phase || "",
      startDate: item.start || "",
      endDate: item.end || "",
      ...orderFields(item),
    });
  });
  (out.maintenance || []).forEach((item) =>
    push({
      ...legacyExtras(item),
      id: item.id,
      type: "Underhåll",
      propertyId: item.propertyId || "",
      contractId: item.contractId || "",
      responsiblePersonId: item.responsiblePersonId || "",
      title: item.title || "",
      description: item.description || "",
      category: item.category || "",
      status: item.status || "",
      priority: item.priority || "",
      planningYear: item.year || "",
      planningQuarter: item.planningQuarter || "",
      planningMonth: item.planningMonth || "",
      budgetCategory: "Underhåll",
      estimatedCost: Number(item.cost) || 0,
      investigationCost: 0,
      phase: "",
      startDate: "",
      endDate: "",
      ...orderFields(item),
    }),
  );
  (out.driftIssues || []).forEach((item) =>
    push({
      ...legacyExtras(item),
      id: item.id,
      type: "Drift",
      propertyId: item.propertyId || "",
      contractId: item.contractId || "",
      responsiblePersonId: item.responsiblePersonId || "",
      title: item.title || "",
      description: item.description || "",
      category: item.category || "",
      status: item.status || "",
      priority: item.priority || "",
      planningYear: item.budgetYear || "",
      planningQuarter: item.planningQuarter || "",
      planningMonth: item.planningMonth || "",
      budgetCategory: "Driftkostnader",
      estimatedCost: Number(item.estimatedCost) || 0,
      investigationCost: 0,
      phase: "",
      startDate: item.createdDate || "",
      endDate: item.targetDate || "",
      ...orderFields(item),
    }),
  );
  (out.wishes || []).forEach((item) =>
    push({
      ...legacyExtras(item),
      id: item.id,
      type: "Önskemål",
      propertyId: item.propertyId || "",
      contractId: item.contractId || "",
      responsiblePersonId: item.responsiblePersonId || "",
      title: item.title || "",
      description: item.description || "",
      category: item.category || "",
      status: item.status || "",
      priority: item.priority || "",
      planningYear: item.budgetYear || "",
      planningQuarter: item.planningQuarter || "",
      planningMonth: item.planningMonth || "",
      budgetCategory: item.budgetCategory || "Ej budget",
      estimatedCost: Number(item.estimatedCost) || 0,
      investigationCost: 0,
      phase: "",
      startDate: item.createdDate || "",
      endDate: item.targetDate || "",
      ...orderFields(item),
    }),
  );
  (out.investigations || []).forEach((item) =>
    push({
      ...legacyExtras(item),
      id: item.id,
      type: "Utredning",
      propertyId: item.propertyId || "",
      contractId: item.contractId || "",
      responsiblePersonId: item.responsiblePersonId || "",
      title: item.title || "",
      description: item.description || "",
      category: item.category || "",
      status: item.status || "",
      priority: item.priority || "",
      planningYear: item.year || "",
      planningQuarter: item.planningQuarter || "",
      planningMonth: item.planningMonth || "",
      budgetCategory: "Utredningar",
      estimatedCost: Number(item.cost) || 0,
      investigationCost: 0,
      phase: "",
      startDate: "",
      endDate: "",
      ...orderFields(item),
    }),
  );
  return rows;
}
function legacyType(type) {
  return {
    project: "Projekt",
    maintenance: "Underhåll",
    driftIssue: "Drift",
    wish: "Önskemål",
    investigation: "Utredning",
  }[type];
}
function addContact(out, assignment, targetType, targetId, role) {
  if (!assignment?.personId || !targetId) return;
  const normalized = targetType === "object" ? "contract" : targetType;
  if (!["property", "contract"].includes(normalized)) return;
  const exists = out.contacts.some(
    (x) =>
      x.personId === assignment.personId &&
      x.targetType === normalized &&
      x.targetId === targetId &&
      (x.role || "") === (role || "") &&
      !x.toDate,
  );
  if (!exists)
    out.contacts.push({
      id: assignment.id || crypto.randomUUID(),
      personId: assignment.personId,
      targetType: normalized,
      targetId,
      role: role || "Kontakt",
      fromDate: assignment.fromDate || "",
      toDate: assignment.toDate || "",
    });
}
function migrateLegacy(out) {
  const byActivity = new Map(out.activities.map((x) => [x.id, x]));
  for (const activity of legacyActivities(out)) {
    if (!byActivity.has(activity.id)) {
      out.activities.push(activity);
      byActivity.set(activity.id, activity);
    }
  }
  out.activities.forEach((activity) => {
    if (!activity.includeInBudget && activity.budgetIncluded === false)
      activity.includeInBudget = "Nej";
    else if (!activity.includeInBudget && activity.budgetIncluded === true)
      activity.includeInBudget = "Ja";
    delete activity.budgetIncluded;
  });
  (out.maintenanceStatus || []).forEach((status) => {
    if (!status.actionNeed && !(Number(status.estimatedCost) > 0)) return;
    const id = "STATUS-ACT|" + status.id;
    if (byActivity.has(id)) return;
    const activity = {
      id,
      type: "Underhåll",
      propertyId: status.propertyId || "",
      contractId: status.contractId || "",
      responsiblePersonId: status.responsiblePersonId || "",
      title:
        [status.category, status.actionNeed].filter(Boolean).join(" · ") ||
        "Åtgärdsbehov",
      description: status.comment || "",
      category: status.category || "",
      status: /bra/i.test(String(status.status || ""))
        ? "Identifierad"
        : status.status || "Identifierad",
      priority: status.priority || "",
      planningYear: status.budgetYear || "",
      planningQuarter: status.planningQuarter || "",
      planningMonth: status.planningMonth || "",
      budgetCategory: "Underhåll",
      includeInBudget: status.includeInBudget || "Ja",
      estimatedCost: Number(status.estimatedCost) || 0,
      investigationCost: 0,
      phase: "",
      startDate: status.assessedDate || "",
      endDate: "",
      sourceId: status.id,
      sourceSheet: "Status",
      sourceRow: "",
    };
    out.activities.push(activity);
    byActivity.set(id, activity);
  });

  const personName = (id) => out.people.find((x) => x.id === id)?.name || "";
  const isOurPerson = (id) => {
    const person = out.people.find((x) => x.id === id);
    if (!person) return false;
    if (!person.organizationId) return true;
    return out.organizations.find((x) => x.id === person.organizationId)?.type === "our";
  };
  const responsibilityRole = (role) =>
    /ansvar|projektledare|objektansvar/i.test(String(role || ""));
  (out.assignments || []).forEach((assignment) => {
    if (assignment.toDate) return;
    if (
      assignment.targetType === "property" &&
      isOurPerson(assignment.personId) &&
      responsibilityRole(assignment.role)
    ) {
      const property = out.properties.find((x) => x.id === assignment.targetId);
      if (property && !property.responsiblePersonId)
        property.responsiblePersonId = assignment.personId;
      return;
    }
    if (
      assignment.targetType === "activity" &&
      isOurPerson(assignment.personId) &&
      responsibilityRole(assignment.role)
    ) {
      const activity = byActivity.get(assignment.targetId);
      if (activity && !activity.responsiblePersonId)
        activity.responsiblePersonId = assignment.personId;
      return;
    }
    if (
      assignment.targetType === "maintenanceStatus" &&
      isOurPerson(assignment.personId) &&
      responsibilityRole(assignment.role)
    ) {
      const activity = byActivity.get("STATUS-ACT|" + assignment.targetId);
      if (activity && !activity.responsiblePersonId)
        activity.responsiblePersonId = assignment.personId;
      return;
    }
    const mappedType = legacyType(assignment.targetType);
    if (
      mappedType &&
      isOurPerson(assignment.personId) &&
      responsibilityRole(assignment.role)
    ) {
      const activity = byActivity.get(assignment.targetId);
      if (activity && !activity.responsiblePersonId)
        activity.responsiblePersonId = assignment.personId;
      return;
    }
    if (
      (assignment.targetType === "activity" || mappedType) &&
      assignment.role === "Beställare"
    ) {
      const activity = byActivity.get(assignment.targetId);
      if (activity) {
        activity.orderedByPersonId ||= assignment.personId;
        activity.orderedBy ||= personName(assignment.personId);
      }
      return;
    }
    if (
      ["object", "contract"].includes(assignment.targetType) &&
      isOurPerson(assignment.personId) &&
      responsibilityRole(assignment.role)
    ) {
      const contract = out.contracts.find((x) => x.id === assignment.targetId);
      const property = out.properties.find((x) => x.id === contract?.propertyId);
      if (property && !property.responsiblePersonId)
        property.responsiblePersonId = assignment.personId;
      return;
    }
    addContact(
        out,
        assignment,
        assignment.targetType,
        assignment.targetId,
        assignment.role,
      );
  });

  (out.assignmentChanges || []).forEach((change) => {
    const id =
      "legacy-assignment|" +
      String(change.id || change.changedAt || change.targetId || "");
    if (out.auditLog.some((x) => x.id === id)) return;
    out.auditLog.push({
      id,
      at: change.changedAt || "",
      by: change.changedBy || "Migrerad historik",
      collection: "responsibility",
      recordId: change.targetId || "",
      action: "Ansvar ändrat",
      fields: [
        {
          field: "responsiblePersonId",
          from: change.fromPersonId || "",
          to: change.toPersonId || "",
        },
      ],
    });
  });
  legacyCollections.forEach((key) => {
    out[key] = [];
  });
  (out.maintenanceStatus || []).forEach((status) => {
    delete status.responsiblePersonId;
  });
  const migrateLine = (line) => {
    if (!line) return line;
    if (
      ["project", "maintenance", "investigation", "driftIssue", "wish"].includes(
        line.sourceType,
      )
    )
      line.sourceType = "activity";
    if (line.sourceType === "maintenanceStatus") {
      line.sourceType = "activity";
      line.sourceId = "STATUS-ACT|" + line.sourceId;
    }
    return line;
  };
  (out.budgetPlans || []).forEach((plan) => {
    (plan.lines || []).forEach(migrateLine);
    (plan.versions || []).forEach((version) =>
      (version.snapshot?.lines || []).forEach(migrateLine),
    );
  });
  return out;
}

function normalizeOwnerRelations(out) {
  const key = (name) =>
    String(name || "")
      .trim()
      .toLocaleLowerCase("sv")
      .replace(/[^a-zåäö0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const ensureOwner = (name) => {
    const label = String(name || "").trim();
    if (!label) return "";
    let org = out.organizations.find(
      (x) =>
        x.type === "owner" &&
        String(x.name || "").trim().toLocaleLowerCase("sv") ===
          label.toLocaleLowerCase("sv"),
    );
    if (!org) {
      org = {
        id: "OWNER|" + key(label),
        name: label,
        type: "owner",
        ownerClass: "",
      };
      out.organizations.push(org);
    }
    return org.id;
  };
  out.properties.forEach((property) => {
    if (property.owner && !property.ownerOrgId)
      property.ownerOrgId = ensureOwner(property.owner);
    if (property.owner && !property.sourceOwner)
      property.sourceOwner = property.owner;
    if (property.manager && !property.sourceManager)
      property.sourceManager = property.manager;
    delete property.owner;
    delete property.manager;
  });
}
export function normalize(data) {
  const out = clone(data || {});
  const metadata = (out.budgetData || []).find(
    (x) => x.id === "lokalblick-v2-workspace",
  );
  if (metadata) Object.assign(out, metadata.workspace);
  [...collections, ...legacyCollections].forEach((k) => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  normalizeOwnerRelations(out);
  out.contracts.forEach((c) => {
    c.start = c.start ?? c.originalValidFrom ?? "";
    c.end = c.end ?? c.currentValidTo ?? "";
    c.notice = c.notice ?? c.noticeBy ?? "";
  });
  return migrateLegacy(out);
}
export function activities(data) {
  return (data.activities || []).map((record) => ({
    collection: "activities",
    label: record.type || "Aktivitet",
    record,
    propertyId:
      record.propertyId ||
      data.contracts.find((c) => c.id === record.contractId)?.propertyId ||
      "",
    title: record.title || record.category || record.id,
    cost: Number(record.estimatedCost) || 0,
  }));
}
export function responsible(data, collection, record) {
  if (!record) return "";
  if (collection === "properties") return record.responsiblePersonId || "";
  if (collection === "activities") return record.responsiblePersonId || "";
  if (collection === "contracts") {
    const property = data.properties.find((x) => x.id === record.propertyId);
    return property?.responsiblePersonId || "";
  }
  return "";
}
export function scope(data, selection) {
  const allItems = activities(data);
  const contracts = data.contracts.filter((c) => {
    const p = data.properties.find((x) => x.id === c.propertyId) || {};
    return (
      (!selection.propertyId || c.propertyId === selection.propertyId) &&
      (!selection.unit || c.unitId === selection.unit) &&
      (!selection.owner || (c.ownerOrgId || p.ownerOrgId) === selection.owner) &&
      (!selection.person ||
        responsible(data, "properties", p) === selection.person ||
        allItems.some(
          (x) =>
            (x.record.contractId === c.id ||
              (!x.record.contractId && x.propertyId === c.propertyId)) &&
            responsible(data, "activities", x.record) === selection.person,
        )) &&
      (!selection.q ||
        [c.number, c.use, p.address, p.designation]
          .join(" ")
          .toLocaleLowerCase("sv")
          .includes(selection.q.toLocaleLowerCase("sv")))
    );
  });
  const cids = new Set(contracts.map((x) => x.id));
  const pids = new Set(contracts.map((x) => x.propertyId));
  const properties = data.properties.filter(
    (p) =>
      pids.has(p.id) ||
      (!data.contracts.some((c) => c.propertyId === p.id) &&
        (!selection.propertyId || p.id === selection.propertyId) &&
        !selection.unit &&
        (!selection.owner || p.ownerOrgId === selection.owner) &&
        (!selection.person ||
          responsible(data, "properties", p) === selection.person ||
          allItems.some(
            (x) =>
              x.propertyId === p.id &&
              responsible(data, "activities", x.record) === selection.person,
          )) &&
        (!selection.q ||
          [p.address, p.designation]
            .join(" ")
            .toLocaleLowerCase("sv")
            .includes(selection.q.toLocaleLowerCase("sv")))),
  );
  properties.forEach((p) => pids.add(p.id));
  const items = allItems.filter((x) =>
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
    action: !Object.keys(before).length
      ? "Skapad"
      : !Object.keys(after).length
        ? "Raderad"
        : "Ändrad",
    fields: [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(
        (k) =>
          !["versions", "createdAt", "createdBy", "updatedAt", "updatedBy"].includes(
            k,
          ) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      )
      .map((k) => ({
        field: k,
        from: before[k] ?? "",
        to: after[k] ?? "",
      })),
  });
}
export function assign(data, collection, id, person, actor) {
  let targetCollection = collection;
  if (!["properties", "activities"].includes(targetCollection)) {
    if (
      ["projects", "maintenance", "driftIssues", "wishes", "investigations"].includes(
        targetCollection,
      )
    )
      targetCollection = "activities";
    else throw Error("Ansvar kan sättas på fastighet eller aktivitet");
  }
  const record = data[targetCollection].find((x) => x.id === id);
  if (!record) throw Error("Posten finns inte");
  if (person) {
    const selected = data.people.find((x) => x.id === person);
    if (!selected) throw Error("Ansvarig person finns inte");
    if (selected.organizationId) {
      const organization = data.organizations.find(
        (x) => x.id === selected.organizationId,
      );
      if (organization && organization.type !== "our")
        throw Error("Ansvarig hos oss måste tillhöra vår organisation");
    }
  }
  const old = record.responsiblePersonId || "";
  if (old === person) return;
  const before = clone(record);
  record.responsiblePersonId = person || "";
  audit(data, targetCollection, id, before, record, actor);
}
export function moveWish(data, id, target, actor) {
  const nextType =
    target === "maintenance" || target === "Underhåll"
      ? "Underhåll"
      : target === "driftIssues" || target === "Drift"
        ? "Drift"
        : "";
  if (!nextType) throw Error("Ogiltig aktivitetstyp");
  const activity = data.activities.find((x) => x.id === id);
  if (!activity || activity.type !== "Önskemål")
    throw Error("Önskemålet saknas");
  const before = clone(activity);
  activity.type = nextType;
  activity.status = "Planerad";
  activity.budgetCategory =
    nextType === "Underhåll" ? "Underhåll" : "Driftkostnader";
  audit(data, "activities", id, before, activity, actor);
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
      data.contacts = data.contacts.filter((x) => x.personId !== person.id);
      data.properties.forEach((x) => {
        if (x.responsiblePersonId === person.id) x.responsiblePersonId = "";
      });
      data.activities.forEach((x) => {
        if (x.responsiblePersonId === person.id) x.responsiblePersonId = "";
        if (x.orderedByPersonId === person.id) x.orderedByPersonId = "";
      });
      data.people = data.people.filter((x) => x.id !== person.id);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "property-match") {
    if (decision === "accept") {
      const property = data.properties.find((p) => p.id === targetId);
      if (!property) throw Error("Välj en befintlig fastighet");
      const before = clone(property);
      const source = item.record || {};
      if (!property.name && source.name) property.name = source.name;
      if (!property.address && source.address) property.address = source.address;
      if (!property.designation && source.designation)
        property.designation = source.designation;
      property.sourceAliases = [
        ...new Set(
          [
            ...(property.sourceAliases || []),
            source.objectNo,
            source.name,
            source.address,
            source.designation,
          ].filter(Boolean),
        ),
      ];
      property.provenance = property.provenance || {};
      property.provenance.sourceAliases = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value: property.sourceAliases,
        confirmedBy: actor,
      };
      audit(data, "properties", property.id, before, property, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "activity-property") {
    if (decision === "accept") {
      const property = data.properties.find((p) => p.id === targetId);
      if (!property) throw Error("Välj en befintlig fastighet");
      const record = data.activities.find((x) => x.id === item.recordId);
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
      property.sourceAliases = [
        ...new Set(
          [
            ...(property.sourceAliases || []),
            item.record?.business,
            item.record?.address,
          ].filter(Boolean),
        ),
      ];
      audit(data, "activities", record.id, before, record, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "operational-conflict") {
    if (decision === "accept") {
      const collection = item.collection === "activities" ? "activities" : item.collection;
      const record = data[collection]?.find((x) => x.id === item.recordId);
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
      audit(data, collection, record.id, before, record, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (decision === "accept" && item.kind === "record") {
    const allowed = ["activities", "operations", "maintenanceStatus"];
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
