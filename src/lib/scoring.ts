import type { Fixture, ScoreLabel, ScoredFixture } from '../types'

export interface TeamStanding {
  team: string
  played: number
  points: number
  gf: number
  ga: number
  gd: number
  won: number
  drawn: number
  lost: number
}

/** Calculate group standings from a map of fixture scores (predicted or actual).
 *  Only fixtures that have a score in the map are counted. */
export function calculateGroupStandings(
  teams: string[],
  fixtures: Fixture[],
  scores: Record<string, { home: number; away: number }>,
): TeamStanding[] {
  const s: Record<string, TeamStanding> = {}
  for (const t of teams) s[t] = { team: t, played: 0, points: 0, gf: 0, ga: 0, gd: 0, won: 0, drawn: 0, lost: 0 }

  for (const f of fixtures) {
    const score = scores[f.id]
    if (!score || score.home == null || score.away == null) continue
    const h = s[f.homeTeam], a = s[f.awayTeam]
    if (!h || !a) continue
    h.played++; a.played++
    h.gf += score.home; h.ga += score.away
    a.gf += score.away; a.ga += score.home
    h.gd = h.gf - h.ga; a.gd = a.gf - a.ga
    if (score.home > score.away) { h.won++; h.points += 3; a.lost++ }
    else if (score.home < score.away) { a.won++; a.points += 3; h.lost++ }
    else { h.drawn++; h.points++; a.drawn++; a.points++ }
  }

  const list = Object.values(s)

  // Sort: points → head-to-head result → head-to-head GD → overall GD → goals scored
  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    // Head-to-head
    const h2h = fixtures.find(f =>
      (f.homeTeam === a.team && f.awayTeam === b.team) ||
      (f.homeTeam === b.team && f.awayTeam === a.team),
    )
    if (h2h) {
      const sc = scores[h2h.id]
      if (sc) {
        const aIsHome = h2h.homeTeam === a.team
        const ah = aIsHome ? sc.home : sc.away
        const ag = aIsHome ? sc.away : sc.home
        if (ah > ag) return -1
        if (ah < ag) return 1
        const aHGD = ah - ag, bHGD = ag - ah
        if (aHGD !== bHGD) return bHGD - aHGD
      }
    }
    if (b.gd !== a.gd) return b.gd - a.gd
    return b.gf - a.gf
  })
  return list
}

export const GROUP_WINNER_POINTS = 5

export function scoreFixture(
  prediction: { home: number; away: number } | null,
  result: { home: number; away: number } | null,
  isJoker: boolean,
  isFinal = false,
): ScoredFixture {
  if (!prediction) return { label: null, points: 0, prediction: null }
  if (!result) return { label: null, points: 0, prediction }

  const correctScore =
    prediction.home === result.home && prediction.away === result.away

  const predictedOutcome = Math.sign(prediction.home - prediction.away)
  const actualOutcome = Math.sign(result.home - result.away)
  const correctResult = predictedOutcome === actualOutcome

  let points = 0
  let label: ScoreLabel = '/'

  if (correctScore) {
    points = 5
    label = isJoker ? 'SJ' : 'S'
  } else if (correctResult) {
    points = 2
    label = isJoker ? 'RJ' : 'R'
  }

  if (isJoker) points *= 2
  if (isFinal) points *= 2 // forced double in final

  return { label, points, prediction }
}

export function labelColor(label: ScoreLabel): string {
  switch (label) {
    case 'S':
    case 'SJ':
      return 'bg-amber-400 text-black'
    case 'R':
    case 'RJ':
      return 'bg-emerald-500 text-white'
    case '/':
      return 'bg-zinc-700 text-zinc-400'
    default:
      return 'bg-zinc-800 text-zinc-500'
  }
}
