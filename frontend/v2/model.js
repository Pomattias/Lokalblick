import "../services/import-formats.js";
import "../domain/object-model.js";
import "../domain/responsibility-model.js";
import "../domain/business-model.js";
import {normalizeActivityOptions} from "./activity-options.js";
export const collections = [
  "properties",
  "objects",
  "contracts",
  "organizations",
  "people",
  "assignments",
  "businesses",
  "contractBusinesses",
  "orders",
  "activities",
  "recurringCosts",
  "budgetPlans",
  "auditLog",
  "indexSeries",
  "sourceRegistry",
  "importReview",
  "documents",
];
export const kinds = {
  activities: "Ärende",
  recurringCosts: "Löpande kostnad",
};
export const clone = (x) => JSON.parse(JSON.stringify(x));

// The new app has one canonical activity and one order model.
// Source-file adapters may enrich it but no legacy Lokalblick collections are migrated.
function canonicalRelations(out) {
  const validOwnerManager=(personId, property)=>{
    const person=out.people.find(x=>x.id===personId);
    const owner=out.organizations.find(x=>x.id===property.ownerPartyId);
    return Boolean(person&&property.ownerPartyId&&owner&&person.organizationId===owner.id);
  };
  for(const property of out.properties) {
    if(property.ownerResponsiblePersonId&&!validOwnerManager(property.ownerResponsiblePersonId,property))
      property.ownerResponsiblePersonId="";
  }
  for(const contract of out.contracts) {
    // A contract belongs to one existing object/property. Never duplicate its home.
    if(contract.objectId && out.objects.some(o=>o.id===contract.objectId))
      delete contract.propertyId;
  }
  for(const activity of out.activities) {
    if(activity.contractId&&out.contracts.some(c=>c.id===activity.contractId))
      delete activity.propertyId;
  }
  return out;
}

function markCrossObjectReviews(out) {
  const pending=(out.importReview||[]).filter(
    (x)=>x.status==="pending"&&x.kind==="operational-conflict"&&(x.collection==="properties"||x.entity==="Fastighet"),
  );
  const groups=new Map();
  pending.forEach((item)=>{
    const key=[
      item.source||"",
      item.sheet||"",
      item.row||"",
      item.recordId||item.incomingRecordId||"",
    ].join("|");
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  });
  groups.forEach((items)=>{
    const identityConflict=items.find(
      (x)=>x.field==="sourceId"&&String(x.current||"").trim()&&String(x.proposed||"").trim()&&String(x.current).trim()!==String(x.proposed).trim(),
    );
    if(!identityConflict)return;
    items.forEach((item)=>{
      item.identityMismatch=true;
      item.matchWarning="Olika objekts-ID kräver ett uttryckligt identitetsval.";
    });
  });
  (out.sourceRegistry||[]).forEach((source)=>{
    source.review=(out.importReview||[]).filter(
      (item)=>item.status==="pending"&&(!source.name||item.source===source.name),
    ).length;
  });
}

function normalizeOwnerRelations(out) {
  const key = (name) =>
    String(name || "")
      .trim()
      .toLocaleLowerCase("sv")
      .replace(/[^a-zåäö0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const ensureOwner = (name) => {
    const label = String(name || "").trim();
    if (!label) return "";
    let org = out.organizations.find(
      (x) =>
        x.type === "owner" &&
        String(x.name || "").trim().toLocaleLowerCase("sv") ===
          label.toLocaleLowerCase("sv"),
    );
    if (!org) {
      org = {
        id: "OWNER|" + key(label),
        name: label,
        type: "owner",
        ownerClass: "",
      };
      out.organizations.push(org);
    }
    return org.id;
  };
  out.properties.forEach((property) => {
    if (property.owner && !property.ownerPartyId)
      property.ownerPartyId = ensureOwner(property.owner);
    if (!property.ownerPartyId && property.ownerOrgId)
      property.ownerPartyId = property.ownerOrgId;
    if (property.owner && !property.sourceOwner)
      property.sourceOwner = property.owner;
    if (property.manager && !property.sourceManager)
      property.sourceManager = property.manager;
    delete property.ownerOrgId;
    delete property.owner;
    delete property.manager;
  });
}
export function normalize(data) {
  const out = clone(data || {});
  const metadata = (out.budgetData || []).find(
    (x) => x.id === "lokalblick-v2-workspace",
  );
  if (metadata) Object.assign(out, metadata.workspace);
  out.activityOptions=normalizeActivityOptions(out.activityOptions);
  collections.forEach((k) => {
    if (!Array.isArray(out[k])) out[k] = [];
  });
  globalThis.LokalblickBusinessModel.normalize(out);
  globalThis.LokalblickResponsibility.normalize(out);
  // Validate the new canonical cost model before any persistence path uses it.
  // Old `operations` rows are deliberately not migrated into the new product.
  globalThis.LokalblickRecurringCosts?.validateCosts(out);
  normalizeOwnerRelations(out);
  // An activity without a home is a planning task, not an import conflict.
  // Preserve the historical review record while removing it from the open queue.
  for (const review of out.importReview) {
    if (review.status === "pending" && review.kind === "activity-property") {
      review.status = "planning";
      review.resolutionReason = "Hemvist tilldelas under Planera.";
    }
  }
  markCrossObjectReviews(out);
  for (const source of out.sourceRegistry) {
    source.review = out.importReview.filter(item =>
      item.status === "pending" && (!source.name || item.source === source.name)
    ).length;
  }
  out.contracts.forEach((c) => {
    c.start = c.start ?? c.originalValidFrom ?? "";
    c.end = c.end ?? c.currentValidTo ?? "";
    c.notice = c.notice ?? c.noticeBy ?? "";
  });
  const canonical = globalThis.LokalblickResponsibility.normalize(
    globalThis.LokalblickBusinessModel.normalize(
      globalThis.LokalblickObjectModel.normalize(canonicalRelations(out))
    )
  );
  // Include unknown imported categories/statuses in administration as inactive
  // options without altering their original values in activities or budgets.
  canonical.activityOptions=normalizeActivityOptions(canonical.activityOptions,canonical.activities);
  // Retired collections are not imported, persisted or converted in the new app.
  for(const key of ["contacts","projects","maintenance","investigations",
    "driftIssues","wishes","assignmentChanges","operations","driftCosts",
    "maintenanceStatus","legacyOrganizations"]) delete canonical[key];
  return canonical;
}
export function activityPropertyId(data, record) {
  if (!record) return "";
  const properties = data.properties || [];
  const objects = data.objects || [];
  const contracts = data.contracts || [];
  const contract = record.contractId ? contracts.find(c => String(c.id) === String(record.contractId)) : null;
  const objectId = record.objectId || contract?.objectId || "";
  const object = objectId ? objects.find(o => String(o.id) === String(objectId)) : null;
  const id = record.propertyId || contract?.propertyId || object?.propertyId || "";
  return properties.some(p => String(p.id) === String(id)) ? id : "";
}
export function activities(data) {
  return (data.activities || []).map((record) => ({
    collection: "activities",
    label: record.type || "Ärende",
    record,
    propertyId: activityPropertyId(data, record),
    title: record.title || record.category || record.id,
    cost: Number(record.estimatedCost) || 0,
  }));
}
export function responsible(data, collection, record) {
  if (!record) return "";
  if (collection === "properties") return record.responsiblePersonId || "";
  if (collection === "activities") return record.responsiblePersonId || "";
  if (collection === "businesses") return record.businessResponsiblePersonId || "";
  if(collection==='objects')return record.responsiblePersonId||data.properties.find(p=>p.id===record.propertyId)?.responsiblePersonId||'';
  if (collection === "contracts") {
    const property = data.properties.find((x) => x.id === record.propertyId);
    return record.responsiblePersonId || property?.responsiblePersonId || "";
  }
  return "";
}
export function scope(data, selection) {
  const allItems = activities(data);
  const q = String(selection.q || "").trim().toLocaleLowerCase("sv");
  const person = selection.person || "";
  const propertyById = new Map((data.properties || []).map((p) => [p.id, p]));
  const contractsByProperty = new Map();
  (data.contracts || []).forEach((c) => {
    if (!contractsByProperty.has(c.propertyId))
      contractsByProperty.set(c.propertyId, []);
    contractsByProperty.get(c.propertyId).push(c);
  });

  const contractMatchesBase = (c) => {
    const p = propertyById.get(c.propertyId) || {};
    return (
      (!selection.propertyId || c.propertyId === selection.propertyId) &&
      (!selection.unit || ((data.objects||[]).find(o=>o.id===c.objectId)?.unitId||c.unitId || p.unitId) === selection.unit) &&
      (!selection.owner || p.ownerPartyId === selection.owner) &&
      (!q ||
        [
          (data.objects||[]).find(o=>o.id===c.objectId)?.name,
          (data.objects||[]).find(o=>o.id===c.objectId)?.number,
          c.number,
          c.tenantName,
          c.use,
          c.businessName,
          p.address,
          p.designation,
        ]
          .join(" ")
          .toLocaleLowerCase("sv")
          .includes(q))
    );
  };

  const propertyMatchesBase = (p) => {
    const related = contractsByProperty.get(p.id) || [];
    const unitMatch =
      !selection.unit ||
      p.unitId === selection.unit ||
      related.some((c) => c.unitId === selection.unit)||
      (data.objects||[]).some(o=>o.propertyId===p.id&&o.unitId===selection.unit);
    const qMatch =
      !q ||
      [p.address, p.designation]
        .join(" ")
        .toLocaleLowerCase("sv")
        .includes(q) ||
      (data.objects||[]).some(o=>o.propertyId===p.id&&[o.number,o.name,o.use,o.businessName].join(' ').toLocaleLowerCase('sv').includes(q))||
      related.some((c) =>
        [c.number, c.use, c.businessName]
          .join(" ")
          .toLocaleLowerCase("sv")
          .includes(q),
      );
    return (
      (!selection.propertyId || p.id === selection.propertyId) &&
      (!selection.owner || p.ownerPartyId === selection.owner) &&
      unitMatch &&
      qMatch
    );
  };

  const baseContracts = (data.contracts || []).filter(contractMatchesBase);
  const contracts = baseContracts.filter((c) => {
    if (!person) return true;
    const p = propertyById.get(c.propertyId) || {};
    return responsible(data, "properties", p) === person;
  });

  const properties = (data.properties || []).filter((p) => {
    if (!propertyMatchesBase(p)) return false;
    return !person || responsible(data, "properties", p) === person;
  });

  const items = allItems.filter((x) => {
    const record = x.record || {};
    const contract = record.contractId
      ? (data.contracts || []).find((c) => c.id === record.contractId)
      : null;
    const propertyId = x.propertyId || contract?.propertyId || "";
    const property = propertyById.get(propertyId) || {};
    if (selection.propertyId && propertyId !== selection.propertyId) return false;
    if (selection.owner && property.ownerPartyId !== selection.owner) return false;
    if (selection.unit) {
      const object=(data.objects||[]).find(o=>o.id===record.objectId);
      const relatedUnit = record.scopeType === "unit" ? record.unitId : object?object.unitId:contract
        ? (contract.unitId || property.unitId)
        : property.unitId ||
          (contractsByProperty.get(propertyId) || []).find(
            (c) => c.unitId === selection.unit,
          )?.unitId;
      if (relatedUnit !== selection.unit) return false;
    }
    if (q) {
      const haystack = [
        (data.objects||[]).find(o=>o.id===record.objectId)?.name,
        (data.objects||[]).find(o=>o.id===record.objectId)?.number,
        record.title,
        record.description,
        record.type,
        property.address,
        property.designation,
        contract?.number,
        contract?.use,
        contract?.businessName,
      ]
        .join(" ")
        .toLocaleLowerCase("sv");
      if (!haystack.includes(q)) return false;
    }
    if (
      person &&
      responsible(data, "activities", record) !== person
    )
      return false;
    return true;
  });

  const propertyIds=new Set(properties.map(p=>p.id));
  const objects=(data.objects||[]).filter(o=>propertyIds.has(o.propertyId)&&(!selection.unit||o.unitId===selection.unit)&&(!q||[o.number,o.name,o.use,o.businessName,propertyById.get(o.propertyId)?.address,propertyById.get(o.propertyId)?.designation].join(' ').toLocaleLowerCase('sv').includes(q)));
  return { contracts, properties, objects, items };
}

export function audit(data, collection, id, before, after, actor) {
  const at = new Date().toISOString();
  if(JSON.stringify(before)===JSON.stringify(after))return;
  if(Object.keys(after).length&&['properties','objects','contracts','people','organizations','activities','orders'].includes(collection)){
    const originBefore=before.provenance||{};
    after.provenance ||= {};
    for(const field of Object.keys(after).filter(k=>!['provenance','updatedAt','updatedBy','versions','supplemental'].includes(k)&&JSON.stringify(before[k])!==JSON.stringify(after[k]))){
      if(JSON.stringify(after.provenance[field])===JSON.stringify(originBefore[field]))after.provenance[field]={source:'manual',value:after[field],at,confirmedBy:actor,actorVerified:false};
    }
  }
  data.auditLog.push({
    id: crypto.randomUUID(),
    at,
    by: actor,
    actorVerified: false,
    collection,
    recordId: id,
    action: !Object.keys(before).length
      ? "Skapad"
      : !Object.keys(after).length
        ? "Raderad"
        : "Ändrad",
    fields: [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .filter(
        (k) =>
          !["versions", "createdAt", "createdBy", "updatedAt", "updatedBy"].includes(
            k,
          ) && JSON.stringify(before[k]) !== JSON.stringify(after[k]),
      )
      .map((k) => ({
        field: k,
        from: before[k] ?? "",
        to: after[k] ?? "",
      })),
  });
}
export function setActivityHome(data, id, selectedHome, actor) {
  const record = (data.activities || []).find(a => String(a.id) === String(id));
  if (!record) throw Error("Aktiviteten saknas");
  const before = clone(record);
  const value = String(selectedHome || "");
  record.objectId="";
  if(value.startsWith("object:")){const object=data.objects.find(o=>o.id===value.slice(7));if(!object)throw Error("Objektet saknas");record.objectId=object.id;record.contractId="";record.propertyId=object.propertyId;record.unitId="";record.scopeType="object";
  }else if (value.startsWith("contract:")) {
    const contractId = value.slice("contract:".length);
    const contract = (data.contracts || []).find(c => String(c.id) === contractId);
    if (!contract) throw Error("Avtalet saknas");
    if (!(data.properties || []).some(p => String(p.id) === String(contract.propertyId)))
      throw Error("Avtalet saknar giltig fastighetskoppling");
    // A contract belongs to exactly one property; derive that property on read.
    record.contractId = contract.id;
    record.propertyId = "";
    record.unitId = "";
    record.scopeType = "contract";
  } else if (value.startsWith("property:")) {
    const propertyId = value.slice("property:".length);
    if (!(data.properties || []).some(p => String(p.id) === propertyId))
      throw Error("Fastigheten saknas");
    record.propertyId = propertyId;
    record.contractId = "";
    record.unitId = "";
    record.scopeType = "property";
  } else if (value.startsWith("unit:")) {
    const unitId = value.slice("unit:".length);
    if (!["VARDBO", "ORDBO", "MYND_STAB", "HOF"].includes(unitId))
      throw Error("Området saknas");
    record.propertyId = "";
    record.contractId = "";
    record.unitId = unitId;
    record.scopeType = "unit";
  } else if (value === "general" || value === "") {
    record.propertyId = "";
    record.contractId = "";
    record.unitId = "";
    record.scopeType = value === "general" ? "general" : "";
  } else {
    throw Error("Ogiltigt val av hemvist");
  }
  if (JSON.stringify(before) !== JSON.stringify(record))
    audit(data, "activities", record.id, before, record, actor);
}

export function assign(data, collection, id, person, actor) {
  let targetCollection = collection;
  if (!["properties", "activities"].includes(targetCollection)) {
    if (
      ["projects", "maintenance", "driftIssues", "wishes", "investigations"].includes(
        targetCollection,
      )
    )
      targetCollection = "activities";
    else throw Error("Ansvar kan sättas på fastighet eller aktivitet");
  }
  const record = data[targetCollection].find((x) => x.id === id);
  if (!record) throw Error("Posten finns inte");
  if (person) {
    const selected = data.people.find((x) => x.id === person);
    if (!selected) throw Error("Ansvarig person finns inte");
    if (selected.organizationId) {
      const organization = data.organizations.find(
        (x) => x.id === selected.organizationId,
      );
      if (organization && organization.type !== "our")
        throw Error("Ansvarig hos oss måste tillhöra vår organisation");
    }
  }
  const old = record.responsiblePersonId || "";
  if (old === person) return;
  const before = clone(record);
  globalThis.LokalblickResponsibility.change(data,{targetType:targetCollection==='properties'?'property':'activity',targetId:id,role:'our',personId:person||'',actor});
  audit(data, targetCollection, id, before, record, actor);
}
export function moveWish(data, id, target, actor) {
  const nextType =
    target === "maintenance" || target === "Underhåll"
      ? "Underhåll"
      : target === "driftIssues" || target === "Drift"
        ? "Drift"
        : "";
  if (!nextType) throw Error("Ogiltig aktivitetstyp");
  const activity = data.activities.find((x) => x.id === id);
  if (!activity || activity.type !== "Önskemål")
    throw Error("Önskemålet saknas");
  const before = clone(activity);
  activity.type = nextType;
  activity.status = "Planerad";
  activity.budgetCategory =
    nextType === "Underhåll" ? "Underhåll" : "Driftkostnader";
  audit(data, "activities", id, before, activity, actor);
}
// Keep one preferred source per canonical field and incoming file.
export const importPreferenceKey=(col,field,source)=>[col,field,source].map(x=>String(x||"").trim().toLocaleLowerCase("sv")).join("|");
export const reviewCollection=item=>item.collection||(item.kind==="conflict"||item.entity==="Avtal"?"contracts":item.entity==="Fastighet"?"properties":"");
export const bulkEligible=item=>item?.status==="pending"&&["conflict","operational-conflict"].includes(item.kind)&&
  Boolean(item.field)&&Boolean(item.source)&&["properties","objects","contracts","activities"].includes(reviewCollection(item))&&
  !["id","sourceId","objectId","propertyId","contractId","hyresberäkning","tilläggsberäkning"].includes(item.field);
export function bulkReviewDecision(data,group,decision,actor) {
  if(!["accept","reject"].includes(decision))throw Error("Välj en prioriterad källa.");
  const items=(data.importReview||[]).filter(x=>bulkEligible(x)&&reviewCollection(x)===group.collection&&x.field===group.field&&x.source===group.source);
  if(!items.length)throw Error("Inga konflikter att hantera.");
  const seen=new Map();
  for(const item of items) {
    const id=item.recordId||item.contractId;
    if(!id)throw Error("Koppling till objekt saknas; välj dessa poster manuellt.");
    const key=id+"|"+item.field;
    if(seen.has(key)&&JSON.stringify(seen.get(key))!==JSON.stringify(item.proposed))
      throw Error("Motstridiga värden för samma objekt; välj dessa manuellt.");
    seen.set(key,item.proposed);
    if(decision==="accept"){
      const row=(data[group.collection]||[]).find(x=>x.id===id);
      if(!row||JSON.stringify(row[item.field]??"")!==JSON.stringify(item.current??""))
        throw Error("Befintligt värde har ändrats; granska posten manuellt.");
    }
  }
  // Repeated reports for the very same object/field/value are one real
  // decision. Mark duplicate review cards as handled without duplicate edits.
  const handled=new Set();
  const now=new Date().toISOString();
  for(const item of items) {
    const key=(item.recordId||item.contractId)+"|"+item.field;
    if(handled.has(key)) {
      item.status=decision==="accept"?"accepted":"rejected";
      item.resolvedBy=actor;
      item.resolvedAt=now;
      item.resolutionReason="Samma värde hanterades redan via källprioritet.";
    } else {
      resolveReview(data,item.id,decision,"",actor);
      handled.add(key);
    }
  }
  data.importFieldPreferences ||= {};
  data.importFieldPreferences[importPreferenceKey(group.collection,group.field,group.source)]=decision;
  return items.length;
}
export function clearSourcePreference(data,key) {
  if(!Object.prototype.hasOwnProperty.call(data.importFieldPreferences||{},key))throw Error("Regeln saknas.");
  delete data.importFieldPreferences[key];
}
export function resolveReview(data, id, decision, targetId, actor) {
  const item = data.importReview.find((x) => x.id === id);
  if (!item || item.status !== "pending")
    throw Error("Förslaget är redan hanterat");

  if(item.kind==='multi-contract-value'){
    if(decision==='accept')throw Error('Ange värdet per avtal i underlaget eller avtalsformuläret. Ett gemensamt belopp får inte kopieras till flera avtal.');
    item.status='rejected';item.resolvedBy=actor;item.resolvedAt=new Date().toISOString();return;
  }
  if(item.kind==='business-identity'){
    if(decision==='accept'){
      const c=data.contracts.find(c=>c.id===(item.values?.contractId||item.values?.id));
      if(!c)throw Error('Avtalet saknas');
      const before=clone(c);
      if(item.collection==='contracts'){
        if(!data.organizations.some(o=>o.id===targetId))throw Error('Välj rätt hyresgäst');
        c.tenantPartyId=targetId;c.provenance ||= {};c.provenance.tenantPartyId={source:item.source,value:targetId,confirmedBy:actor};
      }else{
        if(!data.businesses.some(b=>b.id===targetId))throw Error('Välj rätt verksamhet');
        c.businessLinksManaged=true;
        if(!data.contractBusinesses.some(l=>l.contractId===c.id&&l.businessId===targetId))data.contractBusinesses.push({id:'CB|'+c.id+'|'+targetId,contractId:c.id,businessId:targetId,fromDate:'',toDate:'',usedArea:null,costSharePercent:null,provenance:{source:item.source,confirmedBy:actor}});
        globalThis.LokalblickBusinessModel.validate(data);
      }
      audit(data,'contracts',c.id,before,c,actor);
    }
    item.status=decision==='accept'?'accepted':'rejected';item.resolvedBy=actor;item.resolvedAt=new Date().toISOString();return;
  }

  if(item.kind==='mapped-identity'){
    if(decision==='accept'){
      if(/ogiltigt|tvetydigt datum/i.test(item.reason||''))throw Error('Rätta det felaktiga värdet i underlaget och läs in på nytt.');
      const record=(data[item.collection]||[]).find(x=>x.id===targetId);
      if(!record)throw Error('Välj rätt befintlig post');
      const before=clone(record);record.provenance ||= {};
      for(const [field,value] of Object.entries(item.values||{})){
        if(record[field]!==''&&record[field]!=null&&JSON.stringify(record[field])!==JSON.stringify(value)){
          const conflictId=item.id+'|'+field;
          if(!data.importReview.some(x=>x.id===conflictId))data.importReview.push({id:conflictId,kind:'operational-conflict',status:'pending',collection:item.collection,recordId:record.id,source:item.source,field,current:record[field],proposed:value,provenance:item.origins?.[field]});
        }else if(record[field]===''||record[field]==null){record[field]=value;record.provenance[field]={...item.origins?.[field],value,confirmedBy:actor,actorVerified:false};}
      }
      record.supplemental ||= [];
      for(const extra of item.extras||[])if(!record.supplemental.some(x=>JSON.stringify(x)===JSON.stringify(extra)))record.supplemental.push(extra);
      audit(data,item.collection,record.id,before,record,actor);
    }
    item.status=decision==='accept'?'accepted':'rejected';item.resolvedBy=actor;item.resolvedAt=new Date().toISOString();return;
  }

  if (item.kind === "person") {
    const person = data.people.find((x) => x.id === item.personId);
    if (decision === "accept" && person) {
      person.identityStatus = person.provisional
        ? "reviewed-provisional"
        : "confirmed";
    }
    if (decision === "reject" && person?.provisional) {
      delete data.contacts;
      data.properties.forEach((x) => { if (x.responsiblePersonId === person.id) x.responsiblePersonId = ""; if (x.ownerResponsiblePersonId === person.id) x.ownerResponsiblePersonId = ""; });
      data.contracts.forEach((x) => { if (x.businessResponsiblePersonId === person.id) x.businessResponsiblePersonId = ""; });
      data.activities.forEach((x) => { if (x.responsiblePersonId === person.id) x.responsiblePersonId = ""; });
      (data.orders||[]).forEach((x) => { if (x.orderedByPersonId === person.id) x.orderedByPersonId = ""; });
      data.people = data.people.filter((x) => x.id !== person.id);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "property-match") {
    if (decision === "accept") {
      const property = data.properties.find((p) => p.id === targetId);
      if (!property) throw Error("Välj en befintlig fastighet");
      const before = clone(property);
      const source = item.record || {};
      if (!property.name && source.name) property.name = source.name;
      if (!property.address && source.address) property.address = source.address;
      if (!property.designation && source.designation)
        property.designation = source.designation;
      property.sourceAliases = [
        ...new Set(
          [
            ...(property.sourceAliases || []),
            source.objectNo,
            source.name,
            source.address,
            source.designation,
          ].filter(Boolean),
        ),
      ];
      property.provenance = property.provenance || {};
      property.provenance.sourceAliases = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value: property.sourceAliases,
        confirmedBy: actor,
      };
      audit(data, "properties", property.id, before, property, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "activity-property") {
    if (decision === "accept") {
      const property = data.properties.find((p) => p.id === targetId);
      if (!property) throw Error("Välj en befintlig fastighet");
      const record = data.activities.find((x) => x.id === item.recordId);
      if (!record) throw Error("Aktiviteten finns inte");
      const before = clone(record);
      record.propertyId = targetId;
      record.provenance = record.provenance || {};
      record.provenance.propertyId = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value: targetId,
        confirmedBy: actor,
      };
      property.sourceAliases = [
        ...new Set(
          [
            ...(property.sourceAliases || []),
            item.record?.business,
            item.record?.address,
          ].filter(Boolean),
        ),
      ];
      audit(data, "activities", record.id, before, record, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (item.kind === "operational-conflict") {
    if (decision === "accept") {
      const collection =
        item.collection ||
        (item.entity === "Fastighet"
          ? "properties"
          : item.entity === "Avtal"
            ? "contracts"
            : "");
      const rows = Array.isArray(data[collection]) ? data[collection] : [];
      let record = rows.find((x) => x.id === item.recordId);
      if (!record && item.field) {
        const matches = rows.filter(
          (x) => JSON.stringify(x[item.field] ?? "") === JSON.stringify(item.current ?? ""),
        );
        if (matches.length === 1) record = matches[0];
      }
      if (!record) throw Error("Den registrerade posten kunde inte identifieras. Läs in filen på nytt.");
      if(Object.hasOwn(item,"current")&&JSON.stringify(record[item.field]??"")!==JSON.stringify(item.current??""))throw Error("Värdet har ändrats sedan granskningen. Läs om underlaget.");
      const formats=globalThis.LokalblickImportFormats;
      if(formats.dateField(item.field)&&item.proposed)formats.parseDate(item.proposed,globalThis.XLSX);
      if(formats.numberField(item.field)&&item.proposed!==''&&item.proposed!=null)formats.parseNumber(item.proposed);
      const parents={propertyId:'properties',objectId:'objects',contractId:'contracts',activityId:'activities',ownerPartyId:'organizations',responsiblePersonId:'people'};
      if(parents[item.field]&&item.proposed&&!(data[parents[item.field]]||[]).some(x=>x.id===item.proposed))throw Error('Kopplingen finns inte. Välj en befintlig post.');
      const before = clone(record);
      record[item.field] = item.proposed;
      record.provenance = record.provenance || {};
      record.provenance[item.field] = {
        ...item.provenance,
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value: item.proposed,
        confirmedBy: actor,
      };
      audit(data, collection, record.id, before, record, actor);
    }
    item.status = decision === "accept" ? "accepted" : "rejected";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (decision === "accept" && item.kind === "record") {
    const allowed = ["activities", "recurringCosts"];
    if (!allowed.includes(item.collection)) throw Error("Ogiltig importtyp");
    const existing = data[item.collection].find((r) => r.id === item.recordId);
    const record = clone(item.record);
    record.id = existing?.id || crypto.randomUUID();
    record.propertyId = targetId || record.propertyId;
    if (!data.properties.some((p) => p.id === record.propertyId))
      throw Error("Välj en befintlig fastighet");
    if (
      record.contractId &&
      !data.contracts.some(
        (c) => c.id === record.contractId && c.propertyId === record.propertyId,
      )
    )
      throw Error("Avtalet tillhör en annan fastighet");
    record.provenance = existing?.provenance || {};
    Object.keys(record)
      .filter((k) => k !== "provenance")
      .forEach((k) => {
        record.provenance[k] = {
          source: item.source,
          sheet: item.sheet,
          row: item.row,
          value: record[k],
          confirmedBy: actor,
        };
      });
    if (existing) {
      const before = clone(existing);
      Object.assign(existing, record);
      audit(data, item.collection, record.id, before, existing, actor);
    } else {
      data[item.collection].push(record);
      audit(data, item.collection, record.id, {}, record, actor);
    }
    item.status = "accepted";
    item.resolvedBy = actor;
    item.resolvedAt = new Date().toISOString();
    return;
  }

  if (decision === "accept") {
    const contract = data.contracts.find(
      (x) => x.id === (item.contractId || targetId),
    );
    if (!contract) throw Error("Välj ett befintligt avtal");
    const before = clone(contract);
    contract.provenance = contract.provenance || {};
    const apply = (key, value) => {
      contract[key] = value;
      contract.provenance[key] = {
        source: item.source,
        sheet: item.sheet,
        row: item.row,
        value,
        confirmedBy: actor,
      };
    };
    if (item.kind === "conflict") {
      if (["hyresberäkning", "tilläggsberäkning"].includes(item.field))
        throw Error("Beräkningsavvikelsen måste kontrolleras i avtalet");
      apply(item.field, item.proposed);
    } else {
      Object.entries(item.record || {})
        .filter(
          ([k, v]) =>
            ![
              "id",
              "number",
              "sourceRow",
              "designation",
              "address",
              "targetYear",
              "landlord",
              "department",
            ].includes(k) &&
            v !== "" &&
            v != null &&
            v !== 0,
        )
        .forEach(([k, v]) => {
          const key =
            {
              documentUrl: "contractDocumentUrl",
              documentName: "contractDocumentName",
              documentKind: "contractDocumentKind",
            }[k] || k;
          if (
            contract[key] == null ||
            contract[key] === "" ||
            contract[key] === 0
          )
            apply(key, v);
          else if (contract[key] !== v)
            data.importReview.push({
              id: crypto.randomUUID(),
              kind: "conflict",
              source: item.source,
              sheet: item.sheet,
              row: item.row,
              contractId: contract.id,
              field: key,
              current: contract[key],
              proposed: v,
              status: "pending",
            });
        });
    }
    audit(data, "contracts", contract.id, before, contract, actor);
    item.contractId = contract.id;
  }
  item.status = decision === "accept" ? "accepted" : "rejected";
  item.resolvedBy = actor;
  item.resolvedAt = new Date().toISOString();
}
