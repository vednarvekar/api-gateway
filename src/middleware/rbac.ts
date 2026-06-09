import type { FastifyReply } from "fastify"
import type { JwtPayload, Route } from "../types/routes.js"

export function checkRole(
    payload: JwtPayload,
    route: Route,
    reply: FastifyReply
): boolean {

    // No roles defined on route = any authenticated user is allowed
    if (!route.roles || route.roles.length === 0) return true

    if (!route.roles.includes(payload.role)) {
        reply.code(403).send({ error: "Forbidden: insufficient role" })
        return false
    }

    return true
}