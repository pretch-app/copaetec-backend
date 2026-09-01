import { NextResponse } from "next/server"

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
}

function isOriginAllowed(request: Request, origin: string): boolean {
  return origin === new URL(request.url).origin || getAllowedOrigins().includes(origin)
}

function resolveOrigin(request: Request): string | null {
  const origin = request.headers.get("origin") ?? ""
  return isOriginAllowed(request, origin) ? origin : null
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = resolveOrigin(request)
  const headers: Record<string, string> = {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  }
  if (origin) headers["Access-Control-Allow-Origin"] = origin
  return headers
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
  const origin = request.headers.get("origin")
  if (origin && !isOriginAllowed(request, origin)) {
    return new NextResponse(null, { status: 403 })
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
}
