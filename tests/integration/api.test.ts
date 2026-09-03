import { describe, expect, it } from "vitest"
import { GET as getTeams } from "@/app/api/teams/route"
import { GET as getStandings } from "@/app/api/standings/route"
import { OPTIONS as optionsTeams } from "@/app/api/teams/route"

const testDatabaseUrl = process.env.DATABASE_URL_TEST
const integration = testDatabaseUrl ? describe : describe.skip

// The database client is lazy, so selecting the test URL before the first request
// keeps the production URL out of integration tests.
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl
process.env.ALLOWED_ORIGINS = "http://localhost:3000"

function request(path: string, init?: RequestInit) {
  return new Request(`http://localhost:4000${path}`, {
    ...init,
    headers: {
      Origin: "http://localhost:3000",
      ...init?.headers,
    },
  })
}

integration("API routes", () => {
  it("returns teams from the test database", async () => {
    const response = await getTeams(request("/api/teams"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  it("returns standings from the test database", async () => {
    const response = await getStandings(request("/api/standings"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  it("responds to an allowed CORS preflight", async () => {
    const response = await optionsTeams(request("/api/teams", { method: "OPTIONS" }))

    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
  })
})
