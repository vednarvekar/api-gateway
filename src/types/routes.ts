export interface Route {
    path: string,
    upstream: string,
    auth?: boolean,
    roles?: string[],
    rateLimit?: number | undefined
}

export interface JwtPayload {
    userId: string,
    role: string,
    iat: number, // issued at
    exp: number  // expiration time
}