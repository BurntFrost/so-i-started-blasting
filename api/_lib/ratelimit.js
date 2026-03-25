import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();
const FREE_TIER_LIMIT = 10; // batch requests per day per IP

/**
 * Check and increment rate limit for an IP.
 * Returns { allowed, remaining, resetsAt }
 */
export async function checkRateLimit(ip) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `ratelimit:${ip}:${today}`;

  // Calculate reset time (midnight UTC)
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const resetsAt = tomorrow.toISOString();

  try {
    const count = await redis.incr(key);

    // Set TTL on first increment (48h buffer past midnight)
    if (count === 1) {
      await redis.expire(key, 60 * 60 * 48);
    }

    const remaining = Math.max(0, FREE_TIER_LIMIT - count);
    return {
      allowed: count <= FREE_TIER_LIMIT,
      remaining,
      resetsAt,
      tier: "free",
    };
  } catch (err) {
    // If Redis is unavailable, allow the request (fail open)
    console.error("Rate limit check failed:", err.message);
    return { allowed: true, remaining: FREE_TIER_LIMIT, resetsAt, tier: "free" };
  }
}
