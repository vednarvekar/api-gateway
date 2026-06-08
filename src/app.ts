import Fastify from 'fastify'
import { errorHandler } from './middleware/errorHandler.js'
import { healthRoute } from './routes/health.js'
import { proxyRoute } from './routes/proxy.js'

export function buildApp() {
  const fastify = Fastify({ logger: true })

  fastify.setErrorHandler(errorHandler)

  fastify.register(healthRoute)
  fastify.register(proxyRoute)

  return fastify
}