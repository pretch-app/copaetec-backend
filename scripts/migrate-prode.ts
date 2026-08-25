import { neon } from "@neondatabase/serverless"
import { randomBytes, scryptSync } from "crypto"

// Run this script using: npx tsx scripts/migrate-prode.ts
// Ensure DATABASE_URL is set in your environment (.env.development.local)

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is missing")
  }

  const sql = neon(url)

  console.log("Creando tablas de usuarios y predicciones...")

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      display_name  TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `

  await sql`
    CREATE TABLE IF NOT EXISTS predictions (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      match_id        INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      predicted_home  INTEGER NOT NULL CHECK (predicted_home >= 0),
      predicted_away  INTEGER NOT NULL CHECK (predicted_away >= 0),
      points_awarded  INTEGER,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
      UNIQUE(user_id, match_id)
    );
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id);
  `

  await sql`
    CREATE INDEX IF NOT EXISTS idx_predictions_match ON predictions(match_id);
  `

  console.log("Tablas creadas con éxito.")

  // Seed the admin user if there is an ADMIN_PASSWORD in the env
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminPassword) {
    console.log("ADMIN_PASSWORD encontrada. Verificando si existe el usuario admin...")
    
    // Hash password using scrypt
    const salt = randomBytes(16).toString('hex')
    const derivedKey = scryptSync(adminPassword, salt, 64).toString('hex')
    const hash = `${salt}:${derivedKey}`

    const existingAdmin = await sql`SELECT id FROM users WHERE email = 'admin@copaetec.com' LIMIT 1`
    
    if (existingAdmin.length === 0) {
      await sql`
        INSERT INTO users (email, display_name, password_hash, role)
        VALUES ('admin@copaetec.com', 'Administrador', ${hash}, 'admin')
      `
      console.log("Usuario admin creado exitosamente (admin@copaetec.com)")
    } else {
      console.log("El usuario admin ya existe.")
    }
  }

  console.log("Migración completada.")
}

main().catch(console.error)
