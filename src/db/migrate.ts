import { db } from "./client.js"
import { routes } from "./schema.js"
import { sql } from "drizzle-orm"

async function migrate() {
    await db.execute(sql`
        CREATE TABLE IF NOT EXISTS routes (
            id          SERIAL PRIMARY KEY,
            path        TEXT NOT NULL UNIQUE,
            upstream    TEXT NOT NULL,
            auth        BOOLEAN NOT NULL DEFAULT true,
            roles       TEXT[] DEFAULT '{}',
            rate_limit  INTEGER,
            enabled     BOOLEAN NOT NULL DEFAULT true
        )
    `)

    // Seed the routes we had hardcoded before
    await db.insert(routes).values([
        { path: "/user",   upstream: "http://localhost:4001", auth: true,  roles: ["admin", "user"] },
        { path: "/order",  upstream: "http://localhost:4002", auth: true,  roles: ["admin", "user"] },
        { path: "/public", upstream: "http://localhost:4003", auth: false, roles: [] },
        { path: "/admin",  upstream: "http://localhost:4005", auth: true,  roles: ["admin"] },
    ]).onConflictDoNothing()

    console.log("Migration done")
    process.exit(0)
}

migrate()