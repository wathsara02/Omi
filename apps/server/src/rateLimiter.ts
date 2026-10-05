export interface RateLimit {
  /** The largest burst allowed. */
  readonly capacity: number;
  /** How many requests are earned back each second. */
  readonly refillPerSecond: number;
}

interface Bucket {
  readonly tokens: number;
  readonly updatedAt: number;
}

const MS_PER_SECOND = 1000;

/** A token bucket per key. */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: RateLimit,
    private readonly now: () => number = Date.now,
  ) {}

  /** Spends one token for `key`; false means the request should be refused. */
  allow(key: string): boolean {
    const tokens = this.tokensFor(key);
    if (tokens < 1) return false;
    this.buckets.set(key, { tokens: tokens - 1, updatedAt: this.now() });
    return true;
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }

  /** Drops keys that have refilled completely, so idle keys do not pile up. */
  prune(): void {
    for (const key of [...this.buckets.keys()]) {
      if (this.tokensFor(key) >= this.limit.capacity) this.buckets.delete(key);
    }
  }

  size(): number {
    return this.buckets.size;
  }

  private tokensFor(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.limit.capacity;
    const earned = ((this.now() - bucket.updatedAt) / MS_PER_SECOND) * this.limit.refillPerSecond;
    return Math.min(this.limit.capacity, bucket.tokens + earned);
  }
}
