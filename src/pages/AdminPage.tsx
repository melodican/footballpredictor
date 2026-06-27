import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIXTURES_BY_GROUP, TEAM_FLAGS, GROUP_TEAMS } from '../data/fixtures'
import {
  R32_FIXTURES, R16_FIXTURES, QF_FIXTURES, SF_FIXTURES, FINAL_FIXTURE,
  getTeamFlag, ROUND_LABELS, type KnockoutRound,
} from '../data/knockoutFixtures'
import type { Result, TournamentSettings } from '../types'
import { GROUPS } from '../types'

const KO_ROUNDS: { round: KnockoutRound; fixtures: typeof R32_FIXTURES }[] = [
  { round: 'R32', fixtures: R32_FIXTURES },
  { round: 'R16', fixtures: R16_FIXTURES },
  { round: 'QF',  fixtures: QF_FIXTURES },
  { round: 'SF',  fixtures: SF_FIXTURES },
  { round: 'F',   fixtures: [FINAL_FIXTURE] },
]

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || 'wc2026admin'

export default function AdminPage() {
  const { secret } = useParams<{ secret: string }>()
  const navigate = useNavigate()

  if (secret !== ADMIN_SECRET) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <p className="text-red-400 font-semibold">Access denied</p>
        </div>
      </div>
    )
  }

  return <AdminPanel onLogout={() => navigate('/')} />
}

function AdminPanel({ onLogout }: { onLogout: () => void }) {
  const [settings, setSettings] = useState<TournamentSettings & {
    actual_tournament_winner?: string
    actual_golden_boot?: string
  } | null>(null)
  const [tournamentWinner, setTournamentWinner] = useState('')
  const [goldenBoot, setGoldenBoot] = useState('')
  const [savingEndgame, setSavingEndgame] = useState(false)
  const [results, setResults] = useState<Record<string, { home: string; away: string }>>({})
  const [savedResults, setSavedResults] = useState<Result[]>([])
  const [participantCount, setParticipantCount] = useState(0)
  const [activeGroup, setActiveGroup] = useState<(typeof GROUPS)[number]>('A')
  const [saving, setSaving] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState<'results' | 'knockout' | 'groups' | 'scorers' | 'settings'>('results')
  const [koRound, setKoRound] = useState<KnockoutRound>('R32')
  const [scorerGoals, setScorerGoals] = useState<Record<string, string>>({})
  const [savingScorers, setSavingScorers] = useState(false)
  const [topScorerPicks, setTopScorerPicks] = useState<Array<{ name: string; count: number }>>([])
  const [confirmedGroupWinners, setConfirmedGroupWinners] = useState<Record<string, string>>({})
  const [savingGroupWinners, setSavingGroupWinners] = useState(false)


  async function load() {
    const [sRes, rRes, pRes] = await Promise.all([
      supabase.from('tournament_settings').select('*').eq('id', 1).single(),
      supabase.from('results').select('*'),
      supabase.from('participants').select('id', { count: 'exact', head: true }),
    ])
    if (sRes.data) {
      const s = sRes.data as TournamentSettings & { actual_tournament_winner?: string; actual_golden_boot?: string }
      setSettings(s)
      if (s.actual_tournament_winner) setTournamentWinner(s.actual_tournament_winner)
      if (s.actual_golden_boot) setGoldenBoot(s.actual_golden_boot)
      const goals = (sRes.data as Record<string, unknown>).scorer_goals as Record<string, number> ?? {}
      const m: Record<string, string> = {}
      for (const [k, v] of Object.entries(goals)) m[k] = String(v)
      setScorerGoals(m)
      const cgw = (sRes.data as Record<string, unknown>).confirmed_group_winners as Record<string, string> ?? {}
      setConfirmedGroupWinners(cgw)
    }
    // Load top scorer picks
    const pRes2 = await supabase.from('participants').select('top_scorer_pick')
    if (pRes2.data) {
      const counts: Record<string, number> = {}
      for (const row of pRes2.data) counts[row.top_scorer_pick] = (counts[row.top_scorer_pick] || 0) + 1
      setTopScorerPicks(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })))
    }
    if (rRes.data) {
      setSavedResults(rRes.data as Result[])
      const m: Record<string, { home: string; away: string }> = {}
      for (const r of rRes.data as Result[]) m[r.fixture_id] = { home: String(r.home_score), away: String(r.away_score) }
      setResults(m)
    }
    if (pRes.count !== null) setParticipantCount(pRes.count)
  }

  useEffect(() => { load() }, [])

  async function saveResult(fixtureId: string) {
    const r = results[fixtureId]
    if (!r || r.home === '' || r.away === '') return
    setSaving(fixtureId)
    const payload = { fixture_id: fixtureId, home_score: parseInt(r.home), away_score: parseInt(r.away) }
    const { error } = await supabase.from('results').upsert(payload, { onConflict: 'fixture_id' })
    if (error) setMessage('Error: ' + error.message)
    else {
      setMessage(`✓ Result saved for ${fixtureId}`)
      setSavedResults(prev => [...prev.filter(x => x.fixture_id !== fixtureId), { ...payload, entered_at: new Date().toISOString() }])
    }
    setSaving(null)
    setTimeout(() => setMessage(''), 3000)
  }

  async function toggleSetting(key: 'entries_open' | 'predictions_revealed' | 'knockout_entries_open') {
    if (!settings) return
    setToggling(true)
    const newVal = !settings[key]
    const { error } = await supabase.from('tournament_settings').update({ [key]: newVal, updated_at: new Date().toISOString() }).eq('id', 1)
    if (!error) setSettings(s => s ? { ...s, [key]: newVal } : s)
    setToggling(false)
  }

  const savedMap: Record<string, Result> = {}
  for (const r of savedResults) savedMap[r.fixture_id] = r

  const groupProgress = (g: typeof GROUPS[number]) =>
    FIXTURES_BY_GROUP[g].filter(f => savedMap[f.id]).length

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-16">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-amber-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative border-b border-zinc-800/60 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black">
              <span className="gradient-text">WC2026</span> Admin
            </h1>
            <p className="text-zinc-500 text-xs mt-0.5 font-medium">
              {participantCount} entries · {savedResults.length}/72 results
            </p>
          </div>
          <button onClick={onLogout} className="text-zinc-500 text-sm hover:text-white transition font-medium">
            ← Exit
          </button>
        </div>
      </div>

      <div className="relative max-w-2xl mx-auto px-5 mt-6 space-y-5">

        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-2xl px-5 py-3 text-sm font-semibold">
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-5 gap-1 bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
          {([['results', '⚽ Groups'], ['knockout', '⚔️ KO'], ['groups', '🏁 Winners'], ['scorers', '🏅 Goals'], ['settings', '⚙️ Settings']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2.5 rounded-xl text-xs font-bold transition ${
                tab === t ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Settings */}
        {tab === 'settings' && settings && (
          <div className="space-y-3">
            <ToggleCard
              title="Entries Open"
              description="Allow new predictions to be submitted"
              value={settings.entries_open}
              disabled={toggling}
              onToggle={() => toggleSetting('entries_open')}
            />
            <ToggleCard
              title="Reveal Predictions"
              description="Show everyone's picks on the public dashboard"
              value={settings.predictions_revealed}
              disabled={toggling}
              onToggle={() => toggleSetting('predictions_revealed')}
            />
            <ToggleCard
              title="Knockout Entries Open"
              description="Allow Round of 32 predictions at /enter-knockout"
              value={settings.knockout_entries_open ?? false}
              disabled={toggling}
              onToggle={() => toggleSetting('knockout_entries_open')}
            />
            <div className="glass rounded-2xl p-5 text-sm space-y-3">
              <p className="font-bold text-white">Tournament Phase</p>
              <p className="text-zinc-400">Currently: <span className="text-white font-semibold">{settings.current_phase}</span></p>
              <div className="grid grid-cols-3 gap-1.5">
                {(['group', 'r32', 'r16', 'qf', 'sf', 'final'] as const).map(phase => (
                  <button
                    key={phase}
                    onClick={async () => {
                      await supabase.from('tournament_settings').update({ current_phase: phase }).eq('id', 1)
                      setSettings(s => s ? { ...s, current_phase: phase } : s)
                    }}
                    className={`py-2 rounded-xl text-xs font-bold transition border ${
                      settings.current_phase === phase
                        ? 'bg-purple-600 border-purple-500 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {phase.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-zinc-600 text-xs">Switching to a knockout phase shows the bracket section on the dashboard.</p>
            </div>

            {/* Endgame — Tournament Winner + Golden Boot */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div>
                <p className="font-bold text-white text-sm">🏆 Tournament Winner <span className="text-yellow-400">(+10 pts)</span></p>
                <p className="text-zinc-500 text-xs mt-0.5 mb-2">Set when the tournament ends — auto-awards 10pts to correct pickers</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tournamentWinner}
                    onChange={e => setTournamentWinner(e.target.value)}
                    placeholder="e.g. England"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>
              <div>
                <p className="font-bold text-white text-sm">⚽ Golden Boot <span className="text-yellow-400">(+10 pts)</span></p>
                <p className="text-zinc-500 text-xs mt-0.5 mb-2">Set when the tournament ends — auto-awards 10pts to correct pickers</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={goldenBoot}
                    onChange={e => setGoldenBoot(e.target.value)}
                    placeholder="e.g. Harry Kane"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-yellow-400"
                  />
                </div>
              </div>
              <button
                disabled={savingEndgame}
                onClick={async () => {
                  setSavingEndgame(true)
                  await supabase.from('tournament_settings').update({
                    actual_tournament_winner: tournamentWinner.trim() || null,
                    actual_golden_boot: goldenBoot.trim() || null,
                  }).eq('id', 1)
                  setSavingEndgame(false)
                  setMessage('✓ Tournament outcomes saved — points auto-calculated!')
                  setTimeout(() => setMessage(''), 3000)
                }}
                className="btn-gold w-full py-3 rounded-xl text-sm"
              >
                {savingEndgame ? 'Saving…' : 'Save & Award Points'}
              </button>
            </div>
          </div>
        )}

        {/* Knockout Results */}
        {tab === 'knockout' && (
          <div className="space-y-4">
            {/* Round tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {KO_ROUNDS.map(({ round, fixtures }) => {
                const doneCount = fixtures.filter(f => savedMap[f.id]).length
                return (
                  <button
                    key={round}
                    onClick={() => setKoRound(round)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
                      koRound === round
                        ? 'bg-gradient-to-r from-red-500 to-red-700 text-white shadow-md'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    {ROUND_LABELS[round]}
                    {doneCount > 0 && <span className="ml-1.5 opacity-70">{doneCount}/{fixtures.length}</span>}
                  </button>
                )
              })}
            </div>

            <div className="space-y-3">
              {KO_ROUNDS.find(r => r.round === koRound)!.fixtures.map(f => {
                const r = results[f.id] || { home: '', away: '' }
                const saved = savedMap[f.id]
                const isSaving = saving === f.id
                const isTBD = f.homeTeam === 'TBD' && f.awayTeam === 'TBD'
                return (
                  <div
                    key={f.id}
                    className={`rounded-2xl p-4 border transition ${
                      saved
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : isTBD
                          ? 'bg-zinc-900/40 border-zinc-800/50 opacity-60'
                          : 'glass border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        Match {f.matchNumber} · {new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {isTBD && <span className="ml-2 text-blue-600">TBD — enter when teams confirmed</span>}
                      </span>
                      {saved && <span className="text-emerald-400 text-xs font-bold">✓ saved</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-right">
                        <span className="text-sm font-bold">{getTeamFlag(f.homeTeam)} {f.homeTeam}</span>
                      </div>
                      <input
                        type="number" min={0} max={20} inputMode="numeric"
                        value={r.home}
                        onChange={e => setResults(prev => ({ ...prev, [f.id]: { ...r, home: e.target.value } }))}
                        placeholder="0"
                        className="score-input"
                        disabled={isTBD}
                      />
                      <div className="text-zinc-600 font-black">–</div>
                      <input
                        type="number" min={0} max={20} inputMode="numeric"
                        value={r.away}
                        onChange={e => setResults(prev => ({ ...prev, [f.id]: { ...r, away: e.target.value } }))}
                        placeholder="0"
                        className="score-input"
                        disabled={isTBD}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-bold">{f.awayTeam} {getTeamFlag(f.awayTeam)}</span>
                      </div>
                      <button
                        onClick={() => saveResult(f.id)}
                        disabled={r.home === '' || r.away === '' || isSaving || isTBD}
                        className="btn-gold px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Group Winners */}
        {tab === 'groups' && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="font-bold text-white mb-1">🏁 Confirm Group Winners</h3>
              <p className="text-zinc-400 text-xs mb-5">
                Select the winner for each group once all their games are played.
                <span className="text-yellow-400 font-semibold"> Points are only awarded when you save here.</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                {GROUPS.map(g => {
                  const teams = GROUP_TEAMS[g]
                  const saved = confirmedGroupWinners[g]
                  return (
                    <div key={g} className={`rounded-xl p-3 border transition ${saved ? 'bg-yellow-400/5 border-yellow-400/30' : 'bg-zinc-900 border-zinc-800'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-zinc-400 uppercase">Group {g}</span>
                        {saved && <span className="text-yellow-400 text-xs font-bold">✓ +5pts</span>}
                      </div>
                      <select
                        value={confirmedGroupWinners[g] || ''}
                        onChange={e => setConfirmedGroupWinners(prev => ({ ...prev, [g]: e.target.value }))}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-2 text-white text-xs font-semibold focus:outline-none focus:border-yellow-400"
                      >
                        <option value="">Not confirmed yet</option>
                        {teams.map(t => (
                          <option key={t} value={t}>{TEAM_FLAGS[t]} {t}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>
              <button
                disabled={savingGroupWinners}
                onClick={async () => {
                  setSavingGroupWinners(true)
                  // Remove empty entries
                  const toSave: Record<string, string> = {}
                  for (const [k, v] of Object.entries(confirmedGroupWinners)) {
                    if (v) toSave[k] = v
                  }
                  await supabase.from('tournament_settings').update({ confirmed_group_winners: toSave }).eq('id', 1)
                  setSavingGroupWinners(false)
                  setMessage(`✓ Group winners saved — points awarded to correct pickers!`)
                  setTimeout(() => setMessage(''), 4000)
                }}
                className="btn-gold w-full mt-5 py-3 rounded-xl"
              >
                {savingGroupWinners ? 'Saving…' : 'Save & Award Group Points'}
              </button>
            </div>
          </div>
        )}

        {/* Top Scorer Goals */}
        {tab === 'scorers' && (
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5">
              <h3 className="font-bold text-white mb-1">Top Scorer Race</h3>
              <p className="text-zinc-400 text-xs mb-4">Update goal tallies for players your family have picked as top scorer. These show on the live dashboard.</p>
              <div className="space-y-3">
                {topScorerPicks.map(({ name, count }) => (
                  <div key={name} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{name}</div>
                      <div className="text-xs text-zinc-500">{count} player{count !== 1 ? 's' : ''} backing them</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setScorerGoals(prev => ({ ...prev, [name]: String(Math.max(0, (parseInt(prev[name] || '0') || 0) - 1)) }))}
                        className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold text-lg flex items-center justify-center transition"
                      >−</button>
                      <span className="w-8 text-center font-black text-lg text-yellow-400">{scorerGoals[name] || '0'}</span>
                      <button
                        onClick={() => setScorerGoals(prev => ({ ...prev, [name]: String((parseInt(prev[name] || '0') || 0) + 1) }))}
                        className="w-8 h-8 bg-zinc-800 hover:bg-zinc-700 rounded-lg font-bold text-lg flex items-center justify-center transition"
                      >+</button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                disabled={savingScorers}
                onClick={async () => {
                  setSavingScorers(true)
                  const goals: Record<string, number> = {}
                  for (const [k, v] of Object.entries(scorerGoals)) goals[k] = parseInt(v) || 0
                  await supabase.from('tournament_settings').update({ scorer_goals: goals }).eq('id', 1)
                  setSavingScorers(false)
                  setMessage('✓ Goal tallies updated!')
                  setTimeout(() => setMessage(''), 3000)
                }}
                className="btn-gold w-full mt-5 py-3 rounded-xl"
              >
                {savingScorers ? 'Saving…' : 'Save Goal Tallies'}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {tab === 'results' && (
          <div className="space-y-4">
            {/* Group tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {GROUPS.map(g => {
                const done = groupProgress(g)
                return (
                  <button
                    key={g}
                    onClick={() => setActiveGroup(g)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition ${
                      activeGroup === g
                        ? 'bg-gradient-to-r from-amber-400 to-amber-600 text-black shadow-md shadow-amber-400/20'
                        : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    Group {g}
                    {done > 0 && <span className="ml-1.5 text-xs opacity-70">{done}/6</span>}
                  </button>
                )
              })}
            </div>

            <div className="space-y-3">
              {FIXTURES_BY_GROUP[activeGroup].map(f => {
                const r = results[f.id] || { home: '', away: '' }
                const saved = savedMap[f.id]
                const isSaving = saving === f.id
                return (
                  <div
                    key={f.id}
                    className={`rounded-2xl p-4 border transition ${
                      saved
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : 'glass border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        MD{f.matchday} · {new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      {saved && <span className="text-emerald-400 text-xs font-bold">✓ saved</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-right">
                        <span className="text-sm font-bold">{TEAM_FLAGS[f.homeTeam]} {f.homeTeam}</span>
                      </div>
                      <input
                        type="number" min={0} max={20} inputMode="numeric"
                        value={r.home}
                        onChange={e => setResults(prev => ({ ...prev, [f.id]: { ...r, home: e.target.value } }))}
                        placeholder="0"
                        className="score-input"
                      />
                      <div className="text-zinc-600 font-black">–</div>
                      <input
                        type="number" min={0} max={20} inputMode="numeric"
                        value={r.away}
                        onChange={e => setResults(prev => ({ ...prev, [f.id]: { ...r, away: e.target.value } }))}
                        placeholder="0"
                        className="score-input"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-bold">{f.awayTeam} {TEAM_FLAGS[f.awayTeam]}</span>
                      </div>
                      <button
                        onClick={() => saveResult(f.id)}
                        disabled={r.home === '' || r.away === '' || isSaving}
                        className="btn-gold px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToggleCard({ title, description, value, disabled, onToggle }: {
  title: string; description: string; value: boolean; disabled: boolean; onToggle: () => void
}) {
  return (
    <div className="glass rounded-2xl p-5 flex items-center justify-between gap-4">
      <div>
        <p className="font-bold text-white">{title}</p>
        <p className="text-zinc-500 text-xs mt-0.5">{description}</p>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-amber-400' : 'bg-zinc-700'}`}
      >
        <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${value ? 'translate-x-6' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
