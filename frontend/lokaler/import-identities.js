import { importAddressKey } from "./issue-import.js";

const text = (value) => String(value ?? "").trim();

export function agreementNumberParts(value) {
  const id = text(value),
    parts = /^([A-Za-z]{0,8}\d+)-(\d+)(?:-(\d+))?$/.exec(id);
  // Date-shaped IDs and other layouts need an explicit choice, not a guess.
  if (!parts || id.length > 100 || /^(?:19|20)\d{2}-\d{2}-\d{2}$/.test(id))
    return null;
  return {
    propertyId: parts[1],
    objectId: parts[3] ? parts[1] + "-" + parts[2] : null,
    agreementId: id,
  };
}
// These keys are persisted in reviews and source records. Preserve the hash
// and its input order so reimport continues to identify the same records.
export const hashImportIdentity = (value) => {
  let h = 2166136261;
  for (const char of value) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};
export const generatedPropertyId = (source, sheet, p) =>
  "FAS-" +
  hashImportIdentity(
    p.management_object_number ? JSON.stringify(["management-object",text(p.management_object_number)]) : JSON.stringify([
      source,
      sheet,
      p.name || "",
      importAddressKey(p.address || ""),
      p.city || "",
    ]),
  );
