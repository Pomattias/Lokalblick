import {
  getCachedCoordinate,
  getStoredCoordinate,
  loadCoordinateStore,
  saveCoordinateStore,
  upsertCoordinate,
  normalizeLocation
} from "./coordinate-store.js";

const PROVIDER = "azure-maps";
const API_VERSION = "2026-01-01";
const ENDPOINT = "https://atlas.microsoft.com";
const MAX_BATCH_SIZE = 100;
const NOT_FOUND_RETRY_MS = 24 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 60 * 1000;

function configError() {
  const error = new Error("Azure Maps är inte konfigurerat. Sätt AZURE_MAPS_SUBSCRIPTION_KEY i backend-miljön.");
  error.code = "GEOCODING_NOT_CONFIGURED";
  return error;
}

function confidenceRank(value) {
  return value === "High" ? 3 : value === "Medium" ? 2 : value === "Low" ? 1 : 0;
}

function featureScore(feature) {
  const properties = feature && feature.properties ? feature.properties : {};
  const confidence = confidenceRank(properties.confidence);
  const matchCodes = Array.isArray(properties.matchCodes) ? properties.matchCodes : [];
  const exact = matchCodes.includes("Good") ? 4 : matchCodes.includes("Ambiguous") ? 2 : 0;
  const type = properties.type === "Address" ? 3 : 0;
  const coordinates = feature && feature.geometry && Array.isArray(feature.geometry.coordinates) ? 2 : 0;
  return confidence * 100 + exact * 10 + type + coordinates;
}

function pickFeature(features) {
  return (features || []).slice().sort((a, b) => featureScore(b) - featureScore(a))[0] || null;
}

function resultFromFeature(property, feature) {
  const props = feature && feature.properties ? feature.properties : {};
  const coords = feature && feature.geometry && Array.isArray(feature.geometry.coordinates)
    ? feature.geometry.coordinates
    : [];
  const longitude = Number(coords[0]);
  const latitude = Number(coords[1]);
  const confidence = String(props.confidence || "");
  const matchCodes = Array.isArray(props.matchCodes) ? props.matchCodes : [];
  const matchCode = matchCodes.join(", ");
  const type = String(props.type || "");
  const accepted =
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    type === "Address" &&
    (confidence === "High" || (confidence === "Medium" && matchCodes.includes("Good")));

  return {
    id: property.id,
    sourceId: property.sourceId || "",
    address: property.address || "",
    city: property.city || "",
    latitude: accepted ? latitude : null,
    longitude: accepted ? longitude : null,
    status: accepted ? "matched" : (Number.isFinite(latitude) && Number.isFinite(longitude) ? "review" : "not_found"),
    confidence,
    matchCode,
    provider: PROVIDER,
    geocodedAt: new Date().toISOString()
  };
}

async function callAzureBatch(properties) {
  const key = process.env.AZURE_MAPS_SUBSCRIPTION_KEY;
  if (!key) throw configError();

  const defaultCity = String(process.env.LOKALBLICK_DEFAULT_CITY || "Malmö").trim();
  const batchItems = properties.map((property) => ({
    query: [String(property.address).trim(), String(property.city || defaultCity).trim(), "Sverige"].filter(Boolean).join(", "),
    top: 5,
    optionalId: String(property.id)
  }));

  const url = new URL("/geocode:batch", ENDPOINT);
  url.searchParams.set("api-version", API_VERSION);
  url.searchParams.set("subscription-key", key);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "accept-language": "sv-SE"
    },
    body: JSON.stringify({ batchItems })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload && payload.error && payload.error.message
      ? payload.error.message
      : `Azure Maps svarade ${response.status}`;
    const error = new Error(message);
    error.code = "GEOCODING_PROVIDER_ERROR";
    error.status = response.status;
    throw error;
  }

  return properties.map((property, index) => {
    const item = Array.isArray(payload.batchItems) ? payload.batchItems[index] : null;
    if (!item || item.error) {
      return {
        id: property.id,
        sourceId: property.sourceId || "",
        address: property.address || "",
        latitude: null,
        longitude: null,
        status: "error",
        confidence: "",
        matchCode: item && item.error ? String(item.error.code || "") : "",
        provider: PROVIDER,
        geocodedAt: new Date().toISOString()
      };
    }
    return resultFromFeature(property, pickFeature(item.features));
  });
}

function validateProperties(properties) {
  if (!Array.isArray(properties) || properties.length < 1 || properties.length > MAX_BATCH_SIZE) {
    const error = new Error(`Geokodning tar 1–${MAX_BATCH_SIZE} fastigheter per anrop.`);
    error.code = "INVALID_BATCH";
    error.status = 400;
    throw error;
  }
  return properties.map((property) => ({
    id: String(property && property.id || "").trim(),
    sourceId: String(property && property.sourceId || "").trim(),
    address: String(property && property.address || "").trim(),
    city: String(property && property.city || process.env.LOKALBLICK_DEFAULT_CITY || "Malmö").trim(),
    latitude: Number.isFinite(Number(property && property.latitude)) ? Number(property.latitude) : null,
    longitude: Number.isFinite(Number(property && property.longitude)) ? Number(property.longitude) : null
  })).filter((property) => property.id && property.address);
}

export function isGeocodingConfigured() {
  return Boolean(process.env.AZURE_MAPS_SUBSCRIPTION_KEY);
}

function cacheCanBeReused(entry) {
  if (!entry) return false;
  if (entry.status === "matched" || entry.status === "review") return true;
  const updatedAt = entry.updatedAt || entry.geocodedAt;
  const age = updatedAt ? Date.now() - new Date(updatedAt).getTime() : Infinity;
  if (entry.status === "not_found") return age < NOT_FOUND_RETRY_MS;
  if (entry.status === "error") return age < ERROR_RETRY_MS;
  return false;
}

export async function geocodeProperties(input) {
  const properties = validateProperties(input);
  const store = await loadCoordinateStore();
  const results = [];
  const needsProvider = [];

  for (const property of properties) {
    const cached = getCachedCoordinate(store, property);
    const stored = getStoredCoordinate(store, property.id);
    const addressChanged = Boolean(stored && stored.geocodedAddressKey !== normalizeLocation(property.address, property.city));

    if (cached && cacheCanBeReused(cached)) {
      results.push(Object.assign({}, cached, {
        id: property.id,
        sourceId: property.sourceId || cached.sourceId || "",
        address: property.address,
        addressChanged: false,
        cached: true
      }));
      continue;
    }

    if (Number.isFinite(property.latitude) && Number.isFinite(property.longitude) && !cached && !stored) {
      const seeded = {
        id: property.id,
        sourceId: property.sourceId,
        address: property.address,
        city: property.city || "",
        latitude: property.latitude,
        longitude: property.longitude,
        status: "matched",
        confidence: "Source",
        matchCode: "Source",
        provider: "source",
        geocodedAt: new Date().toISOString()
      };
      upsertCoordinate(store, property, seeded);
      results.push(Object.assign({}, seeded, { cached: true, addressChanged: false }));
      continue;
    }

    needsProvider.push(Object.assign({}, property, { addressChanged }));
  }

  for (let offset = 0; offset < needsProvider.length; offset += MAX_BATCH_SIZE) {
    const chunk = needsProvider.slice(offset, offset + MAX_BATCH_SIZE);
    const providerResults = await callAzureBatch(chunk);
    providerResults.forEach((result) => {
      const property = chunk.find((item) => item.id === result.id);
      result.addressChanged = Boolean(property && property.addressChanged);
      upsertCoordinate(store, result, result);
      results.push(result);
    });
  }

  await saveCoordinateStore(store);

  const byId = new Map(results.map((result) => [String(result.id), result]));
  return properties.map((property) => byId.get(property.id) || {
    id: property.id,
    sourceId: property.sourceId || "",
    address: property.address,
    city: property.city || "",
    latitude: null,
    longitude: null,
    status: "not_found",
    confidence: "",
    matchCode: "",
    provider: PROVIDER,
    geocodedAt: null
  });
}

export { MAX_BATCH_SIZE, PROVIDER };
