# API Gateway — Deep Dive Knowledge File

This file explains every concept used in this project in plain language. Read this before any interview.

---

## Table of Contents

1. [What is an API Gateway and why does it exist](#1-what-is-an-api-gateway)
2. [Why Node.js — and what are its real limitations](#2-nodejs--its-real-limitations)
3. [JWT Authentication](#3-jwt-authentication)
4. [RBAC — Role Based Access Control](#4-rbac)
5. [Rate Limiting](#5-rate-limiting)
6. [Circuit Breaker](#6-circuit-breaker)
7. [Redis — why it's used here and how](#7-redis)
8. [Redis Caching](#8-redis-caching)
9. [Prometheus Metrics](#9-prometheus-metrics)
10. [Dynamic Routes via Postgres](#10-dynamic-routes-via-postgres)
11. [API Key Auth](#11-api-key-auth)
12. [Performance — your numbers and their meaning](#12-performance--your-numbers)
13. [Scaling — what breaks first and how to fix it](#13-scaling)
14. [Why production API gateways are not written in Node](#14-why-production-gateways-are-not-in-node)
15. [Common interview questions with answers](#15-interview-questions)

---

## 1. What is an API Gateway

### The problem it solves

Imagine you have 5 backend services — user service, order service, billing service, admin service, notification service. Without a gateway, every single one of them needs to implement:

- Auth (JWT verification)
- Rate limiting
- Logging
- Error formatting
- CORS

That's the same code written 5 times. If you change how auth works, you update 5 services. That's a maintenance nightmare.

An API Gateway sits in front of all of them. Every request goes through the gateway first. The gateway handles all the cross-cutting concerns — auth, rate limiting, logging — and then forwards the request to the right backend service.

```
Without gateway:
Client → User Service (has auth + rate limit + logging)
Client → Order Service (has auth + rate limit + logging)
Client → Billing Service (has auth + rate limit + logging)

With gateway:
Client → Gateway (auth + rate limit + logging) → User Service
                                               → Order Service
                                               → Billing Service
```

Backend services only worry about their own business logic.

### What "reverse proxy" means

A forward proxy sits in front of clients (like a VPN — client → proxy → internet).
A reverse proxy sits in front of servers (client → proxy → your servers).

Your gateway is a reverse proxy. The client doesn't know or care which upstream service handles the request. It just talks to the gateway.

---

## 2. Node.js & Its Real Limitations

### Why Node.js works well here

Node.js runs on a single thread with an event loop. Instead of creating a new thread for every request (like Java does), Node handles everything on one thread using async/await and callbacks.

For a gateway, most work is I/O — reading headers, making an HTTP call to upstream, writing a response. The CPU does almost nothing. Node's event loop is very good at this — while one request is waiting for the upstream to respond, it handles the next request. This is why you got 5,000–6,000 RPS on a single machine.

### The real limitations

**Single-threaded CPU bottleneck**

If any operation is CPU-heavy (encryption, image processing, complex computation), it blocks the entire event loop. Every other request waits. For a gateway doing mostly I/O this rarely matters — but it's why you'd never build a video encoding service in Node.

```
Thread model comparison:
Java/Go: 1 thread per request → 1000 requests = 1000 threads (memory heavy but CPU parallel)
Node.js: 1 thread for everything → 1000 requests handled by 1 event loop (memory light, no CPU parallelism)
```

**Memory — one process, one heap**

Node has a default heap limit of ~1.5GB. Under extreme load if you're holding too many requests in memory, it crashes. You can increase this with `--max-old-space-size` but it's still one process.

**No true parallelism**

Node has `worker_threads` and `cluster` mode, but these are workarounds. Go and C++ have real OS-level threading. For pure throughput, Go typically handles 3-5x more RPS than Node for the same hardware.

**Why this is fine for your project**

Your gateway is doing:
- JWT verify (microseconds)
- Redis lookup (network I/O, non-blocking)
- HTTP proxy to upstream (network I/O, non-blocking)

None of that is CPU-heavy. Node is a perfectly reasonable choice. In fact Fastify is one of the fastest Node.js frameworks in existence.

---

## 3. JWT Authentication

### What a JWT is

JWT stands for JSON Web Token. It's a string with three parts separated by dots:

```
header.payload.signature
```

**Header** — says what algorithm was used (HS256, RS256 etc)
**Payload** — contains the actual data: user ID, role, expiry time
**Signature** — a hash of header + payload using your secret key

Example payload (decoded):
```json
{
  "sub": "user-1",
  "role": "admin",
  "iat": 1781091411,
  "exp": 1781095011
}
```

`iat` = issued at (unix timestamp), `exp` = expiry (unix timestamp)

### Why it's secure

The signature is created like this:
```
HMAC_SHA256(base64(header) + "." + base64(payload), SECRET_KEY)
```

If someone tampers with the payload (changes role from "user" to "admin"), the signature won't match anymore. Your gateway rejects it.

The secret key never leaves your server. As long as the secret is safe, the tokens can't be forged.

### Where your code does this

`src/utils/token.ts` — `signToken()` creates the token, `verifyToken()` checks the signature and expiry.

`src/middleware/auth.ts` — reads the `Authorization: Bearer <token>` header, calls `verifyToken()`, returns the payload or sends 401.

### Access token vs refresh token

Access token: short-lived (1 hour in your code). Used on every request.
Refresh token: long-lived (7 days). Used only to get a new access token when the old one expires.

Why two tokens? If an access token is stolen, it expires in 1 hour anyway. If you only had one long-lived token and it got stolen, the attacker has 7 days of access.

---

## 4. RBAC

### What it is

Role-Based Access Control. Instead of checking "is this user allowed to do X" individually, you assign users a role, and roles have permissions.

```
admin → can access /admin, /user, /order, /billing
user  → can access /user, /order
service → can access /billing
```

### Why not just check user ID

If you have 10,000 users and you want to give 500 of them admin access, you'd need a list of 500 user IDs per route. Unmaintainable. With roles you just say "admin role can access this route" and assign roles to users separately.

### How your code does it

Each route in the DB has a `roles` array:
```typescript
{ path: "/admin", roles: ["admin"] }
{ path: "/user",  roles: ["admin", "user"] }
```

`src/middleware/rbac.ts`:
```typescript
export function checkRole(payload: JwtPayload, route: Route, reply: FastifyReply): boolean {
    if (!route.roles || route.roles.length === 0) return true   // no restriction
    if (!route.roles.includes(payload.role)) {
        reply.code(403).send({ error: "Forbidden: insufficient role" })
        return false
    }
    return true
}
```

JWT payload has `role: "user"`. Route requires `["admin"]`. `"user"` is not in `["admin"]` → 403.

### 401 vs 403 — the difference

401 Unauthorized — you are not authenticated (no token, bad token, expired token). We don't know who you are.
403 Forbidden — we know who you are, but you don't have permission. Authenticated but not authorized.

---

## 5. Rate Limiting

### Why it exists

Without rate limiting, one user (or attacker) can send 100,000 requests per second and bring your entire system down. Rate limiting says "you get 100 requests per minute, after that you wait."

### Fixed window vs sliding window

**Fixed window**: count resets at exact minute boundaries.
Problem: a user sends 100 requests at 11:59:59, window resets, sends 100 more at 12:00:01. 200 requests in 2 seconds — the limit was bypassed.

**Sliding window**: the window moves with time. At any point in time, look back 60 seconds and count requests.
Your Redis implementation uses a simple version of this — `INCR` + `EXPIRE` per key.

### Why per-IP AND per-user

Per-IP: protects against unauthenticated attacks and bot traffic.
Per-user: protects against authenticated abuse. A logged-in user spinning up 10 connections from different IPs would bypass IP-only limiting.

### Your Redis implementation

```typescript
const count = await redis.incr(key)       // atomically increment
if (count === 1) {
    await redis.expire(key, windowSec)    // set TTL on first request
}
```

`INCR` is atomic in Redis — even if 1000 requests hit simultaneously, each one gets a unique count. No race conditions.

Key format: `ip:192.168.1.1` or `user:user-1`

### Why in-memory rate limiting breaks under scaling

If you run 2 gateway instances, each has its own memory. User sends 100 requests to instance 1, then 100 to instance 2 — 200 total, limit bypassed. Redis is shared between all instances — the count is always accurate regardless of how many gateway instances are running.

---

## 6. Circuit Breaker

### The problem it solves

Imagine your order service goes down. Every request to `/order` now waits 10 seconds for the timeout, then fails with 502. With 100 concurrent users all hitting `/order`, you have 100 connections all waiting 10 seconds. Your gateway is now slow for everyone — even users hitting `/user` which is perfectly fine — because all threads are stuck waiting.

This is called a cascading failure. One dead service drags down the whole gateway.

### How a circuit breaker works

It's named after an electrical circuit breaker — when current is too high, the breaker trips and stops the flow entirely.

Three states:

```
CLOSED (normal) → requests go through normally
      ↓ too many failures
OPEN (tripped) → requests fail immediately without even trying upstream
      ↓ after 30 seconds
HALF-OPEN (testing) → let one request through
      ↓ if it succeeds          ↓ if it fails
   CLOSED again              OPEN again
```

### What "fail immediately" means

When the circuit is OPEN, your gateway doesn't wait 10 seconds for a timeout. It rejects the request instantly with 503. 

Instead of 100 connections hanging for 10 seconds each (1000 seconds of wasted time), they fail in milliseconds. The gateway stays fast for other routes.

### Your opossum config explained

```typescript
const breaker = new CircuitBreaker(httpRequest, {
    timeout: 10_000,                // individual call timeout
    errorThresholdPercentage: 50,   // open if 50% of calls fail
    resetTimeout: 30_000,           // try again after 30s
    volumeThreshold: 5,             // need at least 5 calls before tracking %
})
```

`volumeThreshold: 5` means it won't open the circuit after just 1 failure. Needs at least 5 requests to calculate a meaningful failure rate.

### One breaker per upstream

```typescript
const breakers = new Map<string, CircuitBreaker>()
```

If order service is down, only the circuit for `http://localhost:4002` opens. User service circuit stays closed. This is important — you don't want one bad service affecting unrelated routes.

---

## 7. Redis

### What Redis is

Redis is an in-memory key-value store. Think of it as a giant JavaScript object (`{ key: value }`) that lives outside your Node process, is shared across all your servers, and is extremely fast because everything is in RAM.

```
redis.set("user:1", "John")   // store
redis.get("user:1")           // returns "John"
redis.incr("counter")         // atomically increment a number
redis.expire("key", 60)       // delete key after 60 seconds
```

### Why not just use a regular database

A Postgres query involves: network round trip + disk read + query parsing + result serialization. ~5-20ms typical.
A Redis query involves: network round trip + RAM lookup. ~0.1-1ms typical.

For rate limiting — checked on every single request — that 20ms vs 0.5ms difference matters enormously at scale.

### Your two uses of Redis

1. **Rate limiting** — `ip:x.x.x.x` and `user:user-1` counters with TTL
2. **Response caching** — `cache:GET:/billing/invoices` storing full response body

### Redis vs in-memory (why Redis wins at scale)

| | In-memory Map | Redis |
|---|---|---|
| Shared across instances | ❌ No | ✅ Yes |
| Survives process restart | ❌ No | ✅ Yes (with persistence) |
| Speed | Fastest | Very fast |
| Works with 1 instance | ✅ Yes | ✅ Yes |
| Works with 10 instances | ❌ Breaks | ✅ Works |

---

## 8. Redis Caching

### The concept

If 1000 users all request `GET /billing/invoices` and the response is the same for all of them — why hit the upstream 1000 times? Cache the response after the first request, serve from Redis for the next 999.

```
Request 1: Gateway → upstream → response → save to Redis → return to user (MISS)
Request 2: Gateway → Redis hit → return to user (no upstream call) (HIT)
...
Request 1000: Gateway → Redis hit → return to user (HIT)
```

### What your code caches

Only `GET` requests, only `200` responses, TTL 60 seconds.

Why only GET? Because GET is a read — the response is the same data. POST/PUT/DELETE change data, caching them would return stale data to users.

Why only 200? Caching a 500 error means users keep getting that error even after the upstream recovers. Only cache success.

### Cache key design

```typescript
export function buildCacheKey(method: string, url: string): string {
    return `cache:${method}:${url}`
}
```

`cache:GET:/billing/invoices` — includes the full URL including query string. So `/billing/invoices?month=jan` and `/billing/invoices?month=feb` are cached separately.

### Cache invalidation — the hard problem

Your cache TTL is 60 seconds. What if the data changes? The user gets stale data for up to 60 seconds. This is the fundamental tradeoff of caching — freshness vs speed.

For real production caching you'd either:
1. Lower TTL for frequently changing data
2. Explicitly delete the cache key when data changes (`redis.del(key)`)
3. Use cache tags to invalidate groups of keys

For this project, 60s TTL is reasonable.

---

## 9. Prometheus Metrics

### What Prometheus is

Prometheus is a monitoring system. Your gateway exposes a `/metrics` endpoint with raw numbers. Prometheus (a separate service) scrapes that endpoint every 15 seconds and stores the data. Grafana then visualizes it as graphs.

### Your metrics explained

**Counter** — only goes up, never resets (until restart). Good for: total requests, total errors, total cache hits.

```
gateway_requests_total{method="GET",route="/user",status_code="200"} 5432
```

**Histogram** — records distribution of values. Good for: latency (most requests are fast, some are slow — you want to see the shape).

```
gateway_request_duration_ms_bucket{le="25"} 4000   ← 4000 requests took ≤25ms
gateway_request_duration_ms_bucket{le="100"} 5400  ← 5400 requests took ≤100ms
```

**Gauge** — can go up or down. Good for: current state (circuit breaker open/closed).

```
gateway_circuit_breaker_state{upstream="http://localhost:4002"} 1  ← 1 = open
```

### Why p99 latency matters more than average

Average latency of 25ms sounds great. But if 1% of requests take 2000ms, 1 in 100 users is having a terrible experience. p99 (99th percentile) tells you "99% of requests were faster than this number." That's what you optimize in production.

### Labels — the `{method="GET", route="/user"}` part

Labels let you slice the same metric by different dimensions. `gateway_requests_total` with labels lets you ask:
- How many GET requests to /user?
- How many 500 errors total?
- Which route has the most traffic?

All from one metric with different label filters.

---

## 10. Dynamic Routes via Postgres

### Why not hardcode routes

Hardcoded routes mean every route change requires a code deploy and server restart. In production, a restart means downtime. Even 30 seconds of downtime for a route change is unacceptable.

With DB-backed routes, you insert a row, the gateway picks it up in 30 seconds. No code change, no restart.

### The in-memory cache pattern

```typescript
let cachedRoutes: Route[] = []

async function loadRoutes(): Promise<void> {
    const rows = await db.select().from(routesTable).where(eq(routesTable.enabled, true))
    cachedRoutes = rows.map(...)
}

setInterval(loadRoutes, 30_000)  // refresh every 30s
```

`matchRoute()` reads from `cachedRoutes` — an array in memory. Zero DB calls per request. The DB is only hit every 30 seconds in the background.

Why cache at all? If `matchRoute()` queried Postgres on every request at 5,000 RPS, that's 5,000 DB queries per second. Postgres would collapse. The in-memory cache brings that down to 1 query per 30 seconds regardless of traffic.

### Trade-off

A route change takes up to 30 seconds to propagate. You could lower `CACHE_TTL` to 5 seconds for faster propagation, but then you're hitting the DB more. 30 seconds is a reasonable balance.

---

## 11. API Key Auth

### JWT vs API Key — when to use which

JWT is for users — humans logging in with email/password, token expires, refresh flow.

API Key is for services — a cron job, another backend service, a third-party integration. They don't "log in." They have a static key they send with every request.

```
Human user:    Authorization: Bearer eyJhbGc...
Machine/service: x-api-key: test-api-key-billing-service
```

### Why not just give services a JWT

You could, but JWTs expire. A service would need to implement the login + refresh flow. That's complexity for no benefit — a service doesn't need token rotation the way a human session does.

### Your implementation

Key is stored in Postgres `api_keys` table. On every request with `x-api-key` header, your gateway does a DB lookup:

```typescript
const result = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.key, key), eq(apiKeys.enabled, true)))
    .limit(1)
```

If found and enabled → auth passes, returns a payload shaped like JwtPayload so the rest of the proxy handler doesn't need different code paths.

### Security concern with API keys

API keys don't expire automatically. If leaked, they're valid until you manually disable them in the DB (`UPDATE api_keys SET enabled = false WHERE key = '...'`). In production you'd add:
- Key rotation (issue new key, deprecate old one)
- Per-key rate limiting
- Audit log of which key called what

---

## 12. Performance — Your Numbers

### What you measured

```
10 users:   2,893 RPS, 2.93ms avg latency
50 users:   4,743 RPS, 10ms avg latency
100 users:  5,782 RPS, 16ms avg latency
250 users:  6,084 RPS, 40ms avg latency
```

### What these numbers actually mean

At 10 users RPS is low because there aren't enough concurrent requests to saturate the system. As concurrency increases, RPS increases because the event loop is kept busier. At 250 users RPS plateaus — you've hit the ceiling of this single process on this machine.

The latency increase from 2.93ms (10 users) to 40ms (250 users) is normal. More requests competing for the same resources means each waits longer.

### Why these numbers are limited to your machine

Your machine has a fixed number of CPU cores, RAM, and network bandwidth. These tests ran with:
- Gateway and upstream mock on the same machine
- No real network latency (localhost)
- Single gateway instance

In production with:
- Real network between gateway and upstream (add ~5-20ms)
- Dedicated server with more cores
- Multiple gateway instances behind a load balancer

Numbers would be different. That's the honest answer.

### Cache performance observation

Cache hit test showed ~2,583 RPS vs ~5,782 RPS for non-cached. Cache was slower — unexpected. Reason: the mock upstream (`localhost:4006`) was very fast anyway. Redis adds a network round trip even for hits. Caching helps most when upstream is slow (DB queries, complex computation). For a fast mock service, bypassing it with Redis actually adds overhead.

This is an important insight to mention in interviews — caching isn't always faster, it depends on upstream latency vs Redis latency.

---

## 13. Scaling

### What breaks first

**Rate limiting** — already solved with Redis. Shared state across instances.

**Route cache** — each instance has its own copy, refreshed every 30s independently. This is fine — all instances converge to the same routes within 30s.

**Circuit breaker state** — each instance has its own breakers. If instance 1's circuit opens for upstream X, instance 2 doesn't know. Instance 2 keeps sending requests to the dead upstream until its own threshold is reached. This is a known limitation of your current implementation. Fix: use Redis to share breaker state (complex, often not worth it — each instance self-heals within a few seconds anyway).

**JWT verification** — stateless, scales perfectly. Each instance verifies tokens independently with the same secret.

### How to run multiple instances

```yaml
# docker-compose.yml
server:
  deploy:
    replicas: 3
```

Put Nginx or AWS ALB in front. All instances share Postgres and Redis. Rate limiting and caching work correctly. Circuit breakers are per-instance but self-heal.

### The 1 million concurrent users question

Honest answer: no single Node.js process handles 1 million concurrent users. At that scale you need:

1. **Horizontal scaling** — 50-100 gateway instances behind a load balancer
2. **Geographic distribution** — instances in multiple regions, route users to nearest
3. **Better rate limiting** — Redis Cluster instead of single Redis
4. **Connection pooling** — pg-pool for Postgres connections

At 6,000 RPS per instance × 100 instances = 600,000 RPS theoretical. Real-world efficiency is lower due to overhead, but that's the direction.

Companies like Cloudflare handle billions of requests per day with gateways written in Go, Rust, and C++ precisely because they need that last bit of performance that Node can't give. But for 99% of startups, Node is more than sufficient.

---

## 14. Why Production Gateways Are Not in Node

This is the most important question to be ready for.

### The honest answer

Kong, Nginx, Envoy, Traefik — the big production gateways are written in C, C++, Go, or Lua. Reasons:

**Raw throughput** — Go handles ~3x more RPS than Node for the same hardware. C/C++ handles ~10x. At Cloudflare's scale (tens of millions of RPS), that difference is millions of dollars in server costs.

**Predictable latency** — Node's garbage collector can cause latency spikes (GC pauses). Go has a better GC. C++ has manual memory management with zero GC pauses. For a gateway where p99 latency matters, GC pauses are a real problem.

**True parallelism** — Go has goroutines that run on multiple OS threads. One Go gateway process can use all 32 cores of a server simultaneously. Node's event loop runs on one core (you can cluster, but it's one event loop per process, not true shared-memory parallelism).

**Why Node is still valid**

For a startup handling 0-10 million requests per day, Node is perfectly fine. The engineering productivity of TypeScript/Node far outweighs the performance gap. You iterate faster, hire easier, debug faster.

This project is a learning exercise and a portfolio piece. In that context, Node is the right choice. The answer in an interview: "Node is appropriate for this scale. At 10x this scale I'd evaluate Go. At 100x I'd look at Envoy or a custom C++ solution."

---

## 15. Interview Questions

**Q: What is the purpose of the `x-user-id` header you forward to upstreams?**

A: After the gateway verifies the JWT, it knows the user ID. Instead of making every upstream service also verify the JWT (duplicate work, they'd all need the secret key), the gateway forwards the trusted user ID as `x-user-id`. Upstream services trust this header because only the gateway (which they trust) can set it. This is called "identity propagation."

**Q: What happens if Redis goes down?**

A: Currently the gateway would fail on every rate limit check and cache operation. In production you'd add a fallback — if Redis is unreachable, fail open (allow requests through without rate limiting) or fail closed (reject all requests). Which you choose depends on your security vs availability tradeoff. The right answer is usually fail open with an alert — better to let traffic through than to take down your entire gateway because Redis had a blip.

**Q: Your circuit breaker state isn't shared across instances — is that a problem?**

A: It's a known tradeoff. Each instance self-heals independently — after 5 failures its own circuit opens. In the worst case, with 3 instances, a dead upstream gets 15 requests (5 per instance) before all circuits open. That's acceptable. Sharing circuit state via Redis adds complexity and a Redis dependency to the critical path. The simpler per-instance approach is usually preferred unless you have very strict requirements.

**Q: How would you handle WebSocket connections?**

A: The current implementation doesn't support WebSockets. undici handles HTTP/1.1 and HTTP/2. For WebSockets you'd need to proxy the upgrade request and maintain the persistent connection. Fastify has a `@fastify/websocket` plugin. This would be a Phase 4 feature.

**Q: What's the difference between authentication and authorization?**

A: Authentication = who are you? (JWT verification, API key lookup). Authorization = what are you allowed to do? (RBAC role check). Your gateway does both. Auth middleware answers "is this a valid user", RBAC middleware answers "is this user allowed on this route."

**Q: Why does the cache perform worse than direct proxying in your benchmarks?**

A: Because the upstream mock service runs on localhost with no real processing — it responds in ~1ms. Redis also runs on localhost. So a cache hit costs: Redis network round trip (~0.5ms). A cache miss costs: Redis lookup (miss, ~0.5ms) + upstream call (~1ms). For a real upstream doing DB queries (~10-50ms), caching would show a massive improvement. The benchmark result is a function of the test environment, not a flaw in the caching logic.

**Q: How would you add a new route without any downtime?**

A: Insert a row into the `routes` table in Postgres with `enabled = true`. The gateway's background `setInterval` refreshes the route cache every 30 seconds. Within 30 seconds all instances pick up the new route. Zero restarts, zero downtime.

**Q: What would you add to make this production-ready?**

Honest list:
1. HTTPS/TLS termination
2. Helmet headers (security headers)
3. Request ID tracing (generate `x-request-id`, forward to upstreams, log it everywhere)
4. Graceful shutdown (drain in-flight requests before stopping)
5. Redis fallback when Redis is down
6. Automated tests (unit + integration)
7. Real user management (bcrypt passwords, DB-backed users, not hardcoded)
8. Key rotation for API keys
9. Distributed tracing (OpenTelemetry)
10. Alerting on Prometheus metrics (PagerDuty/Grafana alerts when error rate spikes)
