import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  R32_FIXTURES, ROUND_LABELS, KO_JOKER_LIMIT, getTeamFlag, type KnockoutFixture,
} from '../data/knockoutFixtures'
import type { Participant } from '../types'

const STORAGE_KEY = 'wc2026_knockout_draft'

interface KOFormState {
  participantId: string
  predictions: Record<string, { home: number | ''; away: number | '' }>
  jokers: Set<string>
}

const EMPTY: KOFormState = { participantId: '', predictions: {}, jokers: new Set() }

export default function EnterKnockoutPage() {
  const navigate = useNavigate()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [form, setForm] = useState<KOFormState>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (!s) return EMPTY
      const p = JSON.parse(s)
      return { ...p, jokers: new Set(p.jokers ?? []) }
    } catch { return EMPTY }
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [entriesOpen, setEntriesOpen] = useState(true)
  const [checking, setChecking] = useState(true)
  const [existingPredIds, setExistingPredIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    supabase.from('tournament_settings').select('knockout_entries_open').eq('id', 1).single()
      .then(({ data }) => {
        if (data) setEntriesOpen((data as Record<string, boolean>).knockout_entries_open ?? true)
        setChecking(false)
      }, () => setChecking(false))
    supabase.from('participants').select('*').order('name').then(({ data }) => {
      if (data) setParticipants(data as Participant[])
    })
  }, [])

  // When participant selected, check if they already have knockout predictions
  useEffect(() => {
    if (!form.participantId) { setExistingPredIds(new Set()); return }
    const koIds = R32_FIXTURES.map(f => f.id)
    supabase.from('predictions')
      .select('fixture_id')
      .eq('participant_id', form.participantId)
      .in('fixture_id', koIds)
      .then(({ data }) => {
        if (data) setExistingPredIds(new Set(data.map((r: { fixture_id: string }) => r.fixture_id)))
      })
  }, [form.participantId])

  // Persist draft to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...form, jokers: [...form.jokers] }))
  }, [form])

  function setScore(fixtureId: string, side: 'home' | 'away', val: string) {
    const n = val === '' ? '' : Math.max(0, parseInt(val) || 0)
    setForm(f => ({ ...f, predictions: { ...f.predictions, [fixtureId]: { ...f.predictions[fixtureId], [side]: n } } }))
  }

  function toggleJoker(fixtureId: string) {
    setForm(f => {
      const j = new Set(f.jokers)
      if (j.has(fixtureId)) { j.delete(fixtureId) }
      else if (j.size < KO_JOKER_LIMIT) { j.add(fixtureId) }
      return { ...f, jokers: j }
    })
  }

  const allFilled = R32_FIXTURES.every(f => {
    const p = form.predictions[f.id]
    return p && p.home !== '' && p.away !== ''
  })

  async function submit() {
    if (!form.participantId) { setError('Please select your name'); return }
    if (!allFilled) { setError('Please enter a score for every match'); return }
    setSubmitting(true)
    setError('')

    const rows = R32_FIXTURES.map(f => ({
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

    localStorage.removeItem(STORAGE_KEY)
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

  return (
    <div className="min-h-screen bg-[#060d1f] text-white">
      {/* Header */}
      <div className="bg-[#0c1733] border-b border-blue-900 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-black">⚔️ Knockout Stage</h1>
            <p className="text-xs text-blue-400">World Cup 2026 · Round of 32 Predictions</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-blue-400">Jokers used</div>
            <div className={`text-lg font-black ${form.jokers.size === KO_JOKER_LIMIT ? 'text-red-400' : 'text-yellow-400'}`}>
              {form.jokers.size}/{KO_JOKER_LIMIT}
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
              ⚠️ You've already submitted knockout predictions — submitting again will overwrite them.
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

        {/* Joker explainer */}
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🃏</div>
            <div>
              <div className="font-black text-yellow-300">You have {KO_JOKER_LIMIT} Jokers for the knockout stage</div>
              <div className="text-sm text-yellow-400/80 mt-1">Use them on any Round of 32 game. A Joker doubles your points — 4pts for correct result, 10pts for correct score.</div>
            </div>
          </div>
        </div>

        {/* Fixtures */}
        <div className="bg-[#0c1733] border border-blue-900 rounded-2xl overflow-hidden">
          <div className="bg-blue-900/60 px-5 py-3 border-b border-blue-800">
            <h2 className="font-black">{ROUND_LABELS.R32}</h2>
            <p className="text-xs text-blue-400 mt-0.5">Pick a score for every game · mark up to {KO_JOKER_LIMIT} as Jokers</p>
          </div>
          <div className="divide-y divide-blue-900/40">
            {[...R32_FIXTURES].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)).map(f => (
              <FixtureRow
                key={f.id}
                fixture={f}
                prediction={form.predictions[f.id] ?? { home: '', away: '' }}
                isJoker={form.jokers.has(f.id)}
                jokersFull={form.jokers.size >= KO_JOKER_LIMIT && !form.jokers.has(f.id)}
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
          {submitting ? 'Submitting...' : allFilled ? '🚀 Submit Knockout Predictions' : 'Fill in all scores to submit'}
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
  const isTBD = fixture.homeTeam === 'TBD'
  return (
    <div className={`px-4 py-4 ${isJoker ? 'bg-yellow-400/5' : ''}`}>
      <div className="flex items-center gap-3">
        {/* Home */}
        <div className="flex-1 text-right">
          <div className="text-sm font-bold">
            {isTBD ? <span className="text-blue-600">TBD</span> : <>{getTeamFlag(fixture.homeTeam)} {fixture.homeTeam}</>}
          </div>
        </div>

        {/* Scores */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <input
            type="number" min="0" max="20"
            value={prediction.home}
            onChange={e => onScore(fixture.id, 'home', e.target.value)}
            className="score-input"
          />
          <span className="text-blue-700 font-black">–</span>
          <input
            type="number" min="0" max="20"
            value={prediction.away}
            onChange={e => onScore(fixture.id, 'away', e.target.value)}
            className="score-input"
          />
        </div>

        {/* Away */}
        <div className="flex-1">
          <div className="text-sm font-bold">
            {isTBD ? <span className="text-blue-600">TBD</span> : <>{getTeamFlag(fixture.awayTeam)} {fixture.awayTeam}</>}
          </div>
        </div>
      </div>

      {/* Date + Joker row */}
      <div className="flex items-center justify-between mt-2.5">
        <div className="text-xs text-blue-600">
          {new Date(fixture.kickoffUtc).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          {' · '}
          {new Date(fixture.kickoffUtc).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        </div>
        <button
          onClick={() => onJoker(fixture.id)}
          disabled={jokersFull}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black transition ${
            isJoker
              ? 'bg-yellow-400 text-black'
              : jokersFull
                ? 'bg-blue-900/30 text-blue-700 cursor-not-allowed'
                : 'bg-blue-900/40 border border-blue-800 text-blue-400 hover:border-yellow-400 hover:text-yellow-400'
          }`}
        >
          🃏 {isJoker ? 'Joker! ×2' : 'Use Joker'}
        </button>
      </div>
    </div>
  )
}
