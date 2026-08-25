import { sql } from "@/lib/db"
import { getMatchById } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { calculateMatchPoints } from "@/lib/predictions"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr } from "@/lib/api-helpers"

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
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    const body = await request.json()

    const status = toStr(body.status) || "scheduled"
    if (!VALID_STATUS.includes(status)) return jsonCors(request, { error: "Estado inválido" }, 400)

    let kickoff = toStr(body.kickoff)
    if (kickoff && kickoff.length === 16) kickoff += "-03:00"
    const matchday = toInt(body.matchday)
    const venue = toStr(body.venue)

    await sql`
      UPDATE matches SET
        report = ${toStr(body.report)},
        status = ${status},
        kickoff = COALESCE(${kickoff}, kickoff),
        matchday = COALESCE(${matchday}, matchday),
        venue = COALESCE(${venue}, venue)
      WHERE id = ${id}
    `

    if (status === "finished") {
      await calculateMatchPoints(id).catch(console.error)
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const id = Number((await params).id)
    if (!id) return jsonCors(request, { error: "ID inválido" }, 400)
    await sql`DELETE FROM matches WHERE id = ${id}`
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
