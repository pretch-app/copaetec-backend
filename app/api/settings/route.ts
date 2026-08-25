import { sql } from "@/lib/db"
import { getTournamentSettings } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const settings = await getTournamentSettings()
    return jsonCors(request, settings)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin()
    const body = await request.json()
    const name = toStr(body.tournament_name) || "Copa ETec 2026"
    const format = toStr(body.format) || "general"
    const knockout_source = toStr(body.knockout_source) || "general"
    const num_teams = toInt(body.num_teams_advancing) || 8
    const match_duration = toInt(body.match_duration) || 90
    const group_tiebreaker = toStr(body.group_tiebreaker) || "none"
    const knockout_tiebreaker = toStr(body.knockout_tiebreaker) || "penalties"

    await sql`
      UPDATE tournament_settings
      SET tournament_name = ${name},
          format = ${format},
          knockout_source = ${knockout_source},
          num_teams_advancing = ${num_teams},
          match_duration = ${match_duration},
          group_tiebreaker = ${group_tiebreaker},
          knockout_tiebreaker = ${knockout_tiebreaker},
          updated_at = NOW()
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
