import "server-only";
import postgres from "postgres";
import { SCHEMA_SQL } from "./schema";

export type LeadInput = {
  email: string;
  name?: string;
  company?: string;
  monthlyOrders?: string;
  planInterest: string;
  message?: string;
  source?: string;
};

export type SubscriptionRecord = {
  subscriptionId: string;
  customerId?: string;
  email?: string;
  productId?: string;
  status: string;
  nextBillingDate?: string;
  cancelAtNextBillingDate?: boolean;
  /** Timestamp of the webhook event; older events never overwrite newer state. */
  eventAt?: string;
};

export type PaymentRecord = {
  paymentId: string;
  subscriptionId?: string;
  customerId?: string;
  email?: string;
  status?: string;
  totalAmount?: number;
  currency?: string;
};

/** Writes allowed while applying one webhook event (inside its transaction). */
export interface EventWriter {
  upsertSubscription(s: SubscriptionRecord): Promise<void>;
  upsertPayment(p: PaymentRecord): Promise<void>;
}

export interface Store {
  readonly kind: "postgres" | "memory";
  ping(): Promise<boolean>;
  createLead(lead: LeadInput): Promise<{ id: string }>;
  recordCheckout(s: { sessionId: string; email: string; plan: string }): Promise<void>;
  /**
   * Apply a webhook exactly once per delivery id. The event row and its effects
   * commit together, so a crash mid-way lets Dodo's retry process it again.
   */
  applyWebhookOnce(event: { webhookId: string; type: string; payload: unknown }, apply: (w: EventWriter) => Promise<void>): Promise<"processed" | "duplicate">;
}

// ---------- Postgres ----------

export class PostgresStore implements Store {
  readonly kind = "postgres" as const;
  private ready: Promise<void> | null = null;
  // max 1 connection per serverless instance; prepare:false works with pgbouncer/Neon poolers.
  constructor(private readonly sql: postgres.Sql) {}

  static fromUrl(url: string): PostgresStore {
    return new PostgresStore(postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} }));
  }

  close(): Promise<void> {
    return this.sql.end();
  }

  private ensureSchema(): Promise<void> {
    this.ready ??= this.sql.unsafe(SCHEMA_SQL).then(
      () => undefined,
      (e: unknown) => {
        this.ready = null; // retry on the next request
        throw e;
      },
    );
    return this.ready;
  }

  async ping() {
    try {
      await this.ensureSchema();
      await this.sql`select 1`;
      return true;
    } catch {
      return false;
    }
  }

  async createLead(l: LeadInput) {
    await this.ensureSchema();
    const [row] = await this.sql<{ id: string }[]>`
      insert into leads (email, name, company, monthly_orders, plan_interest, message, source)
      values (${l.email}, ${l.name ?? null}, ${l.company ?? null}, ${l.monthlyOrders ?? null}, ${l.planInterest}, ${l.message ?? null}, ${l.source ?? null})
      returning id::text as id`;
    return { id: row!.id };
  }

  async recordCheckout(s: { sessionId: string; email: string; plan: string }) {
    await this.ensureSchema();
    await this.sql`
      insert into checkout_sessions (session_id, email, plan) values (${s.sessionId}, ${s.email}, ${s.plan})
      on conflict (session_id) do nothing`;
  }

  async applyWebhookOnce(event: { webhookId: string; type: string; payload: unknown }, apply: (w: EventWriter) => Promise<void>) {
    await this.ensureSchema();
    let outcome: "processed" | "duplicate" = "duplicate";
    await this.sql.begin(async (tx) => {
      const inserted = await tx`
        insert into webhook_events (webhook_id, type, payload)
        values (${event.webhookId}, ${event.type}, ${tx.json(event.payload as postgres.JSONValue)})
        on conflict (webhook_id) do nothing
        returning webhook_id`;
      if (inserted.length === 0) return;
      outcome = "processed";
      await apply({
        async upsertSubscription(s) {
          await tx`
            insert into subscriptions (subscription_id, customer_id, email, product_id, status, next_billing_date, cancel_at_next_billing_date, last_event_at)
            values (${s.subscriptionId}, ${s.customerId ?? null}, ${s.email ?? null}, ${s.productId ?? null}, ${s.status}, ${s.nextBillingDate ?? null}, ${s.cancelAtNextBillingDate ?? false}, ${s.eventAt ?? null})
            on conflict (subscription_id) do update set
              customer_id = coalesce(excluded.customer_id, subscriptions.customer_id),
              email = coalesce(excluded.email, subscriptions.email),
              product_id = coalesce(excluded.product_id, subscriptions.product_id),
              status = excluded.status,
              next_billing_date = coalesce(excluded.next_billing_date, subscriptions.next_billing_date),
              cancel_at_next_billing_date = excluded.cancel_at_next_billing_date,
              last_event_at = coalesce(excluded.last_event_at, subscriptions.last_event_at),
              updated_at = now()
            where subscriptions.last_event_at is null
               or excluded.last_event_at is null
               or excluded.last_event_at >= subscriptions.last_event_at`;
        },
        async upsertPayment(p) {
          await tx`
            insert into payments (payment_id, subscription_id, customer_id, email, status, total_amount, currency)
            values (${p.paymentId}, ${p.subscriptionId ?? null}, ${p.customerId ?? null}, ${p.email ?? null}, ${p.status ?? null}, ${p.totalAmount ?? null}, ${p.currency ?? null})
            on conflict (payment_id) do update set
              status = coalesce(excluded.status, payments.status),
              subscription_id = coalesce(excluded.subscription_id, payments.subscription_id),
              updated_at = now()`;
        },
      });
    });
    return outcome;
  }
}

// ---------- In-memory (local development and tests only) ----------

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  leads: (LeadInput & { id: string; createdAt: string })[] = [];
  checkouts: { sessionId: string; email: string; plan: string }[] = [];
  subscriptions = new Map<string, SubscriptionRecord>();
  payments = new Map<string, PaymentRecord>();
  events = new Map<string, { type: string; payload: unknown }>();

  async ping() {
    return true;
  }
  async createLead(l: LeadInput) {
    const id = String(this.leads.length + 1);
    this.leads.push({ ...l, id, createdAt: new Date().toISOString() });
    return { id };
  }
  async recordCheckout(s: { sessionId: string; email: string; plan: string }) {
    if (!this.checkouts.some((c) => c.sessionId === s.sessionId)) this.checkouts.push(s);
  }
  async applyWebhookOnce(event: { webhookId: string; type: string; payload: unknown }, apply: (w: EventWriter) => Promise<void>) {
    if (this.events.has(event.webhookId)) return "duplicate" as const;
    // Stage writes so a failure leaves nothing behind (mirrors the Postgres transaction).
    const subs = new Map(this.subscriptions);
    const pays = new Map(this.payments);
    await apply({
      async upsertSubscription(s) {
        const prev = subs.get(s.subscriptionId);
        if (prev?.eventAt && s.eventAt && Date.parse(s.eventAt) < Date.parse(prev.eventAt)) return; // stale, out-of-order delivery
        subs.set(s.subscriptionId, {
          ...prev,
          ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)),
          cancelAtNextBillingDate: s.cancelAtNextBillingDate ?? false,
        } as SubscriptionRecord);
      },
      async upsertPayment(p) {
        const prev = pays.get(p.paymentId);
        pays.set(p.paymentId, { ...prev, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) } as PaymentRecord);
      },
    });
    this.subscriptions = subs;
    this.payments = pays;
    this.events.set(event.webhookId, { type: event.type, payload: event.payload });
    return "processed" as const;
  }
}

let store: Store | null | undefined;

/**
 * Postgres when DATABASE_URL is set. Without it, an in-memory store in
 * development only; in production there is no store (endpoints answer 503),
 * because serverless memory would silently lose data.
 */
export function getStore(env: { DATABASE_URL?: string }): Store | null {
  if (store !== undefined) return store;
  if (env.DATABASE_URL) {
    store = PostgresStore.fromUrl(env.DATABASE_URL);
  } else if (process.env.NODE_ENV !== "production") {
    console.warn("[shipproof] DATABASE_URL not set: using an in-memory store (development only, data is lost on restart).");
    store = new MemoryStore();
  } else {
    store = null;
  }
  return store;
}
