// Backend-owned address -> coordinate enrichment.
// Public/demo data is never sent to the geocoder.
(function () {
  const HEALTH_TIMEOUT_MS = 1500;
  const GEOCODE_TIMEOUT_MS = 65000;
  const BATCH_SIZE = 5;

  function apiBaseUrl() {
    const configured = window.LokalblickRuntime && window.LokalblickRuntime.apiBaseUrl;
    if (configured) return String(configured).replace(/\/$/, "");
    if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
      return "";
    }
    // Hosted app uses its own same-origin API, never a local loopback server.
    return "";
  }

  function validCoordinate(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
    return fetch(url, Object.assign({}, options || {}, { signal: controller.signal }))
      .finally(function () { clearTimeout(timer); });
  }

  async function health() {
    const response = await fetchWithTimeout(
      apiBaseUrl() + "/api/geocode",
      { method: "GET", cache: "no-store" },
      HEALTH_TIMEOUT_MS
    );
    if (!response.ok) return { ok: false, configured: false };
    const payload = await response.json();
    return {
      ok: Boolean(payload && payload.ok),
      configured: Boolean(payload && payload.configured),
      provider: payload && payload.provider ? payload.provider : ""
    };
  }

  async function enrichData(data, onProgress) {
    if (!data || data.isDemo || !Array.isArray(data.properties) || !data.properties.length) return data;

    const properties = data.properties.map(function (property) {
      return {
        id: property.id,
        sourceId: property.sourceId || "",
        address: property.address || "",
        city: property.city || "",
        latitude: validCoordinate(property.latitude) ? Number(property.latitude) : null,
        longitude: validCoordinate(property.longitude) ? Number(property.longitude) : null
      };
    }).filter(function (property) {
      return property.id && property.address && property.city;
    });

    if (!properties.length) return data;

    let status;
    try {
      status = await health();
    } catch (error) {
      window.LokalblickGeocodingStatus = { available: false, message: "Lokalblick backend svarar inte ännu." };
      return data;
    }

    if (!status.ok || !status.configured) {
      window.LokalblickGeocodingStatus = {
        available: false,
        configured: Boolean(status && status.configured),
        message: status && status.ok ? "OpenRouteService är inte konfigurerat." : "Lokalblick backend svarar inte ännu."
      };
      return data;
    }

    const allResults = [];
    const existing = properties.filter(function(p) { return validCoordinate(p.latitude) && validCoordinate(p.longitude); });
    const missing = properties.filter(function(p) { return !validCoordinate(p.latitude) || !validCoordinate(p.longitude); });
    if (typeof onProgress === 'function') onProgress({ total: properties.length, pending: missing.length, processed: 0, matched: existing.length, review: 0, notFound: 0 });
    if (!missing.length) {
      window.LokalblickGeocodingStatus = { available:true, configured:true, total:properties.length, matched:properties.length, review:0, notFound:0 };
      return data;
    }
    try {
      for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
        const batch = missing.slice(offset, offset + BATCH_SIZE);
        const response = await fetchWithTimeout(
          apiBaseUrl() + "/api/geocode",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ properties: batch })
          },
          GEOCODE_TIMEOUT_MS
        );
        const payload = await response.json().catch(function () { return {}; });
        if (!response.ok) {
          const message = payload && payload.error ? payload.error : "Geokodningen misslyckades.";
          const error = new Error(message);
          error.code = payload && payload.code ? payload.code : "GEOCODING_ERROR";
          throw error;
        }
        allResults.push.apply(allResults, Array.isArray(payload.results) ? payload.results : []);
        if (typeof onProgress === 'function') onProgress({ total: properties.length, pending: missing.length, processed: Math.min(offset + batch.length, missing.length), matched: existing.length + allResults.filter(x => x.status === 'matched').length, review: allResults.filter(x => x.status === 'review').length, notFound: allResults.filter(x => x.status === 'not_found').length });
      }
    } catch (error) {
      window.LokalblickGeocodingStatus = {
        available: false,
        configured: true,
        message: error && error.message ? error.message : "Geokodningen misslyckades."
      };
      return data;
    }

    const byId = new Map(allResults.map(function (result) { return [String(result.id), result]; }));
    data.properties.forEach(function (property) {
      const result = byId.get(String(property.id));
      if (!result) return;
      property.geocodeStatus = result.status || "";
      property.geocodeConfidence = result.confidence || "";
      property.geocodeProvider = result.provider || "";
      property.geocodeMatchCode = result.matchCode || "";
      property.geocodedAddress = result.address || property.address || "";
      property.geocodedCity = result.city || property.city || "";
      property.geocodedAt = result.geocodedAt || null;

      if (validCoordinate(result.latitude) && validCoordinate(result.longitude)) {
        property.latitude = Number(result.latitude);
        property.longitude = Number(result.longitude);
      } else if (result.addressChanged) {
        // Never keep coordinates from the old address when the new address
        // could not be matched with sufficient confidence.
        property.latitude = null;
        property.longitude = null;
      }
    });

    window.LokalblickGeocodingStatus = {
      available: true,
      configured: true,
      provider: status.provider || "openrouteservice",
      total: allResults.length,
      matched: allResults.filter(function (item) { return item.status === "matched"; }).length,
      review: allResults.filter(function (item) { return item.status === "review"; }).length,
      notFound: allResults.filter(function (item) { return item.status === "not_found"; }).length
    };
    return data;
  }

  function decorate(service) {
    if (!service || service.__lokalblickGeocodingWrapped) return service;
    const originalLoad = service.load.bind(service);
    service.load = async function () {
      const data = await originalLoad();
      return enrichData(data);
    };
    Object.defineProperty(service, "__lokalblickGeocodingWrapped", { value: true, enumerable: false });
    return service;
  }

  let current = decorate(window.LokalblickDataService);
  Object.defineProperty(window, "LokalblickDataService", {
    configurable: true,
    get: function () { return current; },
    set: function (next) { current = decorate(next); }
  });

  window.LokalblickGeocodingService = {
    health: health,
    enrichData: enrichData,
    getApiBaseUrl: apiBaseUrl
  };
})();
