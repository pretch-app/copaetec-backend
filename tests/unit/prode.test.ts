import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", async () => (await import("../helpers/mocks")).dbModule)
vi.mock("next/headers", async () => (await import("../helpers/mocks")).headersModule)

import { ADMIN, USER, apiRequest, cookieJar, db, findQueries, findQuery, json, loginAs, resetMocks } from "../helpers/mocks"
import { calculateMatchPoints, calculatePoints } from "@/lib/predictions"
import { POST as predict } from "@/app/api/predictions/route"
import { GET as myPredictions } from "@/app/api/predictions/me/route"
import { GET as myStats } from "@/app/api/predictions/stats/me/route"
import { GET as upcoming } from "@/app/api/predictions/upcoming/route"
import { GET as ranking } from "@/app/api/predictions/ranking/route"
import { GET as me } from "@/app/api/auth/me/route"
import { POST as logout } from "@/app/api/auth/logout/route"
import { requireAdmin } from "@/lib/auth"

const MATCH_BY_ID = "WHERE m.id = ? LIMIT 1"
const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const past = new Date(Date.now() - 60 * 1000).toISOString()

function match(overrides: Record<string, unknown> = {}) {
  return { id: 20, home_team_id: 1, away_team_id: 2, status: "scheduled", kickoff: future, home_score: null, away_score: null, ...overrides }
}

beforeEach(() => resetMocks())

describe("calculatePoints", () => {
  it("da 5 puntos por el resultado exacto", () => {
    expect(calculatePoints(2, 1, 2, 1)).toBe(5)
  })
  it("da 3 puntos por acertar la diferencia de gol", () => {
    expect(calculatePoints(3, 2, 2, 1)).toBe(3)
    expect(calculatePoints(0, 0, 1, 1)).toBe(3)
  })
  it("da 2 puntos por acertar solo el ganador", () => {
    expect(calculatePoints(3, 0, 1, 0)).toBe(2)
  })
  it("no da puntos si erra el resultado", () => {
    expect(calculatePoints(0, 1, 1, 0)).toBe(0)
    expect(calculatePoints(1, 1, 2, 0)).toBe(0)
  })
})

describe("calculateMatchPoints", () => {
  it("asigna los puntos de cada predicción de un partido finalizado", async () => {
    db.respond = (text) => {
      if (text.includes(MATCH_BY_ID)) return [match({ status: "finished", home_score: 2, away_score: 1 })]
      if (text.startsWith("SELECT id, predicted_home")) {
        return [
          { id: 1, predicted_home: 2, predicted_away: 1 },
          { id: 2, predicted_home: 0, predicted_away: 3 },
        ]
      }
      return []
    }

    await calculateMatchPoints(20)

    const updates = findQueries("UPDATE predictions SET points_awarded")
    expect(updates.map((u) => u.values)).toEqual([
      [5, 1],
      [0, 2],
    ])
  })

  it("falla si el partido no terminó", async () => {
    db.respond = (text) => (text.includes(MATCH_BY_ID) ? [match()] : [])
    await expect(calculateMatchPoints(20)).rejects.toThrow(/no está finalizado/)
  })
})

describe("POST /api/predictions", () => {
  const body = { match_id: 20, predicted_home: 2, predicted_away: 1 }

  it("pide iniciar sesión", async () => {
    const response = await predict(apiRequest("/api/predictions", { method: "POST", body }))
    expect(response.status).toBe(401)
  })

  it("guarda o actualiza la predicción antes del partido", async () => {
    await loginAs(USER, (text) => (text.includes(MATCH_BY_ID) ? [match()] : []))

    const response = await predict(apiRequest("/api/predictions", { method: "POST", body }))

    expect(response.status).toBe(200)
    const insert = findQuery("INSERT INTO predictions")
    expect(insert?.text).toContain("ON CONFLICT (user_id, match_id)")
    expect(insert?.values).toEqual([USER.id, 20, 2, 1])
  })

  it("rechaza datos inválidos o fuera de rango", async () => {
    await loginAs(USER)
    const invalid = await predict(apiRequest("/api/predictions", { method: "POST", body: { ...body, match_id: "x" } }))
    expect(invalid.status).toBe(400)
    const outOfRange = await predict(apiRequest("/api/predictions", { method: "POST", body: { ...body, predicted_home: 100 } }))
    expect(outOfRange.status).toBe(400)
    expect(findQuery("INSERT INTO predictions")).toBeUndefined()
  })

  it("no acepta predicciones de partidos inexistentes, terminados o ya empezados", async () => {
    let current: unknown[] = []
    await loginAs(USER, (text) => (text.includes(MATCH_BY_ID) ? current : []))

    current = []
    expect((await predict(apiRequest("/api/predictions", { method: "POST", body }))).status).toBe(404)
    current = [match({ status: "finished", home_score: 1, away_score: 0 })]
    expect(await json(await predict(apiRequest("/api/predictions", { method: "POST", body })))).toEqual({ error: "El partido ya terminó" })
    current = [match({ kickoff: past })]
    expect(await json(await predict(apiRequest("/api/predictions", { method: "POST", body })))).toEqual({
      error: "Las predicciones para este partido ya cerraron",
    })
    expect(findQuery("INSERT INTO predictions")).toBeUndefined()
  })

  it("rechaza pedidos de otros orígenes", async () => {
    await loginAs(USER)
    const response = await predict(apiRequest("/api/predictions", { method: "POST", body, origin: "https://evil.example" }))
    expect(response.status).toBe(403)
  })
})

describe("rutas del prode", () => {
  it("devuelve mis predicciones y mis estadísticas", async () => {
    await loginAs(USER, (text) => {
      if (text.includes("FROM predictions p")) return [{ match_id: 20, predicted_home: 1, predicted_away: 0 }]
      if (text.includes("FROM users u")) {
        return [
          { user_id: 9, display_name: "Beto", total_points: 20 },
          { user_id: USER.id, display_name: "Ana", total_points: 12 },
        ]
      }
      return []
    })

    const predictions = await myPredictions(apiRequest("/api/predictions/me"))
    expect(await predictions.json()).toEqual([{ match_id: 20, predicted_home: 1, predicted_away: 0 }])
    expect(findQuery("FROM predictions p")?.values).toContain(USER.id)

    const stats = await myStats(apiRequest("/api/predictions/stats/me"))
    expect(await stats.json()).toEqual({ rank: 2, user_id: USER.id, display_name: "Ana", total_points: 12 })
  })

  it("mis predicciones piden iniciar sesión", async () => {
    expect((await myPredictions(apiRequest("/api/predictions/me"))).status).toBe(401)
    expect((await myStats(apiRequest("/api/predictions/stats/me"))).status).toBe(401)
  })

  it("lista los próximos partidos y el ranking sin iniciar sesión", async () => {
    db.respond = (text) => {
      if (text.includes("FROM matches m")) return [match()]
      if (text.includes("FROM users u")) return [{ user_id: 3, display_name: "Ana", total_points: 12 }]
      return []
    }

    expect(await (await upcoming(apiRequest("/api/predictions/upcoming"))).json()).toHaveLength(1)
    const response = await ranking(apiRequest("/api/predictions/ranking?limit=5"))
    expect(await response.json()).toEqual([{ user_id: 3, display_name: "Ana", total_points: 12 }])
    expect(findQuery("FROM users u")?.values).toContain(5)
  })
})

describe("sesión", () => {
  it("/api/auth/me devuelve el usuario de la cookie o null", async () => {
    expect(await json(await me(apiRequest("/api/auth/me")))).toEqual({ user: null })

    await loginAs(USER)
    expect(await json(await me(apiRequest("/api/auth/me")))).toEqual({ user: USER })
  })

  it("ignora una cookie adulterada", async () => {
    await loginAs(ADMIN)
    const [header, , signature] = cookieJar.get("etec_session")!.split(".")
    const forged = Buffer.from(JSON.stringify({ userId: 1, role: "admin", exp: Date.now() + 1e9 }))
      .toString("base64url")
    cookieJar.set("etec_session", `${header}.${forged}.${signature}`)

    expect(await json(await me(apiRequest("/api/auth/me")))).toEqual({ user: null })
  })

  it("logout borra la cookie de sesión", async () => {
    await loginAs(USER)
    const response = await logout(apiRequest("/api/auth/logout", { method: "POST" }))
    expect(response.status).toBe(200)
    expect(cookieJar.has("etec_session")).toBe(false)
  })

  it("requireAdmin rechaza a un usuario común", async () => {
    await loginAs(USER)
    await expect(requireAdmin()).rejects.toThrow(/Acceso denegado/)
    await loginAs(ADMIN)
    await expect(requireAdmin()).resolves.toEqual(ADMIN)
  })
})
