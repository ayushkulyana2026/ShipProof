import { appContext } from "@/lib/server/context";
import { handleHealth } from "@/lib/server/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = appContext();
  return handleHealth({
    store: ctx.store,
    paymentsConfigured: ctx.env.paymentsConfigured,
    webhooksConfigured: ctx.env.webhooksConfigured,
    environment: ctx.env.dodoEnvironment,
  });
}
