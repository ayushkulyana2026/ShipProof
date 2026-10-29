/** Small typed client for ShipProof's own API (same origin only). */
export type ApiError = { code: string; message: string; status: number };

export async function postJson<T>(path: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
    if (!res.ok) {
      return { ok: false, error: { status: res.status, code: data.error?.code ?? "http_error", message: data.error?.message ?? `Request failed (${res.status}).` } };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, error: { status: 0, code: "network_error", message: "Network error. Check your connection and try again." } };
  }
}
