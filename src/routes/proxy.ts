import { type FastifyInstance } from "fastify";
import { request } from "node:http";
import { request as httpRequest} from "undici";
import { matchRoutes } from "../utils/router.js";
import { config } from "../utils/config.js";
import { checkRateLimit } from "../middleware/rateLimit.js";
import { verifyAuth } from "../middleware/auth.js";
import { logError, logRequest } from "../middleware/logger.js";
import { checkRole } from "../middleware/rbac.js";

export async function proxyRoute(fastify: FastifyInstance) {

    fastify.all("/*", async (request, reply) => {
        const urlObj = new URL(request.url, `http://${request.headers.host}`)
        const route = matchRoutes(urlObj.pathname)

        if(!route){
            return reply.code(404).send({ error: 'Route not found' })
        }

        // 1. Rate limit by IP
        const r1 = checkRateLimit(
            `ip:${request.ip}`,
            route.rateLimit ?? config.rateLimit.maxRequests,
            config.rateLimit.windowMs
        )

        reply.header('X-RateLimit-Limit', route.rateLimit ?? config.rateLimit.maxRequests)
        reply.header('X-RateLimit-Remaining', r1.remaining)
        reply.header('X-RateLimit-Reset', Math.ceil(r1.resetAt / 1000))

        if(!r1.allowed){
            return reply.code(429).send({ error: 'Too many requests...' })
        }

        // 2. Auth
        let userId: string | undefined
        if(route.auth !== false){
            const payload = await verifyAuth(request, reply)
            if(!payload) return

            userId = payload.userId

            if (!checkRole(payload, route, reply)) return

            const userR1 = checkRateLimit(
                `user:${userId}`,
                route.rateLimit ?? config.rateLimit.maxRequests,
                config.rateLimit.windowMs
            )

            if(!userR1.allowed){
                return reply.code(429).send({ error: 'Too many requests...' })
            }
        }

        // 3. Proxy
        const targetUrl = `${route.upstream}${request.url}`
        const startTime = Date.now()

        try {
            // console.log('PROXY HIT:', request.url)
            const { statusCode, headers, body } = await httpRequest(targetUrl, {
                method: request.method,
                headers: {
                    ...(request.headers as Record<string, string>),
                    host: new URL(route.upstream).host,
                    ...(userId && { 'x-user-id' : userId })
                },
                body: request.raw,
                headersTimeout: 5000,
                bodyTimeout: 10_000,
            })

            for(const [key, value] of Object.entries(headers)){
                if(value && key !== 'transfer-encoding') reply.header(key, value)
            }
            
            logRequest(request, statusCode, Date.now() - startTime, route.upstream)
            return reply.code(statusCode).send(body)

        } catch (error) {
            logError(request, error, 'upstream-unreachable')
            return reply.code(502).send({ error: 'Bad Gateway: upstream service unreachable' })
        }
    })
}