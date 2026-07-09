/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getApi, hasSupabaseConfig, isDemoMode } from '../data/api'
import type { Profile, SignUpInput } from '../types'

interface AuthState {
  loading: boolean
  signedIn: boolean
  email: string | null
  /** Null while loading, when signed out, or when no profile row exists yet. */
  profile: Profile | null
  profileLoading: boolean
  signIn(email: string, password: string): Promise<void>
  signUp(input: SignUpInput): Promise<void>
  signOut(): Promise<void>
  refreshProfile(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const DEMO_SESSION_KEY = 'boothmgr-demo-session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)

  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    async function init() {
      if (isDemoMode) {
        let session = sessionStorage.getItem(DEMO_SESSION_KEY)
        if (!session) {
          session = 'demo@example.com'
          sessionStorage.setItem(DEMO_SESSION_KEY, session)
        }
        setEmail(session)
        setLoading(false)
        return
      }
      if (!hasSupabaseConfig()) {
        setLoading(false)
        return
      }
      const { getSupabase } = await import('../data/supabaseClient')
      const db = getSupabase()
      const { data } = await db.auth.getSession()
      setEmail(data.session?.user.email ?? null)
      setLoading(false)
      const { data: sub } = db.auth.onAuthStateChange((_event, session) => {
        setEmail(session?.user.email ?? null)
      })
      unsubscribe = () => sub.subscription.unsubscribe()
    }
    void init()
    return () => unsubscribe?.()
  }, [])

  // (Re)load the profile whenever the signed-in user changes.
  useEffect(() => {
    let cancelled = false
    if (email === null) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    void (async () => {
      try {
        const p = await (await getApi()).getMyProfile()
        if (!cancelled) setProfile(p)
      } finally {
        if (!cancelled) setProfileLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [email])

  async function refreshProfile(): Promise<void> {
    if (email === null) return
    setProfile(await (await getApi()).getMyProfile())
  }

  async function signIn(emailInput: string, password: string): Promise<void> {
    if (isDemoMode) {
      sessionStorage.setItem(DEMO_SESSION_KEY, emailInput || 'demo@example.com')
      setEmail(emailInput || 'demo@example.com')
      return
    }
    const { getSupabase } = await import('../data/supabaseClient')
    const { error } = await getSupabase().auth.signInWithPassword({ email: emailInput, password })
    if (error) throw new Error(error.message)
  }

  async function signUp(input: SignUpInput): Promise<void> {
    if (isDemoMode) {
      const { demoSignUp } = await import('../data/demoApi')
      demoSignUp(input)
      sessionStorage.setItem(DEMO_SESSION_KEY, input.email)
      setEmail(input.email)
      return
    }
    const { getSupabase } = await import('../data/supabaseClient')
    // The DB trigger builds the profile row from this metadata (migration 0004).
    const { error } = await getSupabase().auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          full_name: input.full_name,
          phone: input.phone,
          assembly_id: input.assembly_id,
        },
      },
    })
    if (error) throw new Error(error.message)
  }

  async function signOut(): Promise<void> {
    if (isDemoMode) {
      sessionStorage.removeItem(DEMO_SESSION_KEY)
      setEmail(null)
      return
    }
    const { getSupabase } = await import('../data/supabaseClient')
    await getSupabase().auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        signedIn: email !== null,
        email,
        profile,
        profileLoading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
