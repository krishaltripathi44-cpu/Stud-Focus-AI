import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Flame, Trophy, BookOpen, Target, Zap } from 'lucide-react'
import { format, subDays, eachDayOfInterval } from 'date-fns'

const BADGES = [
  { key: 'first_session', name: 'First Steps', icon: BookOpen, desc: 'Complete your first focus session.', color: '#0ea5e9' },
  { key: 'three_day', name: 'Consistency', icon: Flame, desc: 'Study 3 days in a row.', color: '#f59e0b' },
  { key: 'seven_day', name: 'One Week', icon: Flame, desc: 'Study 7 days in a row.', color: '#ef4444' },
  { key: 'ten_hours', name: 'Ten Hours', icon: Trophy, desc: 'Log 10 total focus hours.', color: '#10b981' },
  { key: 'thirty_hours', name: 'Dedicated', icon: Trophy, desc: 'Log 30 total focus hours.', color: '#7c5cff' },
]

export default function Achievements() {
  const { user } = useAuth()
  const [logs, setLogs] = useState([])
  const [earnedNames, setEarnedNames] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const checkAndUnlockAchievements = useCallback(async (currentLogs) => {
    if (!user) return
    
    const now = new Date()
    const totalMinutes = currentLogs.reduce((a, b) => a + (b.duration_minutes || 0), 0)
    const totalHours = totalMinutes / 60
    
    let streak = 0
    let d = new Date(now)
    while (true) {
      const dayStr = format(d, 'yyyy-MM-dd')
      const has = currentLogs.some(l => format(new Date(l.date), 'yyyy-MM-dd') === dayStr)
      if (!has) break
      streak++
      d = subDays(d, 1)
    }

    const newAchievements = []
    
    // Check each badge
    if (currentLogs.length > 0 && !earnedNames.has('First Steps')) {
      newAchievements.push({ user_id: user.id, name: 'First Steps', description: 'Complete your first focus session.', icon: 'book-open', color: '#0ea5e9' })
    }
    if (streak >= 3 && !earnedNames.has('Consistency')) {
      newAchievements.push({ user_id: user.id, name: 'Consistency', description: 'Study 3 days in a row.', icon: 'flame', color: '#f59e0b' })
    }
    if (streak >= 7 && !earnedNames.has('One Week')) {
      newAchievements.push({ user_id: user.id, name: 'One Week', description: 'Study 7 days in a row.', icon: 'flame', color: '#ef4444' })
    }
    if (totalHours >= 10 && !earnedNames.has('Ten Hours')) {
      newAchievements.push({ user_id: user.id, name: 'Ten Hours', description: 'Log 10 total focus hours.', icon: 'trophy', color: '#10b981' })
    }
    if (totalHours >= 30 && !earnedNames.has('Dedicated')) {
      newAchievements.push({ user_id: user.id, name: 'Dedicated', description: 'Log 30 total focus hours.', icon: 'trophy', color: '#7c5cff' })
    }

    if (newAchievements.length > 0) {
      try {
        const { error } = await supabase.from('achievements').insert(newAchievements)
        if (error) throw error
        newAchievements.forEach(a => {
          setEarnedNames(prev => new Set([...prev, a.name]))
          showToast({ type: 'success', title: 'Achievement unlocked!', description: a.name })
        })
      } catch (err) {
        console.error('Failed to unlock achievements:', err)
      }
    }
  }, [user, earnedNames])

  const loadData = async () => {
    try {
      const [lRes, aRes] = await Promise.all([
        supabase.from('study_logs').select('*').eq('user_id', user.id).eq('session_type', 'focus').eq('completed', true),
        supabase.from('achievements').select('*').eq('user_id', user.id),
      ])
      if (lRes.error) throw lRes.error
      if (aRes.error) throw aRes.error
      const logsData = lRes.data || []
      setLogs(logsData)
      setEarnedNames(new Set((aRes.data || []).map(a => a.name)))
      // Check for new achievements
      await checkAndUnlockAchievements(logsData)
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load achievements', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    loadData()
    window.addEventListener('study-log-updated', loadData)
    return () => window.removeEventListener('study-log-updated', loadData)
  }, [user, checkAndUnlockAchievements])
  const now = new Date()
  const totalMinutes = logs.reduce((a, b) => a + (b.duration_minutes || 0), 0)
  const totalHours = totalMinutes / 60

  let streak = 0
  let d = new Date(now)
  while (true) {
    const dayStr = format(d, 'yyyy-MM-dd')
    const has = logs.some(l => format(new Date(l.date), 'yyyy-MM-dd') === dayStr)
    if (!has) break
    streak++
    d = subDays(d, 1)
  }

  const progress = BADGES.map((b) => {
    let current = 0
    let max = 1
    switch (b.key) {
      case 'first_session': current = logs.length > 0 ? 1 : 0; max = 1; break
      case 'three_day': current = Math.min(streak, 3); max = 3; break
      case 'seven_day': current = Math.min(streak, 7); max = 7; break
      case 'ten_hours': current = Math.min(totalHours, 10); max = 10; break
      case 'thirty_hours': current = Math.min(totalHours, 30); max = 30; break
    }
    const earned = earnedNames.has(b.name)
    return { ...b, current, max, earned, pct: earned ? 100 : Math.min(100, Math.round((current / max) * 100)) }
  })

  if (loading) return (
    <div className="p-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full skeleton" /><div className="w-48 h-4 skeleton" /></div></div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Achievements</h1>
          <p className="text-text-muted">Earn badges for staying consistent.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {progress.map((b) => (
          <Card key={b.key} className={`p-5 ${b.earned ? 'border-accent/30 bg-accent/5' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.earned ? `bg-[${b.color}] text-white` : 'bg-surface/50 text-text/30 border border-border/50'}`}>
                <b.icon className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <h3 className={`font-semibold ${b.earned ? 'text-accent' : 'text-text'}`}>{b.name}</h3>
                  {b.earned && <Badge variant="success" className="text-[10px]">Earned</Badge>}
                </div>
                <p className="text-xs text-text/60 mt-1">{b.desc}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-xs text-text/60 mb-1">
                <span>{b.current} / {b.max}</span>
                <span>{b.pct}%</span>
              </div>
              <div className="w-full bg-surface rounded-full h-2 overflow-hidden">
                <div className={`h-full ${b.earned ? 'bg-accent' : 'bg-accent/20'}`} style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-5">
        <Stat title="Current streak" value={streak} unit="days" icon={<Flame className="w-5 h-5 text-warning" />} />
        <Stat title="Total focus hours" value={totalHours.toFixed(1)} unit="h" icon={<Trophy className="w-5 h-5 text-accent" />} />
        <Stat title="Sessions logged" value={logs.length} unit="sessions" icon={<BookOpen className="w-5 h-5 text-info" />} />
      </div>
    </div>
  )
}

function Stat({ title, value, unit, icon }) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-accent">{icon}</div>
          <div>
            <p className="text-xs text-text/60 uppercase tracking-wider">{title}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-text">{value}</span>
              <span className="text-sm text-text/50">{unit}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

