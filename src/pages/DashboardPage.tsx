import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIXTURES, FIXTURES_BY_GROUP, TEAM_FLAGS, GROUP_TEAMS } from '../data/fixtures'
import {
  R32_FIXTURES, R16_FIXTURES, QF_FIXTURES, SF_FIXTURES, THIRD_PLACE_FIXTURE, FINAL_FIXTURE,
  KNOCKOUT_FIXTURE_IDS, KNOCKOUT_FIXTURE_MAP, BRACKET_SOURCES, KO_JOKER_LIMIT, ROUND_LABELS, getTeamFlag, getWinner,
  type KnockoutFixture, type KnockoutRound,
} from '../data/knockoutFixtures'
import { scoreFixture, labelColor, calculateGroupStandings, GROUP_WINNER_POINTS } from '../lib/scoring'
import type { Participant, Prediction, Result, TournamentSettings, Group, ScoredFixture, Fixture } from '../types'
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
  koJokersRemaining: number
  // Per-stage points breakdown
  groupPts: number
  r32Pts: number
  r16Pts: number
  qfPts: number
  sfPts: number
  finalPts: number
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
  const [activeGroup, setActiveGroup] = useState<Group>('A')
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
      let matchPoints = 0, s = 0, sj = 0, r = 0, rj = 0, played = 0, jokersUsed = 0, koJokersUsed = 0
      let groupPts = 0, r32Pts = 0, r16Pts = 0, qfPts = 0, sfPts = 0, finalPts = 0
      for (const pred of preds) {
        const isKO = KNOCKOUT_FIXTURE_IDS.has(pred.fixture_id)
        if (pred.is_joker && resultsMap[pred.fixture_id]) {
          if (isKO) koJokersUsed++
          else jokersUsed++
        }
        const result = resultsMap[pred.fixture_id]
        if (!result) continue
        played++
        const scored = scoreFixture(
          { home: pred.home_score, away: pred.away_score },
          { home: result.home_score, away: result.away_score },
          pred.is_joker,
          pred.fixture_id === 'KO_F_1',
        )
        matchPoints += scored.points
        if (scored.label === 'S') s++
        else if (scored.label === 'SJ') sj++
        else if (scored.label === 'R') r++
        else if (scored.label === 'RJ') rj++
        // Stage breakdown
        if (!isKO) groupPts += scored.points
        else {
          const round = KNOCKOUT_FIXTURE_MAP[pred.fixture_id]?.round
          if (round === 'R32') r32Pts += scored.points
          else if (round === 'R16') r16Pts += scored.points
          else if (round === 'QF')  qfPts  += scored.points
          else if (round === 'SF')  sfPts  += scored.points
          else if (round === '3RD' || round === 'F') finalPts += scored.points
        }
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
        koJokersRemaining: KO_JOKER_LIMIT - koJokersUsed,
        groupPts: groupPts + groupWinnerPoints,
        r32Pts, r16Pts, qfPts, sfPts, finalPts,
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

  const filteredFixtures = FIXTURES_BY_GROUP[activeGroup] ?? []

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

            {/* Knockout Bracket Tree — shown above leaderboard in knockout phase */}
            {settings?.current_phase !== 'group' && (
              <BracketTree resultsMap={resultsMap} />
            )}

            {/* Leaderboard */}
            <LeaderboardSection leaderboard={leaderboard} actualWinner={settings?.actual_tournament_winner ?? null} actualGoldenBoot={settings?.actual_golden_boot ?? null} />

            {/* Position Chart */}
            {results.length >= 2 && (
              <PositionChart
                participants={participants}
                predsByParticipant={predsByParticipant}
                results={results}
                finalOrder={leaderboard.map(p => p.id)}
              />
            )}

            {/* Form Table */}
            {results.length >= 5 && (
              <FormTable leaderboard={leaderboard} predsByParticipant={predsByParticipant} resultsMap={resultsMap} />
            )}

            {/* Knockout detail list */}
            {settings?.current_phase !== 'group' && (
              <KnockoutBracket
                resultsMap={resultsMap}
                leaderboard={leaderboard}
                predsByParticipant={predsByParticipant}
                revealed={revealed}
              />
            )}

            {/* Points Guide */}
            <PointsGuide />

            {/* Top Scorer Race */}
            {topScorerRace.length > 0 && (
              <TopScorerRace race={topScorerRace} />
            )}

            {/* Group Stage Results — collapsible, collapsed by default in knockout phase */}
            <GroupStageResults
              activeGroup={activeGroup}
              setActiveGroup={setActiveGroup}
              filteredFixtures={filteredFixtures}
              resultsMap={resultsMap}
              leaderboard={leaderboard}
              predsByParticipant={predsByParticipant}
              defaultCollapsed={settings?.current_phase !== 'group'}
            />

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
                        <div className="text-xs flex gap-1.5 flex-wrap">
                          <span className={settings?.actual_tournament_winner && p.winner_pick === settings.actual_tournament_winner ? 'text-emerald-400 font-bold' : 'text-blue-400'}>🏆 {p.winner_pick}</span>
                          <span className="text-blue-700">·</span>
                          <span className={settings?.actual_golden_boot && p.top_scorer_pick === settings.actual_golden_boot ? 'text-emerald-400 font-bold' : 'text-blue-400'}>⚽ {p.top_scorer_pick}</span>
                        </div>
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
                        revealed={revealed}
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

// ─── Group Stage Results (collapsible) ────────────────────────────────────────

function GroupStageResults({ activeGroup, setActiveGroup, filteredFixtures, resultsMap, leaderboard, predsByParticipant, defaultCollapsed }: {
  activeGroup: Group
  setActiveGroup: (g: Group) => void
  filteredFixtures: Fixture[]
  resultsMap: Record<string, Result>
  leaderboard: PlayerRow[]
  predsByParticipant: Record<string, Prediction[]>
  defaultCollapsed: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <div className="ss-card overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full bg-blue-900/60 px-5 py-3 border-b border-blue-800 flex items-center gap-3 hover:bg-blue-900/80 transition"
      >
        <div className="bg-red-600 text-white text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">📋 Groups</div>
        <span className="text-sm font-black">Group Stage Results</span>
        <span className="ml-auto text-blue-500 text-sm">{collapsed ? '▼ Show' : '▲ Hide'}</span>
      </button>

      {!collapsed && (
        <>
          {/* Group tabs */}
          <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-blue-900/60 scrollbar-hide">
            {GROUPS.map(g => {
              const hasResults = FIXTURES_BY_GROUP[g].some(f => resultsMap[f.id])
              return (
                <button
                  key={g}
                  onClick={() => setActiveGroup(g)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex-shrink-0 ${
                    activeGroup === g
                      ? 'bg-red-600 text-white'
                      : hasResults
                        ? 'bg-emerald-900/50 border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900'
                        : 'bg-blue-900/40 border border-blue-800 text-blue-400 hover:bg-blue-900'
                  }`}
                >
                  Grp {g}
                </button>
              )
            })}
          </div>
          <GroupLeagueTable group={activeGroup} fixtures={filteredFixtures} resultsMap={resultsMap} />
          <div className="px-4 pb-4 space-y-3">
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
        </>
      )}
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


function PositionChart({ participants, predsByParticipant, results, finalOrder }: {
  participants: Participant[]
  predsByParticipant: Record<string, Prediction[]>
  results: Result[]
  finalOrder: string[]   // participant IDs in leaderboard order (position 1 first)
}) {
  const sortedResults = useMemo(() =>
    [...results].sort((a, b) => new Date(a.entered_at).getTime() - new Date(b.entered_at).getTime()),
    [results]
  )

  // For each result, compute everyone's position up to that point
  const snapshots = useMemo(() => {
    const lastIdx = sortedResults.length - 1
    return sortedResults.map((_, upTo) => {
      const subMap: Record<string, { home_score: number; away_score: number }> = {}
      for (const r of sortedResults.slice(0, upTo + 1)) {
        subMap[r.fixture_id] = { home_score: r.home_score, away_score: r.away_score }
      }
      const isLatest = upTo === lastIdx

      // For the final snapshot, use the leaderboard's exact order (includes tiebreakers)
      if (isLatest && finalOrder.length > 0) {
        const positions: Record<string, number> = {}
        finalOrder.forEach((id, i) => { positions[id] = i + 1 })
        // Fill any participants not in finalOrder (shouldn't happen, but safe)
        participants.forEach(p => { if (!(p.id in positions)) positions[p.id] = finalOrder.length + 1 })
        return positions
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
            pred.is_joker,
            pred.fixture_id === 'KO_F_1',
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

// ─── Bracket Tree Visual ──────────────────────────────────────────────────────

const LEFT_R32  = ['KO_R32_1','KO_R32_2','KO_R32_3','KO_R32_4','KO_R32_5','KO_R32_6','KO_R32_7','KO_R32_8']
const RIGHT_R32 = ['KO_R32_9','KO_R32_10','KO_R32_11','KO_R32_12','KO_R32_13','KO_R32_14','KO_R32_15','KO_R32_16']
const LEFT_R16  = ['KO_R16_1','KO_R16_2','KO_R16_3','KO_R16_4']
const RIGHT_R16 = ['KO_R16_5','KO_R16_6','KO_R16_7','KO_R16_8']
const LEFT_QF   = ['KO_QF_1','KO_QF_2']
const RIGHT_QF  = ['KO_QF_3','KO_QF_4']
const LEFT_SF   = ['KO_SF_1']
const RIGHT_SF  = ['KO_SF_2']

// Card height + gap in px
const CARD_H = 52
const GAP = 8
const SLOT = CARD_H + GAP

function bracketY(slot: number, totalSlots: number, containerSlots: number): number {
  // Center a group of totalSlots items within a containerSlots-slot space
  const offset = ((containerSlots - totalSlots) / 2) * SLOT
  return offset + (slot - 1) * SLOT
}

// Resolve winner of a fixture — uses pen_winner to break draws in knockouts
function resolveWinner(sourceId: string, resultsMap: Record<string, Result>): string | null {
  const result = resultsMap[sourceId]
  if (!result) return null
  if (result.home_score !== result.away_score) return getWinner(KNOCKOUT_FIXTURE_MAP[sourceId], result)
  return result.pen_winner ?? null
}

// Resolve a team name for a bracket slot — if TBD, look up the winner of the feeding fixture
function resolveTeam(team: string, side: 'home' | 'away', fixtureId: string, resultsMap: Record<string, Result>): string {
  if (team !== 'TBD') return team
  const sources = BRACKET_SOURCES[fixtureId]
  if (!sources) return 'TBD'
  return resolveWinner(sources[side], resultsMap) ?? 'TBD'
}

function BracketMatchCard({ id, resultsMap }: { id: string; resultsMap: Record<string, Result> }) {
  const fixture = KNOCKOUT_FIXTURE_MAP[id]
  if (!fixture) return null
  const result = resultsMap[id]

  const homeTeam = resolveTeam(fixture.homeTeam, 'home', id, resultsMap)
  const awayTeam = resolveTeam(fixture.awayTeam, 'away', id, resultsMap)
  const winner = result
    ? (result.home_score > result.away_score ? homeTeam : result.away_score > result.home_score ? awayTeam : null)
    : null
  const isTBD = homeTeam === 'TBD' && awayTeam === 'TBD'

  const teamRow = (team: string, score: number | null) => {
    const isWinner = winner === team
    const stillTBD = team === 'TBD'
    return (
      <div className={`flex items-center gap-1 px-2 py-0.5 rounded ${isWinner ? 'bg-yellow-400/20' : ''}`}>
        <span className="text-base leading-none">{getTeamFlag(team)}</span>
        <span className={`text-xs font-bold truncate flex-1 ${isWinner ? 'text-yellow-300' : stillTBD ? 'text-blue-700' : 'text-white'}`} style={{ maxWidth: 68 }}>
          {stillTBD ? 'TBD' : team.split(' ')[0]}
        </span>
        {score !== null && (
          <span className={`text-xs font-black ml-auto ${isWinner ? 'text-yellow-300' : 'text-blue-300'}`}>{score}</span>
        )}
      </div>
    )
  }

  return (
    <div className={`border rounded-lg overflow-hidden flex-shrink-0 ${
      result ? 'border-blue-700/60 bg-blue-950/80' : isTBD ? 'border-blue-900/30 bg-blue-950/20' : 'border-blue-800/60 bg-blue-950/60'
    }`} style={{ width: 108, height: CARD_H }}>
      <div className="flex flex-col justify-center h-full py-0.5">
        {teamRow(homeTeam, result ? result.home_score : null)}
        <div className="border-t border-blue-900/40 my-0.5" />
        {teamRow(awayTeam, result ? result.away_score : null)}
      </div>
    </div>
  )
}

function BracketColumn({ ids, containerSlots, resultsMap }: {
  ids: string[]
  containerSlots: number
  resultsMap: Record<string, Result>
}) {
  return (
    <div className="relative flex-shrink-0" style={{ width: 108, height: containerSlots * SLOT }}>
      {ids.map((id, i) => {
        const y = bracketY(i + 1, ids.length, containerSlots)
        return (
          <div key={id} className="absolute" style={{ top: y, left: 0 }}>
            <BracketMatchCard id={id} resultsMap={resultsMap} />
          </div>
        )
      })}
    </div>
  )
}

// Connector lines between rounds
function ConnectorLines({ fromIds, toIds, containerSlots, direction }: {
  fromIds: string[]
  toIds: string[]
  containerSlots: number
  direction: 'right' | 'left'
}) {
  const midCard = CARD_H / 2
  const h = containerSlots * SLOT

  return (
    <div className="relative flex-shrink-0" style={{ width: 16, height: h }}>
      <svg width={16} height={h}>
        {toIds.map((_, ti) => {
          const f1idx = ti * 2
          const f2idx = ti * 2 + 1
          const y1 = bracketY(f1idx + 1, fromIds.length, containerSlots) + midCard
          const y2 = bracketY(f2idx + 1, fromIds.length, containerSlots) + midCard
          const toY = bracketY(ti + 1, toIds.length, containerSlots) + midCard

          const x1 = direction === 'right' ? 0 : 16
          const x2 = direction === 'right' ? 16 : 0

          return (
            <g key={ti}>
              <line x1={x1} y1={y1} x2={8} y2={y1} stroke="#1e3a6b" strokeWidth={1} />
              <line x1={x1} y1={y2} x2={8} y2={y2} stroke="#1e3a6b" strokeWidth={1} />
              <line x1={8} y1={y1} x2={8} y2={y2} stroke="#1e3a6b" strokeWidth={1} />
              <line x1={8} y1={toY} x2={x2} y2={toY} stroke="#1e3a6b" strokeWidth={1} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function BracketTree({ resultsMap }: { resultsMap: Record<string, Result> }) {
  const slots = 8

  return (
    <div className="ss-card overflow-hidden">
      <div className="bg-gradient-to-r from-yellow-900/40 to-blue-900/40 px-5 py-3 border-b border-yellow-800/40 flex items-center gap-3">
        <div className="bg-yellow-600 text-black text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">🏆 Bracket</div>
        <span className="text-sm font-black">World Cup 2026 Knockouts</span>
        <span className="text-xs text-blue-400 ml-auto">← scroll →</span>
      </div>
      <div className="overflow-x-auto scrollbar-hide bg-[#060d1f]">
        <div className="flex items-center px-3 py-4 gap-0" style={{ minWidth: 900 }}>

          {/* LEFT HALF: R32 → R16 → QF → SF */}
          <BracketColumn ids={LEFT_R32} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={LEFT_R32} toIds={LEFT_R16} containerSlots={slots} direction="right"/>
          <BracketColumn ids={LEFT_R16} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={LEFT_R16} toIds={LEFT_QF} containerSlots={slots} direction="right"/>
          <BracketColumn ids={LEFT_QF} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={LEFT_QF} toIds={LEFT_SF} containerSlots={slots} direction="right"/>
          <BracketColumn ids={LEFT_SF} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={LEFT_SF} toIds={['KO_F_1']} containerSlots={slots} direction="right"/>

          {/* FINAL */}
          <BracketColumn ids={['KO_F_1']} containerSlots={slots} resultsMap={resultsMap}/>

          {/* RIGHT HALF: SF → QF → R16 → R32 */}
          <ConnectorLines fromIds={RIGHT_SF} toIds={['KO_F_1']} containerSlots={slots} direction="left"/>
          <BracketColumn ids={RIGHT_SF} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={RIGHT_QF} toIds={RIGHT_SF} containerSlots={slots} direction="left"/>
          <BracketColumn ids={RIGHT_QF} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={RIGHT_R16} toIds={RIGHT_QF} containerSlots={slots} direction="left"/>
          <BracketColumn ids={RIGHT_R16} containerSlots={slots} resultsMap={resultsMap}/>
          <ConnectorLines fromIds={RIGHT_R32} toIds={RIGHT_R16} containerSlots={slots} direction="left"/>
          <BracketColumn ids={RIGHT_R32} containerSlots={slots} resultsMap={resultsMap}/>

        </div>
      </div>
    </div>
  )
}

// ─── Knockout Bracket ─────────────────────────────────────────────────────────

const ROUND_ORDER: KnockoutRound[] = ['R32', 'R16', 'QF', 'SF', '3RD', 'F']
const ROUND_FIXTURES: Record<KnockoutRound, KnockoutFixture[]> = {
  R32:   R32_FIXTURES,
  R16:   R16_FIXTURES,
  QF:    QF_FIXTURES,
  SF:    SF_FIXTURES,
  '3RD': [THIRD_PLACE_FIXTURE],
  F:     [FINAL_FIXTURE],
}

function KnockoutBracket({ resultsMap, leaderboard, predsByParticipant, revealed }: {
  resultsMap: Record<string, Result>
  leaderboard: PlayerRow[]
  predsByParticipant: Record<string, Prediction[]>
  revealed: boolean
}) {
  const [activeRound, setActiveRound] = useState<KnockoutRound>('R32')
  const [expandedFixture, setExpandedFixture] = useState<string | null>(null)

  const fixtures = ROUND_FIXTURES[activeRound]

  // For each fixture, how many players predicted it and how does the group score
  const koResultsMap = useMemo(() => {
    const m: Record<string, Result> = {}
    for (const [id, r] of Object.entries(resultsMap)) {
      if (KNOCKOUT_FIXTURE_IDS.has(id)) m[id] = r
    }
    return m
  }, [resultsMap])


  return (
    <div className="ss-card overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/60 to-blue-900/60 px-5 py-3 border-b border-purple-800/60 flex items-center gap-3">
        <div className="bg-purple-600 text-white text-xs font-black px-2.5 py-1 rounded uppercase tracking-wider">⚔️ Knockout</div>
        <span className="text-sm font-black">Knockout Stage</span>
        <a
          href="/enter-knockout"
          className="ml-auto text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-full transition"
        >
          Enter Predictions →
        </a>
      </div>

      {/* Round tabs */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-blue-900/60 scrollbar-hide">
        {ROUND_ORDER.map(r => {
          const roundFixtures = ROUND_FIXTURES[r]
          const hasResult = roundFixtures.some(f => koResultsMap[f.id])
          const isLive = roundFixtures.some(f => !koResultsMap[f.id] && f.homeTeam !== 'TBD')
          return (
            <button
              key={r}
              onClick={() => setActiveRound(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition flex-shrink-0 ${
                activeRound === r
                  ? 'bg-purple-600 text-white'
                  : hasResult
                    ? 'bg-emerald-900/50 border border-emerald-700/50 text-emerald-400 hover:bg-emerald-900'
                    : isLive
                      ? 'bg-purple-900/40 border border-purple-700/50 text-purple-300 hover:bg-purple-900/60'
                      : 'bg-blue-900/40 border border-blue-800 text-blue-500 hover:bg-blue-900'
              }`}
            >
              {ROUND_LABELS[r]}
            </button>
          )
        })}
      </div>

      {/* Fixture list for active round */}
      <div className="divide-y divide-blue-900/40">
        {[...fixtures].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)).map(f => (
          <KOFixtureCard
            key={f.id}
            fixture={f}
            result={koResultsMap[f.id]}
            leaderboard={leaderboard}
            predsByParticipant={predsByParticipant}
            expanded={expandedFixture === f.id}
            onToggle={() => setExpandedFixture(expandedFixture === f.id ? null : f.id)}
            revealed={revealed}
          />
        ))}
      </div>

      {(() => {
        const roundInfo: Record<KnockoutRound, { jokers: number | null; note: string }> = {
          R32:   { jokers: 4,    note: '4 Jokers available this round' },
          R16:   { jokers: 3,    note: '3 Jokers available this round' },
          QF:    { jokers: 2,    note: '2 Jokers available this round' },
          SF:    { jokers: 1,    note: '1 Joker available this round' },
          '3RD': { jokers: 0,    note: 'No Joker — normal scoring' },
          F:     { jokers: null, note: 'Forced Joker + doubled = ×4 points in the Final!' },
        }
        const info = roundInfo[activeRound]
        const hasResults = ROUND_FIXTURES[activeRound].some(f => koResultsMap[f.id])
        return (
          <div className="px-5 pb-4 pt-3 flex items-center gap-2.5">
            <span className="text-xl">{info.jokers !== null ? '🃏' : '🏆'}</span>
            <div>
              <p className="text-sm font-black text-yellow-400">{info.note}</p>
              {!hasResults && <p className="text-xs text-blue-600 mt-0.5">Scores will appear here as games are played</p>}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function KOFixtureCard({ fixture, result, leaderboard, predsByParticipant, expanded, onToggle, revealed }: {
  fixture: KnockoutFixture
  result?: Result
  leaderboard: PlayerRow[]
  predsByParticipant: Record<string, Prediction[]>
  expanded: boolean
  onToggle: () => void
  revealed: boolean
}) {
  const isTBD = fixture.homeTeam === 'TBD'
  const kickoff = new Date(fixture.kickoffUtc)
  const now = new Date()
  const isPast = kickoff < now

  const predRows = leaderboard.map(p => {
    const pred = (predsByParticipant[p.id] || []).find(pr => pr.fixture_id === fixture.id)
    if (!pred) return null
    const scored = result
      ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker, fixture.id === 'KO_F_1')
      : null
    return { player: p, pred, scored }
  }).filter(Boolean) as { player: PlayerRow; pred: Prediction; scored: ReturnType<typeof scoreFixture> | null }[]

  const hasAnyPred = predRows.length > 0

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-blue-900/20 transition text-left"
        disabled={(isTBD && !hasAnyPred) || !revealed}
      >
        {/* Match number badge */}
        <div className="w-7 h-7 rounded-full bg-purple-900/60 border border-purple-700/40 flex items-center justify-center text-xs font-black text-purple-300 flex-shrink-0">
          {fixture.matchNumber}
        </div>

        {/* Teams + result */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className={`font-bold truncate ${isTBD ? 'text-blue-600 italic' : 'text-white'}`}>
              {isTBD ? 'TBD' : <>{getTeamFlag(fixture.homeTeam)} {fixture.homeTeam}</>}
            </span>
            {result ? (
              <span className="font-black text-yellow-400 flex-shrink-0">{result.home_score}–{result.away_score}</span>
            ) : (
              <span className="text-blue-700 font-black flex-shrink-0">vs</span>
            )}
            <span className={`font-bold truncate ${isTBD ? 'text-blue-600 italic' : 'text-white'}`}>
              {isTBD ? 'TBD' : <>{fixture.awayTeam} {getTeamFlag(fixture.awayTeam)}</>}
            </span>
          </div>
          <div className="text-xs text-blue-500 mt-0.5">
            {kickoff.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            {' · '}
            {kickoff.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {hasAnyPred && revealed && <span className="ml-2 text-purple-400">{predRows.length} predictions</span>}
          </div>
        </div>

        {/* Status badge */}
        {result ? (
          <span className="text-xs font-bold text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full flex-shrink-0">✓ Done</span>
        ) : isPast && !isTBD ? (
          <span className="text-xs font-bold text-orange-400 bg-orange-900/30 px-2 py-0.5 rounded-full flex-shrink-0">⏱ Awaiting</span>
        ) : (
          <span className="text-xs font-bold text-blue-600 bg-blue-900/30 px-2 py-0.5 rounded-full flex-shrink-0">
            {isTBD ? '🔒 TBD' : 'Upcoming'}
          </span>
        )}

        {hasAnyPred && revealed && <span className="text-blue-700 text-xs">{expanded ? '▲' : '▼'}</span>}
      </button>

      {/* Expanded predictions */}
      {expanded && hasAnyPred && revealed && (
        <div className="bg-[#060d1f] border-t border-blue-900/40 px-4 py-3 space-y-1.5">
          <div className="text-xs font-black uppercase tracking-wider text-blue-500 mb-2">Predictions</div>
          {predRows.map(({ player, pred, scored }) => (
            <div key={player.id} className="flex items-center gap-2 text-xs py-1 border-b border-blue-900/30 last:border-0">
              <span className="flex-1 text-right text-blue-200 truncate">{player.name}</span>
              <div className="flex items-center gap-1 w-20 flex-shrink-0">
                <span className="font-black text-white whitespace-nowrap">{pred.home_score}–{pred.away_score}</span>
                {pred.is_joker && <span className="text-yellow-400 font-black text-xs bg-yellow-400/10 px-1 py-0.5 rounded whitespace-nowrap">★J</span>}
              </div>
              {scored ? (
                <span className={`text-xs font-black px-1.5 py-0.5 rounded ${labelColor(scored.label)}`}>
                  {scored.points > 0 ? `+${scored.points}` : scored.label || '–'}
                </span>
              ) : (
                <span className="w-12 text-blue-700 text-xs text-center">–</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Group League Table ───────────────────────────────────────────────────────

function GroupLeagueTable({ group, fixtures, resultsMap }: {
  group: Group
  fixtures: Fixture[]
  resultsMap: Record<string, Result>
}) {
  const scores: Record<string, { home: number; away: number }> = {}
  for (const f of fixtures) {
    const r = resultsMap[f.id]
    if (r) scores[f.id] = { home: r.home_score, away: r.away_score }
  }
  const playedCount = Object.keys(scores).length
  if (playedCount === 0) {
    return (
      <div className="px-5 py-4 text-sm text-blue-600 italic border-b border-blue-900/40">
        No results yet for Group {group}
      </div>
    )
  }

  const teams = [...new Set(fixtures.flatMap(f => [f.homeTeam, f.awayTeam]))]
  const standings = calculateGroupStandings(teams, fixtures, scores)

  return (
    <div className="border-b border-blue-900/40">
      <div className="px-4 pt-3 pb-1">
        <div className="text-xs font-black uppercase tracking-widest text-blue-500 mb-2">Group {group} Table</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-blue-500 border-b border-blue-900/40">
              <th className="text-left pb-1.5 font-semibold w-5">#</th>
              <th className="text-left pb-1.5 font-semibold">Team</th>
              <th className="text-center pb-1.5 font-semibold w-6">P</th>
              <th className="text-center pb-1.5 font-semibold w-6">W</th>
              <th className="text-center pb-1.5 font-semibold w-6">D</th>
              <th className="text-center pb-1.5 font-semibold w-6">L</th>
              <th className="text-center pb-1.5 font-semibold w-8">GF</th>
              <th className="text-center pb-1.5 font-semibold w-8">GA</th>
              <th className="text-center pb-1.5 font-semibold w-8">GD</th>
              <th className="text-center pb-1.5 font-semibold w-8 text-yellow-400">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((t, i) => {
              const isTop2 = i < 2
              return (
                <tr key={t.team} className={`border-b border-blue-900/20 last:border-0 ${isTop2 ? 'text-white' : 'text-blue-400'}`}>
                  <td className="py-1.5">
                    <span className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-xs font-black ${
                      i === 0 ? 'bg-yellow-400 text-black' : i === 1 ? 'bg-blue-600 text-white' : 'text-blue-600'
                    }`}>{i + 1}</span>
                  </td>
                  <td className="py-1.5 font-semibold">
                    <span className="mr-1">{TEAM_FLAGS[t.team]}</span>{t.team}
                  </td>
                  <td className="text-center py-1.5">{t.played}</td>
                  <td className="text-center py-1.5">{t.won}</td>
                  <td className="text-center py-1.5">{t.drawn}</td>
                  <td className="text-center py-1.5">{t.lost}</td>
                  <td className="text-center py-1.5">{t.gf}</td>
                  <td className="text-center py-1.5">{t.ga}</td>
                  <td className={`text-center py-1.5 font-semibold ${t.gd > 0 ? 'text-emerald-400' : t.gd < 0 ? 'text-red-400' : ''}`}>
                    {t.gd > 0 ? '+' : ''}{t.gd}
                  </td>
                  <td className="text-center py-1.5 font-black text-yellow-400">{t.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="flex items-center gap-3 mt-2 mb-3 text-xs text-blue-600">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" /> Qualify (1st)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-600 inline-block" /> Qualify (2nd)</span>
          <span className="text-blue-700 ml-auto">FIFA 2026 rules apply</span>
        </div>
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
        return sum + scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker, fid === 'KO_F_1').points
      }, 0)

      const dots = last5.map(fid => {
        const pred = predMap[fid]
        const result = resultsMap[fid]
        if (!pred || !result) return { color: 'none', joker: false }
        const pts = scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker, fid === 'KO_F_1').points
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

function LeaderboardSection({ leaderboard, actualWinner, actualGoldenBoot }: { leaderboard: PlayerRow[], actualWinner: string | null, actualGoldenBoot: string | null }) {
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
                      <div className="text-xs flex gap-1.5 flex-wrap">
                        <span className={actualWinner && p.winner_pick === actualWinner ? 'text-emerald-400 font-bold' : 'text-blue-500'}>🏆 {p.winner_pick}</span>
                        <span className="text-blue-700">·</span>
                        <span className={actualGoldenBoot && p.top_scorer_pick === actualGoldenBoot ? 'text-emerald-400 font-bold' : 'text-blue-500'}>⚽ {p.top_scorer_pick}</span>
                      </div>
                      <div className="flex gap-2 mt-0.5 flex-wrap">
                        {p.groupPts > 0 && <span className="text-xs text-blue-400">Grp <span className="text-white font-bold">{p.groupPts}</span></span>}
                        {p.r32Pts > 0 && <span className="text-xs text-blue-400">R32 <span className="text-white font-bold">{p.r32Pts}</span></span>}
                        {p.r16Pts > 0 && <span className="text-xs text-blue-400">R16 <span className="text-white font-bold">{p.r16Pts}</span></span>}
                        {p.qfPts > 0  && <span className="text-xs text-blue-400">QF <span className="text-white font-bold">{p.qfPts}</span></span>}
                        {p.sfPts > 0  && <span className="text-xs text-blue-400">SF <span className="text-white font-bold">{p.sfPts}</span></span>}
                        {p.finalPts > 0 && <span className="text-xs text-blue-400">Final <span className="text-white font-bold">{p.finalPts}</span></span>}
                      </div>
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
              <div className="text-xs flex gap-1.5 flex-wrap mb-0.5">
                <span className={actualWinner && p.winner_pick === actualWinner ? 'text-emerald-400 font-bold' : 'text-blue-500'}>🏆 {p.winner_pick}</span>
                <span className={actualGoldenBoot && p.top_scorer_pick === actualGoldenBoot ? 'text-emerald-400 font-bold' : 'text-blue-500'}>⚽ {p.top_scorer_pick}</span>
              </div>
              <div className="text-xs text-blue-400 flex gap-2 flex-wrap">
                {p.groupPts > 0 && <span>Grp <span className="text-white font-bold">{p.groupPts}</span></span>}
                {p.r32Pts > 0 && <span>R32 <span className="text-white font-bold">{p.r32Pts}</span></span>}
                {p.r16Pts > 0 && <span>R16 <span className="text-white font-bold">{p.r16Pts}</span></span>}
                {p.qfPts > 0  && <span>QF <span className="text-white font-bold">{p.qfPts}</span></span>}
                {p.sfPts > 0  && <span>SF <span className="text-white font-bold">{p.sfPts}</span></span>}
                {p.finalPts > 0 && <span>Final <span className="text-white font-bold">{p.finalPts}</span></span>}
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

function ParticipantDetail({ participant, preds, resultsMap, predictedWinners, actualWinners, revealed }: {
  participant: PlayerRow
  preds: Prediction[]
  resultsMap: Record<string, Result>
  predictedWinners: Record<Group, string>
  actualWinners: Record<Group, string | null>
  revealed: boolean
}) {
  const [openGroup, setOpenGroup] = useState<Group | null>(null)
  const predMap: Record<string, Prediction> = {}
  for (const p of preds) predMap[p.fixture_id] = p

  const koPreds = preds.filter(p => KNOCKOUT_FIXTURE_IDS.has(p.fixture_id))
  const koRounds: { label: string; fixtures: KnockoutFixture[] }[] = [
    { label: 'Round of 32', fixtures: R32_FIXTURES },
    { label: 'Round of 16', fixtures: R16_FIXTURES },
    { label: 'Quarter-finals', fixtures: QF_FIXTURES },
    { label: 'Semi-finals', fixtures: SF_FIXTURES },
    { label: '3rd Place Playoff', fixtures: [THIRD_PLACE_FIXTURE] },
    { label: 'Final 🏆', fixtures: [FINAL_FIXTURE] },
  ]

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

      {/* Knockout Predictions */}
      {koPreds.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-widest text-blue-400 mb-3">⚔️ Knockout Predictions</h3>
          {!revealed && (
            <div className="text-xs text-yellow-500 bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-3 py-2">
              🔒 Predictions hidden until revealed
            </div>
          )}
          {revealed && koRounds.map(({ label, fixtures }) => {
            const roundPreds = fixtures.filter(f => predMap[f.id])
            if (roundPreds.length === 0) return null
            const roundPts = roundPreds.reduce((sum, f) => {
              const pred = predMap[f.id]
              const result = resultsMap[f.id]
              if (!pred || !result) return sum
              return sum + scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker, f.id === 'KO_F_1').points
            }, 0)
            return (
              <div key={label} className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-xs font-bold text-blue-300">{label}</div>
                  {roundPts > 0 && <div className="text-xs text-yellow-400 font-bold">+{roundPts}pts</div>}
                </div>
                <div className="ss-card p-3 space-y-1.5">
                  {roundPreds.map(f => {
                    const pred = predMap[f.id]
                    const result = resultsMap[f.id]
                    const scored = pred && result
                      ? scoreFixture({ home: pred.home_score, away: pred.away_score }, { home: result.home_score, away: result.away_score }, pred.is_joker, f.id === 'KO_F_1')
                      : null
                    return (
                      <div key={f.id} className="flex items-center gap-2 text-xs py-1 border-b border-blue-900/40 last:border-0">
                        <span className="flex-1 text-right text-blue-200 truncate">{getTeamFlag(f.homeTeam)} {f.homeTeam}</span>
                        <span className="font-black text-white w-12 text-center whitespace-nowrap flex-shrink-0">
                          {pred ? `${pred.home_score}–${pred.away_score}` : '–'}
                        </span>
                        <span className="flex-1 text-blue-200 truncate">{f.awayTeam} {getTeamFlag(f.awayTeam)}</span>
                        <div className="w-20 flex items-center justify-end gap-1 flex-shrink-0">
                          {pred?.is_joker && <span className="text-yellow-400 font-black">★</span>}
                          {scored ? (
                            <span className={`px-1.5 py-0.5 rounded font-black ${labelColor(scored.label)}`}>
                              {scored.label === null ? '–' : scored.label}{scored.points > 0 ? ` +${scored.points}` : ''}
                            </span>
                          ) : result ? (
                            <span className="text-blue-700 text-xs">scored</span>
                          ) : (
                            <span className="w-12" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
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

// Group tabs are now inline in the results section
