import { sql } from "@/lib/db"
import { getTournamentSettings } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr, validateRequestOrigin } from "@/lib/api-helpers"

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
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const body = await request.json()
    const name = toStr(body.tournament_name) || "Copa ETec 2026"
    const format = toStr(body.format) || "general"
    const knockout_source = toStr(body.knockout_source) || "general"
    const numTeams = body.num_teams_advancing === undefined ? 8 : toInt(body.num_teams_advancing)
    const matchDuration = body.match_duration === undefined ? 90 : toInt(body.match_duration)
    const group_tiebreaker = toStr(body.group_tiebreaker) || "none"
    const knockout_tiebreaker = toStr(body.knockout_tiebreaker) || "penalties"

    if (!["general", "groups", "both"].includes(format)) {
      return jsonCors(request, { error: "Formato inválido" }, 400)
    }
    if (!["general", "groups"].includes(knockout_source)) {
      return jsonCors(request, { error: "Origen de eliminación inválido" }, 400)
    }
    if (!["none", "penalties", "extra_time", "extra_time_and_penalties"].includes(group_tiebreaker)) {
      return jsonCors(request, { error: "Desempate de grupos inválido" }, 400)
    }
    if (!["none", "penalties", "extra_time", "extra_time_and_penalties"].includes(knockout_tiebreaker)) {
      return jsonCors(request, { error: "Desempate de eliminación inválido" }, 400)
    }
    if (
      numTeams === null ||
      matchDuration === null ||
      ![2, 4, 8, 16].includes(numTeams) ||
      matchDuration < 1 ||
      matchDuration > 300
    ) {
      return jsonCors(request, { error: "Valores numéricos inválidos" }, 400)
    }

    const updated = await sql`
      UPDATE tournament_settings
      SET tournament_name = ${name},
          format = ${format},
          knockout_source = ${knockout_source},
           num_teams_advancing = ${numTeams},
           match_duration = ${matchDuration},
          group_tiebreaker = ${group_tiebreaker},
          knockout_tiebreaker = ${knockout_tiebreaker},
          updated_at = NOW()
      WHERE id = 1
      RETURNING id
    `
    if (updated.length === 0) return jsonCors(request, { error: "Configuración no encontrada" }, 404)
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
