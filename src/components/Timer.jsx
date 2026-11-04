import { useState } from 'react'

export default function Timer() {
  const [seconds, setSeconds] = useState(25 * 60)
  const [isActive, setIsActive] = useState(false)

  const start = () => setIsActive(true)
  const pause = () => setIsActive(false)
  const reset = () => {
    setIsActive(false)
    setSeconds(25 * 60)
  }

  const decrease = () => {
    if (seconds > 0) setSeconds(seconds - 1)
  }

  // Simple interval for demo
  useState(() => {
    let interval = null
    if (isActive) {
      interval = setInterval(() => {
        setSeconds(prev => (prev > 0 ? prev - 1 : prev))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isActive])

  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60

  return (
    <div className="max-w-md mx-auto mt-12 text-center">
      <div className="relative mb-8">
        <div className="w-48 h-48 rounded-full bg-accent/10 flex items-center justify-center">
          <span className="text-5xl font-bold text-accent">
            {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        {!isActive ? (
          <button
            onClick={start}
            className="px-8 py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent/90 transition shadow-lg shadow-accent/25"
          >
            Start
          </button>
        ) : (
          <button
            onClick={pause}
            className="px-8 py-3 rounded-xl bg-yellow-500 text-black font-semibold hover:bg-yellow-400 transition shadow-lg shadow-yellow-500/25"
          >
            Pause
          </button>
        )}

        <button
          onClick={reset}
          className="px-8 py-3 rounded-xl border border-border hover:bg-accent/10 transition"
        >
          Reset
        </button>
      </div>

      <p className="mt-6 text-sm text-text/60">
        {isActive ? 'Focus session in progress...' : 'Ready to start your focus session?'}
      </p>
    </div>
  )
}
