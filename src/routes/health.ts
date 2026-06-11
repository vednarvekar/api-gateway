import type { FastifyInstance } from 'fastify'
import { redis } from '../db/redis.js'
import { getBreakerStatus } from '../utils/circuitBreaker.js'

import { registry } from "../utils/metrics.js"

export async function healthRoute(fastify: FastifyInstance) {
    fastify.get('/health', async () => {
        const redisOk = await redis.ping().then(() => true).catch(() => false)
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            redis: redisOk ? 'connected' : 'disconnected',
        }
    })

    fastify.get('/metrics', async (request, reply) => {
        reply.header('Content-Type', registry.contentType)
        return reply.send(await registry.metrics())
    })

    fastify.get('/health/circuits', async () => {
        const upstreams = [
            'http://localhost:4001',
            'http://localhost:4002',
            'http://localhost:4005',
            'http://localhost:4006',
        ]
        return upstreams.map(u => getBreakerStatus(u) ?? { upstream: u, state: 'no-traffic' })
    })
}