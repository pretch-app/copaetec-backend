import { neon } from "@neondatabase/serverless"

// Run this script using: npx tsx scripts/migrate-events.ts
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is missing")
  }

  const sql = neon(url)

  console.log("Iniciando migración del sistema de eventos unificado...")

  // 1. Añadir columnas a `matches`
  console.log("Añadiendo columnas extras a matches...")
  try {
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_penalties INTEGER`
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_penalties INTEGER`
    await sql`ALTER TABLE matches ADD COLUMN IF NOT EXISTS is_extra_time BOOLEAN DEFAULT FALSE`
  } catch (e) {
    console.log("Las columnas ya existen o hubo un error:", e)
  }

  // 2. Crear tabla `match_events`
  console.log("Creando tabla match_events...")
  await sql`
    CREATE TABLE IF NOT EXISTS match_events (
      id SERIAL PRIMARY KEY,
      match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
      player_name VARCHAR(255) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      minute INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_match_events_team ON match_events(team_id)`

  // 3. Migrar de `goals` a `match_events`
  console.log("Migrando goles antiguos a match_events...")
  const oldGoals = await sql`SELECT * FROM goals`
  
  for (const goal of oldGoals) {
    // Para cada registro en goals, insertamos 'goals_count' eventos individuales
    for (let i = 0; i < goal.goals_count; i++) {
      await sql`
        INSERT INTO match_events (match_id, team_id, player_id, player_name, event_type, minute)
        VALUES (${goal.match_id}, ${goal.team_id}, ${goal.player_id}, ${goal.scorer_name}, 'goal', NULL)
      `
    }
  }

  console.log(`Se migraron ${oldGoals.length} registros de goles (multiplicados por su cantidad).`)

  console.log("Migración completada con éxito.")
}

main().catch(console.error)
