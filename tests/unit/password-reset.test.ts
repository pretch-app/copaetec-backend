import { beforeEach, describe, expect, it, vi } from "vitest"

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

vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn(async () => {}) }))

import { sendMail } from "@/lib/mailer"
import { verifyPasswordHash } from "@/lib/auth"
import { passwordResetEmail } from "@/lib/email-templates"
import { hashVerificationToken } from "@/lib/verification"
import { passwordResetLink } from "@/lib/password-reset"
import { POST as forgot } from "@/app/api/auth/forgot-password/route"
import { POST as reset } from "@/app/api/auth/reset-password/route"

let ipCounter = 0

function jsonRequest(path: string, body: unknown) {
  ipCounter += 1
  return new Request(`http://localhost:4000${path}`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "x-real-ip": `10.1.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}

function findQuery(fragment: string) {
  return db.queries.find((q) => q.text.includes(fragment))
}

beforeEach(() => {
  db.queries = []
  db.respond = () => []
  process.env.ALLOWED_ORIGINS = "http://localhost:3000"
  process.env.FRONTEND_URL = "http://localhost:3000"
})

describe("password reset email", () => {
  it("points to the frontend form and escapes the name", () => {
    const link = passwordResetLink("abc_123")
    expect(link).toBe("http://localhost:3000/auth/restablecer?token=abc_123")

    const mail = passwordResetEmail({ to: "a@b.c", name: "<Ana>", link, expiresInMinutes: 60 })
    expect(mail.html).toContain("&lt;Ana&gt;")
    expect(mail.html).not.toContain("<Ana>")
    expect(mail.text).toContain(link)
    expect(mail.text).toContain("60 minutos")
  })
})

describe("POST /api/auth/forgot-password", () => {
  const user = { id: 9, email: "ana@alumno.etec.um.edu.ar", display_name: "Ana" }

  it("emails a reset link and stores only the token hash", async () => {
    db.respond = (text) => (text.startsWith("SELECT id, email, display_name FROM users") ? [user] : [])

    const response = await forgot(jsonRequest("/api/auth/forgot-password", { email: "ANA@alumno.etec.um.edu.ar" }))

    expect(response.status).toBe(200)
    expect(findQuery("SELECT id, email")?.values).toEqual(["ana@alumno.etec.um.edu.ar"])
    expect(findQuery("DELETE FROM password_reset_tokens")?.values).toEqual([9])

    const mail = vi.mocked(sendMail).mock.calls[0][0]
    expect(mail.to).toBe(user.email)
    const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!
    const insert = findQuery("INSERT INTO password_reset_tokens")
    expect(insert?.values[0]).toBe(9)
    expect(insert?.values[1]).toBe(hashVerificationToken(token))
  })

  it("answers the same for an unknown email without sending anything", async () => {
    const known = await forgot(jsonRequest("/api/auth/forgot-password", { email: "x@alumno.etec.um.edu.ar" }))
    expect(known.status).toBe(200)
    expect(await known.json()).toMatchObject({ success: true })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("limits requests per email", async () => {
    const email = "limite@alumno.etec.um.edu.ar"
    for (let i = 0; i < 3; i += 1) {
      expect((await forgot(jsonRequest("/api/auth/forgot-password", { email }))).status).toBe(200)
    }
    expect((await forgot(jsonRequest("/api/auth/forgot-password", { email }))).status).toBe(429)
  })

  it("rejects requests from other origins", async () => {
    const request = new Request("http://localhost:4000/api/auth/forgot-password", {
      method: "POST",
      headers: { Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ email: "ana@alumno.etec.um.edu.ar" }),
    })
    expect((await forgot(request)).status).toBe(403)
  })
})

describe("POST /api/auth/reset-password", () => {
  const body = { token: "token-del-correo", password: "nueva-clave", confirmPassword: "nueva-clave" }

  it("changes the password, activates the account and clears pending activation links", async () => {
    db.respond = (text) => (text.startsWith("WITH consumed") ? [{ id: 9 }] : [])

    const response = await reset(jsonRequest("/api/auth/reset-password", body))

    expect(response.status).toBe(200)
    const update = findQuery("WITH consumed")
    expect(update?.values[0]).toBe(hashVerificationToken("token-del-correo"))
    expect(verifyPasswordHash("nueva-clave", String(update?.values[1]))).toBe(true)
    expect(update?.text).toContain("COALESCE(users.email_verified_at, NOW())")
    expect(findQuery("DELETE FROM email_verification_tokens")?.values).toEqual([9])
  })

  it("rejects an expired, used or unknown link", async () => {
    const response = await reset(jsonRequest("/api/auth/reset-password", body))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "INVALID_RESET_TOKEN" })
  })

  it("validates the new password before touching the database", async () => {
    const short = await reset(jsonRequest("/api/auth/reset-password", { ...body, password: "123", confirmPassword: "123" }))
    expect(short.status).toBe(400)
    const mismatch = await reset(jsonRequest("/api/auth/reset-password", { ...body, confirmPassword: "otra-clave" }))
    expect(mismatch.status).toBe(400)
    const noToken = await reset(jsonRequest("/api/auth/reset-password", { ...body, token: "" }))
    expect(noToken.status).toBe(400)
    expect(db.queries).toHaveLength(0)
  })
})
