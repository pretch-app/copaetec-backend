import { destroySession } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  await destroySession()
  return jsonCors(request, { success: true })
}
