import { getPredictionsByUser } from "@/lib/queries"
import { requireUser } from "@/lib/auth"
import { handleApiError } from "@/lib/api-helpers"
import { jsonCors, preflight } from "@/lib/cors"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const predictions = await getPredictionsByUser(user.id)
    return jsonCors(request, predictions)
  } catch (err) {
    return handleApiError(request, err)
  }
}
