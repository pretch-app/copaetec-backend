import { jsonCors } from "./cors"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function handleApiError(request: Request, err: unknown) {
  if (err instanceof ApiError) {
    return jsonCors(request, { error: err.message }, err.status)
  }
  if (err instanceof Error) {
    if (err.message === "No autorizado") return jsonCors(request, { error: err.message }, 401)
    if (err.message.startsWith("Acceso denegado")) return jsonCors(request, { error: err.message }, 403)
    console.error(err)
    return jsonCors(request, { error: "Error interno" }, 500)
  }
  console.error(err)
  return jsonCors(request, { error: "Error interno" }, 500)
}

export function toInt(value: FormDataEntryValue | string | null): number | null {
  if (value === null || value === "") return null
  const text = String(value).trim()
  if (!/^-?\d+$/.test(text)) return null
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : null
}

export function toBool(value: unknown): boolean | null {
  if (value === true || value === "true") return true
  if (value === false || value === "false") return false
  return null
}

export function toStr(value: FormDataEntryValue | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === "" ? null : s
}

export async function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return request.headers.get("x-real-ip")?.trim() || forwardedFor || "unknown"
}

export function validateRequestOrigin(request: Request) {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
  const requestOrigin = new URL(request.url).origin
  const origin = request.headers.get("origin")

  if (origin && (origin === requestOrigin || allowedOrigins.includes(origin))) return null

  const referer = request.headers.get("referer")
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      if (refererOrigin === requestOrigin || allowedOrigins.includes(refererOrigin)) return null
    } catch {
      // Treat malformed Referer headers as untrusted.
    }
  }

  return jsonCors(request, { error: "Origen no permitido" }, 403)
}
