import { neon } from "@neondatabase/serverless"

// Run this script using: npx tsx scripts/migrate-news.ts
async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is missing")
  }

  const sql = neon(url)

  console.log("Iniciando migración de la tabla de noticias...")

  await sql`
    CREATE TABLE IF NOT EXISTS news (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      image_url TEXT,
      color VARCHAR(50) DEFAULT 'blue',
      author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  console.log("Migración completada con éxito. Tabla 'news' creada.")
}

main().catch(console.error)
