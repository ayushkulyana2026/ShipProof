import { describe, expect, it } from "vitest";
import { Webhook } from "standardwebhooks";
import { BlobStore, DocConflict, type DocApi } from "@/lib/server/blob-store";
import { dodoWebhookVerifier } from "@/lib/server/dodo";
import { handleDodoWebhook, handleLead } from "@/lib/server/handlers";
import { RateLimiter } from "@/lib/server/rate-limit";

/** In-memory DocApi with etags and the same create/ifMatch semantics as Vercel Blob. */
class FakeDocs implements DocApi {
  docs = new Map<string, { data: unknown; etag: number }>();
  private n = 0;
  /** Simulate another writer sneaking in right before our next conditional write. */
  interfereOnce: string | null = null;
  async get(path: string) {
    const d = this.docs.get(path);
    return d ? { data: structuredClone(d.data), etag: String(d.etag) } : null;
  }
  async put(path: string, data: unknown, mode: { create: true } | { ifMatch: string } | { overwrite: true }) {
    if (this.interfereOnce === path) {
      this.interfereOnce = null;
      const cur = this.docs.get(path);
      this.docs.set(path, { data: { ...(cur?.data as object), interfered: true }, etag: ++this.n });
    }
    const cur = this.docs.get(path);
    if ("create" in mode && cur) throw new DocConflict(path);
    if ("ifMatch" in mode && (!cur || String(cur.etag) !== mode.ifMatch)) throw new DocConflict(path);
    this.docs.set(path, { data: structuredClone(data), etag: ++this.n });
  }
  async ping() {}
  under(prefix: string) {
    return [...this.docs.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v.data as Record<string, unknown>);
  }
}

const ORIGIN = "https://shipproof.example";
const SECRET = "whsec_" + Buffer.from("blob-test-secret-0123456789").toString("base64");
const verify = dodoWebhookVerifier(SECRET);
function signed(event: unknown, id: string) {
  const body = JSON.stringify(event);
  const now = new Date();
  return new Request(`${ORIGIN}/api/webhooks/dodo`, {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(Math.floor(now.getTime() / 1000)), "webhook-signature": new Webhook(SECRET).sign(id, now, body) },
    body,
  });
}
const sub = (status: string, timestamp: string) => ({
  type: `subscription.${status}`,
  timestamp,
  data: { subscription_id: "sub_1", status, product_id: "pdt_m", customer: { customer_id: "cus_1", email: "A@B.in" } },
});

describe("BlobStore", () => {
  it("stores leads as separate documents", async () => {
    const docs = new FakeDocs();
    const store = new BlobStore(docs);
    const req = (email: string) =>
      new Request(`${ORIGIN}/api/leads`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email, planInterest: "success" }) });
    expect((await handleLead(req("one@b.in"), { store, limiter: new RateLimiter(10, 60_000) })).status).toBe(201);
    expect((await handleLead(req("two@b.in"), { store, limiter: new RateLimiter(10, 60_000) })).status).toBe(201);
    expect(docs.under("leads/").map((l) => l.email).sort()).toEqual(["one@b.in", "two@b.in"]);
  });

  it("applies webhooks once and ignores stale events", async () => {
    const docs = new FakeDocs();
    const store = new BlobStore(docs);
    expect(await (await handleDodoWebhook(signed(sub("active", "2026-11-01T00:00:00Z"), "m1"), { store, verify })).json()).toEqual({ received: true, duplicate: false });
    expect(await (await handleDodoWebhook(signed(sub("active", "2026-11-01T00:00:00Z"), "m1"), { store, verify })).json()).toEqual({ received: true, duplicate: true });
    await handleDodoWebhook(signed(sub("cancelled", "2026-11-05T00:00:00Z"), "m2"), { store, verify });
    await handleDodoWebhook(signed(sub("active", "2026-11-03T00:00:00Z"), "m3"), { store, verify });
    const [s] = docs.under("subscriptions/");
    expect(s).toMatchObject({ status: "cancelled", email: "a@b.in", productId: "pdt_m" });
    expect(docs.under("webhook-events/")).toHaveLength(3);
  });

  it("retries a subscription update when a concurrent write changed it", async () => {
    const docs = new FakeDocs();
    const store = new BlobStore(docs);
    await handleDodoWebhook(signed(sub("active", "2026-11-01T00:00:00Z"), "a1"), { store, verify });
    docs.interfereOnce = "subscriptions/sub_1.json";
    await handleDodoWebhook(signed(sub("on_hold", "2026-11-02T00:00:00Z"), "a2"), { store, verify });
    expect(docs.under("subscriptions/")[0]).toMatchObject({ status: "on_hold", interfered: true });
  });

  it("does not mark the event done if applying fails, so Dodo's retry re-applies", async () => {
    const docs = new FakeDocs();
    const store = new BlobStore(docs);
    const realPut = docs.put.bind(docs);
    let fail = true;
    docs.put = async (path, data, mode) => {
      if (fail && path.startsWith("subscriptions/")) throw new Error("blob down");
      return realPut(path, data, mode);
    };
    expect((await handleDodoWebhook(signed(sub("active", "2026-11-01T00:00:00Z"), "r1"), { store, verify })).status).toBe(500);
    expect(docs.under("webhook-events/")).toHaveLength(0);
    fail = false;
    expect((await handleDodoWebhook(signed(sub("active", "2026-11-01T00:00:00Z"), "r1"), { store, verify })).status).toBe(200);
    expect(docs.under("subscriptions/")[0]).toMatchObject({ status: "active" });
  });

  it("records payments and checkout sessions", async () => {
    const docs = new FakeDocs();
    const store = new BlobStore(docs);
    await handleDodoWebhook(
      signed({ type: "payment.succeeded", data: { payment_id: "pay_1", status: "succeeded", total_amount: 199900, currency: "INR" } }, "p1"),
      { store, verify },
    );
    await store.recordCheckout({ sessionId: "cks_1", email: "a@b.in", plan: "monthly" });
    await store.recordCheckout({ sessionId: "cks_1", email: "a@b.in", plan: "monthly" });
    expect(docs.under("payments/")[0]).toMatchObject({ status: "succeeded", totalAmount: 199900 });
    expect(docs.under("checkouts/")).toHaveLength(1);
  });
});
