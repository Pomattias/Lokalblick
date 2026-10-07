import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geocodeProperties, isGeocodingConfigured } from "./src/geocoding-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "frontend");
const host = process.env.LOKALBLICK_HOST || "127.0.0.1";
const port = Number(process.env.LOKALBLICK_PORT || 8787);
const allowedOrigins = new Set(
  String(process.env.LOKALBLICK_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }, headers));
  res.end(body);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "vary": "Origin"
  };
}

async function readJson(req, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Requesten är för stor.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const relative = decoded === "/frontend" || decoded === "/frontend/"
    ? "index.html"
    : decoded.startsWith("/frontend/")
      ? decoded.slice("/frontend/".length)
      : decoded.slice(1);
  const normalized = path.normalize(relative);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) return null;
  return path.join(frontendRoot, normalized || "index.html");
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/frontend/" : pathname;
  const filePath = safeStaticPath(requested);
  if (!filePath) return sendJson(res, 400, { error: "Ogiltig sökväg" });
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "content-type": contentTypes[ext] || "application/octet-stream" });
    res.end(body);
  } catch (error) {
    if (error && error.code === "ENOENT") return sendJson(res, 404, { error: "Hittade inte resursen" });
    return sendJson(res, 500, { error: "Kunde inte läsa resursen" });
  }
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
  const headers = corsHeaders(req);

  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    res.writeHead(204, headers);
    return res.end();
  }

  if (url.pathname === "/api/health" && req.method === "GET") {
    return sendJson(res, 200, {
      ok: true,
      service: "lokalblick-backend",
      geocoding: { provider: "azure-maps", configured: isGeocodingConfigured() }
    }, headers);
  }

  if (url.pathname === "/api/geocode" && req.method === "POST") {
    try {
      const body = await readJson(req);
      const results = await geocodeProperties(body.properties);
      return sendJson(res, 200, {
        ok: true,
        provider: "azure-maps",
        results,
        summary: {
          total: results.length,
          matched: results.filter((item) => item.status === "matched").length,
          review: results.filter((item) => item.status === "review").length,
          notFound: results.filter((item) => item.status === "not_found").length
        }
      }, headers);
    } catch (error) {
      const status = Number(error.status) || (error.code === "GEOCODING_NOT_CONFIGURED" ? 503 : 500);
      return sendJson(res, status, { ok: false, error: error.message || "Geokodning misslyckades", code: error.code || "GEOCODING_ERROR" }, headers);
    }
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendJson(res, 405, { error: "Metoden stöds inte" }, headers);
  }

  return serveStatic(req, res, url.pathname);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    sendJson(res, 500, { error: error.message || "Internt fel" }, corsHeaders(req));
  });
});

server.listen(port, host, () => {
  console.log(`Lokalblick backend: http://${host}:${port}`);
  console.log(`Azure Maps geokodning: ${isGeocodingConfigured() ? "konfigurerad" : "inte konfigurerad"}`);
});
