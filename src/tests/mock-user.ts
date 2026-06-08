import Fastify from 'fastify'

const app = Fastify()

app.get('/user/profile', async (request) => {
  return {
    success: true,
    userId: request.headers['x-user-id']
  }
})

app.listen({ port: 4001 })