import { sql } from "@/lib/db"
import { getTeams } from "@/lib/queries"
import { requireAdmin } from "@/lib/auth"
import { jsonCors, preflight } from "@/lib/cors"
import { handleApiError, toBool, validateRequestOrigin } from "@/lib/api-helpers"

export async function OPTIONS(request: Request) {
  return preflight(request)
}

export async function POST(request: Request) {
  try {
    const originError = validateRequestOrigin(request)
    if (originError) return originError
    await requireAdmin()
    const body = await request.json()
    const isDoubleRoundRobin = toBool(body.double_round_robin) ?? false
    const clearExisting = toBool(body.clear_existing) ?? false
    const randomize = toBool(body.randomize) ?? false

    if (clearExisting) {
      await sql`DELETE FROM matches WHERE (stage = 'group' OR stage IS NULL) AND COALESCE(status, 'scheduled') <> 'finished'`
    }

    const allTeams = await getTeams()

    const groups: Record<string, typeof allTeams> = {}
    for (const t of allTeams) {
      const g = t.grupo || "General"
      if (!groups[g]) groups[g] = []
      groups[g].push(t)
    }

    for (const [, groupTeams] of Object.entries(groups)) {
      if (groupTeams.length < 2) continue

      let teams = [...groupTeams]
      if (randomize) {
        teams = teams.sort(() => Math.random() - 0.5)
      }

      const n = teams.length
      const hasGhost = n % 2 !== 0
      const totalTeams = hasGhost ? n + 1 : n
      const indices = Array.from({ length: totalTeams }, (_, i) => i)
      const numRounds = totalTeams - 1
      const half = totalTeams / 2

      const matchesToInsert: { homeId: number; awayId: number; matchday: number }[] = []

      for (let round = 0; round < numRounds; round++) {
        for (let i = 0; i < half; i++) {
          const homeIdx = indices[i]
          const awayIdx = indices[totalTeams - 1 - i]

          if (hasGhost && (homeIdx === totalTeams - 1 || awayIdx === totalTeams - 1)) {
            continue
          }

          let homeTeam = teams[homeIdx]
          let awayTeam = teams[awayIdx]

          if (i === 0 && round % 2 !== 0) {
            const temp = homeTeam
            homeTeam = awayTeam
            awayTeam = temp
          }

          matchesToInsert.push({
            homeId: homeTeam.id,
            awayId: awayTeam.id,
            matchday: round + 1,
          })
        }

        indices.splice(1, 0, indices.pop()!)
      }

      if (isDoubleRoundRobin) {
        const existingCount = matchesToInsert.length
        for (let i = 0; i < existingCount; i++) {
          const m = matchesToInsert[i]
          matchesToInsert.push({
            homeId: m.awayId,
            awayId: m.homeId,
            matchday: m.matchday + numRounds,
          })
        }
      }

      for (const m of matchesToInsert) {
        await sql`
          INSERT INTO matches (matchday, kickoff, venue, home_team_id, away_team_id, status, stage)
          VALUES (${m.matchday}, NULL, NULL, ${m.homeId}, ${m.awayId}, 'scheduled', 'group')
        `
      }
    }

    return jsonCors(request, { success: true })
  } catch (err) {
    return handleApiError(request, err)
  }
}
