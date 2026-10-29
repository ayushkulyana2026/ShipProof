/**
 * Integration test for the real Postgres store. Runs only when TEST_DATABASE_URL
 * points at a disposable database (all ShipProof tables in it are dropped first):
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/shipproof_test npm test
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresStore } from "@/lib/server/store";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("PostgresStore (integration)", () => {
  let store: PostgresStore;
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {} });
    await sql`drop table if exists leads, checkout_sessions, subscriptions, payments, webhook_events`;
    store = PostgresStore.fromUrl(url!);
  });
  afterAll(async () => {
    await store?.close();
    await sql?.end();
  });

  it("creates the schema on first use and pings", async () => {
    expect(await store.ping()).toBe(true);
    const tables = await sql`select table_name from information_schema.tables where table_schema='public' order by 1`;
    expect(tables.map((t) => t.table_name)).toEqual(expect.arrayContaining(["leads", "checkout_sessions", "subscriptions", "payments", "webhook_events"]));
  });

  it("stores leads and checkout sessions", async () => {
    const { id } = await store.createLead({ email: "a@b.in", planInterest: "success", company: "Brand" });
    expect(Number(id)).toBeGreaterThan(0);
    await store.recordCheckout({ sessionId: "cks_1", email: "a@b.in", plan: "monthly" });
    await store.recordCheckout({ sessionId: "cks_1", email: "a@b.in", plan: "monthly" });
    expect((await sql`select count(*)::int as n from checkout_sessions`)[0]!.n).toBe(1);
  });

  it("applies webhooks once, ignores stale events, and upserts payments", async () => {
    const write = (status: string, eventAt: string) => async (w: { upsertSubscription: (s: never) => Promise<void> }) =>
      w.upsertSubscription({ subscriptionId: "sub_1", status, email: "a@b.in", productId: "pdt_m", eventAt } as never);
    expect(await store.applyWebhookOnce({ webhookId: "m1", type: "subscription.active", payload: { a: 1 } }, write("active", "2026-11-01T00:00:00Z"))).toBe("processed");
    expect(await store.applyWebhookOnce({ webhookId: "m1", type: "subscription.active", payload: { a: 1 } }, write("active", "2026-11-01T00:00:00Z"))).toBe("duplicate");
    await store.applyWebhookOnce({ webhookId: "m2", type: "subscription.cancelled", payload: {} }, write("cancelled", "2026-11-05T00:00:00Z"));
    await store.applyWebhookOnce({ webhookId: "m3", type: "subscription.renewed", payload: {} }, write("active", "2026-11-03T00:00:00Z"));
    const [sub] = await sql`select status, email, product_id from subscriptions where subscription_id = 'sub_1'`;
    expect(sub).toMatchObject({ status: "cancelled", email: "a@b.in", product_id: "pdt_m" });

    await store.applyWebhookOnce({ webhookId: "m4", type: "payment.succeeded", payload: {} }, (w) =>
      w.upsertPayment({ paymentId: "pay_1", status: "succeeded", totalAmount: 199900, currency: "INR" }),
    );
    const [pay] = await sql`select status, total_amount::int as amt, currency from payments where payment_id = 'pay_1'`;
    expect(pay).toEqual({ status: "succeeded", amt: 199900, currency: "INR" });
  });

  it("rolls back the event row when applying it fails, so a retry can succeed", async () => {
    await expect(
      store.applyWebhookOnce({ webhookId: "m_fail", type: "subscription.active", payload: {} }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await sql`select count(*)::int as n from webhook_events where webhook_id = 'm_fail'`)[0]!.n).toBe(0);
    expect(await store.applyWebhookOnce({ webhookId: "m_fail", type: "subscription.active", payload: {} }, async () => {})).toBe("processed");
  });
});
