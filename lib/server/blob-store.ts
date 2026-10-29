import "server-only";
import { randomUUID } from "node:crypto";
import type { EventWriter, LeadInput, PaymentRecord, Store, SubscriptionRecord } from "./store";

/** Minimal JSON document API over an object store (Vercel Blob in production, a Map in tests). */
export interface DocApi {
  get(path: string): Promise<{ data: unknown; etag: string } | null>;
  /** create: fails with DocConflict if the path exists. ifMatch: fails with DocConflict if the etag changed. */
  put(path: string, data: unknown, mode: { create: true } | { ifMatch: string } | { overwrite: true }): Promise<void>;
  ping(): Promise<void>;
}

export class DocConflict extends Error {}

const safe = (s: string) => encodeURIComponent(s).replace(/%/g, "_");

/**
 * Store backed by private JSON documents. Chosen automatically when the project
 * has a Vercel Blob store (BLOB_READ_WRITE_TOKEN) and no DATABASE_URL.
 *
 * Webhook semantics: effects are applied first and the event marker written
 * last, so a crash mid-way lets Dodo's retry re-apply (upserts are idempotent).
 * Subscription updates use etag compare-and-swap with retries.
 */
export class BlobStore implements Store {
  readonly kind = "blob" as const;
  constructor(private readonly docs: DocApi) {}

  async ping() {
    try {
      await this.docs.ping();
      return true;
    } catch {
      return false;
    }
  }

  async createLead(l: LeadInput) {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID().slice(0, 8)}`;
    await this.docs.put(`leads/${id}.json`, { ...l, id, createdAt: new Date().toISOString() }, { create: true });
    return { id };
  }

  async recordCheckout(s: { sessionId: string; email: string; plan: string }) {
    await this.docs.put(`checkouts/${safe(s.sessionId)}.json`, { ...s, createdAt: new Date().toISOString() }, { overwrite: true });
  }

  private async upsert<T extends object>(path: string, merge: (prev: T | null) => T | null): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const cur = await this.docs.get(path);
      const next = merge((cur?.data as T) ?? null);
      if (next === null) return; // nothing to change (e.g. stale event)
      try {
        await this.docs.put(path, next, cur ? { ifMatch: cur.etag } : { create: true });
        return;
      } catch (e) {
        if (!(e instanceof DocConflict)) throw e;
      }
    }
    throw new Error(`Concurrent updates kept conflicting on ${path}`);
  }

  async applyWebhookOnce(event: { webhookId: string; type: string; payload: unknown }, apply: (w: EventWriter) => Promise<void>) {
    const marker = `webhook-events/${safe(event.webhookId)}.json`;
    if (await this.docs.get(marker)) return "duplicate" as const;
    const strip = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
    await apply({
      upsertSubscription: (s: SubscriptionRecord) =>
        this.upsert<SubscriptionRecord & { updatedAt: string }>(`subscriptions/${safe(s.subscriptionId)}.json`, (prev) => {
          if (prev?.eventAt && s.eventAt && Date.parse(s.eventAt) < Date.parse(prev.eventAt)) return null;
          return { ...prev, ...strip(s), cancelAtNextBillingDate: s.cancelAtNextBillingDate ?? false, updatedAt: new Date().toISOString() } as SubscriptionRecord & { updatedAt: string };
        }),
      upsertPayment: (p: PaymentRecord) =>
        this.upsert<PaymentRecord & { updatedAt: string }>(`payments/${safe(p.paymentId)}.json`, (prev) => ({
          ...prev,
          ...strip(p),
          updatedAt: new Date().toISOString(),
        }) as PaymentRecord & { updatedAt: string }),
    });
    try {
      await this.docs.put(marker, { type: event.type, payload: event.payload, receivedAt: new Date().toISOString() }, { create: true });
    } catch (e) {
      if (e instanceof DocConflict) return "duplicate" as const; // a concurrent delivery finished first
      throw e;
    }
    return "processed" as const;
  }
}

/** DocApi over Vercel Blob (private access, uncached reads). */
export async function vercelBlobDocs(token: string): Promise<DocApi> {
  const blob = await import("@vercel/blob");
  const isConflict = (e: unknown) =>
    e instanceof blob.BlobPreconditionFailedError || (e instanceof blob.BlobError && /already exists/i.test(e.message));
  return {
    async get(path) {
      const r = await blob.get(path, { access: "private", useCache: false, token });
      if (!r || r.statusCode !== 200) return null;
      const text = await new Response(r.stream).text();
      return { data: JSON.parse(text) as unknown, etag: r.blob.etag };
    },
    async put(path, data, mode) {
      try {
        await blob.put(path, JSON.stringify(data), {
          access: "private",
          token,
          contentType: "application/json",
          addRandomSuffix: false,
          ...("ifMatch" in mode ? { ifMatch: mode.ifMatch } : "overwrite" in mode ? { allowOverwrite: true } : {}),
        });
      } catch (e) {
        if (isConflict(e)) throw new DocConflict(path);
        throw e;
      }
    },
    async ping() {
      await blob.list({ limit: 1, token });
    },
  };
}
