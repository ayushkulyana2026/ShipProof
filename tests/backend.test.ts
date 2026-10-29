import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import { dodoWebhookVerifier, type CreateCheckout } from "@/lib/server/dodo";
import { readEnv } from "@/lib/server/env";
import { handleCheckout, handleDodoWebhook, handleHealth, handleLead } from "@/lib/server/handlers";
import { RateLimiter } from "@/lib/server/rate-limit";
import { MemoryStore } from "@/lib/server/store";

const ORIGIN = "https://shipproof.example";
const SECRET = "whsec_" + Buffer.from("test-secret-0123456789abcdef").toString("base64");

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": "1.2.3.4", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function signed(event: unknown, id = "msg_" + Math.random().toString(36).slice(2), when = new Date()) {
  const payload = JSON.stringify(event);
  const signature = new Webhook(SECRET).sign(id, when, payload);
  return new Request(`${ORIGIN}/api/webhooks/dodo`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(when.getTime() / 1000)),
      "webhook-signature": signature,
    },
    body: payload,
  });
}

const limiter = () => new RateLimiter(100, 60_000);

describe("env", () => {
  it("defaults to test mode and treats blank values as unset", () => {
    const env = readEnv({ DODO_PAYMENTS_API_KEY: "  ", DATABASE_URL: "" });
    expect(env.dodoEnvironment).toBe("test_mode");
    expect(env.paymentsConfigured).toBe(false);
    expect(env.DATABASE_URL).toBeUndefined();
  });
  it("needs both key and product for payments; live only when explicit", () => {
    const env = readEnv({ DODO_PAYMENTS_API_KEY: "k", DODO_PRODUCT_ID_MONTHLY: "pdt_1", DODO_PAYMENTS_ENVIRONMENT: "live_mode" });
    expect(env.paymentsConfigured).toBe(true);
    expect(env.dodoEnvironment).toBe("live_mode");
  });
  it("rejects malformed values", () => {
    expect(() => readEnv({ DATABASE_URL: "not a url" })).toThrow(/DATABASE_URL/);
    expect(() => readEnv({ DODO_PAYMENTS_ENVIRONMENT: "prod" })).toThrow(/DODO_PAYMENTS_ENVIRONMENT/);
  });
});

describe("POST /api/leads", () => {
  const valid = { email: " Founder@Brand.in ", name: "Asha", company: "Brand", monthlyOrders: "500-2000", planInterest: "success", message: "Hi" };

  it("stores a valid lead (email normalised)", async () => {
    const store = new MemoryStore();
    const res = await handleLead(post("/api/leads", valid), { store, limiter: limiter() });
    expect(res.status).toBe(201);
    expect(store.leads).toHaveLength(1);
    expect(store.leads[0]).toMatchObject({ email: "founder@brand.in", planInterest: "success", monthlyOrders: "500-2000" });
  });
  it("rejects cross-origin and origin-less requests", async () => {
    const store = new MemoryStore();
    expect((await handleLead(post("/api/leads", valid, { origin: "https://evil.example" }), { store, limiter: limiter() })).status).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/leads`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(valid) });
    expect((await handleLead(noOrigin, { store, limiter: limiter() })).status).toBe(403);
    expect(store.leads).toHaveLength(0);
  });
  it("accepts the configured APP_URL origin", async () => {
    const res = await handleLead(post("/api/leads", valid, { origin: "https://shipproof.in" }), { store: new MemoryStore(), limiter: limiter(), allowedOrigin: "https://shipproof.in" });
    expect(res.status).toBe(201);
  });
  it("validates input", async () => {
    const store = new MemoryStore();
    const bad = await handleLead(post("/api/leads", { ...valid, email: "nope" }), { store, limiter: limiter() });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: { message: string } }).error.message).toMatch(/email/i);
    expect((await handleLead(post("/api/leads", { ...valid, planInterest: "free" }), { store, limiter: limiter() })).status).toBe(400);
    expect((await handleLead(post("/api/leads", "{oops"), { store, limiter: limiter() })).status).toBe(400);
    expect((await handleLead(post("/api/leads", valid, { "content-type": "text/plain" }), { store, limiter: limiter() })).status).toBe(415);
    expect((await handleLead(post("/api/leads", { ...valid, message: "x".repeat(20_000) }), { store, limiter: limiter() })).status).toBe(413);
    expect(store.leads).toHaveLength(0);
  });
  it("silently drops honeypot submissions", async () => {
    const store = new MemoryStore();
    const res = await handleLead(post("/api/leads", { ...valid, website: "http://spam" }), { store, limiter: limiter() });
    expect(res.status).toBe(201);
    expect(store.leads).toHaveLength(0);
  });
  it("rate limits per IP", async () => {
    const store = new MemoryStore();
    const l = new RateLimiter(2, 60_000);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await handleLead(post("/api/leads", valid), { store, limiter: l })).status);
    expect(statuses).toEqual([201, 201, 429]);
    expect((await handleLead(post("/api/leads", valid, { "x-real-ip": "9.9.9.9" }), { store, limiter: l })).status).toBe(201);
  });
  it("answers 503 when no database is configured", async () => {
    expect((await handleLead(post("/api/leads", valid), { store: null, limiter: limiter() })).status).toBe(503);
  });
});

describe("POST /api/checkout", () => {
  const fake = (calls: Parameters<CreateCheckout>[0][]): CreateCheckout => async (r) => {
    calls.push(r);
    return { sessionId: "cks_123", checkoutUrl: "https://test.checkout.dodopayments.com/session/cks_123" };
  };

  it("creates a Dodo checkout session and records it", async () => {
    const store = new MemoryStore();
    const calls: Parameters<CreateCheckout>[0][] = [];
    const res = await handleCheckout(post("/api/checkout", { plan: "monthly", email: "A@B.in" }), {
      store,
      limiter: limiter(),
      createCheckout: fake(calls),
      productIds: { monthly: "pdt_monthly" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checkoutUrl: "https://test.checkout.dodopayments.com/session/cks_123", sessionId: "cks_123" });
    expect(calls[0]).toMatchObject({ productId: "pdt_monthly", email: "a@b.in", returnUrl: `${ORIGIN}/checkout/success`, metadata: { plan: "monthly" } });
    expect(store.checkouts).toEqual([{ sessionId: "cks_123", email: "a@b.in", plan: "monthly" }]);
  });
  it("uses APP_URL for the return link when set", async () => {
    const calls: Parameters<CreateCheckout>[0][] = [];
    await handleCheckout(post("/api/checkout", { plan: "monthly", email: "a@b.in" }), {
      store: null,
      limiter: limiter(),
      createCheckout: fake(calls),
      productIds: { monthly: "pdt_monthly" },
      appUrl: "https://shipproof.in/",
    });
    expect(calls[0]!.returnUrl).toBe("https://shipproof.in/checkout/success");
  });
  it("still returns the checkout URL if recording the session fails", async () => {
    const store = new MemoryStore();
    store.recordCheckout = async () => {
      throw new Error("db down");
    };
    const res = await handleCheckout(post("/api/checkout", { plan: "monthly", email: "a@b.in" }), {
      store,
      limiter: limiter(),
      createCheckout: fake([]),
      productIds: { monthly: "pdt_monthly" },
    });
    expect(res.status).toBe(200);
  });
  it("answers 503 when payments are not configured, 400 for unknown plans, 403 cross-origin", async () => {
    const base = { store: new MemoryStore(), limiter: limiter(), productIds: {} };
    expect((await handleCheckout(post("/api/checkout", { plan: "monthly", email: "a@b.in" }), { ...base, createCheckout: null })).status).toBe(503);
    expect((await handleCheckout(post("/api/checkout", { plan: "enterprise", email: "a@b.in" }), { ...base, createCheckout: fake([]) })).status).toBe(400);
    expect((await handleCheckout(post("/api/checkout", { plan: "monthly", email: "a@b.in" }, { origin: "https://evil.example" }), { ...base, createCheckout: fake([]) })).status).toBe(403);
  });
});

describe("POST /api/webhooks/dodo", () => {
  const verify = dodoWebhookVerifier(SECRET);
  const subEvent = (status: string, timestamp: string, type = `subscription.${status}`) => ({
    business_id: "bus_1",
    type,
    timestamp,
    data: {
      payload_type: "Subscription",
      subscription_id: "sub_1",
      status,
      product_id: "pdt_monthly",
      customer: { customer_id: "cus_1", email: "Founder@Brand.in", name: "Asha" },
      next_billing_date: "2026-12-01T00:00:00Z",
      cancel_at_next_billing_date: false,
    },
  });

  it("verifies, applies and records a subscription event", async () => {
    const store = new MemoryStore();
    const res = await handleDodoWebhook(signed(subEvent("active", "2026-11-01T10:00:00Z"), "msg_1"), { store, verify });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, duplicate: false });
    expect(store.subscriptions.get("sub_1")).toMatchObject({ status: "active", email: "founder@brand.in", customerId: "cus_1", productId: "pdt_monthly" });
    expect(store.events.has("msg_1")).toBe(true);
  });
  it("is idempotent for retried deliveries", async () => {
    const store = new MemoryStore();
    const ev = subEvent("active", "2026-11-01T10:00:00Z");
    await handleDodoWebhook(signed(ev, "msg_dup"), { store, verify });
    const again = await handleDodoWebhook(signed(ev, "msg_dup"), { store, verify });
    expect(await again.json()).toEqual({ received: true, duplicate: true });
    expect(store.events.size).toBe(1);
  });
  it("ignores stale out-of-order events", async () => {
    const store = new MemoryStore();
    await handleDodoWebhook(signed(subEvent("cancelled", "2026-11-05T10:00:00Z"), "msg_new"), { store, verify });
    await handleDodoWebhook(signed(subEvent("active", "2026-11-01T10:00:00Z"), "msg_old"), { store, verify });
    expect(store.subscriptions.get("sub_1")!.status).toBe("cancelled");
  });
  it("records payments", async () => {
    const store = new MemoryStore();
    const ev = {
      type: "payment.succeeded",
      timestamp: "2026-11-01T10:00:00Z",
      data: { payload_type: "Payment", payment_id: "pay_1", status: "succeeded", total_amount: 199900, currency: "INR", subscription_id: "sub_1", customer: { customer_id: "cus_1", email: "a@b.in" } },
    };
    await handleDodoWebhook(signed(ev), { store, verify });
    expect(store.payments.get("pay_1")).toMatchObject({ status: "succeeded", totalAmount: 199900, currency: "INR", subscriptionId: "sub_1" });
  });
  it("logs events it doesn't act on", async () => {
    const store = new MemoryStore();
    const res = await handleDodoWebhook(signed({ type: "refund.succeeded", data: { refund_id: "ref_1" } }, "msg_ref"), { store, verify });
    expect(res.status).toBe(200);
    expect(store.events.get("msg_ref")!.type).toBe("refund.succeeded");
  });
  it("rejects bad or tampered signatures", async () => {
    const store = new MemoryStore();
    const req = signed(subEvent("active", "2026-11-01T10:00:00Z"));
    const tampered = new Request(req.url, { method: "POST", headers: req.headers, body: (await req.text()).replace("active", "paused") });
    expect((await handleDodoWebhook(tampered, { store, verify })).status).toBe(401);
    const otherSecret = dodoWebhookVerifier("whsec_" + Buffer.from("another-secret-abcdefghijk").toString("base64"));
    expect((await handleDodoWebhook(signed(subEvent("active", "2026-11-01T10:00:00Z")), { store, verify: otherSecret })).status).toBe(401);
    expect(store.events.size).toBe(0);
  });
  it("rejects replays outside the timestamp tolerance", async () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    expect((await handleDodoWebhook(signed(subEvent("active", old.toISOString()), "msg_old_ts", old), { store: new MemoryStore(), verify })).status).toBe(401);
  });
  it("fails closed without a secret, and asks for a retry without storage", async () => {
    expect((await handleDodoWebhook(signed(subEvent("active", "2026-11-01T10:00:00Z")), { store: new MemoryStore(), verify: null })).status).toBe(503);
    expect((await handleDodoWebhook(signed(subEvent("active", "2026-11-01T10:00:00Z")), { store: null, verify })).status).toBe(503);
  });
  it("does not record the event if applying it fails (so Dodo retries)", async () => {
    const store = new MemoryStore();
    const failing = Object.create(store) as MemoryStore;
    failing.applyWebhookOnce = (e, apply) =>
      store.applyWebhookOnce(e, async () => {
        await apply({ upsertSubscription: async () => Promise.reject(new Error("boom")), upsertPayment: async () => {} });
      });
    const res = await handleDodoWebhook(signed(subEvent("active", "2026-11-01T10:00:00Z"), "msg_fail"), { store: failing, verify });
    expect(res.status).toBe(500);
    expect(store.events.has("msg_fail")).toBe(false);
  });
});

describe("GET /api/health", () => {
  it("reports configuration without secrets", async () => {
    const res = await handleHealth({ store: new MemoryStore(), paymentsConfigured: false, webhooksConfigured: true, environment: "test_mode" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; services: Record<string, unknown> };
    expect(body.status).toBe("ok");
    expect(body.services).toMatchObject({ audit: "client_side", database: { kind: "memory", status: "ok" }, payments: { configured: false }, webhooks: { configured: true } });
    const none = await handleHealth({ store: null, paymentsConfigured: false, webhooksConfigured: false, environment: "test_mode" });
    expect(((await none.json()) as { services: { database: { status: string } } }).services.database.status).toBe("not_configured");
  });
});
