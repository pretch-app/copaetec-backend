import { sql } from "../lib/db"

async function main() {
  await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS escudo_url TEXT;`
  console.log("Column escudo_url added successfully.")
  process.exit(0)
}
main().catch((err) => {
  console.error(err)
  process.exit(1)
})
