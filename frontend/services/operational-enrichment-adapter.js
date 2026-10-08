// Multi-sheet operational enrichment adapter for Lokalblick.
// Reads human-maintained Excel workbooks and enriches existing Lokalblick data
// without replacing property/contract identity from the primary source.
(function (root) {
  function text(v) { return String(v == null ? "" : v).replace(/\u00a0/g, " ").trim(); }
  function norm(v) {
    return text(v).toLocaleLowerCase("sv")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9åäö]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function compact(v) { return norm(v).replace(/\s+/g, ""); }
  function aliasKey(v) {
    return compact(v).replace(/(sabo|säbo|vårdbo|vardbo|äbo|abo|boende)$/g, "");
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function num(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    var s = text(v).replace(/\s/g, "").replace(/kr|sek|tkr/gi, "").replace(/%/g, "");
    if (!s) return 0;
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.indexOf(",") >= 0) s = s.replace(",", ".");
    var n = Number(s.replace(/[^0-9+\-.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  function excelDate(v) {
    if (!v) return "";
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
    var s = text(v), m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (m) return m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0");
    return s;
  }
  function hash(value) {
    var h = 2166136261, s = String(value || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36).toUpperCase();
  }
  function matrix(workbook, name) {
    var sheet = workbook && workbook.Sheets ? workbook.Sheets[name] : null;
    return sheet ? root.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }) : [];
  }
  function hmap(row) {
    var out = {};
    (row || []).forEach(function (v, i) { var k = norm(v); if (k && out[k] == null) out[k] = i; });
    return out;
  }
  function findCol(headers, aliases) {
    for (var i = 0; i < aliases.length; i++) { var k = norm(aliases[i]); if (headers[k] != null) return headers[k]; }
    return -1;
  }
  function cell(row, headers, aliases) { var i = findCol(headers, aliases); return i >= 0 ? row[i] : ""; }
  function findHeader(rows, required, maxRows) {
    var best = null;
    for (var r = 0; r < Math.min(rows.length, maxRows || 10); r++) {
      var headers = hmap(rows[r]), score = 0;
      required.forEach(function (aliases) { if (findCol(headers, aliases) >= 0) score++; });
      if (!best || score > best.score) best = { row: r, headers: headers, score: score, headerRow: rows[r] };
    }
    return best;
  }
  function addProvenance(record, key, value, source, sheet, row) {
    if (!record) return;
    record.provenance = record.provenance || {};
    record.provenance[key] = { source: source, sheet: sheet, row: row, value: value };
  }
  function review(data, report, entry) {
    data.importReview = Array.isArray(data.importReview) ? data.importReview : [];
    var signature = [entry.kind, entry.source, entry.sheet, entry.row, entry.field, entry.targetId, entry.personName].map(text).join("|");
    if (data.importReview.some(function (x) {
      if(x.status!=="pending")return false;
      if(x._signature===signature)return true;
      // The first-pass core importer may have already logged the same conflict.
      // The operational adapter must not show an identical second review.
      return entry.kind==="operational-conflict"&&x.kind===entry.kind&&
        x.source===entry.source&&x.collection===entry.collection&&
        x.recordId===entry.recordId&&x.field===entry.field&&
        JSON.stringify(x.current??"")===JSON.stringify(entry.current??"")&&
        JSON.stringify(x.proposed??"")===JSON.stringify(entry.proposed??"");
    })) return;
    var item = Object.assign({ id: "review:" + hash(signature + "|" + Date.now()), status: "pending", _signature: signature }, entry);
    data.importReview.push(item);
    report.needsReview.push(item);
  }
  function unitId(v) {
    var s = norm(v);
    if (/ordbo/.test(s)) return "ORDBO";
    if (/hof|hälsa|halsa/.test(s)) return "HOF";
    if (/sabo|säbo|vårdbo|vardbo|äbo|abo/.test(s)) return "VARDBO";
    if (/mynd|stab/.test(s)) return "MYND_STAB";
    return "";
  }
  function ensureOrg(data, name, type) {
    var label = text(name); if (!label) return "";
    data.organizations = Array.isArray(data.organizations) ? data.organizations : [];
    var found = data.organizations.find(function (o) { return norm(o.name) === norm(label) && (!type || o.type === type); });
    if (found) return found.id;
    var id = "ORG|" + hash((type || "org") + "|" + label);
    data.organizations.push({ id: id, name: label, type: type || "owner", ownerClass: type === "owner" ? "Extern" : "" });
    return id;
  }
  function ourOrgId(data) {
    var found = (data.organizations || []).find(function (o) { return o.type === "our"; });
    return found ? found.id : ensureOrg(data, "Vår organisation", "our");
  }
  function splitNames(v) {
    return text(v).split(/\s*(?:\/|;|\boch\b|,)\s*/i).map(function (x) { return text(x); }).filter(Boolean);
  }
  function emails(v) {
    return text(v).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || [];
  }
  function firstName(v) { return norm(v).split(" ")[0] || ""; }
  function ensurePerson(data, report, spec) {
    data.people = Array.isArray(data.people) ? data.people : [];
    var email = text(spec.email).toLowerCase(), name = text(spec.name), orgId = spec.organizationId || "";
    var found = email ? data.people.find(function (p) { return text(p.email).toLowerCase() === email; }) : null;
    if (!found && name) found = data.people.find(function (p) { return norm(p.name) === norm(name) && (!orgId || !p.organizationId || p.organizationId === orgId); });
    if (!found && name && name.indexOf(" ") > 0) {
      var fn = firstName(name), candidates = data.people.filter(function (p) { return p.provisional && firstName(p.name) === fn && (!orgId || !p.organizationId || p.organizationId === orgId); });
      if (candidates.length === 1) found = candidates[0];
    }
    if (!found && name && name.indexOf(" ") < 0) {
      var firstMatches = data.people.filter(function (p) { return firstName(p.name) === firstName(name) && (!orgId || !p.organizationId || p.organizationId === orgId); });
      if (firstMatches.length === 1) found = firstMatches[0];
    }
    if (!found) {
      var provisional = Boolean(spec.provisional || (!email && name.indexOf(" ") < 0));
      found = {
        id: "P|" + hash((email || norm(name)) + "|" + orgId),
        name: name || email || "Okänd person",
        organizationId: orgId,
        unitId: spec.unitId || "",
        role: spec.role || "",
        email: email,
        provisional: provisional,
        identityStatus: provisional ? "provisional" : "confirmed"
      };
      data.people.push(found); report.counts.peopleCreated++;
      if (provisional) review(data, report, { kind: "person", source: spec.source, sheet: spec.sheet, row: spec.row, personId: found.id, personName: found.name, record: clone(found), message: "Personen saknar fullständig identitet och bör kompletteras." });
    } else {
      if (email && !found.email) found.email = email;
      if (name && (found.provisional || !found.name)) found.name = name;
      if (orgId && !found.organizationId) found.organizationId = orgId;
      if (spec.unitId && !found.unitId) found.unitId = spec.unitId;
      if (spec.role && !found.role) found.role = spec.role;
      if (email && name.indexOf(" ") > 0) { found.provisional = false; found.identityStatus = "confirmed"; }
    }
    return found;
  }
  function setOwnerResponsible(data, report, property, person, sourceMeta) {
    if (!property || !person) return;
    if (!property.ownerResponsiblePersonId) {
      property.ownerResponsiblePersonId = person.id;
      addProvenance(property, "ownerResponsiblePersonId", person.id, sourceMeta.source, sourceMeta.sheet, sourceMeta.row);
      report.counts.ownerResponsibilitiesSet++;
    }
  }
  function createOrder(data, report, activity, spec) {
    data.orders = Array.isArray(data.orders) ? data.orders : [];
    var id = spec.id || "ORD|" + hash(activity.id + "|" + (spec.orderedAt || "") + "|" + (spec.orderReference || "") + "|" + (spec.supplier || "") + "|" + (spec.orderedCost || spec.finalCost || ""));
    var found=data.orders.find(function(x){return x.id===id;});
    if(found) return found;
    found={id:id,activityId:activity.id,orderedByPersonId:spec.orderedByPersonId||"",orderedAt:spec.orderedAt||"",supplier:spec.supplier||"",orderReference:spec.orderReference||"",orderedCost:Number(spec.orderedCost)||0,deliveryText:spec.deliveryText||"",completedAt:spec.completedAt||"",finalCost:Number(spec.finalCost)||0,paymentStatus:spec.paymentStatus||"",paidAt:spec.paidAt||"",invoiceComment:spec.invoiceComment||"",ownerPays:spec.ownerPays||"",provenance:{source:spec.source||"",sheet:spec.sheet||"",row:spec.row||""}};
    data.orders.push(found); report.counts.ordersCreated++; return found;
  }
  function propertyMatcher(data) {
    var aliases = new Map();
    function addAlias(value, id) {
      var k = aliasKey(value); if (!k || !id) return;
      if (!aliases.has(k)) aliases.set(k, new Set()); aliases.get(k).add(id);
    }
    (data.properties || []).forEach(function (p) {
      addAlias(p.id, p.id); addAlias(p.address, p.id); addAlias(p.designation, p.id); addAlias(p.name, p.id);
      (p.sourceAliases || []).forEach(function (alias) { addAlias(alias, p.id); });
    });
    function addressParts(value) {
      var raw=norm(value), match=raw.match(/^(.*?)(\d+)(.*)$/);
      return match
        ? { street:compact(match[1]), number:Number(match[2]), tail:compact(match[3]) }
        : { street:compact(raw), number:null, tail:"" };
    }
    function addressScore(a, b) {
      var aa=addressParts(a),bb=addressParts(b);
      if(!aa.street||!bb.street||aa.street!==bb.street) return 0;
      if(aa.number!=null&&bb.number!=null&&aa.number!==bb.number) return 0;
      if(compact(a)===compact(b)) return 100;
      if(aa.number!=null&&bb.number!=null&&aa.number===bb.number) return 88;
      if(aa.number==null||bb.number==null) return 76;
      return 0;
    }
    function match(spec) {
      var candidates = [], objectKey = spec.objectNo ? compact(spec.objectNo) : "";
      if (objectKey) {
        candidates = (data.properties || []).filter(function (p) { return compact(p.id) === objectKey || compact(p.sourceId) === objectKey; });
        if (candidates.length === 1) return { property: candidates[0], method: "objektsnummer", score: 100 };
      }
      function identityCompatible(p) {
        if(!objectKey) return true;
        var existingKey=compact(p.sourceId||"");
        return !existingKey || existingKey===objectKey || compact(p.id)===objectKey;
      }
      if (spec.designation) {
        candidates = (data.properties || []).filter(function (p) {
          return identityCompatible(p) && compact(p.designation) && compact(p.designation) === compact(spec.designation);
        });
        if (candidates.length === 1) return { property: candidates[0], method: "fastighetsbeteckning", score: 95 };
      }
      if (spec.address) {
        var scored = (data.properties || []).filter(identityCompatible).map(function (p) { return { p: p, s: addressScore(spec.address, p.address) }; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; });
        if (scored.length && (!scored[1] || scored[0].s > scored[1].s)) return { property: scored[0].p, method: "adress", score: scored[0].s };
      }
      var keys = [spec.name, spec.business, spec.address].map(aliasKey).filter(Boolean);
      for (var i = 0; i < keys.length; i++) {
        var ids = aliases.get(keys[i]);
        if (ids && ids.size === 1) {
          var id = Array.from(ids)[0], property=(data.properties||[]).find(function (p) { return p.id === id; });
          if(property&&identityCompatible(property)) return { property: property, method: "alias", score: 80 };
        }
      }
      return { property: null, method: "", score: 0 };
    }
    return { addAlias: addAlias, match: match };
  }
  function normalizeContractNo(v) { return text(v).replace(/\s/g, "").toUpperCase(); }
  function matchContract(data, number, propertyId) {
    var n = normalizeContractNo(number); if (!n) return null;
    var rows = (data.contracts || []).filter(function (c) { return normalizeContractNo(c.number || c.sourceId) === n; });
    if (propertyId) rows = rows.filter(function (c) { return c.propertyId === propertyId; });
    return rows.length === 1 ? rows[0] : null;
  }
  function recordCollection(data, record) {
    var keys = ["properties","contracts","activities","people","contacts"];
    for (var i = 0; i < keys.length; i++) if ((data[keys[i]] || []).indexOf(record) >= 0) return keys[i];
    return "";
  }
  function normalizedAddress(value) {
    // Do not merge changed house numbers, suffixes, or address ranges.
    return text(value).toLocaleLowerCase("sv").replace(/\s+/g," ")
      .replace(/(\d)\s+([a-zåäö])(?=$|[\s,.])/gi,"$1$2").trim();
  }
  function equivalentField(key,oldValue,newValue) {
    if (key==="address") return normalizedAddress(oldValue)===normalizedAddress(newValue);
    if (typeof oldValue==="string" && typeof newValue==="string") return norm(oldValue)===norm(newValue);
    return false;
  }
  function setIfBlank(record, key, value, source, sheet, row, data, report) {
    if (value === "" || value == null || value === 0) return false;
    if (record[key] === "" || record[key] == null || record[key] === 0) {
      record[key] = value; addProvenance(record, key, value, source, sheet, row); return true;
    }
    if (JSON.stringify(record[key]) !== JSON.stringify(value) && !equivalentField(key,record[key],value)) {
      const collection=recordCollection(data,record);
      const rule=(data.importFieldPreferences||{})[[collection,key,source].map(x=>text(x).toLocaleLowerCase("sv")).join("|")];
      if(rule==="reject"&&!["id","sourceId","propertyId","contractId"].includes(key))return false;
      if(rule==="accept"&&!["id","sourceId","propertyId","contractId"].includes(key)){
        record[key]=value;addProvenance(record,key,value,source,sheet,row);return true;
      }
      review(data, report, { kind: "operational-conflict", source: source, sheet: sheet, row: row, collection: recordCollection(data, record), recordId: record.id, targetId: record.id, field: key, current: record[key], proposed: value });
    }
    return false;
  }
  function tokenSimilarity(a, b) {
    var aa = norm(a).split(" ").filter(function (x) { return x.length > 2; }), bb = norm(b).split(" ").filter(function (x) { return x.length > 2; });
    if (!aa.length || !bb.length) return 0;
    var A = new Set(aa), B = new Set(bb), inter = 0;
    A.forEach(function (x) { if (B.has(x)) inter++; });
    return inter / Math.max(A.size, B.size);
  }
  function activityCollections(data) {
    return (data.activities || []).map(function (r) {
      return { collection: "activities", type: r.type || "Önskemål", title: r.title || "", record: r };
    });
  }
  function classifyActivity(row) {
    var type = norm(row.costType), all = norm([row.title, row.comment, row.extraComment].join(" "));
    if (/utred/.test(all) && !/bygg|renover|installation|installera/.test(all)) return "Utredning";
    if (/drift/.test(type)) return "Drift";
    if (/invest/.test(type)) return "Projekt";
    if (/felanm|trasig|larm|service|reparation|strömavbrott|stromavbrott|kärvar|karvar/.test(all)) return "Drift";
    return "Önskemål";
  }
  function findActivity(data, propertyId, title, type, sourceId, sourceOnly) {
    // For orders, only exact source identity is safe. Similar titles can
    // represent different orders and costs at the same premises.
    if (sourceId) {
      const existing=(data.activities||[]).filter(a=>a.sourceId===sourceId);
      if (existing.length===1) return {collection:"activities",type:existing[0].type,record:existing[0]};
      if (existing.length>1 || sourceOnly) return null;
    }
    if (!propertyId || !norm(title)) return null;
    const matches=activityCollections(data).filter(x=>{
      const pid=x.record.propertyId||(data.contracts||[]).find(c=>c.id===x.record.contractId)?.propertyId;
      return pid===propertyId && x.type===type && norm(x.title)===norm(title);
    });
    return matches.length===1 ? matches[0] : null;
  }
  function createActivity(data, report, spec) {
    data.activities = Array.isArray(data.activities) ? data.activities : [];
    var key = norm(spec.sourceId || (spec.propertyId + "|" + spec.type + "|" + spec.title)), id = "ACT|" + hash(key);
    var existing = data.activities.find(function (x) { return x.id === id; });
    if (existing) return { collection: "activities", record: existing, created: false };
    var r = {
      id: id, type: spec.type || "Önskemål", propertyId: spec.contractId ? "" : (spec.propertyId || ""), contractId: spec.contractId || "",
      responsiblePersonId: "", title: spec.title || "", description: spec.description || "",
      category: spec.category || "", status: spec.status || "Planerad", priority: spec.priority || "",
      planningYear: spec.planningYear || "", planningQuarter: spec.planningQuarter || "", planningMonth: spec.planningMonth || "",
      budgetCategory: spec.budgetCategory || (spec.type === "Projekt" ? "Projekt" : spec.type === "Underhåll" ? "Underhåll" : spec.type === "Drift" ? "Driftkostnader" : spec.type === "Utredning" ? "Utredningar" : "Ej budget"),
      includeInBudget: spec.includeInBudget || "Ja", estimatedCost: Number(spec.estimatedCost) || 0,
      phase: spec.phase || (spec.type === "Projekt" ? "Förstudie" : ""), startDate: spec.startDate || "", endDate: spec.endDate || "",
      sourceId: spec.sourceId || id, sourceSheet: spec.sheet || "", sourceRow: spec.row || "",
      budgetAmount2027: Number(spec.budgetAmount2027) || 0, planningMonths: spec.planningMonths || [], provenance: {}
    };
    ["propertyId","contractId","type","title","description","status","category","priority","estimatedCost"].forEach(function (k) {
      if (r[k] !== "" && r[k] != null) addProvenance(r, k, r[k], spec.source, spec.sheet, spec.row);
    });
    data.activities.push(r); report.counts.activitiesCreated++;
    return { collection: "activities", record: r, created: true };
  }
  function enrichActivity(data, report, ref, spec) {
    var r = ref.record, source = spec.source, sheet = spec.sheet, row = spec.row;
    setIfBlank(r, "title", spec.title, source, sheet, row, data, report);
    setIfBlank(r, "description", spec.description, source, sheet, row, data, report);
    setIfBlank(r, "category", spec.category, source, sheet, row, data, report);
    setIfBlank(r, "priority", spec.priority, source, sheet, row, data, report);
    setIfBlank(r, "contractId", spec.contractId, source, sheet, row, data, report);
    if(!r.contractId)setIfBlank(r, "propertyId", spec.propertyId, source, sheet, row, data, report);
    else delete r.propertyId;
    setIfBlank(r, "planningYear", spec.planningYear, source, sheet, row, data, report);
    setIfBlank(r, "estimatedCost", spec.estimatedCost, source, sheet, row, data, report);
    if (spec.type && !r.type) r.type = spec.type;
    if (spec.budgetAmount2027 && !r.budgetAmount2027) r.budgetAmount2027 = spec.budgetAmount2027;
    if (spec.planningMonths && spec.planningMonths.length && !(r.planningMonths || []).length) r.planningMonths = spec.planningMonths.slice();
    report.counts.activitiesUpdated++;
    return ref;
  }
  function monthPlan(row, headers) {
    var names = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"], months = [];
    names.forEach(function (name, i) { var c = findCol(headers, [name]); if (c >= 0 && text(row[c])) months.push(i + 1); });
    var planningMonth = months.length === 1 ? months[0] : "", quarter = "";
    if (!planningMonth && months.length) { var qs = Array.from(new Set(months.map(function (m) { return Math.ceil(m / 3); }))); if (qs.length === 1) quarter = qs[0]; }
    return { months: months, month: planningMonth, quarter: quarter };
  }
  function processLokalbestand(workbook, data, report, matcher, source) {
    var rows = matrix(workbook, "Lokalbestånd"); if (!rows.length) return;
    var hit = findHeader(rows, [["Objektsnummer / Förvaltningsobjekt"],["Adress"],["Fastighetsbeteckning"],["Avtalsnummer"]], 8);
    if (!hit || hit.score < 3) return;
    for (var i = hit.row + 1; i < rows.length; i++) {
      var row = rows[i];
      var spec = { objectNo: cell(row, hit.headers, ["Objektsnummer / Förvaltningsobjekt"]), name: cell(row, hit.headers, ["Benämning"]), address: cell(row, hit.headers, ["Adress"]), city: cell(row, hit.headers, ["Ort","Postort","Stad"]), designation: cell(row, hit.headers, ["Fastighetsbeteckning"]) };
      if (!text(spec.objectNo) && !text(spec.address) && !text(spec.designation)) continue;
      report.counts.sourceRows++;
      var pm = matcher.match(spec);
      if (!pm.property) { review(data, report, { kind: "property-match", source: source, sheet: "Lokalbestånd", row: i + 1, record: clone(spec), address: spec.address, message: "Fastigheten kunde inte matchas säkert." }); continue; }
      report.counts.propertiesMatched++;
      matcher.addAlias(spec.name, pm.property.id); matcher.addAlias(spec.address, pm.property.id); matcher.addAlias(spec.designation, pm.property.id); matcher.addAlias(spec.objectNo, pm.property.id);
      var ownerName=cell(row, hit.headers, ["Fastighetsägare"]), ownerId=ownerName?ensureOrg(data,ownerName,"owner"):"";
      setIfBlank(pm.property, "ownerPartyId", ownerId, source, "Lokalbestånd", i + 1, data, report);
      if(ownerName&&!pm.property.sourceOwner)pm.property.sourceOwner=ownerName;
      setIfBlank(pm.property, "name", spec.name, source, "Lokalbestånd", i + 1, data, report);
      setIfBlank(pm.property, "city", spec.city, source, "Lokalbestånd", i + 1, data, report);
      var contractNo = cell(row, hit.headers, ["Avtalsnummer"]), c = matchContract(data, contractNo, pm.property.id);
      if (c) {
        report.counts.contractsMatched++;
        setIfBlank(c, "area", num(cell(row, hit.headers, ["Lokalyta (kvm)"])), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "category", cell(row, hit.headers, ["Lokalkategori (LEB)"]), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "use", cell(row, hit.headers, ["Verksamhetstyp"]), source, "Lokalbestånd", i + 1, data, report);
        var businessPartyName=text(cell(row, hit.headers, ["Verksamhet"]));
        if(businessPartyName)setIfBlank(c,"businessPartyId",ensureOrg(data,businessPartyName,"business"),source,"Lokalbestånd",i+1,data,report);
        setIfBlank(c, "businessName", cell(row, hit.headers, ["Namn på verksamheten","Benämning"]), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "unitId", unitId(cell(row, hit.headers, ["Verksamhet"])), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "employees", num(cell(row, hit.headers, ["Antal medarbetare (viss+ heltid)"])), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "start", excelDate(cell(row, hit.headers, ["From"])), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "end", excelDate(cell(row, hit.headers, ["Tom"])), source, "Lokalbestånd", i + 1, data, report);
        setIfBlank(c, "contractDocumentUrl", cell(row, hit.headers, ["Länk avtal (Huvudkontrakt)"]), source, "Lokalbestånd", i + 1, data, report);
      }
    }
  }
  function processFastighetslista(workbook, data, report, matcher, source) {
    var rows = matrix(workbook, "Fastighetslista"); if (!rows.length) return;
    var hit = findHeader(rows, [["Benämning"],["Postadress"],["Fastighetsägare"],["Förvaltare"]], 4);
    if (!hit || hit.score < 3) return;
    for (var i = hit.row + 1; i < rows.length; i++) {
      var row = rows[i], spec = { objectNo: cell(row, hit.headers, ["Objekt. nr","Objekt nr"]), name: cell(row, hit.headers, ["Benämning"]), address: cell(row, hit.headers, ["Postadress"]), city: cell(row, hit.headers, ["Ort","Postort","Stad"]), designation: cell(row, hit.headers, ["Fastighetsbeteckning"]) };
      if (!text(spec.name) && !text(spec.address) && !text(spec.designation)) continue;
      report.counts.sourceRows++;
      var pm = matcher.match(spec);
      if (!pm.property) { review(data, report, { kind: "property-match", source: source, sheet: "Fastighetslista", row: i + 1, record: clone(spec), address: spec.address, message: "Fastigheten kunde inte matchas säkert." }); continue; }
      report.counts.propertiesMatched++;
      matcher.addAlias(spec.name, pm.property.id); matcher.addAlias(spec.address, pm.property.id); matcher.addAlias(spec.designation, pm.property.id); matcher.addAlias(spec.objectNo, pm.property.id);
      var owner = cell(row, hit.headers, ["Fastighetsägare"]), ownerId = owner ? ensureOrg(data, owner, "owner") : "";
      setIfBlank(pm.property, "ownerPartyId", ownerId, source, "Fastighetslista", i + 1, data, report);
      if(owner&&!pm.property.sourceOwner)pm.property.sourceOwner=owner;
      setIfBlank(pm.property, "name", spec.name, source, "Fastighetslista", i + 1, data, report);
      setIfBlank(pm.property, "city", spec.city, source, "Fastighetslista", i + 1, data, report);
      setIfBlank(pm.property, "boundaryMaintenance", cell(row, hit.headers, ["Gränsdragningslist underhåll","Gränsdragningslista underhåll"]), source, "Fastighetslista", i + 1, data, report);
      var names = splitNames(cell(row, hit.headers, ["Förvaltare"])), mailList = emails(cell(row, hit.headers, ["Email (förvaltare)","E-post förvaltare"])), phone = text(cell(row, hit.headers, ["Förvaltare nr.","Förvaltare nr"]));
      names.forEach(function (name, idx) {
        var p = ensurePerson(data, report, { name: name, email: mailList[idx] || (names.length === 1 ? mailList[0] : ""), organizationId: ownerId, role: "Fastighetsförvaltare", source: source, sheet: "Fastighetslista", row: i + 1 });
        if (phone && !p.phone) p.phone = phone;
        if(idx===0)setOwnerResponsible(data,report,pm.property,p,{source:source,sheet:"Fastighetslista",row:i+1});
      });
    }
  }
  function processArshjul(workbook, data, report, matcher, source) {
    var rows = matrix(workbook, "Årshjul"); if (!rows.length) return;
    var hit = findHeader(rows, [["Namn på verksamheten"],["Adress"],["Vad ska göras"],["Ansvarig"]], 4);
    if (!hit || hit.score < 3) return;
    for (var i = hit.row + 1; i < rows.length; i++) {
      var row = rows[i], title = text(cell(row, hit.headers, ["Vad ska göras"])); if (!title) continue;
      report.counts.sourceRows++;
      var business = text(cell(row, hit.headers, ["Namn på verksamheten"])), address = text(cell(row, hit.headers, ["Adress"])), pm = matcher.match({ name: business, business: business, address: address });
      var months = monthPlan(row, hit.headers), costType = cell(row, hit.headers, ["Drift eller investering"]), type = classifyActivity({ title: title, costType: costType, comment: cell(row, hit.headers, ["Kommentar"]), extraComment: cell(row, hit.headers, ["Sanelas kommentarer"]) });
      var driftCost = num(cell(row, hit.headers, ["Uppskattat pris drift exkl moms, tkr"])), investCost = num(cell(row, hit.headers, ["Uppskattat pris investering exkl moms, tkr"])), budget = num(cell(row, hit.headers, ["Budget 2027, tkr"]));
      var est = (type === "Drift" ? driftCost : investCost) * 1000; if (!est) est = (driftCost || investCost || budget) * 1000;
      var comment = [cell(row, hit.headers, ["Kommentar"]), cell(row, hit.headers, ["Sanelas kommentarer"])].map(text).filter(Boolean).join(" · ");
      var spec = { source: source, sheet: "Årshjul", row: i + 1, propertyId: pm.property ? pm.property.id : "", contractId: "", type: type, title: title, description: comment, category: text(cell(row, hit.headers, ["Kluster"])), priority: text(cell(row, hit.headers, ["Prio","Prio "])), status: num(cell(row, hit.headers, ["Slutlig faktura"])) ? "Klar" : "Planerad", planningYear: budget ? 2027 : "", planningQuarter: months.quarter, planningMonth: months.month, planningMonths: months.months, estimatedCost: est, budgetAmount2027: budget * 1000, sourceId: "OP|Årshjul|" + hash((pm.property ? pm.property.id : aliasKey(business || address)) + "|" + norm(title)) };
      var found = findActivity(data, spec.propertyId, title, type), ref = found ? enrichActivity(data, report, found, spec) : createActivity(data, report, spec);
      var responsible = splitNames(cell(row, hit.headers, ["Ansvarig"]));
      var arshjulFinal=num(cell(row,hit.headers,["Slutlig faktura"]));
      if(arshjulFinal>0)createOrder(data,report,ref.record,{id:"ORD|Årshjul|"+hash(ref.record.id+"|"+(i+1)),finalCost:arshjulFinal,paymentStatus:"Slutlig faktura",ownerPays:text(cell(row,hit.headers,["Betalas av fastighetsägaren"])),source:source,sheet:"Årshjul",row:i+1});
      if (responsible.length) {
        ref.record.responsibleSourceText = responsible.join(" / ");
        responsible.forEach(function (name, index) {
          var p = ensurePerson(data, report, { name: name, organizationId: ourOrgId(data), unitId: unitId(cell(row, hit.headers, ["Verksamhet"])), role: "", provisional: name.indexOf(" ") < 0, source: source, sheet: "Årshjul", row: i + 1 });
          if (index === 0 && !ref.record.responsiblePersonId) {
            ref.record.responsiblePersonId = p.id;
            addProvenance(ref.record, "responsiblePersonId", p.id, source, "Årshjul", i + 1);
            report.counts.responsibilitiesSet++;
          }
        });
      }
    }
  }
  function processBestallningar(workbook, data, report, matcher, source) {
    var rows=matrix(workbook,"Beställningar"); if(!rows.length)return;
    var hit=findHeader(rows,[["Beställningsdatum"],["Beställt av"],["Produktnamn/beskrivning"],["Verksamhet"]],5); if(!hit||hit.score<3)return;
    var previous=null;
    for(var i=hit.row+1;i<rows.length;i++){
      var row=rows[i],title=text(cell(row,hit.headers,["Produktnamn/beskrivning"]));if(!title)continue;
      var orderedAt=excelDate(cell(row,hit.headers,["Beställningsdatum"])),orderedBy=text(cell(row,hit.headers,["Beställt av"])),business=text(cell(row,hit.headers,["Verksamhet"]));
      if(!orderedAt&&!orderedBy&&!business&&previous){previous.invoiceComment=[previous.invoiceComment,title].filter(Boolean).join(" · ");continue;}
      report.counts.sourceRows++;
      var pm=matcher.match({name:business,business:business,address:business});
      var drift=num(cell(row,hit.headers,["Pris drift & underhåll"])),invest=num(cell(row,hit.headers,["Pris investering"])),type=invest>0?"Projekt":"Drift",cost=invest||drift;
      var done=/klart/i.test(text(cell(row,hit.headers,["Status (Enbart beställt eller klart)","Status"])));
      var rowSourceId="OP|Beställning|"+hash(source+"|"+(i+1)+"|"+norm(title));
      var found=findActivity(data,pm.property?pm.property.id:"",title,type,rowSourceId,true),
        spec={source:source,sheet:"Beställningar",row:i+1,propertyId:pm.property?pm.property.id:"",type:type,title:title,description:text(cell(row,hit.headers,["Kommentarer"])),category:"Beställning",status:done?"Klar":"Beställd",estimatedCost:cost,sourceId:rowSourceId};
      var ref=found?enrichActivity(data,report,found,spec):createActivity(data,report,spec),r=ref.record;
      var order=createOrder(data,report,r,{id:"ORD|Beställning|"+hash(source+"|"+(i+1)+"|"+title),orderedAt:orderedAt,supplier:text(cell(row,hit.headers,["Leverantör"])),orderReference:text(cell(row,hit.headers,["Reqs","Diarienr"])),orderedCost:cost,deliveryText:text(cell(row,hit.headers,["Leveransdatum"])),completedAt:done?excelDate(cell(row,hit.headers,["Leveransdatum"])):"",finalCost:done?cost:0,paymentStatus:/faktura|betald/i.test(text(cell(row,hit.headers,["Kommentarer"])))?"Faktura registrerad":"",invoiceComment:text(cell(row,hit.headers,["Kommentarer"])),source:source,sheet:"Beställningar",row:i+1});
      previous=order;report.counts.ordersMatched++;
      splitNames(orderedBy).forEach(function(name,index){var p=ensurePerson(data,report,{name:name,organizationId:ourOrgId(data),role:"",provisional:name.indexOf(" ")<0,source:source,sheet:"Beställningar",row:i+1});if(index===0&&!order.orderedByPersonId)order.orderedByPersonId=p.id;});
    }
  }
  function detect(workbook) {
    var names = (workbook && workbook.SheetNames) || [];
    return ["Lokalbestånd","Fastighetslista","Årshjul","Beställningar"].some(function (n) { return names.indexOf(n) >= 0; });
  }
  function enrich(workbook, baseData, fileName) {
    if (!detect(workbook)) throw new Error("Filen känns inte igen som en operativ Lokalblick-berikning. Förväntade flikar är Lokalbestånd, Fastighetslista, Årshjul eller Beställningar.");
    var data = clone(baseData || {}), source = fileName || "Operativ berikning";
    ["properties","contracts","organizations","people","orders","activities","sourceRegistry","importReview"].forEach(function (k) { if (!Array.isArray(data[k])) data[k] = []; });
    var report = { profile: "Operativ berikning v3", fileName: source, sheets: [], needsReview: [], counts: { sourceRows: 0, propertiesMatched: 0, contractsMatched: 0, peopleCreated: 0, ownerResponsibilitiesSet: 0, responsibilitiesSet: 0, activitiesCreated: 0, activitiesUpdated: 0, ordersCreated: 0, ordersMatched: 0, needsReview: 0 } };
    var matcher = propertyMatcher(data);
    if (matrix(workbook, "Lokalbestånd").length) { report.sheets.push("Lokalbestånd"); processLokalbestand(workbook, data, report, matcher, source); }
    if (matrix(workbook, "Fastighetslista").length) { report.sheets.push("Fastighetslista"); processFastighetslista(workbook, data, report, matcher, source); }
    if (matrix(workbook, "Årshjul").length) { report.sheets.push("Årshjul"); processArshjul(workbook, data, report, matcher, source); }
    if (matrix(workbook, "Beställningar").length) { report.sheets.push("Beställningar"); processBestallningar(workbook, data, report, matcher, source); }
    report.counts.needsReview = report.needsReview.length;
    data.sourceRegistry = (data.sourceRegistry || []).filter(function (x) { return !(x.kind === "operational-enrichment" && x.name === source); });
    data.sourceRegistry.push({ id: "source:operational:" + hash(source), name: source, kind: "operational-enrichment", importedAt: new Date().toISOString(), rows: report.counts.sourceRows, matched: report.counts.propertiesMatched + report.counts.contractsMatched + report.counts.activitiesUpdated, created: report.counts.activitiesCreated + report.counts.peopleCreated, review: report.counts.needsReview, sheets: report.sheets.join(", ") });
    data.operationalEnrichmentReport = clone(report);
    return { data: data, report: report };
  }
  root.LokalblickOperationalEnrichmentAdapter = { id: "operational-enrichment-v1", label: "Fastigheter, personer & åtgärder", detect: detect, enrich: enrich };
})(globalThis);
