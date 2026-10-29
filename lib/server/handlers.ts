import "server-only";
import { z } from "zod";
import type { CreateCheckout, VerifyWebhook } from "./dodo";
import { assertSameOrigin, clientIp, errorResponse, HttpError, json, readBody, readJson } from "./http";
import type { RateLimiter } from "./rate-limit";
import type { Store } from "./store";
import { applyDodoEvent, webhookEventSchema } from "./webhook-events";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const leadSchema = z.object({
  email,
  name: optionalText(100),
  company: optionalText(120),
  monthlyOrders: z.enum(["<500", "500-2000", "2000-5000", "5000+"]).optional(),
  planInterest: z.enum(["monthly", "success", "other"]),
  message: optionalText(2000),
  source: optionalText(50),
  /** Honeypot: hidden from people, filled in by naive bots. */
  website: z.string().optional(),
});

export const checkoutSchema = z.object({
  plan: z.literal("monthly"),
  email,
  name: optionalText(100),
});

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const first = r.error.issues[0];
    // Custom messages are user-facing already; generic Zod ones get the field name for context.
    const custom = first?.message && !/^(Invalid|Required|Expected|String must|Number must)/.test(first.message);
    throw new HttpError(400, "invalid_request", !first ? "Invalid request." : custom ? first.message : `${first.path.join(".") || "body"}: ${first.message}`);
  }
  return r.data;
}

function requireStore(store: Store | null): Store {
  if (!store) throw new HttpError(503, "storage_not_configured", "Sign-ups are not open yet. Please check back soon.");
  return store;
}

type Common = { store: Store | null; limiter: RateLimiter; allowedOrigin?: string };

export async function handleLead(req: Request, deps: Common): Promise<Response> {
  try {
    assertSameOrigin(req, deps.allowedOrigin);
    deps.limiter.check(`lead:${clientIp(req)}`);
    const body = parse(leadSchema, await readJson(req));
    if (body.website) return json({ ok: true }, 201); // bot: pretend success, store nothing
    const store = requireStore(deps.store);
    const { website: _honeypot, ...lead } = body;
    const { id } = await store.createLead(lead);
    return json({ ok: true, id }, 201);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function handleCheckout(
  req: Request,
  deps: Common & { createCheckout: CreateCheckout | null; productIds: { monthly?: string }; appUrl?: string },
): Promise<Response> {
  try {
    assertSameOrigin(req, deps.allowedOrigin);
    deps.limiter.check(`checkout:${clientIp(req)}`);
    const body = parse(checkoutSchema, await readJson(req));
    const productId = deps.productIds[body.plan];
    if (!deps.createCheckout || !productId) {
      throw new HttpError(503, "payments_not_configured", "Online payments are not open yet. Leave your email and we'll reach out.");
    }
    const base = (deps.appUrl ?? new URL(req.url).origin).replace(/\/$/, "");
    const session = await deps.createCheckout({
      productId,
      email: body.email,
      name: body.name,
      returnUrl: `${base}/checkout/success`,
      metadata: { plan: body.plan, source: "shipproof-web" },
    });
    // Recording the session is useful but must not block a paying customer.
    if (deps.store) {
      await deps.store.recordCheckout({ sessionId: session.sessionId, email: body.email, plan: body.plan }).catch((e: unknown) => {
        console.error("[shipproof] failed to record checkout session", e);
      });
    }
    return json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function handleDodoWebhook(req: Request, deps: { store: Store | null; verify: VerifyWebhook | null }): Promise<Response> {
  try {
    // Fail closed: without a secret we cannot tell real events from forged ones.
    if (!deps.verify) throw new HttpError(503, "webhooks_not_configured", "Webhook secret is not configured.");
    const raw = await readBody(req, 512 * 1024);
    const verified = deps.verify(raw, req.headers);
    const webhookId = req.headers.get("webhook-id")!;
    const event = webhookEventSchema.safeParse(verified);
    if (!event.success) throw new HttpError(400, "invalid_event", "Unrecognised webhook payload.");
    // 503 makes Dodo retry later instead of losing the event.
    const store = requireStore(deps.store);
    let note = "";
    const outcome = await store.applyWebhookOnce({ webhookId, type: event.data.type, payload: verified }, async (w) => {
      note = await applyDodoEvent(event.data, w);
    });
    if (outcome === "processed") console.info(`[shipproof] webhook ${webhookId} ${event.data.type}: ${note}`);
    return json({ received: true, duplicate: outcome === "duplicate" });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function handleHealth(deps: { store: Store | null; paymentsConfigured: boolean; webhooksConfigured: boolean; environment: string }): Promise<Response> {
  const database = deps.store ? (await deps.store.ping() ? "ok" : "unreachable") : "not_configured";
  const status = database === "unreachable" ? "degraded" : "ok";
  return json(
    {
      status,
      time: new Date().toISOString(),
      services: {
        audit: "client_side",
        database: deps.store ? { kind: deps.store.kind, status: database } : { status: database },
        payments: { configured: deps.paymentsConfigured, environment: deps.environment },
        webhooks: { configured: deps.webhooksConfigured },
      },
    },
    status === "ok" ? 200 : 503,
  );
}
