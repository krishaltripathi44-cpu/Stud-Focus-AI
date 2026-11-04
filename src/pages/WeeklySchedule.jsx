import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Calendar, Clock, Check } from 'lucide-react'

const DAYS = [
  { key: 1, label: 'Monday' }, { key: 2, label: 'Tuesday' }, { key: 3, label: 'Wednesday' },
  { key: 4, label: 'Thursday' }, { key: 5, label: 'Friday' }, { key: 6, label: 'Saturday' }, { key: 0, label: 'Sunday' },
]

export default function WeeklySchedule() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState([])
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    loadSessions()
  }, [user])

  const loadSessions = async () => {
    try {
      // First get the active plan for this user
      const { data: activePlan, error: planError } = await supabase
        .from('study_plans')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (planError) throw planError

      if (!activePlan) {
        setSessions([])
        // Still load subjects for potential future use
        const { data: subjectsData, error: subjectsError } = await supabase
          .from('subjects')
          .select('id, name, color')
          .eq('user_id', user.id)
          .eq('archived', false)
        if (subjectsError) throw subjectsError
        setSubjects(subjectsData || [])
        return
      }

      // Load planned sessions for the active plan only
      const [plansRes, subjectsRes] = await Promise.all([
        supabase
          .from('planned_sessions')
          .select('*')
          .eq('plan_id', activePlan.id)
          .eq('user_id', user.id)
          .order('day_of_week', { ascending: true })
          .order('order_index', { ascending: true }),
        supabase
          .from('subjects')
          .select('id, name, color')
          .eq('user_id', user.id)
          .eq('archived', false),
      ])
      if (plansRes.error) throw plansRes.error
      if (subjectsRes.error) throw subjectsRes.error
      setSessions(plansRes.data || [])
      setSubjects(subjectsRes.data || [])
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load schedule', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const subjectColor = (subjectId) => {
    if (!subjectId) return null
    return subjects.find((s) => s.id === subjectId)?.color || null
  }

  const updateStatus = async (id, status) => {
    try {
      const { error } = await supabase.from('planned_sessions').update({ status }).eq('id', id).eq('user_id', user.id)
      if (error) throw error
      setSessions(sessions.map(s => s.id === id ? { ...s, status } : s))
      showToast({ type: 'success', title: `Session marked ${status}` })
    } catch (err) {
      showToast({ type: 'error', title: 'Update failed', description: err.message })
    }
  }

  if (loading) return (
    <div className="p-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full skeleton" /><div className="w-48 h-4 skeleton" /></div></div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Weekly Schedule</h1>
          <p className="text-text-muted">Your planned study sessions for the week.</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/planner"><Calendar className="w-4 h-4 mr-2" /> Open AI Planner</a>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {DAYS.map((day) => {
          const daySessions = sessions.filter(s => s.day_of_week === day.key)
          return (
            <Card key={day.key} className="h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${daySessions.length ? 'bg-accent text-white' : 'bg-surface border border-border text-text/40'}`}>
                    {day.label.charAt(0)}
                  </span>
                  <span className="font-semibold text-text">{day.label}</span>
                  <span className="ml-auto text-xs font-medium text-text/40">{daySessions.length}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {daySessions.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-4">No sessions</p>
                ) : (
                  daySessions.map((s) => {
                    const color = subjectColor(s.subject_id)
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-border/50 bg-surface/50">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-text truncate flex items-center gap-2">
                            {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                            {s.subject_name || 'Study'}
                          </div>
                          <div className="text-[10px] text-text/50">{s.start_time} – {s.end_time} • {s.duration_minutes} min</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge variant={s.status === 'completed' ? 'success' : s.status === 'skipped' ? 'default' : 'accent'} className="text-[10px]">{s.status}</Badge>
                          <Button size="sm" variant="ghost" className="w-6 h-6 p-0" onClick={() => updateStatus(s.id, s.status === 'completed' ? 'planned' : 'completed')} title="Mark complete">
                            {s.status === 'completed' ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          </Button>
                        </div>
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
