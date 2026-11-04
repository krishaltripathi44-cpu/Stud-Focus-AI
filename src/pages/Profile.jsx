import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { User, Clock, Target, Globe } from 'lucide-react'

export default function Profile() {
  const { user, profile, updatePassword } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    daily_goal_hours: profile?.daily_goal_hours || 3,
    timezone: profile?.timezone || 'UTC',
  })
  const [newPassword, setNewPassword] = useState('')

  useEffect(() => {
    if (!user) return
    if (profile) setForm({ full_name: profile.full_name || '', daily_goal_hours: profile.daily_goal_hours || 3, timezone: profile.timezone || 'UTC' })
    setLoading(false)
  }, [profile])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: form.full_name, daily_goal_hours: form.daily_goal_hours, timezone: form.timezone,
      }).eq('id', user.id)
      if (error) throw error
      showToast({ type: 'success', title: 'Profile updated' })
    } catch (err) {
      showToast({ type: 'error', title: 'Update failed', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handlePassword = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updatePassword(newPassword)
      setNewPassword('')
      showToast({ type: 'success', title: 'Password updated' })
    } catch (err) {
      showToast({ type: 'error', title: 'Password update failed', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="p-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full skeleton" /><div className="w-48 h-4 skeleton" /></div></div>
  )

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-text mb-4">Profile</h1>
      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><User className="w-4 h-4" /> Account details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text/70 mb-1">Full name</label>
                <Input placeholder="Your name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text/70 mb-1">Daily study goal (hours)</label>
                <Input type="number" min={0.5} max={12} step={0.5} value={form.daily_goal_hours} onChange={(e) => setForm({ ...form, daily_goal_hours: parseFloat(e.target.value) || 3 })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-text/70 mb-1">Timezone</label>
                <Input placeholder="e.g. UTC, America/New_York" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-xs text-text/60">Email:</p>
                <span className="text-xs font-mono text-text/50 truncate max-w-xs">{user?.email}</span>
              </div>
            </form>
          </CardContent>
          <CardFooter>
            <Button variant="primary" disabled={saving} onClick={(e) => { e.preventDefault(); handleSave(e) }}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
          </CardFooter>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="w-4 h-4" /> Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePassword} className="space-y-3">
              <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
              <Button variant="primary" disabled={!newPassword || newPassword.length < 6 || saving} className="w-full" onClick={(e) => { e.preventDefault(); handlePassword(e) }}>
                {saving ? 'Updating...' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
