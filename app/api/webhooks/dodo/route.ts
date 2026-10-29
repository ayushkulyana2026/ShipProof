import { NextResponse } from "next/server";
import { dodoClient } from "@/lib/dodo";

export const dynamic = "force-dynamic";

/**
 * Dodo Payments webhook. The signature is verified against the raw body before anything is trusted.
 * This is the only reliable signal that a payment went through (the return URL is just a UI hint).
 */
export async function POST(request: Request) {
  const client = dodoClient();
  if (!client || !process.env.DODO_PAYMENTS_WEBHOOK_KEY) {
    console.error("Webhook received but DODO_PAYMENTS_API_KEY / DODO_PAYMENTS_WEBHOOK_KEY are not set");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const raw = await request.text();
  const headers = {
    "webhook-id": request.headers.get("webhook-id") ?? "",
    "webhook-signature": request.headers.get("webhook-signature") ?? "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") ?? "",
  };

  let event;
  try {
    event = client.webhooks.unwrap(raw, { headers });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  switch (event.type) {
    case "payment.succeeded": {
      const p = event.data;
      // No database yet: log the sale. Grant access / send a receipt here once there's somewhere to store it.
      console.log("Payment succeeded", { paymentId: p.payment_id, customer: p.customer.customer_id, amount: p.total_amount, currency: p.currency, metadata: p.metadata });
      break;
    }
    case "payment.failed":
      console.warn("Payment failed", { paymentId: event.data.payment_id });
      break;
    case "refund.succeeded":
      console.log("Refund succeeded", { paymentId: event.data.payment_id });
      break;
    default:
      break;
  }
  return NextResponse.json({ received: true });
}
