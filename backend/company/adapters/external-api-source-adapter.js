import { LokalblickSourceAdapter } from "./source-adapter.js";

// Skeleton for customer property systems or other external APIs.
export class ExternalApiSourceAdapter extends LokalblickSourceAdapter {
  async health(userContext) {
    return { provider: "external-api", configured: false };
  }

  async loadCore(userContext) {
    throw new Error("External API source adapter is not configured");
  }

  async loadComplements(userContext) {
    return {};
  }
}
