import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { showToast } from '../lib/toast'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { Plus, Trash2, Edit2, Target, Palette, Clock, Brain } from 'lucide-react'

const SUBJECT_COLORS = ['#7c5cff', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#f472b6', '#06b6d4']

export default function Subjects() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', description: '', priority: 3, weekly_target_hours: 3, color: '#7c5cff', difficulty: 3 })
  const [deleteId, setDeleteId] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  useEffect(() => {
    if (!user) return
    loadSubjects()
    window.addEventListener('study-log-updated', loadSubjects)
    return () => window.removeEventListener('study-log-updated', loadSubjects)
  }, [user])

  const loadSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('*, study_logs(duration_minutes, completed, session_type)')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      showToast({ type: 'error', title: 'Failed to load subjects', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const computeDone = (subject) => {
    const logs = subject.study_logs || []
    return logs.filter(l => l.session_type === 'focus' && l.completed).reduce((a, b) => a + (b.duration_minutes || 0), 0) / 60
  }

  const openCreate = () => { setEditing(null); setForm({ name: '', description: '', priority: 3, weekly_target_hours: 3, color: '#7c5cff' }); setOpen(true) }
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, description: s.description || '', priority: s.priority, weekly_target_hours: Number(s.weekly_target_hours), color: s.color, difficulty: s.difficulty || 3 }); setOpen(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaveLoading(true)
    try {
      if (editing) {
        const { error } = await supabase.from('subjects').update({
          name: form.name, description: form.description, priority: form.priority, difficulty: form.difficulty,
          weekly_target_hours: form.weekly_target_hours, color: form.color,
        }).eq('id', editing.id).eq('user_id', user.id)
        if (error) throw error
        showToast({ type: 'success', title: 'Subject updated' })
      } else {
        const { error } = await supabase.from('subjects').insert({
          user_id: user.id, name: form.name, description: form.description,
          priority: form.priority, weekly_target_hours: form.weekly_target_hours, color: form.color,
        })
        if (error) throw error
        showToast({ type: 'success', title: 'Subject created' })
      }
      setOpen(false)
      loadSubjects()
    } catch (err) {
      showToast({ type: 'error', title: 'Save failed', description: err.message })
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      const { error } = await supabase.from('subjects').update({ archived: true }).eq('id', deleteId).eq('user_id', user.id)
      if (error) throw error
      showToast({ type: 'success', title: 'Subject archived' })
      setDeleteId(null)
      loadSubjects()
    } catch (err) {
      showToast({ type: 'error', title: 'Delete failed', description: err.message })
    } finally {
      setDeleteLoading(false)
    }
  }
  if (loading) return (
    <div className="p-4"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-full skeleton" /><div className="w-48 h-4 skeleton" /></div></div>
  )

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text">Subjects</h1>
          <p className="text-text-muted">Manage your subjects, priorities, and weekly study targets.</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" /> Add subject
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s) => {
          const done = computeDone(s)
          const target = Number(s.weekly_target_hours || 3)
          const pct = target ? Math.min(100, Math.round((done / target) * 100)) : 0
          return (
            <Card key={s.id} className="group relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="font-semibold text-text truncate">{s.name}</span>
                <span className="ml-auto text-xs font-bold text-text/40 p-1 rounded bg-accent/10 text-accent">P{s.priority}</span>
              </div>
              {s.description && <p className="text-xs text-text-muted mb-4 line-clamp-2">{s.description}</p>}
              <div className="space-y-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-text-muted">Weekly progress</span>
                  <span className="font-medium text-text">{Math.round(done * 10) / 10}h / {target}h</span>
                </div>
                <div className="h-1.5 bg-surface rounded-full overflow-hidden border border-border/50">
                  <div className={`h-full ${s.color} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-text-muted mt-1">
                  <span>{pct}% of weekly target</span>
                </div>
              </div>
              <CardFooter className="border-t border-border/50">
                <Button variant="outline" size="sm" onClick={() => openEdit(s)} className="flex-1">
                  <Edit2 className="w-3 h-3 mr-1.5" /> Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setDeleteId(s.id); setOpen(true) }} className="ml-2">
                  <Trash2 className="w-3 h-3 mr-1.5" /> Archive
                </Button>
              </CardFooter>
            </Card>
          )
        })}
        {subjects.length === 0 && (
          <Card className="col-span-3 text-center py-12">
            <div className="w-12 h-12 rounded-xl bg-surface/50 flex items-center justify-center text-text/30 mx-auto mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            </div>
            <h3 className="font-semibold text-text mb-2">No subjects yet</h3>
            <p className="text-sm text-text-muted mb-4">Add your first subject to get started.</p>
            <Button variant="primary" onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" /> Add subject
            </Button>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Archive subject?"
        description="This subject will be hidden from your list. Its study history is preserved."
        confirmLabel="Archive"
      />

      <div className={`fixed inset-0 z-50 flex items-center justify-center ${open ? '' : 'hidden'}`}>
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
        <div className="relative w-full max-w-md mx-auto p-4 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle>{editing ? 'Edit subject' : 'Add subject'}</CardTitle>
              <CardDescription>Set priority (1 = highest) and your weekly target hours.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-text/70 mb-1">Subject name</label>
                  <Input placeholder="e.g. Mathematics" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text/70 mb-1">Description</label>
                  <Input placeholder="e.g. Calculus and linear algebra" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text/70 mb-1">Priority (1-5)</label>
                    <Input type="number" min={1} max={5} value={form.priority || ''} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 3 })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text/70 mb-1">Weekly target (hours)</label>
                    <Input type="number" min={0} step={0.5} value={form.weekly_target_hours || ''} onChange={(e) => setForm({ ...form, weekly_target_hours: parseFloat(e.target.value) || 3 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-text/70 mb-1">Difficulty (1-5)</label>
                    <Input type="number" min={1} max={5} value={form.difficulty || ''} onChange={(e) => setForm({ ...form, difficulty: parseInt(e.target.value) || 3 })} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text/70 mb-1">&nbsp;</label>
                    <div className="text-xs text-text/50 pt-2">1=Easy, 5=Hard</div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text/70 mb-1">Color</label>
                  <div className="flex gap-2">
                    {SUBJECT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setForm({ ...form, color: c })}
                        className={`w-8 h-8 rounded-full border-2 ${form.color === c ? 'ring-2 ring-accent' : 'border-transparent'} hover:scale-110 transition`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" disabled={saveLoading} className="ml-auto" onClick={(e) => { e.preventDefault(); handleSave(e) }}>
                {saveLoading ? 'Saving...' : editing ? 'Save changes' : 'Create subject'}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

