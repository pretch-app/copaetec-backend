import { sql } from "./db"
import { sendMail } from "./mailer"
import { passwordResetEmail } from "./email-templates"
import { generateVerificationToken, hashVerificationToken } from "./verification"

export const PASSWORD_RESET_TTL_MINUTES = 60
export const MIN_PASSWORD_LENGTH = 6

// El link apunta al frontend, que muestra el formulario y manda el token a /api/auth/reset-password.
export function passwordResetLink(token: string): string {
  const base = process.env.FRONTEND_URL
  if (!base) throw new Error("FRONTEND_URL is not set")
  const url = new URL("/auth/restablecer", base)
  url.searchParams.set("token", token)
  return url.toString()
}

export async function sendPasswordResetEmail(user: { id: number; email: string; display_name: string }): Promise<void> {
  const token = generateVerificationToken()

  // Un solo link vigente por usuario: pedir otro invalida los anteriores.
  await sql`DELETE FROM password_reset_tokens WHERE user_id = ${user.id} AND used_at IS NULL`
  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
    VALUES (${user.id}, ${hashVerificationToken(token)}, NOW() + make_interval(mins => ${PASSWORD_RESET_TTL_MINUTES}))
  `

  await sendMail(
    passwordResetEmail({
      to: user.email,
      name: user.display_name,
      link: passwordResetLink(token),
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    }),
  )
}

// Consume el token y cambia la contraseña en una sola sentencia, así el mismo link no
// sirve dos veces. Abrir el link prueba que el email es de esa persona, por eso también
// activa la cuenta si estaba pendiente. Devuelve el id del usuario o null.
export async function resetPasswordWithToken(token: string, passwordHash: string): Promise<number | null> {
  if (!token) return null
  const rows = await sql`
    WITH consumed AS (
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE token_hash = ${hashVerificationToken(token)}
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id
    )
    UPDATE users
    SET password_hash = ${passwordHash},
        email_verified_at = COALESCE(users.email_verified_at, NOW())
    FROM consumed
    WHERE users.id = consumed.user_id
    RETURNING users.id
  `
  if (rows.length === 0) return null
  const userId = rows[0].id as number
  // Con la cuenta ya activada, los links de activación pendientes no hacen falta.
  await sql`DELETE FROM email_verification_tokens WHERE user_id = ${userId} AND used_at IS NULL`
  return userId
}
