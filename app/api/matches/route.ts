import { sql } from "@/lib/db"
import { getMatches } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr, validateRequestOrigin } from "@/lib/api-helpers"

const VALID_STAGES = ["group", "round_of_16", "quarter_finals", "semi_finals", "final"]

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const matches = await getMatches()
    return jsonCors(request, matches)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function POST(request: Request) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const body = await request.json()
    const homeId = toInt(body.home_team_id)
    const awayId = toInt(body.away_team_id)
    const matchday = toInt(body.matchday) ?? 1
    const stage = toStr(body.stage) ?? "group"
    if (!VALID_STAGES.includes(stage)) return jsonCors(request, { error: "Fase inválida" }, 400)
    if (!homeId || !awayId || homeId === awayId) return jsonCors(request, { error: "Equipos inválidos" }, 400)

    let kickoff = toStr(body.kickoff)
    if (kickoff && kickoff.length === 16) kickoff += "-03:00"

    await sql`
      INSERT INTO matches (matchday, kickoff, venue, home_team_id, away_team_id, status, stage)
      VALUES (${matchday}, ${kickoff}, ${toStr(body.venue)}, ${homeId}, ${awayId}, 'scheduled', ${stage})
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
