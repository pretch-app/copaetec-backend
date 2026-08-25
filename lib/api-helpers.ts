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
    return jsonCors(request, { error: err.message || "Error interno" }, 500)
  }
  console.error(err)
  return jsonCors(request, { error: "Error interno" }, 500)
}

export function toInt(value: FormDataEntryValue | string | null): number | null {
  if (value === null || value === "") return null
  const n = Number.parseInt(String(value), 10)
  return Number.isNaN(n) ? null : n
}

export function toStr(value: FormDataEntryValue | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s === "" ? null : s
}

export async function getClientIp(request: Request) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for") || "unknown"
}
