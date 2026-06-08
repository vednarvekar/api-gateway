import jwt from "jsonwebtoken"
import type { JwtPayload } from "../types/routes.js";
import { config } from "./config.js"

export function signToken(paylod: Omit<JwtPayload, 'iat' | 'exp'>): string {
    return jwt.sign(paylod, config.jwtSecret, { expiresIn: '1h' })
}

export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' })
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, config.jwtSecret) as JwtPayload
}