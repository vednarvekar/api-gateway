export interface Route {
    path:       string
    upstream:   string
    auth?:      boolean
    authType?:  'jwt' | 'apikey' | 'any'   // 'any' = accept either
    roles?:     string[]
    rateLimit?: number
}

export interface JwtPayload {
    userId:  string
    role: string
    iat:  number
    exp:  number
}