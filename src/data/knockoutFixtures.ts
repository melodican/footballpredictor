import { TEAM_FLAGS } from './fixtures'

export type KnockoutRound = 'R32' | 'R16' | 'QF' | 'SF' | 'F'

export interface KnockoutFixture {
  id: string
  round: KnockoutRound
  matchNumber: number
  homeTeam: string
  awayTeam: string
  date: string
  kickoffUtc: string
  feedsInto?: string   // which R16/QF/SF/F match this feeds into
  bracketSide: 'L' | 'R'  // left or right half of bracket
  bracketSlot: number      // position within the round column (1-indexed from top)
}

// ─── Round of 32 ─────────────────────────────────────────────────────────────
// Times converted from BST (UK, UTC+1) to UTC

export const R32_FIXTURES: KnockoutFixture[] = [
  // Left half of bracket (slots 1-8)
  { id: 'KO_R32_1',  round: 'R32', matchNumber: 1,  homeTeam: 'Germany',              awayTeam: 'Paraguay',              date: '2026-06-29', kickoffUtc: '2026-06-29T20:30:00Z', feedsInto: 'KO_R16_1', bracketSide: 'L', bracketSlot: 1 },
  { id: 'KO_R32_2',  round: 'R32', matchNumber: 2,  homeTeam: 'France',               awayTeam: 'Sweden',                date: '2026-06-30', kickoffUtc: '2026-06-30T21:00:00Z', feedsInto: 'KO_R16_1', bracketSide: 'L', bracketSlot: 2 },
  { id: 'KO_R32_3',  round: 'R32', matchNumber: 3,  homeTeam: 'South Africa',         awayTeam: 'Canada',                date: '2026-06-28', kickoffUtc: '2026-06-28T19:00:00Z', feedsInto: 'KO_R16_2', bracketSide: 'L', bracketSlot: 3 },
  { id: 'KO_R32_4',  round: 'R32', matchNumber: 4,  homeTeam: 'Netherlands',          awayTeam: 'Morocco',               date: '2026-06-30', kickoffUtc: '2026-06-30T01:00:00Z', feedsInto: 'KO_R16_2', bracketSide: 'L', bracketSlot: 4 },
  { id: 'KO_R32_5',  round: 'R32', matchNumber: 5,  homeTeam: 'Portugal',             awayTeam: 'Croatia',               date: '2026-07-02', kickoffUtc: '2026-07-02T23:00:00Z', feedsInto: 'KO_R16_3', bracketSide: 'L', bracketSlot: 5 },
  { id: 'KO_R32_6',  round: 'R32', matchNumber: 6,  homeTeam: 'Spain',                awayTeam: 'Austria',               date: '2026-07-02', kickoffUtc: '2026-07-02T19:00:00Z', feedsInto: 'KO_R16_3', bracketSide: 'L', bracketSlot: 6 },
  { id: 'KO_R32_7',  round: 'R32', matchNumber: 7,  homeTeam: 'USA',                  awayTeam: 'Bosnia & Herzegovina',  date: '2026-07-02', kickoffUtc: '2026-07-02T00:00:00Z', feedsInto: 'KO_R16_4', bracketSide: 'L', bracketSlot: 7 },
  { id: 'KO_R32_8',  round: 'R32', matchNumber: 8,  homeTeam: 'Belgium',              awayTeam: 'Senegal',               date: '2026-07-01', kickoffUtc: '2026-07-01T20:00:00Z', feedsInto: 'KO_R16_4', bracketSide: 'L', bracketSlot: 8 },
  // Right half of bracket (slots 1-8)
  { id: 'KO_R32_9',  round: 'R32', matchNumber: 9,  homeTeam: 'Brazil',               awayTeam: 'Japan',                 date: '2026-06-29', kickoffUtc: '2026-06-29T17:00:00Z', feedsInto: 'KO_R16_5', bracketSide: 'R', bracketSlot: 1 },
  { id: 'KO_R32_10', round: 'R32', matchNumber: 10, homeTeam: 'Ivory Coast',           awayTeam: 'Norway',                date: '2026-06-30', kickoffUtc: '2026-06-30T17:00:00Z', feedsInto: 'KO_R16_5', bracketSide: 'R', bracketSlot: 2 },
  { id: 'KO_R32_11', round: 'R32', matchNumber: 11, homeTeam: 'Mexico',               awayTeam: 'Ecuador',               date: '2026-07-01', kickoffUtc: '2026-07-01T01:00:00Z', feedsInto: 'KO_R16_6', bracketSide: 'R', bracketSlot: 3 },
  { id: 'KO_R32_12', round: 'R32', matchNumber: 12, homeTeam: 'England',              awayTeam: 'DR Congo',              date: '2026-07-01', kickoffUtc: '2026-07-01T16:00:00Z', feedsInto: 'KO_R16_6', bracketSide: 'R', bracketSlot: 4 },
  { id: 'KO_R32_13', round: 'R32', matchNumber: 13, homeTeam: 'Argentina',            awayTeam: 'Cape Verde',            date: '2026-07-03', kickoffUtc: '2026-07-03T22:00:00Z', feedsInto: 'KO_R16_7', bracketSide: 'R', bracketSlot: 5 },
  { id: 'KO_R32_14', round: 'R32', matchNumber: 14, homeTeam: 'Australia',            awayTeam: 'Egypt',                 date: '2026-07-03', kickoffUtc: '2026-07-03T18:00:00Z', feedsInto: 'KO_R16_7', bracketSide: 'R', bracketSlot: 6 },
  { id: 'KO_R32_15', round: 'R32', matchNumber: 15, homeTeam: 'Switzerland',          awayTeam: 'Algeria',               date: '2026-07-03', kickoffUtc: '2026-07-03T03:00:00Z', feedsInto: 'KO_R16_8', bracketSide: 'R', bracketSlot: 7 },
  { id: 'KO_R32_16', round: 'R32', matchNumber: 16, homeTeam: 'Colombia',             awayTeam: 'Ghana',                 date: '2026-07-04', kickoffUtc: '2026-07-04T01:30:00Z', feedsInto: 'KO_R16_8', bracketSide: 'R', bracketSlot: 8 },
]

export const R16_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_R16_1', round: 'R16', matchNumber: 1, homeTeam: 'Paraguay',    awayTeam: 'France',   date: '2026-07-04', kickoffUtc: '2026-07-04T21:00:00Z', feedsInto: 'KO_QF_1', bracketSide: 'L', bracketSlot: 1 },
  { id: 'KO_R16_2', round: 'R16', matchNumber: 2, homeTeam: 'Canada',      awayTeam: 'Morocco',  date: '2026-07-04', kickoffUtc: '2026-07-04T17:00:00Z', feedsInto: 'KO_QF_1', bracketSide: 'L', bracketSlot: 2 },
  { id: 'KO_R16_3', round: 'R16', matchNumber: 3, homeTeam: 'Portugal',    awayTeam: 'Spain',    date: '2026-07-06', kickoffUtc: '2026-07-06T19:00:00Z', feedsInto: 'KO_QF_2', bracketSide: 'L', bracketSlot: 3 },
  { id: 'KO_R16_4', round: 'R16', matchNumber: 4, homeTeam: 'USA',         awayTeam: 'Belgium',  date: '2026-07-07', kickoffUtc: '2026-07-07T00:00:00Z', feedsInto: 'KO_QF_2', bracketSide: 'L', bracketSlot: 4 },
  { id: 'KO_R16_5', round: 'R16', matchNumber: 5, homeTeam: 'Brazil',      awayTeam: 'Norway',   date: '2026-07-05', kickoffUtc: '2026-07-05T20:00:00Z', feedsInto: 'KO_QF_3', bracketSide: 'R', bracketSlot: 1 },
  { id: 'KO_R16_6', round: 'R16', matchNumber: 6, homeTeam: 'Mexico',      awayTeam: 'England',  date: '2026-07-06', kickoffUtc: '2026-07-06T00:00:00Z', feedsInto: 'KO_QF_3', bracketSide: 'R', bracketSlot: 2 },
  { id: 'KO_R16_7', round: 'R16', matchNumber: 7, homeTeam: 'Argentina',   awayTeam: 'Egypt',    date: '2026-07-07', kickoffUtc: '2026-07-07T16:00:00Z', feedsInto: 'KO_QF_4', bracketSide: 'R', bracketSlot: 3 },
  { id: 'KO_R16_8', round: 'R16', matchNumber: 8, homeTeam: 'Switzerland', awayTeam: 'Colombia', date: '2026-07-07', kickoffUtc: '2026-07-07T20:00:00Z', feedsInto: 'KO_QF_4', bracketSide: 'R', bracketSlot: 4 },
]

export const QF_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_QF_1', round: 'QF', matchNumber: 1, homeTeam: 'France',    awayTeam: 'Morocco',     date: '2026-07-09', kickoffUtc: '2026-07-09T20:00:00Z', feedsInto: 'KO_SF_1', bracketSide: 'L', bracketSlot: 1 },
  { id: 'KO_QF_2', round: 'QF', matchNumber: 2, homeTeam: 'Spain',     awayTeam: 'Belgium',     date: '2026-07-10', kickoffUtc: '2026-07-10T19:00:00Z', feedsInto: 'KO_SF_1', bracketSide: 'L', bracketSlot: 2 },
  { id: 'KO_QF_3', round: 'QF', matchNumber: 3, homeTeam: 'Norway',    awayTeam: 'England',     date: '2026-07-11', kickoffUtc: '2026-07-11T21:00:00Z', feedsInto: 'KO_SF_2', bracketSide: 'R', bracketSlot: 1 },
  { id: 'KO_QF_4', round: 'QF', matchNumber: 4, homeTeam: 'Argentina', awayTeam: 'Switzerland', date: '2026-07-12', kickoffUtc: '2026-07-12T01:00:00Z', feedsInto: 'KO_SF_2', bracketSide: 'R', bracketSlot: 2 },
]

export const SF_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_SF_1', round: 'SF', matchNumber: 1, homeTeam: 'France',  awayTeam: 'Spain',     date: '2026-07-14', kickoffUtc: '2026-07-14T19:00:00Z', feedsInto: 'KO_F_1', bracketSide: 'L', bracketSlot: 1 },
  { id: 'KO_SF_2', round: 'SF', matchNumber: 2, homeTeam: 'England', awayTeam: 'Argentina', date: '2026-07-15', kickoffUtc: '2026-07-15T19:00:00Z', feedsInto: 'KO_F_1', bracketSide: 'R', bracketSlot: 1 },
]

export const FINAL_FIXTURE: KnockoutFixture = {
  id: 'KO_F_1', round: 'F', matchNumber: 1, homeTeam: 'TBD', awayTeam: 'TBD',
  date: '2026-07-19', kickoffUtc: '2026-07-19T22:00:00Z',
  bracketSide: 'L', bracketSlot: 1,
}

export const ALL_KNOCKOUT_FIXTURES: KnockoutFixture[] = [
  ...R32_FIXTURES, ...R16_FIXTURES, ...QF_FIXTURES, ...SF_FIXTURES, FINAL_FIXTURE,
]

export const KNOCKOUT_FIXTURE_MAP: Record<string, KnockoutFixture> = Object.fromEntries(
  ALL_KNOCKOUT_FIXTURES.map(f => [f.id, f])
)

export const KNOCKOUT_FIXTURE_IDS = new Set(ALL_KNOCKOUT_FIXTURES.map(f => f.id))

export const KO_JOKER_LIMIT = 4 // R32 default (kept for dashboard compat)

export const KO_ROUND_JOKER_LIMITS: Partial<Record<KnockoutRound, number>> = {
  R32: 4,
  R16: 3,
  QF: 2,
  SF: 1,
  F: 1,
}

export const ROUND_FIXTURES: Partial<Record<KnockoutRound, KnockoutFixture[]>> = {
  R32: R32_FIXTURES,
  R16: R16_FIXTURES,
  QF: QF_FIXTURES,
  SF: SF_FIXTURES,
  F: [FINAL_FIXTURE],
}

// Maps each fixture to the two fixtures whose winners play in it (home, away)
export const BRACKET_SOURCES: Record<string, { home: string; away: string }> = {
  KO_R16_1: { home: 'KO_R32_1',  away: 'KO_R32_2'  },
  KO_R16_2: { home: 'KO_R32_3',  away: 'KO_R32_4'  },
  KO_R16_3: { home: 'KO_R32_5',  away: 'KO_R32_6'  },
  KO_R16_4: { home: 'KO_R32_7',  away: 'KO_R32_8'  },
  KO_R16_5: { home: 'KO_R32_9',  away: 'KO_R32_10' },
  KO_R16_6: { home: 'KO_R32_11', away: 'KO_R32_12' },
  KO_R16_7: { home: 'KO_R32_13', away: 'KO_R32_14' },
  KO_R16_8: { home: 'KO_R32_15', away: 'KO_R32_16' },
  KO_QF_1:  { home: 'KO_R16_1',  away: 'KO_R16_2'  },
  KO_QF_2:  { home: 'KO_R16_3',  away: 'KO_R16_4'  },
  KO_QF_3:  { home: 'KO_R16_5',  away: 'KO_R16_6'  },
  KO_QF_4:  { home: 'KO_R16_7',  away: 'KO_R16_8'  },
  KO_SF_1:  { home: 'KO_QF_1',   away: 'KO_QF_2'   },
  KO_SF_2:  { home: 'KO_QF_3',   away: 'KO_QF_4'   },
  KO_F_1:   { home: 'KO_SF_1',   away: 'KO_SF_2'   },
}

export const ROUND_LABELS: Record<KnockoutRound, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF:  'Quarter-finals',
  SF:  'Semi-finals',
  F:   'Final',
}

export function getTeamFlag(team: string): string {
  if (!team || team === 'TBD') return '🏳️'
  return TEAM_FLAGS[team] ?? '🏳️'
}

/** Returns the winning team name given a result, or null if draw/no result */
export function getWinner(fixture: KnockoutFixture, result: { home_score: number; away_score: number } | undefined): string | null {
  if (!result) return null
  if (result.home_score > result.away_score) return fixture.homeTeam
  if (result.away_score > result.home_score) return fixture.awayTeam
  return null
}
