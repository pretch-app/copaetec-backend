import { sql } from "@/lib/db"
import { getTournamentSettings, getStandings } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  try {
    await requireAdmin()

    const settings = await getTournamentSettings()
    const standings = await getStandings()

    const n = settings.num_teams_advancing
    if (![2, 4, 8, 16].includes(n)) {
      return jsonCors(request, { error: "Cantidad de equipos inválida en la configuración" }, 400)
    }

    const topTeams = standings.slice(0, n)
    if (topTeams.length < n) {
      return jsonCors(request, { error: `No hay suficientes equipos. Se necesitan ${n}, pero solo hay ${topTeams.length}.` }, 400)
    }

    let stage = "final"
    if (n === 16) stage = "round_of_16"
    else if (n === 8) stage = "quarter_finals"
    else if (n === 4) stage = "semi_finals"

    let matchday = 100
    if (n === 16) matchday = 101
    else if (n === 8) matchday = 102
    else if (n === 4) matchday = 103
    else if (n === 2) matchday = 104

    const existingRows = await sql`SELECT id FROM matches WHERE stage = ${stage} LIMIT 1`
    if (existingRows.length > 0) {
      return jsonCors(request, { error: "Ya existen partidos creados para esta fase. Bórralos primero si quieres volver a generar las llaves." }, 409)
    }

    for (let i = 0; i < n / 2; i++) {
      const homeTeam = topTeams[i]
      const awayTeam = topTeams[n - 1 - i]

      await sql`
        INSERT INTO matches (home_team_id, away_team_id, stage, matchday, status)
        VALUES (${homeTeam.team_id}, ${awayTeam.team_id}, ${stage}, ${matchday}, 'scheduled')
      `
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
