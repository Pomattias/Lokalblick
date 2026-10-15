// Backend source-adapter contract.
// Each customer/source integration implements this boundary.
export class LokalblickSourceAdapter {
  constructor(config) {
    this.config = config || {};
  }

  async health(userContext) {
    throw new Error("Not implemented");
  }

  async loadCore(userContext) {
    // Return normalized Lokalblick core data:
    // properties + objects/contracts + organizations where applicable.
    throw new Error("Not implemented");
  }

  async loadComplements(userContext) {
    // Projects, responsibilities, maintenance, drift, wishes, investigations.
    return {};
  }

  async refresh(userContext) {
    // Optional source-specific refresh, e.g. LEB workbook or external API.
    return this.loadCore(userContext);
  }
}
