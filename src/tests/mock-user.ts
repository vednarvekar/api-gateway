import Fastify from 'fastify'

const app = Fastify()

app.get('/user/profile', async (request) => {
  return {
    success: true,
    userId: request.headers['x-user-id']
  }
}).listen({port: 4001})

// app.listen({ port: 4001 })

app.get('admin/dashboard', async (request) => {
  return {
    success: true, 
    userId: request.headers['x-user-id']
  }
}).listen({port: 4005})
