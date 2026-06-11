import { type FastifyInstance } from "fastify";

import { matchRoute } from "../router.js";

import { config } from "../utils/config.js";
import { proxyRequest } from "../utils/circuitBreaker.js";
import { httpRequestsTotal, httpRequestDuration, rateLimitHitsTotal, cacheHitsTotal } from "../utils/metrics.js"

import { checkRateLimit } from "../middleware/rateLimit.js";
import { verifyAuth } from "../middleware/auth.js";
import { logError, logRequest } from "../middleware/logger.js";
import { checkRole } from "../middleware/rbac.js";
import { verifyApiKey } from "../middleware/apiKeysAuth.js"
import { buildCacheKey, getCached, setCached } from "../middleware/cache.js";

import type { JwtPayload } from "../types/routes.js"

export async function proxyRoute(fastify: FastifyInstance) {

    fastify.all("/*", async (request, reply) => {
        const urlObj = new URL(request.url, `http://${request.headers.host}`)
        const route = matchRoute(urlObj.pathname)

        if(!route){
            return reply.code(404).send({ error: 'Route not found' })
        }

        // 1. Rate limit by IP
        const r1 = await checkRateLimit(
            `ip:${request.ip}`,
            route.rateLimit ?? config.rateLimit.maxRequests,
            config.rateLimit.windowMs
        )

        reply.header('X-RateLimit-Limit', route.rateLimit ?? config.rateLimit.maxRequests)
        reply.header('X-RateLimit-Remaining', r1.remaining)
        reply.header('X-RateLimit-Reset', Math.ceil(r1.resetAt / 1000))

        if (!r1.allowed) {
            rateLimitHitsTotal.inc({ key_type: 'ip' })
            return reply.code(429).send({ error: 'Too many requests...' })
        }   


        // 2. Auth
        let userId: string | undefined
        if (route.auth !== false) {
            let payload: JwtPayload | null = null

            const authType = route.authType ?? 'jwt'

            if (authType === 'apikey') {
                payload = await verifyApiKey(request, reply)
            } else if (authType === 'any') {
                // accept either — try JWT first, fall back to API key
                if (request.headers['authorization']) {
                    payload = await verifyAuth(request, reply)
                } else if (request.headers['x-api-key']) {
                    payload = await verifyApiKey(request, reply)
                } else {
                    reply.code(401).send({ error: "Missing authorization" })
                    return
                }
            } else {
                payload = await verifyAuth(request, reply)
            }

            if (!payload) return

            userId = payload.userId

            if (!checkRole(payload, route, reply)) return

            const userRl = await checkRateLimit(
                `user:${userId}`,
                route.rateLimit ?? config.rateLimit.maxRequests,
                config.rateLimit.windowMs
            )
            if (!userRl.allowed) {
                rateLimitHitsTotal.inc({ key_type: 'user' })
                return reply.code(429).send({ error: "Too many requests" })
            }
        }

        // 3. Proxy
        const targetUrl = `${route.upstream}${request.url}`
        const startTime = Date.now()

        // Only cache GET requests
        const cacheKey = buildCacheKey(request.method, request.url)
        if (request.method === 'GET') {
            const cached = await getCached(cacheKey)
            if (cached) {
                cacheHitsTotal.inc({ route: route.path })
                reply.header('X-Cache', 'HIT')
                reply.header('Content-Type', 'application/json')
                return reply.code(200).send(cached)
            }
        }

        try {
            // console.log('PROXY HIT:', request.url)
            const { statusCode, headers, body } = await proxyRequest(targetUrl, {
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

            // Cache successful GET responses only
            if (request.method === 'GET' && statusCode === 200) {
                const bodyText = await body.text()
                
                await setCached(cacheKey, bodyText)
                reply.header('X-Cache', 'MISS')
                
                logRequest(request, statusCode, Date.now() - startTime, route.upstream)
                
                httpRequestsTotal.inc({ 
                    method: request.method, 
                    route: route.path, 
                    status_code: statusCode 
                })
                httpRequestDuration.observe(
                    { method: request.method, route: route.path, status_code: statusCode }, 
                    Date.now() - startTime)
                
                return reply.code(statusCode).send(bodyText)
            }
            
            logRequest(request, statusCode, Date.now() - startTime, route.upstream)

            httpRequestsTotal.inc({
                method: request.method,
                route: route.path,
                status_code: statusCode,
            })
            httpRequestDuration.observe(
                { method: request.method, route: route.path, status_code: statusCode },
                Date.now() - startTime
            )

            return reply.code(statusCode).send(body)


        } catch (error: any) {
            // httpRequestsTotal.inc({
            //     method: request.method,
            //     route: route.path ?? 'unknown',
            //     status_code: error.message === 'Breaker is open' ? 503 : 502,
            // })
            // opossum throws with message 'Breaker is open' when circuit is open
            if (error.message === 'Breaker is open') {
                logError(request, error, 'circuit_open')
                httpRequestsTotal.inc({ method: request.method, route: route.path ?? 'unknown', status_code: 503 })
                return reply.code(503).send({ error: 'Service temporarily unavailable' })
            }

            logError(request, error, 'upstream-unreachable')
             httpRequestsTotal.inc({ method: request.method, route: route.path ?? 'unknown', status_code: 502 })
            return reply.code(502).send({ error: 'Bad Gateway: upstream service unreachable' })
        }
    })
}