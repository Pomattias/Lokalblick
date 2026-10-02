// Public demo data only. Never place real company/LEB data in this file.
window.LokalblickDemoData = {
  isDemo: true,
  sourceName: "Demodata",
  properties: [
    { id: "DEMO-101", type: "Intern", address: "Hamnvägen 12", designation: "Hamnen 4", owner: "Stadsfastigheter", manager: "A. Förvaltare" },
    { id: "DEMO-201", type: "Extern", address: "Storgatan 20", designation: "Centrum 5", owner: "Fastighetsbolaget AB", manager: "B. Handläggare" },
    { id: "DEMO-301", type: "Intern", address: "Västanväg 119", designation: "Gräset 2", owner: "Stadsfastigheter", manager: "C. Förvaltare" }
  ],
  contracts: [
    {
      id: "SF|DEMO-101-1", propertyId: "DEMO-101", number: "SF-DEMO-101-1", source: "SF",
      area: 1348, category: "ÄBO Äldreboende", use: "VÅRDBO", start: "2024-01-01", end: "2028-12-31", notice: "2027-12-31",
      annualRent: 2450000, annualContractDrift: 460000, unitId: "VARDBO",
      tenantOrgId: "ORG-TENANT-HVO", ownerOrgId: "ORG-OWNER-SF",
      employees: 46, users: 54, rooms: 58, commonArea: 510, apartmentArea: 620
    },
    {
      id: "EXT|DEMO-201-1", propertyId: "DEMO-201", number: "5307-10030", source: "EXT",
      area: 8224, category: "KP Kontor", use: "ORDBO", start: "2026-01-01", end: "2030-11-30", notice: "2029-11-30",
      annualRent: 11800000, annualContractDrift: 1950000, unitId: "ORDBO",
      tenantOrgId: "ORG-TENANT-HVO", ownerOrgId: "ORG-OWNER-EXT1",
      employees: 410, users: 0, rooms: 0, commonArea: 1700, apartmentArea: 0
    },
    {
      id: "SF|DEMO-301-1", propertyId: "DEMO-301", number: "SF-DEMO-301-1", source: "SF",
      area: 1714, category: "DV Daglig verksamhet", use: "Hälsa & Förebyggande", start: "2026-01-01", end: "2028-12-31", notice: "2027-12-31",
      annualRent: 2650000, annualContractDrift: 390000, unitId: "HOF",
      tenantOrgId: "ORG-TENANT-HVO", ownerOrgId: "ORG-OWNER-SF",
      employees: 34, users: 88, rooms: 0, commonArea: 640, apartmentArea: 0
    }
  ],
  organizations: [
    { id: "ORG-OUR", name: "Vår organisation", type: "our" },
    { id: "ORG-TENANT-HVO", name: "Hyresgästen / verksamheten", type: "tenant" },
    { id: "ORG-OWNER-SF", name: "Stadsfastigheter", type: "owner", ownerClass: "Intern" },
    { id: "ORG-OWNER-EXT1", name: "Fastighetsbolaget AB", type: "owner", ownerClass: "Extern" }
  ],
  people: [
    { id: "P1", name: "Anna Lind", organizationId: "ORG-OUR", unitId: "VARDBO", role: "Projektledare", email: "" },
    { id: "P2", name: "Johan Ek", organizationId: "ORG-OUR", unitId: "ORDBO", role: "Objektansvarig", email: "" },
    { id: "P3", name: "Eva Nilsson", organizationId: "ORG-TENANT-HVO", unitId: "VARDBO", role: "Verksamhetschef", email: "" },
    { id: "P4", name: "Anders Berg", organizationId: "ORG-OWNER-EXT1", unitId: "", role: "Fastighetsförvaltare", email: "" }
  ],
  assignments: [
    { id: "A1", personId: "P1", targetType: "project", targetId: "PR1", role: "Projektledare", allocation: 35 },
    { id: "A2", personId: "P2", targetType: "object", targetId: "EXT|DEMO-201-1", role: "Objektansvarig", allocation: 35 },
    { id: "A3", personId: "P3", targetType: "object", targetId: "SF|DEMO-101-1", role: "Hyresgästkontakt", allocation: 0 },
    { id: "A4", personId: "P4", targetType: "object", targetId: "EXT|DEMO-201-1", role: "Fastighetsägarkontakt", allocation: 0 }
  ],
  projects: [
    {
      id: "PR1", propertyId: "DEMO-101", contractId: "SF|DEMO-101-1", name: "Ventilationsåtgärder",
      description: "Förbättrad ventilation och komfort.", status: "Pågår", phase: "Genomförande",
      start: "2026-09-01", end: "2027-05-31", moveIn: "2027-06-15", budgetYear: 2027,
      budgetInvestigation: 250000, budgetExecution: 3200000, budgetFurnishing: 150000, preliminaryCost: 3800000
    }
  ],
  maintenance: [
    { id: "UH1", propertyId: "DEMO-101", contractId: "SF|DEMO-101-1", title: "Tak", year: 2028, cost: 4500000, priority: "Hög", status: "Planerad" },
    { id: "UH2", propertyId: "DEMO-301", contractId: "SF|DEMO-301-1", title: "Ytskikt", year: 2027, cost: 650000, priority: "Medel", status: "Identifierad" }
  ],
  operations: [
    { id: "D1", propertyId: "DEMO-101", contractId: "SF|DEMO-101-1", period: 2027, category: "Energi", budget: 640000, actual: 0 },
    { id: "D2", propertyId: "DEMO-201", contractId: "EXT|DEMO-201-1", period: 2027, category: "Energi", budget: 450000, actual: 0 }
  ],
  investigations: [
    { id: "U1", propertyId: "DEMO-201", contractId: "EXT|DEMO-201-1", title: "Kapacitetsutredning", year: 2027, cost: 280000, status: "Planerad" }
  ],
  maintenanceStatus: [
    { id:"MS1", contractId:"SF|DEMO-101-1", propertyId:"DEMO-101", category:"Ytskick", assessedDate:"2026-09-15", status:"Åtgärdsbehov", priority:"Medel", comment:"Slitage i gemensamma ytor.", actionNeed:"Målning och mindre lagningar", budgetYear:2027, estimatedCost:180000, includeInBudget:"Ja", responsiblePersonId:"P2" },
    { id:"MS2", contractId:"SF|DEMO-101-1", propertyId:"DEMO-101", category:"Brand / utrymning", assessedDate:"2026-09-15", status:"Bra", priority:"Låg", comment:"Kontrollerat.", actionNeed:"", budgetYear:null, estimatedCost:0, includeInBudget:"Nej", responsiblePersonId:"" },
    { id:"MS3", contractId:"EXT|DEMO-201-1", propertyId:"DEMO-201", category:"Passage", assessedDate:"2026-09-20", status:"Acceptabel", priority:"Medel", comment:"Äldre läsare på plan 2.", actionNeed:"Utred byte", budgetYear:2027, estimatedCost:90000, includeInBudget:"Ja", responsiblePersonId:"P2" }
  ],
  driftIssues: [
    { id:"DI1", contractId:"EXT|DEMO-201-1", propertyId:"DEMO-201", category:"Ventilation", title:"Ojämn temperatur plan 3", description:"Återkommande felanmälningar från verksamheten.", createdDate:"2026-09-25", targetDate:"2026-11-15", decisionDate:"", completedDate:"", status:"Pågår", priority:"Hög", responsiblePersonId:"P2", budgetYear:2027, estimatedCost:120000, finalCost:0, includeInBudget:"Ja" }
  ],
  wishes: [
    { id:"W1", contractId:"SF|DEMO-101-1", propertyId:"DEMO-101", category:"Verksamhetsanpassning", title:"Lugnare mötesrum", description:"Önskemål om bättre akustik och avskärmning.", createdDate:"2026-09-10", targetDate:"2027-02-01", decisionDate:"2026-10-20", completedDate:"", status:"Beslutat", responsiblePersonId:"P1", budgetYear:2027, budgetCategory:"Projekt", estimatedCost:240000, finalCost:0, includeInBudget:"Ja" }
  ]
};
