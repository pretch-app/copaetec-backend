import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth"
import { calculateMatchPoints } from "@/lib/predictions"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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
    const isExtraTime = Boolean(body.is_extra_time)

    await sql`
      UPDATE matches
      SET home_penalties = ${homePenalties}, away_penalties = ${awayPenalties}, is_extra_time = ${isExtraTime}
      WHERE id = ${id}
    `

    const status = toStr(body.status) || "scheduled"
    if (status === "finished") {
      await calculateMatchPoints(id).catch(console.error)
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
