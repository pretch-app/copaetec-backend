import {
  getEventsByMatch,
  getMatches,
  getPlayersByTeam,
  getStandings,
  getTeams,
  getTopScorers,
  getTournamentSettings,
  getTournamentStats,
  type TournamentStats,
} from "@/lib/queries"
import type { Match, MatchEvent, Player, Scorer, StandingRow, Team, TournamentSettings } from "@/lib/types"
import { detectIntent, type Intent } from "./intent"
import { resolveTeams } from "./teams"
import {
  bulletList,
  formatFixture,
  formatGoalEvents,
  formatResult,
  formatStandingRow,
  outcomeLabel,
  outcomeForTeam,
  formatWhen,
  teamNames,
} from "./format"

/**
 * Fuente de datos del chatbot. Se inyecta para poder testear el motor con
 * fixtures, sin base de datos.
 */
export type ChatbotSource = {
  getTeams(): Promise<Team[]>
  getMatches(): Promise<Match[]>
  getStandings(): Promise<StandingRow[]>
  getTopScorers(limit: number): Promise<Scorer[]>
  getPlayersByTeam(teamId: number): Promise<Player[]>
  getEventsByMatch(matchId: number): Promise<MatchEvent[]>
  getTournamentStats(): Promise<TournamentStats>
  getTournamentSettings(): Promise<TournamentSettings>
}

export const dbSource: ChatbotSource = {
  getTeams,
  getMatches,
  getStandings,
  getTopScorers,
  getPlayersByTeam,
  getEventsByMatch,
  getTournamentStats,
  getTournamentSettings,
}

export type ChatAnswer = {
  intent: Intent
  answer: string
  /** Datos crudos para que el frontend renderice tarjetas en vez del texto plano. */
  data: Record<string, unknown>
  suggestions: string[]
}

export const MAX_QUESTION_LENGTH = 300

const DEFAULT_SUGGESTIONS = [
  "¿Cómo está la tabla de posiciones?",
  "¿Qué partidos se vienen?",
  "¿Quiénes son los goleadores?",
]

const RECENT_LIMIT = 5
const UPCOMING_LIMIT = 5

function finishedFirst(matches: Match[]): Match[] {
  return matches
    .filter((match) => match.status === "finished")
    .sort((a, b) => {
      const aTime = a.kickoff ? new Date(a.kickoff).getTime() : Number.NEGATIVE_INFINITY
      const bTime = b.kickoff ? new Date(b.kickoff).getTime() : Number.NEGATIVE_INFINITY
      if (aTime !== bTime) return bTime - aTime
      if (a.matchday !== b.matchday) return b.matchday - a.matchday
      return b.id - a.id
    })
}

function soonestFirst(matches: Match[]): Match[] {
  return matches
    .filter((match) => match.status === "scheduled")
    .sort((a, b) => {
      // Los partidos sin horario definido van al final.
      const aTime = a.kickoff ? new Date(a.kickoff).getTime() : Number.POSITIVE_INFINITY
      const bTime = b.kickoff ? new Date(b.kickoff).getTime() : Number.POSITIVE_INFINITY
      if (aTime !== bTime) return aTime - bTime
      if (a.matchday !== b.matchday) return a.matchday - b.matchday
      return a.id - b.id
    })
}

function involvesTeam(match: Match, teamId: number): boolean {
  return match.home_team_id === teamId || match.away_team_id === teamId
}

function rivalName(match: Match, teamId: number): string {
  const { home, away } = teamNames(match)
  return match.home_team_id === teamId ? away : home
}

function helpAnswer(teams: Team[]): ChatAnswer {
  const sections = [
    "¡Hola! Soy el asistente de la Copa ETec. Puedo contarte:",
    bulletList([
      "resultados de los últimos partidos de un equipo",
      "cuándo juega cada equipo y qué partidos se vienen",
      "la tabla de posiciones y los goleadores",
      "el historial entre dos equipos",
      "el plantel de un equipo",
    ]),
  ]

  // Los ejemplos usan equipos reales del torneo para que se puedan copiar tal cual.
  const [first, second] = teams
  if (first && second) {
    sections.push(`Probá con algo como “¿cuándo juega ${first.name}?” o “¿cómo le fue a ${second.name}?”.`)
  } else if (first) {
    sections.push(`Probá con algo como “¿cuándo juega ${first.name}?”.`)
  }

  return {
    intent: "help",
    answer: sections.join("\n\n"),
    data: { teams: teams.map((team) => team.name) },
    suggestions: DEFAULT_SUGGESTIONS,
  }
}

function unknownAnswer(question: string): ChatAnswer {
  return {
    intent: "unknown",
    answer:
      "No llegué a entender la pregunta. Puedo ayudarte con resultados, próximos partidos, la tabla de posiciones, los goleadores y los planteles de la Copa ETec.",
    data: { question },
    suggestions: DEFAULT_SUGGESTIONS,
  }
}

/**
 * Responde una pregunta sobre el torneo usando exclusivamente datos de la base.
 * No hay modelo de lenguaje detrás: cada respuesta se arma con plantillas sobre
 * filas reales, así que nunca puede inventar un resultado.
 */
export async function answerQuestion(question: string, source: ChatbotSource = dbSource): Promise<ChatAnswer> {
  const teams = await source.getTeams()
  const matched = resolveTeams(question, teams)
  const intent = detectIntent(question, matched.length)
  const primary = matched[0]?.team
  const secondary = matched[1]?.team

  switch (intent) {
    case "help":
      return helpAnswer(teams)

    case "standings": {
      const standings = await source.getStandings()
      if (standings.length === 0) {
        return { intent, answer: "Todavía no hay posiciones cargadas.", data: { standings }, suggestions: DEFAULT_SUGGESTIONS }
      }
      const lines = standings.map((row, i) => formatStandingRow(row, i + 1))
      return {
        intent,
        answer: `Tabla de posiciones:\n${lines.join("\n")}`,
        data: { standings },
        suggestions: ["¿Quiénes son los goleadores?", "¿Qué partidos se vienen?"],
      }
    }

    case "top_scorers": {
      const scorers = await source.getTopScorers(10)
      if (scorers.length === 0) {
        return { intent, answer: "Todavía no hay goles registrados en el torneo.", data: { scorers }, suggestions: DEFAULT_SUGGESTIONS }
      }
      const lines = scorers.map((s, i) => `${i + 1}. ${s.scorer_name} (${s.team_name}) — ${s.goals} ${s.goals === 1 ? "gol" : "goles"}`)
      return {
        intent,
        answer: `Goleadores del torneo:\n${lines.join("\n")}`,
        data: { scorers },
        suggestions: ["¿Cómo está la tabla de posiciones?", "¿Qué partidos se vienen?"],
      }
    }

    case "tournament_stats": {
      const [stats, settings] = await Promise.all([source.getTournamentStats(), source.getTournamentSettings()])
      const lines = [
        `Partidos jugados: ${stats.totalMatches}`,
        `Goles convertidos: ${stats.totalGoals} (promedio ${stats.avgGoalsPerMatch} por partido)`,
      ]
      if (stats.bestAttack) lines.push(`Mejor ataque: ${stats.bestAttack.name} (${stats.bestAttack.goals_for} goles a favor)`)
      if (stats.bestDefense) lines.push(`Mejor defensa: ${stats.bestDefense.name} (${stats.bestDefense.goals_against} goles en contra)`)
      if (stats.biggestWin) lines.push(`Goleada más grande: ${formatResult(stats.biggestWin)}`)
      return {
        intent,
        answer: `${settings.tournament_name} en números:\n${bulletList(lines)}`,
        data: { stats, settings },
        suggestions: ["¿Quiénes son los goleadores?", "¿Cómo está la tabla de posiciones?"],
      }
    }

    case "team_squad": {
      if (!primary) return unknownAnswer(question)
      const players = await source.getPlayersByTeam(primary.id)
      if (players.length === 0) {
        return {
          intent,
          answer: `Todavía no hay jugadores cargados para ${primary.name}.`,
          data: { team: primary, players },
          suggestions: [`¿Cuándo juega ${primary.name}?`, "¿Cómo está la tabla de posiciones?"],
        }
      }
      const lines = players.map((p) => {
        const number = p.number != null ? `#${p.number} ` : ""
        const position = p.position ? ` — ${p.position}` : ""
        return `${number}${p.name}${position}`
      })
      return {
        intent,
        answer: `Plantel de ${primary.name} (${players.length}):\n${bulletList(lines)}`,
        data: { team: primary, players },
        suggestions: [`¿Cuándo juega ${primary.name}?`, `¿Cómo le fue a ${primary.name}?`],
      }
    }

    case "head_to_head": {
      if (!primary || !secondary) return unknownAnswer(question)
      const matches = await source.getMatches()
      const between = matches.filter((m) => involvesTeam(m, primary.id) && involvesTeam(m, secondary.id))
      const played = finishedFirst(between)
      const upcoming = soonestFirst(between)

      const sections: string[] = []
      if (played.length > 0) {
        sections.push(`Historial ${primary.name} vs ${secondary.name} (${played.length}):\n${bulletList(played.map(formatResult))}`)
      } else {
        sections.push(`${primary.name} y ${secondary.name} todavía no se enfrentaron en el torneo.`)
      }
      if (upcoming.length > 0) {
        sections.push(`Próximo cruce:\n${bulletList(upcoming.slice(0, 2).map(formatFixture))}`)
      } else if (played.length === 0) {
        sections.push("Tampoco tienen un partido programado entre sí.")
      }

      return {
        intent,
        answer: sections.join("\n\n"),
        data: { teams: [primary, secondary], played, upcoming },
        suggestions: [`¿Cuándo juega ${primary.name}?`, `¿Cuándo juega ${secondary.name}?`],
      }
    }

    case "team_next_matches": {
      if (!primary) return unknownAnswer(question)
      const matches = await source.getMatches()
      const upcoming = soonestFirst(matches.filter((m) => involvesTeam(m, primary.id))).slice(0, UPCOMING_LIMIT)
      if (upcoming.length === 0) {
        return {
          intent,
          answer: `${primary.name} no tiene partidos programados por ahora.`,
          data: { team: primary, upcoming },
          suggestions: [`¿Cómo le fue a ${primary.name}?`, "¿Qué partidos se vienen?"],
        }
      }
      const next = upcoming[0]
      const header = `${primary.name} juega contra ${rivalName(next, primary.id)} ${formatWhen(next)}${next.venue ? ` en ${next.venue}` : ""}.`
      const rest = upcoming.slice(1)
      const answer = rest.length > 0 ? `${header}\n\nDespués:\n${bulletList(rest.map(formatFixture))}` : header
      return {
        intent,
        answer,
        data: { team: primary, upcoming },
        suggestions: [`¿Cómo le fue a ${primary.name}?`, `¿Quiénes juegan en ${primary.name}?`],
      }
    }

    case "team_recent_results": {
      if (!primary) return unknownAnswer(question)
      const matches = await source.getMatches()
      const played = finishedFirst(matches.filter((m) => involvesTeam(m, primary.id))).slice(0, RECENT_LIMIT)
      if (played.length === 0) {
        return {
          intent,
          answer: `${primary.name} todavía no jugó ningún partido.`,
          data: { team: primary, matches: played },
          suggestions: [`¿Cuándo juega ${primary.name}?`, "¿Qué partidos se vienen?"],
        }
      }
      const last = played[0]
      const outcome = outcomeForTeam(last, primary.id)
      const header = outcome
        ? `${primary.name} ${outcomeLabel(outcome)} su último partido: ${formatResult(last)}.`
        : `Último partido de ${primary.name}: ${formatResult(last)}.`
      const rest = played.slice(1)
      const answer = rest.length > 0 ? `${header}\n\nAntes:\n${bulletList(rest.map(formatResult))}` : header
      return {
        intent,
        answer,
        data: { team: primary, matches: played },
        suggestions: [`¿Cuándo juega ${primary.name}?`, "¿Cómo está la tabla de posiciones?"],
      }
    }

    case "team_summary": {
      if (!primary) return unknownAnswer(question)
      const matches = await source.getMatches()
      const own = matches.filter((m) => involvesTeam(m, primary.id))
      const last = finishedFirst(own)[0] ?? null
      const next = soonestFirst(own)[0] ?? null

      const sections: string[] = []
      if (last) {
        const outcome = outcomeForTeam(last, primary.id)
        sections.push(
          outcome
            ? `${primary.name} ${outcomeLabel(outcome)} su último partido: ${formatResult(last)}.`
            : `Último partido de ${primary.name}: ${formatResult(last)}.`
        )
        const goals = formatGoalEvents(await source.getEventsByMatch(last.id))
        if (goals.length > 0) sections.push(`Goles:\n${bulletList(goals)}`)
      }
      if (next) {
        sections.push(`Próximo partido: ${formatFixture(next)}.`)
      }
      if (sections.length === 0) {
        sections.push(`${primary.name} todavía no tiene partidos jugados ni programados.`)
      }

      return {
        intent,
        answer: sections.join("\n\n"),
        data: { team: primary, last, next },
        suggestions: [`¿Quiénes juegan en ${primary.name}?`, "¿Cómo está la tabla de posiciones?"],
      }
    }

    case "upcoming_matches": {
      const matches = await source.getMatches()
      const upcoming = soonestFirst(matches).slice(0, UPCOMING_LIMIT)
      if (upcoming.length === 0) {
        return { intent, answer: "No hay partidos programados por el momento.", data: { upcoming }, suggestions: DEFAULT_SUGGESTIONS }
      }
      return {
        intent,
        answer: `Próximos partidos:\n${bulletList(upcoming.map(formatFixture))}`,
        data: { upcoming },
        suggestions: ["¿Cómo está la tabla de posiciones?", "¿Quiénes son los goleadores?"],
      }
    }

    case "recent_results": {
      const matches = await source.getMatches()
      const played = finishedFirst(matches).slice(0, RECENT_LIMIT)
      if (played.length === 0) {
        return { intent, answer: "Todavía no se jugó ningún partido del torneo.", data: { matches: played }, suggestions: DEFAULT_SUGGESTIONS }
      }
      return {
        intent,
        answer: `Últimos resultados:\n${bulletList(played.map(formatResult))}`,
        data: { matches: played },
        suggestions: ["¿Qué partidos se vienen?", "¿Cómo está la tabla de posiciones?"],
      }
    }

    default:
      return unknownAnswer(question)
  }
}
