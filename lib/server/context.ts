import "server-only";
import { dodoCheckout, dodoWebhookVerifier } from "./dodo";
import { serverEnv } from "./env";
import { RateLimiter } from "./rate-limit";
import { getStore } from "./store";

/** Wires real dependencies for the route handlers (one instance per server process). */
export async function appContext() {
  const env = serverEnv();
  return {
    env,
    store: await getStore(env),
    createCheckout: env.paymentsConfigured ? dodoCheckout(env) : null,
    verify: env.DODO_PAYMENTS_WEBHOOK_KEY ? dodoWebhookVerifier(env.DODO_PAYMENTS_WEBHOOK_KEY) : null,
    allowedOrigin: env.APP_URL ? new URL(env.APP_URL).origin : undefined,
    limiters: leadAndCheckoutLimiters,
  };
}

const leadAndCheckoutLimiters = {
  lead: new RateLimiter(5, 60_000),
  checkout: new RateLimiter(10, 60_000),
};
