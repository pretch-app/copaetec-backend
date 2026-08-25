import { sql } from "./db"
import type { Team, Match, MatchEvent, Player, GalleryItem, StandingRow, Scorer, TournamentSettings, NewsWithAuthor, User, ProdeRankingEntry } from "./types"

export async function getTeams(): Promise<Team[]> {
  return (await sql`SELECT * FROM teams ORDER BY name ASC`) as Team[]
}

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  const rows = (await sql`SELECT * FROM teams WHERE slug = ${slug} LIMIT 1`) as Team[]
  return rows[0] ?? null
}

export async function getPlayersByTeam(teamId: number): Promise<Player[]> {
  return (await sql`
    SELECT * FROM players WHERE team_id = ${teamId}
    ORDER BY COALESCE(number, 999) ASC, name ASC
  `) as Player[]
}

const matchSelect = `
  SELECT m.*, 
    ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
  FROM matches m
  JOIN teams ht ON ht.id = m.home_team_id
  JOIN teams at ON at.id = m.away_team_id
`

export async function getMatches(): Promise<Match[]> {
  return (await sql`
    SELECT m.*, 
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    ORDER BY m.matchday ASC, m.kickoff ASC NULLS LAST, m.id ASC
  `) as Match[]
}

export async function getFinishedMatches(): Promise<Match[]> {
  return (await sql`
    SELECT m.*, 
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.status = 'finished'
    ORDER BY m.matchday DESC, m.kickoff DESC NULLS LAST, m.id DESC
  `) as Match[]
}

export async function getMatchById(id: number): Promise<Match | null> {
  const rows = (await sql`
    SELECT m.*, 
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.id = ${id} LIMIT 1
  `) as Match[]
  return rows[0] ?? null
}

export async function getEventsByMatch(matchId: number): Promise<MatchEvent[]> {
  return (await sql`SELECT * FROM match_events WHERE match_id = ${matchId} ORDER BY minute ASC NULLS LAST, id ASC`) as MatchEvent[]
}

export async function getMatchesByTeam(teamId: number): Promise<Match[]> {
  return (await sql`
    SELECT m.*, 
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.home_team_id = ${teamId} OR m.away_team_id = ${teamId}
    ORDER BY m.matchday ASC, m.kickoff ASC NULLS LAST, m.id ASC
  `) as Match[]
}

export async function getAllPlayers(): Promise<Player[]> {
  return (await sql`SELECT * FROM players ORDER BY team_id ASC, COALESCE(number, 999) ASC, name ASC`) as Player[]
}

export async function getAllEvents(): Promise<MatchEvent[]> {
  return (await sql`SELECT * FROM match_events ORDER BY match_id ASC, id ASC`) as MatchEvent[]
}

export async function getGallery(): Promise<GalleryItem[]> {
  return (await sql`SELECT * FROM gallery ORDER BY created_at DESC`) as GalleryItem[]
}

export async function getStandings(): Promise<StandingRow[]> {
  return (await sql`
    WITH results AS (
      SELECT home_team_id AS team_id, home_score AS gf, away_score AS ga FROM matches WHERE status = 'finished' AND stage = 'group'
      UNION ALL
      SELECT away_team_id AS team_id, away_score AS gf, home_score AS ga FROM matches WHERE status = 'finished' AND stage = 'group'
    )
    SELECT
      t.id AS team_id,
      t.name,
      t.slug,
      t.grupo,
      t.escudo_url,
      COUNT(r.team_id)::int AS played,
      COALESCE(SUM(CASE WHEN r.gf > r.ga THEN 1 ELSE 0 END),0)::int AS won,
      COALESCE(SUM(CASE WHEN r.gf = r.ga THEN 1 ELSE 0 END),0)::int AS drawn,
      COALESCE(SUM(CASE WHEN r.gf < r.ga THEN 1 ELSE 0 END),0)::int AS lost,
      COALESCE(SUM(r.gf),0)::int AS goals_for,
      COALESCE(SUM(r.ga),0)::int AS goals_against,
      COALESCE(SUM(r.gf - r.ga),0)::int AS goal_diff,
      COALESCE(SUM(CASE WHEN r.gf > r.ga THEN 3 WHEN r.gf = r.ga THEN 1 ELSE 0 END),0)::int AS points
    FROM teams t
    LEFT JOIN results r ON r.team_id = t.id
    GROUP BY t.id, t.name, t.slug, t.grupo, t.escudo_url
    ORDER BY points DESC, goal_diff DESC, goals_for DESC, t.name ASC
  `) as StandingRow[]
}

export async function getTopScorers(limit = 10): Promise<Scorer[]> {
  return (await sql`
    SELECT e.player_name AS scorer_name, t.name AS team_name, t.slug AS team_slug, t.escudo_url, COUNT(e.id)::int AS goals
    FROM match_events e
    JOIN teams t ON t.id = e.team_id
    WHERE e.event_type IN ('goal', 'penalty_goal')
    GROUP BY e.player_name, t.name, t.slug, t.escudo_url
    ORDER BY goals DESC, e.player_name ASC
    LIMIT ${limit}
  `) as Scorer[]
}

export type TournamentStats = {
  totalGoals: number
  totalMatches: number
  avgGoalsPerMatch: number
  bestAttack: { name: string; slug: string; goals_for: number } | null
  bestDefense: { name: string; slug: string; goals_against: number } | null
  biggestWin: Match | null
}

export async function getTournamentStats(): Promise<TournamentStats> {
  const standings = await getStandings()
  const played = standings.filter((s) => s.played > 0)

  const totalGoalsRows = (await sql`SELECT COUNT(*)::int AS total FROM match_events WHERE event_type IN ('goal', 'penalty_goal', 'own_goal')`) as {
    total: number
  }[]
  const totalMatchesRows = (await sql`SELECT COUNT(*)::int AS total FROM matches WHERE status = 'finished'`) as {
    total: number
  }[]

  const totalGoals = totalGoalsRows[0]?.total ?? 0
  const totalMatches = totalMatchesRows[0]?.total ?? 0

  const bestAttack =
    played.length > 0
      ? [...played].sort((a, b) => b.goals_for - a.goals_for)[0]
      : null
  const bestDefense =
    played.length > 0
      ? [...played].sort((a, b) => a.goals_against - b.goals_against)[0]
      : null

  const biggestWinRows = (await sql`
    SELECT m.*, 
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.status = 'finished'
    ORDER BY ABS(m.home_score - m.away_score) DESC, (m.home_score + m.away_score) DESC
    LIMIT 1
  `) as Match[]

  return {
    totalGoals,
    totalMatches,
    avgGoalsPerMatch: totalMatches > 0 ? Math.round((totalGoals / totalMatches) * 10) / 10 : 0,
    bestAttack: bestAttack ? { name: bestAttack.name, slug: bestAttack.slug, goals_for: bestAttack.goals_for } : null,
    bestDefense: bestDefense
      ? { name: bestDefense.name, slug: bestDefense.slug, goals_against: bestDefense.goals_against }
      : null,
    biggestWin: biggestWinRows[0] ?? null,
  }
}

export async function getTournamentSettings(): Promise<TournamentSettings> {
  const rows = await sql`SELECT * FROM tournament_settings LIMIT 1`
  if (rows.length === 0) {
    return {
      id: 1,
      tournament_name: "Copa ETec 2026",
      format: "general",
      knockout_source: "general",
      num_teams_advancing: 8,
      match_duration: 90,
      group_tiebreaker: "none",
      knockout_tiebreaker: "penalties",
      updated_at: new Date().toISOString()
    }
  }
  return {
    ...rows[0],
    match_duration: rows[0].match_duration ?? 90,
    group_tiebreaker: rows[0].group_tiebreaker ?? "none",
    knockout_tiebreaker: rows[0].knockout_tiebreaker ?? "penalties"
  } as TournamentSettings
}

// --- Users ---

export async function getUserByEmail(email: string) {
  const rows = await sql`SELECT * FROM users WHERE email = ${email} LIMIT 1`
  return rows[0] ?? null
}

export async function getUserById(id: number) {
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`
  return rows[0] ?? null
}

export async function getAllUsers(): Promise<User[]> {
  return (await sql`SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC`) as User[]
}

// --- Predictions ---

export async function getPredictionsByUser(userId: number) {
  return await sql`
    SELECT p.*, 
      m.matchday, m.kickoff, m.status as match_status, m.home_score, m.away_score, m.stage,
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM predictions p
    JOIN matches m ON m.id = p.match_id
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE p.user_id = ${userId}
    ORDER BY m.kickoff ASC NULLS LAST, m.id ASC
  `
}

export async function getUpcomingMatchesForProde() {
  return await sql`
    SELECT m.*, 
      ht.name AS home_name, ht.slug AS home_slug, ht.escudo_url AS home_escudo_url,
      at.name AS away_name, at.slug AS away_slug, at.escudo_url AS away_escudo_url
    FROM matches m
    JOIN teams ht ON ht.id = m.home_team_id
    JOIN teams at ON at.id = m.away_team_id
    WHERE m.status = 'scheduled'
    ORDER BY m.matchday ASC, m.kickoff ASC NULLS LAST, m.id ASC
  `
}

export async function getProdeRanking(limit = 100): Promise<ProdeRankingEntry[]> {
  return await sql`
    SELECT 
      u.id AS user_id,
      u.display_name,
      COALESCE(SUM(p.points_awarded), 0)::int AS total_points,
      COUNT(p.id)::int AS total_predictions,
      COALESCE(SUM(CASE WHEN p.points_awarded = 5 THEN 1 ELSE 0 END), 0)::int AS exact_hits,
      COALESCE(SUM(CASE WHEN p.points_awarded = 2 THEN 1 ELSE 0 END), 0)::int AS winner_hits
    FROM users u
    LEFT JOIN predictions p ON p.user_id = u.id AND p.points_awarded IS NOT NULL
    GROUP BY u.id, u.display_name
    ORDER BY total_points DESC, exact_hits DESC, winner_hits DESC, u.display_name ASC
    LIMIT ${limit}
  ` as ProdeRankingEntry[]
}

export async function getUserProdeStats(userId: number) {
  const ranking = await getProdeRanking(1000)
  const rankIndex = ranking.findIndex(r => r.user_id === userId)
  const userStats = ranking[rankIndex]

  if (!userStats) return null

  return {
    rank: rankIndex + 1,
    ...userStats
  }
}

// --- News ---


export async function getAllNews(): Promise<NewsWithAuthor[]> {
  const rows = await sql`
    SELECT 
      n.id, n.title, n.content, n.image_url, n.youtube_id, n.color, n.author_id, n.created_at,
      u.display_name as author_name
    FROM news n
    LEFT JOIN users u ON n.author_id = u.id
    ORDER BY n.created_at DESC
  `
  return rows as NewsWithAuthor[]
}

export async function getNewsById(id: number): Promise<NewsWithAuthor | null> {
  const rows = await sql`
    SELECT 
      n.id, n.title, n.content, n.image_url, n.youtube_id, n.color, n.author_id, n.created_at,
      u.display_name as author_name
    FROM news n
    LEFT JOIN users u ON n.author_id = u.id
    WHERE n.id = ${id}
    LIMIT 1
  `
  return rows[0] as NewsWithAuthor ?? null
}
