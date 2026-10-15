// Backend repository contract.
// Provider-neutral boundary between Lokalblick API and customer data sources.
export class LokalblickRepository {
  constructor(sourceAdapter) {
    this.sourceAdapter = sourceAdapter;
  }

  async bootstrap(userContext) {
    if (!this.sourceAdapter) throw new Error("No source adapter configured");
    const core = await this.sourceAdapter.loadCore(userContext);
    const complements = await this.sourceAdapter.loadComplements(userContext);
    return Object.assign({}, core, complements);
  }

  async list(entity, query, userContext) { throw new Error("Not implemented"); }
  async get(entity, id, userContext) { throw new Error("Not implemented"); }
  async create(entity, payload, userContext) { throw new Error("Not implemented"); }
  async update(entity, id, payload, userContext) { throw new Error("Not implemented"); }

  async refreshSource(userContext) {
    if (!this.sourceAdapter) throw new Error("No source adapter configured");
    return this.sourceAdapter.refresh(userContext);
  }

  async getAnnualBudget(year, filters, userContext) { throw new Error("Not implemented"); }
}
