import { getUpcomingMatchesForProde } from "@/lib/queries"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const matches = await getUpcomingMatchesForProde()
    return jsonCors(request, matches)
  } catch (err) {
    return handleApiError(request, err)
  }
}
