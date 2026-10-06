import { neon } from "@neondatabase/serverless"

// Run this script using: npx tsx scripts/migrate-email-verification.ts
// Ensure DATABASE_URL is set in your environment (.env.development.local)
// Requiere que exista la tabla users (scripts/migrate-prode.ts). Es idempotente.
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is missing")
  }

  const sql = neon(url)

  console.log("Agregando verificación de email a users...")

  const columns = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified_at'
  `
  const columnIsNew = columns.length === 0

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`

  // Las cuentas creadas antes de esta migración ya venían usándose: se dan por verificadas.
  // Solo se hace la primera vez, para no activar cuentas pendientes si se vuelve a correr.
  if (columnIsNew) {
    const updated = await sql`
      UPDATE users SET email_verified_at = created_at
      WHERE email_verified_at IS NULL
      RETURNING id
    `
    console.log(`${updated.length} usuarios existentes marcados como verificados.`)
  }

  await sql`
    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
    ON email_verification_tokens(user_id)
  `

  // El admin se sembraba con un dominio (.com) que no existe; se pasa al real.
  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@copaetec.online").toLowerCase().trim()
  const renamed = await sql`
    UPDATE users SET email = ${adminEmail}
    WHERE email = 'admin@copaetec.com'
      AND NOT EXISTS (SELECT 1 FROM users WHERE email = ${adminEmail})
    RETURNING id
  `
  if (renamed.length > 0) console.log(`Admin renombrado: admin@copaetec.com -> ${adminEmail}`)

  console.log("Migración completada.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
