// Dobles compartidos por los tests unitarios de rutas. Se registran desde cada archivo con
//   vi.mock("@/lib/db", async () => (await import("../helpers/mocks")).dbModule)
//   vi.mock("next/headers", async () => (await import("../helpers/mocks")).headersModule)
// (vi.mock se eleva al inicio del archivo, por eso la fábrica importa este módulo de forma diferida).
import { vi } from "vitest"

export type Query = { text: string; values: unknown[] }
type Responder = (text: string, values: unknown[]) => unknown[]

/** Base de datos falsa: registra cada consulta y responde con `db.respond`. */
export const db = {
  queries: [] as Query[],
  respond: (() => []) as Responder,
}

function run(strings: TemplateStringsArray, values: unknown[]) {
  const text = strings.join("?").replace(/\s+/g, " ").trim()
  db.queries.push({ text, values })
  return Promise.resolve(db.respond(text, values))
}

const sql = Object.assign(
  vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => run(strings, values)),
  { transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)) },
)

export const dbModule = { sql }

/** Cookies del request actual, como las expone `next/headers`. */
export const cookieJar = new Map<string, string>()

export const headersModule = {
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) cookieJar.delete(name)
      else cookieJar.set(name, value)
    },
    delete: (name: string) => cookieJar.delete(name),
  }),
}

export const FRONTEND = "http://localhost:3000"

export function resetMocks() {
  db.queries = []
  db.respond = () => []
  cookieJar.clear()
  process.env.ALLOWED_ORIGINS = FRONTEND
  process.env.FRONTEND_URL = FRONTEND
  process.env.JWT_SECRET = "test-secret"
}

export function findQuery(fragment: string): Query | undefined {
  return db.queries.find((q) => q.text.includes(fragment))
}

export function findQueries(fragment: string): Query[] {
  return db.queries.filter((q) => q.text.includes(fragment))
}

let ipCounter = 0

/** Request desde el frontend permitido, con una IP distinta cada vez (para no chocar con el rate limit). */
export function apiRequest(
  path: string,
  init: { method?: string; body?: unknown; formData?: FormData; origin?: string | null } = {},
) {
  ipCounter += 1
  const headers: Record<string, string> = { "x-real-ip": `10.9.${Math.floor(ipCounter / 250)}.${ipCounter % 250}` }
  if (init.origin !== null) headers.Origin = init.origin ?? FRONTEND
  let body: BodyInit | undefined
  if (init.formData) body = init.formData
  else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json"
    body = JSON.stringify(init.body)
  }
  return new Request(`http://localhost:4000${path}`, { method: init.method ?? "GET", headers, body })
}

/** Params de una ruta dinámica, como los pasa Next (`{ params: Promise<...> }`). */
export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) }
}

export const USER = { id: 3, email: "ana@alumno.etec.um.edu.ar", display_name: "Ana", role: "user", created_at: "2026-08-01" }
export const ADMIN = { id: 1, email: "admin@copaetec.online", display_name: "Administrador", role: "admin", created_at: "2026-08-01" }

/**
 * Inicia sesión como `user` (cookie con un JWT real) y hace que la base lo devuelva al
 * buscarlo por id. `respond` atiende el resto de las consultas.
 */
export async function loginAs(user: typeof USER, respond: Responder = () => []) {
  const { createUserSession } = await import("@/lib/auth")
  await createUserSession(user.id, user.role)
  db.respond = (text, values) =>
    text.startsWith("SELECT id, email, display_name, role, created_at FROM users WHERE id") ? [user] : respond(text, values)
}

/** Body JSON de una respuesta. */
export async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown> & Record<number, unknown>>
}
