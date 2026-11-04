import { useEffect, useState, memo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { format, subDays, startOfWeek, eachDayOfInterval } from 'date-fns'

const COLORS = ['#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
const memoizedBar = memo(Bar)
const memoizedLine = memo(Line)
const memoizedPie = memo(Pie)
const memoizedCell = memo(Cell)

export default function Analytics() {
  const { user } = useAuth()
  const [range, setRange] = useState('7d')
  const [logs, setLogs] = useState([])
  const [subjects, setSubjects] = useState([])
  const [plannedSessions, setPlannedSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadData()
    window.addEventListener('study-log-updated', loadData)
    return () => window.removeEventListener('study-log-updated', loadData)
  }, [user, range])

  const loadData = async () => {
    try {
      const today = new Date()
      let start = subDays(today, 6)
      if (range === '30d') start = subDays(today, 29)
      if (range === '90d') start = subDays(today, 89)
      const [lRes, sRes, pRes] = await Promise.all([
        supabase.from('study_logs').select('*').eq('user_id', user.id).gte('date', start.toISOString().slice(0, 10)).order('date', { ascending: true }),
        supabase.from('subjects').select('*').eq('user_id', user.id).eq('archived', false),
        supabase.from('study_plans').select('id, planned_sessions(*)').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
      ])
      if (lRes.error) throw lRes.error
      if (sRes.error) throw sRes.error
      if (pRes.error) throw pRes.error
      setLogs(lRes.data || [])
      setSubjects(sRes.data || [])
      setPlannedSessions(pRes.data?.[0]?.planned_sessions || [])
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load analytics', description: err.message })
    } finally {
      setLoading(false)
    }
  }
  const days = eachDayOfInterval({ start: subDays(new Date(), range === '7d' ? 6 : range === '30d' ? 29 : 89), end: new Date() })
  const dailyMap = {}
  days.forEach(d => { dailyMap[format(d, 'yyyy-MM-dd')] = 0 })
  const focusLogs = logs.filter(l => l.session_type === 'focus' && l.completed)
  focusLogs.forEach(l => {
    const key = format(new Date(l.date), 'yyyy-MM-dd')
    dailyMap[key] = (dailyMap[key] || 0) + (l.duration_minutes || 0)
  })
  const dailyData = days.map(d => ({ date: format(d, 'MMM d'), minutes: dailyMap[format(d, 'yyyy-MM-dd')] || 0 }))

  const subjectMap = {}
  focusLogs.forEach(l => {
    subjectMap[l.subject_id] = (subjectMap[l.subject_id] || 0) + (l.duration_minutes || 0)
  })
  const subjectData = subjects.map(s => ({
    name: s.name,
    minutes: subjectMap[s.id] || 0,
    color: s.color || COLORS[0],
  })).filter(d => d.minutes > 0)

  const totalMinutes = focusLogs.reduce((a, b) => a + (b.duration_minutes || 0), 0)
  const totalHours = (totalMinutes / 60).toFixed(1)
  const avgPerDay = days.length ? (totalMinutes / days.length / 60).toFixed(1) : 0

  // Filter planned sessions to only those within the date range
  const rangeStart = subDays(new Date(), range === '7d' ? 6 : range === '30d' ? 29 : 89)
  const rangeStartStr = format(rangeStart, 'yyyy-MM-dd')
  const relevantPlanned = plannedSessions.filter(s => {
    // planned_sessions don't have dates, they have day_of_week
    // We'll count all planned sessions for the active plan
    return true
  })
  const plannedVsCompleted = [
    { name: 'Planned', value: relevantPlanned.length },
    { name: 'Completed', value: focusLogs.length },
  ]

  if (loading) return (
    <div className="p-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full skeleton" /><div className="w-48 h-4 skeleton" /></div></div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Analytics & Progress</h1>
          <p className="text-text-muted">Your real study data, visualized.</p>
        </div>
        <div className="flex gap-2">
          {['7d', '30d', '90d'].map((r) => (
            <Button key={r} variant={range === r ? 'primary' : 'outline'} size="sm" onClick={() => setRange(r)}>
              {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-surface rounded-xl p-5 border border-border">
          <p className="text-xs text-text-muted uppercase tracking-wider">Total study time</p>
          <p className="text-2xl font-bold text-text">{totalHours}h</p>
        </div>
        <div className="bg-surface rounded-xl p-5 border border-border">
          <p className="text-xs text-text-muted uppercase tracking-wider">Avg per day</p>
          <p className="text-2xl font-bold text-text">{avgPerDay}h</p>
        </div>
        <div className="bg-surface rounded-xl p-5 border border-border">
          <p className="text-xs text-text-muted uppercase tracking-wider">Completed sessions</p>
          <p className="text-2xl font-bold text-text">{focusLogs.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Study time by day</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <memoizedBar dataKey="minutes" fill="#7c5cff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time by subject</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={subjectData}
                    dataKey="minutes"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={100}
                    fill="#8884d8"
                    payloadOffset={8}
                  >
                    {subjectData.map((entry, index) => (
                      <memoizedCell key={`pie-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Daily trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <memoizedLine type="monotone" dataKey="minutes" stroke="#7c5cff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planned vs Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plannedVsCompleted}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <memoizedBar dataKey="value" fill={[ '#94a3b8', '#7c5cff' ]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {subjectData.length === 0 && (
        <div className="mt-8 text-center py-12 text-text-muted">
          <p>No study data yet. Complete some focus sessions to see your analytics.</p>
        </div>
      )}
    </div>
  )
}

