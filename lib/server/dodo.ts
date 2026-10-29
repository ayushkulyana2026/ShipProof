import "server-only";
import DodoPayments from "dodopayments";
import { Webhook } from "standardwebhooks";
import type { ServerEnv } from "./env";
import { HttpError } from "./http";

export type CheckoutRequest = { productId: string; email: string; name?: string; returnUrl: string; metadata: Record<string, string> };
export type CheckoutResult = { sessionId: string; checkoutUrl: string };
export type CreateCheckout = (req: CheckoutRequest) => Promise<CheckoutResult>;

export function dodoCheckout(env: ServerEnv): CreateCheckout | null {
  if (!env.DODO_PAYMENTS_API_KEY) return null;
  const client = new DodoPayments({ bearerToken: env.DODO_PAYMENTS_API_KEY, environment: env.dodoEnvironment, maxRetries: 2, timeout: 15_000 });
  return async (r) => {
    try {
      const session = await client.checkoutSessions.create({
        product_cart: [{ product_id: r.productId, quantity: 1 }],
        customer: { email: r.email, ...(r.name ? { name: r.name } : {}) },
        return_url: r.returnUrl,
        metadata: r.metadata,
      });
      if (!session.checkout_url) throw new Error("Dodo returned no checkout_url");
      return { sessionId: session.session_id, checkoutUrl: session.checkout_url };
    } catch (e) {
      console.error("[shipproof] Dodo checkout session failed", e instanceof Error ? e.message : e);
      throw new HttpError(502, "payment_provider_error", "Could not start checkout. Please try again in a minute.");
    }
  };
}

export type VerifyWebhook = (rawBody: string, headers: Headers) => unknown;

/** Standard Webhooks verification (HMAC-SHA256 over id.timestamp.body, 5-minute timestamp tolerance). */
export function dodoWebhookVerifier(secret: string): VerifyWebhook {
  const wh = new Webhook(secret);
  return (rawBody, headers) => {
    const h = {
      "webhook-id": headers.get("webhook-id") ?? "",
      "webhook-timestamp": headers.get("webhook-timestamp") ?? "",
      "webhook-signature": headers.get("webhook-signature") ?? "",
    };
    try {
      return wh.verify(rawBody, h);
    } catch {
      throw new HttpError(401, "invalid_signature", "Webhook signature verification failed.");
    }
  };
}
