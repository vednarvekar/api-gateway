import Fastify from 'fastify'
import { matchRoutes } from './router.js'
import { request as httpRequest } from 'undici'

const fastify = Fastify({
  logger: true
})

// Declare a route
fastify.all('/*',  async function handler (request, reply) {
    const urlObj = new URL(request.url, `http://${request.headers.host}`)
    const route = matchRoutes(urlObj.pathname)

    if(!route){
        return reply.code(404).send({error: "Route not found"})
    }

    // 1. Constructing destination URL
    const targetUrl = `${route.upstream}${request.url}`

    try {
        // 2. Performing Proxy request
        const { statusCode, headers, body } = await httpRequest(targetUrl, {
            method: request.method,
            headers: {
                ...request.headers as any, 
                host: new URL(route.upstream).host,
            },
            body: request.raw,
            headersTimeout: 5000
        })
        delete request.headers['host']
        
        reply.code(statusCode)
        // 3. Forwarding upstream headers back to client
        for(const [key, value] of Object.entries(headers)) {
            if (value) reply.header(key, value)
        }

        // 4. Send the Upstream status and body
        return reply.send(body)

    } catch (error) {
        fastify.log.error(error)
        return reply.code(502).send({ error: "Bad Gateway: Upstream service is unreachable" })
        
    }
})


// Run the server!
const start = async() => {
    try {
        await fastify.listen({ port: 3000 })
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}
start();
