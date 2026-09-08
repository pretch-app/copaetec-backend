import type { Team } from "@/lib/types"
import { normalize, phraseIndex } from "./text"

// Palabras que aparecen en muchos nombres de equipo y no alcanzan para
// identificar uno solo. Sin esto, "el equipo de Juan" matchearía "Club Juan".
const WEAK_TOKENS = new Set([
  "club",
  "atletico",
  "atletica",
  "deportivo",
  "deportiva",
  "los",
  "las",
  "del",
  "de",
  "la",
  "el",
  "fc",
  "cf",
  "sc",
  "ac",
  "team",
  "equipo",
  "united",
  "city",
  "junior",
  "juniors",
  "senior",
])

const MIN_TOKEN_LENGTH = 4

export type TeamMatch = {
  team: Team
  // Posición en la pregunta donde apareció, para preservar el orden en que el
  // usuario nombró los equipos.
  index: number
  // `exact` = matcheó el nombre o el slug completo; `token` = matcheó por una
  // palabra distintiva del nombre.
  kind: "exact" | "token"
}

function aliasesFor(team: Team): string[] {
  const aliases = [normalize(team.name)]
  const fromSlug = normalize(team.slug.replace(/-/g, " "))
  if (fromSlug && !aliases.includes(fromSlug)) aliases.push(fromSlug)
  return aliases.filter(Boolean)
}

function distinctiveTokens(team: Team): string[] {
  return normalize(team.name)
    .split(" ")
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !WEAK_TOKENS.has(token))
}

/**
 * Encuentra los equipos nombrados en una pregunta.
 *
 * Estrategia en dos pasadas:
 *  1. Nombre o slug completo. Si un equipo matchea exacto, gana.
 *  2. Palabra distintiva del nombre, sólo si esa palabra pertenece a un único
 *     equipo del torneo. Así "cómo salió Pumas" resuelve "Los Pumas FC" sin
 *     confundirse cuando hay dos equipos que comparten una palabra.
 *
 * Devuelve los equipos ordenados por aparición en la pregunta.
 */
export function resolveTeams(question: string, teams: Team[]): TeamMatch[] {
  const text = normalize(question)
  const found = new Map<number, TeamMatch>()

  for (const team of teams) {
    let best = -1
    for (const alias of aliasesFor(team)) {
      const index = phraseIndex(text, alias)
      if (index !== -1 && (best === -1 || index < best)) best = index
    }
    if (best !== -1) found.set(team.id, { team, index: best, kind: "exact" })
  }

  // Segunda pasada: sólo tokens que identifican a un único equipo.
  const tokenOwners = new Map<string, number[]>()
  for (const team of teams) {
    for (const token of distinctiveTokens(team)) {
      const owners = tokenOwners.get(token) ?? []
      if (!owners.includes(team.id)) owners.push(team.id)
      tokenOwners.set(token, owners)
    }
  }

  for (const [token, owners] of tokenOwners) {
    if (owners.length !== 1) continue
    const teamId = owners[0]
    if (found.has(teamId)) continue
    const index = phraseIndex(text, token)
    if (index === -1) continue
    const team = teams.find((t) => t.id === teamId)
    if (team) found.set(teamId, { team, index, kind: "token" })
  }

  return [...found.values()].sort((a, b) => a.index - b.index)
}
