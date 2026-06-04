import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FIXTURES_BY_GROUP, TEAM_FLAGS, ALL_TEAMS, GROUP_TEAMS } from '../data/fixtures'
import { PLAYERS } from '../data/players'
import type { Group, EntryFormState } from '../types'
import { GROUPS } from '../types'

const STORAGE_KEY = 'wc2026_entry_draft'

const EMPTY_STATE: EntryFormState = {
  name: '',
  winner_pick: '',
  top_scorer_pick: '',
  predictions: {},
  jokers: {} as Record<Group, string>,
}

type Step =
  | { type: 'welcome' }
  | { type: 'tournament_picks' }
  | { type: 'group_fixtures'; group: Group }
  | { type: 'group_joker'; group: Group }
  | { type: 'review' }

function buildSteps(): Step[] {
  const steps: Step[] = [{ type: 'welcome' }, { type: 'tournament_picks' }]
  for (const g of GROUPS) {
    steps.push({ type: 'group_fixtures', group: g })
    steps.push({ type: 'group_joker', group: g })
  }
  steps.push({ type: 'review' })
  return steps
}

const ALL_STEPS = buildSteps()

export default function EnterPage() {
  const navigate = useNavigate()
  const [stepIdx, setStepIdx] = useState(0)
  const [form, setForm] = useState<EntryFormState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : EMPTY_STATE
    } catch { return EMPTY_STATE }
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [entriesOpen, setEntriesOpen] = useState(true)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const timeout = setTimeout(() => setChecking(false), 3000)
    supabase.from('tournament_settings').select('entries_open').eq('id', 1).single()
      .then(({ data }) => {
        clearTimeout(timeout)
        if (data) setEntriesOpen(data.entries_open)
        setChecking(false)
      }, () => { clearTimeout(timeout); setChecking(false) })
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  }, [form])

  const step = ALL_STEPS[stepIdx]
  const totalSteps = ALL_STEPS.length
  const progress = ((stepIdx + 1) / totalSteps) * 100

  function next() { setStepIdx(i => Math.min(i + 1, totalSteps - 1)); window.scrollTo(0, 0) }
  function back() { setStepIdx(i => Math.max(i - 1, 0)); window.scrollTo(0, 0) }

  function setScore(fixtureId: string, side: 'home' | 'away', value: string) {
    const num = value === '' ? '' : Math.max(0, Math.min(20, parseInt(value) || 0))
    setForm(f => ({
      ...f,
      predictions: {
        ...f.predictions,
        [fixtureId]: {
          home: side === 'home' ? num : (f.predictions[fixtureId]?.home ?? ''),
          away: side === 'away' ? num : (f.predictions[fixtureId]?.away ?? ''),
        },
      },
    }))
  }

  function setJoker(group: Group, fixtureId: string) {
    setForm(f => ({ ...f, jokers: { ...f.jokers, [group]: fixtureId } }))
  }

  async function submit() {
    setError('')
    setSubmitting(true)
    try {
      const { data: participant, error: pErr } = await supabase
        .from('participants')
        .insert({ name: form.name.trim(), winner_pick: form.winner_pick, top_scorer_pick: form.top_scorer_pick })
        .select().single()
      if (pErr || !participant) throw new Error(pErr?.message || 'Failed to save entry')

      const preds = Object.entries(form.predictions)
        .filter(([, v]) => v.home !== '' && v.away !== '')
        .map(([fixtureId, v]) => ({
          participant_id: participant.id,
          fixture_id: fixtureId,
          home_score: Number(v.home),
          away_score: Number(v.away),
          is_joker: form.jokers[fixtureId.charAt(0) as Group] === fixtureId,
        }))

      const { error: predErr } = await supabase.from('predictions').insert(preds)
      if (predErr) throw new Error(predErr.message)

      localStorage.removeItem(STORAGE_KEY)
      navigate('/submitted')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Something went wrong'
      if (msg.includes('fetch') || msg.includes('network') || msg.toLowerCase().includes('failed')) {
        setError('Database not connected yet — set up your Supabase project first (see README).')
      } else {
        setError(msg)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500 text-sm animate-pulse">Loading…</div>
      </div>
    )
  }

  if (!entriesOpen) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-2xl font-bold">Entries are closed</h1>
          <p className="text-zinc-400">The prediction window has ended.</p>
          <button onClick={() => navigate('/dashboard')} className="btn-gold mt-2 px-8 py-3 rounded-xl">
            View Dashboard →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 z-20 h-0.5 bg-zinc-800">
        <div
          className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-amber-500/6 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-lg mx-auto px-5 pt-10 pb-28">
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8">
          <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            Step {stepIdx + 1} / {totalSteps}
          </span>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className={`h-1 w-6 rounded-full transition-colors ${
                  stepIdx > i * Math.floor(totalSteps / 3)
                    ? 'bg-amber-400'
                    : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {step.type === 'welcome' && (
          <WelcomeStep name={form.name} onChange={n => setForm(f => ({ ...f, name: n }))} onNext={next} />
        )}
        {step.type === 'tournament_picks' && (
          <TournamentPicksStep
            winner={form.winner_pick} topScorer={form.top_scorer_pick}
            onWinner={v => setForm(f => ({ ...f, winner_pick: v }))}
            onTopScorer={v => setForm(f => ({ ...f, top_scorer_pick: v }))}
            onNext={next} onBack={back}
          />
        )}
        {step.type === 'group_fixtures' && (
          <GroupFixturesStep
            group={step.group} predictions={form.predictions}
            onScore={setScore} onNext={next} onBack={back}
          />
        )}
        {step.type === 'group_joker' && (
          <GroupJokerStep
            group={step.group} predictions={form.predictions}
            joker={form.jokers[step.group] || ''}
            onJoker={id => setJoker(step.group, id)}
            onNext={next} onBack={back}
          />
        )}
        {step.type === 'review' && (
          <ReviewStep form={form} submitting={submitting} error={error} onSubmit={submit} onBack={back} />
        )}
      </div>
    </div>
  )
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function WelcomeStep({ name, onChange, onNext }: { name: string; onChange: (v: string) => void; onNext: () => void }) {
  return (
    <div className="space-y-10">
      <div className="text-center space-y-3">
        <div className="text-6xl">🏆</div>
        <h1 className="text-4xl font-black tracking-tight">
          <span className="gradient-text">World Cup</span>
          <br />
          <span>2026 Predictor</span>
        </h1>
        <p className="text-zinc-400">Enter your name to get started</p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">Your name</label>
        <input
          type="text"
          autoFocus
          value={name}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. Glen Kirkham"
          className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-2xl px-5 py-4 text-white text-lg font-medium placeholder-zinc-600 outline-none transition"
          onKeyDown={e => e.key === 'Enter' && name.trim() && onNext()}
        />
      </div>
      <PrimaryBtn disabled={!name.trim()} onClick={onNext} label="Let's go →" />
    </div>
  )
}

// ─── Tournament Picks ─────────────────────────────────────────────────────────

function TournamentPicksStep({
  winner, topScorer, onWinner, onTopScorer, onNext, onBack,
}: {
  winner: string; topScorer: string
  onWinner: (v: string) => void; onTopScorer: (v: string) => void
  onNext: () => void; onBack: () => void
}) {
  const [search, setSearch] = useState(topScorer)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const filtered = PLAYERS.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.team.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 8)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">Your picks</p>
        <h2 className="text-3xl font-black">Tournament Picks</h2>
      </div>

      {/* Winner */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">🏆 Who wins the World Cup?</label>
        <select
          value={winner}
          onChange={e => onWinner(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-2xl px-5 py-4 text-white font-medium outline-none transition appearance-none cursor-pointer"
        >
          <option value="">Select a team…</option>
          {ALL_TEAMS.map(t => (
            <option key={t} value={t}>{TEAM_FLAGS[t]} {t}</option>
          ))}
        </select>
      </div>

      {/* Top scorer */}
      <div className="space-y-2 relative" ref={dropRef}>
        <label className="text-xs font-bold uppercase tracking-widest text-zinc-400">⚽ Who's the top scorer?</label>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowDropdown(true); if (e.target.value !== topScorer) onTopScorer('') }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Start typing a player name…"
            className="w-full bg-zinc-900 border border-zinc-700 hover:border-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 rounded-2xl px-5 py-4 text-white font-medium placeholder-zinc-600 outline-none transition"
          />
          {topScorer && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-400 text-sm font-semibold">✓</div>
          )}
        </div>
        {topScorer && (
          <p className="text-xs text-emerald-400 font-semibold pl-1">Selected: {topScorer}</p>
        )}
        {showDropdown && search.length > 0 && !topScorer && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/60">
            {filtered.length === 0 ? (
              <div className="px-5 py-4 text-zinc-500 text-sm">No players found</div>
            ) : filtered.map(p => (
              <button
                key={p.name}
                className="w-full text-left px-5 py-3.5 hover:bg-zinc-800 flex items-center gap-3 text-sm transition border-b border-zinc-800 last:border-0"
                onMouseDown={() => { onTopScorer(p.name); setSearch(p.name); setShowDropdown(false) }}
              >
                <span className="text-xl">{TEAM_FLAGS[p.team]}</span>
                <span className="font-semibold text-white">{p.name}</span>
                <span className="text-zinc-400 ml-auto text-xs">{p.team}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <BackBtn onClick={onBack} />
        <PrimaryBtn disabled={!winner || !topScorer} onClick={onNext} label="Next →" />
      </div>
    </div>
  )
}

// ─── Group Fixtures ───────────────────────────────────────────────────────────

function GroupFixturesStep({
  group, predictions, onScore, onNext, onBack,
}: {
  group: Group
  predictions: EntryFormState['predictions']
  onScore: (id: string, side: 'home' | 'away', v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const fixtures = FIXTURES_BY_GROUP[group]
  const allFilled = fixtures.every(f => {
    const p = predictions[f.id]
    return p && p.home !== '' && p.away !== ''
  })

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-amber-400 text-black text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-wider">
            Group {group}
          </span>
        </div>
        <h2 className="text-3xl font-black">Enter predictions</h2>
        <p className="text-zinc-400 text-sm mt-1">
          {GROUP_TEAMS[group].map(t => TEAM_FLAGS[t]).join(' ')} {GROUP_TEAMS[group].join(' · ')}
        </p>
      </div>

      <div className="space-y-3">
        {fixtures.map(f => {
          const p = predictions[f.id] || { home: '', away: '' }
          return (
            <div key={f.id} className="glass rounded-2xl p-4 space-y-3">
              <div className="text-xs font-semibold text-zinc-500 text-center uppercase tracking-wider">
                MD{f.matchday} · {new Date(f.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-right">
                  <span className="font-bold text-sm leading-tight">{TEAM_FLAGS[f.homeTeam]}</span>
                  <div className="text-xs text-zinc-300 font-medium mt-0.5 leading-tight">{f.homeTeam}</div>
                </div>
                <input
                  type="number" min={0} max={20} inputMode="numeric"
                  value={p.home}
                  onChange={e => onScore(f.id, 'home', e.target.value)}
                  className="score-input"
                />
                <div className="text-zinc-600 font-black text-lg">–</div>
                <input
                  type="number" min={0} max={20} inputMode="numeric"
                  value={p.away}
                  onChange={e => onScore(f.id, 'away', e.target.value)}
                  className="score-input"
                />
                <div className="flex-1">
                  <span className="font-bold text-sm leading-tight">{TEAM_FLAGS[f.awayTeam]}</span>
                  <div className="text-xs text-zinc-300 font-medium mt-0.5 leading-tight">{f.awayTeam}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex gap-3">
        <BackBtn onClick={onBack} />
        <PrimaryBtn disabled={!allFilled} onClick={onNext} label={`Pick Joker →`} />
      </div>
    </div>
  )
}

// ─── Group Joker ──────────────────────────────────────────────────────────────

function GroupJokerStep({
  group, predictions, joker, onJoker, onNext, onBack,
}: {
  group: Group
  predictions: EntryFormState['predictions']
  joker: string
  onJoker: (id: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const fixtures = FIXTURES_BY_GROUP[group]
  const nextGroup = group === 'L' ? null : String.fromCharCode(group.charCodeAt(0) + 1)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="bg-amber-400 text-black text-xs font-black px-2.5 py-1 rounded-lg uppercase tracking-wider">
            Group {group}
          </span>
          <span className="text-xs font-semibold text-amber-400 border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 rounded-lg">
            Joker Pick
          </span>
        </div>
        <h2 className="text-3xl font-black">Pick your Joker</h2>
        <p className="text-zinc-400 text-sm mt-1">Double points on one game. Choose wisely.</p>
      </div>

      {/* Teams summary */}
      <div className="glass rounded-2xl p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Group {group}</p>
        <div className="grid grid-cols-2 gap-3">
          {GROUP_TEAMS[group].map(t => (
            <div key={t} className="flex items-center gap-2">
              <span className="text-2xl">{TEAM_FLAGS[t]}</span>
              <span className="text-sm font-semibold text-zinc-200">{t}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Joker selection */}
      <div className="space-y-2.5">
        {fixtures.map(f => {
          const p = predictions[f.id]
          const isJoker = joker === f.id
          return (
            <button
              key={f.id}
              onClick={() => onJoker(f.id)}
              className={`w-full rounded-2xl p-4 border-2 transition text-left ${
                isJoker
                  ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${
                  isJoker ? 'border-amber-400 bg-amber-400' : 'border-zinc-600'
                }`}>
                  {isJoker && <div className="w-2 h-2 rounded-full bg-black" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-bold text-white">{TEAM_FLAGS[f.homeTeam]} {f.homeTeam}</span>
                    <span className="text-amber-400 font-black text-base">
                      {p?.home ?? '?'} – {p?.away ?? '?'}
                    </span>
                    <span className="font-bold text-white">{f.awayTeam} {TEAM_FLAGS[f.awayTeam]}</span>
                  </div>
                </div>
                {isJoker && (
                  <span className="text-xs font-black text-amber-400 bg-amber-400/15 px-2 py-0.5 rounded-lg flex-shrink-0">
                    ×2
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex gap-3">
        <BackBtn onClick={onBack} />
        <PrimaryBtn
          disabled={!joker}
          onClick={onNext}
          label={nextGroup ? `Group ${nextGroup} →` : 'Review →'}
        />
      </div>
    </div>
  )
}

// ─── Review ───────────────────────────────────────────────────────────────────

function ReviewStep({
  form, submitting, error, onSubmit, onBack,
}: {
  form: EntryFormState; submitting: boolean; error: string; onSubmit: () => void; onBack: () => void
}) {
  const predCount = Object.values(form.predictions).filter(p => p.home !== '' && p.away !== '').length
  const jokerCount = Object.keys(form.jokers).length
  const ready = predCount >= 72 && jokerCount >= 12

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-black">Review & Submit</h2>
        <p className="text-zinc-400 text-sm mt-1">Lock in your predictions — no changes after submission.</p>
      </div>

      {/* Summary card */}
      <div className="glass rounded-2xl p-5 space-y-3">
        {[
          { label: 'Name', value: form.name },
          { label: '🏆 Winner', value: `${TEAM_FLAGS[form.winner_pick] || ''} ${form.winner_pick}` },
          { label: '⚽ Top scorer', value: form.top_scorer_pick },
          { label: 'Predictions', value: `${predCount}/72`, ok: predCount >= 72 },
          { label: 'Jokers', value: `${jokerCount}/12`, ok: jokerCount >= 12 },
        ].map(({ label, value, ok }) => (
          <div key={label} className="flex justify-between items-center text-sm border-b border-zinc-800 last:border-0 pb-3 last:pb-0">
            <span className="text-zinc-400 font-medium">{label}</span>
            <span className={`font-bold ${ok === false ? 'text-red-400' : ok === true ? 'text-emerald-400' : 'text-white'}`}>
              {value}
            </span>
          </div>
        ))}
      </div>

      {/* Joker grid */}
      <div className="glass rounded-2xl p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">Jokers</p>
        <div className="grid grid-cols-4 gap-2">
          {GROUPS.map(g => {
            const jokerId = form.jokers[g]
            const fix = jokerId ? FIXTURES_BY_GROUP[g].find(f => f.id === jokerId) : null
            return (
              <div key={g} className={`rounded-xl p-2 text-xs text-center ${
                jokerId ? 'bg-amber-400/15 border border-amber-400/30 text-amber-300' : 'bg-zinc-900 border border-zinc-800 text-red-400'
              }`}>
                <div className="font-black">Grp {g}</div>
                <div className="mt-0.5">{fix ? `${TEAM_FLAGS[fix.homeTeam]}v${TEAM_FLAGS[fix.awayTeam]}` : '✗'}</div>
              </div>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <BackBtn onClick={onBack} />
        <button
          onClick={onSubmit}
          disabled={submitting || !ready}
          className="btn-gold flex-1 py-4 rounded-2xl text-base"
        >
          {submitting ? 'Submitting…' : '🔒 Lock in my predictions'}
        </button>
      </div>

      {!ready && (
        <p className="text-center text-amber-400/70 text-xs">
          {predCount < 72 && `${72 - predCount} predictions still missing. `}
          {jokerCount < 12 && `${12 - jokerCount} jokers still missing.`}
        </p>
      )}
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function PrimaryBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} className="btn-gold flex-1 py-4 rounded-2xl text-base">
      {label}
    </button>
  )
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white font-semibold px-5 py-4 rounded-2xl transition"
    >
      ←
    </button>
  )
}
