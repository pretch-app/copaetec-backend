import { getAllUsers } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const users = await getAllUsers()
    return jsonCors(request, users)
  } catch (err) {
    return handleApiError(request, err)
  }
}
