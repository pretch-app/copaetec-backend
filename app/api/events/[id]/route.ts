import { sql } from "@/lib/db"
import { getMatchById } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { calculateMatchPoints } from "@/lib/predictions"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)

    const events = await sql`SELECT * FROM match_events WHERE id = ${id} LIMIT 1`
    const event = events[0]
    if (!event) return jsonCors(request, { error: "Evento no encontrado" }, 404)

    await sql`DELETE FROM match_events WHERE id = ${id}`

    if (["goal", "penalty_goal", "own_goal"].includes(event.event_type)) {
      const match = await getMatchById(event.match_id)
      if (match) {
        const scoringTeamId =
          event.event_type === "own_goal"
            ? match.home_team_id === event.team_id
              ? match.away_team_id
              : match.home_team_id
            : event.team_id

        const homeDec = scoringTeamId === match.home_team_id ? 1 : 0
        const awayDec = scoringTeamId === match.away_team_id ? 1 : 0

        await sql`
          UPDATE matches
          SET home_score = GREATEST(COALESCE(home_score, 0) - ${homeDec}, 0),
              away_score = GREATEST(COALESCE(away_score, 0) - ${awayDec}, 0)
          WHERE id = ${match.id}
        `
        if (match.status === "finished") {
          await calculateMatchPoints(match.id).catch(console.error)
        }
      }
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
