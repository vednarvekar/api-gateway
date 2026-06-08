import 'dotenv/config'

export const config = {
    port: process.env.PORT || 4001,
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-chnages-in-prod',
    rateLimit: {
        windowMs: 60_000, // 1M
        maxRequests: 100 // limit each IP to 100 requests per windowMs
    }
}