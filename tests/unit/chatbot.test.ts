import { beforeAll, describe, expect, it } from "vitest"
import { answerQuestion, type ChatbotSource } from "@/lib/chatbot/engine"
import { formatKickoff } from "@/lib/chatbot/format"
import { detectIntent } from "@/lib/chatbot/intent"
import { resolveTeams } from "@/lib/chatbot/teams"
import { normalize } from "@/lib/chatbot/text"
import type { Match, MatchEvent, Player, Scorer, StandingRow, Team, TournamentSettings } from "@/lib/types"

const teams: Team[] = [
  { id: 1, name: "Los Pumas", slug: "los-pumas", captain: null, grupo: "A", photo_url: null, escudo_url: null },
  { id: 2, name: "Racing Club", slug: "racing-club", captain: null, grupo: "A", photo_url: null, escudo_url: null },
  { id: 3, name: "Deportivo Ñandú", slug: "deportivo-nandu", captain: null, grupo: "B", photo_url: null, escudo_url: null },
]

function match(overrides: Partial<Match> & Pick<Match, "id" | "home_team_id" | "away_team_id">): Match {
  const home = teams.find((t) => t.id === overrides.home_team_id)
  const away = teams.find((t) => t.id === overrides.away_team_id)
  return {
    matchday: 1,
    kickoff: null,
    venue: null,
    home_score: null,
    away_score: null,
    status: "scheduled",
    report: null,
    stage: "group",
    home_name: home?.name,
    home_slug: home?.slug,
    away_name: away?.name,
    away_slug: away?.slug,
    ...overrides,
  } as Match
}

const matches: Match[] = [
  match({
    id: 10,
    matchday: 1,
    home_team_id: 1,
    away_team_id: 2,
    home_score: 3,
    away_score: 1,
    status: "finished",
    kickoff: "2026-08-01T21:00:00.000Z",
  }),
  match({
    id: 11,
    matchday: 2,
    home_team_id: 3,
    away_team_id: 1,
    home_score: 2,
    away_score: 2,
    status: "finished",
    kickoff: "2026-08-08T21:00:00.000Z",
  }),
  match({
    id: 12,
    matchday: 3,
    home_team_id: 1,
    away_team_id: 3,
    status: "scheduled",
    kickoff: "2026-12-01T22:00:00.000Z",
    venue: "Cancha 1",
  }),
  // Sin horario definido: debe ordenarse después del que sí lo tiene.
  match({ id: 13, matchday: 4, home_team_id: 2, away_team_id: 3, status: "scheduled", kickoff: null }),
]

const standings: StandingRow[] = [
  { team_id: 1, name: "Los Pumas", slug: "los-pumas", grupo: "A", escudo_url: null, played: 2, won: 1, drawn: 1, lost: 0, goals_for: 5, goals_against: 3, goal_diff: 2, points: 4 },
  { team_id: 3, name: "Deportivo Ñandú", slug: "deportivo-nandu", grupo: "B", escudo_url: null, played: 1, won: 0, drawn: 1, lost: 0, goals_for: 2, goals_against: 2, goal_diff: 0, points: 1 },
]

const scorers: Scorer[] = [
  { scorer_name: "Ana Pérez", team_name: "Los Pumas", team_slug: "los-pumas", escudo_url: null, goals: 4 },
  { scorer_name: "Juan Gómez", team_name: "Racing Club", team_slug: "racing-club", escudo_url: null, goals: 1 },
]

const players: Player[] = [
  { id: 1, team_id: 1, name: "Ana Pérez", number: 10, position: "Delantera" },
  { id: 2, team_id: 1, name: "Sol Díaz", number: null, position: null },
]

const events: MatchEvent[] = [
  { id: 1, match_id: 10, team_id: 1, player_id: 1, player_name: "Ana Pérez", event_type: "goal", minute: 12, created_at: "" },
  { id: 2, match_id: 10, team_id: 1, player_id: null, player_name: "Sol Díaz", event_type: "yellow_card", minute: 30, created_at: "" },
]

const settings: TournamentSettings = {
  id: 1,
  tournament_name: "Copa ETec 2026",
  format: "general",
  knockout_source: "general",
  num_teams_advancing: 8,
  match_duration: 90,
  group_tiebreaker: "none",
  knockout_tiebreaker: "penalties",
  updated_at: "",
}

const source: ChatbotSource = {
  getTeams: async () => teams,
  getMatches: async () => matches,
  getStandings: async () => standings,
  getTopScorers: async (limit) => scorers.slice(0, limit),
  getPlayersByTeam: async (teamId) => players.filter((p) => p.team_id === teamId),
  getEventsByMatch: async (matchId) => events.filter((e) => e.match_id === matchId),
  getTournamentStats: async () => ({
    totalGoals: 8,
    totalMatches: 2,
    avgGoalsPerMatch: 4,
    bestAttack: { name: "Los Pumas", slug: "los-pumas", goals_for: 5 },
    bestDefense: { name: "Deportivo Ñandú", slug: "deportivo-nandu", goals_against: 2 },
    biggestWin: matches[0],
  }),
  getTournamentSettings: async () => settings,
}

const ask = (question: string) => answerQuestion(question, source)

beforeAll(() => {
  process.env.TOURNAMENT_TIMEZONE = "America/Argentina/Buenos_Aires"
})

describe("normalize", () => {
  it("saca acentos y signos sin partir palabras", () => {
    expect(normalize("¿Cómo salió el último?")).toBe("como salio el ultimo")
  })
})

describe("formatKickoff", () => {
  it("convierte el timestamp UTC a la hora local del torneo", () => {
    // 22:00 UTC del 1/12 son las 19:00 del 1/12 en Buenos Aires (UTC-3).
    const formatted = formatKickoff("2026-12-01T22:00:00.000Z")
    expect(formatted).toContain("martes")
    expect(formatted).toContain("1 de diciembre")
    expect(formatted).toContain("19:00")
  })

  it("respeta TOURNAMENT_TIMEZONE", () => {
    process.env.TOURNAMENT_TIMEZONE = "UTC"
    expect(formatKickoff("2026-12-01T22:00:00.000Z")).toContain("22:00")
    process.env.TOURNAMENT_TIMEZONE = "America/Argentina/Buenos_Aires"
  })

  it("no rompe con horarios ausentes o inválidos", () => {
    expect(formatKickoff(null)).toBe("horario a confirmar")
    expect(formatKickoff("no es una fecha")).toBe("horario a confirmar")
  })
})

describe("resolveTeams", () => {
  it("matchea el nombre completo", () => {
    expect(resolveTeams("cuando juega Los Pumas", teams).map((m) => m.team.id)).toEqual([1])
  })

  it("matchea por una palabra distintiva del nombre", () => {
    const found = resolveTeams("como salio Racing", teams)
    expect(found.map((m) => m.team.id)).toEqual([2])
    expect(found[0].kind).toBe("token")
  })

  it("ignora acentos del nombre del equipo", () => {
    expect(resolveTeams("plantel de nandu", teams).map((m) => m.team.id)).toEqual([3])
  })

  it("respeta el orden en que se nombraron los equipos", () => {
    expect(resolveTeams("Racing vs Los Pumas", teams).map((m) => m.team.id)).toEqual([2, 1])
  })

  it("no matchea palabras genéricas como 'club' o 'deportivo'", () => {
    expect(resolveTeams("me gusta este club deportivo", teams)).toEqual([])
  })

  it("no devuelve nada si no se nombró ningún equipo", () => {
    expect(resolveTeams("como esta la tabla", teams)).toEqual([])
  })
})

describe("detectIntent", () => {
  it.each([
    ["hola", 0, "help"],
    ["como esta la tabla de posiciones", 0, "standings"],
    ["quien hizo mas goles", 0, "top_scorers"],
    ["cuantos goles se hicieron en el torneo", 0, "tournament_stats"],
    ["que partidos se vienen", 0, "upcoming_matches"],
    ["ultimos resultados", 0, "recent_results"],
    ["cuando juega Racing", 1, "team_next_matches"],
    ["como le fue a Racing", 1, "team_recent_results"],
    ["plantel de Racing", 1, "team_squad"],
    ["Racing vs Pumas", 2, "head_to_head"],
    ["Racing", 1, "team_summary"],
    ["cual es la capital de francia", 0, "unknown"],
  ])("clasifica %j", (question, teamCount, expected) => {
    expect(detectIntent(question, teamCount)).toBe(expected)
  })

  it("prioriza la consulta concreta sobre el saludo", () => {
    expect(detectIntent("hola, cuando juega Racing", 1)).toBe("team_next_matches")
  })
})

describe("answerQuestion", () => {
  it("responde el último resultado de un equipo con el desenlace correcto", async () => {
    const result = await ask("¿cómo le fue a Los Pumas?")
    expect(result.intent).toBe("team_recent_results")
    // El más reciente es el empate 2-2 de la fecha 2, no el 3-1 de la fecha 1.
    expect(result.answer).toContain("Los Pumas empató su último partido")
    expect(result.answer).toContain("Deportivo Ñandú 2 - 2 Los Pumas")
  })

  it("responde el próximo partido de un equipo", async () => {
    const result = await ask("¿cuándo juega Los Pumas?")
    expect(result.intent).toBe("team_next_matches")
    expect(result.answer).toContain("juega contra Deportivo Ñandú")
    expect(result.answer).toContain("en Cancha 1")
  })

  it("usa la fecha del fixture cuando el partido no tiene horario cargado", async () => {
    const result = await ask("¿cuándo juega Racing Club?")
    expect(result.intent).toBe("team_next_matches")
    expect(result.answer).toContain("por la fecha 4 (horario a confirmar)")
    // Sin horario no debe armarse la frase "juega el horario a confirmar".
    expect(result.answer).not.toContain("el horario a confirmar")
  })

  it("lista los próximos partidos dejando al final los que no tienen horario", async () => {
    const result = await ask("¿qué partidos se vienen?")
    expect(result.intent).toBe("upcoming_matches")
    const upcoming = result.data.upcoming as Match[]
    expect(upcoming.map((m) => m.id)).toEqual([12, 13])
    expect(result.answer).toContain("horario a confirmar")
  })

  it("lista los últimos resultados del más reciente al más viejo", async () => {
    const result = await ask("últimos resultados")
    expect(result.intent).toBe("recent_results")
    expect((result.data.matches as Match[]).map((m) => m.id)).toEqual([11, 10])
  })

  it("devuelve la tabla de posiciones numerada, singularizando un solo punto", async () => {
    const result = await ask("cómo está la tabla")
    expect(result.intent).toBe("standings")
    expect(result.answer).toContain("1. Los Pumas — 4 pts")
    expect(result.answer).toContain("2. Deportivo Ñandú — 1 pt (")
  })

  it("devuelve los goleadores singularizando un solo gol", async () => {
    const result = await ask("quiénes son los goleadores")
    expect(result.intent).toBe("top_scorers")
    expect(result.answer).toContain("Ana Pérez (Los Pumas) — 4 goles")
    expect(result.answer).toContain("Juan Gómez (Racing Club) — 1 gol")
  })

  it("devuelve el historial entre dos equipos", async () => {
    const result = await ask("historial de Los Pumas contra Racing")
    expect(result.intent).toBe("head_to_head")
    expect(result.answer).toContain("Los Pumas 3 - 1 Racing Club")
    expect((result.data.played as Match[]).map((m) => m.id)).toEqual([10])
  })

  it("aclara que dos equipos no se enfrentaron pero tienen un cruce pendiente", async () => {
    const result = await ask("historial de Racing contra Ñandú")
    expect(result.intent).toBe("head_to_head")
    expect(result.answer).toContain("todavía no se enfrentaron en el torneo")
    expect(result.answer).toContain("Próximo cruce")
    expect(result.answer).not.toContain("Tampoco tienen")
  })

  it("devuelve el plantel de un equipo", async () => {
    const result = await ask("jugadores de Los Pumas")
    expect(result.intent).toBe("team_squad")
    expect(result.answer).toContain("#10 Ana Pérez — Delantera")
    expect(result.answer).toContain("Sol Díaz")
  })

  it("resume un equipo cuando sólo se lo nombra, con los goles del último partido", async () => {
    const result = await ask("Racing Club")
    expect(result.intent).toBe("team_summary")
    expect(result.answer).toContain("Racing Club perdió su último partido")
    // Sólo goles: la tarjeta amarilla no debe aparecer.
    expect(result.answer).toContain("12' Ana Pérez")
    expect(result.answer).not.toContain("Sol Díaz")
  })

  it("omite el minuto del gol cuando no está cargado", async () => {
    const sinMinuto: ChatbotSource = {
      ...source,
      getEventsByMatch: async () => [{ ...events[0], minute: null }],
    }
    const result = await answerQuestion("Racing Club", sinMinuto)
    expect(result.answer).toContain("• Ana Pérez")
    expect(result.answer).not.toContain("s/m")
  })

  it("usa equipos reales del torneo en los ejemplos de la ayuda", async () => {
    const result = await ask("¿qué podés hacer?")
    expect(result.intent).toBe("help")
    expect(result.answer).toContain("¿cuándo juega Los Pumas?")
    expect(result.answer).toContain("¿cómo le fue a Racing Club?")
  })

  it("no inventa ejemplos si el torneo no tiene equipos cargados", async () => {
    const result = await answerQuestion("hola", { ...source, getTeams: async () => [] })
    expect(result.intent).toBe("help")
    expect(result.answer).not.toContain("Probá con algo como")
  })

  it("cae en el fallback con sugerencias cuando no entiende", async () => {
    const result = await ask("cuál es la capital de Francia")
    expect(result.intent).toBe("unknown")
    expect(result.suggestions.length).toBeGreaterThan(0)
  })

  it("responde el saludo con el menú de capacidades", async () => {
    const result = await ask("hola")
    expect(result.intent).toBe("help")
    expect(result.answer).toContain("Copa ETec")
  })

  it("no rompe con una pregunta vacía de contenido", async () => {
    const result = await ask("???")
    expect(result.intent).toBe("unknown")
  })
})
