import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col overflow-hidden">
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] bg-emerald-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center space-y-10 py-16">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-semibold px-4 py-1.5 rounded-full uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          USA · Canada · Mexico 2026
        </div>

        {/* Hero */}
        <div className="space-y-4">
          <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none">
            <span className="gradient-text">World Cup</span>
            <br />
            <span className="text-white">Predictor</span>
          </h1>
          <p className="text-zinc-400 text-lg font-medium max-w-sm mx-auto">
            Family prediction tournament. Pick every score, play your jokers, top the leaderboard.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => navigate('/enter')}
            className="btn-gold w-full py-4 rounded-2xl text-base font-bold"
          >
            ⚽ Enter Predictions
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full glass glass-hover py-4 rounded-2xl text-base font-semibold text-zinc-200 transition"
          >
            📊 View Dashboard
          </button>
        </div>

        {/* Scoring guide */}
        <div className="glass rounded-3xl p-6 w-full max-w-sm text-left space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-wider">How it works</h2>
            <span className="text-xs text-zinc-500">1 joker per group</span>
          </div>
          <div className="space-y-2.5">
            {[
              { badge: 'S', bg: 'bg-amber-400 text-black', label: 'Correct score', pts: '5 pts' },
              { badge: 'R', bg: 'bg-emerald-500 text-white', label: 'Correct result', pts: '2 pts' },
              { badge: '/', bg: 'bg-zinc-700 text-zinc-400', label: 'Wrong', pts: '0 pts' },
              { badge: 'SJ', bg: 'bg-amber-400 text-black', label: 'Score + Joker', pts: '10 pts' },
              { badge: 'RJ', bg: 'bg-emerald-500 text-white', label: 'Result + Joker', pts: '4 pts' },
            ].map(({ badge, bg, label, pts }) => (
              <div key={badge} className="flex items-center gap-3">
                <span className={`${bg} w-9 text-center text-xs font-black px-1.5 py-1 rounded-lg flex-shrink-0`}>
                  {badge}
                </span>
                <span className="text-zinc-300 text-sm flex-1">{label}</span>
                <span className="text-zinc-500 text-sm font-semibold">{pts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative text-center pb-6 text-xs text-zinc-700 font-medium">
        WC2026 Family Predictor
      </div>
    </div>
  )
}
