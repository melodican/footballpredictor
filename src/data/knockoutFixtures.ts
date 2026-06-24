import { TEAM_FLAGS } from './fixtures'

export type KnockoutRound = 'R32' | 'R16' | 'QF' | 'SF' | 'F'

export interface KnockoutFixture {
  id: string
  round: KnockoutRound
  matchNumber: number   // 1-16 for R32, 1-8 for R16, etc.
  homeTeam: string
  awayTeam: string
  date: string
  kickoffUtc: string
  // Bracket position — which R16 slot this feeds into
  feedsInto?: string
}

// ─── Round of 32 ─────────────────────────────────────────────────────────────
// Team names are placeholders — update with actual teams once bracket confirmed Saturday.
// Use the exact strings that appear in TEAM_FLAGS so flags render correctly.

export const R32_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_R32_1',  round: 'R32', matchNumber: 1,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-06-28', kickoffUtc: '2026-06-28T18:00:00Z', feedsInto: 'KO_R16_1' },
  { id: 'KO_R32_2',  round: 'R32', matchNumber: 2,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-06-28', kickoffUtc: '2026-06-28T22:00:00Z', feedsInto: 'KO_R16_1' },
  { id: 'KO_R32_3',  round: 'R32', matchNumber: 3,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-06-29', kickoffUtc: '2026-06-29T18:00:00Z', feedsInto: 'KO_R16_2' },
  { id: 'KO_R32_4',  round: 'R32', matchNumber: 4,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-06-29', kickoffUtc: '2026-06-29T22:00:00Z', feedsInto: 'KO_R16_2' },
  { id: 'KO_R32_5',  round: 'R32', matchNumber: 5,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-06-30', kickoffUtc: '2026-06-30T18:00:00Z', feedsInto: 'KO_R16_3' },
  { id: 'KO_R32_6',  round: 'R32', matchNumber: 6,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-06-30', kickoffUtc: '2026-06-30T22:00:00Z', feedsInto: 'KO_R16_3' },
  { id: 'KO_R32_7',  round: 'R32', matchNumber: 7,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-01', kickoffUtc: '2026-07-01T18:00:00Z', feedsInto: 'KO_R16_4' },
  { id: 'KO_R32_8',  round: 'R32', matchNumber: 8,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-01', kickoffUtc: '2026-07-01T22:00:00Z', feedsInto: 'KO_R16_4' },
  { id: 'KO_R32_9',  round: 'R32', matchNumber: 9,  homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-02', kickoffUtc: '2026-07-02T18:00:00Z', feedsInto: 'KO_R16_5' },
  { id: 'KO_R32_10', round: 'R32', matchNumber: 10, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-02', kickoffUtc: '2026-07-02T22:00:00Z', feedsInto: 'KO_R16_5' },
  { id: 'KO_R32_11', round: 'R32', matchNumber: 11, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-03', kickoffUtc: '2026-07-03T18:00:00Z', feedsInto: 'KO_R16_6' },
  { id: 'KO_R32_12', round: 'R32', matchNumber: 12, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-03', kickoffUtc: '2026-07-03T22:00:00Z', feedsInto: 'KO_R16_6' },
  { id: 'KO_R32_13', round: 'R32', matchNumber: 13, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-04', kickoffUtc: '2026-07-04T18:00:00Z', feedsInto: 'KO_R16_7' },
  { id: 'KO_R32_14', round: 'R32', matchNumber: 14, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-04', kickoffUtc: '2026-07-04T22:00:00Z', feedsInto: 'KO_R16_7' },
  { id: 'KO_R32_15', round: 'R32', matchNumber: 15, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-05', kickoffUtc: '2026-07-05T18:00:00Z', feedsInto: 'KO_R16_8' },
  { id: 'KO_R32_16', round: 'R32', matchNumber: 16, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-05', kickoffUtc: '2026-07-05T22:00:00Z', feedsInto: 'KO_R16_8' },
]

export const R16_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_R16_1', round: 'R16', matchNumber: 1, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-08', kickoffUtc: '2026-07-08T20:00:00Z', feedsInto: 'KO_QF_1' },
  { id: 'KO_R16_2', round: 'R16', matchNumber: 2, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-08', kickoffUtc: '2026-07-08T20:00:00Z', feedsInto: 'KO_QF_1' },
  { id: 'KO_R16_3', round: 'R16', matchNumber: 3, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-09', kickoffUtc: '2026-07-09T20:00:00Z', feedsInto: 'KO_QF_2' },
  { id: 'KO_R16_4', round: 'R16', matchNumber: 4, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-09', kickoffUtc: '2026-07-09T20:00:00Z', feedsInto: 'KO_QF_2' },
  { id: 'KO_R16_5', round: 'R16', matchNumber: 5, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-10', kickoffUtc: '2026-07-10T20:00:00Z', feedsInto: 'KO_QF_3' },
  { id: 'KO_R16_6', round: 'R16', matchNumber: 6, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-10', kickoffUtc: '2026-07-10T20:00:00Z', feedsInto: 'KO_QF_3' },
  { id: 'KO_R16_7', round: 'R16', matchNumber: 7, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-11', kickoffUtc: '2026-07-11T20:00:00Z', feedsInto: 'KO_QF_4' },
  { id: 'KO_R16_8', round: 'R16', matchNumber: 8, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-11', kickoffUtc: '2026-07-11T20:00:00Z', feedsInto: 'KO_QF_4' },
]

export const QF_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_QF_1', round: 'QF', matchNumber: 1, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-14', kickoffUtc: '2026-07-14T20:00:00Z', feedsInto: 'KO_SF_1' },
  { id: 'KO_QF_2', round: 'QF', matchNumber: 2, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-14', kickoffUtc: '2026-07-14T20:00:00Z', feedsInto: 'KO_SF_1' },
  { id: 'KO_QF_3', round: 'QF', matchNumber: 3, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-15', kickoffUtc: '2026-07-15T20:00:00Z', feedsInto: 'KO_SF_2' },
  { id: 'KO_QF_4', round: 'QF', matchNumber: 4, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-15', kickoffUtc: '2026-07-15T20:00:00Z', feedsInto: 'KO_SF_2' },
]

export const SF_FIXTURES: KnockoutFixture[] = [
  { id: 'KO_SF_1', round: 'SF', matchNumber: 1, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-18', kickoffUtc: '2026-07-18T20:00:00Z', feedsInto: 'KO_F_1' },
  { id: 'KO_SF_2', round: 'SF', matchNumber: 2, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-19', kickoffUtc: '2026-07-19T20:00:00Z', feedsInto: 'KO_F_1' },
]

export const FINAL_FIXTURE: KnockoutFixture = {
  id: 'KO_F_1', round: 'F', matchNumber: 1, homeTeam: 'TBD', awayTeam: 'TBD', date: '2026-07-19', kickoffUtc: '2026-07-19T20:00:00Z',
}

export const ALL_KNOCKOUT_FIXTURES: KnockoutFixture[] = [
  ...R32_FIXTURES, ...R16_FIXTURES, ...QF_FIXTURES, ...SF_FIXTURES, FINAL_FIXTURE,
]

export const KNOCKOUT_FIXTURE_IDS = new Set(ALL_KNOCKOUT_FIXTURES.map(f => f.id))

export const KO_JOKER_LIMIT = 4

export const ROUND_LABELS: Record<KnockoutRound, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF:  'Quarter-finals',
  SF:  'Semi-finals',
  F:   'Final',
}

export function getTeamFlag(team: string): string {
  if (team === 'TBD') return '🏳️'
  return TEAM_FLAGS[team] ?? '🏳️'
}
