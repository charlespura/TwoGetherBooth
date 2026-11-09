export class RateLimit {
  private buckets = new Map<string, { count: number; until: number }>();
  constructor(
    private limit: number,
    private windowMs: number,
    private now = Date.now,
  ) {}
  take(key: string): boolean {
    const now = this.now();
    let b = this.buckets.get(key);
    if (!b || now >= b.until) {
      if (this.buckets.size >= 10_000) {
        this.sweep();
        if (this.buckets.size >= 10_000) return false;
      }
      b = { count: 0, until: now + this.windowMs };
      this.buckets.set(key, b);
    }
    return ++b.count <= this.limit;
  }
  sweep() {
    const now = this.now();
    for (const [k, b] of this.buckets) if (now >= b.until) this.buckets.delete(k);
  }
}
