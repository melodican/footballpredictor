import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { FIXTURES, FIXTURES_BY_GROUP, TEAM_FLAGS, GROUP_TEAMS } from '../data/fixtures'
import { scoreFixture, labelColor, calculateGroupStandings, GROUP_WINNER_POINTS } from '../lib/scoring'
import type { Participant, Prediction, Result, TournamentSettings, Group } from '../types'
import { GROUPS } from '../types'

export default function DashboardPage() {
  const [settings, setSettings] = useState<TournamentSettings | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [activeGroup, setActiveGroup] = useState<Group | 'played'>('played')
  const [expandedParticipant, setExpandedParticipant] = useState<string | null>(null)

  async function load() {
    const [sRes, pRes, predRes, rRes] = await Promise.all([
      supabase.from('tournament_settings').select('*').eq('id', 1).single(),
      supabase.from('participants').select('*').order('submitted_at'),
      supabase.from('predictions').select('*'),
      supabase.from('results').select('*'),
    ])
    if (sRes.data) setSettings(sRes.data as TournamentSettings)
    if (pRes.data) setParticipants(pRes.data as Participant[])
    if (predRes.data) setPredictions(predRes.data as Prediction[])
    if (rRes.data) setResults(rRes.data as Result[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, () => {
        supabase.from('results').select('*').then(({ data }) => { if (data) setResults(data as Result[]) })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, () => {
        supabase.from('participants').select('*').order('submitted_at').then(({ data }) => { if (data) setParticipants(data as Participant[]) })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_settings' }, () => {
        supabase.from('tournament_settings').select('*').eq('id', 1).single().then(({ data }) => { if (data) setSettings(data as TournamentSettings) })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const resultsMap = useMemo(() => {
    const m: Record<string, Result> = {}
    for (const r of results) m[r.fixture_id] = r
    return m
  }, [results])

  const predsByParticipant = useMemo(() => {
    const m: Record<string, Prediction[]> = {}
    for (const p of predictions) {
      if (!m[p.participant_id]) m[p.participant_id] = []
      m[p.participant_id].push(p)
    }
    return m
  }, [predictions])

  // Actual group winners — only set once all 6 results are in for that group
  const actualGroupWinners = useMemo(() => {
    const winners: Record<Group, string | null> = {} as Record<Group, string | null>
    for (const g of GROUPS) {
      const fixtures = FIXTURES_BY_GROUP[g]
      const allIn = fixtures.every(f => resultsMap[f.id])
      if (!allIn) { winners[g] = null; continue }
      const scores: Record<string, { home: number; away: number }> = {}
      for (const f of fixtures) {
        const r = resultsMap[f.id]
        if (r) scores[f.id] = { home: r.home_score, away: r.away_score }
      }
      const standings = calculateGroupStandings(GROUP_TEAMS[g], fixtures, scores)
      winners[g] = standings[0]?.team ?? null
    }
    return winners
  }, [resultsMap])

  // Predicted group winner per participant per group
  const predictedGroupWinners = useMemo(() => {
    const result: Record<string, Record<Group, string>> = {}
    for (const participant of participants) {
      const preds = predsByParticipant[participant.id] || []
      const predMap: Record<string, { home: number; away: number }> = {}
      for (const p of preds) predMap[p.fixture_id] = { home: p.home_score, away: p.away_score }

      result[participant.id] = {} as Record<Group, string>
      for (const g of GROUPS) {
        const fixtures = FIXTURES_BY_GROUP[g]
        const standings = calculateGroupStandings(GROUP_TEAMS[g], fixtures, predMap)
        result[participant.id][g] = standings[0]?.team ?? ''
      }
    }
    return result
  }, [participants, predsByParticipant])

  const leaderboard = useMemo(() => {
    return participants
      .map(p => {
        const preds = predsByParticipant[p.id] || []
        let matchPoints = 0
        for (const pred of preds) {
          const result = resultsMap[pred.fixture_id]
          if (!result) continue
          matchPoints += scoreFixture(
            { home: pred.home_score, away: pred.away_score },
            { home: result.home_score, away: result.away_score },
            pred.is_joker,
          ).points
        }

        // Group winner bonus points
        let groupWinnerPoints = 0
        const myWinners = predictedGroupWinners[p.id] || {}
        for (const g of GROUPS) {
          if (actualGroupWinners[g] && myWinners[g] === actualGroupWinners[g]) {
            groupWinnerPoints += GROUP_WINNER_POINTS
          }
        }

        return { ...p, matchPoints, groupWinnerPoints, total: matchPoints + groupWinnerPoints }
      })
      .sort((a, b) => b.total - a.total)
  }, [participants, predsByParticipant, resultsMap, predictedGroupWinners, actualGroupWinners])

  const filteredFixtures = activeGroup === 'played'
    ? FIXTURES.filter(f => resultsMap[f.id] !== undefined)
    : FIXTURES_BY_GROUP[activeGroup]

  const groupsCompleted = GROUPS.filter(g => actualGroupWinners[g] !== null).length

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm animate-pulse">Loading dashboard…</div>
      </div>
    )
  }

  const revealed = settings?.predictions_revealed ?? false

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-16">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-amber-500/6 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative border-b border-zinc-800/60 px-5 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight">
              <span className="gradient-text">WC2026</span> Predictor
            </h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500 font-medium">
              <span>👥 {participants.length} players</span>
              <span>🎯 {results.length} results in</span>
              {groupsCompleted > 0 && <span>🏁 {groupsCompleted}/12 groups complete</span>}
              {!revealed && <span className="text-amber-400/70">🔒 Hidden until entries close</span>}
            </div>
          </div>
          {settings?.entries_open && (
            <a href="/enter" className="btn-gold text-xs font-bold px-4 py-2 rounded-xl">Enter →</a>
          )}
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-5 mt-6 space-y-6">

        {!revealed && (
          <div className="glass rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Players entered</h2>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">{participants.length} entries</span>
            </div>
            {participants.length === 0 ? (
              <p className="text-zinc-500 text-sm">No entries yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {participants.map(p => (
                  <div key={p.id} className="bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-full text-sm font-semibold">{p.name}</div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-600 pt-1">Predictions are hidden until the entry window closes.</p>
          </div>
        )}

        {revealed && (
          <>
            {/* Leaderboard */}
            <div className="glass rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/6 flex items-center justify-between">
                <h2 className="font-black text-lg">🏆 Leaderboard</h2>
                <div className="text-xs text-zinc-500 flex items-center gap-3">
                  <span>{results.length} results in</span>
                  {groupsCompleted > 0 && <span className="text-amber-400">{groupsCompleted} groups done (+5pts each)</span>}
                </div>
              </div>
              <div className="divide-y divide-white/5">
                {leaderboard.map((p, i) => (
                  <div key={p.id} className="px-6 py-3.5 flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-lg shadow-amber-500/30' :
                      i === 1 ? 'bg-zinc-300 text-zinc-900' :
                      i === 2 ? 'bg-amber-700 text-white' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{p.name}</div>
                      <div className="text-xs text-zinc-500 truncate hidden sm:flex items-center gap-2">
                        <span>🏆 {p.winner_pick}</span>
                        <span>⚽ {p.top_scorer_pick}</span>
                        {p.groupWinnerPoints > 0 && (
                          <span className="text-amber-400">🏁 +{p.groupWinnerPoints} group bonus</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-black ${i === 0 ? 'gradient-text' : 'text-white'}`}>
                        {p.total}
                        <span className="text-xs text-zinc-500 font-normal ml-1">pts</span>
                      </div>
                      {p.groupWinnerPoints > 0 && (
                        <div className="text-xs text-amber-400 font-semibold">{p.matchPoints} + {p.groupWinnerPoints}</div>
                      )}
                    </div>
                  </div>
                ))}
                {leaderboard.length === 0 && (
                  <div className="px-6 py-10 text-center text-zinc-500 text-sm">No results entered yet</div>
                )}
              </div>
            </div>

            {/* Group filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <FilterTab label="Results so far" active={activeGroup === 'played'} onClick={() => setActiveGroup('played')} />
              {GROUPS.map(g => (
                <FilterTab key={g} label={`Group ${g}`} active={activeGroup === g} onClick={() => setActiveGroup(g)} />
              ))}
            </div>

            {/* Fixture grid */}
            {filteredFixtures.length > 0 ? (
              <div className="space-y-4">
                {filteredFixtures.map(fixture => {
                  const result = resultsMap[fixture.id]
                  return (
                    <div key={fixture.id} className="glass rounded-2xl overflow-hidden">
                      <div className="px-5 py-3 bg-zinc-800/60 flex items-center justify-between">
                        <div className="text-sm font-bold">
                          {TEAM_FLAGS[fixture.homeTeam]} {fixture.homeTeam}
                          <span className="text-zinc-500 mx-2">vs</span>
                          {fixture.awayTeam} {TEAM_FLAGS[fixture.awayTeam]}
                        </div>
                        {result ? (
                          <div className="bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black text-sm px-3 py-1 rounded-full">
                            {result.home_score} – {result.away_score}
                          </div>
                        ) : (
                          <div className="text-zinc-600 text-xs">Pending</div>
                        )}
                      </div>
                      <div className="divide-y divide-white/5">
                        {leaderboard.map(participant => {
                          const pred = (predsByParticipant[participant.id] || []).find(p => p.fixture_id === fixture.id)
                          if (!pred) return null
                          const scored = result
                            ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
                            : null
                          return (
                            <div key={participant.id} className="px-5 py-2.5 flex items-center gap-3">
                              <div className="w-28 text-sm font-semibold truncate text-zinc-300">{participant.name}</div>
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-sm font-black">{pred.home_score} – {pred.away_score}</span>
                                {pred.is_joker && <span className="text-amber-400 text-xs font-black">★</span>}
                              </div>
                              {scored && (
                                <span className={`px-2 py-0.5 rounded-lg text-xs font-black ${labelColor(scored.label)}`}>
                                  {scored.label === null ? '–' : scored.label}
                                  {scored.points > 0 && ` +${scored.points}`}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="glass rounded-2xl px-6 py-10 text-center text-zinc-500 text-sm">
                {activeGroup === 'played' ? 'No results entered yet.' : `No results yet for Group ${activeGroup}.`}
              </div>
            )}

            {/* Full player breakdown */}
            <div className="glass rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/6">
                <h2 className="font-black text-lg">All Predictions</h2>
                <p className="text-zinc-500 text-xs mt-0.5">Tap a player to see their full picks + group winner predictions</p>
              </div>
              <div className="divide-y divide-white/5">
                {leaderboard.map(p => (
                  <div key={p.id}>
                    <button
                      className="w-full px-6 py-4 flex items-center gap-3 hover:bg-white/3 transition text-left"
                      onClick={() => setExpandedParticipant(expandedParticipant === p.id ? null : p.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">{p.name}</div>
                        <div className="text-xs text-zinc-500">🏆 {p.winner_pick} · ⚽ {p.top_scorer_pick}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-amber-400">{p.total} pts</div>
                        {p.groupWinnerPoints > 0 && (
                          <div className="text-xs text-amber-500">{p.matchPoints} + {p.groupWinnerPoints}</div>
                        )}
                      </div>
                      <div className="text-zinc-600 text-xs ml-1">{expandedParticipant === p.id ? '▲' : '▼'}</div>
                    </button>
                    {expandedParticipant === p.id && (
                      <ParticipantDetail
                        participant={p}
                        preds={predsByParticipant[p.id] || []}
                        resultsMap={resultsMap}
                        predictedWinners={predictedGroupWinners[p.id] || {} as Record<Group, string>}
                        actualWinners={actualGroupWinners}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Participant Detail ───────────────────────────────────────────────────────

function ParticipantDetail({
  participant, preds, resultsMap, predictedWinners, actualWinners,
}: {
  participant: Participant
  preds: Prediction[]
  resultsMap: Record<string, Result>
  predictedWinners: Record<Group, string>
  actualWinners: Record<Group, string | null>
}) {
  const predMap: Record<string, Prediction> = {}
  for (const p of preds) predMap[p.fixture_id] = p

  const correctWinners = GROUPS.filter(g => actualWinners[g] && predictedWinners[g] === actualWinners[g]).length
  const pendingWinners = GROUPS.filter(g => !actualWinners[g]).length

  return (
    <div className="bg-zinc-950/60 px-6 pb-6">
      <div className="text-xs text-emerald-400 py-2 font-semibold">⚽ Top scorer: {participant.top_scorer_pick}</div>

      {/* Group Winners Section */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Predicted Group Winners</h3>
          <div className="text-xs text-zinc-500">
            {correctWinners > 0 && <span className="text-amber-400 font-bold">+{correctWinners * GROUP_WINNER_POINTS} pts </span>}
            {correctWinners}/{12 - pendingWinners} correct
            {pendingWinners > 0 && <span className="text-zinc-600"> · {pendingWinners} pending</span>}
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {GROUPS.map(g => {
            const predicted = predictedWinners[g]
            const actual = actualWinners[g]
            const isCorrect = actual && predicted === actual
            const isWrong = actual && predicted !== actual
            const isPending = !actual

            return (
              <div
                key={g}
                className={`rounded-xl p-2.5 border text-xs transition ${
                  isCorrect
                    ? 'bg-amber-400/15 border-amber-400/40'
                    : isWrong
                    ? 'bg-zinc-900 border-zinc-800'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-black text-zinc-400">Group {g}</span>
                  {isCorrect && <span className="text-amber-400 font-black text-xs">+{GROUP_WINNER_POINTS}</span>}
                  {isPending && <span className="text-zinc-600 text-xs">•••</span>}
                </div>
                <div className={`font-bold flex items-center gap-1 ${
                  isCorrect ? 'text-amber-300' : isWrong ? 'text-zinc-400 line-through' : 'text-white'
                }`}>
                  <span>{TEAM_FLAGS[predicted] || '?'}</span>
                  <span className="truncate text-xs">{predicted || '—'}</span>
                </div>
                {isWrong && actual && (
                  <div className="text-emerald-400 text-xs mt-0.5 flex items-center gap-1">
                    <span>{TEAM_FLAGS[actual]}</span>
                    <span className="truncate">{actual}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Match predictions per group */}
      {GROUPS.map(g => (
        <div key={g} className="mt-3">
          <div className="text-xs font-black text-amber-400 mb-1.5">GROUP {g}</div>
          <div className="space-y-1">
            {FIXTURES_BY_GROUP[g].map(f => {
              const pred = predMap[f.id]
              const result = resultsMap[f.id]
              const scored = pred && result
                ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
                : null
              return (
                <div key={f.id} className="flex items-center gap-2 text-xs py-0.5">
                  <span className="w-20 truncate text-right text-zinc-400">{TEAM_FLAGS[f.homeTeam]} {f.homeTeam}</span>
                  <span className="font-black w-12 text-center text-white">
                    {pred ? `${pred.home_score}–${pred.away_score}` : '–'}
                  </span>
                  <span className="w-20 truncate text-zinc-400">{f.awayTeam} {TEAM_FLAGS[f.awayTeam]}</span>
                  {pred?.is_joker && <span className="text-amber-400">★</span>}
                  {scored && (
                    <span className={`ml-auto px-1.5 py-0.5 rounded-lg text-xs font-black ${labelColor(scored.label)}`}>
                      {scored.label === null ? '–' : scored.label}
                      {scored.points > 0 ? ` +${scored.points}` : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex-shrink-0 ${
        active
          ? 'bg-gradient-to-r from-amber-400 to-amber-600 text-black shadow-md shadow-amber-400/20'
          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}
