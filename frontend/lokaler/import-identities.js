import { importAddressKey } from "./issue-import.js";
export {agreementNumberParts} from './business-identities.js';

const text = (value) => String(value ?? "").trim();

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
