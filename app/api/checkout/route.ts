import { appContext } from "@/lib/server/context";
import { handleCheckout } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = appContext();
  return handleCheckout(req, {
    store: ctx.store,
    limiter: ctx.limiters.checkout,
    allowedOrigin: ctx.allowedOrigin,
    createCheckout: ctx.createCheckout,
    productIds: { monthly: ctx.env.DODO_PRODUCT_ID_MONTHLY },
    appUrl: ctx.env.APP_URL,
  });
}
