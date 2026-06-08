import jwt from "jsonwebtoken"
import { config } from "../config.js"
import type { JwtPayload } from "../types/routes.js"
import type { FastifyReply, FastifyRequest } from "fastify"

export async function verifyAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<JwtPayload | null> {

    const authHeader = request.headers['authorization']

    if(!authHeader?.startsWith('Bearer')) {
        reply.code(401).send({ error: "Missing or Invalid Authorization" })
        return null
    }

    const token = authHeader.slice(7)

    try {
        const paylod = jwt.verify(token, config.jwtSecret) as JwtPayload
        return paylod
    } catch (error) {
        if(error instanceof jwt.TokenExpiredError){
            reply.code(401).send({ error: "JWT Token Expired" })
        } else {
            reply.code(401).send({ error: "Invalid Token" })
        }
        return null
    }

}