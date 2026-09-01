import { destroySession } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { validateRequestOrigin } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  const originError = validateRequestOrigin(request)
  if (originError) return originError
  await destroySession()
  return jsonCors(request, { success: true })
}
