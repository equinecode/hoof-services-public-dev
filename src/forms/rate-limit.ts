export type RateLimitRule = { limit: number; windowMs: number };

/**
 * Fixed-window counter, in memory. Per-instance only, so it is a backstop for
 * the gateway's throttling, not a replacement for it.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Returns 0 when allowed, else seconds until the window resets. */
  check(key: string, rule: RateLimitRule): number {
    const t = this.now();
    if (this.hits.size > 10_000) this.sweep(t);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + rule.windowMs });
      return 0;
    }
    if (entry.count >= rule.limit) return Math.ceil((entry.resetAt - t) / 1000);
    entry.count += 1;
    return 0;
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
