import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"

type Query = { text: string; values: unknown[] }

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

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  createUserSession: vi.fn(async () => {}),
}))

import { sendMail } from "@/lib/mailer"
import { createUserSession, hashPassword } from "@/lib/auth"
import { verificationEmail } from "@/lib/email-templates"
import { generateVerificationToken, hashVerificationToken, publicApiOrigin } from "@/lib/verification"
import { POST as register } from "@/app/api/auth/register/route"
import { POST as login } from "@/app/api/auth/login/route"
import { GET as verify } from "@/app/api/auth/verify/route"
import { POST as resend } from "@/app/api/auth/resend-verification/route"

let ipCounter = 0

function jsonRequest(path: string, body: unknown) {
  ipCounter += 1
  return new Request(`http://localhost:4000${path}`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:3000",
      "Content-Type": "application/json",
      "x-real-ip": `10.0.0.${ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}

function findQuery(fragment: string): Query | undefined {
  return db.queries.find((q) => q.text.includes(fragment))
}

beforeEach(() => {
  db.queries = []
  db.respond = () => []
  process.env.ALLOWED_ORIGINS = "http://localhost:3000"
  process.env.FRONTEND_URL = "http://localhost:3000"
  delete process.env.API_URL
})

describe("verification tokens", () => {
  it("generates random url-safe tokens and stores a stable hash", () => {
    const a = generateVerificationToken()
    const b = generateVerificationToken()

    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(hashVerificationToken(a)).toBe(hashVerificationToken(a))
    expect(hashVerificationToken(a)).not.toContain(a)
  })

  it("builds the link origin from API_URL or the request", () => {
    const request = new Request("http://internal:4000/x", {
      headers: { "x-forwarded-host": "api.copaetec.online", "x-forwarded-proto": "https" },
    })
    expect(publicApiOrigin(request)).toBe("https://api.copaetec.online")

    process.env.API_URL = "https://api.example.test/"
    expect(publicApiOrigin(request)).toBe("https://api.example.test")
  })
})

describe("verification email template", () => {
  it("escapes the user name and includes the link in both versions", () => {
    const mail = verificationEmail({
      to: "ana@etec.um.edu.ar",
      name: "<b>Ana</b>",
      link: "https://api.test/api/auth/verify?token=abc&x=1",
      expiresInHours: 24,
    })

    expect(mail.html).not.toContain("<b>Ana</b>")
    expect(mail.html).toContain("&lt;b&gt;Ana&lt;/b&gt;")
    expect(mail.html).toContain("token=abc&amp;x=1")
    expect(mail.text).toContain("https://api.test/api/auth/verify?token=abc&x=1")
  })
})

describe("mailer without SMTP", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("logs the mail in development and fails in production", async () => {
    const { sendMail: realSendMail } = await vi.importActual<typeof import("@/lib/mailer")>("@/lib/mailer")
    const message = { to: "a@b.c", subject: "s", html: "<p>h</p>", text: "texto" }
    vi.stubEnv("SMTP_HOST", "")
    const info = vi.spyOn(console, "info").mockImplementation(() => {})

    vi.stubEnv("NODE_ENV", "development")
    await realSendMail(message)
    expect(info).toHaveBeenCalledWith(expect.stringContaining("texto"))

    vi.stubEnv("NODE_ENV", "production")
    await expect(realSendMail(message)).rejects.toThrow("SMTP_HOST")
  })
})

describe("POST /api/auth/register", () => {
  const body = {
    name: "Ana",
    email: "Ana@etec.um.edu.ar",
    password: "secreto123",
    confirmPassword: "secreto123",
  }

  it("creates the user without a session and emails a token", async () => {
    db.respond = (text) =>
      text.startsWith("INSERT INTO users") ? [{ id: 7, email: "ana@etec.um.edu.ar", display_name: "Ana" }] : []

    const response = await register(jsonRequest("/api/auth/register", body))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ success: true, pendingVerification: true })
    expect(createUserSession).not.toHaveBeenCalled()

    const tokenInsert = findQuery("INSERT INTO email_verification_tokens")
    expect(tokenInsert?.values[0]).toBe(7)

    expect(sendMail).toHaveBeenCalledTimes(1)
    const mail = vi.mocked(sendMail).mock.calls[0][0]
    expect(mail.to).toBe("ana@etec.um.edu.ar")
    const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!
    // Lo que se guarda es el hash del token que viaja en el correo, nunca el token.
    expect(tokenInsert?.values[1]).toBe(hashVerificationToken(token))
  })

  it("rolls back the user when the email cannot be sent", async () => {
    db.respond = (text) =>
      text.startsWith("INSERT INTO users") ? [{ id: 8, email: "ana@etec.um.edu.ar", display_name: "Ana" }] : []
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("SMTP caído"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await register(jsonRequest("/api/auth/register", body))

    expect(response.status).toBe(502)
    expect(findQuery("DELETE FROM users")?.values).toEqual([8])
  })
})

describe("POST /api/auth/login", () => {
  const password = "secreto123"

  function userRow(verified: boolean) {
    return {
      id: 3,
      role: "user",
      password_hash: hashPassword(password),
      email_verified_at: verified ? new Date() : null,
    }
  }

  it("rejects an account that has not been activated", async () => {
    const row = userRow(false)
    db.respond = () => [row]

    const response = await login(jsonRequest("/api/auth/login", { email: "ana@etec.um.edu.ar", password }))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" })
    expect(createUserSession).not.toHaveBeenCalled()
  })

  it("does not reveal the activation state with a wrong password", async () => {
    const row = userRow(false)
    db.respond = () => [row]

    const response = await login(jsonRequest("/api/auth/login", { email: "ana@etec.um.edu.ar", password: "otra" }))

    expect(response.status).toBe(401)
  })

  it("opens a session for an activated account", async () => {
    const row = userRow(true)
    db.respond = () => [row]

    const response = await login(jsonRequest("/api/auth/login", { email: "ana@etec.um.edu.ar", password }))

    expect(response.status).toBe(200)
    expect(createUserSession).toHaveBeenCalledWith(3, "user")
  })
})

describe("GET /api/auth/verify", () => {
  it("activates the account and redirects to the login", async () => {
    db.respond = (text) => (text.startsWith("WITH consumed") ? [{ id: 3 }] : [])

    const response = await verify(new Request("http://localhost:4000/api/auth/verify?token=abc"))

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/login?verified=1")
    expect(findQuery("WITH consumed")?.values).toEqual([hashVerificationToken("abc")])
  })

  it("redirects with an error for an expired, used or unknown token", async () => {
    const response = await verify(new Request("http://localhost:4000/api/auth/verify?token=nope"))

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/auth/login?error=InvalidVerificationToken",
    )
  })

  it("does not query the database without a token", async () => {
    const response = await verify(new Request("http://localhost:4000/api/auth/verify"))

    expect(response.headers.get("location")).toContain("error=InvalidVerificationToken")
    expect(db.queries).toHaveLength(0)
  })
})

describe("POST /api/auth/resend-verification", () => {
  it("answers the same for unknown or already active emails without sending", async () => {
    const response = await resend(jsonRequest("/api/auth/resend-verification", { email: "nadie@etec.um.edu.ar" }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("replaces pending tokens and sends a new link", async () => {
    db.respond = (text) =>
      text.startsWith("SELECT id, email, display_name FROM users")
        ? [{ id: 5, email: "pendiente@etec.um.edu.ar", display_name: "Pepe" }]
        : []

    const response = await resend(
      jsonRequest("/api/auth/resend-verification", { email: "pendiente@etec.um.edu.ar" }),
    )

    expect(response.status).toBe(200)
    expect(findQuery("DELETE FROM email_verification_tokens")?.values).toEqual([5])
    expect(sendMail).toHaveBeenCalledTimes(1)
  })

  it("limits resends per email", async () => {
    const email = "spam@etec.um.edu.ar"
    for (let i = 0; i < 3; i += 1) {
      await resend(jsonRequest("/api/auth/resend-verification", { email }))
    }
    const response = await resend(jsonRequest("/api/auth/resend-verification", { email }))

    expect(response.status).toBe(429)
  })
})
