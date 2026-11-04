import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Mail, ArrowLeft, Lock } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../components/ui/Card'
import { showToast } from '../lib/toast'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const { resetPassword, loading, user } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [user, loading, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await resetPassword(email)
      setSent(true)
    } catch (err) {
      showToast({ type: 'error', title: 'Reset failed', description: err.message || 'Please try again.' })
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-4">
        <Card className="w-full max-w-md shadow-xl text-center">
          <CardHeader>
            <Lock className="w-10 h-10 mx-auto text-success mb-3" />
            <CardTitle>Check your email</CardTitle>
            <CardDescription>A password reset link has been sent to {email}. Follow the instructions to set a new password.</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" asChild onClick={() => navigate('/login')}>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle>Reset password</CardTitle>
          <CardDescription>Enter your email and we'll send you a reset link.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-text-muted" />
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-text-muted">
            Already have a reset link?{' '}
            <Link to="/login" className="text-accent hover:text-accent-hover font-medium">Sign in</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
