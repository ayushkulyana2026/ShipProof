import "server-only";

export const MAX_BODY_BYTES = 16 * 1024;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
  console.error("[shipproof] unhandled API error", e);
  return json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, 500);
}

/** Read a request body as text, refusing anything over the limit (also when content-length lies). */
export async function readBody(req: Request, limit = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > limit) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  const text = await req.text();
  if (new TextEncoder().encode(text).length > limit) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  return text;
}

export async function readJson(req: Request): Promise<unknown> {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
  }
  const text = await readBody(req);
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid_json", "Request body is not valid JSON.");
  }
}

/**
 * Browser-facing endpoints only accept same-origin requests. Browsers always
 * send Origin on cross-site POSTs, so this blocks other sites from submitting
 * forms or starting checkouts on a visitor's behalf.
 */
export function assertSameOrigin(req: Request, allowedOrigin?: string): void {
  const origin = req.headers.get("origin");
  if (!origin) throw new HttpError(403, "forbidden_origin", "Missing Origin header.");
  const self = new URL(req.url).origin;
  if (origin !== self && origin !== allowedOrigin) throw new HttpError(403, "forbidden_origin", "Cross-origin requests are not allowed.");
}

export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
