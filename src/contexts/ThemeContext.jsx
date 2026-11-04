import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('system')

  useEffect(() => {
    const stored = localStorage.getItem('sf-theme') || 'system'
    setTheme(stored)
    applyTheme(stored)
  }, [])

  const applyTheme = (t) => {
    const root = document.documentElement
    if (t === 'system') {
      const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.toggle('dark', system === 'dark')
    } else {
      root.classList.toggle('dark', t === 'dark')
    }
  }

  const toggleTheme = (next) => {
    setTheme(next)
    localStorage.setItem('sf-theme', next)
    applyTheme(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
