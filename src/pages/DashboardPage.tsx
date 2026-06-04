import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { FIXTURES, FIXTURES_BY_GROUP, TEAM_FLAGS } from '../data/fixtures'
import { scoreFixture, labelColor } from '../lib/scoring'
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

  const leaderboard = useMemo(() => {
    return participants
      .map(p => {
        const preds = predsByParticipant[p.id] || []
        let total = 0
        for (const pred of preds) {
          const result = resultsMap[pred.fixture_id]
          if (!result) continue
          total += scoreFixture(
            { home: pred.home_score, away: pred.away_score },
            { home: result.home_score, away: result.away_score },
            pred.is_joker,
          ).points
        }
        return { ...p, total }
      })
      .sort((a, b) => b.total - a.total)
  }, [participants, predsByParticipant, resultsMap])

  const filteredFixtures = activeGroup === 'played'
    ? FIXTURES.filter(f => resultsMap[f.id] !== undefined)
    : FIXTURES_BY_GROUP[activeGroup]

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
      {/* Background glow */}
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
              {!revealed && (
                <span className="text-amber-400/70">🔒 Hidden until entries close</span>
              )}
            </div>
          </div>
          {(settings?.entries_open) && (
            <a href="/enter" className="btn-gold text-xs font-bold px-4 py-2 rounded-xl">
              Enter →
            </a>
          )}
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-5 mt-6 space-y-6">

        {/* Pre-reveal: just show who has entered */}
        {!revealed && (
          <div className="glass rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Players entered</h2>
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2.5 py-1 rounded-full">
                {participants.length} entries
              </span>
            </div>
            {participants.length === 0 ? (
              <p className="text-zinc-500 text-sm">No entries yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {participants.map(p => (
                  <div key={p.id} className="bg-zinc-800 border border-zinc-700 px-3 py-1.5 rounded-full text-sm font-semibold">
                    {p.name}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-600 pt-1">
              Predictions are hidden until the entry window closes.
            </p>
          </div>
        )}

        {revealed && (
          <>
            {/* Leaderboard */}
            <div className="glass rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/6 flex items-center justify-between">
                <h2 className="font-black text-lg">🏆 Leaderboard</h2>
                <span className="text-xs text-zinc-500">{results.length} results in</span>
              </div>
              <div className="divide-y divide-white/5">
                {leaderboard.map((p, i) => (
                  <div key={p.id} className="px-6 py-3.5 flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                      i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-600 text-black shadow-lg shadow-amber-500/30' :
                      i === 1 ? 'bg-zinc-300 text-zinc-900' :
                      i === 2 ? 'bg-amber-700 text-white' :
                      'bg-zinc-800 text-zinc-400'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{p.name}</div>
                      <div className="text-xs text-zinc-500 truncate hidden sm:block">
                        🏆 {p.winner_pick} · ⚽ {p.top_scorer_pick}
                      </div>
                    </div>
                    <div className={`text-xl font-black ${i === 0 ? 'gradient-text' : 'text-white'}`}>
                      {p.total}
                      <span className="text-xs text-zinc-500 font-normal ml-1">pts</span>
                    </div>
                  </div>
                ))}
                {leaderboard.length === 0 && (
                  <div className="px-6 py-10 text-center text-zinc-500 text-sm">No results entered yet</div>
                )}
              </div>
            </div>

            {/* Group filter tabs */}
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
                {activeGroup === 'played' ? 'No results entered yet.' : `No predictions to show for Group ${activeGroup}.`}
              </div>
            )}

            {/* Full player breakdown */}
            <div className="glass rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/6">
                <h2 className="font-black text-lg">All Predictions</h2>
                <p className="text-zinc-500 text-xs mt-0.5">Tap a player to expand their full predictions</p>
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
                      <div className="font-black text-amber-400">{p.total} pts</div>
                      <div className="text-zinc-600 text-xs">{expandedParticipant === p.id ? '▲' : '▼'}</div>
                    </button>
                    {expandedParticipant === p.id && (
                      <ParticipantDetail
                        participant={p}
                        preds={predsByParticipant[p.id] || []}
                        resultsMap={resultsMap}
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

function ParticipantDetail({
  participant, preds, resultsMap,
}: { participant: Participant; preds: Prediction[]; resultsMap: Record<string, Result> }) {
  const predMap: Record<string, Prediction> = {}
  for (const p of preds) predMap[p.fixture_id] = p

  return (
    <div className="bg-zinc-950/60 px-6 pb-5">
      <div className="text-xs text-emerald-400 py-2 font-semibold">⚽ Top scorer: {participant.top_scorer_pick}</div>
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
