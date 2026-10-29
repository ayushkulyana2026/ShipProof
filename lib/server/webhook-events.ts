import "server-only";
import { z } from "zod";
import type { EventWriter } from "./store";

const customer = z.object({ customer_id: z.string().optional(), email: z.string().optional() }).partial().passthrough();

export const webhookEventSchema = z
  .object({
    type: z.string().min(1),
    timestamp: z.string().optional(),
    data: z.record(z.unknown()).default({}),
  })
  .passthrough();

const subscriptionData = z
  .object({
    subscription_id: z.string().min(1),
    status: z.string().optional(),
    product_id: z.string().optional(),
    customer: customer.optional(),
    next_billing_date: z.string().nullable().optional(),
    cancel_at_next_billing_date: z.boolean().optional(),
  })
  .passthrough();

const paymentData = z
  .object({
    payment_id: z.string().min(1),
    status: z.string().nullable().optional(),
    subscription_id: z.string().nullable().optional(),
    total_amount: z.number().optional(),
    currency: z.string().optional(),
    customer: customer.optional(),
  })
  .passthrough();

/** Status implied by the event name when the payload omits it. */
const STATUS_FROM_TYPE: Record<string, string> = {
  "subscription.active": "active",
  "subscription.renewed": "active",
  "subscription.on_hold": "on_hold",
  "subscription.paused": "paused",
  "subscription.unpaused": "active",
  "subscription.cancelled": "cancelled",
  "subscription.failed": "failed",
  "subscription.expired": "expired",
  "subscription.past_due": "past_due",
};

/**
 * Sync our records from a verified Dodo event. Subscription and payment events
 * update their tables; everything else (refunds, disputes, …) is kept in the
 * webhook_events log only. Unknown shapes are logged, never fatal, so Dodo
 * doesn't retry an event we simply don't use.
 */
export async function applyDodoEvent(event: z.infer<typeof webhookEventSchema>, w: EventWriter): Promise<string> {
  if (event.type.startsWith("subscription.")) {
    const d = subscriptionData.safeParse(event.data);
    if (!d.success) return "ignored: subscription payload without subscription_id";
    const status = d.data.status ?? STATUS_FROM_TYPE[event.type];
    if (!status) return `ignored: no status for ${event.type}`;
    await w.upsertSubscription({
      subscriptionId: d.data.subscription_id,
      customerId: d.data.customer?.customer_id,
      email: d.data.customer?.email?.toLowerCase(),
      productId: d.data.product_id,
      status,
      nextBillingDate: d.data.next_billing_date ?? undefined,
      cancelAtNextBillingDate: d.data.cancel_at_next_billing_date,
      eventAt: event.timestamp,
    });
    return `subscription ${d.data.subscription_id} → ${status}`;
  }
  if (event.type.startsWith("payment.")) {
    const d = paymentData.safeParse(event.data);
    if (!d.success) return "ignored: payment payload without payment_id";
    await w.upsertPayment({
      paymentId: d.data.payment_id,
      subscriptionId: d.data.subscription_id ?? undefined,
      customerId: d.data.customer?.customer_id,
      email: d.data.customer?.email?.toLowerCase(),
      status: d.data.status ?? event.type.slice("payment.".length),
      totalAmount: d.data.total_amount,
      currency: d.data.currency,
    });
    return `payment ${d.data.payment_id} recorded`;
  }
  return `logged: ${event.type}`;
}
