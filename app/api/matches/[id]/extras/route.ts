import { sql } from "@/lib/db"
import { getMatchById } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { calculateMatchPoints } from "@/lib/predictions"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toBool, toInt, toStr, validateRequestOrigin } from "@/lib/api-helpers"

const VALID_STATUS = ["scheduled", "finished"]

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    const body = await request.json()

    const homePenalties = body.home_penalties !== undefined && body.home_penalties !== null && body.home_penalties !== ""
      ? toInt(body.home_penalties)
      : null
    const awayPenalties = body.away_penalties !== undefined && body.away_penalties !== null && body.away_penalties !== ""
      ? toInt(body.away_penalties)
      : null
    const isExtraTime = body.is_extra_time === undefined ? null : toBool(body.is_extra_time)
    if (body.is_extra_time !== undefined && isExtraTime === null) {
      return jsonCors(request, { error: "Valor inválido para tiempo extra" }, 400)
    }
    const status = body.status === undefined ? null : toStr(body.status)
    if (status !== null && !VALID_STATUS.includes(status)) return jsonCors(request, { error: "Estado inválido" }, 400)

    await sql`
      UPDATE matches
      SET home_penalties = ${homePenalties}, away_penalties = ${awayPenalties},
          is_extra_time = COALESCE(${isExtraTime}, is_extra_time),
          status = COALESCE(${status}, status)
      WHERE id = ${id}
    `

    const updatedMatch = await getMatchById(id)
    if (!updatedMatch) return jsonCors(request, { error: "Partido no encontrado" }, 404)
    if (updatedMatch.status === "finished") {
      await calculateMatchPoints(id).catch(console.error)
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
