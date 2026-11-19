import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", async () => (await import("../helpers/mocks")).dbModule)
vi.mock("next/headers", async () => (await import("../helpers/mocks")).headersModule)

import { FRONTEND, apiRequest, db, findQuery, json, resetMocks, routeParams } from "../helpers/mocks"
import { GET as standings } from "@/app/api/standings/route"
import { GET as stats } from "@/app/api/stats/route"
import { GET as scorers } from "@/app/api/scorers/route"
import { GET as liveMatches } from "@/app/api/matches/live/route"
import { GET as finishedMatches } from "@/app/api/matches/finished/route"
import { GET as allEvents } from "@/app/api/events/route"
import { GET as teamBySlug } from "@/app/api/teams/slug/[slug]/route"
import { GET as teamMatches } from "@/app/api/teams/[id]/matches/route"
import { GET as teamPlayers } from "@/app/api/teams/[id]/players/route"
import { GET as googleStart } from "@/app/api/auth/google/route"
import { OPTIONS as teamsPreflight } from "@/app/api/teams/route"
import { POST as chat } from "@/app/api/chat/route"

function row(id: number, name: string, played: number, goalsFor: number, goalsAgainst: number) {
  return { team_id: id, name, slug: name.toLowerCase(), played, goals_for: goalsFor, goals_against: goalsAgainst, points: 0 }
}

beforeEach(() => resetMocks())

describe("datos públicos del torneo", () => {
  it("la tabla de posiciones solo cuenta partidos de grupo finalizados", async () => {
    db.respond = () => [row(1, "A", 2, 4, 1)]
    const response = await standings(apiRequest("/api/standings"))
    expect(await response.json()).toHaveLength(1)
    const query = findQuery("WITH results")!.text
    expect(query).toContain("status = 'finished'")
    expect(query).toContain("stage = 'group' OR stage IS NULL")
  })

  it("las estadísticas calculan promedio, mejor ataque, mejor defensa y goleada", async () => {
    db.respond = (text) => {
      if (text.startsWith("WITH results")) return [row(1, "A", 2, 6, 3), row(2, "B", 2, 2, 1), row(3, "C", 0, 0, 0)]
      if (text.includes("FROM match_events WHERE event_type IN")) return [{ total: 9 }]
      if (text.includes("FROM matches WHERE status = 'finished'")) return [{ total: 4 }]
      if (text.includes("ORDER BY ABS(")) return [{ id: 7, status: "finished", home_score: 5, away_score: null }]
      return []
    }

    const body = await json(await stats(apiRequest("/api/stats")))

    expect(body).toMatchObject({
      totalGoals: 9,
      totalMatches: 4,
      avgGoalsPerMatch: 2.3,
      bestAttack: { name: "A", goals_for: 6 },
      bestDefense: { name: "B", goals_against: 1 },
      biggestWin: { id: 7, home_score: 5, away_score: 0 },
    })
  })

  it("sin partidos jugados las estadísticas quedan en cero", async () => {
    const body = await json(await stats(apiRequest("/api/stats")))
    expect(body).toEqual({
      totalGoals: 0,
      totalMatches: 0,
      avgGoalsPerMatch: 0,
      bestAttack: null,
      bestDefense: null,
      biggestWin: null,
    })
  })

  it("los goleadores respetan el límite pedido y no cuentan goles en contra", async () => {
    db.respond = () => [{ scorer_name: "Juan", goals: 3 }]
    await scorers(apiRequest("/api/scorers?limit=3"))
    const query = findQuery("FROM match_events e")!
    expect(query.values).toEqual([3])
    expect(query.text).toContain("('goal', 'penalty_goal')")
    await scorers(apiRequest("/api/scorers"))
    expect(db.queries.at(-1)?.values).toEqual([10])
  })

  it("partidos en vivo, finalizados y eventos", async () => {
    db.respond = () => [{ id: 1, status: "finished", home_score: null, away_score: 1 }]
    expect(await (await liveMatches(apiRequest("/api/matches/live"))).json()).toHaveLength(1)
    expect(await (await finishedMatches(apiRequest("/api/matches/finished"))).json()).toEqual([
      { id: 1, status: "finished", home_score: 0, away_score: 1 },
    ])
    expect((await allEvents(apiRequest("/api/events"))).status).toBe(200)
  })

  it("en vivo responde 500 si la base falla", async () => {
    db.respond = () => {
      throw new Error("sin conexión")
    }
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await liveMatches(apiRequest("/api/matches/live"))).status).toBe(500)
  })

  it("busca un equipo por slug, con sus partidos y jugadores", async () => {
    db.respond = (text, values) => {
      if (text.includes("WHERE slug =")) return values[0] === "los-pibes" ? [{ id: 1, slug: "los-pibes" }] : []
      if (text.includes("FROM players WHERE team_id")) return [{ id: 8, name: "Juan" }]
      if (text.includes("WHERE m.home_team_id = ?")) return [{ id: 20 }]
      return []
    }
    expect((await teamBySlug(apiRequest("/api/teams/slug/los-pibes"), routeParams({ slug: "los-pibes" }))).status).toBe(200)
    expect((await teamBySlug(apiRequest("/api/teams/slug/nada"), routeParams({ slug: "nada" }))).status).toBe(404)
    expect(await (await teamPlayers(apiRequest("/api/teams/1/players"), routeParams({ id: "1" }))).json()).toHaveLength(1)
    expect(await (await teamMatches(apiRequest("/api/teams/1/matches"), routeParams({ id: "1" }))).json()).toHaveLength(1)
  })

  it("un error inesperado responde 500 sin mostrar el detalle", async () => {
    db.respond = () => {
      throw new Error("password authentication failed for user neondb_owner")
    }
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await standings(apiRequest("/api/standings"))
    expect(response.status).toBe(500)
    expect(await json(response)).toEqual({ error: "Error interno" })
  })
})

describe("CORS", () => {
  it("permite el frontend configurado con credenciales", async () => {
    const response = await teamsPreflight(apiRequest("/api/teams", { method: "OPTIONS" }))
    expect(response.status).toBe(204)
    expect(response.headers.get("access-control-allow-origin")).toBe(FRONTEND)
    expect(response.headers.get("access-control-allow-credentials")).toBe("true")
  })

  it("rechaza el preflight de otros orígenes y no los refleja en las respuestas", async () => {
    const preflight = await teamsPreflight(apiRequest("/api/teams", { method: "OPTIONS", origin: "https://evil.example" }))
    expect(preflight.status).toBe(403)
    const response = await standings(apiRequest("/api/standings", { origin: "https://evil.example" }))
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })
})

describe("GET /api/auth/google", () => {
  it("redirige a Google con state y nonce guardados en cookies", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-id"
    const response = await googleStart(apiRequest("/api/auth/google"))

    const location = new URL(response.headers.get("location")!)
    expect(location.origin + location.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(location.searchParams.get("client_id")).toBe("client-id")
    expect(location.searchParams.get("redirect_uri")).toBe("http://localhost:4000/api/auth/callback/google")
    const cookies = response.headers.getSetCookie().join(";")
    expect(cookies).toContain(`oauth_state=${location.searchParams.get("state")}`)
    expect(cookies).toContain(`oauth_nonce=${location.searchParams.get("nonce")}`)
    expect(cookies).toMatch(/HttpOnly/i)
  })

  it("avisa si falta configurar Google", async () => {
    delete process.env.GOOGLE_CLIENT_ID
    expect((await googleStart(apiRequest("/api/auth/google"))).status).toBe(500)
  })
})

describe("POST /api/chat", () => {
  it("responde preguntas con datos del torneo", async () => {
    db.respond = (text) => (text.startsWith("WITH results") ? [{ ...row(1, "Los Pibes", 1, 3, 0), grupo: null, points: 3 }] : [])
    const response = await chat(apiRequest("/api/chat", { method: "POST", body: { question: "¿Cómo está la tabla de posiciones?" } }))
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body.intent).toBe("standings")
    expect(String(body.answer)).toContain("Los Pibes")
  })

  it("valida la pregunta", async () => {
    expect((await chat(apiRequest("/api/chat", { method: "POST", body: {} }))).status).toBe(400)
    expect((await chat(apiRequest("/api/chat", { method: "POST", body: { question: "x".repeat(1000) } }))).status).toBe(400)
    const invalid = new Request("http://localhost:4000/api/chat", { method: "POST", body: "no es json" })
    expect((await chat(invalid)).status).toBe(400)
  })
})
