<div align="center">

# ⚡ Node.js API Gateway

**Production-grade reverse proxy built from scratch in TypeScript**

[![Node](https://img.shields.io/badge/Node.js-24-green?style=flat-square&logo=node.js)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Fastify](https://img.shields.io/badge/Fastify-5-black?style=flat-square&logo=fastify)](https://fastify.dev)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?style=flat-square&logo=docker)](https://docker.com)
[![Redis](https://img.shields.io/badge/Redis-7-red?style=flat-square&logo=redis)](https://redis.io)
[![Postgres](https://img.shields.io/badge/PostgreSQL-16-blue?style=flat-square&logo=postgresql)](https://postgresql.org)

</div>

---

## What it does

A single gateway that sits in front of all your backend services and handles everything they shouldn't have to care about — auth, rate limiting, routing, caching, and observability.


### Request Lifecycle Diagram
![API Gateway Flow](./src/docs/gateway-flow.svg)


<!-- ```
Every request goes through:

 Client
   │
   ▼
[Rate Limit: IP]       ──→  429 if exceeded
   │
[Auth: JWT / API Key]  ──→  401 if invalid
   │
[RBAC: Role Check]     ──→  403 if unauthorized
   │
[Rate Limit: User]     ──→  429 if exceeded
   │
[Cache: Redis GET]     ──→  return instantly if HIT
   │
[Circuit Breaker]      ──→  503 if upstream is dead
   │
[Proxy: undici]        ──→  forward to upstream service
   │
[Log + Metrics]        ──→  Prometheus
   │
   ▼
 Response
``` -->

---

## Benchmark

> 100 concurrent connections · rate limiting disabled · single instance on local machine

| Concurrency | RPS | Avg Latency | P99 Latency | Pass Rate |
|---|---|---|---|---|
| 10 users | 2,893 | 2.93ms | 7ms | 100% |
| 50 users | 4,743 | 10.04ms | 17ms | 100% |
| 100 users | 5,782 | 16.78ms | 29ms | 100% |
| 250 users | 6,084 | 40.58ms | 73ms | 100% |

Run the load test yourself:
```bash
RATE_LIMIT_MAX=1000000 npx tsx tests/load-test.ts
```

---

## Stack

| | |
|---|---|
| Framework | Fastify + TypeScript |
| Proxy | undici |
| Auth | jsonwebtoken |
| Database | PostgreSQL 16 + Drizzle ORM |
| Cache + Rate Limit | Redis 7 + ioredis |
| Circuit Breaker | opossum |
| Metrics | prom-client (Prometheus) |
| Containers | Docker Compose |

---

## Features

**Auth**
- JWT — access + refresh tokens, 1h / 7d expiry
- API Key — machine-to-machine via `x-api-key` header
- Per-route auth type: `jwt` | `apikey` | `any`

**Rate Limiting**
- Per IP and per user independently
- Redis-backed — shared across all instances, no bypass possible
- Per-route override via DB column
- `X-RateLimit-Limit / Remaining / Reset` headers on every response

**RBAC**
- Role embedded in JWT payload (`admin`, `user`, `service`)
- Roles array per route in DB
- 401 for bad auth · 403 for wrong role

**Dynamic Routing**
- Routes stored in Postgres, not in code
- In-memory cache, refreshed every 30s — zero DB calls per request
- Add a route with a SQL insert, live in under 30 seconds, no restart

**Circuit Breaker**
- One breaker per upstream URL
- Opens after 50% failure rate over minimum 5 requests
- Instant 503 while open — no hanging connections
- Half-open after 30s, closes on success

**Caching**
- GET requests only · 200 responses only · 60s TTL
- `X-Cache: HIT` / `X-Cache: MISS` on every response

**Observability**
- `GET /health` — uptime, Redis connectivity
- `GET /health/circuits` — circuit breaker state per upstream
- `GET /metrics` — Prometheus scrape endpoint

| Metric | Type | Tracks |
|---|---|---|
| `gateway_requests_total` | Counter | method, route, status code |
| `gateway_request_duration_ms` | Histogram | latency distribution |
| `gateway_rate_limit_hits_total` | Counter | IP or user key type |
| `gateway_auth_failures_total` | Counter | reason + auth type |
| `gateway_cache_hits_total` | Counter | by route |
| `gateway_circuit_breaker_state` | Gauge | 0=closed 1=open 2=half-open |

---

## Quick Start

```bash
git clone https://github.com/your-username/api-gateway.git
cd api-gateway
```

Create `.env`:
```env
PORT=4004
JWT_SECRET=your-secret-min-32-chars
DATABASE_URL=postgres://postgres:mysecretpassword@postgres:5432/gateway_db
REDIS_URL=redis://redis:6379
NODE_ENV=production
```

Start everything:
```bash
docker compose up -d --build
npx tsx src/db/migrate.ts
```

Test it:
```bash
# Login
curl -X POST http://localhost:4004/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"admin123"}'

# Hit a protected route
curl http://localhost:4004/user/profile \
  -H "Authorization: Bearer <token>"

# Health check
curl http://localhost:4004/health
```

---

## Project Structure

```
src/
├── server.ts               entry point
├── app.ts                  register routes + plugins
├── router.ts               in-memory route cache from Postgres
├── db/
│   ├── client.ts           Drizzle + pg pool
│   ├── redis.ts            ioredis singleton
│   ├── schema.ts           table definitions
│   └── migrate.ts          migrations + seed
├── routes/
│   ├── health.ts           /health  /metrics  /health/circuits
│   ├── auth.ts             POST /auth/login
│   └── proxy.ts            core proxy handler
├── middleware/
│   ├── auth.ts             JWT verify
│   ├── apiKeysAuth.ts      API key verify
│   ├── rbac.ts             role check
│   ├── rateLimit.ts        Redis sliding window
│   ├── cache.ts            Redis GET cache
│   ├── logger.ts           structured logging
│   └── errorHandler.ts     centralized error shape
└── utils/
    ├── token.ts            sign + verify JWT
    ├── circuitBreaker.ts   opossum, one breaker per upstream
    └── metrics.ts          prom-client metric definitions
```

---

## Managing Routes

Routes live in Postgres. No code changes, no restarts.

```sql
-- Add a route
INSERT INTO routes (path, upstream, auth, auth_type, roles, enabled)
VALUES ('/payments', 'http://payments-svc:5000', true, 'jwt', '{admin,user}', true);

-- Disable a route instantly
UPDATE routes SET enabled = false WHERE path = '/payments';

-- API-key protected internal route
INSERT INTO routes (path, upstream, auth, auth_type, roles, enabled)
VALUES ('/internal', 'http://internal-svc:6000', true, 'apikey', '{service}', true);
```

Gateway picks it up within 30 seconds.

---

## Default Dev Credentials

| Email | Password | Role |
|---|---|---|
| admin@test.com | admin123 | admin |
| user@test.com | user123 | user |

API Key: `test-api-key-billing-service`

> Dev only. Replace with real DB-backed user management before any production use.





































<!-- # NodeJS-API-Gateway

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

> These are for development only. Replace with real user management backed by a database in production. -->