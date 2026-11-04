import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, isSupabaseReady, supabaseError } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { ScrollArea } from '../components/ui/ScrollArea'
import { Bot, Send, Clock, Loader2, Plus, Trash2, MessageSquare, Sparkles, Zap, Shield, CheckCircle, XCircle, AlertCircle, Target, Sparkle, Brain, Menu, X, Copy, Check, ChevronDown, ChevronUp, Search, RefreshCw } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

const SUGGESTED_PROMPTS = [
  "What should I study today?",
  "Create a study routine for today.",
  "I have an exam in 7 days. Help me prepare.",
  "Which subject should I prioritize?",
  "I missed yesterday's sessions. What should I do?",
  "Am I behind my study goals?",
  "How much did I study this week?",
  "Explain my weekly progress.",
]

const ACTION_TYPE_LABELS = {
  create_plan: 'Create Study Plan',
  reschedule_sessions: 'Reschedule Sessions',
  update_goals: 'Update Goals',
  modify_sessions: 'Modify Sessions',
  replace_plan: 'Replace Active Plan',
}

const ACTION_TYPE_ICONS = {
  create_plan: Sparkles,
  reschedule_sessions: Clock,
  update_goals: Target,
  modify_sessions: MessageSquare,
  replace_plan: Zap,
}

const ACTION_TYPE_COLORS = {
  create_plan: 'bg-purple-100 text-purple-700 border-purple-200',
  reschedule_sessions: 'bg-blue-100 text-blue-700 border-blue-200',
  update_goals: 'bg-green-100 text-green-700 border-green-200',
  modify_sessions: 'bg-orange-100 text-orange-700 border-orange-200',
  replace_plan: 'bg-red-100 text-red-700 border-red-200',
}

// Error boundary component
function AssistantError({ error, resetError }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <AlertCircle className="w-16 h-16 text-error/50 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-text mb-2">Failed to load AI Assistant</h3>
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

export default function AIAssistant() {
  const { user, profile } = useAuth()
  const [conversations, setConversations] = useState([])
  const [filteredConversations, setFilteredConversations] = useState('')
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [contextLoading, setContextLoading] = useState(false)
  const [context, setContext] = useState(null)
  const [executingAction, setExecutingAction] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)

  const resetError = () => {
    setError(null)
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    if (!user) return
    if (!isSupabaseReady()) {
      setError(new Error(supabaseError || 'Supabase not configured'))
      return
    }
    loadConversations()
  }, [user])

  const loadConversations = async () => {
    if (!isSupabaseReady()) return
    try {
      const { data, error } = await supabase.from('ai_conversations').select('*').eq('user_id', user.id).order('updated_at', { ascending: false })
      if (error) throw error
      setConversations(data || [])
      if (data && data.length) {
        setActiveConv(data[0].id)
        loadMessages(data[0].id)
      }
    } catch (err) {
      setError(err)
      showToast({ type: 'error', title: 'Failed to load conversations', description: err.message })
    }
  }

  const loadMessages = async (convId) => {
    if (!isSupabaseReady()) return
    try {
      const { data, error } = await supabase.from('ai_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true })
      if (error) throw error
      const transformed = (data || []).map(m => ({
        ...m,
        source: m.metadata?.source || 'fallback',
        actions: m.metadata?.actions || [],
      }))
      setMessages(transformed)
      setShowSuggestions(false)
    } catch (err) {
      setError(err)
      showToast({ type: 'error', title: 'Failed to load messages', description: err.message })
    }
  }

  const loadContext = useCallback(async () => {
    if (!user) return
    if (!isSupabaseReady()) return
    setContextLoading(true)
    try {
      const [sRes, lRes, pRes, examRes] = await Promise.all([
        supabase.from('subjects').select('*').eq('user_id', user.id).eq('archived', false),
        supabase.from('study_logs').select('*').eq('user_id', user.id).eq('session_type', 'focus').eq('completed', true).order('date', { ascending: false }).limit(20),
        supabase.from('study_plans').select('*, planned_sessions(*)').eq('user_id', user.id).eq('is_active', true).order('created_at', { ascending: false }).limit(1),
        supabase.from('exam_dates').select('*, subjects(name)').eq('user_id', user.id).gte('exam_date', new Date().toISOString().split('T')[0]).order('exam_date', { ascending: true })
      ])

      const subjects = (sRes.data || []).map(s => ({ id: s.id, name: s.name, priority: s.priority, weeklyTargetHours: Number(s.weekly_target_hours), difficulty: s.difficulty || 3 }))
      const recentSessions = (lRes.data || []).map(l => ({ subjectName: l.subject_id ? subjects.find(s => s.id === l.subject_id)?.name || 'Unknown' : 'Unknown', durationMinutes: l.duration_minutes, date: l.date, completed: l.completed }))
      const activePlan = pRes.data?.[0] ? { 
        id: pRes.data[0].id, 
        title: pRes.data[0].title, 
        sessions: (pRes.data[0].planned_sessions || []).map(s => ({ 
          subjectName: s.subject_name, 
          dayOfWeek: s.day_of_week, 
          startTime: s.start_time, 
          endTime: s.end_time,
          status: s.status || 'planned'
        })) 
      } : null
      const today = new Date()
      const todayStr = format(today, 'EEEE')
      const dayMap = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 }
      const todaySessions = activePlan ? activePlan.sessions.filter(s => s.dayOfWeek === dayMap[todayStr]) : []
      const streak = 0
      const totalHours = (lRes.data || []).reduce((a, b) => a + (b.duration_minutes || 0), 0) / 60
      const dailyGoalHours = profile?.daily_goal_hours || 3
      const weeklyProgress = subjects.map(s => ({ subjectId: s.id, subjectName: s.name, hoursDone: 0, targetHours: s.weeklyTargetHours }))

      setContext({ subjects, recentSessions, upcomingExams: examRes.data || [], activePlan, todaySessions, streak, totalHours, dailyGoalHours, weeklyProgress })
    } catch (err) {
      console.error('Failed to load context:', err)
    } finally {
      setContextLoading(false)
    }
  }, [user, profile])

  useEffect(() => {
    if (user) loadContext()
  }, [user, loadContext])

  const newConversation = () => {
    // Only reset local state - don't create DB row until user sends first message
    setActiveConv(null)
    setMessages([])
    setShowSuggestions(true)
  }

  const deleteConversation = async (convId, e) => {
    e.stopPropagation()
    if (!isSupabaseReady()) return
    try {
      // Delete messages first (cascade should handle this, but be explicit)
      await supabase.from('ai_messages').delete().eq('conversation_id', convId)
      // Delete conversation
      const { error } = await supabase.from('ai_conversations').delete().eq('id', convId)
      if (error) throw error

      // Update local state
      setConversations(prev => prev.filter(c => c.id !== convId))
      if (activeConv === convId) {
        setActiveConv(null)
        setMessages([])
        setShowSuggestions(true)
      }
      showToast({ type: 'success', title: 'Conversation deleted' })
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to delete', description: err.message })
    }
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!input.trim() || loading) return
    if (!isSupabaseReady()) return setError(new Error(supabaseError || 'Supabase not configured'))

    const currentInput = input.trim()
    let currentConvId = activeConv

    // If no active conversation, create one in DB with first 30 chars as title
    if (!currentConvId) {
      try {
        const title = currentInput.slice(0, 30) || 'New Chat'
        const { data, error } = await supabase.from('ai_conversations').insert({ user_id: user.id, title }).select().single()
        if (error) throw error
        currentConvId = data.id
        setConversations(prev => [data, ...prev])
      } catch (err) {
        setError(err)
        showToast({ type: 'error', title: 'Failed to create conversation', description: err.message })
        return
      }
    }

    setActiveConv(currentConvId)
    setMessages(prev => [...prev, { role: 'user', content: currentInput, id: Date.now(), temporary: true }])
    setShowSuggestions(false)
    setInput('')
    setLoading(true)
    setError(null)

    // Ensure context is loaded before sending
    if (!context && !contextLoading) {
      await loadContext()
    }

    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { message: currentInput, conversationId: currentConvId, context: context || { subjects: [], recentSessions: [], upcomingExams: [], activePlan: null, todaySessions: [], streak: 0, totalHours: 0, dailyGoalHours: 3, weeklyProgress: [] } },
      })

      if (error) throw error

      const assistantMessage = {
        role: 'assistant',
        content: data.reply,
        source: data.source,
        actions: data.actions || [],
        model: data.model,
        usage: data.usage,
        latencyMs: data.latencyMs,
      }

      setMessages(prev => prev.filter(m => !m.temporary).concat({ ...assistantMessage, id: Date.now() }))

      await Promise.all([
        supabase.from('ai_messages').insert({ conversation_id: currentConvId, role: 'user', content: currentInput, metadata: {} }),
        supabase.from('ai_messages').insert({ conversation_id: currentConvId, role: 'assistant', content: data.reply, metadata: { source: data.source, actions: data.actions || [] } }),
        supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', currentConvId),
      ])
    } catch (err) {
      console.error("EDGE FUNCTION FAILED:", err)

      // Generate fallback response based on local context
      let fallbackReply = "I'm having trouble connecting to my AI brain right now. But based on your local data, I recommend reviewing your nearest upcoming exam and focusing on your most difficult subject today."
      
      if (context) {
        const upcomingExams = context.upcomingExams || []
        const subjects = context.subjects || []
        
        if (upcomingExams.length > 0) {
          const nearestExam = upcomingExams[0]
          fallbackReply = `I'm having trouble connecting to my AI brain right now. But I can see you have "${nearestExam.title}" coming up on ${nearestExam.date}. Focus your study sessions on that subject.`
        } else if (subjects.length > 0) {
          // Find highest priority subject
          const topSubject = subjects.reduce((a, b) => (a.priority > b.priority ? a : b), subjects[0])
          fallbackReply = `I'm having trouble connecting to my AI brain right now. Your highest priority subject is "${topSubject.name}" (priority ${topSubject.priority}). Consider dedicating a focused session to it today.`
        }
      }

      const fallbackMessage = {
        role: 'assistant',
        content: fallbackReply,
        source: 'fallback',
        id: Date.now(),
      }

      // Save fallback to database so it persists
      await Promise.all([
        supabase.from('ai_messages').insert({ conversation_id: currentConvId, role: 'user', content: currentInput, metadata: {} }),
        supabase.from('ai_messages').insert({ conversation_id: currentConvId, role: 'assistant', content: fallbackReply, metadata: { source: 'fallback' } }),
        supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', currentConvId),
      ]).catch(() => {
        // Ignore DB save errors for fallback - message is already in UI
      })

      setMessages(prev => prev.filter(m => !m.temporary).concat(fallbackMessage))
    } finally {
      setLoading(false)
    }
  }

  const executeAction = async (action) => {
    if (!isSupabaseReady()) return setError(new Error(supabaseError || 'Supabase not configured'))
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant-execute', {
        body: { action, conversationId: activeConv, confirmed: true },
      })

      if (error) throw error
      if (!data.success) throw new Error(data.error || 'Action failed')

      showToast({ type: 'success', title: 'Action Completed', description: data.message })

      // Remove the action from the message
      setMessages(prev => prev.map(m => {
        if (m.actions?.some(a => a.type === action.type && a.description === action.description)) {
          return { ...m, actions: m.actions.filter(a => a.type !== action.type || a.description !== action.description) }
        }
        return m
      }))

      // Refresh context if action modified data
      if (['create_plan', 'reschedule_sessions', 'update_goals', 'modify_sessions', 'replace_plan'].includes(action.type)) {
        loadContext()
      }
    } catch (err) {
      // Show error as a message in chat instead of full-page error
      const errorMessage = {
        role: 'assistant',
        content: `Error: ${err.message}. Please try again.`,
        source: 'error',
        isError: true,
        id: Date.now(),
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleConfirmAction = (action) => {
    executeAction(action)
  }

  const handleRejectAction = (action) => {
    setMessages(prev => prev.map(m => {
      if (m.actions?.some(a => a.type === action.type && a.description === action.description)) {
        return { ...m, actions: m.actions.filter(a => a.type !== action.type || a.description !== action.description) }
      }
      return m
    }))
  }

  const copyMessage = (content) => {
    navigator.clipboard.writeText(content)
    showToast({ type: 'success', title: 'Copied', description: 'Message copied to clipboard' })
  }

  const getSourceBadge = (source) => {
    if (source === 'ai') {
      return (
        <Badge variant="success" className="gap-1">
          <Sparkles className="w-3 h-3" /> AI
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <Shield className="w-3 h-3" /> Fallback
      </Badge>
    )
  }

  const renderActions = (actions) => {
    if (!actions || actions.length === 0) return null

    return (
      <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkle className="w-4 h-4 text-accent" />
          <span className="text-xs font-medium text-text/70">Proposed Actions</span>
        </div>
        {actions.map((action, idx) => {
          const IconComponent = ACTION_TYPE_ICONS[action.type]
          const colorClass = ACTION_TYPE_COLORS[action.type] || 'bg-gray-100 text-gray-700 border-gray-200'
          return (
            <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border bg-background">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: colorClass.split(' ')[0] || 'var(--accent)' }}> 
                <IconComponent className="w-4 h-4" style={{ color: colorClass.split(' ')[1] || 'var(--accent-foreground)' }} /> 
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text">{ACTION_TYPE_LABELS[action.type] || action.type}</span>
                  {action.requiresConfirmation && (
                    <Badge variant="secondary" className="text-[10px] gap-1">
                      <AlertCircle className="w-2.5 h-2.5" /> Confirmation required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-text/60 mt-1">{action.description}</p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleConfirmAction(action)}
                    disabled={executingAction}
                    className="px-3 gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Confirm
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRejectAction(action)}
                    disabled={executingAction}
                    className="px-3 gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Dismiss
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (!user) return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="text-center">
        <Bot className="w-16 h-16 mx-auto mb-4 opacity-30" />
        <h3 className="text-xl font-bold text-text mb-2">Please log in to use the AI Assistant</h3>
        <p className="text-text-muted">Sign in to access your personal study assistant with full context awareness.</p>
      </div>
    </div>
  )

  // Show error state if there's an error
  if (error) return <AssistantError error={error} resetError={resetError} />

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <Bot className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text">AI Study Assistant</h1>
              <p className="text-xs text-text/50">Your personal study coach with full context awareness</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {contextLoading && (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading context...
              </Badge>
            )}
            {!contextLoading && context && (
              <Badge variant="outline" className="gap-1">
                <Brain className="w-3 h-3" /> Context loaded
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Conversations */}
        <div className="w-72 lg:w-80 flex-shrink-0 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-text">Conversations</h3>
              <Button variant="ghost" size="sm" onClick={newConversation} className="gap-1">
                <Plus className="w-4 h-4" /> New
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text/30" />
              <Input
                placeholder="Search conversations..."
                className="pl-9 text-sm"
                onChange={(e) => setFilteredConversations(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="p-6 text-center text-text-muted">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No conversations yet</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={newConversation}>
                  <Plus className="w-4 h-4 mr-2" /> Start a new chat
                </Button>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {conversations.filter(c => c.title?.toLowerCase().includes(filteredConversations.toLowerCase())).map(c => (
                  <div key={c.id} className="relative group">
                    <button
                      onClick={() => { setActiveConv(c.id); loadMessages(c.id) }}
                      className={
                        'w-full text-left p-3 rounded-lg transition-all text-sm ' +
                        (activeConv === c.id
                          ? 'bg-accent/10 text-accent border border-accent/20'
                          : 'hover:bg-surface/50 text-text/70')
                      }
                    >
                      <div className="truncate font-medium pr-8">{c.title || 'Untitled'}</div>
                      <div className="text-xs text-text/50 mt-1 truncate">{formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}</div>
                    </button>
                    <button
                      onClick={(e) => deleteConversation(c.id, e)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-text/30 hover:text-error hover:bg-error/10 rounded opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete conversation"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="p-4 border-t border-border">
            <Button variant="ghost" size="sm" onClick={() => { newConversation().then(() => setTimeout(() => setInput(SUGGESTED_PROMPTS[0]), 100)) }} className="w-full justify-start gap-2">
              <Plus className="w-4 h-4" /> New Chat
            </Button>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {activeConv ? (
            <div className="flex-1 flex flex-col">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
                      <Bot className="w-8 h-8 text-accent" />
                    </div>
                    <h3 className="text-lg font-semibold text-text mb-2">How can I help you study?</h3>
                    <p className="text-text-muted mb-6 max-w-xs">Ask me about your schedule, exams, progress, or get personalized study advice.</p>
                    <div className="w-full max-w-xs space-y-2">
                      {SUGGESTED_PROMPTS.map((p) => (
                        <Button key={p} variant="outline" className="w-full justify-start gap-2 h-auto p-3 text-sm" onClick={() => setInput(p)}>
                          {p}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((m, idx) => (
                      <div key={m.id || idx} className={
                        'flex gap-3 ' +
                        (m.role === 'assistant' ? 'flex-row' : 'flex-row-reverse') +
                        ' animate-fade-in'
                      }>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                          {m.role === 'assistant' ? (
                            <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                              <Bot className="w-4 h-4 text-accent" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <Clock className="w-4 h-4 text-text/40" />
                            </div>
                          )}
                        </div>
                        <div className={
                          'max-w-[85%] ' +
                          (m.role === 'assistant' ? '' : 'text-right')
                        }>
                          <div className="flex items-center gap-2 mb-1">
                            {m.role === 'assistant' && (
                              <span className="text-xs font-medium text-text/60 flex items-center gap-1">
                                {m.source === 'ai' ? <Sparkles className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                                {m.source === 'ai' ? 'AI' : 'Fallback'}
                              </span>
                            )}
                            <span className="text-xs text-text/40">{m.temporary ? 'Sending...' : formatDistanceToNow(new Date(m.created_at || Date.now()), { addSuffix: true })}</span>
                          </div>
                          <div className={
                            'relative ' +
                            (m.role === 'assistant' ? 'text-left' : 'text-right')
                          }>
                            <div className={
                              'inline-block max-w-[85%] p-3 rounded-2xl ' +
                              (m.isError
                                ? 'bg-error/10 border border-error/20 text-error rounded-bl-none'
                                : m.role === 'assistant'
                                ? 'bg-accent/5 border border-accent/10 text-text rounded-bl-none'
                                : 'bg-muted text-text rounded-br-none')
                            }>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</p>
                              {m.role === 'assistant' && (
                                <div className="flex items-center gap-1 mt-2">
                                  <Button variant="ghost" size="sm" onClick={() => copyMessage(m.content)} className="p-1 h-6 w-6" title="Copy">
                                    <Copy className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {m.role === 'assistant' && renderActions(m.actions)}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                    {loading && (
                      <div className="flex items-center gap-2 text-text-muted">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">AI is thinking...</span>
                      </div>
                    )}
                  </>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="p-4 border-t border-border bg-background/50 backdrop-blur-sm">
                <form onSubmit={sendMessage} className="flex gap-2">
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Ask about your study plan..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      disabled={loading}
                      className="pr-10"
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage(e))}
                    />
                    <Button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 h-8 w-8"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </form>
                <p className="text-xs text-text/40 mt-2 text-center">Press Enter to send, Shift+Enter for new line</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-6">
                  <Bot className="w-10 h-10 text-accent" />
                </div>
                <h3 className="text-xl font-bold text-text mb-2">Welcome to Your AI Study Assistant</h3>
                <p className="text-text-muted mb-6">Select a conversation from the sidebar or start a new one to get personalized study help.</p>
                <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                  {SUGGESTED_PROMPTS.slice(0, 4).map((p) => (
                    <Button key={p} variant="outline" className="h-auto p-3 text-sm justify-start" onClick={() => { newConversation(); setTimeout(() => setInput(p), 100) }}>
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
