import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIXTURES, FIXTURES_BY_GROUP, TEAM_FLAGS, GROUP_TEAMS } from '../data/fixtures'
import { scoreFixture, labelColor, calculateGroupStandings, GROUP_WINNER_POINTS } from '../lib/scoring'
import type { Participant, Prediction, Result, TournamentSettings, Group, ScoredFixture } from '../types'
import { GROUPS } from '../types'

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || 'wc2026admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerRow extends Participant {
  total: number
  matchPoints: number
  groupWinnerPoints: number
  tournamentWinnerPoints: number
  goldenBootPoints: number
  s: number; sj: number; r: number; rj: number; played: number
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [searchParams] = useSearchParams()
  const isPreview = searchParams.get('preview') === ADMIN_SECRET

  const [settings, setSettings] = useState<TournamentSettings & {
    scorer_goals?: Record<string, number>
    actual_tournament_winner?: string
    actual_golden_boot?: string
    confirmed_group_winners?: Record<string, string>
  } | null>(null)
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
    if (sRes.data) setSettings(sRes.data as TournamentSettings & { scorer_goals?: Record<string, number> })
    if (pRes.data) setParticipants(pRes.data as Participant[])
    if (predRes.data) setPredictions(predRes.data as Prediction[])
    if (rRes.data) setResults(rRes.data as Result[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'results' }, () =>
        supabase.from('results').select('*').then(({ data }) => { if (data) setResults(data as Result[]) }))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'participants' }, () =>
        supabase.from('participants').select('*').order('submitted_at').then(({ data }) => { if (data) setParticipants(data as Participant[]) }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_settings' }, () =>
        supabase.from('tournament_settings').select('*').eq('id', 1).single().then(({ data }) => { if (data) setSettings(data as TournamentSettings & { scorer_goals?: Record<string, number> }) }))
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

  // Group winners — only awarded when admin explicitly confirms them
  const actualGroupWinners = useMemo(() => {
    const confirmed = settings?.confirmed_group_winners ?? {}
    const winners: Record<Group, string | null> = {} as Record<Group, string | null>
    for (const g of GROUPS) winners[g] = confirmed[g] ?? null
    return winners
  }, [settings])

  const predictedGroupWinners = useMemo(() => {
    const result: Record<string, Record<Group, string>> = {}
    for (const participant of participants) {
      const preds = predsByParticipant[participant.id] || []
      const predMap: Record<string, { home: number; away: number }> = {}
      for (const p of preds) predMap[p.fixture_id] = { home: p.home_score, away: p.away_score }
      result[participant.id] = {} as Record<Group, string>
      for (const g of GROUPS) {
        const standings = calculateGroupStandings(GROUP_TEAMS[g], FIXTURES_BY_GROUP[g], predMap)
        result[participant.id][g] = standings[0]?.team ?? ''
      }
    }
    return result
  }, [participants, predsByParticipant])

  const leaderboard: PlayerRow[] = useMemo(() => {
    return participants.map(p => {
      const preds = predsByParticipant[p.id] || []
      let matchPoints = 0, s = 0, sj = 0, r = 0, rj = 0, played = 0
      for (const pred of preds) {
        const result = resultsMap[pred.fixture_id]
        if (!result) continue
        played++
        const scored = scoreFixture(
          { home: pred.home_score, away: pred.away_score },
          { home: result.home_score, away: result.away_score },
          pred.is_joker,
        )
        matchPoints += scored.points
        if (scored.label === 'S') s++
        else if (scored.label === 'SJ') sj++
        else if (scored.label === 'R') r++
        else if (scored.label === 'RJ') rj++
      }
      let groupWinnerPoints = 0
      const myWinners = predictedGroupWinners[p.id] || {}
      for (const g of GROUPS) {
        if (actualGroupWinners[g] && myWinners[g] === actualGroupWinners[g]) groupWinnerPoints += GROUP_WINNER_POINTS
      }

      const tournamentWinnerPoints =
        settings?.actual_tournament_winner && p.winner_pick === settings.actual_tournament_winner ? 10 : 0
      const goldenBootPoints =
        settings?.actual_golden_boot && p.top_scorer_pick === settings.actual_golden_boot ? 10 : 0

      return {
        ...p, matchPoints, groupWinnerPoints, tournamentWinnerPoints, goldenBootPoints,
        total: matchPoints + groupWinnerPoints + tournamentWinnerPoints + goldenBootPoints,
        s, sj, r, rj, played,
      }
    }).sort((a, b) => b.total - a.total)
  }, [participants, predsByParticipant, resultsMap, predictedGroupWinners, actualGroupWinners])

  // Upcoming fixtures — next date with unplayed games
  const upcomingFixtures = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const unplayedDates = [...new Set(FIXTURES.filter(f => !resultsMap[f.id]).map(f => f.date))].sort()
    const nextDate = unplayedDates.find(d => d >= today) ?? unplayedDates[0]
    if (!nextDate) return { date: '', fixtures: [] }
    return { date: nextDate, fixtures: FIXTURES.filter(f => f.date === nextDate && !resultsMap[f.id]) }
  }, [resultsMap])

  // Ticker messages
  const tickerItems = useMemo(() =>
    generateTickerItems(leaderboard, results, resultsMap, predsByParticipant, FIXTURES),
    [leaderboard, results, resultsMap, predsByParticipant])

  // Top scorer race
  const topScorerRace = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of participants) {
      counts[p.top_scorer_pick] = (counts[p.top_scorer_pick] || 0) + 1
    }
    const goals = (settings?.scorer_goals as Record<string, number>) ?? {}
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, picked]) => ({ name, picked, goals: goals[name] ?? 0 }))
  }, [participants, settings])

  const filteredFixtures = activeGroup === 'played'
    ? FIXTURES.filter(f => resultsMap[f.id] !== undefined)
    : FIXTURES_BY_GROUP[activeGroup]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060d1f] flex items-center justify-center">
        <div className="text-blue-400 text-sm animate-pulse">Loading dashboard…</div>
      </div>
    )
  }

  const revealed = isPreview || (settings?.predictions_revealed ?? false)

  return (
    <div className="min-h-screen bg-[#060d1f] text-white pb-16">

      {/* Preview banner */}
      {isPreview && (
        <div className="bg-yellow-400 text-black text-xs font-black text-center py-1.5 tracking-widest uppercase">
          👁 Admin Preview — public dashboard is still locked
        </div>
      )}

      {/* Ticker */}
      <div className="bg-red-700 overflow-hidden border-b border-red-900">
        <div className="flex items-center">
          <div className="bg-red-900 text-white text-xs font-black px-3 py-2 uppercase tracking-widest whitespace-nowrap flex-shrink-0 border-r border-red-600">
            ⚽ LIVE
          </div>
          <div className="overflow-hidden flex-1">
            <div className="animate-ticker">
              {tickerItems.map((item, i) => (
                <span key={i} className="text-white text-xs font-semibold px-6 py-2 inline-block">
                  {item}
                </span>
              ))}
              {/* Duplicate for seamless loop */}
              {tickerItems.map((item, i) => (
                <span key={`dup-${i}`} className="text-white text-xs font-semibold px-6 py-2 inline-block">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="bg-[#040a17] border-b border-blue-900/60 px-5 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              <span className="gradient-text">WC2026</span>
              <span className="text-white ml-2">Predictor</span>
            </h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-blue-400 font-medium">
              <span>👥 {participants.length} players</span>
              <span>🎯 {results.length} results in</span>
              {!revealed && <span className="text-yellow-400">🔒 Predictions hidden</span>}
            </div>
          </div>
          {settings?.entries_open && (
            <a href="/enter" className="btn-gold text-xs px-4 py-2 rounded-xl">Enter →</a>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 mt-5 space-y-5">

        {/* Not revealed */}
        {!revealed && (
          <div className="ss-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Players entered</h2>
              <span className="text-xs text-blue-400 bg-blue-900/40 px-2.5 py-1 rounded-full">{participants.length} entries</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {participants.map(p => (
                <div key={p.id} className="bg-blue-900/40 border border-blue-800 px-3 py-1.5 rounded-full text-sm font-semibold">{p.name}</div>
              ))}
            </div>
            <p className="text-xs text-blue-600 pt-1">Predictions hidden until the entry window closes.</p>
          </div>
        )}

        {revealed && (
          <>
            {/* Upcoming Fixtures */}
            {upcomingFixtures.fixtures.length > 0 && (
              <UpcomingFixturesSection
                date={upcomingFixtures.date}
                fixtures={upcomingFixtures.fixtures}
                leaderboard={leaderboard}
                predsByParticipant={predsByParticipant}
              />
            )}

            {/* Leaderboard */}
            <LeaderboardSection leaderboard={leaderboard} />

            {/* Points Guide */}
            <PointsGuide />

            {/* Top Scorer Race */}
            {topScorerRace.length > 0 && (
              <TopScorerRace race={topScorerRace} />
            )}

            {/* Group filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <FilterTab label="Results so far" active={activeGroup === 'played'} onClick={() => setActiveGroup('played')} />
              {GROUPS.map(g => (
                <FilterTab key={g} label={`Grp ${g}`} active={activeGroup === g} onClick={() => setActiveGroup(g)} />
              ))}
            </div>

            {/* Fixture grid */}
            {filteredFixtures.length > 0 ? (
              <div className="space-y-3">
                {filteredFixtures.map(fixture => (
                  <FixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    result={resultsMap[fixture.id]}
                    leaderboard={leaderboard}
                    predsByParticipant={predsByParticipant}
                  />
                ))}
              </div>
            ) : (
              <div className="ss-card px-6 py-10 text-center text-blue-500 text-sm">
                {activeGroup === 'played' ? 'No results entered yet.' : `No results yet for Group ${activeGroup}.`}
              </div>
            )}

            {/* All Predictions — expandable */}
            <div className="ss-card overflow-hidden">
              <div className="px-5 py-4 border-b border-blue-900 bg-blue-950/50">
                <h2 className="font-black text-lg">All Predictions</h2>
                <p className="text-blue-400 text-xs mt-0.5">Tap a player to see their full picks</p>
              </div>
              <div className="divide-y divide-blue-900/40">
                {leaderboard.map(p => (
                  <div key={p.id}>
                    <button
                      className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-blue-900/20 transition text-left"
                      onClick={() => setExpandedParticipant(expandedParticipant === p.id ? null : p.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold">{p.name}</div>
                        <div className="text-xs text-blue-400">🏆 {p.winner_pick} · ⚽ {p.top_scorer_pick}</div>
                      </div>
                      <div className="text-right mr-2">
                        <div className="font-black text-yellow-400">{p.total} pts</div>
                        {p.groupWinnerPoints > 0 && (
                          <div className="text-xs text-yellow-600">{p.matchPoints}+{p.groupWinnerPoints}</div>
                        )}
                      </div>
                      <div className="text-blue-600 text-xs">{expandedParticipant === p.id ? '▲' : '▼'}</div>
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

// ─── Upcoming Fixtures ────────────────────────────────────────────────────────

function UpcomingFixturesSection({ date, fixtures, leaderboard, predsByParticipant }: {
  date: string
  fixtures: typeof FIXTURES
  leaderboard: PlayerRow[]
  predsByParticipant: Record<string, Prediction[]>
}) {
  const fmt = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center gap-3">
        <div className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">Upcoming</div>
        <span className="font-black text-sm uppercase tracking-wide">{fmt}</span>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {fixtures.map(f => {
          return (
            <div key={f.id} className="bg-blue-950/60 rounded-xl border border-blue-900 overflow-hidden">
              <div className="bg-blue-900/50 px-3 py-2 text-xs font-bold text-center border-b border-blue-900">
                {TEAM_FLAGS[f.homeTeam]} {f.homeTeam} <span className="text-blue-400 mx-1">vs</span> {f.awayTeam} {TEAM_FLAGS[f.awayTeam]}
              </div>
              <div className="divide-y divide-blue-900/40">
                {leaderboard.map(participant => {
                  const pred = (predsByParticipant[participant.id] || []).find(p => p.fixture_id === f.id)
                  if (!pred) return null
                  return (
                    <div key={participant.id} className="px-3 py-1.5 flex items-center justify-between text-xs">
                      <span className="text-blue-200 font-semibold w-20 truncate">{participant.name}</span>
                      <span className="font-black text-white">{pred.home_score}–{pred.away_score}</span>
                      {pred.is_joker && (
                        <span className="text-yellow-400 font-black text-xs bg-yellow-400/10 px-1.5 py-0.5 rounded">★ J</span>
                      )}
                      {!pred.is_joker && <span className="w-10" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Top Scorer Race ──────────────────────────────────────────────────────────

function TopScorerRace({ race }: { race: Array<{ name: string; picked: number; goals: number }> }) {
  const maxGoals = Math.max(...race.map(r => r.goals), 1)
  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center gap-3">
        <div className="bg-yellow-500 text-black text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">⚽ Top Scorer Race</div>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {race.map((r, i) => (
          <div key={r.name} className="bg-blue-950/60 rounded-xl border border-blue-900 p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-black text-sm">{r.name}</div>
                <div className="text-xs text-blue-400">{r.picked} player{r.picked !== 1 ? 's' : ''} backing them</div>
              </div>
              <div className={`text-3xl font-black ${i === 0 ? 'gradient-text' : 'text-white'}`}>{r.goals}</div>
            </div>
            <div className="h-1.5 bg-blue-900 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full transition-all duration-700"
                style={{ width: `${(r.goals / maxGoals) * 100}%` }}
              />
            </div>
            <div className="text-xs text-blue-500 mt-1">{r.goals} goal{r.goals !== 1 ? 's' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Points Guide ─────────────────────────────────────────────────────────────

function PointsGuide() {
  const rows = [
    { icon: '🏆', label: 'Tournament Winner', pts: '10 pts', color: 'text-yellow-400', note: 'Awarded at the end' },
    { icon: '⚽', label: 'Golden Boot', pts: '10 pts', color: 'text-yellow-400', note: 'Awarded at the end' },
    { icon: '🏁', label: 'Group Winner', pts: '5 pts', color: 'text-yellow-300', note: 'Per group, 12 available' },
    { icon: '🎯', label: 'Correct Score', pts: '5 pts', color: 'text-yellow-400', note: 'Exact scoreline' },
    { icon: '✅', label: 'Correct Result', pts: '2 pts', color: 'text-emerald-400', note: 'Win / Draw / Loss' },
    { icon: '🃏', label: 'Joker', pts: '×2', color: 'text-white', note: '1 per group, doubles points' },
  ]
  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center gap-3">
        <div className="bg-yellow-500 text-black text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">
          Points 📋
        </div>
      </div>
      <div className="divide-y divide-blue-900/40">
        {rows.map(({ icon, label, pts, color, note }) => (
          <div key={label} className="px-5 py-3 flex items-center gap-4">
            <span className="text-xl w-8 flex-shrink-0">{icon}</span>
            <div className="flex-1">
              <div className="font-bold text-sm text-white">{label}</div>
              <div className="text-xs text-blue-500">{note}</div>
            </div>
            <div className={`font-black text-lg ${color}`}>{pts}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

function LeaderboardSection({ leaderboard }: { leaderboard: PlayerRow[] }) {
  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center gap-3">
        <div className="bg-yellow-500 text-black text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">🏆 Leaderboard</div>
        <span className="text-xs text-blue-400 ml-auto hidden sm:block">
          <span className="text-yellow-400 font-bold">S</span>=Correct Score (5pts) ·{' '}
          <span className="text-emerald-400 font-bold">R</span>=Correct Result (2pts) ·{' '}
          <span className="text-yellow-300 font-bold">J</span>=Joker ×2
        </span>
      </div>
      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-blue-900 text-xs text-blue-400 uppercase tracking-wider">
              <th className="px-4 py-2.5 text-left w-8">#</th>
              <th className="px-4 py-2.5 text-left">Player</th>
              <th className="px-3 py-2.5 text-center">
                <span className="bg-emerald-500 text-white rounded px-1 text-xs font-black">R</span>
              </th>
              <th className="px-3 py-2.5 text-center">
                <span className="bg-emerald-500 text-white rounded px-1 text-xs font-black">RJ</span>
              </th>
              <th className="px-3 py-2.5 text-center">
                <span className="bg-yellow-400 text-black rounded px-1 text-xs font-black">S</span>
              </th>
              <th className="px-3 py-2.5 text-center">
                <span className="bg-yellow-400 text-black rounded px-1 text-xs font-black">SJ</span>
              </th>
              <th className="px-3 py-2.5 text-center font-black text-white">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-900/40">
            {leaderboard.map((p, i) => (
              <tr key={p.id} className={`hover:bg-blue-900/20 transition ${i === 0 ? 'bg-yellow-400/5' : ''}`}>
                <td className="px-4 py-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                    i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-black' :
                    i === 1 ? 'bg-slate-300 text-slate-900' :
                    i === 2 ? 'bg-amber-700 text-white' :
                    'bg-blue-900 text-blue-400'
                  }`}>{i + 1}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-bold">{p.name}</div>
                  <div className="text-xs text-blue-500">🏆 {p.winner_pick} · ⚽ {p.top_scorer_pick}</div>
                </td>
                <td className="px-3 py-3 text-center font-bold text-emerald-400">{p.r || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-300">{p.rj || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-yellow-400">{p.s || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-yellow-300">{p.sj || '–'}</td>
                <td className="px-3 py-3 text-center">
                  <div className={`font-black text-lg ${i === 0 ? 'gradient-text' : 'text-white'}`}>{p.total}</div>
                  {p.groupWinnerPoints > 0 && (
                    <div className="text-xs text-yellow-600">{p.matchPoints}+{p.groupWinnerPoints}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile list */}
      <div className="sm:hidden divide-y divide-blue-900/40">
        {leaderboard.map((p, i) => (
          <div key={p.id} className="px-4 py-3 flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
              i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-black' :
              i === 1 ? 'bg-slate-300 text-slate-900' :
              i === 2 ? 'bg-amber-700 text-white' : 'bg-blue-900 text-blue-400'
            }`}>{i + 1}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-xs text-blue-400 flex gap-2">
                <span className="text-emerald-400">R:{p.r}</span>
                <span className="text-emerald-300">RJ:{p.rj}</span>
                <span className="text-yellow-400">S:{p.s}</span>
                <span className="text-yellow-300">SJ:{p.sj}</span>
              </div>
            </div>
            <div className={`font-black text-xl ${i === 0 ? 'gradient-text' : 'text-white'}`}>{p.total}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Participant Detail ───────────────────────────────────────────────────────

function ParticipantDetail({ participant, preds, resultsMap, predictedWinners, actualWinners }: {
  participant: PlayerRow
  preds: Prediction[]
  resultsMap: Record<string, Result>
  predictedWinners: Record<Group, string>
  actualWinners: Record<Group, string | null>
}) {
  const [openGroup, setOpenGroup] = useState<Group | null>(null)
  const predMap: Record<string, Prediction> = {}
  for (const p of preds) predMap[p.fixture_id] = p

  const correctWinners = GROUPS.filter(g => actualWinners[g] && predictedWinners[g] === actualWinners[g]).length
  const doneGroups = GROUPS.filter(g => actualWinners[g] !== null).length

  return (
    <div className="bg-[#060d1f] border-t border-blue-900 px-5 pb-5 pt-4 space-y-5">
      <div className="text-xs text-emerald-400 font-semibold">⚽ Top scorer pick: {participant.top_scorer_pick}</div>

      {/* Group Winners */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-blue-400">Predicted Group Winners</h3>
          <div className="text-xs text-blue-500">
            {correctWinners > 0 && <span className="text-yellow-400 font-bold">+{correctWinners * GROUP_WINNER_POINTS}pts · </span>}
            {correctWinners}/{doneGroups} correct
          </div>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
          {GROUPS.map(g => {
            const predicted = predictedWinners[g]
            const actual = actualWinners[g]
            const isCorrect = actual && predicted === actual
            const isWrong = actual && predicted !== actual
            return (
              <div key={g} className={`rounded-xl p-2 text-xs border text-center ${
                isCorrect ? 'bg-yellow-400/10 border-yellow-400/40' :
                isWrong ? 'bg-red-900/20 border-red-900/40' :
                'bg-blue-900/20 border-blue-900'
              }`}>
                <div className="font-black text-blue-400 text-xs">Grp {g}</div>
                <div className={`font-bold text-xs mt-0.5 ${isCorrect ? 'text-yellow-300' : isWrong ? 'text-red-400 line-through' : 'text-white'}`}>
                  {TEAM_FLAGS[predicted] || '?'}
                </div>
                <div className={`text-xs truncate ${isCorrect ? 'text-yellow-300' : isWrong ? 'text-red-400' : 'text-blue-300'}`}>
                  {predicted ? predicted.split(' ')[0] : '—'}
                </div>
                {isCorrect && <div className="text-yellow-400 font-black text-xs">+5</div>}
                {isWrong && actual && <div className="text-emerald-400 text-xs">{TEAM_FLAGS[actual]}</div>}
                {!actual && <div className="text-blue-700 text-xs">•••</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Collapsible group buttons */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-3">Match Predictions</h3>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 mb-3">
          {GROUPS.map(g => {
            const groupPreds = FIXTURES_BY_GROUP[g].map(f => {
              const pred = predMap[f.id]
              const result = resultsMap[f.id]
              return pred && result ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker) : null
            }).filter(Boolean)
            const groupPts = groupPreds.reduce((sum, s) => sum + (s?.points ?? 0), 0)
            return (
              <button
                key={g}
                onClick={() => setOpenGroup(openGroup === g ? null : g)}
                className={`rounded-xl p-2 text-xs border transition text-center ${
                  openGroup === g ? 'bg-red-700 border-red-600 text-white' : 'bg-blue-900/30 border-blue-900 hover:border-blue-700 text-blue-300'
                }`}
              >
                <div className="font-black">Grp {g}</div>
                {groupPts > 0 && <div className="text-yellow-400 font-bold">{groupPts}pts</div>}
              </button>
            )
          })}
        </div>

        {openGroup && (
          <div className="ss-card p-3 space-y-1.5">
            <div className="text-xs font-black text-yellow-400 mb-2">GROUP {openGroup}</div>
            {FIXTURES_BY_GROUP[openGroup].map(f => {
              const pred = predMap[f.id]
              const result = resultsMap[f.id]
              const scored = pred && result
                ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
                : null
              return (
                <div key={f.id} className="flex items-center gap-2 text-xs py-1 border-b border-blue-900/40 last:border-0">
                  <span className="flex-1 text-right text-blue-200 truncate">{TEAM_FLAGS[f.homeTeam]} {f.homeTeam}</span>
                  <span className="font-black text-white min-w-[40px] text-center">
                    {pred ? `${pred.home_score}–${pred.away_score}` : '–'}
                  </span>
                  <span className="flex-1 text-blue-200 truncate">{f.awayTeam} {TEAM_FLAGS[f.awayTeam]}</span>
                  {pred?.is_joker && <span className="text-yellow-400 font-black">★</span>}
                  {scored && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded font-black ${labelColor(scored.label)}`}>
                      {scored.label === null ? '–' : scored.label}{scored.points > 0 ? ` +${scored.points}` : ''}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Ticker Generator ─────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function generateTickerItems(
  leaderboard: PlayerRow[],
  results: Result[],
  resultsMap: Record<string, Result>,
  predsByParticipant: Record<string, Prediction[]>,
  fixtures: typeof FIXTURES,
): string[] {
  const items: string[] = []

  if (leaderboard.length === 0) {
    return [
      '⚽ World Cup 2026 — USA, Canada & Mexico',
      '🏆 Family Predictor Tournament is underway',
      '📊 Predictions locked — results coming soon',
      '🌍 48 teams · 12 groups · 72 matches',
      '🃏 Jokers in play — could be worth double at any moment',
    ]
  }

  const leader = leaderboard[0]
  const bottom = leaderboard[leaderboard.length - 1]
  const second = leaderboard[1]

  // ── Leader shoutout
  if (leader) {
    items.push(pick([
      `🏆 ${leader.name} sitting pretty at the top with ${leader.total} points — can anyone catch them?`,
      `👑 ${leader.name} leads the pack on ${leader.total} points. The one to beat.`,
      `📈 ${leader.name} is running away with this — ${leader.total} points and counting`,
    ]))
  }

  // ── Gap between 1st and 2nd
  if (leader && second) {
    const gap = leader.total - second.total
    if (gap === 0) {
      items.push(`🔥 It's LEVEL at the top — ${leader.name} and ${second.name} tied on ${leader.total} points. Every game counts now`)
    } else if (gap <= 3) {
      items.push(pick([
        `⚡ Breathtakingly close — ${leader.name} leads ${second.name} by just ${gap} point${gap === 1 ? '' : 's'}`,
        `😬 Only ${gap} point${gap === 1 ? '' : 's'} between ${leader.name} and ${second.name}. This one's not over`,
      ]))
    } else {
      items.push(`📊 ${leader.name} holds a ${gap}-point lead over ${second.name} in second place`)
    }
  }

  // ── Bottom of the table
  if (bottom && bottom.id !== leader?.id) {
    if (bottom.total === 0 && results.length > 0) {
      items.push(pick([
        `😬 ${bottom.name} yet to get off the mark — still waiting for that first point`,
        `📉 Tough times for ${bottom.name} — no points on the board yet`,
        `🙈 ${bottom.name} struggling at the foot of the table. Surely a comeback is coming...`,
      ]))
    } else if (bottom.total > 0) {
      const gap = leader.total - bottom.total
      items.push(pick([
        `⛰️ ${bottom.name} has a mountain to climb — ${gap} points off the lead`,
        `📉 ${bottom.name} rooted to the bottom on ${bottom.total} points. Time to turn it around`,
        `💪 ${bottom.name} not giving up — but ${gap} points is a big ask`,
      ]))
    }
  }

  // ── Exact score hits (correct scores)
  for (const p of leaderboard) {
    for (const pred of (predsByParticipant[p.id] || [])) {
      const result = resultsMap[pred.fixture_id]
      if (!result) continue
      const scored = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
      const f = fixtures.find(x => x.id === pred.fixture_id)
      if (!f) continue

      if (scored.label === 'SJ') {
        items.push(pick([
          `💰 JACKPOT! ${p.name} played the Joker on ${f.homeTeam} vs ${f.awayTeam} AND got the exact score — a massive ${scored.points} points!`,
          `🃏🎯 ${p.name}'s Joker pays off in style — correct score on ${f.homeTeam} vs ${f.awayTeam} worth ${scored.points} points!`,
          `🔥 Massive points haul for ${p.name} — Joker + exact score on ${f.homeTeam} vs ${f.awayTeam}. ${scored.points} points in the bank`,
        ]))
      } else if (scored.label === 'S') {
        items.push(pick([
          `🎯 ${p.name} called it perfectly — ${f.homeTeam} ${pred.home_score}–${pred.away_score} ${f.awayTeam}. Five points, just like that`,
          `🔮 Psychic! ${p.name} got the exact score on ${f.homeTeam} vs ${f.awayTeam} (+${scored.points}pts)`,
          `⭐ Pinpoint prediction from ${p.name} — ${f.homeTeam} ${pred.home_score}–${pred.away_score} ${f.awayTeam} nailed it`,
        ]))
      }
    }
  }

  // ── Joker correct result (RJ)
  for (const p of leaderboard) {
    for (const pred of (predsByParticipant[p.id] || [])) {
      const result = resultsMap[pred.fixture_id]
      if (!result) continue
      const scored = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
      const f = fixtures.find(x => x.id === pred.fixture_id)
      if (!f) continue
      if (scored.label === 'RJ') {
        items.push(pick([
          `🃏 ${p.name}'s Joker on ${f.homeTeam} vs ${f.awayTeam} pays off — correct result bags them ${scored.points} points`,
          `💚 ${p.name} gets the result right with a Joker on ${f.homeTeam} vs ${f.awayTeam} — ${scored.points} points well earned`,
        ]))
      }
    }
  }

  // ── Dry spells (streak without a point)
  for (const p of leaderboard) {
    let streak = 0
    for (const pred of [...(predsByParticipant[p.id] || [])].reverse()) {
      const result = resultsMap[pred.fixture_id]
      if (!result) continue
      const scored = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
      if (scored.points === 0) streak++
      else break
    }
    if (streak >= 3) {
      items.push(pick([
        `🥶 ${p.name} is going through a rough patch — ${streak} games without a single point`,
        `😤 ${p.name} can't catch a break — ${streak} straight blanks and counting`,
        `📉 Form crisis for ${p.name} — ${streak} fixtures and nothing to show for it`,
      ]))
    }
  }

  // ── Someone on a hot streak
  for (const p of leaderboard) {
    let streak = 0
    for (const pred of [...(predsByParticipant[p.id] || [])].reverse()) {
      const result = resultsMap[pred.fixture_id]
      if (!result) continue
      const scored = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
      if (scored.points > 0) streak++
      else break
    }
    if (streak >= 4) {
      items.push(pick([
        `🔥 ${p.name} is on fire — points in ${streak} consecutive games`,
        `📈 ${p.name} on a ${streak}-game scoring streak. Unstoppable right now`,
      ]))
    }
  }

  // ── Recent match results (last 6)
  for (const result of [...results].reverse().slice(0, 6)) {
    const f = fixtures.find(x => x.id === result.fixture_id)
    if (!f) continue
    const home = result.home_score, away = result.away_score
    let flavour = ''
    const diff = Math.abs(home - away)
    if (diff >= 4) flavour = pick([' — what a hammering!', ' — absolutely clinical', ' — no contest'])
    else if (diff === 0) flavour = pick([' — honours even', ' — a point each', ' — all square'])
    else if (diff === 1) flavour = pick([' — a nervy one', ' — tight as you like', ' — couldn\'t separate them'])
    items.push(`${TEAM_FLAGS[f.homeTeam]} ${f.homeTeam} ${home}–${away} ${f.awayTeam} ${TEAM_FLAGS[f.awayTeam]}${flavour}`)
  }

  // ── Overall stats summary
  const totalCorrectScores = leaderboard.reduce((sum, p) => sum + p.s + p.sj, 0)
  if (totalCorrectScores > 0) {
    items.push(`🎯 ${totalCorrectScores} exact scores predicted correctly across the whole tournament so far`)
  }

  // ── Shuffle so it doesn't repeat the same order every load
  return items.sort(() => Math.random() - 0.5)
}

// ─── Fixture Card (collapsible) ───────────────────────────────────────────────

function outcomeLabel(label: ScoredFixture['label'], isJoker: boolean): string {
  if (label === 'S') return 'Correct Score'
  if (label === 'SJ') return 'Correct Score' + (isJoker ? ' 🃏' : '')
  if (label === 'R') return 'Correct Result'
  if (label === 'RJ') return 'Correct Result' + (isJoker ? ' 🃏' : '')
  if (label === '/') return 'No points'
  return '–'
}

function outcomeBg(label: ScoredFixture['label']): string {
  if (label === 'S' || label === 'SJ') return 'text-yellow-400'
  if (label === 'R' || label === 'RJ') return 'text-emerald-400'
  return 'text-blue-600'
}

function FixtureCard({ fixture, result, leaderboard, predsByParticipant }: {
  fixture: typeof FIXTURES[number]
  result: Result | undefined
  leaderboard: PlayerRow[]
  predsByParticipant: Record<string, Prediction[]>
}) {
  const [open, setOpen] = useState(false)

  // Build rows with scores, sort by points desc
  const rows = leaderboard
    .map(participant => {
      const pred = (predsByParticipant[participant.id] || []).find(p => p.fixture_id === fixture.id)
      if (!pred) return null
      const scored = result
        ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
        : null
      return { participant, pred, scored }
    })
    .filter(Boolean)
    .sort((a, b) => (b!.scored?.points ?? 0) - (a!.scored?.points ?? 0)) as Array<{
      participant: PlayerRow
      pred: Prediction
      scored: ScoredFixture | null
    }>

  return (
    <div className="ss-card overflow-hidden">
      {/* Header — always visible, click to expand */}
      <button
        className="w-full px-5 py-3 bg-blue-950/80 flex items-center justify-between border-b border-blue-900 hover:bg-blue-900/50 transition"
        onClick={() => setOpen(o => !o)}
      >
        <div className="text-sm font-bold text-left">
          {TEAM_FLAGS[fixture.homeTeam]} {fixture.homeTeam}
          <span className="text-blue-400 mx-2">vs</span>
          {fixture.awayTeam} {TEAM_FLAGS[fixture.awayTeam]}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {result ? (
            <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black font-black text-sm px-3 py-1 rounded-full">
              {result.home_score} – {result.away_score}
            </div>
          ) : (
            <div className="text-blue-600 text-xs">Pending</div>
          )}
          <span className="text-blue-500 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expandable predictions */}
      {open && (
        <div className="divide-y divide-blue-900/40">
          {/* Column headers */}
          <div className="px-5 py-1.5 flex items-center gap-3 bg-blue-950/40">
            <div className="w-28 text-xs font-black text-blue-500 uppercase tracking-wider">Player</div>
            <div className="w-14 text-xs font-black text-blue-500 uppercase tracking-wider text-center">Pick</div>
            <div className="flex-1 text-xs font-black text-blue-500 uppercase tracking-wider">Outcome</div>
            <div className="w-12 text-xs font-black text-blue-500 uppercase tracking-wider text-right">Pts</div>
          </div>
          {rows.map(({ participant, pred, scored }) => (
            <div key={participant.id} className="px-5 py-2.5 flex items-center gap-3">
              <div className="w-28 text-sm font-semibold truncate text-blue-200">{participant.name}</div>
              <div className="w-14 text-center">
                <span className="text-sm font-black text-white">{pred.home_score}–{pred.away_score}</span>
              </div>
              <div className={`flex-1 text-sm font-semibold ${scored ? outcomeBg(scored.label) : 'text-blue-600'}`}>
                {scored ? outcomeLabel(scored.label, pred.is_joker) : '–'}
              </div>
              <div className="w-12 text-right">
                {scored && scored.points > 0 ? (
                  <span className="text-white font-black text-sm">+{scored.points}</span>
                ) : scored ? (
                  <span className="text-blue-700 font-bold text-sm">0</span>
                ) : (
                  <span className="text-blue-700 text-sm">–</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex-shrink-0 ${
      active ? 'bg-red-600 text-white shadow-md shadow-red-900/40' : 'bg-blue-950 border border-blue-900 text-blue-400 hover:border-blue-700'
    }`}>{label}</button>
  )
}
