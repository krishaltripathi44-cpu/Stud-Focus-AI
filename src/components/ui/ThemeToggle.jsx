import { useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { Button } from './Button'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const [showMenu, setShowMenu] = useState(false)
  const icons = { light: <Sun className="w-5 h-5" />, dark: <Moon className="w-5 h-5" />, system: <Monitor className="w-5 h-5" /> }

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        size="sm"
        onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
        aria-label="Theme"
        title={theme}
      >
        {icons[theme]}
      </Button>
      {showMenu && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-surface shadow-xl p-2 animate-fade-in z-50">
          {['light', 'dark', 'system'].map((t) => (
            <Button
              key={t}
              variant="ghost"
              size="sm"
              className={`w-full justify-start text-left ${theme === t ? 'bg-accent/10 text-accent' : ''}`}
              onClick={() => { toggleTheme(t); setShowMenu(false) }}
            >
              {icons[t]} {t.charAt(0).toUpperCase() + t.slice(1)}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
