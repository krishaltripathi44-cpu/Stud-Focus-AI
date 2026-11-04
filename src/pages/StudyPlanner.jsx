import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseReady, supabaseError } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { Separator } from '../components/ui/Separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs'
import { Bot, Calendar, Clock, Play, Save, RefreshCw, Trash2, Check, X, PlusCircle, AlertCircle, XCircle, Settings, Zap, Target, RotateCcw, ChevronDown, ChevronUp, Loader2, Sparkles, Shield, Eye, Edit, Copy, Coffee, Plus, MessageSquare } from 'lucide-react'
import { format, parseISO, isValid, addDays, startOfWeek } from 'date-fns'

const DAYS = [
  { key: 1, label: 'Mon', full: 'Monday' },
  { key: 2, label: 'Tue', full: 'Tuesday' },
  { key: 3, label: 'Wed', full: 'Wednesday' },
  { key: 4, label: 'Thu', full: 'Thursday' },
  { key: 5, label: 'Fri', full: 'Friday' },
  { key: 6, label: 'Sat', full: 'Saturday' },
  { key: 0, label: 'Sun', full: 'Sunday' },
]

const SESSION_DURATION_OPTIONS = [15, 20, 25, 30, 40, 50, 60]
const BREAK_DURATION_OPTIONS = [5, 10, 15, 20]
const LONG_BREAK_DURATION_OPTIONS = [10, 15, 20, 30]

function getDayDate(dayOfWeek) {
  const today = startOfWeek(new Date(), { weekStartsOn: 1 })
  return addDays(today, dayOfWeek - 1)
}

function getSubjectColor(subjects, subjectId) {
  return subjects.find(s => s.id === subjectId)?.color || '#8b5cf6'
}

function formatTimeRange(start, end) {
  return start + ' – ' + end
}

// Error boundary component
function PlannerError({ error, resetError }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <AlertCircle className="w-16 h-16 text-error/50 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-text mb-2">Failed to load AI Planner</h3>
        <p className="text-text-muted mb-6">{error?.message || 'An unexpected error occurred'}</p>
        <div className="space-y-2 text-sm text-text/60">
          {supabaseError && (
            <p className="text-left p-3 bg-error/5 border border-error/20 rounded-lg">
              <strong>Supabase not configured:</strong> {supabaseError}
            </p>
          )}
          {!isSupabaseReady() && (
            <p className="text-left p-3 bg-warning/5 border border-warning/20 rounded-lg">
              <strong>Missing environment variables.</strong> Check your .env file has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
            </p>
          )}
        </div>
        <Button onClick={resetError} className="mt-4">
          <RefreshCw className="w-4 h-4 mr-2" /> Try Again
        </Button>
      </div>
    </div>
  )
}

export default function StudyPlanner() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState(null)
  const [source, setSource] = useState(null)
  const [previousPlans, setPreviousPlans] = useState([])
  const [showPrevious, setShowPrevious] = useState(false)
  const [regenerateReason, setRegenerateReason] = useState('')
  const [activePreviewDay, setActivePreviewDay] = useState(null)
  const [error, setError] = useState(null)

  const resetError = () => {
    setError(null)
    // Force re-render by updating a state
    setSubjects(prev => [...prev])
  }

  const [form, setForm] = useState({
    availableDays: [1, 2, 3, 4, 5],
    preferredStartTime: '09:00',
    dailyDurationMinutes: 180,
    sessionDurationMinutes: 25,
    breakDurationMinutes: 5,
    longBreakDurationMinutes: 15,
    sessionsBeforeLongBreak: 4,
    goals: '',
    examDates: [],
  })
  const [examDateInput, setExamDateInput] = useState('')
  const [examTimeInput, setExamTimeInput] = useState('')
  const [examSubjectInput, setExamSubjectInput] = useState('')
  const [examTitleInput, setExamTitleInput] = useState('')

  useEffect(() => {
    if (!user) return
    if (!isSupabaseReady()) {
      setError(new Error(supabaseError || 'Supabase not configured'))
      return
    }
    loadSubjects()
    loadPreviousPlans()
  }, [user])

  const loadSubjects = async () => {
    if (!isSupabaseReady()) return
    try {
      const { data, error } = await supabase.from('subjects').select('*').eq('user_id', user.id).eq('archived', false).order('name')
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      setError(err)
      showToast({ type: 'error', title: 'Failed to load subjects', description: err.message })
    }
  }

  const loadPreviousPlans = async () => {
    if (!isSupabaseReady()) return
    try {
      const { data, error } = await supabase
        .from('study_plans')
        .select('*, planned_sessions(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      setPreviousPlans(data || [])
    } catch (err) {
      console.error('Failed to load previous plans:', err)
    }
  }

  const addExamDate = () => {
    const dateStr = examDateInput.trim()
    if (!dateStr) return showToast({ type: 'error', title: 'Select a date first' })
    
    const parsed = parseISO(dateStr)
    if (!isValid(parsed)) return showToast({ type: 'error', title: 'Invalid date format' })
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    if (parsed < today) return showToast({ type: 'error', title: 'Exam date cannot be in the past' })

    setForm(prev => ({
      ...prev,
      examDates: [...prev.examDates, {
        date: dateStr,
        time: examTimeInput || undefined,
        subjectId: examSubjectInput || null,
        title: examTitleInput.trim() || 'Exam',
      }],
    }))
    setExamDateInput('')
    setExamTimeInput('')
    setExamSubjectInput('')
    setExamTitleInput('')
  }

  const removeExamDate = (index) => {
    setForm(prev => ({
      ...prev,
      examDates: prev.examDates.filter((_, i) => i !== index),
    }))
  }

  const toggleDay = (day) => {
    setForm(prev => ({
      ...prev,
      availableDays: prev.availableDays.includes(day)
        ? prev.availableDays.filter(d => d !== day)
        : [...prev.availableDays, day].sort((a, b) => a - b),
    }))
  }

  const generatePlan = async () => {
    if (!subjects.length) return showToast({ type: 'error', title: 'Add subjects first', description: 'Go to Subjects page to add at least one subject.' })
    if (!form.availableDays.length) return showToast({ type: 'error', title: 'Select at least one study day' })
    if (!isSupabaseReady()) return setError(new Error(supabaseError || 'Supabase not configured'))

    setLoading(true)
    setPlan(null)
    setSource(null)
    setError(null)

    try {
      const requestBody = {
        ...form,
        subjects,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userId: user.id,
      }

      const { data, error } = await supabase.functions.invoke('ai-planner', { body: requestBody })

      if (error) throw error

      setPlan(data)
      setSource(data.source)
      showToast({ 
        type: data.source === 'ai' ? 'success' : 'info', 
        title: data.source === 'ai' ? 'AI Plan Generated' : 'Fallback Plan Generated',
        description: data.source === 'ai' ? 'Your personalized AI schedule is ready' : 'Using rule-based planner (configure AI for personalized plans)'
      })
    } catch (err) {
      setError(err)
      showToast({ type: 'error', title: 'Generation failed', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const regeneratePlan = async () => {
    if (!regenerateReason.trim()) return showToast({ type: 'error', title: 'Enter feedback first' })
    if (!isSupabaseReady()) return setError(new Error(supabaseError || 'Supabase not configured'))

    setLoading(true)
    setError(null)
    try {
      const requestBody = {
        ...form,
        subjects,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userId: user.id,
        regenerateFeedback: regenerateReason,
      }

      const { data, error } = await supabase.functions.invoke('ai-planner', { body: requestBody })

      if (error) throw error

      setPlan(data)
      setSource(data.source)
      setRegenerateReason('')
      showToast({ type: 'success', title: 'Plan Regenerated', description: 'Your updated schedule is ready' })
    } catch (err) {
      setError(err)
      showToast({ type: 'error', title: 'Regeneration failed', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const savePlan = async () => {
    if (!plan) return
    if (!isSupabaseReady()) return setError(new Error(supabaseError || 'Supabase not configured'))

    const hasActive = previousPlans.some(p => p.is_active)
    if (hasActive && !window.confirm('This will replace your current active plan. Continue?')) return

    setSaving(true)
    try {
      const { data: newPlan, error: planError } = await supabase
        .from('study_plans')
        .insert({
          user_id: user.id,
          title: plan.title || 'AI Study Plan',
          plan_date: new Date().toISOString().split('T')[0],
          source: plan.source,
          ai_model: plan.model,
          notes: plan.notes,
          ai_reasoning: plan.reasoning,
          is_active: true,
        })
        .select()
        .single()

      if (planError) throw planError

      const sessionsToInsert = plan.sessions.map((s, idx) => ({
        plan_id: newPlan.id,
        user_id: user.id,
        subject_id: s.subjectId,
        subject_name: s.subjectName,
        day_of_week: s.dayOfWeek,
        start_time: s.startTime,
        end_time: s.endTime,
        duration_minutes: s.durationMinutes,
        break_after: s.breakAfter,
        order_index: idx,
        topic: s.topic,
        session_type: s.sessionType || 'focus',
        is_flexible: s.isFlexible || false,
        status: 'planned',
      }))

      const { error: sessionsError } = await supabase.from('planned_sessions').insert(sessionsToInsert)
      if (sessionsError) throw sessionsError

      // Deactivate old plans
      await supabase.from('study_plans').update({ is_active: false }).eq('user_id', user.id).neq('id', newPlan.id)

      showToast({ type: 'success', title: 'Plan Saved & Applied', description: 'Your schedule is now active in Weekly Schedule' })
      setPlan(null)
      setSource(null)
      loadPreviousPlans()
    } catch (err) {
      showToast({ type: 'error', title: 'Save failed', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const discardPlan = () => {
    setPlan(null)
    setSource(null)
    setRegenerateReason('')
  }

  // Computed values for preview
  const previewDays = useMemo(() => {
    if (!plan) return []
    const daysMap = {}
    plan.sessions.forEach(s => {
      if (!daysMap[s.dayOfWeek]) daysMap[s.dayOfWeek] = []
      daysMap[s.dayOfWeek].push(s)
    })
    return form.availableDays
      .map(day => ({ day, sessions: daysMap[day] || [] }))
      .filter(d => d.sessions.length > 0)
  }, [plan, form.availableDays])

  const totalSessions = plan?.sessions?.length || 0
  const totalMinutes = plan?.sessions?.reduce((sum, s) => sum + (s.durationMinutes || 0), 0) || 0
  const totalHours = (totalMinutes / 60).toFixed(1)

  const tabsGridCols = previewDays.length > 0 ? previewDays.length : 1

  if (!user) return <div className="p-8 text-center text-text-muted">Please log in to use the AI Planner.</div>

  // Show error state if there's an error
  if (error) return <PlannerError error={error} resetError={resetError} />

  return (
    <div className="h-full p-4 lg:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-text flex items-center gap-2">
              <Bot className="w-6 h-6 text-accent" /> AI Study Planner
            </h1>
            <p className="text-text-muted text-sm">Generate a personalized weekly study schedule with AI</p>
          </div>
          {plan && (
            <div className="flex items-center gap-2">
              <Badge variant={source === 'ai' ? 'success' : 'default'} className="gap-1">
                {source === 'ai' ? <Sparkles className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                {source === 'ai' ? 'AI Generated' : 'Fallback'}
              </Badge>
            </div>
          )}
        </div>
        {form.examDates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.examDates.map((exam, i) => (
              <Badge key={i} variant="outline" className="gap-1 text-xs">
                <Calendar className="w-3 h-3" />
                {exam.title} – {format(parseISO(exam.date), 'MMM d')}
                {exam.time && ' at ' + exam.time}
                <button onClick={() => removeExamDate(i)} className="ml-1 hover:text-warning">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left Panel - Configuration */}
        <div className="lg:col-span-5 space-y-4">
          {/* Subjects Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings className="w-4 h-4" /> Subjects ({subjects.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {subjects.length === 0 ? (
                <div className="text-center py-6 text-text-muted">
                  <p className="mb-2">No subjects yet</p>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/subjects"><PlusCircle className="w-4 h-4 mr-2" /> Add Subjects</a>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {subjects.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg bg-surface/50">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: s.color }}>
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">{s.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-text-muted">
                          <Badge variant="default" className="text-[9px]">Priority {s.priority}</Badge>
                          <span>{s.weekly_target_hours}h/week</span>
                          <span>Difficulty {s.difficulty}/5</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Configuration Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings className="w-4 h-4" /> Schedule Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Study Days */}
              <div>
                <label className="block text-sm font-medium text-text/70 mb-2">Study Days</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map(day => (
                    <button
                      key={day.key}
                      onClick={() => toggleDay(day.key)}
                      className={
                        'px-3 py-2 rounded-lg text-sm font-medium transition-all ' +
                        (form.availableDays.includes(day.key)
                          ? 'bg-accent text-white shadow-sm'
                          : 'bg-surface border border-border text-text/60 hover:bg-surface/50')
                      }
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-1">{form.availableDays.length} day{form.availableDays.length !== 1 ? 's' : ''} selected</p>
              </div>

              <Separator />

              {/* Time Settings Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text/70 mb-1">Start Time</label>
                  <Input type="time" value={form.preferredStartTime} onChange={e => setForm({...form, preferredStartTime: e.target.value})} className="w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text/70 mb-1">Daily Duration</label>
                  <select
                    value={form.dailyDurationMinutes}
                    onChange={e => setForm({...form, dailyDurationMinutes: parseInt(e.target.value)})}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-text focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="">Select duration</option>
                    {[60, 90, 120, 150, 180, 210, 240, 300, 360].map(m => (
                      <option key={m} value={m}>{Math.floor(m/60)}h {m%60}m</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text/70 mb-1">Session Length</label>
                  <select
                    value={form.sessionDurationMinutes}
                    onChange={e => setForm({...form, sessionDurationMinutes: parseInt(e.target.value)})}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-text focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="">Select length</option>
                    {SESSION_DURATION_OPTIONS.map(m => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text/70 mb-1">Short Break</label>
                  <select
                    value={form.breakDurationMinutes}
                    onChange={e => setForm({...form, breakDurationMinutes: parseInt(e.target.value)})}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-text focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="">Select break</option>
                    {BREAK_DURATION_OPTIONS.map(m => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text/70 mb-1">Long Break</label>
                  <select
                    value={form.longBreakDurationMinutes}
                    onChange={e => setForm({...form, longBreakDurationMinutes: parseInt(e.target.value)})}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-text focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="">Select break</option>
                    {LONG_BREAK_DURATION_OPTIONS.map(m => (
                      <option key={m} value={m}>{m} min</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text/70 mb-1">Sessions Before Long Break</label>
                  <select
                    value={form.sessionsBeforeLongBreak}
                    onChange={e => setForm({...form, sessionsBeforeLongBreak: parseInt(e.target.value)})}
                    className="w-full h-10 px-3 rounded-lg border border-border bg-surface text-text focus:ring-2 focus:ring-accent focus:border-accent"
                  >
                    <option value="">Select count</option>
                    {[2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>{n} sessions</option>
                    ))}
                  </select>
                </div>
              </div>

              <Separator />

              {/* Goals */}
              <div>
                <label className="block text-sm font-medium text-text/70 mb-1">Study Goals (optional)</label>
                <textarea
                  value={form.goals}
                  onChange={e => setForm({...form, goals: e.target.value})}
                  rows={3}
                  placeholder="e.g., Focus on Calculus for upcoming exam, improve Biology retention..."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <Separator />

              {/* Exam Dates */}
              <div>
                <label className="block text-sm font-medium text-text/70 mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Exam Dates
                </label>
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Input
                      type="date"
                      min={new Date().toISOString().split('T')[0]}
                      value={examDateInput}
                      onChange={e => setExamDateInput(e.target.value)}
                      placeholder="Date"
                      className="flex-1 min-w-[140px]"
                    />
                    <Input
                      type="time"
                      value={examTimeInput}
                      onChange={e => setExamTimeInput(e.target.value)}
                      placeholder="Time (opt)"
                      className="w-[100px]"
                    />
                    <select
                      value={examSubjectInput}
                      onChange={e => setExamSubjectInput(e.target.value)}
                      className="w-[140px] h-10 px-3 rounded-lg border border-border bg-surface text-text focus:ring-2 focus:ring-accent focus:border-accent"
                    >
                      <option value="">Subject (opt)</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <Input
                      value={examTitleInput}
                      onChange={e => setExamTitleInput(e.target.value)}
                      placeholder="Title (opt)"
                      className="flex-1 min-w-[120px]"
                    />
                    <Button onClick={addExamDate} className="h-10 px-4"><Plus className="w-4 h-4" /></Button>
                  </div>
                  {form.examDates.length && (
                    <div className="flex flex-wrap gap-2">
                      {form.examDates.map((exam, i) => (
                        <Badge key={i} variant="outline" className="gap-1 text-xs" onClick={() => removeExamDate(i)}>
                          <Calendar className="w-3 h-3" />
                          {exam.title} – {format(parseISO(exam.date), 'MMM d')}
                          {exam.time && ' ' + exam.time}
                          <X className="w-3 h-3 ml-1 hover:text-warning cursor-pointer" />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                onClick={generatePlan}
                disabled={loading || !subjects.length || !form.availableDays.length}
                className="w-full py-3 text-lg"
              >
                {loading ? (
                  <> <Loader2 className="w-5 h-5 animate-spin mr-2" /> Generating... </>
                ) : (
                  <> <Sparkles className="w-5 h-5 mr-2" /> Generate AI Plan </>
                )}
              </Button>
              <p className="text-center text-xs text-text-muted">
                {loading ? 'Analyzing your subjects, exams, and preferences...' : 
                !subjects.length ? 'Add at least one subject first' : 
                !form.availableDays.length ? 'Select at least one study day' : 
                'AI will create a balanced schedule based on your settings'}
              </p>
            </CardFooter>
          </Card>
        </div>

        {/* Right Panel - Preview */}
        <div className="lg:col-span-7 space-y-4">
          {plan ? (
            <>
              {/* Plan Summary */}
              <Card className="bg-accent/5 border-accent/20">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <h2 className="text-lg font-bold text-text">{plan.title || 'AI Study Plan'}</h2>
                      <Badge variant={source === 'ai' ? 'success' : 'default'} className="gap-1">
                        {source === 'ai' ? <Sparkles className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        {source === 'ai' ? 'AI Generated' : 'Rule-based Fallback'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-text/60">
                      <div className="flex items-center gap-1"><Bot className="w-4 h-4" /> {totalSessions} sessions</div>
                      <div className="flex items-center gap-1"><Clock className="w-4 h-4" /> {totalHours}h total</div>
                      <div className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {previewDays.length} days</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Weekly Preview Tabs */}
              <Card>
                <CardHeader>
                  <Tabs defaultValue={previewDays[0]?.day?.toString() || ''} className="w-full">
                    <TabsList className={"grid w-full grid-cols-" + tabsGridCols}>
                      {previewDays.map(({ day }) => (
                        <TabsTrigger key={day} value={String(day)} className="py-2 text-sm">
                          {DAYS.find(d => d.key === day)?.full}
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-surface text-xs text-text/60">{DAYS.find(d => d.key === day)?.sessions?.length || 0}</span>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {previewDays.map(({ day, sessions }) => (
                    <TabsContent key={day} value={String(day)} className="p-0">
                      {sessions.length === 0 ? (
                        <div className="p-8 text-center text-text-muted">No sessions scheduled</div>
                      ) : (
                        <div className="divide-y divide-border">
                          {sessions.map((s, idx) => (
                            <div key={s.id || idx} className="flex items-center justify-between p-4 hover:bg-surface/50 transition-colors group">
                              <div className="flex items-center gap-4 min-w-0">
                                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: getSubjectColor(subjects, s.subjectId) }}>
                                  {s.subjectName.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-text truncate">{s.subjectName}</p>
                                  <div className="flex items-center gap-3 text-xs text-text/50">
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTimeRange(s.startTime, s.endTime)}</span>
                                    <span className="flex items-center gap-1"><Target className="w-3 h-3" /> {s.durationMinutes} min</span>
                                    {s.topic && <span className="flex items-center gap-1 truncate"><MessageSquare className="w-3 h-3" /> {s.topic}</span>}
                                    <Badge variant="default" className="text-[9px]">{s.sessionType || 'focus'}</Badge>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-text/40">
                                {s.breakAfter && <span className="text-xs flex items-center gap-1"><Coffee className="w-3 h-3" /> Break</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <Button onClick={savePlan} disabled={saving} className="flex-1 min-w-[160px] py-3">
                  {saving ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Saving... </> : <><Save className="w-5 h-5 mr-2" /> Save & Apply Plan </>}
                </Button>
                <Button variant="outline" onClick={regeneratePlan} disabled={loading} className="min-w-[140px]">
                  <RotateCcw className="w-4 h-4 mr-2" /> Regenerate
                </Button>
                <Button variant="ghost" onClick={discardPlan} className="min-w-[100px]">
                  <X className="w-4 h-4 mr-2" /> Discard
                </Button>
              </div>

              {/* Regeneration Feedback */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-text/70 mb-2">Refine Plan (optional)</label>
                <div className="flex gap-2">
                  <textarea
                    value={regenerateReason}
                    onChange={e => setRegenerateReason(e.target.value)}
                    rows={2}
                    placeholder="What would you like to change? e.g., 'More Math on Monday', 'Shorter sessions', 'Start earlier'"
                    className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-text placeholder:text-text/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  />
                  <Button onClick={regeneratePlan} disabled={loading || !regenerateReason.trim()}>Regenerate</Button>
                </div>
              </div>

              {source === 'fallback' && (
                <div className="mt-4 p-4 rounded-lg border border-warning/20 bg-warning/5">
                  <p className="text-sm text-warning/80 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> This plan was generated by the rule-based fallback planner. Configure your AI API key for personalized AI planning.</p>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <Card className="h-full">
              <CardContent className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
                    <Bot className="w-10 h-10 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold text-text mb-2">Ready to Generate Your Schedule</h3>
                  <p className="text-text-muted mb-6">Configure your settings on the left, then click <span className="font-medium text-accent">Generate AI Plan</span> to create a personalized study schedule.</p>
                  <div className="space-y-3 text-left text-sm text-text/60">
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> AI balances subjects by priority & exam dates</div>
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Respects your preferred hours & break patterns</div>
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Includes exam prep sessions automatically</div>
                    <div className="flex items-center gap-2"><Check className="w-4 h-4 text-success" /> Review & regenerate until perfect</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            )
          }

          {/* Previous Plans */}
          {previousPlans.length > 0 && (
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4" /> Previous Plans</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowPrevious(!showPrevious)}>
                  {showPrevious ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />} {showPrevious ? 'Hide' : 'Show'}
                </Button>
              </CardHeader>
              {showPrevious && (
                <CardContent className="space-y-2">
                  {previousPlans.slice(0, 5).map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-surface/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <Badge variant={p.source === 'ai' ? 'success' : 'default'} className="gap-1">
                          {p.source === 'ai' ? <Sparkles className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                          {p.source === 'ai' ? 'AI' : 'Fallback'}
                        </Badge>
                        <div>
                          <p className="font-medium text-text">{p.title}</p>
                          <p className="text-xs text-text-muted">{format(new Date(p.created_at), 'MMM d, yyyy')} • {p.planned_sessions?.length || 0} sessions</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.is_active ? 'success' : 'default'}>{p.is_active ? 'Active' : 'Archived'}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/schedule?plan=' + p.id)}>View</Button>
                      </div>
                    </div>
                  ))}
                  {previousPlans.length > 5 && (
                    <p className="text-xs text-text-muted text-center">Showing 5 of {previousPlans.length} plans</p>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
