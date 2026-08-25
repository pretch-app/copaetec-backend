import { sql } from "@/lib/db"
import { getTeams } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toStr } from "@/lib/api-helpers"
import { slugify } from "@/lib/slugify"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const teams = await getTeams()
    return jsonCors(request, teams)
  } catch (err) {
    return handleApiError(request, err)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const body = await request.json()
    const name = toStr(body.name)
    if (!name) return jsonCors(request, { error: "El nombre es obligatorio" }, 400)
    const slug = slugify(name)
    await sql`
      INSERT INTO teams (name, slug, captain, grupo)
      VALUES (${name}, ${slug}, ${toStr(body.captain)}, ${toStr(body.grupo)})
      ON CONFLICT (slug) DO NOTHING
    `
    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
