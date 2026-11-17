import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  queries: [] as { text: string; values: unknown[] }[],
  respond: (() => []) as (text: string, values: unknown[]) => unknown[],
}))

vi.mock("@/lib/db", () => ({
  sql: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim()
    db.queries.push({ text, values })
    return db.respond(text, values)
  }),
}))

vi.mock("@/lib/auth", () => ({ createUserSession: vi.fn(async () => {}) }))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => ({ oauth_state: { value: "estado" }, oauth_nonce: { value: "nonce" } })[name],
    delete: () => {},
  }),
}))

import { createUserSession } from "@/lib/auth"
import { GET as callback } from "@/app/api/auth/callback/google/route"

const EMAIL = "ana@alumno.etec.um.edu.ar"

function mockGoogle() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ id_token: "id-token", access_token: "access-token" })
      }
      if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
        return Response.json({
          iss: "https://accounts.google.com",
          aud: "client-id",
          email_verified: "true",
          nonce: "nonce",
        })
      }
      return Response.json({ email: EMAIL, name: "Ana" })
    }),
  )
}

function callbackRequest() {
  return new Request("http://localhost:4000/api/auth/callback/google?code=abc&state=estado")
}

function findQuery(fragment: string) {
  return db.queries.find((q) => q.text.includes(fragment))
}

beforeEach(() => {
  db.queries = []
  db.respond = () => []
  process.env.FRONTEND_URL = "http://localhost:3000"
  process.env.GOOGLE_CLIENT_ID = "client-id"
  process.env.GOOGLE_CLIENT_SECRET = "client-secret"
  process.env.ALLOWED_EMAIL_DOMAINS = "alumno.etec.um.edu.ar"
  mockGoogle()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("GET /api/auth/callback/google", () => {
  it("creates a new user already verified, without sending any email", async () => {
    db.respond = (text) => (text.startsWith("INSERT INTO users") ? [{ id: 5, role: "user" }] : [])

    const response = await callback(callbackRequest())

    expect(response.headers.get("location")).toBe("http://localhost:3000/predicciones-etec")
    expect(findQuery("INSERT INTO users")?.text).toContain("NOW()")
    expect(findQuery("email_verification_tokens")).toBeUndefined()
    expect(createUserSession).toHaveBeenCalledWith(5, "user")
  })

  it("keeps the password of an account that was already activated", async () => {
    db.respond = (text) =>
      text.startsWith("SELECT id, role") ? [{ id: 3, role: "user", email_verified_at: new Date() }] : []

    await callback(callbackRequest())

    expect(findQuery("UPDATE users")).toBeUndefined()
    expect(createUserSession).toHaveBeenCalledWith(3, "user")
  })

  it("drops the password of an account that was never activated", async () => {
    db.respond = (text) =>
      text.startsWith("SELECT id, role") ? [{ id: 4, role: "user", email_verified_at: null }] : []

    await callback(callbackRequest())

    const update = findQuery("UPDATE users SET email_verified_at = NOW(), password_hash")
    expect(String(update?.values[0])).toMatch(/^OAUTH:/)
    expect(update?.values[1]).toBe(4)
    expect(findQuery("DELETE FROM email_verification_tokens")?.values).toEqual([4])
    expect(createUserSession).toHaveBeenCalledWith(4, "user")
  })
})
