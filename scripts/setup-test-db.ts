import { neon } from "@neondatabase/serverless"

async function main() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) {
    throw new Error("DATABASE_URL_TEST is missing")
  }

  const sql = neon(url)

  await sql`
    CREATE TABLE IF NOT EXISTS teams (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      captain TEXT,
      grupo TEXT,
      photo_url TEXT,
      escudo_url TEXT
    )
  `

  await sql`
    CREATE TABLE IF NOT EXISTS matches (
      id SERIAL PRIMARY KEY,
      matchday INTEGER NOT NULL DEFAULT 1,
      kickoff TIMESTAMPTZ,
      venue TEXT,
      home_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      away_team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      home_score INTEGER,
      away_score INTEGER,
      status TEXT NOT NULL DEFAULT 'scheduled',
      report TEXT,
      stage TEXT NOT NULL DEFAULT 'group',
      home_penalties INTEGER,
      away_penalties INTEGER,
      is_extra_time BOOLEAN NOT NULL DEFAULT FALSE
    )
  `

  console.log("Integration database schema is ready.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
