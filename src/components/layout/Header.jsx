import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Bell, HelpCircle } from 'lucide-react'

const NAV = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'subjects',   label: 'Subjects',  path: '/subjects' },
  { key: 'planner',    label: 'AI Planner', path: '/planner' },
  { key: 'schedule',   label: 'Schedule',  path: '/schedule' },
  { key: 'pomodoro',   label: 'StudyTimer',  path: '/pomodoro' },
  { key: 'analytics',  label: 'Analytics', path: '/analytics' },
  { key: 'assistant',  label: 'AI Assistant', path: '/assistant' },
  { key: 'achievements', label: 'Achievements', path: '/achievements' },
  { key: 'profile',    label: 'Profile',   path: '/profile' },
  { key: 'settings',   label: 'Settings',  path: '/settings' },
]

export default function Header({ showBreadcrumbs = true }) {
  const location = useLocation()
  const navigate = useNavigate()
  useAuth()
  const activeKey = NAV.find((n) => location.pathname === n.path)?.key

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 lg:px-6 h-14">
        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((item) => {
            const active = activeKey === item.key
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-accent text-white shadow-lg shadow-accent/25'
                    : 'text-text/70 hover:text-text hover:bg-accent/5'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          <button className="p-2 text-text-muted hover:text-text" title="Notifications">
            <Bell className="w-5 h-5" />
          </button>
          <button className="p-2 text-text-muted hover:text-text" title="Help">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  )
}

