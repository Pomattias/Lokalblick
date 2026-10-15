// Endast syntetiska, publika DEMO-exempel. Aldrig verkliga verksamhetsuppgifter eller källdata.
window.LokalblickDemoData = {
  "isDemo": true,
  "sourceName": "Syntetisk demodata – relationstest",
  "currentUser": {
    "name": "Demoanvändare",
    "identitySource": "synthetic"
  },
  "properties": [
    {
      "id": "DEMO-101",
      "type": "Intern",
      "address": "Hamnvägen 12",
      "city": "Malmö",
      "designation": "Hamnen 4",
      "ownerPartyId": "ORG-OWNER-SF",
      "responsiblePersonId": "P1",
      "ownerResponsiblePersonId": "P5",
      "latitude": 55.6098,
      "longitude": 13.0105,
      "sourceId": "FAST-DEMO-101"
    },
    {
      "id": "DEMO-201",
      "type": "Extern",
      "address": "Storgatan 20",
      "city": "Malmö",
      "designation": "Centrum 5",
      "ownerPartyId": "ORG-OWNER-EXT",
      "responsiblePersonId": "P2",
      "ownerResponsiblePersonId": "P4",
      "latitude": 55.6057,
      "longitude": 13.0004,
      "sourceId": "FAST-DEMO-201"
    },
    {
      "id": "DEMO-301",
      "type": "Intern",
      "address": "Västanväg 119",
      "city": "Malmö",
      "designation": "Gräset 2",
      "ownerPartyId": "ORG-OWNER-SF",
      "responsiblePersonId": "P1",
      "ownerResponsiblePersonId": "P5",
      "latitude": 55.5855,
      "longitude": 13.0108,
      "sourceId": "FAST-DEMO-301"
    }
  ],
  "objects": [
    {
      "id": "OBJ-DEMO-101-A",
      "propertyId": "DEMO-101",
      "number": "101-01",
      "name": "Solgläntans särskilda boende",
      "area": 1348,
      "unitId": "VARDBO",
      "category": "Äldreboende",
      "start": "2024-01-01",
      "predecessorIds": []
    },
    {
      "id": "OBJ-DEMO-201-A",
      "propertyId": "DEMO-201",
      "number": "201-01",
      "name": "Hemtjänst och hemsjukvård",
      "area": 500,
      "unitId": "ORDBO",
      "category": "Kontor",
      "start": "2025-01-01",
      "predecessorIds": []
    },
    {
      "id": "OBJ-DEMO-201-B",
      "propertyId": "DEMO-201",
      "number": "201-02",
      "name": "Administrationslokaler",
      "area": 260,
      "unitId": "ORDBO",
      "category": "Kontor",
      "start": "2025-01-01",
      "predecessorIds": []
    },
    {
      "id": "OBJ-DEMO-301-A",
      "propertyId": "DEMO-301",
      "number": "301-01",
      "name": "Daglig verksamhet Västan",
      "area": 1714,
      "unitId": "HOF",
      "category": "Daglig verksamhet",
      "start": "2026-01-01",
      "predecessorIds": []
    }
  ],
  "contracts": [
    {
      "id": "AVT-DEMO-101",
      "number": "101-2024",
      "propertyId": "DEMO-101",
      "objectId": "OBJ-DEMO-101-A",
      "area": 1348,
      "source": "DEMO",
      "tenantName": "Omsorgsförvaltningen (demo)",
      "tenantPartyId": "ORG-TENANT",
      "businessPartyId": "ORG-TENANT",
      "start": "2025-01-01",
      "end": "2028-12-31",
      "noticePeriodMonths": 9,
      "renewalPeriodMonths": 12,
      "baseRent": 2450000,
      "baseAdditions": 0,
      "rentBaseYear": 2025,
      "rentBaseIndex": 419.35,
      "rentIndexPercent": 1,
      "rentSeriesBase": "1980",
      "additionIndexPercent": 0,
      "annualContractDrift": 294000,
      "unitId": "VARDBO",
      "businessName": "Solgläntan",
      "sourceId": "101-2024",
      "businessResponsiblePersonId": "P3",
      "tenantResponsiblePersonId": "P3",
      "responsiblePersonId": "P1",
      "businessLinksManaged": true
    },
    {
      "id": "AVT-DEMO-201",
      "number": "201-2025",
      "propertyId": "DEMO-201",
      "objectId": "OBJ-DEMO-201-A",
      "area": 500,
      "source": "DEMO",
      "tenantName": "Omsorgsförvaltningen (demo)",
      "tenantPartyId": "ORG-TENANT",
      "businessPartyId": "ORG-TENANT",
      "start": "2025-01-01",
      "end": "2029-12-31",
      "noticePeriodMonths": 9,
      "renewalPeriodMonths": 12,
      "baseRent": 950000,
      "baseAdditions": 0,
      "rentBaseYear": 2024,
      "rentBaseIndex": 415.51,
      "rentIndexPercent": 0.8,
      "rentSeriesBase": "1980",
      "additionIndexPercent": 0,
      "annualContractDrift": 114000,
      "unitId": "ORDBO",
      "businessName": "Hemtjänst Centrum / Hemsjukvård Centrum",
      "sourceId": "201-2025",
      "businessResponsiblePersonId": "P6",
      "tenantResponsiblePersonId": "P3",
      "responsiblePersonId": "P2",
      "businessLinksManaged": true
    },
    {
      "id": "AVT-DEMO-202",
      "number": "202-2025",
      "propertyId": "DEMO-201",
      "objectId": "OBJ-DEMO-201-B",
      "area": 260,
      "source": "DEMO",
      "tenantName": "Omsorgsförvaltningen (demo)",
      "tenantPartyId": "ORG-TENANT",
      "businessPartyId": "ORG-TENANT",
      "start": "2025-01-01",
      "end": "2029-12-31",
      "noticePeriodMonths": 9,
      "renewalPeriodMonths": 12,
      "baseRent": 600000,
      "baseAdditions": 0,
      "rentBaseYear": 2025,
      "rentBaseIndex": 419.35,
      "rentIndexPercent": 0.6,
      "rentSeriesBase": "1980",
      "additionIndexPercent": 0,
      "annualContractDrift": 72000,
      "unitId": "ORDBO",
      "businessName": "Hemtjänst Centrum",
      "sourceId": "202-2025",
      "businessResponsiblePersonId": "P6",
      "responsiblePersonId": "P2",
      "tenantResponsiblePersonId": "P6",
      "businessLinksManaged": true
    },
    {
      "id": "AVT-DEMO-301",
      "number": "301-2026",
      "propertyId": "DEMO-301",
      "objectId": "OBJ-DEMO-301-A",
      "area": 1714,
      "source": "DEMO",
      "tenantName": "Omsorgsförvaltningen (demo)",
      "tenantPartyId": "ORG-TENANT",
      "businessPartyId": "ORG-TENANT",
      "start": "2025-01-01",
      "end": "2028-12-31",
      "noticePeriodMonths": 9,
      "renewalPeriodMonths": 12,
      "baseRent": 2650000,
      "baseAdditions": 0,
      "rentBaseYear": 2025,
      "rentBaseIndex": 419.35,
      "rentIndexPercent": 1,
      "rentSeriesBase": "1980",
      "additionIndexPercent": 0,
      "annualContractDrift": 318000,
      "unitId": "HOF",
      "businessName": "Daglig verksamhet Västan",
      "sourceId": "301-2026",
      "businessResponsiblePersonId": "P3",
      "responsiblePersonId": "P1",
      "businessLinksManaged": true
    }
  ],
  "organizations": [
    {
      "id": "ORG-OUR",
      "name": "Lokalförvaltningen (demo)",
      "type": "our"
    },
    {
      "id": "ORG-TENANT",
      "name": "Omsorgsförvaltningen (demo)",
      "type": "tenant"
    },
    {
      "id": "ORG-OWNER-SF",
      "name": "Stadsfastigheter (demo)",
      "type": "owner",
      "ownerClass": "Intern"
    },
    {
      "id": "ORG-OWNER-EXT",
      "name": "Fastighetsbolaget Exempel AB",
      "type": "owner",
      "ownerClass": "Extern"
    }
  ],
  "people": [
    {
      "id": "P1",
      "name": "Anna Lind",
      "organizationId": "ORG-OUR",
      "unitId": "VARDBO",
      "role": "Projektledare"
    },
    {
      "id": "P2",
      "name": "Johan Ek",
      "organizationId": "ORG-OUR",
      "unitId": "ORDBO",
      "role": "Fastighetsansvarig"
    },
    {
      "id": "P3",
      "name": "Eva Nilsson",
      "organizationId": "ORG-TENANT",
      "unitId": "VARDBO",
      "role": "Verksamhetschef"
    },
    {
      "id": "P4",
      "name": "Anders Berg",
      "organizationId": "ORG-OWNER-EXT",
      "role": "Förvaltare"
    },
    {
      "id": "P5",
      "name": "Karin Holm",
      "organizationId": "ORG-OWNER-SF",
      "role": "Förvaltare"
    },
    {
      "id": "P6",
      "name": "Sara Lund",
      "organizationId": "ORG-TENANT",
      "unitId": "ORDBO",
      "role": "Enhetschef"
    }
  ],
  "assignments": [
    {
      "id": "ANS-101-OUR",
      "personId": "P1",
      "targetType": "property",
      "targetId": "DEMO-101",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-101-OWNER",
      "personId": "P5",
      "targetType": "property",
      "targetId": "DEMO-101",
      "roleKey": "owner",
      "role": "Fastighetsägarens kontaktperson",
      "organizationId": "ORG-OWNER-SF",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-201-OUR-OLD",
      "personId": "P1",
      "targetType": "property",
      "targetId": "DEMO-201",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2025-01-01",
      "toDate": "2026-09-30",
      "shared": false
    },
    {
      "id": "ANS-201-OUR",
      "personId": "P2",
      "targetType": "property",
      "targetId": "DEMO-201",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-10-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-201-OWNER",
      "personId": "P4",
      "targetType": "property",
      "targetId": "DEMO-201",
      "roleKey": "owner",
      "role": "Fastighetsägarens kontaktperson",
      "organizationId": "ORG-OWNER-EXT",
      "fromDate": "2025-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-301-OUR",
      "personId": "P1",
      "targetType": "property",
      "targetId": "DEMO-301",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-301-OWNER",
      "personId": "P5",
      "targetType": "property",
      "targetId": "DEMO-301",
      "roleKey": "owner",
      "role": "Fastighetsägarens kontaktperson",
      "organizationId": "ORG-OWNER-SF",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-101-BUS",
      "personId": "P3",
      "targetType": "contract",
      "targetId": "AVT-DEMO-101",
      "roleKey": "business",
      "role": "Verksamhetsansvarig",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-101-TEN",
      "personId": "P3",
      "targetType": "contract",
      "targetId": "AVT-DEMO-101",
      "roleKey": "tenant",
      "role": "Hyresgästens kontaktperson",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-201-BUS",
      "personId": "P6",
      "targetType": "contract",
      "targetId": "AVT-DEMO-201",
      "roleKey": "business",
      "role": "Verksamhetsansvarig",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-201-TEN",
      "personId": "P3",
      "targetType": "contract",
      "targetId": "AVT-DEMO-201",
      "roleKey": "tenant",
      "role": "Hyresgästens kontaktperson",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-202-BUS",
      "personId": "P6",
      "targetType": "contract",
      "targetId": "AVT-DEMO-202",
      "roleKey": "business",
      "role": "Verksamhetsansvarig",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-202-TEN",
      "personId": "P6",
      "targetType": "contract",
      "targetId": "AVT-DEMO-202",
      "roleKey": "tenant",
      "role": "Hyresgästens kontaktperson",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-VENT-OUR",
      "personId": "P1",
      "targetType": "activity",
      "targetId": "ACT-DEMO-VENT",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-09-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-TEMP-OUR",
      "personId": "P2",
      "targetType": "activity",
      "targetId": "ACT-DEMO-TEMP",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-09-15",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-PASS-OUR",
      "personId": "P2",
      "targetType": "activity",
      "targetId": "ACT-DEMO-PASS",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-09-20",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-OBJECT",
      "personId": "P2",
      "targetType": "object",
      "targetId": "OBJ-DEMO-201-A",
      "roleKey": "our",
      "role": "Vår ansvarige",
      "organizationId": "ORG-OUR",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    },
    {
      "id": "ANS-BUS",
      "personId": "P6",
      "targetType": "business",
      "targetId": "BUS-DEMO-HEM",
      "roleKey": "business",
      "role": "Verksamhetsansvarig",
      "organizationId": "ORG-TENANT",
      "fromDate": "2026-01-01",
      "toDate": "",
      "shared": false
    }
  ],
  "businesses": [
    {
      "id": "BUS-DEMO-SOL",
      "sourceId": "V-101",
      "name": "Solgläntans äldreboende",
      "type": "Äldreboende",
      "unitId": "VARDBO",
      "organizationId": "ORG-TENANT",
      "status": "Aktiv",
      "businessResponsiblePersonId": "P3"
    },
    {
      "id": "BUS-DEMO-HEM",
      "sourceId": "V-201",
      "name": "Hemtjänst Centrum",
      "type": "Hemtjänst",
      "unitId": "ORDBO",
      "organizationId": "ORG-TENANT",
      "status": "Aktiv",
      "businessResponsiblePersonId": "P6"
    },
    {
      "id": "BUS-DEMO-HS",
      "sourceId": "V-202",
      "name": "Hemsjukvård Centrum",
      "type": "Hemsjukvård",
      "unitId": "ORDBO",
      "organizationId": "ORG-TENANT",
      "status": "Aktiv",
      "businessResponsiblePersonId": "P3"
    },
    {
      "id": "BUS-DEMO-DAG",
      "sourceId": "V-301",
      "name": "Daglig verksamhet Västan",
      "type": "Daglig verksamhet",
      "unitId": "HOF",
      "organizationId": "ORG-TENANT",
      "status": "Aktiv",
      "businessResponsiblePersonId": "P3"
    }
  ],
  "contractBusinesses": [
    {
      "id": "CB-DEMO-101",
      "contractId": "AVT-DEMO-101",
      "businessId": "BUS-DEMO-SOL",
      "fromDate": "2024-01-01",
      "toDate": "",
      "usedArea": null,
      "costSharePercent": null
    },
    {
      "id": "CB-DEMO-201-A",
      "contractId": "AVT-DEMO-201",
      "businessId": "BUS-DEMO-HEM",
      "fromDate": "2025-01-01",
      "toDate": "",
      "usedArea": 300,
      "costSharePercent": 60
    },
    {
      "id": "CB-DEMO-201-B",
      "contractId": "AVT-DEMO-201",
      "businessId": "BUS-DEMO-HS",
      "fromDate": "2025-01-01",
      "toDate": "",
      "usedArea": 200,
      "costSharePercent": 40
    },
    {
      "id": "CB-DEMO-202",
      "contractId": "AVT-DEMO-202",
      "businessId": "BUS-DEMO-HEM",
      "fromDate": "2025-01-01",
      "toDate": "",
      "usedArea": null,
      "costSharePercent": null
    },
    {
      "id": "CB-DEMO-301",
      "contractId": "AVT-DEMO-301",
      "businessId": "BUS-DEMO-DAG",
      "fromDate": "2026-01-01",
      "toDate": "",
      "usedArea": null,
      "costSharePercent": null
    }
  ],
  "activities": [
    {
      "id": "ACT-DEMO-VENT",
      "title": "Ventilation och inomhusklimat",
      "type": "Projekt",
      "status": "Pågår",
      "priority": "Hög",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Projekt",
      "scopeType": "contract",
      "objectId": "",
      "propertyId": "",
      "contractId": "AVT-DEMO-101",
      "responsiblePersonId": "P1",
      "estimatedCost": 3200000,
      "startDate": "2026-09-01",
      "endDate": "2027-05-31",
      "description": "Modernisering av ventilationssystemet i äldreboendet."
    },
    {
      "id": "ACT-DEMO-TAK",
      "title": "Takbesiktning och åtgärder",
      "type": "Underhåll",
      "status": "Planerad",
      "priority": "Medel",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Underhåll",
      "scopeType": "object",
      "objectId": "OBJ-DEMO-101-A",
      "propertyId": "",
      "contractId": "",
      "responsiblePersonId": "P1",
      "estimatedCost": 450000,
      "startDate": "2027-03-01",
      "endDate": "2027-06-15",
      "category": "Tak"
    },
    {
      "id": "ACT-DEMO-TEMP",
      "title": "Ojämn temperatur plan 3",
      "type": "Drift",
      "status": "Pågår",
      "priority": "Hög",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Driftkostnader",
      "scopeType": "contract",
      "objectId": "",
      "propertyId": "",
      "contractId": "AVT-DEMO-201",
      "responsiblePersonId": "P2",
      "estimatedCost": 120000,
      "startDate": "2026-09-15",
      "endDate": "2026-11-30",
      "description": "Temperaturavvikelser anmälda av hemsjukvård."
    },
    {
      "id": "ACT-DEMO-SIGN",
      "title": "Skyltning och bättre orientering",
      "type": "Önskemål",
      "status": "Inkommen",
      "priority": "Medel",
      "planningYear": 2027,
      "includeInBudget": "Nej",
      "budgetCategory": "Ej budget",
      "scopeType": "object",
      "objectId": "OBJ-DEMO-201-B",
      "propertyId": "",
      "contractId": "",
      "responsiblePersonId": "P2",
      "estimatedCost": 85000,
      "startDate": "2026-10-01",
      "endDate": "2027-02-15"
    },
    {
      "id": "ACT-DEMO-PASS",
      "title": "Byte av passersystem",
      "type": "Underhåll",
      "status": "Beslutat",
      "priority": "Medel",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Underhåll",
      "scopeType": "contract",
      "objectId": "",
      "propertyId": "",
      "contractId": "AVT-DEMO-201",
      "responsiblePersonId": "P2",
      "estimatedCost": 90000,
      "startDate": "2027-04-01",
      "endDate": "2027-05-31",
      "category": "Passage"
    },
    {
      "id": "ACT-DEMO-DAG",
      "title": "Utredning av nya aktivitetsrum",
      "type": "Utredning",
      "status": "Pågår",
      "priority": "Medel",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Utredningar",
      "scopeType": "property",
      "objectId": "",
      "propertyId": "DEMO-301",
      "contractId": "",
      "responsiblePersonId": "P1",
      "estimatedCost": 280000,
      "startDate": "2026-10-01",
      "endDate": "2027-04-30",
      "description": "Utredning av lokalbehov och möjliga planlösningar."
    },
    {
      "id": "ACT-DEMO-AKUST",
      "title": "Akustikanpassning mötesrum",
      "type": "Önskemål",
      "status": "Beslutat",
      "priority": "Medel",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Projekt",
      "scopeType": "contract",
      "objectId": "",
      "propertyId": "",
      "contractId": "AVT-DEMO-101",
      "responsiblePersonId": "P1",
      "estimatedCost": 240000,
      "startDate": "2026-09-10",
      "endDate": "2027-02-01"
    },
    {
      "id": "ACT-DEMO-GEN",
      "title": "Samordnad lokalöversyn",
      "type": "Utredning",
      "status": "Identifierad",
      "priority": "Medel",
      "planningYear": 2027,
      "includeInBudget": "Ja",
      "budgetCategory": "Utredningar",
      "scopeType": "unit",
      "objectId": "",
      "propertyId": "",
      "contractId": "",
      "responsiblePersonId": "P1",
      "estimatedCost": 40000,
      "startDate": "2027-01-01",
      "endDate": "2027-03-31",
      "unitId": "HOF",
      "description": "Områdesgemensam aktivitet utan fastighetskoppling (avsiktligt testfall)."
    }
  ],
  "orders": [
    {
      "id": "ORD-DEMO-VENT",
      "activityId": "ACT-DEMO-VENT",
      "orderedByPersonId": "P1",
      "orderedAt": "2026-10-05",
      "status": "Beställd",
      "supplier": "Teknikentreprenad Demo AB",
      "orderReference": "BEST-2026-101",
      "orderedCost": 700000,
      "completedAt": "",
      "finalCost": 0
    },
    {
      "id": "ORD-DEMO-TEMP",
      "activityId": "ACT-DEMO-TEMP",
      "orderedByPersonId": "P2",
      "orderedAt": "2026-09-28",
      "status": "Pågår",
      "supplier": "Klimatservice Demo AB",
      "orderReference": "BEST-2026-201",
      "orderedCost": 45000,
      "completedAt": "",
      "finalCost": 0
    }
  ],
  "auditLog": [
    {
      "id": "LOG-DEMO-1",
      "at": "2026-09-08T09:10:00+02:00",
      "by": "Anna Lind",
      "collection": "activities",
      "recordId": "ACT-DEMO-VENT",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Startmöte genomfört. Verksamheten vill att arbetet delas upp etappvis."
        }
      ]
    },
    {
      "id": "LOG-DEMO-2",
      "at": "2026-09-24T14:25:00+02:00",
      "by": "Eva Nilsson",
      "collection": "activities",
      "recordId": "ACT-DEMO-VENT",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Önskemål om extra ljuddämpning i samlingsrummen."
        }
      ]
    },
    {
      "id": "LOG-DEMO-3",
      "at": "2026-10-02T11:20:00+02:00",
      "by": "Anna Lind",
      "collection": "activities",
      "recordId": "ACT-DEMO-VENT",
      "action": "Ändrad",
      "fields": [
        {
          "field": "estimatedCost",
          "from": 2800000,
          "to": 3200000
        }
      ]
    },
    {
      "id": "LOG-DEMO-4",
      "at": "2026-10-02T11:25:00+02:00",
      "by": "Anna Lind",
      "collection": "activities",
      "recordId": "ACT-DEMO-VENT",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Ny kostnadsbedömning 3,2 mnkr efter projektering. Berörda informerade."
        }
      ]
    },
    {
      "id": "LOG-DEMO-5",
      "at": "2026-10-08T13:40:00+02:00",
      "by": "Anna Lind",
      "collection": "activities",
      "recordId": "ACT-DEMO-VENT",
      "action": "Ändrad",
      "fields": [
        {
          "field": "endDate",
          "from": "2027-04-30",
          "to": "2027-05-31"
        }
      ]
    },
    {
      "id": "LOG-DEMO-6",
      "at": "2026-10-08T13:45:00+02:00",
      "by": "Anna Lind",
      "collection": "activities",
      "recordId": "ACT-DEMO-VENT",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Tidplan justerad till 31 maj på grund av leveranstid."
        }
      ]
    },
    {
      "id": "LOG-DEMO-7",
      "at": "2026-09-16T10:00:00+02:00",
      "by": "Johan Ek",
      "collection": "activities",
      "recordId": "ACT-DEMO-TEMP",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Felanmälan mottagen från hemsjukvården. Temperaturmätning beställd."
        }
      ]
    },
    {
      "id": "LOG-DEMO-8",
      "at": "2026-09-29T08:20:00+02:00",
      "by": "Johan Ek",
      "collection": "activities",
      "recordId": "ACT-DEMO-TEMP",
      "action": "Ändrad",
      "fields": [
        {
          "field": "estimatedCost",
          "from": 80000,
          "to": 120000
        }
      ]
    },
    {
      "id": "LOG-DEMO-9",
      "at": "2026-09-29T08:30:00+02:00",
      "by": "Johan Ek",
      "collection": "activities",
      "recordId": "ACT-DEMO-TEMP",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Kostnadsbedömning höjd efter inspektion av ventilationsaggregat."
        }
      ]
    },
    {
      "id": "LOG-DEMO-10",
      "at": "2026-10-06T15:05:00+02:00",
      "by": "Anna Lind",
      "collection": "activities",
      "recordId": "ACT-DEMO-DAG",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Behovsworkshop genomförd med verksamhetschef. Två alternativa planlösningar tas fram."
        }
      ]
    },
    {
      "id": "LOG-DEMO-11",
      "at": "2026-10-09T09:00:00+02:00",
      "by": "Johan Ek",
      "collection": "activities",
      "recordId": "ACT-DEMO-PASS",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Beslut om upphandling. Samordna med fastighetsägaren."
        }
      ]
    },
    {
      "id": "LOG-DEMO-12",
      "at": "2026-10-10T11:40:00+02:00",
      "by": "Eva Nilsson",
      "collection": "activities",
      "recordId": "ACT-DEMO-AKUST",
      "action": "Journalanteckning",
      "fields": [
        {
          "field": "comment",
          "from": "",
          "to": "Verksamheten har godkänt förslag till akustikåtgärder."
        }
      ]
    }
  ],
  "recurringCosts": [
    {
      "id": "KOST-DEMO-101",
      "name": "Energi",
      "propertyId": "",
      "contractId": "AVT-DEMO-101",
      "category": "Energi",
      "annualAmount": 640000,
      "startYear": 2027,
      "endYear": null,
      "actuals": []
    }
  ],
  "maintenanceStatus": [
    {
      "id": "MS-DEMO-101",
      "propertyId": "DEMO-101",
      "contractId": "AVT-DEMO-101",
      "category": "Brand / utrymning",
      "assessedDate": "2026-09-15",
      "status": "Bra",
      "priority": "Låg",
      "comment": "Godkänt vid kontroll (demo).",
      "actionNeed": "",
      "estimatedCost": 0
    }
  ],
  "budgetPlans": [
    {
      "year": 2027,
      "status": "Arbetsbudget",
      "createdAt": "2026-10-01",
      "adjustments": {},
      "notes": {
        "Projekt": "Syntetiskt exempel – ingen faktisk budget"
      },
      "lines": []
    }
  ],
  "sourceRegistry": [
    {
      "name": "Inbyggt syntetiskt demoexempel",
      "kind": "demo",
      "rows": 16,
      "matched": 0,
      "created": 16,
      "review": 0,
      "importedAt": "2026-10-13T09:00:00+02:00",
      "sheets": "Fastigheter, Objekt, Avtal, Verksamheter, Aktiviteter"
    }
  ]
};
