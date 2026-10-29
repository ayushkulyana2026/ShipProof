import DodoPayments from "dodopayments";
import type { PlanId } from "./plans";

/** Anything other than an explicit "live_mode" stays in test mode, so a typo never charges real cards. */
export const dodoEnvironment = process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode";

/** Plan slug (sent by the browser) → Dodo product id (server-only allowlist). */
const PRODUCT_ENV: Record<PlanId, string> = {
  pro: "DODO_PRODUCT_ID_PRO",
};

export function productIdFor(plan: PlanId): string | undefined {
  return process.env[PRODUCT_ENV[plan]] || undefined;
}

let client: DodoPayments | null = null;

/** Returns null when the API key isn't configured, so routes can answer with a clear error. */
export function dodoClient(): DodoPayments | null {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY;
  if (!bearerToken) return null;
  client ??= new DodoPayments({ bearerToken, environment: dodoEnvironment, webhookKey: process.env.DODO_PAYMENTS_WEBHOOK_KEY ?? null });
  return client;
}
