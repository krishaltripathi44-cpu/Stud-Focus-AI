import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import {
  Clock, BookOpen, Target, Flame, TrendingUp, Play, Loader2, Plus, ArrowRight,
} from 'lucide-react'
import { format, subDays, startOfWeek, eachDayOfInterval } from 'date-fns'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [subjects, setSubjects] = useState([])
  const [logs, setLogs] = useState([])
  const [plans, setPlans] = useState([])
  const [todaySessions, setTodaySessions] = useState([])
  const [stats, setStats] = useState({
    totalHours: 0,
    sessionsToday: 0,
    streak: 0,
    longestStreak: 0,
    weeklyRate: 0,
  })

  useEffect(() => {
    if (!user) { setLoading(false); return }
    loadData()
    window.addEventListener('study-log-updated', loadData)
    return () => window.removeEventListener('study-log-updated', loadData)
  }, [user])

  const loadData = async () => {
    try {
      const [sRes, lRes, pRes] = await Promise.all([
        supabase
          .from('subjects')
          .select('*, study_logs(duration_minutes, completed, session_type)')
          .eq('user_id', user.id)
          .eq('archived', false)
          .order('created_at', { ascending: false }),
        supabase.from('study_logs').select('*').eq('user_id', user.id).eq('completed', true).order('created_at', { ascending: false }),
        supabase.from('study_plans').select('*, planned_sessions(*)').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
      ])
      setSubjects(sRes.data || [])
      setLogs(lRes.data || [])
      setPlans(pRes.data || [])
      computeStats(lRes.data || [])
      setTodaySessions((pRes.data?.[0]?.planned_sessions || []).filter(s => {
        const today = new Date().getDay()
        return s.day_of_week === today && s.status === 'planned'
      }))
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load dashboard', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const computeStats = (allLogs) => {
    const now = new Date()
    const todayLogs = allLogs.filter(l => format(new Date(l.date), 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd') && l.session_type === 'focus' && l.completed)
    const totalMinutes = allLogs.filter(l => l.session_type === 'focus' && l.completed).reduce((a, b) => a + (b.duration_minutes || 0), 0)
    const totalHours = totalMinutes / 60

    let streak = 0
    let d = new Date(now)
    while (true) {
      const dayStr = format(d, 'yyyy-MM-dd')
      const has = allLogs.some(l => format(new Date(l.date), 'yyyy-MM-dd') === dayStr && l.session_type === 'focus' && l.completed)
      if (!has) break
      streak++
      d = subDays(d, 1)
    }

    let longest = 0
    let cur = 0
    const days = eachDayOfInterval({ start: subDays(now, 90), end: now })
    for (const day of days) {
      const dayStr = format(day, 'yyyy-MM-dd')
      const has = allLogs.some(l => format(new Date(l.date), 'yyyy-MM-dd') === dayStr && l.session_type === 'focus' && l.completed)
      cur = has ? cur + 1 : 0
      if (cur > longest) longest = cur
    }

    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: now })
    const studyDays = daysInWeek.filter(day =>
      allLogs.some(l => format(new Date(l.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd') && l.session_type === 'focus' && l.completed)
    ).length
    const weeklyRate = daysInWeek.length ? Math.round((studyDays / daysInWeek.length) * 100) : 0

    setStats({
      totalHours: Math.round(totalHours * 10) / 10,
      sessionsToday: todayLogs.length,
      streak,
      longestStreak: longest,
      weeklyRate,
    })
  }

  const subjectProgress = subjects.map(s => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const sLogs = logs.filter(l => l.subject_id === s.id && l.session_type === 'focus' && l.completed && format(new Date(l.date), 'yyyy-MM-dd') >= weekStartStr)
    const done = sLogs.reduce((a, b) => a + (b.duration_minutes || 0), 0) / 60
    const target = Number(s.weekly_target_hours || 3)
    const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0
    return { ...s, done, target, pct }
  })

  if (loading) return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-56" />
      <Skeleton className="h-56" />
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.user_metadata?.full_name || 'Student'}!</h1>
          <p className="text-text-muted text-sm">Here's your study progress overview.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/pomodoro')}>
            <Play className="w-4 h-4 mr-1" /> Start Session
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate('/planner')}>
            <Plus className="w-4 h-4 mr-1" /> New Plan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Clock className="w-5 h-5" />} label="Total study time" value={`${stats.totalHours}h`} trend={`Best streak: ${stats.longestStreak} days`} />
        <StatCard icon={<BookOpen className="w-5 h-5" />} label="Sessions today" value={stats.sessionsToday} trend={`Daily goal: ${profile?.daily_goal_hours || 3}h`} />
        <StatCard icon={<Flame className="w-5 h-5" />} label="Current streak" value={`${stats.streak} days`} trend={`Weekly: ${stats.weeklyRate}%`} />
        <StatCard icon={<Target className="w-5 h-5" />} label="Daily goal" value={`${Math.min(100, Math.round((stats.sessionsToday * 25 / 60) / (profile?.daily_goal_hours || 3) * 100))}%`} trend={`${Math.round(stats.sessionsToday * 25 / 60 * 10) / 10}h of ${profile?.daily_goal_hours || 3}h`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-accent" /> Subject progress (this week)
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/subjects')}>Manage</Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {subjects.length === 0 ? (
              <div className="text-center py-6">
                <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-text-muted text-sm">No subjects yet</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/subjects')}>Add your first subject</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {subjectProgress.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 p-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-sm font-medium text-text truncate">{s.name}</span>
                      <span className="text-xs text-text-muted ml-auto whitespace-nowrap">{Math.round(s.done * 10) / 10}h / {s.target}h</span>
                    </div>
                    <div className="w-20 h-1.5 bg-surface rounded-full overflow-hidden border border-border/50 flex-shrink-0">
                      <div className={`h-full ${s.color} transition-all duration-500`} style={{ width: `${s.pct}%` }} />
                    </div>
                    <Badge variant={s.pct >= 100 ? 'success' : 'default'} className="text-[10px] whitespace-nowrap">{s.pct}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent" /> Today's schedule
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <a href="/schedule"><ArrowRight className="w-4 h-4 mr-1" /> View all</a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {todaySessions.length === 0 ? (
              <div className="text-center py-6">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-text-muted text-sm">No sessions planned for today</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/planner')}>Generate a plan</Button>
              </div>
            ) : (
              <div className="space-y-2">
                {todaySessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-surface transition">
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                      {s.subject_id ? subjects.find(x => x.id === s.subject_id)?.color || '📚' : '📚'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text truncate">{s.subject_name || 'Study'}</div>
                      <div className="text-xs text-text-muted">{s.start_time} – {s.end_time} • {s.duration_minutes} min</div>
                    </div>
                    <Badge variant={s.status === 'completed' ? 'success' : 'accent'} className="text-[10px] whitespace-nowrap">{s.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-accent" /> Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {logs.slice(0, 8).map((log) => (
            <div key={log.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-surface transition">
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
                {log.session_type === 'focus' ? '📚' : '☕'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{log.subject_id ? subjects.find(s => s.id === log.subject_id)?.name || 'Study' : 'Study session'}</div>
                <div className="text-xs text-text-muted">{format(new Date(log.date), 'MMM d, h:mm a')} • {log.duration_minutes} min</div>
              </div>
              <span className={`text-xs font-medium ${log.completed ? 'text-success' : 'text-text-muted'} whitespace-nowrap`}>
                {log.completed ? 'Completed' : 'Logged'}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-center py-4 text-text-muted text-sm">No activity yet. Start your first focus session!</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, trend }) {
  return (
    <Card>
      <CardContent className="pb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold text-text">{value}</span>
            </div>
            <p className="text-xs text-text-muted mt-1">{trend}</p>
          </div>
          <div className="w-9 h-9 rounded-xl bg-accent/5 flex items-center justify-center text-accent">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
