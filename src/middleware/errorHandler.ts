import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply
) {
    request.log.error({ err: error, path: request.url })
    
}