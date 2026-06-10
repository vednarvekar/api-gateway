import CircuitBreaker from "opossum";
import { request as httpRequest, type Dispatcher} from "undici"

interface ProxyRequestOptions {
    method: string,
    headers: Record<string, string>,
    body: any,
    headersTimeout: number,
    bodyTimeout: number
}

const breakers = new Map<string, CircuitBreaker>()

function getBreaker(upstream: string): CircuitBreaker {
    if (breakers.has(upstream)) return breakers.get(upstream)!

    const breaker = new CircuitBreaker(httpRequest, {
        timeout: 10_000,               // call fails if upstream takes > 10s
        errorThresholdPercentage: 50,  // open if 50% of requests fail
        resetTimeout: 30_000,          // try again after 30s
        volumeThreshold: 5,            // minimum 5 requests before tracking %
    })


    breaker.on('open',     () => console.warn(`Circuit OPEN for ${upstream} — stopping requests`))
    breaker.on('halfOpen', () => console.info(`Circuit HALF-OPEN for ${upstream} — testing...`))
    breaker.on('close',    () => console.info(`Circuit CLOSED for ${upstream} — back to normal`))

    breakers.set(upstream, breaker)
    return breaker
}

export async function proxyRequest(
    targetUrl: string,
    options: ProxyRequestOptions
): Promise<Dispatcher.ResponseData> {
    const upstream = new URL(targetUrl).origin
    const breaker = getBreaker(upstream)
    return breaker.fire(targetUrl, options) as Promise<Dispatcher.ResponseData>
}

export function getBreakerStatus(upstream: string) {
    const breaker = breakers.get(upstream)
    if (!breaker) return null
    return {
        upstream,
        state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
        stats: breaker.stats,
    }
}