/**
 * In-memory sliding-window rate limiter. Sufficient for a single-process
 * deployment (this V1's target); a horizontally-scaled deployment should
 * swap this for a shared store (e.g. Redis) — see README.md "Known
 * Limitations". Used to protect public write endpoints (lead submission,
 * auth) from abuse without adding an external dependency.
 */
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= maxRequests) {
    buckets.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  buckets.set(key, timestamps);
  return true;
}
