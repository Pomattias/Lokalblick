import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LokalblickRepository } from "./data-repository.js";
import { loadLocalEnvironment } from "./env.js";
import { LocalCompanySourceAdapter } from "./adapters/local-company-source-adapter.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FRONTEND = path.join(ROOT, "frontend");
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;
const ALLOWED_HOSTS = new Set([DEFAULT_HOST, "localhost", "::1"]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const API_ENTITIES = {
  organizations: "organizations",
  people: "people",
  contacts: "contacts",
  activities: "activities",
  "maintenance-status": "maintenanceStatus",
  operations: "operations",
  "budget-data": "budgetData",
  coordinates: "coordinates",
  "contract-overlays": "contractOverlays",
  "property-overlays": "propertyOverlays",
  properties: "properties",
  contracts: "contracts"
};
const MAX_BODY_SIZE = 2 * 1024 * 1024;
const COMPANY_DATA_SERVICE = `(function(){async function request(url,options){var response=await fetch(url,Object.assign({credentials:"same-origin",headers:{"Content-Type":"application/json"}},options||{}));if(!response.ok)throw new Error("Lokalblick API "+response.status);if(response.status===204)return null;return response.json()}window.LokalblickDataService={mode:"company-api",load:function(){return request("/api/bootstrap")},save:function(data){return request("/api/workspace",{method:"PATCH",body:JSON.stringify(data)})},reset:function(){return this.load()}}})();`;

export function validateHost(host) {
  if (!ALLOWED_HOSTS.has(String(host || "").toLowerCase())) {
    const error = new Error("Unsafe host: Lokalblick company server may bind only to loopback");
    error.code = "UNSAFE_HOST";
    throw error;
  }
}

function assertExternalPath(value) {
  if (!value) return;
  const relative = path.relative(ROOT, path.resolve(value));
  if (relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))) {
    throw new Error("Company data paths must be outside the Git repository");
  }
}

function validateMutationOrigin(request, server) {
  const origin = request.headers.origin;
  if (!origin) return;
  let parsed;
  try { parsed = new URL(origin); } catch {
    const error = new Error("Request origin is not allowed");
    error.statusCode = 403;
    throw error;
  }
  const listeningPort = server.address()?.port;
  if (
    parsed.protocol !== "http:" ||
    !ALLOWED_HOSTS.has(parsed.hostname.replace(/^\[|\]$/g, "")) ||
    Number(parsed.port || 80) !== Number(listeningPort) ||
    parsed.username ||
    parsed.password
  ) {
    const error = new Error("Request origin is not allowed");
    error.statusCode = 403;
    throw error;
  }
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON");
    error.statusCode = 400;
    throw error;
  }
}

function statusPayload(status) {
  return {
    sourceType: status.sourceType,
    fileFound: Boolean(status.fileFound),
    sfRowCount: Number(status.sfRowCount) || 0,
    extRowCount: Number(status.extRowCount) || 0,
    propertyCount: Number(status.propertyCount) || 0,
    contractCount: Number(status.contractCount) || 0,
    lastModified: status.lastModified || null
  };
}

async function serveFrontend(request, response, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return false; }
  const relative = decoded === "/" ? "index.html" : decoded.slice(1);
  if (!relative || relative.split(/[\\/]/).some((segment) => segment.startsWith("."))) return false;
  const target = path.resolve(FRONTEND, relative);
  if (!target.startsWith(`${FRONTEND}${path.sep}`)) return false;
  let body;
  try {
    const stat = await fs.stat(target);
    if (!stat.isFile()) return false;
    body = await fs.readFile(target);
  } catch {
    return false;
  }
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store"
  });
  response.end(request.method === "HEAD" ? undefined : body);
  return true;
}

export function createLokalblickServer(repository, { host = DEFAULT_HOST, port = DEFAULT_PORT } = {}) {
  validateHost(host);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = url.pathname;
      if (["PATCH", "POST", "DELETE"].includes(request.method) && pathname.startsWith("/api/")) {
        validateMutationOrigin(request, server);
      }
      if (pathname === "/services/data-service.js" && request.method === "GET") {
        response.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff"
        });
        response.end(COMPANY_DATA_SERVICE);
        return;
      }
      if (pathname === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { status: "ok" });
      }
      if (pathname === "/api/source/status" && request.method === "GET") {
        return sendJson(response, 200, statusPayload(await repository.status()));
      }
      if (pathname === "/api/bootstrap" && request.method === "GET") {
        return sendJson(response, 200, await repository.bootstrap());
      }
      if (pathname === "/api/workspace" && request.method === "PATCH") {
        const data = await readJson(request);
        return sendJson(response, 200, await repository.saveWorkspace(data));
      }
      if (pathname === "/api/source/refresh" && request.method === "POST") {
        return sendJson(response, 200, await repository.refreshSource());
      }

      const match = pathname.match(/^\/api\/([^/]+)(?:\/([^/]+))?$/);
      if (match) {
        const entity = API_ENTITIES[match[1]];
        if (!entity) return sendJson(response, 404, { error: "Unknown entity" });
        const id = match[2] == null ? null : decodeURIComponent(match[2]);
        if (!id && request.method === "GET") return sendJson(response, 200, await repository.list(entity));
        if (!id && request.method === "POST") {
          return sendJson(response, 201, await repository.create(entity, await readJson(request)));
        }
        if (id && request.method === "GET") {
          const record = await repository.get(entity, id);
          return record ? sendJson(response, 200, record) : sendJson(response, 404, { error: "Record not found" });
        }
        if (id && request.method === "PATCH") {
          const record = await repository.update(entity, id, await readJson(request));
          return record ? sendJson(response, 200, record) : sendJson(response, 404, { error: "Record not found" });
        }
        if (id && request.method === "DELETE") {
          const deleted = await repository.delete(entity, id);
          return deleted ? sendJson(response, 204, null) : sendJson(response, 404, { error: "Record not found" });
        }
        return sendJson(response, 405, { error: "Method not allowed" });
      }

      if (request.method === "GET" || request.method === "HEAD") {
        if (await serveFrontend(request, response, pathname)) return;
      }
      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const code = error.statusCode || (error instanceof TypeError || error instanceof RangeError ? 400 : 500);
      const message = code >= 500 ? "Internal server error" : error.message;
      if (!response.headersSent) sendJson(response, code, { error: message });
      else response.destroy();
    }
  });
  server.listen(port, host);
  return server;
}

async function main() {
  await loadLocalEnvironment(path.join(ROOT, ".env.local"));
  if (process.env.LOKALBLICK_SOURCE && process.env.LOKALBLICK_SOURCE !== "local-company") {
    throw new Error("Unsupported local company source");
  }
  assertExternalPath(process.env.LOKALBLICK_LEB_PATH);
  assertExternalPath(process.env.LOKALBLICK_DATA_PATH);
  assertExternalPath(process.env.LOKALBLICK_COORDINATES_PATH);
  const host = process.env.LOKALBLICK_HOST || DEFAULT_HOST;
  const port = Number(process.env.LOKALBLICK_PORT || DEFAULT_PORT);
  validateHost(host);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid company server port");
  const sourceAdapter = new LocalCompanySourceAdapter();
  const repository = await new LokalblickRepository({ sourceAdapter }).initialize();
  const server = createLokalblickServer(repository, { host, port });
  server.on("error", () => {
    console.error("Unable to start Lokalblick company server.");
    process.exitCode = 1;
  });
  console.log(`Lokalblick company server listening at http://127.0.0.1:${port}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error("Unable to initialize Lokalblick company server. Check local setup configuration and source availability.");
    process.exitCode = 1;
  });
}
