import { sql } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { getClientIp, validateRequestOrigin } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"
import { sendPasswordResetEmail } from "@/lib/password-reset"

// Respuesta única para no revelar si el email está registrado.
const GENERIC_RESPONSE = {
  success: true,
  message: "Si el email está registrado, te enviamos un link para elegir una contraseña nueva.",
}

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  const originError = validateRequestOrigin(request)
  if (originError) return originError

  const body = await request.json().catch(() => ({}))
  const email = String(body.email ?? "").toLowerCase().trim()
  if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return jsonCors(request, { error: "Email inválido" }, 400)

  const ip = await getClientIp(request)
  const rlIp = checkRateLimit(`forgot-password:${ip}`, 5, 60 * 60 * 1000) // 5 por hora por IP
  const rlEmail = checkRateLimit(`forgot-password:${email}`, 3, 60 * 60 * 1000) // 3 por hora por email
  if (!rlIp.allowed || !rlEmail.allowed) {
    return jsonCors(request, { error: "Demasiados pedidos. Intenta más tarde." }, 429)
  }

  try {
    // Sirve también para cuentas creadas con Google: así pueden sumar una contraseña.
    const rows = await sql`SELECT id, email, display_name FROM users WHERE email = ${email} LIMIT 1`
    const user = rows[0] as { id: number; email: string; display_name: string } | undefined
    if (user) await sendPasswordResetEmail(user)

    return jsonCors(request, GENERIC_RESPONSE)
  } catch (err) {
    console.error("[Forgot Password Error]:", err)
    return jsonCors(request, { error: "No pudimos enviar el correo. Intenta de nuevo más tarde." }, 500)
  }
}
