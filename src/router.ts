
export const routes = [
    { path: "/user", upstream: "http://localhost:3001" },
    { path: "/order", upstream: "http://localhost:3002" }
]

export function matchRoutes(url: string) {
    return routes.find(route => url.startsWith(route.path))
}
