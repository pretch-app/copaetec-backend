import { getPlayersByTeam } from "@/lib/queries"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id)
    const players = await getPlayersByTeam(id)
    return jsonCors(request, players)
  } catch (err) {
    return handleApiError(request, err)
  }
}
