import { sql } from "../lib/db"

async function main() {
  const result = await sql`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'teams'
  `
  console.log(result)
}
main().catch(console.error)
