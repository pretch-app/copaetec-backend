import { neon } from "@neondatabase/serverless"

// Run this script using: export $(cat .env.development.local | grep -v '^#' | xargs) && npx -y tsx scripts/migrate-settings.ts
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is missing")
  }

  const sql = neon(url)

  console.log("Añadiendo configuraciones de duración y reglas a tournament_settings...")

  try {
    await sql`ALTER TABLE tournament_settings ADD COLUMN IF NOT EXISTS match_duration INTEGER DEFAULT 90`
    await sql`ALTER TABLE tournament_settings ADD COLUMN IF NOT EXISTS group_tiebreaker VARCHAR(50) DEFAULT 'none'`
    await sql`ALTER TABLE tournament_settings ADD COLUMN IF NOT EXISTS knockout_tiebreaker VARCHAR(50) DEFAULT 'penalties'`
    console.log("Columnas agregadas con éxito.")
  } catch (e) {
    console.error("Error al agregar columnas:", e)
  }
}

main().catch(console.error)
