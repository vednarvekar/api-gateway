import Fastify from 'fastify'
import { errorHandler } from './middleware/errorHandler.js'
import { healthRoute } from './routes/health.js'
import { authRoute } from './routes/auth.js'
import { proxyRoute } from './routes/proxy.js'
import { initRouter } from './router.js'
import { redis } from './db/redis.js'

export async function buildApp() {
  const fastify = Fastify({ 
    logger: {
      transport: {
        target: 'pino-pretty'
      }
    } 
  })
  
  fastify.setErrorHandler(errorHandler)
  
  await redis.connect()
  await initRouter()
  
  // 1. Regular routes/plugins
  fastify.register(healthRoute)
  fastify.register(authRoute)

  // 2. The global wildcard proxy MUST always be registered LAST
  fastify.register(proxyRoute)

  return fastify
}