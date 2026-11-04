import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Play, Pause, SkipForward, RefreshCw, Timer, Volume2, VolumeX, Plus, Clock, BookOpen } from 'lucide-react'

const FOCUS_MIN = 25
const SHORT_BREAK_MIN = 5
const LONG_BREAK_MIN = 15
const CYCLES_FOR_LONG = 4

export default function Pomodoro() {
  const { user } = useAuth()
  const [subjects, setSubjects] = useState([])
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [mode, setMode] = useState('focus')
  const [timeLeft, setTimeLeft] = useState(FOCUS_MIN * 60)
  const [isActive, setIsActive] = useState(false)
  const [cycle, setCycle] = useState(1)
  const [completedToday, setCompletedToday] = useState(0)
  const intervalRef = useRef(null)
  const audioRef = useRef(null)
  const [soundOn, setSoundOn] = useState(true)

  useEffect(() => {
    if (!user) return
    loadSubjects()
    loadCompletedToday()
    window.addEventListener('study-log-updated', loadCompletedToday)
    return () => window.removeEventListener('study-log-updated', loadCompletedToday)
  }, [user])

  const loadSubjects = async () => {
    try {
      const { data, error } = await supabase.from('subjects').select('*').eq('user_id', user.id).eq('archived', false).order('name')
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load subjects', description: err.message })
    }
  }

  const loadCompletedToday = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase.from('study_logs').select('*').eq('user_id', user.id).eq('date', today).eq('session_type', 'focus').eq('completed', true)
      if (error) throw error
      setCompletedToday((data || []).length)
    } catch (err) {
      console.error(err)
    }
  }

  const getTimeForMode = (m) => {
    if (m === 'focus') return FOCUS_MIN * 60
    if (m === 'longBreak') return LONG_BREAK_MIN * 60
    return SHORT_BREAK_MIN * 60
  }

  const resetTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setIsActive(false)
    setTimeLeft(getTimeForMode(mode))
  }, [mode])

  const nextSession = useCallback(() => {
    if (mode === 'focus') {
      const newCycle = cycle + 1
      setCycle(newCycle)
      if (newCycle % CYCLES_FOR_LONG === 0) {
        setMode('longBreak')
        setTimeLeft(LONG_BREAK_MIN * 60)
      } else {
        setMode('shortBreak')
        setTimeLeft(SHORT_BREAK_MIN * 60)
      }
    } else {
      setMode('focus')
      setTimeLeft(FOCUS_MIN * 60)
    }
    setIsActive(false)
  }, [mode, cycle])
  const skip = useCallback(() => {
    nextSession()
  }, [nextSession])

  useEffect(() => {
    if (!isActive) return
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(intervalRef.current)
          setIsActive(false)
          playSound()
          if (mode === 'focus') {
            logSession(true, mode, cycle, selectedSubject)
          }
          nextSession()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isActive, mode, cycle, nextSession, selectedSubject])

  const playSound = () => {
    if (!soundOn) return
    if (!audioRef.current) {
      audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3')
      audioRef.current.volume = 0.5
    }
    audioRef.current.play().catch(() => {})
  }

  const logSession = useCallback(async (completed, sessionMode, sessionCycle, sessionSubject) => {
    if (!user || !sessionSubject) return
    try {
      const { error } = await supabase.from('study_logs').insert({
        user_id: user.id,
        subject_id: sessionSubject.id,
        session_type: 'focus',
        duration_minutes: sessionMode === 'focus' ? FOCUS_MIN : 0,
        completed,
        date: new Date().toISOString().slice(0, 10),
        pomodoro_cycle: sessionCycle,
      })
      if (error) throw error
      if (completed) {
        setCompletedToday((c) => c + 1)
        showToast({ type: 'success', title: 'Focus session completed!' })
        window.dispatchEvent(new CustomEvent('study-log-updated'))
      }
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to log session', description: err.message })
    }
  }, [user])

  const start = useCallback(() => {
    if (!selectedSubject) {
      showToast({ type: 'error', title: 'Select a subject first' })
      return
    }
    setIsActive(true)
  }, [selectedSubject])

  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setIsActive(false)
  }, [])

  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const totalSeconds = getTimeForMode(mode)
  const progress = (timeLeft / totalSeconds) * 100
  const circumference = 2 * Math.PI * 120
  const strokeDashoffset = circumference * (1 - timeLeft / totalSeconds)
  
  const modeColors = {
    focus: { primary: '#7c5cff', secondary: '#6a46e0', bg: 'bg-accent/10', icon: '🎯' },
    shortBreak: { primary: '#0ea5e9', secondary: '#0284c7', bg: 'bg-sky-500/10', icon: '☕' },
    longBreak: { primary: '#10b981', secondary: '#059669', bg: 'bg-emerald-500/10', icon: '🌿' }
  }
  const currentMode = modeColors[mode]
  const labels = { focus: 'Focus', shortBreak: 'Short break', longBreak: 'Long break' }

  if (!user) return <div className="p-4 text-center text-text-muted">Please sign in to use the Pomodoro timer.</div>

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <CardTitle className="text-2xl font-bold text-text">Timer</CardTitle>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted">{completedToday} completed today</span>
        </div>
      </div>

      <Card className="relative z-10 pt-8">
        <CardContent>
          <div className="relative w-72 h-72 mx-auto mb-6">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 280 280">
              <defs>
                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={currentMode.primary} />
                  <stop offset="100%" stopColor={currentMode.secondary} />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* Background track */}
              <circle
                cx="140"
                cy="140"
                r="120"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-border/30"
                opacity="0.3"
              />
              {/* Progress ring */}
              <circle
                cx="140"
                cy="140"
                r="120"
                stroke="url(#timerGradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-linear"
                style={{ filter: isActive ? 'url(#glow)' : 'none' }}
              />
              {/* Center dot when active */}
              {isActive && (
                <circle
                  cx="140"
                  cy="140"
                  r="120"
                  stroke={currentMode.primary}
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset - circumference * 0.02}
                  strokeLinecap="round"
                  opacity="0.6"
                  className="animate-pulse"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="relative">
                <span className="text-7xl font-mono font-bold text-text tracking-tight leading-none">
                  {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                </span>
                {/* Pulsing dot when active */}
                {isActive && (
                  <span className="absolute -top-2 right-0 w-3 h-3 bg-accent rounded-full animate-pulse" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className={`w-2 h-2 rounded-full ${currentMode.bg.replace('bg-', 'bg-')}`} />
                <span className="text-sm font-medium text-text-muted capitalize">{labels[mode]}</span>
                {isActive && (
                  <span className="flex items-center gap-1 text-xs text-accent font-medium animate-pulse">
                    <span className="w-1.5 h-1.5 bg-accent rounded-full" />
                    Running
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-center mb-6">
            {!isActive ? (
              <Button variant="primary" className="px-12 py-4 text-lg shadow-xl shadow-accent/30 group" onClick={start}>
                <Play className="w-5 h-5 mr-2 group-hover:translate-x-0.5 transition-transform" /> Start
              </Button>
            ) : (
              <Button variant="secondary" className="px-12 py-4 text-lg group" onClick={pause}>
                <Pause className="w-5 h-5 mr-2" /> Pause
              </Button>
            )}
            <Button variant="outline" className="px-6 py-4 group" onClick={resetTimer}>
              <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform duration-200" /> Reset
            </Button>
            <Button variant="outline" className="px-6 py-4 group" onClick={skip}>
              <SkipForward className="w-4 h-4 mr-2 group-hover:translate-x-1 transition-transform" /> Skip
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface/50 border border-border/50">
            <div className="flex-1">
              <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Cycle Progress</p>
              <div className="w-full bg-surface rounded-full h-3 border border-border/50 overflow-hidden relative">
                <div 
                  className="h-full bg-gradient-to-r from-accent to-accent/70 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(100, ((cycle % CYCLES_FOR_LONG) || CYCLES_FOR_LONG) / CYCLES_FOR_LONG * 100)}%` }} 
                />
                {/* Cycle markers */}
                {[1,2,3,4].map((c) => (
                  <span 
                    key={c} 
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border-2 bg-bg transition-colors"
                    style={{ 
                      left: `${c / 4 * 100}%`,
                      borderColor: c <= (cycle % CYCLES_FOR_LONG) || (cycle % CYCLES_FOR_LONG === 0 && c === 4) ? 'currentColor' : 'transparent',
                      color: c <= (cycle % CYCLES_FOR_LONG) || (cycle % CYCLES_FOR_LONG === 0 && c === 4) ? currentMode.primary : 'var(--color-border)'
                    }} 
                  />
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1">
                Cycle {cycle} of {CYCLES_FOR_LONG} • {cycle % CYCLES_FOR_LONG || CYCLES_FOR_LONG} / {CYCLES_FOR_LONG} sessions
              </p>
            </div>
            <div className="text-right ml-6">
              <p className="text-xs text-text-muted uppercase tracking-wider">Session</p>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <span className={`w-2 h-2 rounded-full ${currentMode.bg.replace('bg-', 'bg-')}`} />
                <p className="font-semibold text-text">{labels[mode]}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="w-4 h-4" /> Select Subject</CardTitle>
        </CardHeader>
        <CardContent>
          <select value={selectedSubject?.id || ''} onChange={(e) => setSelectedSubject(subjects.find(s => s.id === e.target.value) || null)} className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent">
            <option value="">Choose a subject...</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id} style={{ borderLeft: `4px solid ${s.color}` }}>
                {s.name}
              </option>
            ))}
          </select>
          {subjects.length === 0 && (
            <div className="text-center py-4 text-text-muted">
              <p>No subjects yet. <a href="/subjects" className="text-accent hover:underline">Add one</a> to get started.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 rounded-xl border border-border bg-surface p-4">
        <p className="text-sm text-text-muted">
          <span className="font-semibold text-text">How it works:</span> Work for 25 minutes, then take a 5-minute break. After 4 focus sessions, take a 15-minute long break. Completed focus sessions are saved to your study log and count toward your streak.
        </p>
      </div>
    </div>
  )
}
