import type { Match, MatchEvent, StandingRow } from "@/lib/types"

function timezone(): string {
  return process.env.TOURNAMENT_TIMEZONE ?? "America/Argentina/Buenos_Aires"
}

/** `kickoff` se guarda como timestamp con zona, así que se muestra en la hora local del torneo. */
export function formatKickoff(kickoff: string | null): string {
  if (!kickoff) return "horario a confirmar"
  const date = new Date(kickoff)
  if (Number.isNaN(date.getTime())) return "horario a confirmar"
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    // Reloj de 24 horas: "19:00", no "07:00 p. m.".
    hourCycle: "h23",
    timeZone: timezone(),
  }).format(date)
}

export function teamNames(match: Match): { home: string; away: string } {
  return {
    home: match.home_name ?? `Equipo ${match.home_team_id}`,
    away: match.away_name ?? `Equipo ${match.away_team_id}`,
  }
}

/** "Los Pumas 3 - 1 Racing (Fecha 4)", con penales y alargue si corresponde. */
export function formatResult(match: Match): string {
  const { home, away } = teamNames(match)
  const parts = [`${home} ${match.home_score ?? 0} - ${match.away_score ?? 0} ${away}`]

  if (match.is_extra_time) parts.push("(tras alargue)")
  if (match.home_penalties != null && match.away_penalties != null) {
    parts.push(`(${match.home_penalties}-${match.away_penalties} en penales)`)
  }
  parts.push(`· Fecha ${match.matchday}`)

  return parts.join(" ")
}

/** "Los Pumas vs Racing · Fecha 3 · lunes 10 de septiembre, 21:00 · Cancha 1" */
export function formatFixture(match: Match): string {
  const { home, away } = teamNames(match)
  const parts = [`${home} vs ${away}`, `Fecha ${match.matchday}`, formatKickoff(match.kickoff)]
  if (match.venue) parts.push(match.venue)
  return parts.join(" · ")
}

/**
 * Complemento de tiempo para meter en una oración. Cuando el partido todavía no
 * tiene horario cargado se cae a la fecha del fixture, que sí se conoce, en vez
 * de armar frases como "juega el horario a confirmar".
 */
export function formatWhen(match: Match): string {
  if (!match.kickoff) return `por la fecha ${match.matchday} (horario a confirmar)`
  return `el ${formatKickoff(match.kickoff)}`
}

export type TeamOutcome = "won" | "drawn" | "lost"

export function outcomeForTeam(match: Match, teamId: number): TeamOutcome | null {
  if (match.status !== "finished" || match.home_score == null || match.away_score == null) return null
  const isHome = match.home_team_id === teamId
  const own = isHome ? match.home_score : match.away_score
  const rival = isHome ? match.away_score : match.home_score
  if (own > rival) return "won"
  if (own < rival) return "lost"
  return "drawn"
}

const OUTCOME_LABEL: Record<TeamOutcome, string> = {
  won: "ganó",
  drawn: "empató",
  lost: "perdió",
}

export function outcomeLabel(outcome: TeamOutcome): string {
  return OUTCOME_LABEL[outcome]
}

export function formatStandingRow(row: StandingRow, position: number): string {
  const points = `${row.points} ${row.points === 1 ? "pt" : "pts"}`
  const diff = `${row.goal_diff >= 0 ? "+" : ""}${row.goal_diff}`
  return `${position}. ${row.name} — ${points} (${row.won}G ${row.drawn}E ${row.lost}P, DG ${diff})`
}

const GOAL_EVENTS = new Set<MatchEvent["event_type"]>(["goal", "penalty_goal", "own_goal"])

export function formatGoalEvents(events: MatchEvent[]): string[] {
  return events
    .filter((event) => GOAL_EVENTS.has(event.event_type))
    .map((event) => {
      // El minuto es opcional: si no está cargado, se muestra sólo el nombre.
      const minute = event.minute != null ? `${event.minute}' ` : ""
      const note =
        event.event_type === "own_goal" ? " (en contra)" : event.event_type === "penalty_goal" ? " (de penal)" : ""
      return `${minute}${event.player_name}${note}`
    })
}

export function bulletList(lines: string[]): string {
  return lines.map((line) => `• ${line}`).join("\n")
}
