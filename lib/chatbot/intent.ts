import { containsAny, normalize } from "./text"

export type Intent =
  | "help"
  | "standings"
  | "top_scorers"
  | "tournament_stats"
  | "team_squad"
  | "head_to_head"
  | "team_next_matches"
  | "team_recent_results"
  | "team_summary"
  | "upcoming_matches"
  | "recent_results"
  | "unknown"

const HELP = [
  "hola",
  "buenas",
  "buenas tardes",
  "buen dia",
  "ayuda",
  "help",
  "menu",
  "que podes hacer",
  "que sabes",
  "que puedo preguntar",
  "para que servis",
  "opciones",
] as const

const STANDINGS = [
  "tabla",
  "tabla de posiciones",
  "posiciones",
  "posicion",
  "clasificacion",
  "quien va primero",
  "quien esta primero",
  "puntos",
  "puntaje",
  "standings",
] as const

const SCORERS = [
  "goleador",
  "goleadores",
  "maximo goleador",
  "maximos goleadores",
  "quien hizo mas goles",
  "mas goles",
  "artillero",
  "artilleros",
  "tabla de goleadores",
] as const

const STATS = [
  "estadistica",
  "estadisticas",
  "cuantos goles",
  "promedio de goles",
  "mejor ataque",
  "mejor defensa",
  "goleada",
  "resumen del torneo",
  "datos del torneo",
] as const

const SQUAD = [
  "jugador",
  "jugadores",
  "plantel",
  "planteles",
  "nomina",
  "convocados",
  "quienes juegan en",
  "quien juega en",
] as const

const UPCOMING = [
  "proximo",
  "proximos",
  "proxima",
  "proximas",
  "se viene",
  "se vienen",
  "cuando juega",
  "cuando juegan",
  "cuando jugamos",
  "siguiente fecha",
  "proxima fecha",
  "fixture",
  "calendario",
  "agenda",
  "falta jugar",
] as const

const RECENT = [
  "ultimo",
  "ultimos",
  "ultima",
  "ultimas",
  "resultado",
  "resultados",
  "como salio",
  "como salieron",
  "como quedo",
  "como termino",
  "como le fue",
  "fecha pasada",
  "ya jugaron",
  "jugados",
] as const

/**
 * Clasifica la pregunta combinando palabras clave con la cantidad de equipos
 * que se nombraron. El orden de las reglas importa: van de la más específica a
 * la más general, y la primera que matchea gana.
 */
export function detectIntent(question: string, teamCount: number): Intent {
  const text = normalize(question)

  if (!text) return "unknown"

  const isUpcoming = containsAny(text, UPCOMING)
  const isRecent = containsAny(text, RECENT)

  // Saludo o pedido de ayuda, siempre que no venga mezclado con una consulta
  // concreta ("hola, cuándo juega X" debe responder el partido).
  if (containsAny(text, HELP) && teamCount === 0 && !isUpcoming && !isRecent) return "help"

  if (containsAny(text, SCORERS)) return "top_scorers"
  if (containsAny(text, STANDINGS)) return "standings"
  if (containsAny(text, STATS)) return "tournament_stats"
  if (containsAny(text, SQUAD) && teamCount >= 1) return "team_squad"

  // Dos equipos nombrados siempre es un cruce entre ellos, se pregunte por el
  // historial o por cuándo se enfrentan.
  if (teamCount >= 2) return "head_to_head"

  if (isUpcoming) return teamCount >= 1 ? "team_next_matches" : "upcoming_matches"
  if (isRecent) return teamCount >= 1 ? "team_recent_results" : "recent_results"

  // Sólo se nombró un equipo, sin verbo: devolvemos su resumen (último
  // resultado + próximo partido), que es lo que la gente suele querer.
  if (teamCount === 1) return "team_summary"

  return "unknown"
}
