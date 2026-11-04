import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  // `loading` is true until we've made our first call to getSession(). Anything
  // that depends on `user` should wait for loading to flip to false.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch (and create-if-missing) the profile row for a given auth user.
  // Safe to call multiple times; race-tolerant with the DB trigger.
  const fetchProfile = useCallback(async (uid, fallbackName = '') => {
    if (!supabase || !uid) return
    try {
      const { data, error: selErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle()
      if (selErr) {
        console.warn('[auth] profile select error:', selErr.message)
      }
      if (data) {
        setProfile(data)
        return
      }
      // No profile row yet (should normally be created by the DB trigger,
      // but we race-handle it here). Use upsert onConflict: 'id' with
      // ignoreDuplicates so two parallel calls won't blow up.
      const { data: ins, error: insErr } = await supabase
        .from('profiles')
        .upsert(
          { id: uid, full_name: fallbackName || null },
          { onConflict: 'id', ignoreDuplicates: true }
        )
        .select()
        .maybeSingle()
      if (insErr) {
        // Last-resort: keep an in-memory profile so the UI doesn't break.
        setProfile({
          id: uid,
          full_name: fallbackName || '',
          daily_goal_hours: 3,
          timezone: 'UTC',
          theme: 'system',
          email_notifications: true,
        })
        return
      }
      setProfile(ins || {
        id: uid,
        full_name: fallbackName || '',
        daily_goal_hours: 3,
        timezone: 'UTC',
        theme: 'system',
        email_notifications: true,
      })
    } catch (e) {
      console.warn('[auth] fetchProfile exception:', e?.message)
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    await fetchProfile(user.id, user.user_metadata?.full_name || '')
  }, [user, fetchProfile])

  const signUp = useCallback(async ({ email, password, fullName }) => {
    setError(null)
    if (!supabase) throw new Error('Supabase client not configured. Check your VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.')
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    if (err) throw err
    return data
  }, [])

  const signIn = useCallback(async ({ email, password }) => {
    setError(null)
    if (!supabase) throw new Error('Supabase client not configured. Check your VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) throw err
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError(null)
    if (!supabase) throw new Error('Supabase client not configured.')
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    })
    if (err) throw err
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    if (supabase) await supabase.auth.signOut()
    // Always clear local state, even if supabase call threw, so the UI
    // doesn't get stuck on a logged-out-but-still-rendered account.
    setUser(null)
    setProfile(null)
  }, [])

  const resetPassword = useCallback(async (email) => {
    setError(null)
    if (!supabase) throw new Error('Supabase client not configured.')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (err) throw err
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    setError(null)
    if (!supabase) throw new Error('Supabase client not configured.')
    const { error: err } = await supabase.auth.updateUser({ password: newPassword })
    if (err) throw err
  }, [])

  // -- Initial session + auth-state subscription ----
  useEffect(() => {
    let mounted = true
    setLoading(true)

    if (!supabase) {
      // No client → act as logged-out. Lighter-weight than throwing.
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.user_metadata?.full_name || '')
      }
      setLoading(false)
    }).catch((e) => {
      if (!mounted) return
      setError(e)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session?.user) {
        await fetchProfile(session.user.id, session.user.user_metadata?.full_name || '')
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [fetchProfile])

  return (
    <AuthContext.Provider value={{
      user, profile, loading, error,
      signUp, signIn, signInWithGoogle, signOut, resetPassword, updatePassword,
      refreshProfile,
      setError,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

