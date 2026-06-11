import { verifyToken } from "../utils/jwt.js"
import type { JwtPayload } from "../types/routes.js"
import type { FastifyReply, FastifyRequest } from "fastify"
import { authFailuresTotal } from "../utils/metrics.js"

export async function verifyAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<JwtPayload | null> {

    const authHeader = request.headers['authorization']

    if (!authHeader?.startsWith('Bearer')) {
        reply.code(401).send({ error: "Missing or Invalid Authorization" })
        return null
    }

    const token = authHeader.slice(7)

    try {
        return verifyToken(token)
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            authFailuresTotal.inc({ reason: 'expired', auth_type: 'jwt' })
            reply.code(401).send({ error: "JWT Token Expired" })
        } else {
            authFailuresTotal.inc({ reason: 'invalid', auth_type: 'jwt' })
            reply.code(401).send({ error: "Invalid Token" })
        }
        return null
    }

}