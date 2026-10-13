import { ApiError } from "./errors";

// Fixed-window limiter kept in memory -- enough to slow down password guessing
// on a single-server deployment (a shared store such as Redis would be needed
// behind a load balancer).
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

/** Keep memory bounded: drop expired windows, and everything if still too many keys. */
function sweep(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_BUCKETS) buckets.clear();
}

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (bucket.count >= limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, `Too many attempts. Try again in ${seconds}s.`);
  }
  bucket.count += 1;
}

/**
 * Client IP for per-address limits. X-Forwarded-For is written by the client
 * unless a reverse proxy overwrites it, so it is only trusted when
 * TRUST_PROXY=true; otherwise null (callers then limit per account instead).
 */
export function clientIp(request: Request): string | null {
  if (process.env.TRUST_PROXY !== "true") return null;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}
