import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  ROUND_FIXTURES, ROUND_LABELS, KO_ROUND_JOKER_LIMITS, BRACKET_SOURCES,
  KNOCKOUT_FIXTURE_MAP, getTeamFlag, getWinner, type KnockoutFixture, type KnockoutRound,
} from '../data/knockoutFixtures'
import type { Participant, Result, TournamentSettings } from '../types'

const STORAGE_KEY = (round: string) => `wc2026_knockout_draft_${round}`

interface KOFormState {
  participantId: string
  predictions: Record<string, { home: number | ''; away: number | '' }>
  jokers: Set<string>
}

const EMPTY: KOFormState = { participantId: '', predictions: {}, jokers: new Set() }

function resolveWinner(sourceId: string, resultsMap: Record<string, Result>): string | null {
  const result = resultsMap[sourceId]
  if (!result) return null
  const fixture = KNOCKOUT_FIXTURE_MAP[sourceId]
  if (!fixture) return null
  if (result.home_score !== result.away_score) return getWinner(fixture, result)
  return result.pen_winner ?? null
}

function resolveTeam(team: string, side: 'home' | 'away', fixtureId: string, resultsMap: Record<string, Result>): string {
  if (team !== 'TBD') return team
  const sources = BRACKET_SOURCES[fixtureId]
  if (!sources) return 'TBD'
  return resolveWinner(sources[side], resultsMap) ?? 'TBD'
}

export default function EnterKnockoutPage() {
  const navigate = useNavigate()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [results, setResults] = useState<Result[]>([])
  const [currentRound, setCurrentRound] = useState<KnockoutRound | null>(null)
  const [form, setForm] = useState<KOFormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [entriesOpen, setEntriesOpen] = useState(true)
  const [checking, setChecking] = useState(true)
  const [existingPredIds, setExistingPredIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      supabase.from('tournament_settings').select('knockout_entries_open,current_phase').eq('id', 1).single(),
      supabase.from('participants').select('*').order('name'),
      supabase.from('results').select('*'),
    ]).then(([sRes, pRes, rRes]) => {
      const data = sRes.data as (TournamentSettings & { current_phase?: string }) | null
      if (data) {
        setEntriesOpen(data.knockout_entries_open ?? true)
        // Derive round from current_phase
        const phaseToRound: Record<string, KnockoutRound> = {
          r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'F',
        }
        const round = phaseToRound[data.current_phase ?? ''] ?? 'R32'
        setCurrentRound(round)

        // Load draft for this round
        try {
          const s = localStorage.getItem(STORAGE_KEY(round))
          if (s) {
            const p = JSON.parse(s)
            setForm({ ...p, jokers: new Set(p.jokers ?? []) })
          }
        } catch { /* ignore */ }
      }
      if (pRes.data) setParticipants(pRes.data as Participant[])
      if (rRes.data) setResults(rRes.data as Result[])
      setChecking(false)
    })
  }, [])

  const resultsMap = useMemo(() => {
    const m: Record<string, Result> = {}
    for (const r of results) m[r.fixture_id] = r
    return m
  }, [results])

  const fixtures = useMemo(() => {
    if (!currentRound) return []
    const raw = ROUND_FIXTURES[currentRound] ?? []
    return [...raw]
      .map(f => ({
        ...f,
        homeTeam: resolveTeam(f.homeTeam, 'home', f.id, resultsMap),
        awayTeam: resolveTeam(f.awayTeam, 'away', f.id, resultsMap),
      }))
      .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
  }, [currentRound, resultsMap])

  const jokerLimit = currentRound ? (KO_ROUND_JOKER_LIMITS[currentRound] ?? 1) : 1

  // Check existing predictions when participant changes
  useEffect(() => {
    if (!form.participantId || !currentRound) { setExistingPredIds(new Set()); return }
    const ids = (ROUND_FIXTURES[currentRound] ?? []).map(f => f.id)
    supabase.from('predictions')
      .select('fixture_id')
      .eq('participant_id', form.participantId)
      .in('fixture_id', ids)
      .then(({ data }) => {
        if (data) setExistingPredIds(new Set(data.map((r: { fixture_id: string }) => r.fixture_id)))
      })
  }, [form.participantId, currentRound])

  // Persist draft
  useEffect(() => {
    if (!currentRound) return
    localStorage.setItem(STORAGE_KEY(currentRound), JSON.stringify({ ...form, jokers: [...form.jokers] }))
  }, [form, currentRound])

  function setScore(fixtureId: string, side: 'home' | 'away', val: string) {
    const n = val === '' ? '' : Math.max(0, parseInt(val) || 0)
    setForm(f => ({ ...f, predictions: { ...f.predictions, [fixtureId]: { ...f.predictions[fixtureId], [side]: n } } }))
  }

  function toggleJoker(fixtureId: string) {
    setForm(f => {
      const j = new Set(f.jokers)
      if (j.has(fixtureId)) { j.delete(fixtureId) }
      else if (j.size < jokerLimit) { j.add(fixtureId) }
      return { ...f, jokers: j }
    })
  }

  const allFilled = fixtures.every(f => {
    const p = form.predictions[f.id]
    return p && p.home !== '' && p.away !== ''
  })

  async function submit() {
    if (!form.participantId) { setError('Please select your name'); return }
    if (!allFilled) { setError('Please enter a score for every match'); return }
    setSubmitting(true)
    setError('')

    const rows = fixtures.map(f => ({
      participant_id: form.participantId,
      fixture_id: f.id,
      home_score: Number(form.predictions[f.id].home),
      away_score: Number(form.predictions[f.id].away),
      is_joker: form.jokers.has(f.id),
    }))

    const { error: err } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'participant_id,fixture_id' })

    if (err) { setError(err.message); setSubmitting(false); return }

    if (currentRound) localStorage.removeItem(STORAGE_KEY(currentRound))
    navigate('/submitted?stage=knockout')
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#060d1f] flex items-center justify-center">
        <div className="text-blue-400 animate-pulse">Loading...</div>
      </div>
    )
  }

  if (!entriesOpen) {
    return (
      <div className="min-h-screen bg-[#060d1f] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <h2 className="text-xl font-black">Knockout predictions are closed</h2>
          <p className="text-blue-400 text-sm">The entry window has passed.</p>
        </div>
      </div>
    )
  }

  const roundLabel = currentRound ? ROUND_LABELS[currentRound] : ''

  return (
    <div className="min-h-screen bg-[#060d1f] text-white">
      {/* Header */}
      <div className="bg-[#0c1733] border-b border-blue-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black">⚔️ Knockout Stage</h1>
            <p className="text-xs text-blue-400">World Cup 2026 · {roundLabel} Predictions</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-400">Jokers used</div>
            <div className={`text-lg font-black ${form.jokers.size === jokerLimit ? 'text-red-400' : 'text-yellow-400'}`}>
              {form.jokers.size}/{jokerLimit}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Who are you */}
        <div className="bg-[#0c1733] border border-blue-900 rounded-2xl p-5">
          <h2 className="font-black text-sm uppercase tracking-wider text-blue-400 mb-3">Who are you?</h2>
          {form.participantId && existingPredIds.size > 0 && (
            <div className="mb-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl px-4 py-2.5 text-sm text-yellow-300">
              ⚠️ You've already submitted {roundLabel} predictions — submitting again will overwrite them.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {participants.map(p => (
              <button
                key={p.id}
                onClick={() => setForm(f => ({ ...f, participantId: p.id }))}
                className={`py-2.5 px-3 rounded-xl text-sm font-bold text-left transition border ${
                  form.participantId === p.id
                    ? 'bg-red-600 border-red-500 text-white'
                    : 'bg-blue-900/30 border-blue-900 text-blue-300 hover:border-blue-700'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Joker explainer / Final banner */}
        {currentRound === 'F' ? (
          <>
            <div className="bg-amber-400/10 border border-amber-400/30 rounded-2xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🏆</div>
                <div>
                  <div className="font-black text-amber-300">Final Weekend — Last predictions!</div>
                  <div className="text-sm text-amber-400/80 mt-1">The Final has a forced Joker AND points are doubled — 8pts for correct result, 20pts for correct score!</div>
                </div>
              </div>
            </div>
            <div className="bg-blue-900/30 border border-blue-800 rounded-2xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">🥉</div>
                <div>
                  <div className="font-black text-blue-200">3rd Place Playoff — Normal scoring</div>
                  <div className="text-sm text-blue-400 mt-1">2pts correct result · 5pts correct score · No Joker</div>
                </div>
              </div>
            </div>
          </>
        ) : jokerLimit > 0 ? (
          <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🃏</div>
              <div>
                <div className="font-black text-yellow-300">You have {jokerLimit} Joker{jokerLimit !== 1 ? 's' : ''} for the {roundLabel}</div>
                <div className="text-sm text-yellow-400/80 mt-1">Use them on any game. A Joker doubles your points — 4pts for correct result, 10pts for correct score.</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Fixtures */}
        <div className="bg-[#0c1733] border border-blue-900 rounded-2xl overflow-hidden">
          <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800">
            <h2 className="font-black">{currentRound === 'F' ? 'Final Weekend' : roundLabel}</h2>
            <p className="text-xs text-blue-400 mt-0.5">
              {currentRound === 'F'
                ? 'Pick a score for both games · No Jokers · Final points are doubled'
                : `Pick a score for every game · mark up to ${jokerLimit} as Joker${jokerLimit !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="divide-y divide-blue-900/40">
            {fixtures.map(f => (
              <FixtureRow
                key={f.id}
                fixture={f}
                prediction={form.predictions[f.id] ?? { home: '', away: '' }}
                isJoker={form.jokers.has(f.id)}
                jokersFull={form.jokers.size >= jokerLimit && !form.jokers.has(f.id)}
                onScore={setScore}
                onJoker={toggleJoker}
              />
            ))}
          </div>
        </div>

        {/* Submit */}
        {error && <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}
        <button
          onClick={submit}
          disabled={submitting || !allFilled || !form.participantId}
          className="w-full py-4 rounded-2xl font-black text-lg bg-gradient-to-r from-red-600 to-red-800 text-white disabled:opacity-40 transition hover:opacity-90"
        >
          {submitting ? 'Submitting...' : allFilled ? `🚀 Submit ${currentRound === 'F' ? 'Final Weekend' : roundLabel} Predictions` : 'Fill in all scores to submit'}
        </button>
        <p className="text-center text-xs text-blue-600 pb-6">Predictions for later rounds will open as the tournament progresses</p>
      </div>
    </div>
  )
}

function FixtureRow({ fixture, prediction, isJoker, jokersFull, onScore, onJoker }: {
  fixture: KnockoutFixture
  prediction: { home: number | ''; away: number | '' }
  isJoker: boolean
  jokersFull: boolean
  onScore: (id: string, side: 'home' | 'away', val: string) => void
  onJoker: (id: string) => void
}) {
  const isTBD = fixture.homeTeam === 'TBD' || fixture.awayTeam === 'TBD'
  return (
    <div className={`px-4 py-4 ${isJoker ? 'bg-yellow-400/5' : ''}`}>
      <div className="flex items-center gap-3">
        {/* Home */}
        <div className="flex-1 text-right">
          <div className="text-sm font-bold">
            {fixture.homeTeam === 'TBD'
              ? <span className="text-blue-600">TBD</span>
              : <>{getTeamFlag(fixture.homeTeam)} {fixture.homeTeam}</>}
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="number" min="0" max="20"
            value={prediction.home}
            onChange={e => onScore(fixture.id, 'home', e.target.value)}
            className="score-input"
            disabled={isTBD}
          />
          <span className="text-blue-700 font-black">–</span>
          <input
            type="number" min="0" max="20"
            value={prediction.away}
            onChange={e => onScore(fixture.id, 'away', e.target.value)}
            className="score-input"
            disabled={isTBD}
          />
        </div>

        {/* Away */}
        <div className="flex-1">
          <div className="text-sm font-bold">
            {fixture.awayTeam === 'TBD'
              ? <span className="text-blue-600">TBD</span>
              : <>{getTeamFlag(fixture.awayTeam)} {fixture.awayTeam}</>}
          </div>
        </div>
      </div>

      {/* Date + Joker/badge row */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="text-xs text-blue-600">
          {new Date(fixture.kickoffUtc).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {new Date(fixture.kickoffUtc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
        {fixture.round === 'F' ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/30">
            🏆 Points ×2
          </span>
        ) : fixture.round === '3RD' ? (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-900/30 text-blue-500 border border-blue-800">
            🥉 3rd Place
          </span>
        ) : (
          <button
            onClick={() => onJoker(fixture.id)}
            disabled={jokersFull || isTBD}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition ${
              isJoker
                ? 'bg-yellow-400 text-black'
                : jokersFull || isTBD
                  ? 'bg-blue-900/30 text-blue-700 cursor-not-allowed'
                  : 'bg-blue-900/40 border border-blue-800 text-blue-400 hover:border-yellow-400 hover:text-yellow-400'
            }`}
          >
            🃏 {isJoker ? 'Joker! ×2' : 'Use Joker'}
          </button>
        )}
      </div>
    </div>
  )
}
