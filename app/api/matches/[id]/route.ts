import { sql } from "@/lib/db"
import { getMatchById } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { calculateMatchPoints } from "@/lib/predictions"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr, validateRequestOrigin } from "@/lib/api-helpers"

const VALID_STATUS = ["scheduled", "finished"]

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id)
    const match = await getMatchById(id)
    if (!match) return jsonCors(request, { error: "Partido no encontrado" }, 404)
    return jsonCors(request, match)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const id = Number((await params).id)
    if (!Number.isSafeInteger(id) || id < 1) return jsonCors(request, { error: "ID inválido" }, 400)
    const body = await request.json()

    const status = body.status === undefined ? null : toStr(body.status)
    if (status !== null && !VALID_STATUS.includes(status)) return jsonCors(request, { error: "Estado inválido" }, 400)

    let kickoff = toStr(body.kickoff)
    if (kickoff && kickoff.length === 16) kickoff += "-03:00"
    const matchday = toInt(body.matchday)
    const venue = toStr(body.venue)
    const homeScore = body.home_score === undefined ? null : toInt(body.home_score)
    const awayScore = body.away_score === undefined ? null : toInt(body.away_score)
    if (
      (body.home_score !== undefined && (homeScore === null || homeScore < 0 || homeScore > 99)) ||
      (body.away_score !== undefined && (awayScore === null || awayScore < 0 || awayScore > 99))
    ) {
      return jsonCors(request, { error: "Marcador inválido" }, 400)
    }

    await sql`
      UPDATE matches SET
        report = ${toStr(body.report)},
        status = COALESCE(${status}, status),
        kickoff = COALESCE(${kickoff}, kickoff),
        matchday = COALESCE(${matchday}, matchday),
        venue = COALESCE(${venue}, venue),
        home_score = COALESCE(${homeScore}, home_score),
        away_score = COALESCE(${awayScore}, away_score)
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    await sql`DELETE FROM matches WHERE id = ${id}`
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
