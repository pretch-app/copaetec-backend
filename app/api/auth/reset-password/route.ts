import { hashPassword } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getClientIp, validateRequestOrigin } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"
import { MIN_PASSWORD_LENGTH, resetPasswordWithToken } from "@/lib/password-reset"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  const originError = validateRequestOrigin(request)
  if (originError) return originError

  const ip = await getClientIp(request)
  const rl = checkRateLimit(`reset-password:${ip}`, 10, 60 * 60 * 1000) // 10 por hora por IP
  if (!rl.allowed) return jsonCors(request, { error: "Demasiados intentos. Intenta más tarde." }, 429)

  const body = await request.json().catch(() => ({}))
  const token = String(body.token ?? "")
  const password = String(body.password ?? "")
  const confirmPassword = String(body.confirmPassword ?? "")

  if (!token) return jsonCors(request, { error: "Falta el link de recuperación" }, 400)
  if (password.length < MIN_PASSWORD_LENGTH) {
    return jsonCors(request, { error: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres` }, 400)
  }
  if (password !== confirmPassword) return jsonCors(request, { error: "Las contraseñas no coinciden" }, 400)

  try {
    const userId = await resetPasswordWithToken(token, hashPassword(password))
    if (!userId) {
      return jsonCors(
        request,
        { error: "El link venció o ya se usó. Pedí uno nuevo.", code: "INVALID_RESET_TOKEN" },
        400,
      )
    }
    return jsonCors(request, { success: true })
  } catch (err) {
    console.error("[Reset Password Error]:", err)
    return jsonCors(request, { error: "No pudimos cambiar la contraseña. Intenta de nuevo más tarde." }, 500)
  }
}
