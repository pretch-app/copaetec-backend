import { sql } from "@/lib/db"
import { jsonCors, preflight } from "@/lib/cors"

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const matches = await sql`SELECT id, home_score, away_score, status FROM matches`
    return jsonCors(request, matches)
  } catch (e) {
    console.error(e)
    return jsonCors(request, { error: "Failed to fetch live matches" }, 500)
  }
}
