import { sql } from "@/lib/db"
import { getEventsByMatch, getMatchById } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { calculateMatchPoints } from "@/lib/predictions"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr, validateRequestOrigin } from "@/lib/api-helpers"

const VALID_TYPES = ["goal", "penalty_goal", "own_goal", "yellow_card", "red_card", "foul", "shootout_goal", "shootout_miss"]

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const matchId = Number((await params).id)
    const events = await getEventsByMatch(matchId)
    return jsonCors(request, events)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const matchId = Number((await params).id)
    const body = await request.json()
    const teamId = toInt(body.team_id)
    const playerId = toInt(body.player_id) || null
    let playerName = toStr(body.player_name)

    if (!Number.isSafeInteger(matchId) || matchId < 1 || !teamId) {
      return jsonCors(request, { error: "Partido o equipo inválido" }, 400)
    }

    const match = await getMatchById(matchId)
    if (!match) return jsonCors(request, { error: "Partido no encontrado" }, 404)
    if (teamId !== match.home_team_id && teamId !== match.away_team_id) {
      return jsonCors(request, { error: "El equipo no participa en este partido" }, 400)
    }

    if (!playerName && playerId) {
      const playerRows = await sql`SELECT name FROM players WHERE id = ${playerId} AND team_id = ${teamId}`
      if (playerRows.length > 0) playerName = playerRows[0].name
      else return jsonCors(request, { error: "El jugador no pertenece al equipo" }, 400)
    } else if (playerId) {
      const playerRows = await sql`SELECT id FROM players WHERE id = ${playerId} AND team_id = ${teamId}`
      if (playerRows.length === 0) return jsonCors(request, { error: "El jugador no pertenece al equipo" }, 400)
    }

    const eventType = toStr(body.event_type)
    const minute = body.minute !== undefined && body.minute !== null && body.minute !== "" ? toInt(body.minute) : null

    if (
      !playerName ||
      !eventType ||
      (body.minute !== undefined && body.minute !== null && body.minute !== "" &&
        (minute === null || minute < 0 || minute > 150))
    ) {
      return jsonCors(request, { error: "Faltan datos para el evento" }, 400)
    }
    if (!VALID_TYPES.includes(eventType)) {
      return jsonCors(request, { error: "Tipo de evento inválido" }, 400)
    }

    if (["goal", "penalty_goal", "own_goal"].includes(eventType)) {
      const scoringTeamId =
        eventType === "own_goal"
          ? match.home_team_id === teamId
            ? match.away_team_id
            : match.home_team_id
          : teamId

      const homeInc = scoringTeamId === match.home_team_id ? 1 : 0
      const awayInc = scoringTeamId === match.away_team_id ? 1 : 0

      await sql.transaction([
        sql`
          INSERT INTO match_events (match_id, team_id, player_id, player_name, event_type, minute)
          VALUES (${matchId}, ${teamId}, ${playerId}, ${playerName}, ${eventType}, ${minute})
        `,
        sql`
          UPDATE matches
          SET home_score = COALESCE(home_score, 0) + ${homeInc},
              away_score = COALESCE(away_score, 0) + ${awayInc}
          WHERE id = ${matchId}
        `,
      ])
      if (match.status === "finished") {
        await calculateMatchPoints(matchId).catch(console.error)
      }
    } else {
      await sql`
        INSERT INTO match_events (match_id, team_id, player_id, player_name, event_type, minute)
        VALUES (${matchId}, ${teamId}, ${playerId}, ${playerName}, ${eventType}, ${minute})
      `
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
