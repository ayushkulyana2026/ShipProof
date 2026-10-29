import "server-only";
import { HttpError } from "./http";

/**
 * Fixed-window limiter kept in instance memory. On serverless it limits per
 * instance (best effort), which is enough to stop casual abuse; put a shared
 * limiter (e.g. Upstash, Vercel WAF rate-limit rules) in front for stronger guarantees.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  check(key: string): void {
    const t = this.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      return;
    }
    entry.count++;
    if (entry.count > this.limit) {
      throw new HttpError(429, "rate_limited", `Too many requests. Try again in ${Math.ceil((entry.resetAt - t) / 1000)} seconds.`);
    }
  }
}
