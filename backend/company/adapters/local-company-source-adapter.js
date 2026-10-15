import fs from "node:fs/promises";
import ExcelJS from "exceljs";

const SF_FIELDS = [
  "Förvaltningsobjekt",
  "Avtalsnummer",
  "Kostnadsställe",
  "Gatuadress",
  "Kundtyp avtal",
  "Area",
  "Avtalstyp",
  "Ursprungligt giltigt fr.o.m.",
  "Aktuellt giltigt t.o.m.",
  "Förlängningstid",
  "Uppsägningstid",
  "Uppsagd den",
  "Uppsägningsorsak",
  "Säg upp senast",
  "Lokalkategori",
  "Användning",
  "Fastighetsförvaltare"
];

const EXT_FIELDS = [
  "Förvaltningsobjekt",
  "Avtalsnummer",
  "Fast.bet.",
  "Adress",
  "Lev.namn",
  "Area",
  "Avtalstyp",
  "Ursprungligt giltigt t.o.m.",
  "Aktuellt giltigt t.o.m.",
  "Förlängningstid",
  "Uppsägningstid",
  "Uppsagd den",
  "Uppsägningsorsak",
  "Säg upp senast",
  "Lokalkategori",
  "Användning",
  "Handläggare (id)"
];

function cellValue(cell) {
  const value = cell?.value;
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim() || null;
    if ("result" in value) return value.result ?? null;
    if ("richText" in value) return value.richText.map((part) => part.text).join("").trim() || null;
    return null;
  }
  return typeof value === "string" ? value.trim() || null : value;
}

function headerMap(worksheet, requiredFields) {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 30); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers = new Map();
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      const header = String(cellValue(cell) ?? "").trim();
      if (header) headers.set(header, column);
    });
    if (headers.has("Förvaltningsobjekt") && headers.has("Avtalsnummer")) {
      const missing = requiredFields.filter((field) => !headers.has(field));
      if (missing.length) throw new Error(`Workbook sheet ${worksheet.name} is missing required headers`);
      return { rowNumber, headers };
    }
  }
  throw new Error(`Workbook sheet ${worksheet.name} has no recognized header row`);
}

function readSheet(worksheet, fields) {
  if (!worksheet) throw new Error("Workbook is missing a required worksheet");
  const { rowNumber, headers } = headerMap(worksheet, fields);
  const records = [];
  for (let n = rowNumber + 1; n <= worksheet.rowCount; n += 1) {
    const row = worksheet.getRow(n);
    const record = {};
    for (const field of fields) record[field] = cellValue(row.getCell(headers.get(field)));
    if (record["Förvaltningsobjekt"] == null && record["Avtalsnummer"] == null) continue;
    records.push(record);
  }
  return records;
}

function stableId(record, source) {
  const propertyId = record["Förvaltningsobjekt"];
  const contractNumber = record["Avtalsnummer"];
  if (propertyId == null || contractNumber == null) {
    throw new Error(`${source} row is missing an identity value`);
  }
  return `${source}|${String(propertyId).trim()}|${String(contractNumber).trim()}`;
}

function normalizePropertyId(record) {
  return String(record["Förvaltningsobjekt"]).trim();
}

function normalizeContract(record, source) {
  const ext = source === "EXT";
  const contractId = stableId(record, source);
  const contract = {
    id: contractId,
    contractId,
    propertyId: normalizePropertyId(record),
    number: record["Avtalsnummer"],
    source,
    costCenter: ext ? null : record["Kostnadsställe"],
    propertyDesignation: ext ? record["Fast.bet."] : null,
    address: ext ? record.Adress : record["Gatuadress"],
    customerType: ext ? null : record["Kundtyp avtal"],
    landlord: ext ? record["Lev.namn"] : null,
    area: record.Area,
    contractType: record["Avtalstyp"],
    originalValidFrom: ext ? null : record["Ursprungligt giltigt fr.o.m."],
    originalValidTo: ext ? record["Ursprungligt giltigt t.o.m."] : null,
    currentValidTo: record["Aktuellt giltigt t.o.m."],
    extensionPeriod: record["Förlängningstid"],
    noticePeriod: record["Uppsägningstid"],
    terminatedOn: record["Uppsagd den"],
    terminationReason: record["Uppsägningsorsak"],
    noticeBy: record["Säg upp senast"],
    category: record["Lokalkategori"],
    use: record["Användning"],
    manager: ext ? record["Handläggare (id)"] : record["Fastighetsförvaltare"]
  };
  return contract;
}

export function parseLebWorkbook(workbook) {
  const sfRows = readSheet(workbook.getWorksheet("SF"), SF_FIELDS);
  const extRows = readSheet(workbook.getWorksheet("EXT"), EXT_FIELDS);
  const propertiesById = new Map();
  const contracts = [];

  for (const [source, rows] of [["SF", sfRows], ["EXT", extRows]]) {
    for (const row of rows) {
      const propertyId = normalizePropertyId(row);
      if (!propertiesById.has(propertyId)) {
        propertiesById.set(propertyId, {
          id: propertyId,
          type: source === "SF" ? "Intern" : "Extern",
          designation: source === "EXT" ? row["Fast.bet."] : null,
          address: source === "EXT" ? row.Adress : row["Gatuadress"],
          owner: source === "EXT" ? row["Lev.namn"] : null,
          manager: source === "EXT" ? row["Handläggare (id)"] : row["Fastighetsförvaltare"]
        });
      }
      contracts.push(normalizeContract(row, source));
    }
  }

  return {
    properties: [...propertiesById.values()],
    contracts,
    sourceCounts: { sfRows: sfRows.length, extRows: extRows.length }
  };
}

export async function inspectLebFile(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sf = workbook.getWorksheet("SF");
  const ext = workbook.getWorksheet("EXT");
  if (!sf || !ext) throw new Error("Workbook must contain SF and EXT worksheets");
  const sfRows = readSheet(sf, SF_FIELDS);
  const extRows = readSheet(ext, EXT_FIELDS);
  return { sfRows: sfRows.length, extRows: extRows.length };
}

export class LocalCompanySourceAdapter {
  constructor({ lebPath = process.env.LOKALBLICK_LEB_PATH, coordinatesPath = process.env.LOKALBLICK_COORDINATES_PATH } = {}) {
    this.lebPath = lebPath;
    this.coordinatesPath = coordinatesPath;
  }

  async loadCore() {
    if (!this.lebPath) throw new Error("LOKALBLICK_LEB_PATH is not configured");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(this.lebPath);
    return parseLebWorkbook(workbook);
  }

  async loadCoordinates() {
    if (!this.coordinatesPath) return [];
    try {
      const parsed = JSON.parse(await fs.readFile(this.coordinatesPath, "utf8"));
      const records = Array.isArray(parsed) ? parsed : parsed.coordinates;
      if (!Array.isArray(records)) throw new Error("Coordinates file must contain an array");
      return records.filter((record) =>
        record && typeof record.propertyId === "string" &&
        record.latitude != null && record.latitude !== "" &&
        record.longitude != null && record.longitude !== "" &&
        Number.isFinite(Number(record.latitude)) &&
        Number.isFinite(Number(record.longitude))
      ).map((record) => ({
        id: record.propertyId,
        propertyId: record.propertyId,
        latitude: Number(record.latitude),
        longitude: Number(record.longitude)
      }));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async status(core) {
    if (!this.lebPath) {
      return {
        sourceType: "local-company",
        fileFound: false,
        sfRowCount: 0,
        extRowCount: 0,
        propertyCount: 0,
        contractCount: 0,
        lastModified: null
      };
    }
    let stat;
    try {
      stat = await fs.stat(this.lebPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      return {
        sourceType: "local-company",
        fileFound: false,
        sfRowCount: core?.sourceCounts?.sfRows ?? 0,
        extRowCount: core?.sourceCounts?.extRows ?? 0,
        propertyCount: core?.properties?.length ?? 0,
        contractCount: core?.contracts?.length ?? 0,
        lastModified: null
      };
    }
    return {
      sourceType: "local-company",
      fileFound: true,
      sfRowCount: core?.sourceCounts?.sfRows ?? 0,
      extRowCount: core?.sourceCounts?.extRows ?? 0,
      propertyCount: core?.properties?.length ?? 0,
      contractCount: core?.contracts?.length ?? 0,
      lastModified: stat.mtime.toISOString()
    };
  }
}
