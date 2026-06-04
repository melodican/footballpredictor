import type { ScoreLabel, ScoredFixture } from '../types'

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
