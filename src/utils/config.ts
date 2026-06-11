import 'dotenv/config'

export const config = {
    port: (process.env.PORT || 4001) as number,
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-chnages-in-prod',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    rateLimit: {
        windowMs: 60_000, // 1M
        maxRequests: 100 // limit each IP to 100 requests per windowMs
    },
    databaseUrl: process.env.DATABASE_URL
}