import type {Route} from "../types/routes.js"

export const routes: Route[] = [
    { path: "/user", upstream: "http://localhost:3001", auth: true },
    { path: "/order", upstream: "http://localhost:3002", auth: true  },
    { path: "/public", upstream: "http://localhost:3003", auth: false  }
]

export function matchRoutes(url: string): Route | undefined {
    return routes.find(route => url.startsWith(route.path))
}
