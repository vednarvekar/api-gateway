import { db } from "./client.js"
import { routes, apiKeys } from "./schema.js"
import { sql } from "drizzle-orm"

async function migrate() {
    await db.execute(sql`DROP TABLE IF EXISTS routes;`)

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS routes (
            id          SERIAL PRIMARY KEY,
            path        TEXT NOT NULL UNIQUE,
            upstream    TEXT NOT NULL,
            auth        BOOLEAN NOT NULL DEFAULT true,
            auth_type   TEXT NOT NULL DEFAULT 'jwt',
            roles       TEXT[] DEFAULT '{}',
            rate_limit  INTEGER,
            enabled     BOOLEAN NOT NULL DEFAULT true
        )
    `)

    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS api_keys (
            id         SERIAL PRIMARY KEY,
            key        TEXT NOT NULL UNIQUE,
            owner      TEXT NOT NULL,
            role       TEXT NOT NULL DEFAULT 'service',
            enabled    BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `)

    await db.insert(routes).values([
        { path: "/user",   upstream: "http://localhost:4001", auth: true,  roles: ["admin", "user"] },
        { path: "/order",  upstream: "http://localhost:4002", auth: true,  roles: ["admin", "user"] },
        { path: "/public", upstream: "http://localhost:4003", auth: false, roles: [] },
        { path: "/admin",  upstream: "http://localhost:4005", auth: true,  roles: ["admin"] },
        { path: "/billing", upstream: "http://localhost:4006", auth: true, authType: "apikey", roles: ["service"] },
    ]).onConflictDoNothing()

    // Seed a test API key
    await db.insert(apiKeys).values([
        { key: "test-api-key-billing-service", owner: "billing-service", role: "service" }
    ]).onConflictDoNothing()

    console.log("Migration done")
    process.exit(0)
}

migrate()