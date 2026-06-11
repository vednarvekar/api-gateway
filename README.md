# NodeJS-API-Gateway

A production-grade API Gateway built with Node.js and TypeScript. Handles authentication, rate limiting, dynamic routing, circuit breaking, caching, and observability — all in a single deployable service.

---

## Benchmark

Tested with [autocannon](https://github.com/mcollina/autocannon) — 100 concurrent connections over 10 seconds.

| Metric | Value |
|---|---|
| Requests/sec | ~3,400 – 3,900 RPS |
| Avg latency | 25 – 29ms |
| P99 latency | ~52ms |
| Total requests (10s) | ~39,000 |

> Tested with Fastify logger disabled. Production numbers with logging enabled will be lower.

---

## Features

### Phase 1 — Core
- **Reverse proxy** — forwards requests to upstream services via `undici`
- **JWT authentication** — verifies access tokens, rejects expired/invalid ones
- **Rate limiting** — per IP and per user, with `X-RateLimit-*` headers
- **Request/response logging** — structured JSON logs via Fastify's built-in pino
- **Centralized error handling** — consistent error shape across all failures
- **Health check** — `GET /health` with uptime and Redis status
- **Timeout handling** — 5s headers timeout, 10s body timeout per upstream request

### Phase 2 — Reliability
- **RBAC** — role-based access control per route (`admin`, `user`, `service`)
- **Dynamic routes** — routes stored in Postgres, cached in memory, refreshed every 30s — no restart needed
- **Distributed rate limiting** — Redis-backed, shared across all instances
- **Circuit breaker** — via `opossum`, opens after 50% failure rate over 5 requests, recovers after 30s

### Phase 3 — Production
- **API key auth** — machine-to-machine auth via `x-api-key` header
- **Prometheus metrics** — `/metrics` endpoint with request counts, durations, cache hits, auth failures, circuit breaker state
- **Redis caching** — GET responses cached for 60s, `X-Cache: HIT/MISS` headers

---

## Architecture

```
Client Request
      │
      ▼
┌─────────────────────────────────────────┐
│           API Gateway (Fastify)          │
│                                         │
│  1. Rate limit (per IP)                 │
│  2. Auth (JWT or API Key)               │
│  3. RBAC (role check)                   │
│  4. Rate limit (per user)               │
│  5. Cache check (GET only)              │
│  6. Circuit breaker + proxy (undici)    │
│  7. Cache response + log + metrics      │
└─────────────────────────────────────────┘
      │
      ▼
 Upstream Services (3001, 3002, ...)
```

**Supporting infrastructure:**
- **Postgres** — route definitions, API keys, user roles
- **Redis** — distributed rate limiting, response cache

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24 + TypeScript |
| HTTP Framework | Fastify |
| Proxy | undici |
| Database | PostgreSQL 16 + Drizzle ORM |
| Cache / Rate limit | Redis 7 + ioredis |
| Circuit breaker | opossum |
| Auth | jsonwebtoken |
| Metrics | prom-client (Prometheus) |
| Containerization | Docker + Docker Compose |

---

## Project Structure

```
src/
├── server.ts                  # Entry point — starts the app
├── app.ts                     # Registers plugins and routes
├── router.ts                  # In-memory route cache, loads from Postgres
├── db/
│   ├── client.ts              # Drizzle + pg pool
│   ├── redis.ts               # ioredis singleton
│   ├── schema.ts              # Drizzle table definitions
│   └── migrate.ts             # Table creation + seed
├── routes/
│   ├── health.ts              # GET /health, GET /metrics, GET /health/circuits
│   ├── auth.ts                # POST /auth/login
│   └── proxy.ts               # Core proxy handler
├── middleware/
│   ├── auth.ts                # JWT verification
│   ├── apiKeysAuth.ts         # API key verification
│   ├── rbac.ts                # Role check
│   ├── rateLimit.ts           # Redis sliding window
│   ├── cache.ts               # Redis GET cache
│   ├── logger.ts              # Request/response logging
│   └── errorHandler.ts        # Centralized error shape
└── utils/
    ├── token.ts               # sign/verify JWT
    ├── circuitBreaker.ts      # opossum, one breaker per upstream
    └── metrics.ts             # prom-client counters/histograms
```

---

## Getting Started

### Prerequisites
- Docker + Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/your-username/api-gateway.git
cd api-gateway
```

Create a `.env` file:

```env
PORT=4004
NODE_ENV=production
JWT_SECRET=your-super-secret-key-min-32-chars
DATABASE_URL=postgres://postgres:mysecretpassword@postgres:5432/gateway_db
REDIS_URL=redis://redis:6379
```

### 2. Start all services

```bash
docker compose up -d --build
```

This starts:
- `server` — the gateway on port 4004
- `postgres` — on port 5432
- `redis` — on port 6379

### 3. Run migrations

```bash
docker exec -it <server-container> npx tsx src/db/migrate.ts
```

Or locally if Node is installed:

```bash
npx tsx src/db/migrate.ts
```

---

## API Reference

### Auth

```http
POST /auth/login
Content-Type: application/json

{ "email": "admin@test.com", "password": "admin123" }
```

Returns `accessToken` and `refreshToken`.

### Proxy Routes (default seeds)

| Path | Upstream | Auth | Roles |
|---|---|---|---|
| `/user` | :4001 | JWT | admin, user |
| `/order` | :4002 | JWT | admin, user |
| `/public` | :4003 | None | — |
| `/admin` | :4005 | JWT | admin |
| `/billing` | :4006 | API Key | service |

### System Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Gateway status + Redis connectivity |
| `GET /health/circuits` | Circuit breaker state per upstream |
| `GET /metrics` | Prometheus metrics |

---

## Dynamic Route Management

Routes live in Postgres. Add a new route without restarting the gateway:

```sql
INSERT INTO routes (path, upstream, auth, auth_type, roles, enabled)
VALUES ('/payments', 'http://payments-service:5000', true, 'jwt', '{admin,user}', true);
```

The gateway picks it up within 30 seconds.

---

## Prometheus Metrics

| Metric | Type | Description |
|---|---|---|
| `gateway_requests_total` | Counter | Total proxied requests, by method/route/status |
| `gateway_request_duration_ms` | Histogram | Request duration in ms |
| `gateway_rate_limit_hits_total` | Counter | Rate limit rejections, by key type |
| `gateway_auth_failures_total` | Counter | Auth failures, by reason and auth type |
| `gateway_cache_hits_total` | Counter | Redis cache hits, by route |
| `gateway_circuit_breaker_state` | Gauge | 0=closed, 1=open, 2=half-open, by upstream |

Scrape endpoint: `GET /metrics`

---

## Rate Limiting

- **Per IP** — 100 requests/minute (default)
- **Per user** — 100 requests/minute (default)
- Both limits are Redis-backed — consistent across multiple gateway instances
- Override per route via the `rate_limit` column in the `routes` table
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Circuit Breaker

Configured via `opossum`:

| Setting | Value |
|---|---|
| Error threshold | 50% failure rate |
| Minimum requests | 5 (before tracking) |
| Open → Half-open | 30 seconds |
| Call timeout | 10 seconds |

States visible at `GET /health/circuits`.

---

## Caching

- Only `GET` requests are cached
- TTL: 60 seconds per route+URL combination
- Cache key: `cache:GET:/path?query`
- `X-Cache: HIT` — served from Redis
- `X-Cache: MISS` — proxied to upstream, response cached

Clear cache:
```bash
docker exec -it gateway_redis redis-cli FLUSHALL
```

---

## Default Test Credentials

| Email | Password | Role |
|---|---|---|
| admin@test.com | admin123 | admin |
| user@test.com | user123 | user |

Test API key: `test-api-key-billing-service` (owner: billing-service, role: service)

> These are for development only. Replace with real user management backed by a database in production.