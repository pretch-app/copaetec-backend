import { sql } from "@/lib/db"
import { getMatchById } from "@/lib/queries"
import { requireUser } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getClientIp, handleApiError, validateRequestOrigin } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    const user = await requireUser()

    const ip = await getClientIp(request)
    const rl = checkRateLimit(`predict:${user.id}:${ip}`, 10, 60 * 1000)
    if (!rl.allowed) return jsonCors(request, { error: "Demasiadas solicitudes. Espera un minuto." }, 429)

    const body = await request.json()
    const matchId = Number(body.match_id)
    const predictedHome = Number(body.predicted_home)
    const predictedAway = Number(body.predicted_away)

    if (isNaN(matchId) || isNaN(predictedHome) || isNaN(predictedAway)) {
      return jsonCors(request, { error: "Datos inválidos" }, 400)
    }
    if (predictedHome < 0 || predictedHome > 99 || predictedAway < 0 || predictedAway > 99) {
      return jsonCors(request, { error: "Resultados fuera de rango (0-99)" }, 400)
    }

    const match = await getMatchById(matchId)
    if (!match) return jsonCors(request, { error: "Partido no encontrado" }, 404)
    if (match.status === "finished") return jsonCors(request, { error: "El partido ya terminó" }, 400)

    if (match.kickoff) {
      const kickoffTime = new Date(match.kickoff).getTime()
      if (Date.now() >= kickoffTime) {
        return jsonCors(request, { error: "Las predicciones para este partido ya cerraron" }, 400)
      }
    }

    await sql`
      INSERT INTO predictions (user_id, match_id, predicted_home, predicted_away, updated_at)
      VALUES (${user.id}, ${matchId}, ${predictedHome}, ${predictedAway}, NOW())
      ON CONFLICT (user_id, match_id)
      DO UPDATE SET
        predicted_home = EXCLUDED.predicted_home,
        predicted_away = EXCLUDED.predicted_away,
        updated_at = NOW()
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
