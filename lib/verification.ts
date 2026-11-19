import { createHash, randomBytes } from "crypto"
import { sql } from "./db"
import { sendMail } from "./mailer"
import { verificationEmail } from "./email-templates"

export const VERIFICATION_TOKEN_TTL_HOURS = 24

export function generateVerificationToken(): string {
  return randomBytes(32).toString("base64url")
}

// En la base solo se guarda el hash: si se filtra la tabla, los links siguen sin servir.
export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

// Origen público del backend, que es quien atiende el link de activación.
export function publicApiOrigin(request: Request): string {
  if (process.env.API_URL) return process.env.API_URL.replace(/\/+$/, "")
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host")
  if (!host) return new URL(request.url).origin
  const protocol = request.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")
  return `${protocol}://${host}`
}

export async function sendVerificationEmail(
  request: Request,
  user: { id: number; email: string; display_name: string },
): Promise<void> {
  const token = generateVerificationToken()

  // Un solo link vigente por usuario: reenviar invalida los anteriores.
  await sql`DELETE FROM email_verification_tokens WHERE user_id = ${user.id} AND used_at IS NULL`
  await sql`
    INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${hashVerificationToken(token)}, NOW() + make_interval(hours => ${VERIFICATION_TOKEN_TTL_HOURS}))
  `

  const link = `${publicApiOrigin(request)}/api/auth/verify?token=${encodeURIComponent(token)}`
  await sendMail(
    verificationEmail({
      to: user.email,
      name: user.display_name,
      link,
      expiresInHours: VERIFICATION_TOKEN_TTL_HOURS,
    }),
  )
}

// Marca el token como usado y la cuenta como verificada en una sola sentencia,
// así dos clics simultáneos no pueden consumir el mismo token.
export async function consumeVerificationToken(token: string): Promise<boolean> {
  if (!token) return false
  const rows = await sql`
    WITH consumed AS (
      UPDATE email_verification_tokens
      SET used_at = NOW()
      WHERE token_hash = ${hashVerificationToken(token)}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id
    )
    UPDATE users
    SET email_verified_at = COALESCE(users.email_verified_at, NOW())
    FROM consumed
    WHERE users.id = consumed.user_id
    RETURNING users.id
  `
  return rows.length > 0
}
