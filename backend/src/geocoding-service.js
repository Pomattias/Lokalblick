import {
  getCachedCoordinate,
  getStoredCoordinate,
  loadCoordinateStore,
  saveCoordinateStore,
  upsertCoordinate,
  normalizeLocation
} from "./coordinate-store.js";

const PROVIDER = "openrouteservice";
const FALLBACK_PROVIDER = "nominatim";
const MAX_BATCH_SIZE = 100;
const NOT_FOUND_RETRY_MS = 24 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 60 * 1000;

function text(value) {
  return String(value == null ? "" : value).trim();
}

function orsApiKey() {
  return (
    text(process.env.ORS_API_KEY) ||
    text(process.env.OPENROUTESERVICE_API_KEY) ||
    text(process.env.OPENROUTE_SERVICE_API_KEY)
  );
}

function configError() {
  const error = new Error(
    "OpenRouteService är inte konfigurerat. Sätt ORS_API_KEY i backend-miljön."
  );
  error.code = "GEOCODING_NOT_CONFIGURED";
  error.statusCode = 503;
  return error;
}

function normalizeComparable(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHouseNumber(value) {
  return normalizeComparable(value).match(/\b\d+[a-z]?\b/)?.[0] || "";
}

function extractStreet(value) {
  return normalizeComparable(value)
    .replace(/\b\d+[a-z]?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateScore(candidate, property) {
  const label = normalizeComparable(candidate.displayName);
  const street = extractStreet(property.address);
  const house = extractHouseNumber(property.address);
  const city = normalizeComparable(property.city);
  let score = 0;
  if (city) score += label.includes(city) ? 100 : -160;
  if (street) score += label.includes(street) ? 55 : -50;
  if (house) score += label.includes(house) ? 20 : -20;
  return score;
}

function pickCandidate(candidates, property) {
  const scored = (candidates || [])
    .map((candidate) => ({ candidate, score: candidateScore(candidate, property) }))
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const best = scored[0];
  if (best.score < 80) return null;
  const runnerUp = scored[1];
  return {
    ...best.candidate,
    score: best.score,
    ambiguous: Boolean(runnerUp && best.score - runnerUp.score < 20)
  };
}

function queryFor(property) {
  return [text(property.address), text(property.city), "Sverige"]
    .filter(Boolean)
    .join(", ");
}

async function geocodeViaOrs(property, key) {
  const url = new URL("https://api.openrouteservice.org/geocode/search");
  url.searchParams.set("api_key", key);
  url.searchParams.set("text", queryFor(property));
  url.searchParams.set("size", "5");
  url.searchParams.set("boundary.country", "SE");
  url.searchParams.set("lang", "sv");
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const error = new Error(`ORS ${response.status}: ${detail.slice(0, 180)}`);
    error.code = "GEOCODING_PROVIDER_ERROR";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  const candidates = (Array.isArray(payload.features) ? payload.features : [])
    .map((feature) => {
      const coords = feature?.geometry?.coordinates;
      const longitude = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const latitude = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        latitude,
        longitude,
        displayName:
          text(feature?.properties?.label) ||
          text(feature?.properties?.name)
      };
    })
    .filter(Boolean);
  return pickCandidate(candidates, property);
}

async function geocodeViaNominatim(property) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "se");
  url.searchParams.set("q", queryFor(property));
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Lokalblick/1.0",
      Accept: "application/json"
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Nominatim ${response.status}`);
  const payload = await response.json().catch(() => []);
  const candidates = (Array.isArray(payload) ? payload : [])
    .map((hit) => {
      const latitude = Number(hit?.lat);
      const longitude = Number(hit?.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      return {
        latitude,
        longitude,
        displayName: text(hit?.display_name)
      };
    })
    .filter(Boolean);
  return pickCandidate(candidates, property);
}

function providerResult(property, candidate, provider) {
  if (!candidate) {
    return {
      id: property.id,
      sourceId: property.sourceId || "",
      address: property.address,
      city: property.city,
      latitude: null,
      longitude: null,
      status: "not_found",
      confidence: "",
      matchCode: "",
      provider,
      geocodedAt: new Date().toISOString()
    };
  }
  const status = candidate.ambiguous ? "review" : "matched";
  return {
    id: property.id,
    sourceId: property.sourceId || "",
    address: property.address,
    city: property.city,
    latitude: status === "matched" ? candidate.latitude : null,
    longitude: status === "matched" ? candidate.longitude : null,
    status,
    confidence: candidate.ambiguous ? "Medium" : "High",
    matchCode: candidate.ambiguous ? "Ambiguous" : "Good",
    provider,
    displayName: candidate.displayName || "",
    geocodedAt: new Date().toISOString()
  };
}

async function geocodeProperty(property, key) {
  try {
    const ors = await geocodeViaOrs(property, key);
    if (ors) return providerResult(property, ors, PROVIDER);
  } catch (error) {
    // Nominatim is a fallback, not the bulk provider.
    try {
      const fallback = await geocodeViaNominatim(property);
      return providerResult(property, fallback, FALLBACK_PROVIDER);
    } catch (_) {
      return {
        ...providerResult(property, null, PROVIDER),
        status: "error",
        matchCode: error && error.code ? String(error.code) : "provider_error"
      };
    }
  }
  return providerResult(property, null, PROVIDER);
}

function validCoordinate(value) {
  return value !== null && value !== undefined && value !== "" &&
    Number.isFinite(Number(value));
}

function validateProperties(properties) {
  if (!Array.isArray(properties) || properties.length < 1 || properties.length > MAX_BATCH_SIZE) {
    const error = new Error(`Geokodning tar 1–${MAX_BATCH_SIZE} fastigheter per anrop.`);
    error.code = "INVALID_BATCH";
    error.statusCode = 400;
    throw error;
  }
  return properties
    .map((property) => ({
      id: text(property && property.id),
      sourceId: text(property && property.sourceId),
      address: text(property && property.address),
      city: text(property && property.city),
      latitude: validCoordinate(property && property.latitude)
        ? Number(property.latitude)
        : null,
      longitude: validCoordinate(property && property.longitude)
        ? Number(property.longitude)
        : null
    }))
    .filter((property) => property.id && property.address && property.city);
}

export function isGeocodingConfigured() {
  return Boolean(orsApiKey());
}

export function geocodingProvider() {
  return isGeocodingConfigured()
    ? "openrouteservice+nominatim"
    : "openrouteservice";
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
  const key = orsApiKey();
  if (!key) throw configError();

  const properties = validateProperties(input);
  const store = await loadCoordinateStore();
  const results = [];
  const needsProvider = [];

  for (const property of properties) {
    const cached = getCachedCoordinate(store, property);
    const stored = getStoredCoordinate(store, property.id);
    const addressChanged = Boolean(
      stored &&
      stored.geocodedAddressKey !== normalizeLocation(property.address, property.city)
    );

    if (cached && cacheCanBeReused(cached)) {
      results.push({
        ...cached,
        id: property.id,
        sourceId: property.sourceId || cached.sourceId || "",
        address: property.address,
        city: property.city,
        addressChanged: false,
        cached: true
      });
      continue;
    }

    if (
      validCoordinate(property.latitude) &&
      validCoordinate(property.longitude) &&
      !cached &&
      !stored
    ) {
      const seeded = {
        id: property.id,
        sourceId: property.sourceId,
        address: property.address,
        city: property.city,
        latitude: property.latitude,
        longitude: property.longitude,
        status: "matched",
        confidence: "Source",
        matchCode: "Source",
        provider: "source",
        geocodedAt: new Date().toISOString()
      };
      upsertCoordinate(store, property, seeded);
      results.push({ ...seeded, cached: true, addressChanged: false });
      continue;
    }

    needsProvider.push({ ...property, addressChanged });
  }

  // Keep concurrency modest for ORS quotas and predictable company-network traffic.
  const concurrency = 4;
  for (let offset = 0; offset < needsProvider.length; offset += concurrency) {
    const chunk = needsProvider.slice(offset, offset + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((property) => geocodeProperty(property, key))
    );
    chunkResults.forEach((result, index) => {
      const property = chunk[index];
      result.addressChanged = Boolean(property.addressChanged);
      upsertCoordinate(store, property, result);
      results.push(result);
    });
  }

  await saveCoordinateStore(store);

  const byId = new Map(results.map((result) => [String(result.id), result]));
  return properties.map((property) =>
    byId.get(property.id) || {
      ...providerResult(property, null, PROVIDER),
      geocodedAt: null
    }
  );
}

export { MAX_BATCH_SIZE, PROVIDER, FALLBACK_PROVIDER };
