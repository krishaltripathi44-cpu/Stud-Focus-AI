import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { useAuth, AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'

// Layout & pages
import Layout from './components/layout/Layout'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import Dashboard from './pages/Dashboard'
import Subjects from './pages/Subjects'
import StudyPlanner from './pages/StudyPlanner'
import WeeklySchedule from './pages/WeeklySchedule'
import Pomodoro from './pages/Pomodoro'
import Analytics from './pages/Analytics'
import AIAssistant from './pages/AIAssistant'
import Achievements from './pages/Achievements'
import Profile from './pages/Profile'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  return children
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          {/* Toaster is mounted at root so login/register/forgot-password
              (which render outside <Layout>) can still show notifications. */}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ duration: 4000 }}
          />
          <Routes>
            {/* Public */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Protected app */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="subjects" element={<Subjects />} />
              <Route path="planner" element={<StudyPlanner />} />
              <Route path="schedule" element={<WeeklySchedule />} />
              <Route path="pomodoro" element={<Pomodoro />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="assistant" element={<AIAssistant />} />
              <Route path="achievements" element={<Achievements />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App

