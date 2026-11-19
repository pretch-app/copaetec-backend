import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/db", async () => (await import("../helpers/mocks")).dbModule)
vi.mock("next/headers", async () => (await import("../helpers/mocks")).headersModule)

import { ADMIN, USER, apiRequest, db, findQueries, findQuery, json, loginAs, resetMocks, routeParams } from "../helpers/mocks"
import { POST as generateFixture } from "@/app/api/matches/generate-fixture/route"
import { POST as generateBracket } from "@/app/api/matches/generate-bracket/route"
import { GET as listMatches, POST as createMatch } from "@/app/api/matches/route"
import { DELETE as deleteMatch, GET as getMatch, PATCH as updateMatch } from "@/app/api/matches/[id]/route"
import { GET as listEvents, POST as addEvent } from "@/app/api/matches/[id]/events/route"
import { PATCH as updateExtras } from "@/app/api/matches/[id]/extras/route"
import { DELETE as deleteEvent } from "@/app/api/events/[id]/route"
import { GET as getSettings, PATCH as saveSettings } from "@/app/api/settings/route"

const MATCH_BY_ID = "WHERE m.id = ? LIMIT 1"

function match(overrides: Record<string, unknown> = {}) {
  return { id: 20, home_team_id: 1, away_team_id: 2, status: "scheduled", home_score: null, away_score: null, ...overrides }
}

function team(id: number, grupo: string | null = "A") {
  return { id, name: `Equipo ${id}`, slug: `equipo-${id}`, grupo }
}

beforeEach(() => resetMocks())

describe("permisos de admin", () => {
  it("las rutas de administración rechazan a quien no es admin, tenga sesión o no", async () => {
    const calls = [
      () => generateFixture(apiRequest("/api/matches/generate-fixture", { method: "POST", body: {} })),
      () => generateBracket(apiRequest("/api/matches/generate-bracket", { method: "POST" })),
      () => createMatch(apiRequest("/api/matches", { method: "POST", body: {} })),
      () => updateMatch(apiRequest("/api/matches/20", { method: "PATCH", body: {} }), routeParams({ id: "20" })),
      () => deleteMatch(apiRequest("/api/matches/20", { method: "DELETE" }), routeParams({ id: "20" })),
      () => addEvent(apiRequest("/api/matches/20/events", { method: "POST", body: {} }), routeParams({ id: "20" })),
      () => updateExtras(apiRequest("/api/matches/20/extras", { method: "PATCH", body: {} }), routeParams({ id: "20" })),
      () => deleteEvent(apiRequest("/api/events/5", { method: "DELETE" }), routeParams({ id: "5" })),
      () => saveSettings(apiRequest("/api/settings", { method: "PATCH", body: {} })),
    ]

    // requireAdmin responde 403 también sin sesión.
    for (const call of calls) expect((await call()).status).toBe(403)

    await loginAs(USER)
    for (const call of calls) expect((await call()).status).toBe(403)

    expect(findQuery("INSERT")).toBeUndefined()
    expect(findQuery("UPDATE matches")).toBeUndefined()
    expect(findQuery("DELETE")).toBeUndefined()
  })
})

describe("POST /api/matches/generate-fixture", () => {
  it("arma un todos contra todos por grupo", async () => {
    await loginAs(ADMIN, (text) =>
      text.startsWith("SELECT * FROM teams") ? [team(1), team(2), team(3), team(4), team(5, "B"), team(6, "B"), team(7, "C")] : [],
    )

    const response = await generateFixture(apiRequest("/api/matches/generate-fixture", { method: "POST", body: {} }))

    expect(response.status).toBe(200)
    const inserts = findQueries("INSERT INTO matches").map((q) => q.values)
    // Grupo A (4 equipos): 6 partidos en 3 fechas. Grupo B (2): 1 partido. Grupo C (1): ninguno.
    expect(inserts).toHaveLength(7)
    const pairs = inserts.map(([, home, away]) => [home, away].sort().join("-"))
    expect(new Set(pairs).size).toBe(7)
    expect(Math.max(...inserts.map(([matchday]) => matchday as number))).toBe(3)
    expect(findQuery("DELETE FROM matches")).toBeUndefined()
  })

  it("con ida y vuelta duplica los cruces invirtiendo la localía, y puede limpiar el fixture anterior", async () => {
    await loginAs(ADMIN, (text) => (text.startsWith("SELECT * FROM teams") ? [team(1), team(2), team(3)] : []))

    await generateFixture(
      apiRequest("/api/matches/generate-fixture", {
        method: "POST",
        body: { double_round_robin: true, clear_existing: true, randomize: true },
      }),
    )

    expect(findQuery("DELETE FROM matches")?.text).toContain("<> 'finished'")
    const inserts = findQueries("INSERT INTO matches").map((q) => q.values)
    // 3 equipos: 3 partidos de ida + 3 de vuelta.
    expect(inserts).toHaveLength(6)
    const homeAway = inserts.map(([, home, away]) => `${home}-${away}`)
    for (const [, home, away] of inserts) expect(homeAway).toContain(`${away}-${home}`)
  })
})

describe("POST /api/matches/generate-bracket", () => {
  const standings = [1, 2, 3, 4].map((id) => ({ team_id: id, name: `Equipo ${id}`, points: 10 - id }))

  it("cruza al primero con el último de los que clasifican", async () => {
    await loginAs(ADMIN, (text) => {
      if (text.startsWith("SELECT * FROM tournament_settings")) return [{ num_teams_advancing: 4 }]
      if (text.startsWith("WITH results")) return standings
      return []
    })

    const response = await generateBracket(apiRequest("/api/matches/generate-bracket", { method: "POST" }))

    expect(response.status).toBe(200)
    expect(findQueries("INSERT INTO matches").map((q) => q.values)).toEqual([
      [1, 4, "semi_finals", 103],
      [2, 3, "semi_finals", 103],
    ])
  })

  it("no genera llaves sin equipos suficientes o si ya existen", async () => {
    let existing: unknown[] = []
    await loginAs(ADMIN, (text) => {
      if (text.startsWith("SELECT * FROM tournament_settings")) return [{ num_teams_advancing: 8 }]
      if (text.startsWith("WITH results")) return standings
      if (text.startsWith("SELECT id FROM matches WHERE stage")) return existing
      return []
    })
    const notEnough = await generateBracket(apiRequest("/api/matches/generate-bracket", { method: "POST" }))
    expect(notEnough.status).toBe(400)

    await loginAs(ADMIN, (text) => {
      if (text.startsWith("SELECT * FROM tournament_settings")) return [{ num_teams_advancing: 2 }]
      if (text.startsWith("WITH results")) return standings
      if (text.startsWith("SELECT id FROM matches WHERE stage")) return existing
      return []
    })
    existing = [{ id: 99 }]
    const duplicated = await generateBracket(apiRequest("/api/matches/generate-bracket", { method: "POST" }))
    expect(duplicated.status).toBe(409)
    expect(findQuery("INSERT INTO matches")).toBeUndefined()
  })
})

describe("/api/matches", () => {
  it("lista los partidos y completa con 0 el marcador de los finalizados", async () => {
    db.respond = () => [match({ status: "finished", home_score: null, away_score: 2 }), match({ id: 21 })]
    const body = (await (await listMatches(apiRequest("/api/matches"))).json()) as Record<string, unknown>[]
    expect(body[0]).toMatchObject({ home_score: 0, away_score: 2 })
    expect(body[1]).toMatchObject({ home_score: null })
  })

  it("crea un partido validando equipos y fase", async () => {
    await loginAs(ADMIN)
    const created = await createMatch(
      apiRequest("/api/matches", {
        method: "POST",
        body: { home_team_id: 1, away_team_id: 2, matchday: 2, kickoff: "2026-11-20T15:00", venue: "Cancha 1" },
      }),
    )
    expect(created.status).toBe(200)
    expect(findQuery("INSERT INTO matches")?.values).toEqual([2, "2026-11-20T15:00-03:00", "Cancha 1", 1, 2, "group"])

    const sameTeam = await createMatch(apiRequest("/api/matches", { method: "POST", body: { home_team_id: 1, away_team_id: 1 } }))
    expect(sameTeam.status).toBe(400)
    const badStage = await createMatch(
      apiRequest("/api/matches", { method: "POST", body: { home_team_id: 1, away_team_id: 2, stage: "liga" } }),
    )
    expect(badStage.status).toBe(400)
  })

  it("devuelve un partido o 404", async () => {
    db.respond = (text, values) => (text.includes(MATCH_BY_ID) && values[0] === 20 ? [match()] : [])
    expect((await getMatch(apiRequest("/api/matches/20"), routeParams({ id: "20" }))).status).toBe(200)
    expect((await getMatch(apiRequest("/api/matches/99"), routeParams({ id: "99" }))).status).toBe(404)
  })
})

describe("PATCH /api/matches/:id", () => {
  it("al finalizar un partido recalcula los puntos del prode", async () => {
    await loginAs(ADMIN, (text) => {
      if (text.includes(MATCH_BY_ID)) return [match({ status: "finished", home_score: 1, away_score: 1 })]
      if (text.startsWith("SELECT id, predicted_home")) return [{ id: 7, predicted_home: 1, predicted_away: 1 }]
      return []
    })

    const response = await updateMatch(
      apiRequest("/api/matches/20", { method: "PATCH", body: { status: "finished", home_score: 1, away_score: 1 } }),
      routeParams({ id: "20" }),
    )

    expect(response.status).toBe(200)
    expect(findQuery("UPDATE matches SET")).toBeDefined()
    expect(findQuery("UPDATE predictions SET points_awarded")?.values).toEqual([5, 7])
  })

  it("rechaza estados y marcadores inválidos", async () => {
    await loginAs(ADMIN)
    const badStatus = await updateMatch(
      apiRequest("/api/matches/20", { method: "PATCH", body: { status: "jugando" } }),
      routeParams({ id: "20" }),
    )
    expect(await json(badStatus)).toEqual({ error: "Estado inválido" })
    const badScore = await updateMatch(
      apiRequest("/api/matches/20", { method: "PATCH", body: { home_score: -1 } }),
      routeParams({ id: "20" }),
    )
    expect(await json(badScore)).toEqual({ error: "Marcador inválido" })
    const badId = await updateMatch(apiRequest("/api/matches/x", { method: "PATCH", body: {} }), routeParams({ id: "x" }))
    expect(badId.status).toBe(400)
    expect(findQuery("UPDATE matches")).toBeUndefined()
  })

  it("borra un partido", async () => {
    await loginAs(ADMIN)
    const response = await deleteMatch(apiRequest("/api/matches/20", { method: "DELETE" }), routeParams({ id: "20" }))
    expect(response.status).toBe(200)
    expect(findQuery("DELETE FROM matches")?.values).toEqual([20])
  })
})

describe("eventos de partido", () => {
  function respondWith(extra: (text: string) => unknown[] = () => []) {
    return (text: string) => {
      if (text.includes(MATCH_BY_ID)) return [match({ status: "finished", home_score: 0, away_score: 0 })]
      if (text.startsWith("SELECT name FROM players")) return [{ name: "Juan" }]
      return extra(text)
    }
  }

  it("un gol suma al marcador del equipo que lo hizo", async () => {
    await loginAs(ADMIN, respondWith())

    const response = await addEvent(
      apiRequest("/api/matches/20/events", { method: "POST", body: { team_id: 2, player_id: 8, event_type: "goal", minute: 30 } }),
      routeParams({ id: "20" }),
    )

    expect(response.status).toBe(200)
    expect(findQuery("INSERT INTO match_events")?.values).toEqual([20, 2, 8, "Juan", "goal", 30])
    expect(findQuery("SET home_score = COALESCE(home_score, 0) +")?.values).toEqual([0, 1, 20])
  })

  it("un gol en contra suma al rival", async () => {
    await loginAs(ADMIN, respondWith())
    await addEvent(
      apiRequest("/api/matches/20/events", {
        method: "POST",
        body: { team_id: 1, player_name: "Pedro", event_type: "own_goal" },
      }),
      routeParams({ id: "20" }),
    )
    expect(findQuery("SET home_score = COALESCE(home_score, 0) +")?.values).toEqual([0, 1, 20])
  })

  it("una tarjeta no toca el marcador", async () => {
    await loginAs(ADMIN, respondWith())
    await addEvent(
      apiRequest("/api/matches/20/events", { method: "POST", body: { team_id: 1, player_name: "Pedro", event_type: "yellow_card" } }),
      routeParams({ id: "20" }),
    )
    expect(findQuery("INSERT INTO match_events")).toBeDefined()
    expect(findQuery("SET home_score")).toBeUndefined()
  })

  it("valida equipo, jugador, tipo y minuto", async () => {
    await loginAs(ADMIN, (text) => {
      if (text.includes(MATCH_BY_ID)) return [match()]
      return []
    })
    const post = (body: Record<string, unknown>) =>
      addEvent(apiRequest("/api/matches/20/events", { method: "POST", body }), routeParams({ id: "20" }))

    expect(await json(await post({ team_id: 5, player_name: "X", event_type: "goal" }))).toEqual({
      error: "El equipo no participa en este partido",
    })
    expect(await json(await post({ team_id: 1, player_id: 99, event_type: "goal" }))).toEqual({
      error: "El jugador no pertenece al equipo",
    })
    expect(await json(await post({ team_id: 1, player_name: "X", event_type: "corner" }))).toEqual({
      error: "Tipo de evento inválido",
    })
    expect(await json(await post({ team_id: 1, player_name: "X", event_type: "goal", minute: 200 }))).toEqual({
      error: "Faltan datos para el evento",
    })
    expect((await post({})).status).toBe(400)
    expect(findQuery("INSERT INTO match_events")).toBeUndefined()
  })

  it("lista los eventos de un partido", async () => {
    db.respond = () => [{ id: 1, event_type: "goal" }]
    const response = await listEvents(apiRequest("/api/matches/20/events"), routeParams({ id: "20" }))
    expect(await response.json()).toEqual([{ id: 1, event_type: "goal" }])
  })

  it("borrar un gol descuenta el marcador", async () => {
    await loginAs(ADMIN, (text) => {
      if (text.startsWith("SELECT * FROM match_events WHERE id")) return [{ id: 5, match_id: 20, team_id: 1, event_type: "goal" }]
      if (text.includes(MATCH_BY_ID)) return [match({ home_score: 1, away_score: 0 })]
      return []
    })

    const response = await deleteEvent(apiRequest("/api/events/5", { method: "DELETE" }), routeParams({ id: "5" }))

    expect(response.status).toBe(200)
    expect(findQuery("DELETE FROM match_events")?.values).toEqual([5])
    expect(findQuery("GREATEST(COALESCE(home_score, 0) -")?.values).toEqual([1, 0, 20])
  })

  it("borrar una tarjeta solo borra el evento, y un evento inexistente da 404", async () => {
    let event: unknown[] = [{ id: 6, match_id: 20, team_id: 1, event_type: "red_card" }]
    await loginAs(ADMIN, (text) => (text.startsWith("SELECT * FROM match_events WHERE id") ? event : []))

    await deleteEvent(apiRequest("/api/events/6", { method: "DELETE" }), routeParams({ id: "6" }))
    expect(findQuery("DELETE FROM match_events")?.values).toEqual([6])
    expect(findQuery("GREATEST")).toBeUndefined()

    event = []
    expect((await deleteEvent(apiRequest("/api/events/7", { method: "DELETE" }), routeParams({ id: "7" }))).status).toBe(404)
  })
})

describe("PATCH /api/matches/:id/extras", () => {
  it("guarda penales y tiempo extra", async () => {
    await loginAs(ADMIN, (text) => (text.includes(MATCH_BY_ID) ? [match()] : []))
    const response = await updateExtras(
      apiRequest("/api/matches/20/extras", {
        method: "PATCH",
        body: { home_penalties: 4, away_penalties: 3, is_extra_time: true },
      }),
      routeParams({ id: "20" }),
    )
    expect(response.status).toBe(200)
    expect(findQuery("SET home_penalties")?.values.slice(0, 3)).toEqual([4, 3, true])
  })

  it("rechaza valores inválidos", async () => {
    await loginAs(ADMIN)
    const extra = await updateExtras(
      apiRequest("/api/matches/20/extras", { method: "PATCH", body: { is_extra_time: "quizás" } }),
      routeParams({ id: "20" }),
    )
    expect(extra.status).toBe(400)
    const status = await updateExtras(
      apiRequest("/api/matches/20/extras", { method: "PATCH", body: { status: "x" } }),
      routeParams({ id: "20" }),
    )
    expect(status.status).toBe(400)
  })
})

describe("/api/settings", () => {
  it("devuelve la configuración, con valores por defecto si no hay", async () => {
    const empty = await json(await getSettings(apiRequest("/api/settings")))
    expect(empty).toMatchObject({ tournament_name: "Copa ETec 2026", num_teams_advancing: 8 })

    db.respond = () => [{ id: 1, tournament_name: "Copa 2027", num_teams_advancing: 4 }]
    const saved = await json(await getSettings(apiRequest("/api/settings")))
    expect(saved).toMatchObject({ tournament_name: "Copa 2027", match_duration: 90, knockout_tiebreaker: "penalties" })
  })

  it("guarda la configuración válida y rechaza la inválida", async () => {
    await loginAs(ADMIN, (text) => (text.startsWith("UPDATE tournament_settings") ? [{ id: 1 }] : []))
    const ok = await saveSettings(
      apiRequest("/api/settings", { method: "PATCH", body: { tournament_name: "Copa", format: "groups", num_teams_advancing: 4 } }),
    )
    expect(ok.status).toBe(200)
    expect(findQuery("UPDATE tournament_settings")?.values.slice(0, 4)).toEqual(["Copa", "groups", "general", 4])

    for (const body of [
      { format: "liga" },
      { knockout_source: "x" },
      { group_tiebreaker: "x" },
      { knockout_tiebreaker: "x" },
      { num_teams_advancing: 6 },
    ]) {
      expect((await saveSettings(apiRequest("/api/settings", { method: "PATCH", body }))).status).toBe(400)
    }
  })
})
