import { cookies } from "next/headers"
import { createHmac, timingSafeEqual, randomBytes, scryptSync } from "crypto"
import { sql } from "./db"
import type { User } from "./types"

const COOKIE_NAME = "etec_session"
const SESSION_DURATION_SECONDS = 60 * 60 * 24 // 24 horas
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set. This is required for secure authentication.")
  }
  return secret
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const derivedKey = scryptSync(password, salt, 64).toString("hex")
  return `${salt}:${derivedKey}`
}

export function verifyPasswordHash(password: string, hash: string): boolean {
  const [salt, key] = hash.split(":")
  if (!salt || !key) return false
  const derivedKey = scryptSync(password, salt, 64)
  const expectedKey = Buffer.from(key, "hex")
  if (derivedKey.length !== expectedKey.length) return false
  return timingSafeEqual(derivedKey, expectedKey)
}

function base64urlEncode(str: string | Buffer): string {
  const buf = typeof str === "string" ? Buffer.from(str) : str
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function signJWT(payload: object): string {
  const header = base64urlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payloadStr = base64urlEncode(JSON.stringify(payload))
  const signature = createHmac("sha256", getJwtSecret())
    .update(`${header}.${payloadStr}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
  return `${header}.${payloadStr}.${signature}`
}

function verifyJWT(token: string): { userId: number; role: string; exp: number } | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [header, payloadStr, signature] = parts
  const expectedSignature = createHmac("sha256", getJwtSecret())
    .update(`${header}.${payloadStr}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
  
  const a = Buffer.from(signature)
  const b = Buffer.from(expectedSignature)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(Buffer.from(payloadStr.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString())
    if (
      !Number.isSafeInteger(payload.userId) ||
      payload.userId < 1 ||
      typeof payload.role !== "string" ||
      !Number.isSafeInteger(payload.exp) ||
      Date.now() >= payload.exp
    ) {
      return null
    }
    return payload as { userId: number; role: string; exp: number }
  } catch {
    return null
  }
}

export async function createUserSession(userId: number, role: string) {
  const store = await cookies()
  const exp = Date.now() + SESSION_DURATION_SECONDS * 1000
  const token = signJWT({ userId, role, exp })
  
  // El backend y el frontend viven en dominios/proyectos distintos (Vercel separados),
  // por lo que la cookie siempre es cross-origin: SameSite=None + Secure en producción.
  // En local (http://localhost) los navegadores igual la envían entre puertos porque
  // "site" no incluye el puerto, así que "lax" alcanza para desarrollo.
  const crossOrigin = process.env.NODE_ENV === "production"
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: crossOrigin ? "none" : "lax",
    secure: crossOrigin,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  })
}

export async function destroySession() {
  const store = await cookies()
  store.delete(COOKIE_NAME)
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies()
  const token = store.get(COOKIE_NAME)?.value
  if (!token) return null
  
  const payload = verifyJWT(token)
  if (!payload) return null
  
  const rows = await sql`SELECT id, email, display_name, role, created_at FROM users WHERE id = ${payload.userId} LIMIT 1`
  if (rows.length === 0) return null
  return rows[0] as User
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) throw new Error("No autorizado")
  return user
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser()
  if (!user || user.role !== "admin") throw new Error("Acceso denegado: Se requiere rol de administrador")
  return user
}

// Para retrocompatibilidad temporal (hasta que quitemos loginAction de admin)
export async function isAuthenticated(): Promise<boolean> {
  return (await getCurrentUser()) !== null
}
export function verifyPassword(input: string): boolean {
  return false
}
