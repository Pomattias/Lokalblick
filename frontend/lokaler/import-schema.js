// Current storage fields projected into import column choices.
// Keep aliases here; matching and row conversion live in import-model.js.
import { tables, idLabels, partyNumberFields } from "./model.js";
import { viewFields, viewCollections } from "./view-fields.js";
import { legacyFinanceFields, legacyFinanceMap } from "./finance-model.js";

const fieldAliases = {
  agreementItems: {
    start: ["Fr.o.m.", "Startdatum", "Gäller från"],
    end: ["T.o.m.", "Slutdatum", "Gäller till"],
    indexPercent: ["Indexprocent", "Indexandel, %"],
    adjustmentMethod: ["Justeringsregel"],
  },
  organizations: { organizationNumber: ["Orgnr", "Org.nr", "Organisationsnr"] },
  properties: {
    designation: [
      "Fastighet",
      "Fastighetsbeteckning",
      "Fast.bet",
      "Fast.nr",
      "Fastighetsnr",
    ],
    popularName: ["Benämning"],
    id: [
      "Fastighets-ID",
      "Förvaltningsobjekt",
      "Objektsnummer / Förvaltningsobjekt",
      "Förvaltningsnummer",
    ],
    address: ["Gatuadress", "Postadress", "Fastighetsadress"],
    city: ["Postort", "Stad"],
    ownerPartyId: [
      "Fastighetsägare PartID",
      "Fastighetsägare namn",
      "Hyresvärd",
      "Lev.namn",
    ],
  },
  objects: {
    id: [
      "Objektnummer",
      "Objektsnummer",
      "Objektnr",
      "Objekt. nr",
      "Objekt nr",
      "Objekt",
      "Objekt-ID",
      "Objekts-ID",
    ],
    area: [
      "Area",
      "Lokalarea",
      "Lokalyta kvm",
      "Lokalyta (kvm)",
      "BRA",
      "kvm",
      "m2",
    ],
    apartmentCount: ["Lägenheter"],
    apartmentArea: ["Lägenheter (yta)"],
  },
  contracts: {
    id: ["Avtalsnummer", "Avtalsnr", "Avtals-ID"],
    start: [
      "Fr.o.m.",
      "Start",
      "Startdatum",
      "Kontraktsstart",
      "Gäller från",
      "Giltigt fr.o.m.",
    ],
    end: [
      "T.o.m.",
      "Slut",
      "Slutdatum",
      "Kontraktsslut",
      "Giltigt t.o.m.",
      "Aktuellt giltigt t.o.m.",
    ],
    business: ["Namn på verksamheten", "Verksamhetsnamn"],
    comment: ["Kommentar verksamhet"],
    category: ["Lokalkategori", "Lokalkategori (LEB)", "Lokalkategori (EB)"],
    notice: ["Säg upp avtal senast", "Sägs upp senast"],
    noticePeriodMonths: ["Uppsägningstid"],
    renewalPeriodMonths: ["Förlängningstid"],
    use: ["Användning"],
    contractDocumentUrl: [
      "Länk avtal (Huvudkontrakt)",
      "Länk till huvudkontrakt",
    ],
  },
  activities: {
    title: ["Ärendenamn", "Aktivitet", "Vad ska göras"],
    priority: ["Prio"],
    notes: ["Kommentar", "Kommentarer"],
    startDate: ["Fr.o.m.", "Startdatum"],
    endDate: ["T.o.m.", "Slutdatum"],
  },
  orders: {
    title: ["Produktnamn/beskrivning"],
    orderedAt: ["Beställningsdatum"],
    deliveryText: ["Leveransdatum"],
    status: ["Status (Enbart beställt eller klart)"],
  },
  people: {
    id: ["Person-ID"],
    email: ["Email", "Epost"],
    phone: ["Telefonnummer"],
  },
};
fieldAliases.activities.objectId = fieldAliases.objects.id;
fieldAliases.activities.propertyId = fieldAliases.properties.id;
export const importSchemas = Object.entries(viewCollections).map(
  ([table, collection]) => {
    const spec = tables[table],
      fields = spec.fields.filter((f) => f.key !== "sources"),
      fieldSpecs = Object.fromEntries(
        fields.map((f) => [
          viewFields[table][f.key] || f.key,
          { ...f, storageKey: f.key },
        ]),
      );
    const schema = {
      key: collection,
      storage: table,
      canonical: true,
      sheet: spec.label,
      singular: spec.singular,
      fieldSpecs: { id: { type: "text", storageKey: "id" }, ...fieldSpecs },
      labelAliases: fieldAliases[collection] || {},
      columns: [
        ["id", idLabels[table]],
        ...fields.map((f) => [
          viewFields[table][f.key] || f.key,
          f.type === "ref" ? idLabels[f.table] : f.label,
        ]),
      ],
      related: [],
      parents: [],
    };
    if (collection === "activities")
      schema.aliases = ["Aktiviteter", "Årshjul"];
    if (collection === "contracts")
      schema.aliases = [
        "Hyresavtal",
        "Lokallista",
        "Lokalbestånd",
        "Lokaldata",
      ];
    if (table === "properties")
      schema.columns = schema.columns.map((c) =>
        c[0] === "ownerPartyId" ? [c[0], "Fastighetsägare"] : c,
      );
    const linked = partyNumberFields[table];
    if (linked) {
      schema.columns.push([linked.key, linked.label]);
      schema.fieldSpecs[linked.key] = {
        type: "text",
        storageTarget: "parties.organization_number",
      };
      schema.labelAliases = {
        ...schema.labelAliases,
        [linked.key]: [
          linked.label,
          "Organisationsnummer " +
            (linked.role === "owner" ? "fastighetsägare" : "hyresgäst"),
          "Orgnr (" +
            (linked.role === "owner" ? "fastighetsägare" : "hyresgäst") +
            ")",
        ],
      };
    }
    if (
      ["properties", "contracts", "activities", "orders"].includes(collection)
    ) {
      const roles =
        collection === "properties"
          ? [
              ["ownerResponsiblePersonId", "Fastighetsägarens kontaktperson"],
              ["responsiblePersonId", "Samordnare"],
            ]
          : collection === "contracts"
            ? [
                ["tenantResponsiblePersonId", "Hyresgästens kontaktperson"],
                ["responsiblePersonId", "Samordnare"],
              ]
            : [["responsiblePersonId", "Vår ansvarige"]];
      schema.columns.push(...roles);
      for (const [key] of roles) schema.fieldSpecs[key] = { type: "text" };
      schema.labelAliases = {
        ...schema.labelAliases,
        responsiblePersonId: [
          "Ansvarig hos oss",
          "Vår kontaktperson",
          "Avtalsansvarig",
          "Vår ansvarige",
          "Ansvarig",
        ],
      };
      if (collection === "properties")
        schema.labelAliases.ownerResponsiblePersonId = [
          "Fastighetsförvaltare",
          "Förvaltare",
          "Fastighetsägarens förvaltare",
        ];
    }
    if (table === "agreements") {
      schema.columns = schema.columns.map((c) =>
        c[0] === "tenantPartyId" ? [c[0], "Hyresgäst"] : c,
      );
      schema.shortcuts = Object.entries(legacyFinanceMap).map(
        ([field, target]) => ({
          target:
            "agreementItems." +
            ({
              annual_rent: "baseAmount",
              annual_additions: "baseAmount",
              annual_property_tax: "baseAmount",
              base_index: "baseIndex",
            }[field] ||
              field
                .replace(/^(rent|addition)_/, "")
                .split("_")
                .map((s, i) => (i ? s[0].toUpperCase() + s.slice(1) : s))
                .join("")),
          itemType:
            field === "annual_property_tax"
              ? "tax"
              : field.startsWith("addition") || field === "annual_additions"
                ? "addition"
                : "base",
          aliases: [
            legacyFinanceFields[field],
            ...(field === "annual_rent"
              ? ["Årshyra", "Hyresbelopp", "Bashyra", "Grundhyra", "Månadshyra"]
              : field === "annual_additions"
                ? ["Tillägg", "Bastillägg", "Tilläggshyra"]
                : field === "annual_property_tax"
                  ? ["F-skatt per år", "F-skatt", "Fastighetsskatt"]
                  : []),
          ],
        }),
      );
      schema.shortcuts.push(
        ...Object.entries(
          tables.agreement_items.fields.find((f) => f.key === "type").values,
        )
          .filter(([type]) => !["base", "addition", "tax"].includes(type))
          .map(([itemType, label]) => ({
            target: "agreementItems.baseAmount",
            itemType,
            aliases: [label],
          })),
      );
    }
    if (table === "agreement_items")
      schema.itemTypes = Object.fromEntries(
        Object.entries(
          tables.agreement_items.fields.find((f) => f.key === "type").values,
        ).map(([value, label]) => [label, value]),
      );
    return schema;
  },
);
for (const schema of importSchemas) {
  const table = tables[schema.storage];
  for (const field of table.fields.filter((f) => f.type === "ref")) {
    const parent = importSchemas.find((s) => s.storage === field.table);
    if (parent) {
      schema.related.push(parent.key);
      schema.parents.push(parent.key);
      parent.related.push(schema.key);
    }
  }
}
