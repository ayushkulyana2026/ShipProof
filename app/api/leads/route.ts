import { appContext } from "@/lib/server/context";
import { handleLead } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ctx = await appContext();
  return handleLead(req, { store: ctx.store, limiter: ctx.limiters.lead, allowedOrigin: ctx.allowedOrigin });
}
