import { createClient } from '@supabase/supabase-js'

const supabaseUrl         = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey     = import.meta.env.VITE_SUPABASE_ANON_KEY

// --- Strict env validation ---------------------------------------------
// We need:
//   - VITE_SUPABASE_URL that is a real http(s) URL  (e.g. https://xxx.supabase.co)
//   - VITE_SUPABASE_ANON_KEY that is a non-empty JWT-like string
const looksLikeUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim())
const looksLikeKey = (v) => typeof v === 'string' && v.trim().length >= 20

const envOk = looksLikeUrl(supabaseUrl) && looksLikeKey(supabaseAnonKey)

if (!envOk) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] env vars missing or malformed.\n' +
      '  Expected VITE_SUPABASE_URL=https://<project-ref>.supabase.co\n' +
      '  Expected VITE_SUPABASE_ANON_KEY=<anon JWT>\n' +
      '  Copy .env.example to .env and fill in values from Supabase Project Settings → API.'
  )
}

// --- Client creation ----------------------------------------------------
// We *only* call createClient when the URL parses cleanly — otherwise the SDK
// throws synchronously and bricks the whole module graph.
export const supabase = envOk
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'sf-supabase-auth',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      },
    })
  : null

// Public helpers ---------------------------------------------------------
export const isConfigured = envOk
export const isSupabaseReady = () => envOk && supabase !== null
export const supabaseError = !envOk
  ? 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'
  : null

