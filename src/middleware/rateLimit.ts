import { redis } from "../db/redis.js"

export async function checkRateLimit(
    key: string,
    maxRequests: number,
    windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {

    const windowSec = Math.ceil(windowMs / 1000)
    const now = Date.now()
    const resetAt = now + windowMs

    // INCR atomically increments — if key doesn't exist Redis creates it at 0 first
    const count = await redis.incr(key)

    // Only set expiry on first request in window
    if (count === 1) {
        await redis.expire(key, windowSec)
    }

    // Get actual TTL to return accurate resetAt
    const ttl = await redis.ttl(key)
    const actualResetAt = now + (ttl * 1000)

    if (count > maxRequests) {
        return { allowed: false, remaining: 0, resetAt: actualResetAt }
    }

    return {
        allowed: true,
        remaining: maxRequests - count,
        resetAt: actualResetAt
    }
}