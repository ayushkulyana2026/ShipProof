import { NextResponse } from "next/server";
import { dodoClient, productIdFor } from "@/lib/dodo";
import { isPlanId } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** Creates a Dodo Checkout Session for a plan slug and returns its hosted checkout URL. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const plan = (body as { plan?: unknown } | null)?.plan;
  if (!isPlanId(plan)) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const client = dodoClient();
  const productId = productIdFor(plan);
  if (!client || !productId) {
    console.error("Checkout is not configured: set DODO_PAYMENTS_API_KEY and the plan's product id");
    return NextResponse.json({ error: "Checkout isn't set up yet. Please try again later." }, { status: 503 });
  }

  const origin = new URL(request.url).origin;
  try {
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      return_url: process.env.DODO_PAYMENTS_RETURN_URL || `${origin}/checkout/success`,
      cancel_url: `${origin}/pricing`,
      metadata: { plan },
      feature_flags: { allow_discount_code: true },
    });
    if (!session.checkout_url) return NextResponse.json({ error: "Checkout URL was not returned" }, { status: 502 });
    return NextResponse.json({ checkoutUrl: session.checkout_url });
  } catch (error) {
    console.error("Dodo checkout session failed:", error);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }
}
