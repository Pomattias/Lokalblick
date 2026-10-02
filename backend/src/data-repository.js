import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const USER_ENTITIES = [
  "organizations", "people", "assignments", "projects", "maintenance",
  "maintenanceStatus", "driftCosts", "operations", "driftIssues", "wishes",
  "investigations", "budgetData", "coordinates", "contractOverlays"
];

const CORE_ENTITIES = ["properties", "contracts"];
const ALL_ENTITIES = [...CORE_ENTITIES, ...USER_ENTITIES];

function emptyStore() {
  return {
    version: 1,
    entities: Object.fromEntries(USER_ENTITIES.map((entity) => [entity, []])),
    deleted: { properties: [], contracts: [] },
    updatedAt: null
  };
}

function ensureStoreShape(value) {
  const store = emptyStore();
  if (!value || typeof value !== "object" || Array.isArray(value)) return store;
  for (const entity of USER_ENTITIES) {
    if (Array.isArray(value.entities?.[entity])) store.entities[entity] = value.entities[entity];
  }
  for (const entity of CORE_ENTITIES) {
    if (Array.isArray(value.deleted?.[entity])) store.deleted[entity] = value.deleted[entity];
  }
  store.updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : null;
  return store;
}

function validateJson(value, depth = 0) {
  if (depth > 30) throw new TypeError("Payload is too deeply nested");
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
    if (typeof value === "number" && !Number.isFinite(value)) throw new TypeError("Payload contains an invalid number");
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) validateJson(item, depth + 1);
    return;
  }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError("Payload must contain JSON values only");
  }
  for (const [key, nested] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor", "path", "filePath", "lebPath", "coordinatesPath"].includes(key)) {
      throw new TypeError("Payload contains a prohibited property");
    }
    validateJson(nested, depth + 1);
  }
}

function validateRecord(payload, expectedId) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Record payload must be an object");
  }
  validateJson(payload);
  const record = structuredClone(payload);
  if (expectedId && record.id != null && record.id !== expectedId) {
    throw new TypeError("Record id cannot be changed");
  }
  record.id = expectedId || String(record.id || randomUUID());
  if (!record.id.trim() || record.id.length > 200) throw new TypeError("Record id is invalid");
  return record;
}

export class LokalblickRepository {
  constructor({ sourceAdapter, dataPath } = {}) {
    this.sourceAdapter = sourceAdapter;
    this.dataPath = dataPath || process.env.LOKALBLICK_DATA_PATH;
    if (!this.dataPath) throw new Error("LOKALBLICK_DATA_PATH is not configured");
    this.core = { properties: [], contracts: [], sourceCounts: { sfRows: 0, extRows: 0 } };
    this.store = emptyStore();
    this.writeQueue = Promise.resolve();
    this.coordinates = new Map();
  }

  async initialize() {
    await fs.mkdir(path.dirname(path.resolve(this.dataPath)), { recursive: true });
    try {
      this.store = ensureStoreShape(JSON.parse(await fs.readFile(this.dataPath, "utf8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.persist(this.store);
    }
    if (this.sourceAdapter) this.core = await this.sourceAdapter.loadCore();
    await this.applyCoordinates();
    return this;
  }

  async persist(store) {
    const target = path.resolve(this.dataPath);
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, target);
    this.store = store;
  }

  async commit(mutator) {
    const operation = this.writeQueue.then(async () => {
      const next = structuredClone(this.store);
      const result = await mutator(next);
      next.updatedAt = new Date().toISOString();
      await this.persist(next);
      return result;
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }

  async applyCoordinates() {
    const fileCoordinates = await this.sourceAdapter?.loadCoordinates?.() || [];
    const merged = new Map(fileCoordinates.map((record) => [record.propertyId, record]));
    for (const record of this.store.entities.coordinates) merged.set(record.propertyId || record.id, record);
    this.coordinates = merged;
  }

  async bootstrap() {
    const store = this.store;
    const deletedProperties = new Set(store.deleted.properties);
    const deletedContracts = new Set(store.deleted.contracts);
    const properties = (this.core.properties || [])
      .filter((property) => !deletedProperties.has(property.id))
      .map((property) => {
        const coordinates = this.coordinates.get(property.id);
        return coordinates
          ? { ...property, latitude: coordinates.latitude, longitude: coordinates.longitude }
          : { ...property };
      });
    const contracts = (this.core.contracts || [])
      .filter((contract) => !deletedContracts.has(contract.id))
      .map((contract) => {
        const overlay = store.entities.contractOverlays.find((item) => item.contractId === contract.id);
        return overlay ? { ...contract, ...overlay, id: contract.id, propertyId: contract.propertyId } : { ...contract };
      });
    const workspace = Object.fromEntries(USER_ENTITIES.map((entity) => [
      entity,
      structuredClone(store.entities[entity])
    ]));
    return {
      isDemo: false,
      sourceName: "Lokal company source",
      ...workspace,
      properties,
      contracts,
      sourceCounts: structuredClone(this.core.sourceCounts || { sfRows: 0, extRows: 0 })
    };
  }

  async status() {
    return this.sourceAdapter?.status
      ? this.sourceAdapter.status(this.core)
      : {
        sourceType: "unconfigured", fileFound: false, sfRowCount: 0, extRowCount: 0,
        propertyCount: 0, contractCount: 0, lastModified: null
      };
  }

  async refreshSource() {
    if (!this.sourceAdapter) throw new Error("No source adapter configured");
    this.core = await this.sourceAdapter.loadCore();
    await this.applyCoordinates();
    return this.bootstrap();
  }

  async saveWorkspace(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("Workspace payload must be an object");
    }
    const updates = {};
    for (const entity of USER_ENTITIES) {
      if (Object.hasOwn(payload, entity)) {
        if (!Array.isArray(payload[entity])) throw new TypeError(`${entity} must be an array`);
        updates[entity] = payload[entity].map((record) => validateRecord(record));
      }
    }
    await this.commit((store) => {
      for (const [entity, records] of Object.entries(updates)) store.entities[entity] = records;
    });
    return this.bootstrap();
  }

  async list(entity) {
    if (!ALL_ENTITIES.includes(entity)) throw new RangeError("Unknown entity");
    return (await this.bootstrap())[entity];
  }

  async get(entity, id) {
    const records = await this.list(entity);
    return records.find((record) => record.id === id) || null;
  }

  async create(entity, payload) {
    if (!USER_ENTITIES.includes(entity)) throw new RangeError("Entity is read-only or unknown");
    const record = validateRecord(payload);
    await this.commit((store) => {
      if (store.entities[entity].some((item) => item.id === record.id)) {
        const error = new Error("Record already exists");
        error.statusCode = 409;
        throw error;
      }
      store.entities[entity].push(record);
    });
    return record;
  }

  async update(entity, id, payload) {
    if (!USER_ENTITIES.includes(entity)) throw new RangeError("Entity is read-only or unknown");
    const current = await this.get(entity, id);
    if (!current) return null;
    const record = validateRecord({ ...current, ...payload, id }, id);
    await this.commit((store) => {
      const index = store.entities[entity].findIndex((item) => item.id === id);
      if (index >= 0) store.entities[entity][index] = record;
    });
    return record;
  }

  async delete(entity, id) {
    if (!ALL_ENTITIES.includes(entity)) throw new RangeError("Unknown entity");
    if (CORE_ENTITIES.includes(entity)) {
      const records = await this.list(entity);
      if (!records.some((record) => record.id === id)) return false;
      await this.commit((store) => {
        if (!store.deleted[entity].includes(id)) store.deleted[entity].push(id);
      });
      return true;
    }
    let removed = false;
    await this.commit((store) => {
      const before = store.entities[entity].length;
      store.entities[entity] = store.entities[entity].filter((item) => item.id !== id);
      removed = before !== store.entities[entity].length;
    });
    return removed;
  }
}
