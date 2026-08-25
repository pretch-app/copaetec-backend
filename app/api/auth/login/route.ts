import { sql } from "@/lib/db"
import { verifyPasswordHash, createUserSession } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getClientIp } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  const ip = await getClientIp(request)
  const rl = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000) // 5 intentos cada 15 min
  if (!rl.allowed) return jsonCors(request, { error: "Demasiados intentos. Intenta más tarde." }, 429)

  const body = await request.json().catch(() => ({}))
  const email = String(body.email ?? "").toLowerCase().trim()
  const password = String(body.password ?? "")

  if (!email || !password) return jsonCors(request, { error: "Faltan datos" }, 400)

  try {
    const rows = await sql`SELECT id, password_hash, role FROM users WHERE email = ${email} LIMIT 1`
    const user = rows[0]

    if (!user || !verifyPasswordHash(password, user.password_hash)) {
      return jsonCors(request, { error: "Email o contraseña incorrectos" }, 401)
    }

    await createUserSession(user.id, user.role)
    return jsonCors(request, { success: true })
  } catch (err) {
    console.error("[Login Error]:", err)
    return jsonCors(request, { error: "Error en el servidor. Intenta de nuevo." }, 500)
  }
}
