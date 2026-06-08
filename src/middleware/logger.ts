import type { FastifyRequest, FastifyReply } from "fastify";

export function logRequest(
    request: FastifyRequest,
    statusCode: number,
    durationMins: number,
    upstream?: string
) {
    request.log.info({
        type: 'proxy-request',
        method: request.method,
        path: request.url,
        statusCode,
        durationMins,
        upstream: upstream ?? null,
        ip: request.ip,
        userAgent: request.headers['user-agent']
    })
}

export function logError(
    request: FastifyRequest,
    error: unknown,
    context?: string
) {
    request.log.error({
        type: 'proxy_error',
        method: request.method,
        path: request.url,
        context,
        error: error instanceof Error ? error.message : String(error),
    })
}