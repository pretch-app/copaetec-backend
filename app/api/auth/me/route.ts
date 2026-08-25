import { getCurrentUser } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function GET(request: Request) {
  const user = await getCurrentUser()
  return jsonCors(request, { user })
}
