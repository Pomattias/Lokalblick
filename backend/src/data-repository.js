// Backend repository contract.
// This file is documentation-by-code for the future M365 implementation.
// It is deliberately provider-neutral so SharePoint/Lists can later be
// replaced without changing the frontend API.
export class LokalblickRepository {
  async bootstrap(userContext) { throw new Error("Not implemented"); }

  async list(entity, query, userContext) { throw new Error("Not implemented"); }
  async get(entity, id, userContext) { throw new Error("Not implemented"); }
  async create(entity, payload, userContext) { throw new Error("Not implemented"); }
  async update(entity, id, payload, userContext) { throw new Error("Not implemented"); }

  // Server-side only. Fetches the approved LEB workbook from SharePoint,
  // reads SF + EXT, normalizes Fastighet and Objekt/Avtal and preserves
  // organization-owned complements.
  async refreshLeb(userContext) { throw new Error("Not implemented"); }

  async getAnnualBudget(year, filters, userContext) { throw new Error("Not implemented"); }
}
