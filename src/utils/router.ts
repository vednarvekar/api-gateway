import type {Route} from "../types/routes.js"

export const routes: Route[] = [
    { path: "/user", upstream: "http://localhost:4001", auth: true },
    { path: "/order", upstream: "http://localhost:4002", auth: true  },
    { path: "/public", upstream: "http://localhost:4003", auth: false  }
]

export function matchRoutes(url: string): Route | undefined {
    return routes.find(route => url.startsWith(route.path))
}
