import { LokalblickSourceAdapter } from "./source-adapter.js";

// Skeleton for the company/M365 connector.
// Real Graph/SharePoint credentials belong server-side only.
export class M365SourceAdapter extends LokalblickSourceAdapter {
  async health(userContext) {
    return { provider: "m365", configured: false };
  }

  async loadCore(userContext) {
    throw new Error("M365 source adapter is not configured");
  }

  async loadComplements(userContext) {
    throw new Error("M365 source adapter is not configured");
  }

  async refresh(userContext) {
    throw new Error("M365 source adapter is not configured");
  }
}
