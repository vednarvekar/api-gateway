import { redis } from "../db/redis.js"

const CACHE_TTL_SEC = 60  // cache GET responses for 60 seconds

export function buildCacheKey(method: string, url: string): string {
    return `cache:${method}:${url}`
}

export async function getCached(key: string): Promise<string | null> {
    return redis.get(key)
}

export async function setCached(key: string, data: string): Promise<void> {
    await redis.set(key, data, 'EX', CACHE_TTL_SEC)
}