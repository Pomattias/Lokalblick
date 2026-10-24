import { consolidateImportReviews } from "./import-conflicts.js";
import { resolvePropertyId } from "./property-identity.js";
import { refreshImportReceipt } from "./import-receipt.js";
import { tables, validateData, sameRecordFacts } from "./model.js";
import { viewCollections } from "./view-fields.js";
import { projectWorkspace } from "./view-adapter.js";
import { hashImportIdentity as hash } from "./import-identities.js";
import { contactPart } from "../services/import-person-links.js";

const clone = (value) => structuredClone(value);

function countImportedRecords(data, prior, touched, aliases, reviews) {
  const recordStates = {};
  const counts = Object.entries({...viewCollections,contacts:'contacts'}).map(([table, collection]) => {
    const old = new Map(
      prior[table].map((row) => [
        table === "properties" ? resolvePropertyId(aliases, row.id) : row.id,
        row,
      ]),
    );
    recordStates[collection] = Object.create(null);
    let created = 0,
      updated = 0,
      unchanged = 0;
    for (const record of data[table]) {
      if (!touched[table].has(record.id)) continue;
      const before = old.get(record.id);
      recordStates[collection][record.id] = !before
        ? "created"
        : !sameRecordFacts(before,record)
          ? "updated"
          : "unchanged";
      if (!before) created++;
      else if (!sameRecordFacts(before,record)) updated++;
      else unchanged++;
    }
    return {
      collection,
      label: tables[table].label,
      created,
      updated,
      unchanged,
      review: reviews.filter((row) => row.collection === collection).length,
    };
  });
  return { recordStates, counts };
}

function saveImportMappings(data, profiles, context) {
  data.workspace.importMappings = [
    ...(data.workspace.importMappings || []).filter(
      (saved) =>
        !profiles.some(
          (p) =>
            saved.sheet === p.name &&
            saved.fileName === (p.fileName || context.fileName),
        ),
    ),
    ...profiles.map((p) => ({
      sheet: p.name,
      fileName: p.fileName || context.fileName,
      signature: p.signature,
      layoutSignature: p.layoutSignature,
      primaryTable: p.primaryTable,
      columns: p.columns.map((c) => ({
        ...c,
        contactHeader: contactPart(c.target)
          ? p.columns.find(
              (other) => other.index === contactPart(c.target).index,
            )?.header
          : undefined,
        samples: undefined,
        examples: undefined,
      })),
    })),
  ];
}

function appendImportedHistory(data, changes, actor) {
  const recordChanges = new Map();
  for (const change of changes) {
    const k = JSON.stringify([change.collection, change.recordId]);
    if (!recordChanges.has(k)) recordChanges.set(k, []);
    recordChanges.get(k).push(change);
  }
  const importedHistory = [...recordChanges.values()].map((entries) => ({
    id: crypto.randomUUID(),
    collection: entries[0].collection,
    recordId: entries[0].recordId,
    action: "Exceluppgifter inlästa",
    at: new Date().toISOString(),
    by: actor || "Excelimport",
    fields: entries.map(({ field, from, to, provenance }) => ({
      field,
      from,
      to,
      provenance,
    })),
  }));
  if (importedHistory.length)
    data.workspace.auditLog = [
      ...(data.workspace.auditLog || []),
      ...importedHistory,
    ];
}

/** Finalize a prepared copy: validate it, then attach counts, provenance and
 * review metadata. This never writes a workbook, database or browser store. */
export function completeCleanImport({
  data,
  prior,
  profiles,
  context,
  changes,
  decisions,
  reviews,
  linkProposals,
  reusedLinks=[],
  sourceRows=[],
  touched,
  aliases,
  rowCount,
  rejectedRows,
  columnStats,
}) {
  validateData(data);
  const consolidated = consolidateImportReviews(reviews);
  reviews.length = 0;
  for (const review of consolidated) reviews.push(review);
  const affected = new Set(
    profiles.map((profile) =>
      JSON.stringify([
        profile.fileName || context.fileName || "Excel",
        profile.name,
      ]),
    ),
  );
  data.workspace.importReview = [
    ...(data.workspace.importReview || []).filter(
      (row) => !affected.has(JSON.stringify([row.source, row.sheet])),
    ),
    ...reviews,
  ];
  data.workspace.importFieldPreferences = clone(
    context.preferences || data.workspace.importFieldPreferences || {},
  );
  const { recordStates, counts } = countImportedRecords(
    data,
    prior,
    touched,
    aliases,
    reviews,
  );
  saveImportMappings(data, profiles, context);
  const sourceName = context.fileName || "Excel";
  appendImportedHistory(data, changes, context.actor);
  data.workspace.sourceRegistry = [
    ...(data.workspace.sourceRegistry || []).filter(
      (row) => row.name !== sourceName,
    ),
    {
      id: "SRC-" + hash(sourceName),
      name: sourceName,
      kind: "clean-import",
      sheets: profiles.map((p) => p.name).join(", "),
      rows: rowCount,
      created: counts.reduce((sum, row) => sum + row.created, 0),
      matched: counts.reduce((sum, row) => sum + row.updated, 0),
      review: reviews.length,
      importedAt: new Date().toISOString(),
    },
  ];
  if (changes.length)
    data.workspace.auditLog = [
      ...(data.workspace.auditLog || []),
      {
        id: crypto.randomUUID(),
        collection: "imports",
        recordId: "SRC-" + hash(sourceName),
        action: "Excelunderlag inläst",
        at: new Date().toISOString(),
        by: context.actor || "Excelimport",
        fields: [
          { field: "källa", to: sourceName },
          {
            field: "nya poster",
            to: counts.reduce((sum, row) => sum + row.created, 0),
          },
          {
            field: "kompletterade poster",
            to: counts.reduce((sum, row) => sum + row.updated, 0),
          },
        ],
      },
    ];
  data.workspace.sourceRegistry.find(
    (row) => row.kind === "clean-import" && row.name === sourceName,
  ).receipt = {
    rows: rowCount,
    scannedRows:sourceRows.length,
    ignoredRows:sourceRows.filter(row=>row.ignored).length,
    readRows: rowCount - rejectedRows,
    rejectedRows,
    partialRows: new Set(
      reviews
        .filter((row) => row.recordRejected)
        .map((row) => JSON.stringify([row.source, row.sheet, row.row])),
    ).size,
    columns: [...columnStats.values()].flatMap((columns) => [
      ...columns.values(),
    ]),
  };
  const result = {
    clean: data,
    report: {
      tables: counts,
      recordStates,
      linkProposals,
      reusedLinks,
      sourceRows:sourceRows.map(row=>({...row,records:{...row.records,...(row.records.properties?{properties:[...new Set(row.records.properties.map(id=>resolvePropertyId(aliases,id)))]}:{})}})),
      reviewIds: reviews.map((r) => r.id),
      sourceName,
      changes,
      decisions,
      review: reviews.length,
      blocking: new Set(
        reviews
          .filter((row) => row.blocking)
          .map((row) => JSON.stringify([row.source, row.sheet, row.row])),
      ).size,
      rows: rowCount,
    },
  };
  refreshImportReceipt(result);
  return { ...result, data: projectWorkspace(data) };
}
