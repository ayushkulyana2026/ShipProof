import { appContext } from "@/lib/server/context";
import { handleDodoWebhook } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dodo Payments webhook endpoint. Configure in Dodo: Developer → Webhooks → https://<your-domain>/api/webhooks/dodo */
export async function POST(req: Request) {
  const ctx = appContext();
  return handleDodoWebhook(req, { store: ctx.store, verify: ctx.verify });
}
