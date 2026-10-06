import { sql } from "@/lib/db"
import { hashPassword } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getClientIp, validateRequestOrigin } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"
import { isAllowedEmailDomain } from "@/lib/email"
import { sendVerificationEmail } from "@/lib/verification"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  const originError = validateRequestOrigin(request)
  if (originError) return originError

  const ip = await getClientIp(request)
  const rl = checkRateLimit(`register:${ip}`, 3, 60 * 60 * 1000) // 3 registros por hora
  if (!rl.allowed) return jsonCors(request, { error: "Demasiados registros desde esta IP. Intenta más tarde." }, 429)

  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? "").trim().replace(/[<>]/g, "")
  const email = String(body.email ?? "").toLowerCase().trim()
  const password = String(body.password ?? "")
  const confirmPassword = String(body.confirmPassword ?? "")

  if (!name || name.length < 2) return jsonCors(request, { error: "Nombre muy corto" }, 400)
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return jsonCors(request, { error: "Email inválido" }, 400)

  if (!isAllowedEmailDomain(email)) {
    return jsonCors(request, { error: "Solo se permiten correos institucionales de la ETec/UM" }, 400)
  }

  if (password.length < 6) return jsonCors(request, { error: "La contraseña debe tener al menos 6 caracteres" }, 400)
  if (password !== confirmPassword) return jsonCors(request, { error: "Las contraseñas no coinciden" }, 400)

  try {
    const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`
    if (existing.length > 0) return jsonCors(request, { error: "El email ya está registrado" }, 409)

    const hash = hashPassword(password)

    const inserted = await sql`
      INSERT INTO users (email, display_name, password_hash, role)
      VALUES (${email}, ${name}, ${hash}, 'user')
      RETURNING id, email, display_name
    `
    const user = inserted[0] as { id: number; email: string; display_name: string }

    // La sesión recién se abre al hacer login con la cuenta ya activada.
    try {
      await sendVerificationEmail(request, user)
    } catch (mailErr) {
      // Si el correo no sale, se deshace el alta para que la persona pueda reintentar
      // el registro en vez de quedar con una cuenta que nunca va a poder activar.
      console.error("[Register Mail Error]:", mailErr)
      await sql`DELETE FROM users WHERE id = ${user.id}`
      return jsonCors(request, { error: "No pudimos enviar el correo de activación. Intenta de nuevo más tarde." }, 502)
    }

    return jsonCors(request, { success: true, pendingVerification: true }, 201)
  } catch (err) {
    console.error("[Register Error]:", err)
    return jsonCors(request, { error: "Error al registrar usuario." }, 500)
  }
}
