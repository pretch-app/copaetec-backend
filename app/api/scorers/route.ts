import { getTopScorers } from "@/lib/queries"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Number(searchParams.get("limit")) || 10
    const scorers = await getTopScorers(limit)
    return jsonCors(request, scorers)
  } catch (err) {
    return handleApiError(request, err)
  }
}
