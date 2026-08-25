import { NextResponse } from "next/server"

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

function resolveOrigin(request: Request): string {
  const origin = request.headers.get("origin") ?? ""
  const allowed = getAllowedOrigins()
  return allowed.includes(origin) ? origin : allowed[0]
}

export function corsHeaders(request: Request): HeadersInit {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(request),
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  }
}

export function withCors(request: Request, response: NextResponse): NextResponse {
  const headers = corsHeaders(request)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value as string)
  }
  return response
}

export function jsonCors(request: Request, body: unknown, init?: number | ResponseInit): NextResponse {
  const response = NextResponse.json(body, typeof init === "number" ? { status: init } : init)
  return withCors(request, response)
}

export function preflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}
