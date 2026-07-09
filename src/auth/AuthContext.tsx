/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { hasSupabaseConfig, isDemoMode } from '../data/api'

interface AuthState {
  loading: boolean
  signedIn: boolean
  email: string | null
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const DEMO_SESSION_KEY = 'boothmgr-demo-session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)

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
    <AuthContext.Provider value={{ loading, signedIn: email !== null, email, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
