import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import dotenv from "dotenv"
dotenv.config()

export function errorHandler(
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply
) {
    request.log.error({ err: error, path: request.url })

    const statusCode = error.statusCode ?? 500

    reply.code(statusCode).send({
        error: {
            code: statusCode,
            message: statusCode >= 500 ? 'Internal Server Error' : error.message,
            ...(process.env.NOD_ENV !== 'production' && { detail: error.message })
        }
    })
}