import { sql } from "./db"
import { getMatchById } from "./queries"

function calculatePoints(predHome: number, predAway: number, actualHome: number, actualAway: number): number {
  if (predHome === actualHome && predAway === actualAway) return 5

  const predDiff = predHome - predAway
  const actualDiff = actualHome - actualAway

  if (predDiff === actualDiff) return 3

  const predResult = Math.sign(predDiff)
  const actualResult = Math.sign(actualDiff)
  if (predResult === actualResult) return 2

  return 0
}

export async function calculateMatchPoints(matchId: number) {
  const match = await getMatchById(matchId)
  if (!match || match.status !== "finished" || match.home_score === null || match.away_score === null) {
    throw new Error("El partido no está finalizado o faltan resultados")
  }

  const predictions = await sql`SELECT id, predicted_home, predicted_away FROM predictions WHERE match_id = ${matchId}`

  for (const pred of predictions) {
    const pts = calculatePoints(pred.predicted_home, pred.predicted_away, match.home_score, match.away_score)
    await sql`UPDATE predictions SET points_awarded = ${pts} WHERE id = ${pred.id}`
  }
}
