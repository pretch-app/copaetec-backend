export type Team = {
  id: number
  name: string
  slug: string
  captain: string | null
  grupo: string | null
  photo_url: string | null
  escudo_url: string | null
}

export type Player = {
  id: number
  team_id: number
  name: string
  number: number | null
  position: string | null
}

export type MatchStatus = "scheduled" | "finished"

export type Match = {
  id: number
  matchday: number
  kickoff: string | null
  venue: string | null
  home_team_id: number
  away_team_id: number
  home_score: number | null
  away_score: number | null
  status: MatchStatus
  report: string | null
  stage: string
  home_penalties?: number | null
  away_penalties?: number | null
  is_extra_time?: boolean
  home_name?: string
  home_slug?: string
  home_escudo_url?: string | null
  away_name?: string
  away_slug?: string
  away_escudo_url?: string | null
}

export type MatchEvent = {
  id: number
  match_id: number
  team_id: number
  player_id: number | null
  player_name: string
  event_type: "goal" | "penalty_goal" | "own_goal" | "yellow_card" | "red_card" | "foul" | "shootout_goal" | "shootout_miss"
  minute: number | null
  created_at: string
}

export type GalleryItem = {
  id: number
  url: string
  caption: string | null
  created_at: string
}

export type StandingRow = {
  team_id: number
  name: string
  slug: string
  grupo: string | null
  escudo_url: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

export type Scorer = {
  scorer_name: string
  team_name: string
  team_slug: string
  escudo_url: string | null
  goals: number
}

export type TournamentSettings = {
  id: number
  tournament_name: string
  format: "general" | "groups" | "both"
  knockout_source: "general" | "groups"
  num_teams_advancing: number
  match_duration: number
  group_tiebreaker: "none" | "penalties" | "extra_time" | "extra_time_and_penalties"
  knockout_tiebreaker: "none" | "penalties" | "extra_time" | "extra_time_and_penalties"
  updated_at: string
}

export type User = {
  id: number
  email: string
  display_name: string
  role: "user" | "admin"
  created_at: string
}

export type Prediction = {
  id: number
  user_id: number
  match_id: number
  predicted_home: number
  predicted_away: number
  points_awarded: number | null
  created_at: string
  updated_at: string
}

export type ProdeRankingEntry = {
  user_id: number
  display_name: string
  total_points: number
  total_predictions: number
  exact_hits: number
  winner_hits: number
}

export type News = {
  id: number
  title: string
  content: string
  image_url: string | null
  youtube_id: string | null
  color: string
  author_id: number | null
  created_at: string
}

export type NewsWithAuthor = News & {
  author_name: string | null
}
