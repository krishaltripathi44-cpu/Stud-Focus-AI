import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Calendar, Timer, BarChart3, Bot, ShieldCheck, User, LogOut,
  Menu, X, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { ThemeToggle } from '../ui/ThemeToggle'
import { Button } from '../ui/Button'

const navItems = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { key: 'subjects', label: 'Subjects', icon: ShieldCheck, path: '/subjects' },
  { key: 'planner', label: 'AI Planner', icon: Bot, path: '/planner' },
  { key: 'schedule', label: 'Weekly Schedule', icon: Calendar, path: '/schedule' },
  { key: 'pomodoro', label: 'StudyTimer', icon: Timer, path: '/pomodoro' },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, path: '/analytics' },
  { key: 'assistant', label: 'AI Assistant', icon: Bot, path: '/assistant' },
  { key: 'achievements', label: 'Achievements', icon: ShieldCheck, path: '/achievements' },
  { key: 'profile', label: 'Profile', icon: User, path: '/profile' },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-40 w-64 lg:w-64 border-r border-border bg-surface transition-all duration-300 transform ${collapsed ? 'lg:-translate-x-full lg:w-0' : ''} ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between h-14 border-b border-border px-4 bg-surface/80 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-accent flex items-center justify-center text-accent-hover font-bold text-xs">S</div>
            <span className={collapsed ? 'hidden' : 'font-bold text-text tracking-tight'}><span className="text-accent">Study</span>Focus AI</span>
          </div>
          {collapsed ? null : (
            <button onClick={() => setCollapsed(true)} className="lg:hidden p-1.5 text-text-muted hover:text-text">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => { navigate(item.path); setMobileOpen(false); if (collapsed) setCollapsed(false) }}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm transition-colors"
            >
              <item.icon className="w-5 h-5" />
              <span className="text-text/80 font-medium">{item.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-text/20 ml-auto" />
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 px-3 py-2 mb-4">
            <div className="w-8 h-8 rounded-xl border border-border overflow-hidden">
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-accent/10 flex items-center justify-center text-accent font-bold text-xs">
                  {((user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'U').charAt(0)).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <div className="text-sm font-semibold text-text">{user?.user_metadata?.full_name || user?.email || 'User'}</div>
              <div className="text-xs text-text-muted truncate">{user?.email}</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => signOut()}
            className="w-full text-left justify-start"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
          <div className="mt-3 flex items-center justify-between px-3">
            <ThemeToggle />
            <button onClick={() => setCollapsed(!collapsed)} className="p-1 text-text-muted hover:text-text">
              {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:hidden fixed top-0 left-0 z-40 flex items-center gap-2 px-4 py-3 bg-surface/90 backdrop-blur border-b border-border">
        <button onClick={() => setMobileOpen(true)} className="p-1.5 text-text-muted hover:text-text">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-accent-hover font-bold text-[10px]">S</div>
          <span className="font-bold text-text text-sm">StudyFocus AI</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => signOut()} className="p-1 text-text-muted hover:text-text">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}

