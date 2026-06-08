import type { FastifyInstance } from 'fastify'
import { signToken, signRefreshToken } from '../utils/jwt.js'

// Hardcoded users for now — Phase 2 this moves to DB
const users = [
  { id: 'user-1', email: 'admin@test.com', password: 'admin123', role: 'admin' },
  { id: 'user-2', email: 'user@test.com',  password: 'user123',  role: 'user'  },
]

interface LoginBody {
  email: string
  password: string
}

export async function authRoute(fastify: FastifyInstance) {
  fastify.post<{ Body: LoginBody }>('/auth/login', async (request, reply) => {
    const { email, password } = request.body

    if (!email || !password) {
      return reply.code(400).send({ error: 'email and password required' })
    }

    const user = users.find(u => u.email === email && u.password === password)

    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' })
    }

    const accessToken  = signToken({ userId: user.id, role: user.role })
    const refreshToken = signRefreshToken({ userId: user.id, role: user.role })

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role }
    })
  })
}