import { eq } from "drizzle-orm"
import { db } from "./db/client.js"
import { routes as routesTable} from "./db/schema.js"
import type {Route} from "./types/routes.js"

let cachedRoutes: Route[] = []
let lastRefreshed = 0
const CACHE_TTL = 30_000 // refrest every 30s

async function loadRoutes(): Promise<void> {
    const rows = await db
        .select()
        .from(routesTable)
        .where(eq(routesTable.enabled, true))

    cachedRoutes = rows.map(r => ({
        path:       r.path,
        upstream:   r.upstream,
        auth:       r.auth,
        roles:      r.roles ?? [],
        rateLimit:  r.rateLimit ?? undefined,
    }))
}

export async function initRouter(): Promise<void> {
    await loadRoutes()
    // Background refresh every 30s
    setInterval(loadRoutes, CACHE_TTL)
}

export function matchRoute(pathname: string): Route | undefined {
    return cachedRoutes.find(r => pathname.startsWith(r.path))
}