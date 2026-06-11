import { Registry, Counter, Histogram, Gauge } from "prom-client"

export const registry = new Registry()

// Total requests through the gateway
export const httpRequestsTotal = new Counter({
    name: "gateway_requests_total",
    help: "Total number of requests proxied",
    labelNames: ["method", "route", "status_code"],
    registers: [registry],
})

// Request duration
export const httpRequestDuration = new Histogram({
    name: "gateway_request_duration_ms",
    help: "Request duration in milliseconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [registry],
})

// Rate limit hits
export const rateLimitHitsTotal = new Counter({
    name: "gateway_rate_limit_hits_total",
    help: "Total number of requests rejected by rate limiter",
    labelNames: ["key_type"],   // 'ip' or 'user'
    registers: [registry],
})

// Circuit breaker state
export const circuitBreakerState = new Gauge({
    name: "gateway_circuit_breaker_state",
    help: "Circuit breaker state: 0=closed, 1=open, 2=half-open",
    labelNames: ["upstream"],
    registers: [registry],
})

// Auth failures
export const authFailuresTotal = new Counter({
    name: "gateway_auth_failures_total",
    help: "Total number of auth failures",
    labelNames: ["reason", "auth_type"],   // reason: expired, invalid, missing
    registers: [registry],
})

export const cacheHitsTotal = new Counter({
    name: "gateway_cache_hits_total",
    help: "Total number of cache hits",
    labelNames: ["route"],
    registers: [registry],
})