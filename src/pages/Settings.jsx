import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Sun, Moon, Monitor, ShieldCheck, Download, LogOut } from 'lucide-react'

export default function Settings() {
  const { signOut, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('sf-notifications')
    if (stored !== null) setNotifications(stored === 'true')
  }, [])

  const exportData = async () => {
    setExporting(true)
    try {
      // Scope to current user (RLS would do this anyway, but be explicit).
      const [{ data: subjects }, { data: logs }, { data: plans }] = await Promise.all([
        supabase.from('subjects').select('*').eq('user_id', user.id),
        supabase.from('study_logs').select('*').eq('user_id', user.id),
        supabase.from('study_plans').select('*, planned_sessions(*)').eq('user_id', user.id),
      ])
      const data = { subjects, logs, plans, exportedAt: new Date().toISOString() }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'study-focus-ai-export.json'
      a.click()
      URL.revokeObjectURL(url)
      showToast({ type: 'success', title: 'Data exported' })
    } catch (err) {
      showToast({ type: 'error', title: 'Export failed', description: err.message })
    } finally {
      setExporting(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      showToast({ type: 'success', title: 'Signed out' })
      navigate('/login', { replace: true })
    } catch (err) {
      showToast({ type: 'error', title: 'Sign-out failed', description: err.message })
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-text mb-4">Settings</h1>
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
              <div>
                <p className="font-medium text-text">Theme</p>
                <p className="text-xs text-text/60">Choose your preferred color scheme.</p>
              </div>
              <div className="flex gap-2">
                {['light', 'dark', 'system'].map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTheme(t)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${theme === t ? 'ring-2 ring-accent' : 'hover:scale-105'}`}
                    title={t}
                  >
                    {t === 'light' ? <Sun className="w-4 h-4 text-yellow-500" /> : t === 'dark' ? <Moon className="w-4 h-4 text-indigo-400" /> : <Monitor className="w-4 h-4 text-text/40" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
              <div className="flex flex-col">
                <p className="font-medium text-text">Email notifications</p>
                <p className="text-xs text-text/60">Receive streak reminders and study tips.</p>
              </div>
              <button
                onClick={() => { setNotifications(!notifications); localStorage.setItem('sf-notifications', String(!notifications)) }}
                className={`relative w-11 h-6 rounded-full border-2 p-0.5 transition-colors focus:outline-none ${notifications ? 'border-accent' : 'border-border'}`}
              >
                <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${notifications ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">Data & Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-surface">
              <div className="flex items-center gap-3">
                <Download className="w-4 h-4" />
                <div>
                  <p className="font-medium text-text">Export your data</p>
                  <p className="text-xs text-text/60">Download all your subjects, sessions, and plans as JSON.</p>
                </div>
              </div>
              <Button variant="outline" size="sm" disabled={exporting} onClick={exportData}>
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-error/30 bg-error/5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-4 h-4 text-error" />
                <div>
                  <p className="font-medium text-text">Sign out</p>
                  <p className="text-xs text-text/60">End your current session on this device.</p>
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                disabled={signingOut}
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4 mr-1.5" /> {signingOut ? 'Signing out...' : 'Sign out'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-text/60">
              Study Focus AI — an intelligent study planning and productivity platform.<br />
              Built with React, Vite, Tailwind CSS, and Supabase. AI integration via server-side Edge Functions.<br />
              Your data lives in your own Supabase project with Row Level Security.
            </p>
            <div className="flex gap-2 text-xs text-text/50 border-t border-border/50 pt-4">
              <span>v1.0.0</span>
              <span>·</span>
              <span>Frontend: React + Vite + Tailwind</span>
              <span>·</span>
              <span>Backend: Supabase + Edge Functions</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
