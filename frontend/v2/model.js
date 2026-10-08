export const collections = [
  "properties",
  "contracts",
  "organizations",
  "people",
  "orders",
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
  "contacts",
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
  legacyCollections
    .filter((key) => key !== "contacts")
    .forEach((key) => {
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

function canonicalRelations(out) {
  out.orders=Array.isArray(out.orders)?out.orders:[];
  const isOur=(id)=>{const p=out.people.find((x)=>x.id===id);if(!p)return false;if(!p.organizationId)return true;return out.organizations.find((x)=>x.id===p.organizationId)?.type==="our";};
  const validOwnerManager=(id,p)=>{const person=out.people.find(x=>x.id===id);const owner=out.organizations.find(x=>x.id===p.ownerPartyId);if(person&&/\bJULDAM\b/i.test([person.name,person.sourceId,person.id].join(" "))&&!/stadsfastigheter/i.test(owner?.name||""))return false;return Boolean(person&&p.ownerPartyId&&person.organizationId===p.ownerPartyId);};
  out.properties.forEach((p)=>{if(!p.ownerPartyId&&p.ownerOrgId)p.ownerPartyId=p.ownerOrgId;delete p.ownerOrgId;});
  out.properties.forEach(p=>{if(p.ownerResponsiblePersonId&&!validOwnerManager(p.ownerResponsiblePersonId,p))p.ownerResponsiblePersonId="";});
  out.contracts.forEach((c)=>{if(!c.businessPartyId&&c.tenantOrgId)c.businessPartyId=c.tenantOrgId;delete c.tenantOrgId;delete c.ownerOrgId;["notice","annualRent","annualAdditions","rentPerSqm","derivedRentBaseIndex","rentIndexCurrent","rentIndexYear","rentCalculationYear","calculatedAnnualRent","rentCalculationVariance","rentCalculationStatus","derivedAdditionBaseIndex","additionIndexCurrent","additionIndexYear","additionCalculationYear","calculatedAnnualAdditions","additionCalculationVariance","additionCalculationStatus"].forEach((k)=>delete c[k]);});
  (out.contacts||[]).filter((x)=>!x.toDate).forEach((c)=>{if(isOur(c.personId))return;const t=c.targetType==="object"?"contract":c.targetType;if(t==="property"){const p=out.properties.find((x)=>x.id===c.targetId);if(p&&!p.ownerResponsiblePersonId&&validOwnerManager(c.personId,p))p.ownerResponsiblePersonId=c.personId;}else if(t==="contract"){const a=out.contracts.find((x)=>x.id===c.targetId);if(a&&!a.businessResponsiblePersonId)a.businessResponsiblePersonId=c.personId;}});
  const migratedInvestigations=[];
  out.activities.forEach((a)=>{
    const investigationCost=Number(a.investigationCost)||0;
    if(investigationCost>0){
      const id="MIG-UTR|"+a.id;
      if(!out.activities.some((x)=>x.id===id)&&!migratedInvestigations.some((x)=>x.id===id))migratedInvestigations.push({
        id,type:"Utredning",propertyId:a.propertyId||"",contractId:a.contractId||"",responsiblePersonId:a.responsiblePersonId||"",
        title:(a.title||"Aktivitet")+" · utredning",description:"Migrerad separat utredningsbudget",category:a.category||"",status:a.status||"Planerad",
        priority:a.priority||"",planningYear:a.planningYear||"",planningQuarter:a.planningQuarter||"",planningMonth:a.planningMonth||"",
        budgetCategory:"Utredningar",includeInBudget:a.includeInBudget||"Ja",estimatedCost:investigationCost,phase:"Utredning",
        startDate:a.startDate||"",endDate:a.endDate||"",sourceId:a.sourceId||a.id,sourceSheet:a.sourceSheet||"",sourceRow:a.sourceRow||""
      });
    }
    if(a.contractId&&out.contracts.some((c)=>c.id===a.contractId))delete a.propertyId;
    const has=a.orderedAt||a.orderedBy||a.orderedByPersonId||a.supplier||a.orderReference||Number(a.orderedCost)||a.deliveryText||a.completedAt||Number(a.finalCost)||a.paymentStatus||a.paidAt||a.invoiceComment||a.ownerPays;
    if(has){const id="ORD|"+a.id;if(!out.orders.some((o)=>o.id===id))out.orders.push({id,activityId:a.id,orderedAt:a.orderedAt||"",orderedByPersonId:a.orderedByPersonId||"",supplier:a.supplier||"",orderReference:a.orderReference||"",orderedCost:Number(a.orderedCost)||0,deliveryText:a.deliveryText||"",completedAt:a.completedAt||"",finalCost:Number(a.finalCost)||0,paymentStatus:a.paymentStatus||"",paidAt:a.paidAt||"",invoiceComment:a.invoiceComment||"",ownerPays:a.ownerPays||""});}
    ["orderedAt","orderedBy","orderedByPersonId","supplier","orderReference","orderedCost","deliveryText","completedAt","finalCost","paymentStatus","paidAt","invoiceComment","ownerPays","finalCosts","finalCostConfirmed","investigationCost"].forEach((k)=>delete a[k]);
  });
  migratedInvestigations.forEach((a)=>{if(a.contractId&&out.contracts.some((c)=>c.id===a.contractId))delete a.propertyId;out.activities.push(a);});
  delete out.contacts;return out;
}

function obsoleteCrossObjectReviews(out) {
  const pending=(out.importReview||[]).filter(
    (x)=>x.status==="pending"&&x.kind==="operational-conflict"&&(x.collection==="properties"||x.entity==="Fastighet"),
  );
  const groups=new Map();
  pending.forEach((item)=>{
    const key=[
      item.source||"",
      item.sheet||"",
      item.row||"",
      item.recordId||item.incomingRecordId||"",
    ].join("|");
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  });
  const now=new Date().toISOString();
  groups.forEach((items)=>{
    const identityConflict=items.find(
      (x)=>x.field==="sourceId"&&String(x.current||"").trim()&&String(x.proposed||"").trim()&&String(x.current).trim()!==String(x.proposed).trim(),
    );
    if(!identityConflict)return;
    items.forEach((item)=>{
      item.status="obsolete";
      item.resolvedBy="Lokalblick";
      item.resolvedAt=now;
      item.resolutionReason="Olika objekts-ID får inte matchas som samma fastighet.";
    });
  });
  (out.sourceRegistry||[]).forEach((source)=>{
    source.review=(out.importReview||[]).filter(
      (item)=>item.status==="pending"&&(!source.name||item.source===source.name),
    ).length;
  });
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
    if (property.owner && !property.ownerPartyId)
      property.ownerPartyId = ensureOwner(property.owner);
    if (!property.ownerPartyId && property.ownerOrgId)
      property.ownerPartyId = property.ownerOrgId;
    if (property.owner && !property.sourceOwner)
      property.sourceOwner = property.owner;
    if (property.manager && !property.sourceManager)
      property.sourceManager = property.manager;
    delete property.ownerOrgId;
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
  // An activity without a home is a planning task, not an import conflict.
  // Preserve the historical review record while removing it from the open queue.
  for (const review of out.importReview) {
    if (review.status === "pending" && review.kind === "activity-property") {
      review.status = "planning";
      review.resolutionReason = "Hemvist tilldelas under Planera.";
    }
  }
  obsoleteCrossObjectReviews(out);
  for (const source of out.sourceRegistry) {
    source.review = out.importReview.filter(item =>
      item.status === "pending" && (!source.name || item.source === source.name)
    ).length;
  }
  out.contracts.forEach((c) => {
    c.start = c.start ?? c.originalValidFrom ?? "";
    c.end = c.end ?? c.currentValidTo ?? "";
    c.notice = c.notice ?? c.noticeBy ?? "";
  });
  return canonicalRelations(migrateLegacy(out));
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
  const q = String(selection.q || "").trim().toLocaleLowerCase("sv");
  const person = selection.person || "";
  const propertyById = new Map((data.properties || []).map((p) => [p.id, p]));
  const contractsByProperty = new Map();
  (data.contracts || []).forEach((c) => {
    if (!contractsByProperty.has(c.propertyId))
      contractsByProperty.set(c.propertyId, []);
    contractsByProperty.get(c.propertyId).push(c);
  });

  const contractMatchesBase = (c) => {
    const p = propertyById.get(c.propertyId) || {};
    return (
      (!selection.propertyId || c.propertyId === selection.propertyId) &&
      (!selection.unit || (c.unitId || p.unitId) === selection.unit) &&
      (!selection.owner || p.ownerPartyId === selection.owner) &&
      (!q ||
        [
          c.number,
          c.use,
          c.businessName,
          p.address,
          p.designation,
        ]
          .join(" ")
          .toLocaleLowerCase("sv")
          .includes(q))
    );
  };

  const propertyMatchesBase = (p) => {
    const related = contractsByProperty.get(p.id) || [];
    const unitMatch =
      !selection.unit ||
      p.unitId === selection.unit ||
      related.some((c) => c.unitId === selection.unit);
    const qMatch =
      !q ||
      [p.address, p.designation]
        .join(" ")
        .toLocaleLowerCase("sv")
        .includes(q) ||
      related.some((c) =>
        [c.number, c.use, c.businessName]
          .join(" ")
          .toLocaleLowerCase("sv")
          .includes(q),
      );
    return (
      (!selection.propertyId || p.id === selection.propertyId) &&
      (!selection.owner || p.ownerPartyId === selection.owner) &&
      unitMatch &&
      qMatch
    );
  };

  const baseContracts = (data.contracts || []).filter(contractMatchesBase);
  const contracts = baseContracts.filter((c) => {
    if (!person) return true;
    const p = propertyById.get(c.propertyId) || {};
    return responsible(data, "properties", p) === person;
  });

  const properties = (data.properties || []).filter((p) => {
    if (!propertyMatchesBase(p)) return false;
    return !person || responsible(data, "properties", p) === person;
  });

  const items = allItems.filter((x) => {
    const record = x.record || {};
    const contract = record.contractId
      ? (data.contracts || []).find((c) => c.id === record.contractId)
      : null;
    const propertyId = x.propertyId || contract?.propertyId || "";
    const property = propertyById.get(propertyId) || {};
    if (selection.propertyId && propertyId !== selection.propertyId) return false;
    if (selection.owner && property.ownerPartyId !== selection.owner) return false;
    if (selection.unit) {
      const relatedUnit = record.scopeType === "unit" ? record.unitId : contract
        ? (contract.unitId || property.unitId)
        : property.unitId ||
          (contractsByProperty.get(propertyId) || []).find(
            (c) => c.unitId === selection.unit,
          )?.unitId;
      if (relatedUnit !== selection.unit) return false;
    }
    if (q) {
      const haystack = [
        property.address,
        property.designation,
        contract?.number,
        contract?.use,
        contract?.businessName,
      ]
        .join(" ")
        .toLocaleLowerCase("sv");
      if (!haystack.includes(q)) return false;
    }
    if (
      person &&
      responsible(data, "activities", record) !== person
    )
      return false;
    return true;
  });

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
export function setActivityHome(data, id, selectedHome, actor) {
  const record = (data.activities || []).find(a => String(a.id) === String(id));
  if (!record) throw Error("Aktiviteten saknas");
  const before = clone(record);
  const value = String(selectedHome || "");
  if (value.startsWith("contract:")) {
    const contractId = value.slice("contract:".length);
    const contract = (data.contracts || []).find(c => String(c.id) === contractId);
    if (!contract) throw Error("Avtalet saknas");
    if (!(data.properties || []).some(p => String(p.id) === String(contract.propertyId)))
      throw Error("Avtalet saknar giltig fastighetskoppling");
    // A contract belongs to exactly one property; derive that property on read.
    record.contractId = contract.id;
    record.propertyId = "";
    record.unitId = "";
    record.scopeType = "contract";
  } else if (value.startsWith("property:")) {
    const propertyId = value.slice("property:".length);
    if (!(data.properties || []).some(p => String(p.id) === propertyId))
      throw Error("Fastigheten saknas");
    record.propertyId = propertyId;
    record.contractId = "";
    record.unitId = "";
    record.scopeType = "property";
  } else if (value.startsWith("unit:")) {
    const unitId = value.slice("unit:".length);
    if (!["VARDBO", "ORDBO", "MYND_STAB", "HOF"].includes(unitId))
      throw Error("Området saknas");
    record.propertyId = "";
    record.contractId = "";
    record.unitId = unitId;
    record.scopeType = "unit";
  } else if (value === "general" || value === "") {
    record.propertyId = "";
    record.contractId = "";
    record.unitId = "";
    record.scopeType = value === "general" ? "general" : "";
  } else {
    throw Error("Ogiltigt val av hemvist");
  }
  if (JSON.stringify(before) !== JSON.stringify(record))
    audit(data, "activities", record.id, before, record, actor);
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
// Keep one preferred source per canonical field and incoming file.
export const importPreferenceKey=(col,field,source)=>[col,field,source].map(x=>String(x||"").trim().toLocaleLowerCase("sv")).join("|");
export const reviewCollection=item=>item.collection||(item.kind==="conflict"||item.entity==="Avtal"?"contracts":item.entity==="Fastighet"?"properties":"");
export const bulkEligible=item=>item?.status==="pending"&&["conflict","operational-conflict"].includes(item.kind)&&
  Boolean(item.field)&&Boolean(item.source)&&["properties","contracts","activities"].includes(reviewCollection(item))&&
  !["id","sourceId","propertyId","contractId","hyresberäkning","tilläggsberäkning"].includes(item.field);
export function bulkReviewDecision(data,group,decision,actor) {
  if(!["accept","reject"].includes(decision))throw Error("Välj en prioriterad källa.");
  const items=(data.importReview||[]).filter(x=>bulkEligible(x)&&reviewCollection(x)===group.collection&&x.field===group.field&&x.source===group.source);
  if(!items.length)throw Error("Inga konflikter att hantera.");
  const seen=new Map();
  for(const item of items) {
    const id=item.recordId||item.contractId;
    if(!id)throw Error("Koppling till objekt saknas; välj dessa poster manuellt.");
    const key=id+"|"+item.field;
    if(seen.has(key)&&JSON.stringify(seen.get(key))!==JSON.stringify(item.proposed))
      throw Error("Motstridiga värden för samma objekt; välj dessa manuellt.");
    seen.set(key,item.proposed);
    if(decision==="accept"){
      const row=(data[group.collection]||[]).find(x=>x.id===id);
      if(!row||JSON.stringify(row[item.field]??"")!==JSON.stringify(item.current??""))
        throw Error("Befintligt värde har ändrats; granska posten manuellt.");
    }
  }
  // Repeated reports for the very same object/field/value are one real
  // decision. Mark duplicate review cards as handled without duplicate edits.
  const handled=new Set();
  const now=new Date().toISOString();
  for(const item of items) {
    const key=(item.recordId||item.contractId)+"|"+item.field;
    if(handled.has(key)) {
      item.status=decision==="accept"?"accepted":"rejected";
      item.resolvedBy=actor;
      item.resolvedAt=now;
      item.resolutionReason="Samma värde hanterades redan via källprioritet.";
    } else {
      resolveReview(data,item.id,decision,"",actor);
      handled.add(key);
    }
  }
  data.importFieldPreferences ||= {};
  data.importFieldPreferences[importPreferenceKey(group.collection,group.field,group.source)]=decision;
  return items.length;
}
export function clearSourcePreference(data,key) {
  if(!Object.prototype.hasOwnProperty.call(data.importFieldPreferences||{},key))throw Error("Regeln saknas.");
  delete data.importFieldPreferences[key];
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
      delete data.contacts;
      data.properties.forEach((x) => { if (x.responsiblePersonId === person.id) x.responsiblePersonId = ""; if (x.ownerResponsiblePersonId === person.id) x.ownerResponsiblePersonId = ""; });
      data.contracts.forEach((x) => { if (x.businessResponsiblePersonId === person.id) x.businessResponsiblePersonId = ""; });
      data.activities.forEach((x) => { if (x.responsiblePersonId === person.id) x.responsiblePersonId = ""; });
      (data.orders||[]).forEach((x) => { if (x.orderedByPersonId === person.id) x.orderedByPersonId = ""; });
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
      const collection =
        item.collection ||
        (item.entity === "Fastighet"
          ? "properties"
          : item.entity === "Avtal"
            ? "contracts"
            : "");
      const rows = Array.isArray(data[collection]) ? data[collection] : [];
      let record = rows.find((x) => x.id === item.recordId);
      if (!record && item.field) {
        const matches = rows.filter(
          (x) => JSON.stringify(x[item.field] ?? "") === JSON.stringify(item.current ?? ""),
        );
        if (matches.length === 1) record = matches[0];
      }
      if (!record) throw Error("Den registrerade posten kunde inte identifieras. Läs in filen på nytt.");
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
