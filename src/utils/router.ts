import type {Route} from "../types/routes.js"

export const routes: Route[] = [
    { path: "/user",   upstream: "http://localhost:4001", auth: true, roles: ["admin", "user"] },
    { path: "/order",  upstream: "http://localhost:4002", auth: true, roles: ["admin", "user"] },
    { path: "/public", upstream: "http://localhost:4003", auth: false },
    { path: "/admin",  upstream: "http://localhost:4005", auth: true, roles: ["admin"] },
]

export function matchRoutes(url: string): Route | undefined {
    return routes.find(route => url.startsWith(route.path))
}
