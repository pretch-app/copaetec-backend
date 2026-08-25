import { getTeamBySlug } from "@/lib/queries"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const team = await getTeamBySlug(slug)
    if (!team) return jsonCors(request, { error: "Equipo no encontrado" }, 404)
    return jsonCors(request, team)
  } catch (err) {
    return handleApiError(request, err)
  }
}
