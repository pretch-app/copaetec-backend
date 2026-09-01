import { sql } from "@/lib/db"
import { getAllPlayers } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toInt, toStr, validateRequestOrigin } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const players = await getAllPlayers()
    return jsonCors(request, players)
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
    const teamId = toInt(body.team_id)
    const name = toStr(body.name)
    if (!teamId || !name) return jsonCors(request, { error: "Datos inválidos" }, 400)
    await sql`
      INSERT INTO players (team_id, name, number, position)
      VALUES (${teamId}, ${name}, ${toInt(body.number)}, ${toStr(body.position)})
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
