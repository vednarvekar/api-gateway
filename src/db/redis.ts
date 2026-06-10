import { Redis } from "ioredis";
import { config } from "../utils/config.js";

export const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
})

redis.on('error', (err) => {
    console.error('Redis error:', err.message)
})