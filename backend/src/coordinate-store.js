import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_PATH = path.join(os.homedir(), "Lokalblick", "coordinates.json");

function normalizeAddress(address) {
  return String(address || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("sv-SE");
}

function normalizeLocation(address, city) {
  return normalizeAddress([address, city].filter(Boolean).join(", "));
}

function emptyStore() {
  return { version: 1, entries: {} };
}

function validCoordinate(value) {
  return Number.isFinite(Number(value));
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    propertyId: String(entry.propertyId || ""),
    sourceId: String(entry.sourceId || ""),
    geocodedAddress: String(entry.geocodedAddress || ""),
    geocodedCity: String(entry.geocodedCity || ""),
    geocodedAddressKey: String(entry.geocodedAddressKey || normalizeLocation(entry.geocodedAddress, entry.geocodedCity)),
    latitude: validCoordinate(entry.latitude) ? Number(entry.latitude) : null,
    longitude: validCoordinate(entry.longitude) ? Number(entry.longitude) : null,
    status: String(entry.status || "unknown"),
    confidence: String(entry.confidence || ""),
    provider: String(entry.provider || ""),
    matchCode: String(entry.matchCode || ""),
    geocodedAt: entry.geocodedAt || null,
    updatedAt: entry.updatedAt || null
  };
}

export function getCoordinateStorePath() {
  return process.env.LOKALBLICK_COORDINATES_PATH || DEFAULT_PATH;
}

export async function loadCoordinateStore() {
  const filePath = getCoordinateStorePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = parsed && parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
    return { version: 1, entries };
  } catch (error) {
    if (error && error.code === "ENOENT") return emptyStore();
    throw error;
  }
}

export async function saveCoordinateStore(store) {
  const filePath = getCoordinateStorePath();
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const safe = { version: 1, entries: store && store.entries ? store.entries : {} };
  await fs.writeFile(tempPath, JSON.stringify(safe, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

export function getStoredCoordinate(store, propertyId) {
  return sanitizeEntry(store && store.entries ? store.entries[String(propertyId || "")] : null);
}

export function getCachedCoordinate(store, property) {
  const propertyId = String(property && property.id || "");
  const addressKey = normalizeLocation(property && property.address, property && property.city);
  if (!propertyId || !addressKey) return null;
  const entry = getStoredCoordinate(store, propertyId);
  if (!entry) return null;
  const legacyKey = normalizeAddress(property && property.address);
  if (entry.geocodedAddressKey !== addressKey && entry.geocodedAddressKey !== legacyKey)
    return null;
  return entry;
}

export function upsertCoordinate(store, property, result) {
  const propertyId = String(property && property.id || "");
  if (!propertyId) return;
  const address = String(property.address || "").trim();
  const city = String(property.city || "").trim();
  const now = new Date().toISOString();
  store.entries[propertyId] = sanitizeEntry(Object.assign({}, result, {
    propertyId,
    sourceId: property.sourceId || "",
    geocodedAddress: address,
    geocodedCity: city,
    geocodedAddressKey: normalizeLocation(address, city),
    updatedAt: now,
    geocodedAt: result && result.geocodedAt ? result.geocodedAt : now
  }));
}

export { normalizeAddress, normalizeLocation };
