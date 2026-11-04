import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'
import { Mail, Lock, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card'
import GoogleIcon from '../components/ui/GoogleIcon'
import { isSupabaseReady } from '../lib/supabase'
import { showToast } from '../lib/toast'

export default function Login() {
  const navigate = useNavigate()
  const { signIn, signInWithGoogle, loading, error, setError, user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const supabaseReady = isSupabaseReady()

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, loading, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!supabaseReady) {
      return showToast({
        type: 'error',
        title: 'Backend not configured',
        description: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.',
      })
    }
    setIsLoading(true)
    setError(null)
    try {
      await signIn({ email, password })
      showToast({ type: 'success', title: 'Welcome back!' })
      navigate('/dashboard')
    } catch (err) {
      showToast({ type: 'error', title: 'Login failed', description: err.message || 'Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogle = async () => {
    if (!supabaseReady) {
      return showToast({
        type: 'error',
        title: 'Backend not configured',
        description: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.',
      })
    }
    setIsLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      showToast({ type: 'error', title: 'Google sign-in failed', description: err.message || '' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your Study Focus AI account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-lg bg-error/10 border border-error/20 p-3 text-sm text-error">
              {error.message || 'An error occurred'}
            </div>
          )}
          {!supabaseReady && (
            <div className="rounded-lg bg-warning/10 border border-warning/20 p-3 text-sm text-warning">
              Supabase environment variables are missing or malformed. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code>, then restart the dev server.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-text-muted" />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-text-muted" />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
              <ArrowRight className="ml-2 w-4 h-4" />
            </Button>
          </form>
          <p className="text-center text-xs text-text-muted">
            Don't have an account?{' '}
            <Link to="/register" className="text-accent hover:text-accent-hover font-medium">
              Create one
            </Link>
          </p>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-surface px-2 text-text-muted">Or continue with</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleGoogle}
            disabled={isLoading}
          >
            <GoogleIcon className="w-4 h-4 mr-2" />
            Continue with Google
          </Button>
        </CardContent>
        <CardFooter className="justify-center pt-4">
          <p className="text-sm text-text-muted">
            Forgot password?{' '}
            <Link to="/forgot-password" className="text-accent hover:text-accent-hover font-medium">
              Reset it
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
