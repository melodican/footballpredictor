import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIXTURES, FIXTURES_BY_GROUP, TEAM_FLAGS, GROUP_TEAMS } from '../data/fixtures'
import { scoreFixture, labelColor, calculateGroupStandings, GROUP_WINNER_POINTS } from '../lib/scoring'
import type { Participant, Prediction, Result, TournamentSettings, Group, ScoredFixture } from '../types'
import { GROUPS } from '../types'
import PlayerAvatar, { AVATAR_MAP } from '../components/PlayerAvatar'

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || 'wc2026admin'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerRow extends Participant {
  total: number
  matchPoints: number
  groupWinnerPoints: number
  tournamentWinnerPoints: number
  goldenBootPoints: number
  s: number; sj: number; r: number; rj: number; played: number
  jokersRemaining: number
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
      supabase.from('predictions').select('*').range(0, 1999),
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
      let matchPoints = 0, s = 0, sj = 0, r = 0, rj = 0, played = 0, jokersUsed = 0
      for (const pred of preds) {
        if (pred.is_joker && resultsMap[pred.fixture_id]) jokersUsed++
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
        jokersRemaining: 12 - jokersUsed,
      }
    }).sort((a, b) => b.total - a.total || b.s - a.s || b.r - a.r)
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

  // Top scorer race — all picked players, sorted by goals scored desc (then pick count)
  const topScorerRace = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of participants) {
      if (p.top_scorer_pick) counts[p.top_scorer_pick] = (counts[p.top_scorer_pick] || 0) + 1
    }
    const goals = (settings?.scorer_goals as Record<string, number>) ?? {}
    return Object.entries(counts)
      .map(([name, picked]) => ({ name, picked, goals: goals[name] ?? 0 }))
      .sort((a, b) => b.goals - a.goals || b.picked - a.picked)
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
            <div className="flex items-center gap-4 mt-1 text-xs text-blue-400 font-medium flex-wrap">
              <span>👥 {participants.length} players</span>
              <span>🎯 {results.length} results in</span>
              <span className="text-yellow-400 font-bold">🥇 £100 · 🥈 £30 · 🥉 £10</span>
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

            {/* Position Chart */}
            {results.length >= 2 && (
              <PositionChart participants={participants} predsByParticipant={predsByParticipant} results={results} />
            )}

            {/* Form Table */}
            {results.length >= 5 && (
              <FormTable leaderboard={leaderboard} predsByParticipant={predsByParticipant} resultsMap={resultsMap} />
            )}

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
                      <PlayerAvatar name={p.name} size="md" />
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

// ─── Countdown Hook ───────────────────────────────────────────────────────────

function useCountdown(targetUtc?: string) {
  const calc = useCallback(() => {
    if (!targetUtc) return null
    const diff = new Date(targetUtc).getTime() - Date.now()
    if (diff <= 0) return null
    const h = Math.floor(diff / 3600000)
    const m = Math.floor((diff % 3600000) / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return { h, m, s, diff }
  }, [targetUtc])

  const [time, setTime] = useState(calc)
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000)
    return () => clearInterval(id)
  }, [calc])
  return time
}

function CountdownBadge({ kickoffUtc }: { kickoffUtc?: string }) {
  const t = useCountdown(kickoffUtc)
  if (!kickoffUtc) return null
  if (!t) return <span className="text-xs font-bold text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full">⏱ Awaiting result</span>

  const isImminent = t.diff < 3600000 // under 1 hour
  const isToday = t.h < 24

  if (isImminent) {
    return (
      <span className="text-xs font-black text-red-400 bg-red-900/40 border border-red-700/50 px-2.5 py-1 rounded-full animate-pulse">
        {t.h > 0 ? `${t.h}h ` : ''}{String(t.m).padStart(2,'0')}:{String(t.s).padStart(2,'0')}
      </span>
    )
  }
  if (isToday) {
    return (
      <span className="text-xs font-bold text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded-full">
        {t.h}h {t.m}m
      </span>
    )
  }
  return (
    <span className="text-xs font-semibold text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded-full">
      {Math.floor(t.h / 24)}d {t.h % 24}h
    </span>
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
        {fixtures.map(f => (
          <div key={f.id} className="bg-blue-950/60 rounded-xl border border-blue-900 overflow-hidden">
            <div className="bg-blue-900/50 px-3 py-2.5 border-b border-blue-900 space-y-1.5">
              <div className="text-xs font-bold text-center">
                {TEAM_FLAGS[f.homeTeam]} {f.homeTeam}
                <span className="text-blue-400 mx-1.5">vs</span>
                {f.awayTeam} {TEAM_FLAGS[f.awayTeam]}
              </div>
              <div className="flex justify-center">
                <CountdownBadge kickoffUtc={f.kickoffUtc} />
              </div>
            </div>
            <div className="divide-y divide-blue-900/40">
              {leaderboard.map(participant => {
                const pred = (predsByParticipant[participant.id] || []).find(p => p.fixture_id === f.id)
                if (!pred) return null
                return (
                  <div key={participant.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <PlayerAvatar name={participant.name} size="sm" />
                    <span className="text-blue-200 font-semibold flex-1 truncate">{participant.name}</span>
                    <div className="flex items-center gap-1 w-20">
                      <span className="font-black text-white whitespace-nowrap">{pred.home_score}–{pred.away_score}</span>
                      {pred.is_joker && (
                        <span className="text-yellow-400 font-black bg-yellow-400/10 px-1 py-0.5 rounded whitespace-nowrap">★J</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Top Scorer Race ──────────────────────────────────────────────────────────

function TopScorerRace({ race }: { race: Array<{ name: string; picked: number; goals: number }> }) {
  const maxGoals = Math.max(...race.map(r => r.goals), 1)
  const hasGoals = race.some(r => r.goals > 0)
  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-500 text-black text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">⚽ Top Scorer Race</div>
          {hasGoals && <span className="text-xs text-blue-400">Sorted by goals scored</span>}
        </div>
        <span className="text-xs text-blue-500">{race.length} players picked</span>
      </div>
      <div className="divide-y divide-blue-900/40">
        {race.map((r, i) => {
          const isLeader = i === 0 && r.goals > 0
          const barWidth = maxGoals > 0 ? `${Math.max((r.goals / maxGoals) * 100, r.goals === 0 ? 0 : 4)}%` : '0%'
          return (
            <div key={r.name} className={`px-5 py-3.5 flex items-center gap-4 ${isLeader ? 'bg-yellow-400/5' : ''}`}>
              {/* Position badge */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
                isLeader ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-black' :
                i === 1 && r.goals > 0 ? 'bg-slate-300 text-slate-900' :
                i === 2 && r.goals > 0 ? 'bg-amber-700 text-white' :
                'bg-blue-900 text-blue-500'
              }`}>
                {isLeader ? '👑' : i + 1}
              </div>
              {/* Name + backers */}
              <div className="flex-1 min-w-0">
                <div className={`font-black text-sm truncate ${isLeader ? 'text-yellow-300' : 'text-white'}`}>{r.name}</div>
                <div className="mt-1.5 h-1.5 bg-blue-900 rounded-full overflow-hidden w-full">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      isLeader ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' : 'bg-gradient-to-r from-blue-500 to-blue-400'
                    }`}
                    style={{ width: barWidth }}
                  />
                </div>
                <div className="text-xs text-blue-500 mt-1">{r.picked} family member{r.picked !== 1 ? 's' : ''} backing them</div>
              </div>
              {/* Goal count */}
              <div className="text-right flex-shrink-0">
                <div className={`font-black text-2xl ${isLeader ? 'gradient-text' : r.goals > 0 ? 'text-white' : 'text-blue-700'}`}>
                  {r.goals}
                </div>
                <div className="text-xs text-blue-600">goal{r.goals !== 1 ? 's' : ''}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Position Chart (bump chart) ─────────────────────────────────────────────

const PLAYER_COLORS = [
  '#f43f5e', '#fb923c', '#facc15', '#4ade80', '#22d3ee',
  '#60a5fa', '#a78bfa', '#f472b6', '#2dd4bf', '#34d399',
  '#f87171', '#818cf8', '#e879f9', '#a3e635',
]


function PositionChart({ participants, predsByParticipant, results }: {
  participants: Participant[]
  predsByParticipant: Record<string, Prediction[]>
  results: Result[]
}) {
  const sortedResults = useMemo(() =>
    [...results].sort((a, b) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime()),
    [results]
  )

  // For each result, compute everyone's position up to that point
  const snapshots = useMemo(() => {
    return sortedResults.map((_, upTo) => {
      const subMap: Record<string, { home_score: number; away_score: number }> = {}
      for (const r of sortedResults.slice(0, upTo + 1)) {
        subMap[r.fixture_id] = { home_score: r.home_score, away_score: r.away_score }
      }
      const scored = participants.map(p => {
        const preds = predsByParticipant[p.id] || []
        let pts = 0
        for (const pred of preds) {
          const res = subMap[pred.fixture_id]
          if (!res) continue
          pts += scoreFixture(
            { home: pred.home_score, away: pred.away_score },
            { home: res.home_score, away: res.away_score },
            pred.is_joker
          ).points
        }
        return { id: p.id, pts }
      }).sort((a, b) => b.pts - a.pts)
      const positions: Record<string, number> = {}
      scored.forEach((p, i) => { positions[p.id] = i + 1 })
      return positions
    })
  }, [sortedResults, participants, predsByParticipant])

  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
  }, [snapshots.length])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (snapshots.length < 2) return null

  const nGames = snapshots.length
  const nPlayers = participants.length
  const STEP_X = 50
  const STEP_Y = 40
  const PAD_L = 38
  const PAD_R = 76
  const PAD_T = 24
  const PAD_B = 24
  const W = PAD_L + (nGames - 1) * STEP_X + PAD_R
  const H = PAD_T + (nPlayers - 1) * STEP_Y + PAD_B

  const xScale = (i: number) => PAD_L + i * STEP_X
  const yScale = (pos: number) => PAD_T + (pos - 1) * STEP_Y

  const getPath = (positions: number[]) => {
    const pts = positions.map((pos, i) => ({ x: xScale(i), y: yScale(pos) }))
    let d = `M ${pts[0].x},${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2
      d += ` C ${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`
    }
    return d
  }

  // Pre-compute per-player data
  const playerData = participants.map((p, pi) => {
    const positions = snapshots.map(s => s[p.id] ?? nPlayers)
    const lastPos = positions[positions.length - 1]
    const color = PLAYER_COLORS[pi % PLAYER_COLORS.length]
    const endX = xScale(nGames - 1) + 36
    const endY = yScale(lastPos)
    const avatarUrl = AVATAR_MAP[p.name]
    return { p, pi, positions, color, endX, endY, avatarUrl, lastPos }
  })

  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center gap-3">
        <div className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">🏁 Race</div>
        <span className="text-sm font-black">Tournament Positions</span>
        <span className="text-xs text-blue-400 ml-auto">
          {selectedId ? <span className="text-yellow-400">Click again to reset</span> : `${nGames} result${nGames !== 1 ? 's' : ''} in · tap a face to focus`}
        </span>
      </div>
      <div ref={scrollRef} className="overflow-x-auto bg-[#060d1f]">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ display: 'block', minWidth: W }} onClick={() => setSelectedId(null)}>
          {/* Clip paths for avatar photos */}
          <defs>
            {playerData.map(({ pi, endX, endY }) => (
              <clipPath key={pi} id={`cc-${pi}`}>
                <circle cx={endX} cy={endY} r={18} />
              </clipPath>
            ))}
          </defs>

          {/* Horizontal grid lines */}
          {Array.from({ length: nPlayers }, (_, i) => (
            <line key={i}
              x1={PAD_L} y1={yScale(i + 1)}
              x2={xScale(nGames - 1)} y2={yScale(i + 1)}
              stroke="#1e3a6b" strokeWidth={0.5} strokeDasharray="3,5"
            />
          ))}

          {/* Position labels on left */}
          {Array.from({ length: nPlayers }, (_, i) => (
            <g key={i}>
              <text x={PAD_L - 8} y={yScale(i + 1) + 5}
                textAnchor="end" fill="#94a3b8" fontSize={13} fontWeight="900"
                fontFamily="system-ui, sans-serif">
                {i + 1}
              </text>
              <line x1={PAD_L - 4} y1={yScale(i + 1)} x2={PAD_L} y2={yScale(i + 1)} stroke="#334d7a" strokeWidth={1} />
            </g>
          ))}

          {/* Game number labels on bottom */}
          {snapshots.map((_, i) => (
            (i === 0 || (i + 1) % 5 === 0 || i === nGames - 1) && (
              <text key={i} x={xScale(i)} y={H - 4}
                textAnchor="middle" fill="#334d7a" fontSize={9}>
                {i + 1}
              </text>
            )
          ))}

          {/* Lines + avatars */}
          {playerData.map(({ p, pi, positions, color, endX, endY, avatarUrl }) => {
            const isSelected = selectedId === p.id
            const isDimmed = selectedId !== null && !isSelected
            return (
              <g key={p.id} style={{ transition: 'opacity 0.2s' }} opacity={isDimmed ? 0.08 : 1}>
                {/* Main line */}
                <path
                  d={getPath(positions)}
                  fill="none"
                  stroke={color}
                  strokeWidth={isSelected ? 4 : 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {/* Avatar at end — always photo, coloured circle behind as fallback */}
                <circle cx={endX} cy={endY} r={19} fill={color} opacity={0.3} />
                <circle cx={endX} cy={endY} r={18} fill={color} />
                <image
                  href={avatarUrl || ''}
                  x={endX - 18} y={endY - 18}
                  width={36} height={36}
                  clipPath={`url(#cc-${pi})`}
                  preserveAspectRatio="xMidYMid slice"
                />
                {/* Coloured ring — thicker when selected */}
                <circle cx={endX} cy={endY} r={18} fill="none" stroke={color} strokeWidth={isSelected ? 4 : 2.5} />
                {/* Invisible click target over avatar */}
                <circle
                  cx={endX} cy={endY} r={20}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(isSelected ? null : p.id) }}
                />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

// ─── Form Table ───────────────────────────────────────────────────────────────

function FormTable({ leaderboard, predsByParticipant, resultsMap }: {
  leaderboard: PlayerRow[]
  predsByParticipant: Record<string, Prediction[]>
  resultsMap: Record<string, Result>
}) {
  // Get last 5 results (by entered_at order) for each player
  const formData = useMemo(() => {
    // Fixture IDs in result order (most recently entered last)
    const playedFixtureIds = Object.keys(resultsMap)

    return leaderboard.map(p => {
      const preds = predsByParticipant[p.id] || []
      const predMap: Record<string, Prediction> = {}
      for (const pred of preds) predMap[pred.fixture_id] = pred

      // Last 5 played fixtures
      const last5 = playedFixtureIds.slice(-5)
      const formPts = last5.reduce((sum, fid) => {
        const pred = predMap[fid]
        const result = resultsMap[fid]
        if (!pred || !result) return sum
        return sum + scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker).points
      }, 0)

      const dots = last5.map(fid => {
        const pred = predMap[fid]
        const result = resultsMap[fid]
        if (!pred || !result) return { color: 'none', joker: false }
        const pts = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker).points
        const color = pts >= 5 ? 'gold' : pts > 0 ? 'green' : 'red'
        return { color, joker: pred.is_joker }
      })

      return { ...p, formPts, dots }
    }).sort((a, b) => b.formPts - a.formPts)
  }, [leaderboard, predsByParticipant, resultsMap])

  const dotColor: Record<string, string> = {
    gold: 'bg-yellow-400 text-black',
    green: 'bg-emerald-500 text-white',
    red: 'bg-red-600 text-white',
    none: 'bg-blue-900 text-blue-700',
  }
  const dotTitle = (color: string, joker: boolean) => {
    const base = color === 'gold' ? 'Correct score (+5)' : color === 'green' ? 'Correct result (+2)' : color === 'red' ? 'No points' : '–'
    return joker ? `${base} — Joker ×2` : base
  }

  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">📈 Form</div>
          <span className="text-sm font-black">Last 5 Games</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-blue-500">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" /> Score</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Result</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Blank</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-900 ring-2 ring-yellow-400 ring-offset-1 ring-offset-[#0c1733] inline-flex items-center justify-center text-yellow-400 font-black" style={{ fontSize: '7px' }}>J</span> Joker</span>
        </div>
      </div>
      <div className="divide-y divide-blue-900/40">
        {formData.map((p, i) => (
          <div key={p.id} className="px-5 py-3 flex items-center gap-3">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
              i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-black' : 'bg-blue-900 text-blue-400'
            }`}>{i + 1}</div>
            <PlayerAvatar name={p.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm truncate">{p.name}</div>
              <div className="flex gap-1 mt-1">
                {p.dots.map((d, idx) => (
                  d.joker ? (
                    <div key={idx} title={dotTitle(d.color, true)} className={`w-4 h-4 rounded-full flex items-center justify-center font-black ring-2 ring-yellow-400 ring-offset-1 ring-offset-[#0c1733] ${dotColor[d.color]}`} style={{ fontSize: '8px' }}>J</div>
                  ) : (
                    <div key={idx} title={dotTitle(d.color, false)} className={`w-3 h-3 rounded-full ${dotColor[d.color]}`} />
                  )
                ))}
              </div>
            </div>
            <div className="text-right">
              <div className={`font-black text-lg ${i === 0 ? 'gradient-text' : 'text-white'}`}>{p.formPts}</div>
              <div className="text-xs text-blue-500">last 5</div>
            </div>
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
          <span className="text-yellow-400 font-bold">🃏</span>=Jokers Remaining ·{' '}
          <span className="text-emerald-400 font-bold">R</span>=Correct Result (2pts) ·{' '}
          <span className="text-yellow-400 font-bold">S</span>=Correct Score (5pts) ·{' '}
          <span className="text-yellow-300 font-bold">J</span>=Joker ×2 ·{' '}
          <span className="text-purple-400 font-bold">GW</span>=Group Winner (5pts)
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
                <span className="bg-red-600 text-white rounded px-1 text-xs font-black">🃏</span>
              </th>
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
              <th className="px-3 py-2.5 text-center">
                <span className="bg-purple-600 text-white rounded px-1 text-xs font-black">GW</span>
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
                  <div className="flex items-center gap-2.5">
                    <PlayerAvatar name={p.name} size="sm" />
                    <div>
                      <div className="font-bold">{p.name}</div>
                      <div className="text-xs text-blue-500">🏆 {p.winner_pick} · ⚽ {p.top_scorer_pick}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`font-black text-sm ${p.jokersRemaining === 0 ? 'text-blue-800' : p.jokersRemaining <= 3 ? 'text-orange-400' : 'text-yellow-400'}`}>
                    {p.jokersRemaining}
                  </span>
                </td>
                <td className="px-3 py-3 text-center font-bold text-emerald-400">{p.r || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-emerald-300">{p.rj || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-yellow-400">{p.s || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-yellow-300">{p.sj || '–'}</td>
                <td className="px-3 py-3 text-center font-bold text-purple-400">{p.groupWinnerPoints || '–'}</td>
                <td className="px-3 py-3 text-center">
                  <div className={`font-black text-lg ${i === 0 ? 'gradient-text' : 'text-white'}`}>{p.total}</div>

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
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 ${
              i === 0 ? 'bg-gradient-to-br from-yellow-300 to-yellow-600 text-black' :
              i === 1 ? 'bg-slate-300 text-slate-900' :
              i === 2 ? 'bg-amber-700 text-white' : 'bg-blue-900 text-blue-400'
            }`}>{i + 1}</div>
            <PlayerAvatar name={p.name} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-xs text-blue-400 flex gap-2">
                <span className="text-emerald-400">R:{p.r}</span>
                <span className="text-emerald-300">RJ:{p.rj}</span>
                <span className="text-yellow-400">S:{p.s}</span>
                <span className="text-yellow-300">SJ:{p.sj}</span>
                {p.groupWinnerPoints > 0 && <span className="text-purple-400">GW:{p.groupWinnerPoints}</span>}
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
                  <span className="font-black text-white w-12 text-center whitespace-nowrap flex-shrink-0">
                    {pred ? `${pred.home_score}–${pred.away_score}` : '–'}
                  </span>
                  <span className="flex-1 text-blue-200 truncate">{f.awayTeam} {TEAM_FLAGS[f.awayTeam]}</span>
                  <div className="w-20 flex items-center justify-end gap-1 flex-shrink-0">
                    {pred?.is_joker && <span className="text-yellow-400 font-black">★</span>}
                    {scored ? (
                      <span className={`px-1.5 py-0.5 rounded font-black ${labelColor(scored.label)}`}>
                        {scored.label === null ? '–' : scored.label}{scored.points > 0 ? ` +${scored.points}` : ''}
                      </span>
                    ) : <span className="w-12" />}
                  </div>
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

  // Only look at the last 4 results for match-specific commentary
  const last4FixtureIds = new Set([...results].reverse().slice(0, 4).map(r => r.fixture_id))

  const leader = leaderboard[0]
  const bottom = leaderboard[leaderboard.length - 1]
  const second = leaderboard[1]
  const third = leaderboard[2]

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

  // ── Top 3 standings summary
  if (leader && second && third) {
    items.push(`📋 Top 3: 🥇 ${leader.name} (${leader.total}pts) · 🥈 ${second.name} (${second.total}pts) · 🥉 ${third.name} (${third.total}pts)`)
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

  // ── Exact score hits from last 4 games only
  for (const p of leaderboard) {
    for (const pred of (predsByParticipant[p.id] || [])) {
      if (!last4FixtureIds.has(pred.fixture_id)) continue
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

  // ── Joker correct result (RJ) from last 4 games only
  for (const p of leaderboard) {
    for (const pred of (predsByParticipant[p.id] || [])) {
      if (!last4FixtureIds.has(pred.fixture_id)) continue
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

  // ── Recent match results (last 4 only)
  for (const result of [...results].reverse().slice(0, 4)) {
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

  // ── Dry spells (based on last 4 games)
  for (const p of leaderboard) {
    let streak = 0
    for (const pred of [...(predsByParticipant[p.id] || [])].reverse()) {
      if (!last4FixtureIds.has(pred.fixture_id)) continue
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

  // ── Hot streak (last 4 games)
  for (const p of leaderboard) {
    let streak = 0
    for (const pred of [...(predsByParticipant[p.id] || [])].reverse()) {
      if (!last4FixtureIds.has(pred.fixture_id)) continue
      const result = resultsMap[pred.fixture_id]
      if (!result) continue
      const scored = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker)
      if (scored.points > 0) streak++
      else break
    }
    if (streak >= 3) {
      items.push(pick([
        `🔥 ${p.name} is on fire — points in ${streak} of the last 4 games`,
        `📈 ${p.name} in red-hot form right now. ${streak} games scoring in a row`,
      ]))
    }
  }

  // ── Total correct scores overall
  const totalCorrectScores = leaderboard.reduce((sum, p) => sum + p.s + p.sj, 0)
  if (totalCorrectScores > 0) {
    items.push(`🎯 ${totalCorrectScores} exact score${totalCorrectScores !== 1 ? 's' : ''} predicted correctly so far — who's the oracle?`)
  }

  // ── Jokers remaining leader
  const mostJokers = [...leaderboard].sort((a, b) => b.jokersRemaining - a.jokersRemaining)[0]
  const fewestJokers = [...leaderboard].sort((a, b) => a.jokersRemaining - b.jokersRemaining)[0]
  if (mostJokers && fewestJokers && mostJokers.id !== fewestJokers.id) {
    items.push(`🃏 ${fewestJokers.name} is down to ${fewestJokers.jokersRemaining} joker${fewestJokers.jokersRemaining !== 1 ? 's' : ''} remaining — choose wisely!`)
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
            <div className="w-36 text-xs font-black text-blue-500 uppercase tracking-wider">Player</div>
            <div className="w-24 text-xs font-black text-blue-500 uppercase tracking-wider">Pick</div>
            <div className="flex-1 text-xs font-black text-blue-500 uppercase tracking-wider">Outcome</div>
            <div className="w-12 text-xs font-black text-blue-500 uppercase tracking-wider text-right">Pts</div>
          </div>
          {rows.map(({ participant, pred, scored }) => (
            <div key={participant.id} className="px-5 py-2.5 flex items-center gap-3">
              <div className="w-36 text-sm font-semibold truncate text-blue-200">{participant.name}</div>
              <div className="w-24 flex items-center gap-1">
                <span className="text-sm font-black text-white whitespace-nowrap">{pred.home_score}–{pred.away_score}</span>
                {pred.is_joker && (
                  <span className="text-yellow-400 font-black text-xs bg-yellow-400/10 px-1 py-0.5 rounded whitespace-nowrap">★J</span>
                )}
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
