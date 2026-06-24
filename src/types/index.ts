export type Group = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L'
export const GROUPS: Group[] = ['A','B','C','D','E','F','G','H','I','J','K','L']

export interface Fixture {
  id: string
  homeTeam: string
  awayTeam: string
  group: Group
  matchday: 1 | 2 | 3
  date: string
  kickoffUtc?: string  // ISO datetime e.g. "2026-06-11T19:00:00Z"
}

export interface Participant {
  id: string
  name: string
  winner_pick: string
  top_scorer_pick: string
  submitted_at: string
}

export interface Prediction {
  id: string
  participant_id: string
  fixture_id: string
  home_score: number
  away_score: number
  is_joker: boolean
}

export interface Result {
  fixture_id: string
  home_score: number
  away_score: number
  entered_at: string
}

export interface TournamentSettings {
  entries_open: boolean
  predictions_revealed: boolean
  knockout_entries_open: boolean
  current_phase: 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
}

export type ScoreLabel = 'S' | 'SJ' | 'R' | 'RJ' | '/' | null

export interface ScoredFixture {
  label: ScoreLabel
  points: number
  prediction: { home: number; away: number } | null
}

// Entry form state (local, not saved until submit)
export interface EntryFormState {
  name: string
  winner_pick: string
  top_scorer_pick: string
  predictions: Record<string, { home: number | ''; away: number | '' }>
  jokers: Record<Group, string> // group -> fixture_id
}
