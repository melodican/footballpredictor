import { useNavigate } from 'react-router-dom'

export default function SubmittedPage() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-6 text-center space-y-8">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-amber-500/10 rounded-full blur-3xl" />
      </div>
      <div className="relative space-y-6">
        <div className="text-7xl">🎉</div>
        <div>
          <h1 className="text-4xl font-black">
            <span className="gradient-text">You're in!</span>
          </h1>
          <p className="text-zinc-400 max-w-xs mx-auto mt-3 leading-relaxed">
            Your predictions are locked. Check the dashboard once entries close to see everyone's picks and the live leaderboard.
          </p>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="btn-gold px-10 py-4 rounded-2xl text-base"
        >
          View Dashboard →
        </button>
      </div>
    </div>
  )
}
