import { neon } from "@neondatabase/serverless"

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is missing")
  }
  const sql = neon(url)
  console.log("Adding youtube_id to news table...")
  
  try {
    await sql`ALTER TABLE news ADD COLUMN youtube_id VARCHAR(50);`
    console.log("Column youtube_id added successfully.")
  } catch (error: any) {
    console.error("Error (might already exist):", error.message)
  }
}

main()
