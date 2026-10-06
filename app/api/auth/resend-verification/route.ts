import { sql } from "@/lib/db"
import { checkRateLimit } from "@/lib/rate-limit"
import { getClientIp, validateRequestOrigin } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"
import { sendVerificationEmail } from "@/lib/verification"

// Respuesta única para no revelar si el email está registrado o ya activado.
const GENERIC_RESPONSE = {
  success: true,
  message: "Si el email está registrado y pendiente de activación, te enviamos un nuevo link.",
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
  const rlIp = checkRateLimit(`resend-verification:${ip}`, 5, 60 * 60 * 1000) // 5 por hora por IP
  const rlEmail = checkRateLimit(`resend-verification:${email}`, 3, 60 * 60 * 1000) // 3 por hora por email
  if (!rlIp.allowed || !rlEmail.allowed) {
    return jsonCors(request, { error: "Demasiados reenvíos. Intenta más tarde." }, 429)
  }

  try {
    const rows = await sql`
      SELECT id, email, display_name FROM users
      WHERE email = ${email} AND email_verified_at IS NULL
      LIMIT 1
    `
    const user = rows[0] as { id: number; email: string; display_name: string } | undefined
    if (user) await sendVerificationEmail(request, user)

    return jsonCors(request, GENERIC_RESPONSE)
  } catch (err) {
    console.error("[Resend Verification Error]:", err)
    return jsonCors(request, { error: "No pudimos enviar el correo. Intenta de nuevo más tarde." }, 500)
  }
}
