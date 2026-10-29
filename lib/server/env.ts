import "server-only";
import { z } from "zod";

/**
 * Server configuration, read once from the environment. Every integration is
 * optional so the static audit keeps working with no configuration at all;
 * endpoints that need a missing integration answer 503 instead of crashing.
 */
const schema = z.object({
  DATABASE_URL: z.string().url().optional(),
  /** Set by Vercel when a Blob store is connected to the project. */
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  DODO_PAYMENTS_API_KEY: z.string().min(1).optional(),
  DODO_PAYMENTS_WEBHOOK_KEY: z.string().min(1).optional(),
  DODO_PAYMENTS_ENVIRONMENT: z.enum(["test_mode", "live_mode"]).optional(),
  DODO_PRODUCT_ID_MONTHLY: z.string().min(1).optional(),
  /** Public site URL used for checkout return links; defaults to the request's origin. */
  APP_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof schema> & {
  /** Never "live_mode" unless explicitly set, so a missing variable can't charge real cards. */
  dodoEnvironment: "test_mode" | "live_mode";
  paymentsConfigured: boolean;
  webhooksConfigured: boolean;
};

let cached: ServerEnv | null = null;

export function readEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  // Treat empty strings (common in dashboards) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).map(([k, v]) => [k, v?.trim() ? v.trim() : undefined]));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${fields}`);
  }
  const env = parsed.data;
  return {
    ...env,
    dodoEnvironment: env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
    paymentsConfigured: Boolean(env.DODO_PAYMENTS_API_KEY && env.DODO_PRODUCT_ID_MONTHLY),
    webhooksConfigured: Boolean(env.DODO_PAYMENTS_WEBHOOK_KEY),
  };
}

export function serverEnv(): ServerEnv {
  cached ??= readEnv();
  return cached;
}
