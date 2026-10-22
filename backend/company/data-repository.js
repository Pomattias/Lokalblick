import {projectStoredAgreementItems,stripStoredAgreementFinance,validateAgreementItems} from '../../frontend/lokaler/finance-view.js';
import "../../frontend/domain/recurring-costs.js";
import "../../frontend/domain/object-model.js";
import "../../frontend/domain/responsibility-model.js";
import "../../frontend/domain/business-model.js";
import "../../frontend/domain/import-rules.js";
import {parseDate,numberField} from "../../frontend/services/import-formats.js";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const USER_ENTITIES = [
  "assignments", "objects", "organizations", "people", "orders", "activities",
  "recurringCosts", "agreementItems", "budgetData", "coordinates", "contractOverlays", "propertyOverlays"
];
const CORE_ENTITIES = ["properties", "contracts"];
const ALL_ENTITIES = [...CORE_ENTITIES, ...USER_ENTITIES];

function emptyStore() {
  return {
    version: 4,
    imported:{properties:[],contracts:[]},
    entities: Object.fromEntries(USER_ENTITIES.map((entity) => [entity, []])),
    deleted: { properties: [], contracts: [] },
    updatedAt: null
  };
}

function validateEntityRecord(entity, payload, id, core) {
  const record = validateRecord(payload, id);
  if (entity === "coordinates") {
    if (typeof record.propertyId !== "string" || !record.propertyId.trim()) throw new TypeError("Coordinate propertyId is required");
    const latitude = Number(record.latitude);
    const longitude = Number(record.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new TypeError("Record coordinates are invalid");
    }
    record.id = record.propertyId;
    record.latitude = latitude;
    record.longitude = longitude;
  }
  if (entity === "contractOverlays") {
    if (typeof record.contractId !== "string" || !core.contracts.some((contract) => contract.id === record.contractId)) {
      throw new TypeError("Overlay contractId must identify an imported contract");
    }
    record.id = record.contractId;
  }
  if (entity === "propertyOverlays") {
    if (typeof record.propertyId !== "string" || !core.properties.some((property) => property.id === record.propertyId)) {
      throw new TypeError("Overlay propertyId must identify an imported property");
    }
    record.id = record.propertyId;
  }
  return record;
}

function ensureStoreShape(value) {
  const store=emptyStore();
  if(!value||typeof value!=="object"||Array.isArray(value))return store;
  const entities=value.entities||{};
  for(const entity of USER_ENTITIES) {
    if(Array.isArray(entities[entity]))
      store.entities[entity]=structuredClone(entities[entity]);
  }
  for(const entity of CORE_ENTITIES) {
    if(Array.isArray(value.deleted?.[entity]))
      store.deleted[entity]=structuredClone(value.deleted[entity]);
  }
  // One-time adoption of rows created by the short-lived separate
  // verksamhet model. No additional table is kept in the active store.
  const retiredBusinesses=new Map((Array.isArray(entities.businesses)?entities.businesses:[]).map(row=>[row.id,row]));
  const retiredLinks=Array.isArray(entities.contractBusinesses)?entities.contractBusinesses.filter(row=>!row.cancelled):[];
  const byContract=new Map();
  for(const link of retiredLinks){
    if(!link.contractId||!retiredBusinesses.has(link.businessId))continue;
    const list=byContract.get(link.contractId)||[];
    list.push(retiredBusinesses.get(link.businessId));
    byContract.set(link.contractId,list);
  }
  for(const [contractId,linked] of byContract){
    const unique=[...new Map(linked.map(row=>[row.id,row])).values()];
    if(unique.length>1)throw new TypeError('Avtal '+contractId+' har flera verksamheter i den tidigare modellen. Kontrollera och välj en verksamhet innan den tas bort.');
    const business=unique[0];
    const existing=store.entities.contractOverlays.find(row=>row.contractId===contractId);
    const overlay=existing||{id:contractId,contractId};
    if(!overlay.businessName)overlay.businessName=business.name||'';
    if(!overlay.businessDescription)overlay.businessDescription=business.description||'';
    if(!existing)store.entities.contractOverlays.push(overlay);
  }
  store.imported=structuredClone(value.imported||{properties:[],contracts:[]});
  store.updatedAt=typeof value.updatedAt==="string"?value.updatedAt:null;
  // No conversion from projects, maintenance, wishes, driftCosts or contacts.
  // Assignments, orders and activities are authored in their canonical collections.
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
    if (["__proto__", "prototype", "constructor", "path", "filepath", "lebpath", "coordinatespath", "sourcepath", "workbookpath"].includes(key.toLowerCase())) {
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
    this.importPreviews=new Map();
  }

  async initialize() {
    await fs.mkdir(path.dirname(path.resolve(this.dataPath)), { recursive: true });
    if (this.sourceAdapter) this.core = await this.sourceAdapter.loadCore();
    try {
      const rawStore = JSON.parse(await fs.readFile(this.dataPath, "utf8"));
      this.store = ensureStoreShape(rawStore);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await this.persist(this.store);
    }
    const normalized=globalThis.LokalblickObjectModel.normalize({properties:this.effectiveCore().properties,contracts:structuredClone(this.effectiveCore().contracts),objects:[...(this.core.objects||[]).filter(o=>!this.store.entities.objects.some(saved=>saved.id===o.id)),...this.store.entities.objects],activities:this.store.entities.activities});
    if(JSON.stringify(normalized.objects)!==JSON.stringify(this.store.entities.objects))this.store.entities.objects=normalized.objects;
    const responsibility=await this.bootstrap();
    this.store.entities.assignments=responsibility.assignments;
    this.store.entities.organizations=responsibility.organizations;
    await this.persist(this.store);
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
      const effectful=typeof result?.afterCommit==="function";
      if(effectful)result.afterCommit();
      return effectful?result.value:result;
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
    const properties = this.effectiveCore().properties
      .filter((property) => !deletedProperties.has(property.id))
      .map((property) => {
        const coordinates = this.coordinates.get(property.id);
        return coordinates
          ? { ...property, latitude: coordinates.latitude, longitude: coordinates.longitude }
          : { ...property };
      });
    const contracts = this.effectiveCore().contracts
      .filter((contract) => !deletedContracts.has(contract.id))
      .map((contract) => {
        const overlay = store.entities.contractOverlays.find((item) => item.contractId === contract.id);
        return overlay ? { ...contract, ...overlay, id: contract.id, propertyId: contract.propertyId } : { ...contract };
      });
    const completedProperties = properties.map((property) => {
      const overlay = store.entities.propertyOverlays.find((item) => item.propertyId === property.id);
      return overlay ? { ...property, ...overlay, id: property.id } : property;
    });
    const workspace = Object.fromEntries(USER_ENTITIES.map((entity) => [
      entity,
      structuredClone(store.entities[entity])
    ]));
    const metadata=store.entities.budgetData.find(x=>x.id==="lokalblick-v2-workspace")?.workspace||{};
    const keys=["budgetPlans","indexSeries","priceBaseAmounts","auditLog","sourceRegistry","importReview","documents","importMappings","importFieldPreferences"];
    return projectStoredAgreementItems(globalThis.LokalblickResponsibility.normalize(globalThis.LokalblickBusinessModel.normalize(globalThis.LokalblickObjectModel.normalize({
      ...Object.fromEntries(keys.filter(k=>Object.hasOwn(metadata,k)).map(k=>[k,structuredClone(metadata[k])])),
      isDemo: false,
      sourceName: "Lokal company source",
      workspaceRevision:this.revision(),
      ...workspace,
      properties: completedProperties,
      contracts,
      sourceCounts: structuredClone(this.core.sourceCounts || { sfRows: 0, extRows: 0 })
    }))));
  }

  effectiveCore(){
    return {...this.core,properties:[...this.core.properties,...(this.store.imported?.properties||[]).filter(p=>!this.core.properties.some(x=>x.id===p.id))],contracts:[...this.core.contracts,...(this.store.imported?.contracts||[]).filter(c=>!this.core.contracts.some(x=>x.id===c.id))]};
  }
  revision(){return createHash('sha256').update(JSON.stringify({core:this.core,store:this.store})).digest('hex');}
  async previewImport(payload){
    if(!payload||typeof payload!=='object'||!payload.data)throw TypeError('Importförslag saknas');
    validateJson(payload);
    await this.writeQueue;
    const base=await this.bootstrap(),revision=this.revision();
    if(payload.baseRevision&&payload.baseRevision!==revision){const e=Error('Arbetsytan har ändrats. Läs om underlaget innan import.');e.statusCode=409;throw e;}
    const entities=['properties','objects','contracts','organizations','people','activities','orders','recurringCosts'];
    const candidate={...base,...structuredClone(payload.data)};
    for(const entity of entities){if(!Array.isArray(candidate[entity]))throw TypeError(entity+' måste vara en lista');const ids=new Set();for(const row of candidate[entity]){validateRecord(row);if(ids.has(row.id))throw TypeError('Dubbelt ID i '+entity);ids.add(row.id);}}
    const proposed=globalThis.LokalblickImportRules.reconcile(base,{data:candidate,report:payload.report||{}},null,payload.report?.fileName||'Excelimport');
    this.validateImportedData(proposed.data);
    const previewId=randomUUID();
    this.importPreviews.set(previewId,{...proposed,revision,createdAt:Date.now()});
    for(const [id,preview] of this.importPreviews)if(Date.now()-preview.createdAt>30*60*1000)this.importPreviews.delete(id);
    return {previewId,baseRevision:revision,...proposed};
  }
  validateImportedData(data){
    data=globalThis.LokalblickObjectModel.projectAreas(structuredClone(data));
    globalThis.LokalblickObjectModel.validate(data);
    globalThis.LokalblickResponsibility.validate(data);
    globalThis.LokalblickBusinessModel.validate(data);
    globalThis.LokalblickRecurringCosts.validateCosts(data);
    for(const collection of ['properties','objects','contracts','activities','orders'])for(const row of data[collection]||[]){
      for(const [field,value] of Object.entries(row)){
        if(value==null||value==='')continue;
        if(/^(?:start|end|.*Date|orderedAt|paidAt|completedAt|terminatedOn)$/.test(field))parseDate(value);
        if(numberField(field)&&typeof value!=='number')throw TypeError('Ogiltigt tal i '+collection+'.'+field);
      }
      if(row.start&&row.end&&parseDate(row.end)<parseDate(row.start)||row.startDate&&row.endDate&&parseDate(row.endDate)<parseDate(row.startDate))throw TypeError('T.o.m. måste vara efter fr.o.m.');
      if(collection==='properties'&&(row.latitude!=null&&row.latitude!==''||row.longitude!=null&&row.longitude!=='')){const lat=Number(row.latitude),lon=Number(row.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat < -90||lat>90||lon < -180||lon>180)throw TypeError('Ogiltiga koordinater');}
      if(row.contractId&&!data.contracts.some(c=>c.id===row.contractId))throw TypeError('Avtalskopplingen finns inte');
      if(row.propertyId&&!data.properties.some(p=>p.id===row.propertyId))throw TypeError('Fastighetskopplingen finns inte');
      if(row.objectId&&!data.objects.some(o=>o.id===row.objectId))throw TypeError('Objektkopplingen finns inte');
      if(collection==='contracts'&&!row.objectId)throw TypeError('Avtalet måste tillhöra ett objekt');
      if(collection==='orders'&&!data.activities.some(a=>a.id===row.activityId))throw TypeError('Beställningen måste tillhöra en aktivitet');
    }
  }
  storeImportedWorkspace(store,data,master=this.core){
    data=globalThis.LokalblickObjectModel.stripAreas(structuredClone(data));
    store.imported={properties:data.properties.filter(p=>!master.properties.some(x=>x.id===p.id)).map(p=>structuredClone(p)),contracts:data.contracts.filter(c=>!master.contracts.some(x=>x.id===c.id)).map(c=>structuredClone(c))};
    for(const entity of USER_ENTITIES)if(!['propertyOverlays','contractOverlays','budgetData'].includes(entity))store.entities[entity]=structuredClone(data[entity]||store.entities[entity]);
    store.entities.propertyOverlays=data.properties.map(p=>{const original=master.properties.find(x=>x.id===p.id)||store.imported.properties.find(x=>x.id===p.id)||{};return {id:p.id,propertyId:p.id,...Object.fromEntries(Object.entries(p).filter(([k,v])=>k!=="id"&&(JSON.stringify(v)!==JSON.stringify(original[k])||p.provenance?.[k]?.source==="manual")))};});
    store.entities.contractOverlays=data.contracts.map(c=>{const original=master.contracts.find(x=>x.id===c.id)||store.imported.contracts.find(x=>x.id===c.id)||{};return {id:c.id,contractId:c.id,...Object.fromEntries(Object.entries(c).filter(([k,v])=>k!=="id"&&(JSON.stringify(v)!==JSON.stringify(original[k])||c.provenance?.[k]?.source==="manual")))};});
    const keys=['budgetPlans','indexSeries','priceBaseAmounts','auditLog','sourceRegistry','importReview','documents','importMappings','importFieldPreferences'];
    store.entities.budgetData=(data.budgetData||store.entities.budgetData).filter(x=>x.id!=='lokalblick-v2-workspace').concat([{id:'lokalblick-v2-workspace',workspace:Object.fromEntries(keys.map(k=>[k,structuredClone(data[k]||[])]))}]);
  }
  async applyImport(payload){
    const preview=this.importPreviews.get(payload?.previewId);
    if(!preview)throw TypeError('Importgranskningen finns inte längre. Förhandsgranska på nytt.');
    await this.commit(store=>{
      if(preview.revision!==this.revision()){const e=Error('Arbetsytan har ändrats efter granskningen. Förhandsgranska på nytt.');e.statusCode=409;throw e;}
      const data=preview.data;this.validateImportedData(data);
      this.storeImportedWorkspace(store,data);
    });
    this.importPreviews.delete(payload.previewId);await this.applyCoordinates();return this.bootstrap();
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
    const loaded=await this.sourceAdapter.loadCore();
    await this.commit(async store=>{
      const base=await this.bootstrap();
      const result=globalThis.LokalblickImportRules.reconcile(base,{data:{...base,properties:loaded.properties.filter(p=>!store.deleted.properties.includes(p.id)),contracts:loaded.contracts.filter(c=>!store.deleted.contracts.includes(c.id))}},null,'LEB');
      this.validateImportedData(result.data);this.storeImportedWorkspace(store,result.data,loaded);
      return {afterCommit:()=>{this.core=loaded;}};
    });
    await this.applyCoordinates();return this.bootstrap();
  }

  async saveWorkspace(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("Workspace payload must be an object");
    }
    payload=structuredClone(payload);
    const currentData=await this.bootstrap();
    const prepared={...structuredClone(currentData),...structuredClone(payload)};
    if(globalThis.LokalblickObjectModel.applyAreaChanges(currentData,prepared).size)payload.objects=structuredClone(prepared.objects);
    globalThis.LokalblickObjectModel.projectAreas(prepared);
    validateAgreementItems(prepared);
    stripStoredAgreementFinance(payload);
    if(Array.isArray(payload.objects))globalThis.LokalblickObjectModel.validate(prepared);
    if (Array.isArray(payload.recurringCosts)) {
      globalThis.LokalblickRecurringCosts.validateCosts({
        ...prepared,
        recurringCosts: payload.recurringCosts,
      });
    }
    const preparedResponsibility=globalThis.LokalblickResponsibility.normalize(globalThis.LokalblickBusinessModel.normalize(prepared));
    globalThis.LokalblickResponsibility.validate(preparedResponsibility,currentData);
    globalThis.LokalblickBusinessModel.validate(preparedResponsibility,currentData);
    globalThis.LokalblickObjectModel.stripAreas(payload);
    payload={...payload,assignments:preparedResponsibility.assignments};
    const approved=(collection,row,field,value)=>(payload.importReview||payload.budgetData?.find(x=>x.id==="lokalblick-v2-workspace")?.workspace?.importReview||[]).some(r=>r.kind==="operational-conflict"&&r.status==="accepted"&&(r.collection===collection||!r.collection&&r.entity===(collection==="contracts"?"Avtal":"Fastighet"))&&r.recordId===row.id&&r.field===field&&r.resolvedBy&&r.resolvedAt&&JSON.stringify(r.proposed)===JSON.stringify(value)&&[r.current,value].some(v=>JSON.stringify(currentData[collection].find(x=>x.id===row.id)?.[field])===JSON.stringify(v)));
    const updates = {};
    for (const entity of USER_ENTITIES) {
      if (Object.hasOwn(payload, entity)) {
        if (!Array.isArray(payload[entity])) throw new TypeError(`${entity} must be an array`);
        updates[entity] = payload[entity].map((record) => validateEntityRecord(entity, record, undefined, this.effectiveCore()));
      }
    }
    if (Array.isArray(payload.properties)) {
      const coordinates = new Map();
      for (const property of payload.properties) {
        if (!property || typeof property.id !== "string") continue;
        const hasLatitude = property.latitude != null && property.latitude !== "";
        const hasLongitude = property.longitude != null && property.longitude !== "";
        if (!hasLatitude && !hasLongitude) continue;
        const latitude = Number(property.latitude);
        const longitude = Number(property.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
          throw new TypeError("Property coordinates are invalid");
        }
        coordinates.set(property.id, {
          id: property.id,
          propertyId: property.id,
          latitude,
          longitude
        });
      }
      updates.coordinates = [...this.store.entities.coordinates.filter((record) => !coordinates.has(record.propertyId || record.id)), ...coordinates.values()];
    }
    if (Array.isArray(payload.contracts)) {
      const masterFields = new Set([
      "id", "contractId", "propertyId", "number", "source", "costCenter", "propertyDesignation",
        "address", "customerType", "landlord", "area", "contractType",
        "originalValidFrom", "originalValidTo", "currentValidTo", "extensionPeriod",
        "noticePeriod", "terminatedOn", "terminationReason", "noticeBy", "category",
        "use", "manager",
        "notice", "annualRent", "annualAdditions", "rentPerSqm", "rentBaseIndex",
        "derivedRentBaseIndex", "rentIndexCurrent", "rentIndexYear", "rentCalculationYear",
        "calculatedAnnualRent", "rentCalculationVariance", "rentCalculationStatus",
        "additionBaseIndex", "derivedAdditionBaseIndex", "additionIndexCurrent",
        "additionIndexYear", "additionCalculationYear", "calculatedAnnualAdditions",
        "additionCalculationVariance", "additionCalculationStatus"
      ]);
      const overlays = new Map(this.store.entities.contractOverlays.map((record) => [record.contractId, record]));
      for (const contract of payload.contracts) {
        if (!contract || typeof contract.id !== "string") continue;
        const master = this.effectiveCore().contracts.find((record) => record.id === contract.id);
        if (!master) continue;
        const overlay = {...overlays.get(contract.id), id: contract.id, contractId: contract.id };
        for (const [key, value] of Object.entries(contract)) {
          if ((!masterFields.has(key)||approved("contracts",contract,key,value)) && !["__proto__", "constructor", "prototype", "path", "filePath"].includes(key)) {
            validateJson(value);
            overlay[key] = value;
          }
        }
        if((prepared.agreementItems||[]).some(item=>item.contractId===contract.id))stripStoredAgreementFinance({contracts:[overlay],agreementItems:prepared.agreementItems});
        overlays.set(contract.id, overlay);
      }
      updates.contractOverlays = [...overlays.values()];
    }
    if (Array.isArray(payload.properties)) {
      const masterFields = new Set([
        "id", "type", "designation", "address", "owner", "manager", "latitude", "longitude"
      ]);
      const overlays = new Map(this.store.entities.propertyOverlays.map((record) => [record.propertyId, record]));
      for (const property of payload.properties) {
        if (!property || typeof property.id !== "string") continue;
        const overlay = {...overlays.get(property.id), id: property.id, propertyId: property.id };
        for (const [key, value] of Object.entries(property)) {
          if ((!masterFields.has(key)||approved("properties",property,key,value)) && !["__proto__", "constructor", "prototype", "path", "filePath"].includes(key)) {
            validateJson(value);
            overlay[key] = value;
          }
        }
        overlays.set(property.id, overlay);
      }
      updates.propertyOverlays = [...overlays.values()];
    }
    await this.commit(async (store) => {
      const fresh=await this.bootstrap();
      if(JSON.stringify(fresh.assignments)!==JSON.stringify(currentData.assignments)){const error=new Error('Ansvar eller verksamhetskopplingar har ändrats sedan inläsningen. Läs om innan du sparar');error.statusCode=409;throw error;}
      for (const [entity, records] of Object.entries(updates)) store.entities[entity] = records;
    });
    await this.applyCoordinates();
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
    const record = validateEntityRecord(entity, payload, undefined, this.effectiveCore());
    if (entity === "recurringCosts") {
      const snapshot = await this.bootstrap();
      globalThis.LokalblickRecurringCosts.validateCosts({
        ...snapshot,
        recurringCosts: [...snapshot.recurringCosts, record],
      });
    }
    if(entity==='agreementItems'){const data=await this.bootstrap();data.agreementItems.push(record);validateAgreementItems(data);}
    if(entity==='objects'){const data=await this.bootstrap();data.objects.push(record);globalThis.LokalblickObjectModel.validate(data);}
    await this.commit(async (store) => {
      if(['assignments','people','organizations'].includes(entity)){const before=await this.bootstrap();const candidate=structuredClone(before);candidate[entity].push(record);globalThis.LokalblickResponsibility.validate(candidate,before);globalThis.LokalblickBusinessModel.validate(candidate,before);}
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
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Record payload must be an object");
    return this.commit(async (store) => {
      const index = store.entities[entity].findIndex((item) => item.id === id);
      if (index < 0) return null;
      const record = validateEntityRecord(entity, { ...store.entities[entity][index], ...payload, id }, id, this.effectiveCore());
      if (entity === "recurringCosts") {
        const snapshot = await this.bootstrap();
        globalThis.LokalblickRecurringCosts.validateCosts({
          ...snapshot,
          recurringCosts: snapshot.recurringCosts.map(x => x.id === id ? record : x),
        });
      }
      if(['assignments','people','organizations'].includes(entity)){const current=await this.bootstrap();const data=structuredClone(current);data[entity]=data[entity].map(x=>x.id===id?record:x);globalThis.LokalblickResponsibility.validate(data,current);globalThis.LokalblickBusinessModel.validate(data,current);}
      if(entity==='agreementItems'){const data=await this.bootstrap();data.agreementItems=data.agreementItems.map(row=>row.id===id?record:row);validateAgreementItems(data);}
      if(entity==='objects'){const data={...this.core,objects:[...store.entities.objects.filter(o=>o.id!==id),record]};globalThis.LokalblickObjectModel.validate(data);}
      store.entities[entity][index] = record;
      return record;
    });
  }

  async delete(entity, id) {
    if (!ALL_ENTITIES.includes(entity)) throw new RangeError("Unknown entity");
    const responsibility=await this.bootstrap();
    if(responsibility.assignments.some(a=>a.personId===id&&entity==='people'||a.organizationId===id&&entity==='organizations'||a.targetType===Object.keys(globalThis.LokalblickResponsibility.types).find(k=>globalThis.LokalblickResponsibility.types[k]===entity)&&a.targetId===id))throw TypeError('Post med ansvarshistorik får inte raderas');
    if(entity==='organizations'&&(responsibility.contracts.some(c=>c.tenantPartyId===id)))throw TypeError('Part med verksamhet eller hyresavtal får inte raderas');
    if(entity==='assignments')throw TypeError('Ansvar avslutas med till-datum; historiken får inte raderas');
    if(entity==='agreementItems'){const data=await this.bootstrap();data.agreementItems=data.agreementItems.filter(item=>item.id!==id);validateAgreementItems(data);}
    if(entity==='objects'){const data=await this.bootstrap();if(data.contracts.some(c=>c.objectId===id)||data.activities.some(a=>a.objectId===id)||data.objects.some(o=>(o.predecessorIds||[]).includes(id)))throw TypeError('Objekt med avtal, aktiviteter eller historik får inte raderas');}
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
