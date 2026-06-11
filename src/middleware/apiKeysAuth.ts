import { db } from "../db/client.js"
import { apiKeys } from "../db/schema.js"
import { eq, and } from "drizzle-orm"
import type { FastifyRequest, FastifyReply } from "fastify"
import type { JwtPayload } from "../types/routes.js"

export async function verifyApiKey(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<JwtPayload | null> {

    const key = request.headers['x-api-key'] as string

    if (!key) {
        reply.code(401).send({ error: "Missing x-api-key header" })
        return null
    }

    const result = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.key, key), eq(apiKeys.enabled, true)))
        .limit(1)
        
        
        if (result.length === 0) {
            reply.code(401).send({ error: "Invalid or disabled API key" })
            return null
        }
        
        const apiKey = result[0]!

    // Return same shape as JWT payload so proxy.ts doesn't need to change
    return {
        userId: apiKey.owner,
        role: apiKey.role,
        iat: 0,
        exp: 0,
    }
}